import { PharmacyDB } from './db.js';
import { money, num, isoToday, daysUntil, computePurchaseSuggestions, csvDownload } from './analytics.js';
import { extractInvoiceText } from './invoice-ocr.js';

const cfg = window.FARMACIA_CONFIG || {};
const validConfig = cfg.SUPABASE_URL && cfg.SUPABASE_PUBLISHABLE_KEY && !cfg.SUPABASE_URL.includes('PEGAR_AQUI') && !cfg.SUPABASE_PUBLISHABLE_KEY.includes('PEGAR_AQUI');
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const currency = cfg.CURRENCY || 'C$';
const state = { session:null, member:null, pharmacy:null, products:[], sales:[], invoices:[], batches:[], expenses:[] };
let sb, db, toastTimer;

function toast(message, error=false){const el=$('#toast');el.textContent=message;el.className=`toast show${error?' error':''}`;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.className='toast',3200)}
function showOnly(id){['#config-error','#auth-screen','#onboarding-screen','#app'].forEach(s=>$(s).classList.add('hidden'));$(id).classList.remove('hidden')}
function esc(v=''){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function fmtDate(d){if(!d)return '—';return new Date(`${d}T00:00:00`).toLocaleDateString('es-NI')}
function startOfDaysAgo(days){const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-days);return d}
function withinDays(date,days){return new Date(`${date}T00:00:00`)>=startOfDaysAgo(days)}
function sum(arr,fn){return arr.reduce((a,x)=>a+Number(fn(x)||0),0)}

if(!validConfig){showOnly('#config-error');}else{
  sb = window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  db = new PharmacyDB(sb);
  init();
}

async function init(){
  bindStaticEvents();
  const {data:{session}} = await sb.auth.getSession();
  state.session=session;
  await routeSession();
  sb.auth.onAuthStateChange(async (_event,session)=>{state.session=session;await routeSession();});
  if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
}

function bindStaticEvents(){
  $$('[data-auth-tab]').forEach(btn=>btn.addEventListener('click',()=>{
    $$('[data-auth-tab]').forEach(b=>b.classList.toggle('active',b===btn));
    $('#login-form').classList.toggle('hidden',btn.dataset.authTab!=='login');
    $('#signup-form').classList.toggle('hidden',btn.dataset.authTab!=='signup');
  }));
  $('#login-form').addEventListener('submit',login);
  $('#signup-form').addEventListener('submit',signup);
  $('#create-pharmacy-form').addEventListener('submit',createPharmacy);
  $('#join-pharmacy-form').addEventListener('submit',joinPharmacy);
  $('#onboarding-logout').addEventListener('click',()=>sb.auth.signOut());
  $('#logout-btn').addEventListener('click',()=>sb.auth.signOut());
  $('#refresh-btn').addEventListener('click',()=>refreshAll(true));
  $('#menu-btn').addEventListener('click',()=>$('.sidebar').classList.toggle('open'));
  $$('#nav button[data-view]').forEach(btn=>btn.addEventListener('click',()=>openView(btn.dataset.view)));
  $$('[data-close-dialog]').forEach(btn=>btn.addEventListener('click',()=>document.getElementById(btn.dataset.closeDialog).close()));
  $('#new-product-btn').addEventListener('click',()=>openProductDialog());
  $('#product-form').addEventListener('submit',saveProduct);
  $('#product-search').addEventListener('input',renderProducts);
  $('#new-sale-btn').addEventListener('click',openSaleDialog);
  $('#sale-form').addEventListener('submit',saveSale);
  $('#add-invoice-line').addEventListener('click',()=>addInvoiceLine());
  $('#invoice-form').addEventListener('submit',saveInvoice);
  $('#ocr-btn').addEventListener('click',runOCR);
  $('#expense-form').addEventListener('submit',saveExpense);
  $('#export-products').addEventListener('click',exportProducts);
  $('#export-sales').addEventListener('click',exportSales);
  $('#seed-demo-btn').addEventListener('click',seedDemo);
}

async function routeSession(){
  if(!state.session){state.member=null;state.pharmacy=null;showOnly('#auth-screen');return;}
  try{
    const member=await db.membership();
    if(!member){showOnly('#onboarding-screen');return;}
    state.member=member;state.pharmacy=member.pharmacies;
    $('#pharmacy-label').textContent=state.pharmacy.name;
    $('#settings-name').value=state.pharmacy.name;
    $('#settings-code').value=state.pharmacy.invite_code;
    showOnly('#app');
    await refreshAll();
  }catch(e){toast(e.message,true)}
}

