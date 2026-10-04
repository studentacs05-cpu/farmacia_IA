-- FARMACIA HEIMAR V2.4. Aplicar sobre V2.3; no borra datos.
begin;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  phone text not null check (length(trim(phone)) between 1 and 40),
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (pharmacy_id,id)
);
create index if not exists customers_pharmacy_name_idx on public.customers(pharmacy_id,lower(name));
create table if not exists public.product_categories (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  created_at timestamptz not null default now()
);
create unique index if not exists categories_pharmacy_name_unique on public.product_categories(pharmacy_id,lower(trim(name)));
insert into public.product_categories(pharmacy_id,name)
select pharmacy_id,min(trim(category)) from public.products where nullif(trim(category),'') is not null
 group by pharmacy_id,lower(trim(category)) on conflict do nothing;

alter table public.sale_transactions add column if not exists customer_id uuid;
alter table public.sale_transactions add column if not exists customer_name_snapshot text;
alter table public.sale_transactions add column if not exists customer_phone_snapshot text;
alter table public.sale_transactions add column if not exists invoice_number text;
alter table public.sale_transactions add column if not exists request_id uuid;
create unique index if not exists sales_request_unique on public.sale_transactions(pharmacy_id,request_id) where request_id is not null;
update public.sale_transactions set invoice_number='H-'||upper(id::text) where invoice_number is null;
alter table public.sale_transactions alter column invoice_number set default ('H-'||upper(gen_random_uuid()::text));
create unique index if not exists sales_invoice_number_unique on public.sale_transactions(invoice_number);
alter table public.sales add column if not exists product_name_snapshot text;
alter table public.sales add column if not exists category_snapshot text;
-- Captura el nombre disponible de ventas antiguas. Las ventas nuevas guardan su propia copia.
update public.sales s set product_name_snapshot=p.name,category_snapshot=p.category
from public.products p where p.id=s.product_id and s.product_name_snapshot is null;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='sale_customer_same_pharmacy') then
 alter table public.sale_transactions add constraint sale_customer_same_pharmacy
 foreign key (pharmacy_id,customer_id) references public.customers(pharmacy_id,id);
 end if;
end $$;

-- NULL = condición de pago desconocida en ingresos históricos; no se inventan deudas/pagos.
alter table public.invoices add column if not exists payment_type text check (payment_type in ('cash','credit'));
alter table public.invoices add column if not exists credit_days integer check (credit_days in (7,15,30,60,90));
alter table public.invoices add column if not exists due_date date;
alter table public.invoices add column if not exists payment_status text check (payment_status in ('pending','paid'));
alter table public.invoices add column if not exists paid_at date;
alter table public.invoices add column if not exists paid_by uuid references auth.users(id);
alter table public.invoices add column if not exists payment_method text;
alter table public.invoices add column if not exists payment_note text;
alter table public.invoices add column if not exists request_id uuid;
create unique index if not exists invoices_request_unique on public.invoices(pharmacy_id,request_id) where request_id is not null;
create index if not exists invoices_payable_idx on public.invoices(pharmacy_id,payment_status,due_date);

create table if not exists public.stock_adjustments (
 id uuid primary key default gen_random_uuid(),
 pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
 product_id uuid not null references public.products(id) on delete restrict,
 previous_stock numeric(14,2) not null,
 new_stock numeric(14,2) not null check (new_stock>=0),
 delta numeric(14,2) not null,
 movement_type text not null check (movement_type in ('entrada','salida')),
 notes text not null default 'actualización de inventario',
 batch_changes jsonb not null default '[]'::jsonb,
 created_by uuid references auth.users(id) default auth.uid(),
 created_at timestamptz not null default now()
);

alter table public.customers enable row level security;
alter table public.product_categories enable row level security;
alter table public.stock_adjustments enable row level security;
drop policy if exists customers_member on public.customers;
create policy customers_member on public.customers for all to authenticated
 using(public.is_pharmacy_member(pharmacy_id)) with check(public.is_pharmacy_member(pharmacy_id));
drop policy if exists categories_member on public.product_categories;
create policy categories_member on public.product_categories for all to authenticated
 using(public.is_pharmacy_member(pharmacy_id)) with check(public.is_pharmacy_member(pharmacy_id));
