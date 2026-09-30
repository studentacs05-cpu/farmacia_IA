-- FARMACIA AI - ESQUEMA COMPLETO
-- Ejecutar TODO este archivo una sola vez en Supabase > SQL Editor.
-- Diseñado para Supabase Auth + Row Level Security (RLS).

create extension if not exists pgcrypto;

create or replace function public.make_invite_code()
returns text
language sql
volatile
as $$
  select upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 8));
$$;

create table if not exists public.pharmacies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default public.make_invite_code(),
  created_at timestamptz not null default now()
);

create table if not exists public.pharmacy_members (
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  created_at timestamptz not null default now(),
  primary key (pharmacy_id, user_id)
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  sku text,
  name text not null,
  category text,
  unit text not null default 'unidad',
  min_stock numeric(14,2) not null default 0,
  target_days integer not null default 14 check (target_days > 0),
  current_stock numeric(14,2) not null default 0,
  avg_cost numeric(14,4) not null default 0,
  last_cost numeric(14,4) not null default 0,
  last_supplier text,
  preferred_supplier text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists products_pharmacy_sku_unique on public.products(pharmacy_id, sku) where sku is not null and sku <> '';
create index if not exists products_pharmacy_idx on public.products(pharmacy_id);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  supplier text not null,
  invoice_number text,
  invoice_date date not null default current_date,
  total numeric(14,2),
  file_path text,
  ocr_text text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists invoices_pharmacy_date_idx on public.invoices(pharmacy_id, invoice_date desc);

create table if not exists public.stock_batches (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete set null,
  quantity_received numeric(14,2) not null check (quantity_received > 0),
  quantity_remaining numeric(14,2) not null check (quantity_remaining >= 0),
  cost_unit numeric(14,4) not null default 0,
  supplier text not null,
  batch_no text,
  expiry_date date,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists stock_batches_product_expiry_idx on public.stock_batches(product_id, expiry_date);
create index if not exists stock_batches_pharmacy_idx on public.stock_batches(pharmacy_id);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric(14,2) not null check (quantity > 0),
  unit_price numeric(14,4) not null default 0,
  unit_cost_snapshot numeric(14,4) not null default 0,
  sold_at date not null default current_date,
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists sales_pharmacy_date_idx on public.sales(pharmacy_id, sold_at desc);
create index if not exists sales_product_date_idx on public.sales(product_id, sold_at desc);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  expense_date date not null default current_date,
  category text not null,
  description text,
  amount numeric(14,2) not null check (amount >= 0),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists expenses_pharmacy_date_idx on public.expenses(pharmacy_id, expense_date desc);

-- Helper RLS. SECURITY DEFINER evita recursión al consultar pharmacy_members desde políticas.
create or replace function public.is_pharmacy_member(p_pharmacy_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.pharmacy_members m
    where m.pharmacy_id = p_pharmacy_id and m.user_id = auth.uid()
  );
$$;

-- Crear la farmacia del primer usuario.
create or replace function public.create_pharmacy(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
  if exists(select 1 from public.pharmacy_members where user_id = auth.uid()) then
    raise exception 'Este usuario ya pertenece a una farmacia';
  end if;
  insert into public.pharmacies(name) values (trim(p_name)) returning id into v_id;
  insert into public.pharmacy_members(pharmacy_id,user_id,role) values(v_id,auth.uid(),'owner');
  return v_id;
end;
$$;

-- Unirse mediante código compartido por el propietario.
create or replace function public.join_pharmacy(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
  if exists(select 1 from public.pharmacy_members where user_id = auth.uid()) then
    raise exception 'Este usuario ya pertenece a una farmacia';
  end if;
  select id into v_id from public.pharmacies where invite_code = upper(trim(p_code));
  if v_id is null then raise exception 'Código de invitación no válido'; end if;
  insert into public.pharmacy_members(pharmacy_id,user_id,role) values(v_id,auth.uid(),'member');
  return v_id;
end;
$$;

-- Ingreso de inventario: crea lote y actualiza costo promedio/stock de forma atómica.
create or replace function public.receive_stock(
  p_pharmacy_id uuid,
  p_product_id uuid,
  p_quantity numeric,
  p_cost_unit numeric,
  p_supplier text,
  p_batch_no text default null,
  p_expiry_date date default null,
  p_invoice_id uuid default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.products%rowtype;
  v_batch_id uuid;
  v_new_stock numeric;
  v_new_avg numeric;
begin
  if not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Sin acceso'; end if;
  if p_quantity <= 0 then raise exception 'La cantidad debe ser mayor que cero'; end if;
  select * into v_product from public.products where id=p_product_id and pharmacy_id=p_pharmacy_id for update;
  if not found then raise exception 'Producto no encontrado'; end if;
  v_new_stock := v_product.current_stock + p_quantity;
  if v_new_stock > 0 then
    v_new_avg := ((v_product.current_stock * v_product.avg_cost) + (p_quantity * coalesce(p_cost_unit,0))) / v_new_stock;
  else v_new_avg := 0; end if;
  insert into public.stock_batches(pharmacy_id,product_id,invoice_id,quantity_received,quantity_remaining,cost_unit,supplier,batch_no,expiry_date,notes)
  values(p_pharmacy_id,p_product_id,p_invoice_id,p_quantity,p_quantity,coalesce(p_cost_unit,0),trim(p_supplier),nullif(trim(p_batch_no),''),p_expiry_date,p_notes)
  returning id into v_batch_id;
  update public.products set current_stock=v_new_stock,avg_cost=v_new_avg,last_cost=coalesce(p_cost_unit,0),last_supplier=trim(p_supplier),updated_at=now()
  where id=p_product_id;
  return v_batch_id;
end;
$$;



-- Crea una factura y todos sus ingresos en una sola transacción.
create or replace function public.create_invoice_with_stock(
  p_pharmacy_id uuid,
  p_supplier text,
  p_invoice_number text,
  p_invoice_date date,
  p_total numeric,
  p_file_path text,
  p_ocr_text text,
  p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_id uuid;
  v_line jsonb;
  v_expiry date;
begin
  if not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Sin acceso'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines)=0 then
    raise exception 'La factura necesita al menos una línea';
  end if;
  insert into public.invoices(pharmacy_id,supplier,invoice_number,invoice_date,total,file_path,ocr_text)
  values(p_pharmacy_id,trim(p_supplier),nullif(trim(p_invoice_number),''),coalesce(p_invoice_date,current_date),p_total,p_file_path,p_ocr_text)
  returning id into v_invoice_id;
  for v_line in select value from jsonb_array_elements(p_lines)
  loop
    v_expiry := null;
    if nullif(v_line->>'expiry_date','') is not null then v_expiry := (v_line->>'expiry_date')::date; end if;
    perform public.receive_stock(
      p_pharmacy_id,
      (v_line->>'product_id')::uuid,
      (v_line->>'quantity')::numeric,
      coalesce((v_line->>'cost_unit')::numeric,0),
      p_supplier,
      nullif(v_line->>'batch_no',''),
      v_expiry,
      v_invoice_id,
      'Ingreso desde factura'
    );
  end loop;
  return v_invoice_id;
end;
$$;

-- Venta: descuenta stock siguiendo FEFO (primero vence, primero sale).
create or replace function public.record_sale(
  p_product_id uuid,
  p_quantity numeric,
  p_unit_price numeric,
  p_sold_at date default current_date,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_product public.products%rowtype;
  v_sale_id uuid;
  v_need numeric;
  v_take numeric;
  v_batch record;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión'; end if;
  if p_quantity <= 0 then raise exception 'La cantidad debe ser mayor que cero'; end if;
  select * into v_product from public.products where id=p_product_id for update;
  if not found or not public.is_pharmacy_member(v_product.pharmacy_id) then raise exception 'Producto no encontrado o sin acceso'; end if;
  if v_product.current_stock < p_quantity then raise exception 'Stock insuficiente'; end if;
  insert into public.sales(pharmacy_id,product_id,quantity,unit_price,unit_cost_snapshot,sold_at,notes)
  values(v_product.pharmacy_id,p_product_id,p_quantity,coalesce(p_unit_price,0),v_product.avg_cost,coalesce(p_sold_at,current_date),p_notes)
  returning id into v_sale_id;
  v_need := p_quantity;
  for v_batch in
    select id,quantity_remaining from public.stock_batches
    where product_id=p_product_id and quantity_remaining>0
    order by expiry_date asc nulls last, created_at asc
    for update
  loop
    exit when v_need <= 0;
    v_take := least(v_need,v_batch.quantity_remaining);
    update public.stock_batches set quantity_remaining=quantity_remaining-v_take where id=v_batch.id;
    v_need := v_need-v_take;
  end loop;
  update public.products set current_stock=current_stock-p_quantity,updated_at=now() where id=p_product_id;
  return v_sale_id;
end;
$$;

-- Datos de demostración. Solo funciona en una farmacia vacía.
create or replace function public.seed_demo_data(p_pharmacy_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare p1 uuid; p2 uuid; p3 uuid; p4 uuid; inv uuid;
begin
  if not public.is_pharmacy_member(p_pharmacy_id) then raise exception 'Sin acceso'; end if;
  if exists(select 1 from public.products where pharmacy_id=p_pharmacy_id) then raise exception 'La farmacia ya tiene productos'; end if;
  insert into public.products(pharmacy_id,sku,name,category,unit,min_stock,target_days,preferred_supplier) values
    (p_pharmacy_id,'PARA500','Paracetamol 500 mg','Analgésicos','caja',12,14,'Distribuidora Central') returning id into p1;
  insert into public.products(pharmacy_id,sku,name,category,unit,min_stock,target_days,preferred_supplier) values
    (p_pharmacy_id,'IBU400','Ibuprofeno 400 mg','Analgésicos','caja',10,14,'Farmadis') returning id into p2;
  insert into public.products(pharmacy_id,sku,name,category,unit,min_stock,target_days,preferred_supplier) values
    (p_pharmacy_id,'SPF50','Protector solar SPF 50','Dermocosmética','unidad',6,21,'Dermasalud') returning id into p3;
  insert into public.products(pharmacy_id,sku,name,category,unit,min_stock,target_days,preferred_supplier) values
    (p_pharmacy_id,'VITC','Vitamina C','Suplementos','frasco',8,21,'Distribuidora Central') returning id into p4;
  insert into public.invoices(pharmacy_id,supplier,invoice_number,invoice_date,total,ocr_text) values
    (p_pharmacy_id,'Distribuidora Central','DEMO-001',current_date-20,1250,'Factura demostrativa') returning id into inv;
  perform public.receive_stock(p_pharmacy_id,p1,40,2.80,'Distribuidora Central','L-P01',current_date+180,inv,'Demo');
  perform public.receive_stock(p_pharmacy_id,p2,26,3.40,'Farmadis','L-I01',current_date+80,inv,'Demo');
  perform public.receive_stock(p_pharmacy_id,p3,14,8.75,'Dermasalud','L-S01',current_date+240,inv,'Demo');
  perform public.receive_stock(p_pharmacy_id,p4,22,4.10,'Distribuidora Central','L-V01',current_date+45,inv,'Demo');
  perform public.record_sale(p1,8,4.50,current_date-12,'Demo');
  perform public.record_sale(p1,5,4.50,current_date-5,'Demo');
  perform public.record_sale(p2,7,5.75,current_date-9,'Demo');
  perform public.record_sale(p3,3,13.50,current_date-4,'Demo');
  perform public.record_sale(p4,6,7.25,current_date-3,'Demo');
  insert into public.expenses(pharmacy_id,expense_date,category,description,amount) values
    (p_pharmacy_id,current_date-10,'Servicios','Electricidad',85),
    (p_pharmacy_id,current_date-2,'Operación','Material de empaque',22.50);
  return 'Datos demo cargados';
end;
$$;

-- RLS
alter table public.pharmacies enable row level security;
alter table public.pharmacy_members enable row level security;
alter table public.products enable row level security;
alter table public.invoices enable row level security;
alter table public.stock_batches enable row level security;
alter table public.sales enable row level security;
alter table public.expenses enable row level security;

-- Elimina políticas si vuelves a ejecutar el archivo durante desarrollo.
drop policy if exists pharmacies_select on public.pharmacies;
drop policy if exists pharmacies_update on public.pharmacies;
create policy pharmacies_select on public.pharmacies for select to authenticated using (public.is_pharmacy_member(id));
create policy pharmacies_update on public.pharmacies for update to authenticated using (public.is_pharmacy_member(id)) with check (public.is_pharmacy_member(id));

drop policy if exists members_select on public.pharmacy_members;
create policy members_select on public.pharmacy_members for select to authenticated using (public.is_pharmacy_member(pharmacy_id));

-- Políticas uniformes para tablas de negocio.
drop policy if exists products_member_all on public.products;
create policy products_member_all on public.products for all to authenticated using (public.is_pharmacy_member(pharmacy_id)) with check (public.is_pharmacy_member(pharmacy_id));
drop policy if exists invoices_member_all on public.invoices;
create policy invoices_member_all on public.invoices for all to authenticated using (public.is_pharmacy_member(pharmacy_id)) with check (public.is_pharmacy_member(pharmacy_id));
drop policy if exists batches_member_all on public.stock_batches;
create policy batches_member_all on public.stock_batches for all to authenticated using (public.is_pharmacy_member(pharmacy_id)) with check (public.is_pharmacy_member(pharmacy_id));
drop policy if exists sales_member_all on public.sales;
create policy sales_member_all on public.sales for all to authenticated using (public.is_pharmacy_member(pharmacy_id)) with check (public.is_pharmacy_member(pharmacy_id));
drop policy if exists expenses_member_all on public.expenses;
create policy expenses_member_all on public.expenses for all to authenticated using (public.is_pharmacy_member(pharmacy_id)) with check (public.is_pharmacy_member(pharmacy_id));

-- Permisos Data API: nada para anon; mínimo razonable para usuarios autenticados.
revoke all on public.pharmacies,public.pharmacy_members,public.products,public.invoices,public.stock_batches,public.sales,public.expenses from anon;
grant select on public.pharmacies to authenticated;
grant select on public.pharmacy_members to authenticated;
grant select,insert,update on public.products to authenticated;
grant select on public.invoices,public.stock_batches,public.sales to authenticated;
grant select,insert on public.expenses to authenticated;
grant execute on function public.is_pharmacy_member(uuid) to authenticated;
grant execute on function public.create_pharmacy(text) to authenticated;
grant execute on function public.join_pharmacy(text) to authenticated;
grant execute on function public.receive_stock(uuid,uuid,numeric,numeric,text,text,date,uuid,text) to authenticated;
grant execute on function public.create_invoice_with_stock(uuid,text,text,date,numeric,text,text,jsonb) to authenticated;
grant execute on function public.record_sale(uuid,numeric,numeric,date,text) to authenticated;
grant execute on function public.seed_demo_data(uuid) to authenticated;

-- Storage privado para facturas.
insert into storage.buckets(id,name,public) values('invoices','invoices',false)
on conflict(id) do update set public=false;

drop policy if exists invoice_files_select on storage.objects;
drop policy if exists invoice_files_insert on storage.objects;
drop policy if exists invoice_files_update on storage.objects;
drop policy if exists invoice_files_delete on storage.objects;
create policy invoice_files_select on storage.objects for select to authenticated
using (bucket_id='invoices' and public.is_pharmacy_member(((storage.foldername(name))[1])::uuid));
create policy invoice_files_insert on storage.objects for insert to authenticated
with check (bucket_id='invoices' and public.is_pharmacy_member(((storage.foldername(name))[1])::uuid));
create policy invoice_files_update on storage.objects for update to authenticated
using (bucket_id='invoices' and public.is_pharmacy_member(((storage.foldername(name))[1])::uuid))
with check (bucket_id='invoices' and public.is_pharmacy_member(((storage.foldername(name))[1])::uuid));
create policy invoice_files_delete on storage.objects for delete to authenticated
using (bucket_id='invoices' and public.is_pharmacy_member(((storage.foldername(name))[1])::uuid));