async function login(e){e.preventDefault();const {error}=await sb.auth.signInWithPassword({email:$('#login-email').value.trim(),password:$('#login-password').value});if(error)toast(error.message,true)}
async function signup(e){e.preventDefault();const {data,error}=await sb.auth.signUp({email:$('#signup-email').value.trim(),password:$('#signup-password').value});if(error)return toast(error.message,true);if(!data.session)toast('Cuenta creada. Revisa tu email para confirmar.');else toast('Cuenta creada.');}
async function createPharmacy(e){e.preventDefault();try{await db.createPharmacy($('#pharmacy-name').value.trim());toast('Farmacia creada');await routeSession()}catch(err){toast(err.message,true)}}
async function joinPharmacy(e){e.preventDefault();try{await db.joinPharmacy($('#invite-code').value);toast('Te uniste a la farmacia');await routeSession()}catch(err){toast(err.message,true)}}

function openView(name){
  $$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${name}`));
  $$('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
  const titles={dashboard:['Inicio','Resumen de tu farmacia'],inventory:['Inventario','Productos, stock y ventas'],invoices:['Facturas / Ingresos','Registra compras y nuevos lotes'],expiry:['Caducidades','Prioriza los lotes que vencen primero'],purchases:['Compras sugeridas','Reposición basada en demanda y stock'],finance:['Finanzas','Ventas, costos y gastos'],reports:['Reportes','Análisis y exportación'],settings:['Configuración','Acceso y datos de demostración']};
  $('#page-title').textContent=titles[name][0];$('#page-subtitle').textContent=titles[name][1];$('.sidebar').classList.remove('open');
}

async function refreshAll(notify=false){
  if(!state.pharmacy)return;
  try{
    const pid=state.pharmacy.id;
    const [products,sales,invoices,batches,expenses]=await Promise.all([db.products(pid),db.sales(pid,180),db.invoices(pid),db.expiryBatches(pid),db.expenses(pid,180)]);
    Object.assign(state,{products,sales,invoices,batches,expenses});
    renderAll(); if(notify)toast('Datos actualizados');
  }catch(e){toast(e.message,true)}
}

function renderAll(){renderDashboard();renderProducts();refreshProductSelects();renderInvoices();renderExpiry();renderPurchases();renderFinance();renderReports();}

function renderDashboard(){
  const sales30=state.sales.filter(s=>withinDays(s.sold_at,30));
  const exp30=state.expenses.filter(x=>withinDays(x.expense_date,30));
  const revenue=sum(sales30,s=>s.quantity*s.unit_price), cogs=sum(sales30,s=>s.quantity*s.unit_cost_snapshot), expenses=sum(exp30,x=>x.amount);
  const low=state.products.filter(p=>Number(p.current_stock)<=Number(p.min_stock));
  const expiring=state.batches.filter(b=>{const d=daysUntil(b.expiry_date);return d!==null&&d>=0&&d<=90});
  $('#kpi-grid').innerHTML=[
    ['Ventas 30 días',money(revenue,currency),`${sales30.length} registros`],
    ['Beneficio estimado',money(revenue-cogs-expenses,currency),'Ventas − costo − gastos'],
    ['Stock crítico',low.length,'Productos en/bajo mínimo'],
    ['Vence ≤ 90 días',expiring.length,'Lotes con stock restante']
  ].map(x=>`<div class="kpi"><div class="label">${x[0]}</div><div class="value">${x[1]}</div><div class="foot">${x[2]}</div></div>`).join('');
  const alerts=[];
  low.slice(0,6).forEach(p=>alerts.push(`<div class="list-item"><div><strong>${esc(p.name)}</strong><span class="meta">Stock ${num(p.current_stock)} · mínimo ${num(p.min_stock)}</span></div><span class="badge danger">Stock</span></div>`));
  expiring.slice(0,6).forEach(b=>alerts.push(`<div class="list-item"><div><strong>${esc(b.products?.name||'Producto')}</strong><span class="meta">Lote ${esc(b.batch_no||'—')} · vence ${fmtDate(b.expiry_date)}</span></div><span class="badge warn">${daysUntil(b.expiry_date)} días</span></div>`));
  $('#alerts-list').innerHTML=alerts.join('')||'<div class="empty">Sin alertas importantes 🎉</div>';
  const recent=[...state.sales.slice(0,4).map(s=>({d:s.sold_at,t:`Venta · ${s.products?.name||''}`,m:`${num(s.quantity)} × ${money(s.unit_price,currency)}`})),...state.invoices.slice(0,4).map(i=>({d:i.invoice_date,t:`Factura · ${i.supplier}`,m:i.invoice_number||'Sin número'}))].sort((a,b)=>String(b.d).localeCompare(String(a.d))).slice(0,7);
  $('#recent-list').innerHTML=recent.map(r=>`<div class="list-item"><div><strong>${esc(r.t)}</strong><span class="meta">${fmtDate(r.d)} · ${esc(r.m)}</span></div></div>`).join('')||'<div class="empty">Todavía no hay actividad.</div>';
}

function renderProducts(){
  const q=$('#product-search').value?.trim().toLowerCase()||'';
  const rows=state.products.filter(p=>[p.name,p.sku,p.category].some(v=>String(v||'').toLowerCase().includes(q)));
  $('#products-body').innerHTML=rows.map(p=>`<tr><td><strong>${esc(p.name)}</strong><span class="muted small">${esc(p.category||'Sin categoría')}</span></td><td>${esc(p.sku||'—')}</td><td class="${Number(p.current_stock)<=Number(p.min_stock)?'stock-low':''}">${num(p.current_stock)} ${esc(p.unit)}</td><td>${num(p.min_stock)}</td><td>${money(p.last_cost,currency)}</td><td>${esc(p.preferred_supplier||p.last_supplier||'—')}</td><td><button class="ghost edit-product" data-id="${p.id}">Editar</button></td></tr>`).join('')||'<tr><td colspan="7"><div class="empty">No hay productos.</div></td></tr>';
  $$('.edit-product').forEach(b=>b.addEventListener('click',()=>openProductDialog(state.products.find(p=>p.id===b.dataset.id))));
}

function openProductDialog(p=null){
  $('#product-dialog-title').textContent=p?'Editar producto':'Nuevo producto';
  $('#product-id').value=p?.id||'';$('#product-name').value=p?.name||'';$('#product-sku').value=p?.sku||'';$('#product-category').value=p?.category||'';$('#product-unit').value=p?.unit||'unidad';$('#product-min-stock').value=p?.min_stock??5;$('#product-target-days').value=p?.target_days??14;$('#product-preferred-supplier').value=p?.preferred_supplier||'';
  $('#product-dialog').showModal();
}
async function saveProduct(e){
  e.preventDefault();const id=$('#product-id').value||null;
  const row={name:$('#product-name').value.trim(),sku:$('#product-sku').value.trim()||null,category:$('#product-category').value.trim()||null,unit:$('#product-unit').value.trim()||'unidad',min_stock:Number($('#product-min-stock').value||0),target_days:Number($('#product-target-days').value||14),preferred_supplier:$('#product-preferred-supplier').value.trim()||null};
  if(!id)row.pharmacy_id=state.pharmacy.id;else row.id=id;
  try{await db.saveProduct(row);$('#product-dialog').close();toast('Producto guardado');await refreshAll()}catch(err){toast(err.message,true)}
}

function refreshProductSelects(){
  const options='<option value="">Selecciona…</option>'+state.products.map(p=>`<option value="${p.id}">${esc(p.name)} · stock ${num(p.current_stock)}</option>`).join('');
  $('#sale-product').innerHTML=options;
  $$('.line-product').forEach(s=>{const old=s.value;s.innerHTML=options;s.value=old});
}
function openSaleDialog(){refreshProductSelects();$('#sale-qty').value=1;$('#sale-price').value='';$('#sale-date').value=isoToday();$('#sale-note').value='';$('#sale-dialog').showModal()}
async function saveSale(e){e.preventDefault();try{await db.recordSale($('#sale-product').value,$('#sale-qty').value,$('#sale-price').value,$('#sale-date').value,$('#sale-note').value.trim());$('#sale-dialog').close();toast('Venta registrada');await refreshAll()}catch(err){toast(err.message,true)}}

function addInvoiceLine(values={}){
  const wrap=document.createElement('div');wrap.className='invoice-line';
  wrap.innerHTML=`<div class="invoice-line-grid"><label class="wide-mobile">Producto<select class="line-product" required></select></label><label>Cantidad<input class="line-qty" type="number" min="0.01" step="0.01" value="${esc(values.quantity||1)}" required></label><label>Costo/u<input class="line-cost" type="number" min="0" step="0.0001" value="${esc(values.cost_unit||'')}" required></label><label>Lote<input class="line-batch" value="${esc(values.batch_no||'')}"></label><label>Vence<input class="line-expiry" type="date" value="${esc(values.expiry_date||'')}"></label><button type="button" class="icon-btn remove-line" aria-label="Eliminar">×</button></div>`;
  $('#invoice-lines').appendChild(wrap);refreshProductSelects();if(values.product_id)wrap.querySelector('.line-product').value=values.product_id;wrap.querySelector('.remove-line').addEventListener('click',()=>wrap.remove());
}
async function runOCR(){
  const file=$('#invoice-file').files[0];$('#ocr-status').textContent='';
  try{$('#ocr-btn').disabled=true;const text=await extractInvoiceText(file,p=>$('#ocr-status').textContent=`Procesando ${p}%`);$('#invoice-ocr-text').value=text;$('#ocr-status').textContent='Texto extraído. Revisa los campos.';toast('OCR terminado');}
  catch(e){toast(e.message,true);$('#ocr-status').textContent='';}finally{$('#ocr-btn').disabled=false}
}
async function saveInvoice(e){
  e.preventDefault();const lines=$$('.invoice-line').map(line=>({product_id:line.querySelector('.line-product').value,quantity:Number(line.querySelector('.line-qty').value),cost_unit:Number(line.querySelector('.line-cost').value),batch_no:line.querySelector('.line-batch').value.trim(),expiry_date:line.querySelector('.line-expiry').value||''}));
  if(!lines.length)return toast('Añade al menos un producto a la factura.',true);if(lines.some(x=>!x.product_id||!x.quantity))return toast('Revisa las líneas de la factura.',true);
  const supplier=$('#invoice-supplier').value.trim();let path=null;
  try{
    const file=$('#invoice-file').files[0];if(file)path=await db.uploadInvoice(state.pharmacy.id,state.session.user.id,file);
    await db.createInvoiceWithStock({p_pharmacy_id:state.pharmacy.id,p_supplier:supplier,p_invoice_number:$('#invoice-number').value.trim()||null,p_invoice_date:$('#invoice-date').value,p_total:$('#invoice-total').value?Number($('#invoice-total').value):null,p_file_path:path,p_ocr_text:$('#invoice-ocr-text').value.trim()||null,p_lines:lines});
    $('#invoice-form').reset();$('#invoice-date').value=isoToday();$('#invoice-lines').innerHTML='';addInvoiceLine();toast('Factura guardada e inventario actualizado');await refreshAll();
  }catch(err){toast(err.message,true)}
}
function renderInvoices(){
  $('#invoice-history').innerHTML=state.invoices.map(i=>`<div class="list-item"><div><strong>${esc(i.supplier)}</strong><span class="meta">${fmtDate(i.invoice_date)} · ${esc(i.invoice_number||'Sin número')}</span></div><span>${i.total==null?'—':money(i.total,currency)}</span></div>`).join('')||'<div class="empty">Todavía no hay facturas.</div>';
}

function renderExpiry(){
  $('#expiry-body').innerHTML=state.batches.map(b=>{const d=daysUntil(b.expiry_date);const cls=d<0?'danger':d<=30?'danger':d<=90?'warn':'';return `<tr><td><strong>${esc(b.products?.name||'')}</strong><span class="muted small">${esc(b.products?.sku||'')}</span></td><td>${esc(b.batch_no||'—')}</td><td>${fmtDate(b.expiry_date)}</td><td><span class="badge ${cls}">${d<0?`Vencido ${Math.abs(d)} d`:`${d} días`}</span></td><td>${num(b.quantity_remaining)}</td><td>${money(Number(b.quantity_remaining)*Number(b.cost_unit),currency)}</td></tr>`}).join('')||'<tr><td colspan="6"><div class="empty">No hay lotes con caducidad registrada.</div></td></tr>';
}
function renderPurchases(){
  const suggestions=computePurchaseSuggestions(state.products,state.sales,cfg.DEFAULT_COVERAGE_DAYS||14);
  $('#purchase-body').innerHTML=suggestions.map(p=>`<tr><td><strong>${esc(p.name)}</strong></td><td>${num(p.current_stock)}</td><td>${num(p.sold30)}</td><td>${p.targetDays}</td><td>${p.suggested>0?`<span class="badge warn">Pedir ${p.suggested}</span>`:'<span class="badge">OK</span>'}</td><td>${esc(p.preferred_supplier||p.last_supplier||'—')}</td><td>${money(p.last_cost,currency)}</td></tr>`).join('')||'<tr><td colspan="7"><div class="empty">Añade productos para generar sugerencias.</div></td></tr>';
}

function renderFinance(){
  const sales30=state.sales.filter(s=>withinDays(s.sold_at,30)), exp30=state.expenses.filter(x=>withinDays(x.expense_date,30));
  const revenue=sum(sales30,s=>s.quantity*s.unit_price),cogs=sum(sales30,s=>s.quantity*s.unit_cost_snapshot),expenses=sum(exp30,x=>x.amount),gross=revenue-cogs,net=gross-expenses;
  $('#finance-kpis').innerHTML=[['Ingresos',money(revenue,currency),'Últimos 30 días'],['Costo vendido',money(cogs,currency),'Costo promedio al momento de la venta'],['Gastos',money(expenses,currency),'Últimos 30 días'],['Resultado estimado',money(net,currency),`Margen bruto ${revenue?Math.round(gross/revenue*100):0}%`]].map(x=>`<div class="kpi"><div class="label">${x[0]}</div><div class="value">${x[1]}</div><div class="foot">${x[2]}</div></div>`).join('');
  $('#expenses-list').innerHTML=state.expenses.slice(0,12).map(x=>`<div class="list-item"><div><strong>${esc(x.category)}</strong><span class="meta">${fmtDate(x.expense_date)} · ${esc(x.description||'')}</span></div><span>${money(x.amount,currency)}</span></div>`).join('')||'<div class="empty">Sin gastos registrados.</div>';
}
async function saveExpense(e){e.preventDefault();try{await db.addExpense({pharmacy_id:state.pharmacy.id,expense_date:$('#expense-date').value,category:$('#expense-category').value.trim(),description:$('#expense-description').value.trim()||null,amount:Number($('#expense-amount').value)});e.target.reset();$('#expense-date').value=isoToday();toast('Gasto guardado');await refreshAll()}catch(err){toast(err.message,true)}}

function renderReports(){
  const sales30=state.sales.filter(s=>withinDays(s.sold_at,30));const byProd=new Map();sales30.forEach(s=>byProd.set(s.product_id,(byProd.get(s.product_id)||0)+Number(s.quantity)));const top=[...byProd.entries()].map(([id,q])=>({name:state.products.find(p=>p.id===id)?.name||'Producto',q})).sort((a,b)=>b.q-a.q).slice(0,8);const max=Math.max(...top.map(x=>x.q),1);
  $('#top-products').innerHTML=top.map(x=>`<div class="bar-row"><div class="bar-head"><span>${esc(x.name)}</span><strong>${num(x.q)}</strong></div><div class="bar-track"><div class="bar-fill" style="width:${Math.max(4,x.q/max*100)}%"></div></div></div>`).join('')||'<div class="empty">No hay ventas en los últimos 30 días.</div>';
  const cats=new Map();state.products.forEach(p=>{const k=p.category||'Sin categoría';const v=cats.get(k)||{count:0,stock:0,value:0};v.count++;v.stock+=Number(p.current_stock);v.value+=Number(p.current_stock)*Number(p.avg_cost);cats.set(k,v)});
  $('#category-summary').innerHTML=[...cats.entries()].sort((a,b)=>b[1].value-a[1].value).map(([k,v])=>`<div class="list-item"><div><strong>${esc(k)}</strong><span class="meta">${v.count} productos · ${num(v.stock)} unidades</span></div><span>${money(v.value,currency)}</span></div>`).join('')||'<div class="empty">Sin categorías.</div>';
}
function exportProducts(){const rows=state.products.map(p=>({SKU:p.sku||'',Producto:p.name,Categoria:p.category||'',Unidad:p.unit,Stock:p.current_stock,Stock_minimo:p.min_stock,Costo_promedio:p.avg_cost,Ultimo_costo:p.last_cost,Ultimo_proveedor:p.last_supplier||'',Proveedor_preferido:p.preferred_supplier||''}));if(!csvDownload('inventario-farmacia.csv',rows))toast('No hay datos para exportar',true)}
function exportSales(){const rows=state.sales.map(s=>({Fecha:s.sold_at,Producto:s.products?.name||'',Cantidad:s.quantity,Precio_unitario:s.unit_price,Costo_unitario:s.unit_cost_snapshot,Ingreso:Number(s.quantity)*Number(s.unit_price),Costo:Number(s.quantity)*Number(s.unit_cost_snapshot)}));if(!csvDownload('ventas-farmacia.csv',rows))toast('No hay datos para exportar',true)}
async function seedDemo(){if(!confirm('¿Cargar datos ficticios? Solo funciona si todavía no hay productos.'))return;try{await db.seedDemo(state.pharmacy.id);toast('Datos demo cargados');await refreshAll()}catch(err){toast(err.message,true)}}

// Valores iniciales
$('#invoice-date').value=isoToday();$('#expense-date').value=isoToday();addInvoiceLine();