drop policy if exists adjustments_read on public.stock_adjustments;
create policy adjustments_read on public.stock_adjustments for select to authenticated using(public.is_pharmacy_member(pharmacy_id));
revoke all on public.customers,public.product_categories,public.stock_adjustments from public,anon,authenticated;
grant select,insert,update on public.customers to authenticated;
grant select,insert on public.product_categories to authenticated;
grant select on public.stock_adjustments to authenticated;

-- Reutiliza el POS V2.3: FEFO y anulación continúan usando las mismas asignaciones.
create or replace function public.record_pos_sale_v2_4(
 p_pharmacy_id uuid,p_items jsonb,p_payment_method text default 'Efectivo',
 p_sale_discount numeric default 0,p_notes text default null,p_sold_at date default current_date,
 p_customer_id uuid default null,p_request_id uuid default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_customer public.customers%rowtype; v_item jsonb;
begin
 if not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Sin acceso'; end if;
 if p_request_id is not null then
  perform pg_advisory_xact_lock(hashtext(p_pharmacy_id::text),hashtext(p_request_id::text));
  select id into v_id from public.sale_transactions where pharmacy_id=p_pharmacy_id and request_id=p_request_id;
  if found then return v_id; end if;
 end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'Venta inválida'; end if;
 -- Orden estable de bloqueo para ventas/ajustes/ingresos concurrentes.
 perform 1 from public.products where pharmacy_id=p_pharmacy_id and id in
 (select (value->>'product_id')::uuid from jsonb_array_elements(p_items)) order by id for update;
 for v_item in select value from jsonb_array_elements(p_items) loop
  if not exists(select 1 from public.products where id=(v_item->>'product_id')::uuid and pharmacy_id=p_pharmacy_id and active) then
   raise exception 'Producto inexistente o eliminado';
  end if;
  if (v_item->>'quantity')::numeric <> round((v_item->>'quantity')::numeric,2) then raise exception 'Cantidad: máximo dos decimales'; end if;
 end loop;
 if p_customer_id is not null then
  select * into v_customer from public.customers where id=p_customer_id and pharmacy_id=p_pharmacy_id and active for share;
  if not found then raise exception 'Cliente no disponible'; end if;
 end if;
 v_id:=public.record_pos_sale(p_pharmacy_id,p_items,p_payment_method,p_sale_discount,p_notes,p_sold_at);
 update public.sale_transactions set customer_id=p_customer_id,
 customer_name_snapshot=v_customer.name,customer_phone_snapshot=v_customer.phone,request_id=p_request_id where id=v_id;
 update public.sales s set product_name_snapshot=p.name,category_snapshot=p.category
 from public.products p where s.transaction_id=v_id and p.id=s.product_id;
 return v_id;
end $$;

create or replace function public.create_invoice_with_stock_v2_4(
 p_pharmacy_id uuid,p_supplier text,p_invoice_number text,p_invoice_date date,p_total numeric,p_lines jsonb,
 p_payment_type text default 'cash',p_credit_days integer default null,p_payment_method text default 'Efectivo',p_request_id uuid default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_total numeric:=0; v_line jsonb; v_qty numeric; v_cost numeric;
begin
 if not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Sin acceso'; end if;
 if p_request_id is not null then
  perform pg_advisory_xact_lock(hashtext(p_pharmacy_id::text),hashtext(p_request_id::text));
  select id into v_id from public.invoices where pharmacy_id=p_pharmacy_id and request_id=p_request_id;
  if found then return v_id; end if;
 end if;
 if p_payment_type is null or p_payment_type not in ('cash','credit') then raise exception 'Selecciona contado o crédito'; end if;
 if p_invoice_date is null then raise exception 'Selecciona la fecha'; end if;
 if p_payment_type='credit' and (p_credit_days is null or p_credit_days not in (7,15,30,60,90)) then raise exception 'Plazo de crédito inválido'; end if;
 if p_payment_type='cash' and nullif(trim(p_payment_method),'') is null then raise exception 'Selecciona método de pago'; end if;
 if p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines)=0 then raise exception 'Añade productos'; end if;
 perform 1 from public.products where pharmacy_id=p_pharmacy_id and id in
 (select (value->>'product_id')::uuid from jsonb_array_elements(p_lines)) order by id for update;
 for v_line in select value from jsonb_array_elements(p_lines) loop
  v_qty:=(v_line->>'quantity')::numeric; v_cost:=(v_line->>'cost_unit')::numeric;
  if v_qty is null or v_qty<=0 or v_qty<>round(v_qty,2) or v_cost is null or v_cost<0 then raise exception 'Cantidad o costo inválido'; end if;
  if not exists(select 1 from public.products where id=(v_line->>'product_id')::uuid and pharmacy_id=p_pharmacy_id and active) then raise exception 'Producto inexistente o eliminado'; end if;
  v_total:=v_total+v_qty*v_cost;
 end loop;
 v_total:=round(v_total,2);
 if p_total is not null and (p_total<0 or abs(round(p_total,2)-v_total)>1) then raise exception 'El total difiere en más de C$1 de los productos'; end if;
 -- Otro sin total: guardar el valor calculado permite registrar su obligación correctamente.
 if lower(trim(p_supplier))<>'otro' and (p_total is null or p_total<=0) then raise exception 'El total es obligatorio'; end if;
 v_id:=public.create_invoice_with_stock(p_pharmacy_id,p_supplier,p_invoice_number,p_invoice_date,coalesce(p_total,v_total),null,null,p_lines);
 update public.invoices set payment_type=p_payment_type,
 credit_days=case when p_payment_type='credit' then p_credit_days end,
 due_date=case when p_payment_type='credit' then p_invoice_date+p_credit_days end,
 payment_status=case when p_payment_type='credit' then 'pending' else 'paid' end,
 paid_at=case when p_payment_type='cash' then p_invoice_date end,
 paid_by=case when p_payment_type='cash' then auth.uid() end,
 payment_method=case when p_payment_type='cash' then trim(p_payment_method) end,
 request_id=p_request_id where id=v_id;
 return v_id;
end $$;

create or replace function public.pay_supplier_invoice(p_invoice_id uuid,p_paid_at date,p_payment_method text,p_note text default null)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_invoice public.invoices%rowtype;
begin
 select * into v_invoice from public.invoices where id=p_invoice_id for update;
 if not found then raise exception 'Factura no encontrada'; end if;
 if not public.is_pharmacy_member(v_invoice.pharmacy_id) then raise exception 'Sin acceso'; end if;
 if v_invoice.payment_status='paid' then return true; end if;
 if v_invoice.payment_status is distinct from 'pending' then raise exception 'Condición de pago histórica desconocida'; end if;
 if p_paid_at is null or p_paid_at<v_invoice.invoice_date or p_paid_at>current_date then raise exception 'Revisa la fecha de pago'; end if;
 if nullif(trim(p_payment_method),'') is null then raise exception 'Selecciona método de pago'; end if;
 update public.invoices set payment_status='paid',paid_at=p_paid_at,paid_by=auth.uid(),payment_method=trim(p_payment_method),payment_note=nullif(trim(p_note),'') where id=p_invoice_id;
 -- No crear gasto: el costo de mercancía ya se contabiliza al venderla.
 return true;
end $$;

create or replace function public.adjust_product_stock(p_product_id uuid,p_new_stock numeric,p_expected_stock numeric,p_notes text default 'actualización de inventario',p_expiry_date date default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_p public.products%rowtype; v_delta numeric; v_need numeric; v_take numeric; v_b record; v_id uuid; v_batch uuid; v_changes jsonb:='[]'::jsonb;
begin
 select * into v_p from public.products where id=p_product_id for update;
 if not found then raise exception 'Producto no encontrado'; end if;
 if not public.is_pharmacy_member(v_p.pharmacy_id) then raise exception 'Sin acceso'; end if;
 if not v_p.active then raise exception 'Producto eliminado'; end if;
 if p_expected_stock is null or v_p.current_stock<>p_expected_stock then raise exception 'El stock cambió en otro dispositivo. Actualiza y vuelve a contar'; end if;
 if p_new_stock is null or p_new_stock<0 or p_new_stock<>round(p_new_stock,2) then raise exception 'Stock inválido'; end if;
 v_delta:=p_new_stock-v_p.current_stock;
 if v_delta=0 then raise exception 'El stock no cambió'; end if;
 if v_delta>0 then
  insert into public.stock_batches(pharmacy_id,product_id,quantity_received,quantity_remaining,cost_unit,supplier,expiry_date,notes)
  values(v_p.pharmacy_id,v_p.id,v_delta,v_delta,v_p.avg_cost,'Ajuste de inventario',p_expiry_date,coalesce(nullif(trim(p_notes),''),'actualización de inventario')) returning id into v_batch;
  v_changes:=jsonb_build_array(jsonb_build_object('batch_id',v_batch,'delta',v_delta));
 else
  v_need:=-v_delta;
  for v_b in select id,quantity_remaining from public.stock_batches where product_id=v_p.id and quantity_remaining>0 order by expiry_date asc nulls last,created_at,id for update loop
   exit when v_need<=0;
   v_take:=least(v_need,v_b.quantity_remaining);
   update public.stock_batches set quantity_remaining=quantity_remaining-v_take where id=v_b.id;
   v_changes:=v_changes||jsonb_build_array(jsonb_build_object('batch_id',v_b.id,'delta',-v_take));
   v_need:=v_need-v_take;
  end loop;
  -- Stock histórico sin lote también se puede ajustar; no fabricar caducidad.
 end if;
 update public.products set current_stock=p_new_stock,updated_at=now() where id=v_p.id;
 insert into public.stock_adjustments(pharmacy_id,product_id,previous_stock,new_stock,delta,movement_type,notes,batch_changes)
 values(v_p.pharmacy_id,v_p.id,v_p.current_stock,p_new_stock,v_delta,case when v_delta>0 then 'entrada' else 'salida' end,coalesce(nullif(trim(p_notes),''),'actualización de inventario'),v_changes) returning id into v_id;
 return v_id;
end $$;

-- Totales de clientes sobre toda su historia, excluyendo facturas anuladas.
create or replace function public.customer_summary(p_pharmacy_id uuid)
returns table(id uuid,purchase_count bigint,total_spent numeric,last_purchase timestamptz)
language plpgsql security definer set search_path=public as $$
begin
 if not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Sin acceso'; end if;
 return query select c.id,count(t.id),coalesce(sum(t.total),0),max(t.created_at)
 from public.customers c left join public.sale_transactions t on t.customer_id=c.id and t.pharmacy_id=c.pharmacy_id and t.status='completed'
 where c.pharmacy_id=p_pharmacy_id and c.active group by c.id;
end $$;

revoke all on function public.record_pos_sale_v2_4(uuid,jsonb,text,numeric,text,date,uuid,uuid) from public,anon;
revoke all on function public.create_invoice_with_stock_v2_4(uuid,text,text,date,numeric,jsonb,text,integer,text,uuid) from public,anon;
revoke all on function public.pay_supplier_invoice(uuid,date,text,text) from public,anon;
revoke all on function public.adjust_product_stock(uuid,numeric,numeric,text,date) from public,anon;
revoke all on function public.customer_summary(uuid) from public,anon;
grant execute on function public.record_pos_sale_v2_4(uuid,jsonb,text,numeric,text,date,uuid,uuid),
 public.create_invoice_with_stock_v2_4(uuid,text,text,date,numeric,jsonb,text,integer,text,uuid),
 public.pay_supplier_invoice(uuid,date,text,text),public.adjust_product_stock(uuid,numeric,numeric,text,date),public.customer_summary(uuid) to authenticated;
create or replace function public.void_sale_transaction(p_transaction_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.sale_transactions%rowtype;
  v_sale record;
  v_alloc record;
begin
  select * into v_tx from public.sale_transactions where id=p_transaction_id for update;
  if not found then raise exception 'Venta no encontrada'; end if;
  if not public.is_pharmacy_member(v_tx.pharmacy_id) then raise exception 'Sin acceso'; end if;
  if v_tx.status='voided' then return true; end if;

  perform 1 from public.products where id in
    (select product_id from public.sales where transaction_id=p_transaction_id)
    order by id for update;
  for v_sale in select id,product_id,quantity from public.sales where transaction_id=p_transaction_id
  loop
    for v_alloc in select batch_id,quantity from public.sale_batch_allocations where sale_id=v_sale.id
    loop
      update public.stock_batches
      set quantity_remaining=quantity_remaining+v_alloc.quantity
      where id=v_alloc.batch_id;
    end loop;
    update public.products
    set current_stock=current_stock+v_sale.quantity,updated_at=now()
    where id=v_sale.product_id;
  end loop;

  update public.sale_transactions
  set status='voided',voided_at=now(),voided_by=auth.uid()
  where id=p_transaction_id;
  return true;
end;
$$;

notify pgrst,'reload schema';
commit;
