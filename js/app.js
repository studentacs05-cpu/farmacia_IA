import { PharmacyDB } from './db.js';
import { money, num, isoToday, daysUntil, computePurchaseSuggestions, csvDownload } from './analytics.js';
import { PRODUCT_ICON_OPTIONS, productIconSVG, productIconLabel } from './product-icons.js';

const cfg = window.FARMACIA_CONFIG || {};
const validConfig = cfg.SUPABASE_URL && cfg.SUPABASE_PUBLISHABLE_KEY && !cfg.SUPABASE_URL.includes('PEGAR_AQUI') && !cfg.SUPABASE_PUBLISHABLE_KEY.includes('PEGAR_AQUI');
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const currency = cfg.CURRENCY || 'C$';
const state = {
  session:null, member:null, pharmacy:null,
  products:[], suppliers:[], sales:[], transactions:[], invoices:[], batches:[], expenses:[],
  cart:[], posFilter:'all', posDiscount:0, shownUpsells:new Set(), pendingDeleteProductId:null
};
let sb, db, toastTimer, upsellTimer;

function toast(message, error=false){const el=$('#toast');el.textContent=message;el.className=`toast show${error?' error':''}`;clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.className='toast',3200)}
function showOnly(id){['#config-error','#auth-screen','#onboarding-screen','#app'].forEach(s=>$(s).classList.add('hidden'));$(id).classList.remove('hidden')}
function esc(v=''){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function fmtDate(d){if(!d)return '—';return new Date(`${d}T00:00:00`).toLocaleDateString('es-NI')}
function fmtDateTime(d){if(!d)return '—';return new Date(d).toLocaleString('es-NI',{dateStyle:'short',timeStyle:'short'})}
function startOfDaysAgo(days){const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-days);return d}
function withinDays(date,days){return new Date(`${date}T00:00:00`)>=startOfDaysAgo(days)}
function sum(arr,fn){return arr.reduce((a,x)=>a+Number(fn(x)||0),0)}
function productById(id){return state.products.find(p=>p.id===id)}
function isMobile(){return window.matchMedia('(max-width: 760px)').matches}
function appearanceTheme(){return document.documentElement.dataset.theme==='dark'?'dark':'light'}
function appearanceSize(){return document.documentElement.dataset.uiSize==='large'?'large':'normal'}
function syncAppearanceControls(){
  $$('[data-theme-option]').forEach(b=>b.classList.toggle('active',b.dataset.themeOption===appearanceTheme()));
  $$('[data-ui-size-option]').forEach(b=>b.classList.toggle('active',b.dataset.uiSizeOption===appearanceSize()));
}
function applyTheme(theme,persist=true){
  const value=theme==='dark'?'dark':'light';document.documentElement.dataset.theme=value;
  if(persist){try{localStorage.setItem('farmacia-theme',value)}catch(_){}}
  const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=value==='dark'?'#0f211b':'#173d31';
  syncAppearanceControls();
}
function applyUISize(size,persist=true){
  const value=size==='large'?'large':'normal';document.documentElement.dataset.uiSize=value;
  if(persist){try{localStorage.setItem('farmacia-ui-size',value)}catch(_){}}
  syncAppearanceControls();setTimeout(updateMobileCartJumpVisibility,30);
}
function initAppearanceControls(){applyTheme(appearanceTheme(),false);applyUISize(appearanceSize(),false)}
function openSidebar(){const sidebar=$('.sidebar');if(!sidebar)return;sidebar.classList.add('open');document.body.classList.add('sidebar-open')}
function closeSidebar(){const sidebar=$('.sidebar');if(!sidebar)return;sidebar.classList.remove('open');document.body.classList.remove('sidebar-open')}
function toggleSidebar(){const sidebar=$('.sidebar');if(sidebar?.classList.contains('open'))closeSidebar();else openSidebar()}
function shelfLabel(p){const bits=[p.shelf_zone&&`Zona ${p.shelf_zone}`,p.shelf_shelf&&`Est. ${p.shelf_shelf}`,p.shelf_level&&`Niv. ${p.shelf_level}`,p.shelf_position].filter(Boolean);return bits.join(' · ')||'Sin ubicación'}
function nextExpiry(productId){return state.batches.filter(b=>b.product_id===productId&&b.expiry_date&&Number(b.quantity_remaining)>0).sort((a,b)=>String(a.expiry_date).localeCompare(String(b.expiry_date)))[0]||null}
function isCompletedTx(tx){return tx.status!=='voided'}
function legacySales(){return state.sales.filter(s=>!s.transaction_id)}
function completedTransactions(){return state.transactions.filter(isCompletedTx)}

if(!validConfig){showOnly('#config-error')}else{
  sb=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  db=new PharmacyDB(sb);
  init();
}

async function init(){
  populateIconSelect();
  initAppearanceControls();
  bindStaticEvents();
  const {data:{session}}=await sb.auth.getSession();state.session=session;await routeSession();
  sb.auth.onAuthStateChange(async(_event,session)=>{state.session=session;await routeSession()});
  if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
}

function bindStaticEvents(){
  $$('[data-auth-tab]').forEach(btn=>btn.addEventListener('click',()=>{
    $$('[data-auth-tab]').forEach(b=>b.classList.toggle('active',b===btn));
    $('#login-form').classList.toggle('hidden',btn.dataset.authTab!=='login');
    $('#signup-form').classList.toggle('hidden',btn.dataset.authTab!=='signup');
  }));
  $('#login-form').addEventListener('submit',login);$('#signup-form').addEventListener('submit',signup);
  $('#create-pharmacy-form').addEventListener('submit',createPharmacy);$('#join-pharmacy-form').addEventListener('submit',joinPharmacy);
  $('#onboarding-logout').addEventListener('click',()=>sb.auth.signOut());$('#logout-btn').addEventListener('click',()=>sb.auth.signOut());
  $('#refresh-btn').addEventListener('click',()=>refreshAll(true));$('#menu-btn').addEventListener('click',toggleSidebar);
  $$('#nav button[data-view], #mobile-nav button[data-view]').forEach(btn=>btn.addEventListener('click',()=>openView(btn.dataset.view)));
  $('#mobile-more-btn').addEventListener('click',openSidebar);
  $('#sidebar-backdrop').addEventListener('click',closeSidebar);
  $$('[data-theme-option]').forEach(btn=>btn.addEventListener('click',()=>applyTheme(btn.dataset.themeOption)));
  $$('[data-ui-size-option]').forEach(btn=>btn.addEventListener('click',()=>applyUISize(btn.dataset.uiSizeOption)));
  $$('[data-close-dialog]').forEach(btn=>btn.addEventListener('click',()=>document.getElementById(btn.dataset.closeDialog).close()));

  $('#new-product-btn').addEventListener('click',()=>openProductDialog());$('#new-product-invoice-btn').addEventListener('click',()=>openProductDialog());$('#product-form').addEventListener('submit',saveProduct);$('#product-search').addEventListener('input',renderProducts);
  $('#pos-search').addEventListener('input',renderPosGallery);$('#pos-search').addEventListener('keydown',posSearchKeydown);
  $('#pos-sale-discount').addEventListener('input',()=>{state.posDiscount=Math.max(0,Number($('#pos-sale-discount').value||0));renderCartTotals()});
  $('#clear-cart-btn').addEventListener('click',()=>clearCart(true));$('#checkout-btn').addEventListener('click',checkoutSale);$('#suspend-sale-btn').addEventListener('click',suspendSale);
  $('#sale-history-btn').addEventListener('click',openSaleHistory);$('#held-sales-btn').addEventListener('click',openHeldSales);
  $('#mobile-cart-jump').addEventListener('click',()=>{
    const cart=$('#pos-cart'),jump=$('#mobile-cart-jump');if(!cart)return;
    jump.classList.add('hidden');
    const offset=isMobile()?72:18;const top=Math.max(0,cart.getBoundingClientRect().top+window.scrollY-offset);
    window.scrollTo({top,behavior:'smooth'});setTimeout(updateMobileCartJumpVisibility,650);
  });
  window.addEventListener('scroll',updateMobileCartJumpVisibility,{passive:true});window.addEventListener('resize',updateMobileCartJumpVisibility);
  $('#print-receipt-btn').addEventListener('click',()=>window.print());

  $('#add-invoice-line').addEventListener('click',()=>addInvoiceLine());$('#invoice-form').addEventListener('submit',saveInvoice);$('#invoice-supplier').addEventListener('change',updateInvoiceTotalRequirement);$('#new-supplier-btn').addEventListener('click',openSupplierDialog);$('#supplier-form').addEventListener('submit',saveSupplier);$('#confirm-delete-product-btn').addEventListener('click',confirmDeleteProduct);
  $('#expense-form').addEventListener('submit',saveExpense);$('#export-products').addEventListener('click',exportProducts);$('#export-sales').addEventListener('click',exportSales);$('#seed-demo-btn').addEventListener('click',seedDemo);

  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&$('.sidebar')?.classList.contains('open')){closeSidebar();return}
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'&&!$('#view-pos').classList.contains('active')){e.preventDefault();openView('pos');setTimeout(()=>$('#pos-search').focus(),50)}
    else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k') {e.preventDefault();$('#pos-search').focus();$('#pos-search').select()}
    if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&$('#view-pos').classList.contains('active')){e.preventDefault();checkoutSale()}
  });
}

async function routeSession(){
  if(!state.session){state.member=null;state.pharmacy=null;showOnly('#auth-screen');return}
  try{
    const member=await db.membership();if(!member){showOnly('#onboarding-screen');return}
    state.member=member;state.pharmacy=member.pharmacies;
    $('#pharmacy-label').textContent=state.pharmacy.name;$('#settings-name').value=state.pharmacy.name;$('#settings-code').value=state.pharmacy.invite_code;
    showOnly('#app');await refreshAll();updateHeldCount();
  }catch(e){toast(e.message,true)}
}

async function login(e){e.preventDefault();const {error}=await sb.auth.signInWithPassword({email:$('#login-email').value.trim(),password:$('#login-password').value});if(error)toast(error.message,true)}
async function signup(e){e.preventDefault();const {data,error}=await sb.auth.signUp({email:$('#signup-email').value.trim(),password:$('#signup-password').value});if(error)return toast(error.message,true);toast(data.session?'Cuenta creada.':'Cuenta creada. Revisa tu email para confirmar.')}
async function createPharmacy(e){e.preventDefault();try{await db.createPharmacy($('#pharmacy-name').value.trim());toast('Farmacia creada');await routeSession()}catch(err){toast(err.message,true)}}
async function joinPharmacy(e){e.preventDefault();try{await db.joinPharmacy($('#invite-code').value);toast('Te uniste a la farmacia');await routeSession()}catch(err){toast(err.message,true)}}

function openView(name){
  $$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${name}`));
  $$('#nav button[data-view],#mobile-nav button[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
  const titles={dashboard:['Inicio','Resumen de tu farmacia'],pos:['Facturación','Venta rápida en mostrador'],inventory:['Inventario','Productos, precios y ubicación'],invoices:['Ingresos / Proveedores','Facturas de proveedor y nuevos lotes'],expiry:['Caducidades','Prioriza los lotes que vencen primero'],purchases:['Compras sugeridas','Reposición basada en demanda y stock'],finance:['Finanzas','Ventas, costos y gastos'],reports:['Reportes','Análisis y exportación'],settings:['Configuración','Acceso y datos de demostración']};
  $('#page-title').textContent=titles[name]?.[0]||'';$('#page-subtitle').textContent=titles[name]?.[1]||'';closeSidebar();
  if(name==='pos'){renderPos();if(!isMobile())setTimeout(()=>$('#pos-search').focus(),80)}
  window.scrollTo({top:0,behavior:'instant'});
}

async function refreshAll(notify=false){
  if(!state.pharmacy)return;const pid=state.pharmacy.id;
  try{
    const [products,suppliers,sales,transactions,invoices,batches,expenses]=await Promise.all([db.products(pid),db.suppliers(pid),db.sales(pid,365),db.saleTransactions(pid,180),db.invoices(pid),db.expiryBatches(pid),db.expenses(pid,365)]);
    Object.assign(state,{products,suppliers,sales,transactions,invoices,batches,expenses});renderAll();if(notify)toast('Datos actualizados');
  }catch(err){toast(err.message,true)}
}
function renderAll(){renderDashboard();renderProducts();renderSupplierOptions();renderInvoices();renderExpiry();renderPurchases();renderFinance();renderReports();renderPos();renderSaleHistoryList()}

function revenueForDays(days){
  const tx=completedTransactions().filter(t=>withinDays(t.sold_at,days));
  const legacy=legacySales().filter(s=>withinDays(s.sold_at,days));
  return sum(tx,t=>t.total)+sum(legacy,s=>s.quantity*s.unit_price);
}
function renderDashboard(){
  const sales30=state.sales.filter(s=>withinDays(s.sold_at,30)),exp30=state.expenses.filter(x=>withinDays(x.expense_date,30));
  const revenue=revenueForDays(30),cogs=sum(sales30,s=>s.quantity*s.unit_cost_snapshot),expenses=sum(exp30,x=>x.amount);
  const low=state.products.filter(p=>Number(p.current_stock)<=Number(p.min_stock));const expiring=state.batches.filter(b=>daysUntil(b.expiry_date)<=90);
  $('#kpi-grid').innerHTML=[['Ventas 30 días',money(revenue,currency),`${completedTransactions().filter(t=>withinDays(t.sold_at,30)).length+legacySales().filter(s=>withinDays(s.sold_at,30)).length} ventas`],['Beneficio estimado',money(revenue-cogs-expenses,currency),'Ventas − costo − gastos'],['Stock crítico',num(low.length),'Productos en/bajo mínimo'],['Vence ≤ 90 días',num(expiring.length),'Lotes con stock restante']].map(x=>`<div class="kpi"><div class="label">${x[0]}</div><div class="value">${x[1]}</div><div class="foot">${x[2]}</div></div>`).join('');
  const alerts=[];low.slice(0,5).forEach(p=>alerts.push(`<div class="list-item"><div><strong>${esc(p.name)}</strong><span class="meta">Stock ${num(p.current_stock)} · mínimo ${num(p.min_stock)}</span></div><span class="badge danger">Stock bajo</span></div>`));
  expiring.slice(0,5).forEach(b=>alerts.push(`<div class="list-item"><div><strong>${esc(b.products?.name||'Producto')}</strong><span class="meta">Lote ${esc(b.batch_no||'—')} · vence ${fmtDate(b.expiry_date)}</span></div><span class="badge warn">${daysUntil(b.expiry_date)} días</span></div>`));
  $('#alerts-list').innerHTML=alerts.join('')||'<div class="empty">Sin alertas importantes 🎉</div>';
  const recent=[...completedTransactions().slice(0,5).map(t=>({d:t.created_at||t.sold_at,t:'Venta',m:`${money(t.total,currency)} · ${esc(t.payment_method)}`})),...state.invoices.slice(0,4).map(i=>({d:i.invoice_date,t:`Ingreso · ${i.supplier}`,m:i.invoice_number||'Sin número'}))].sort((a,b)=>String(b.d).localeCompare(String(a.d))).slice(0,7);
  $('#recent-list').innerHTML=recent.map(x=>`<div class="list-item"><div><strong>${esc(x.t)}</strong><span class="meta">${fmtDateTime(x.d)}</span></div><span>${x.m}</span></div>`).join('')||'<div class="empty">Todavía no hay actividad.</div>';
}

// ---------- PRODUCTOS / INVENTARIO ----------
function populateIconSelect(){
  $('#product-icon').innerHTML=PRODUCT_ICON_OPTIONS.map(([v,l])=>`<option value="${v}">${l}</option>`).join('');
}
function renderProducts(){
  const q=$('#product-search').value?.trim().toLowerCase()||'';
  const rows=state.products.filter(p=>[p.name,p.sku,p.category,p.presentation,p.function_info,shelfLabel(p)].some(v=>String(v||'').toLowerCase().includes(q)));
  $('#products-body').innerHTML=rows.map(p=>`<tr><td><div class="product-name-cell"><span class="mini-product-icon">${productIconSVG(p.product_icon)}</span><div><strong>${esc(p.name)}</strong><span class="muted small">${esc(p.category||'Sin categoría')}</span></div></div></td><td>${esc(p.sku||'—')}</td><td class="${Number(p.current_stock)<=Number(p.min_stock)?'stock-low':''}">${num(p.current_stock)} ${esc(p.unit)}</td><td>${num(p.min_stock)}</td><td>${money(p.suggested_sale_price,currency)}</td><td>${esc(shelfLabel(p))}</td><td>${esc(p.preferred_supplier||p.last_supplier||'—')}</td><td><div class="row-actions"><button class="ghost info-product" data-id="${p.id}">ⓘ</button><button class="ghost edit-product" data-id="${p.id}">Editar</button><button class="danger-ghost delete-product" data-id="${p.id}">Eliminar</button></div></td></tr>`).join('')||'<tr><td colspan="8"><div class="empty">No hay productos.</div></td></tr>';
  $('#inventory-cards').innerHTML=rows.map(p=>`<article class="inventory-card"><div class="inventory-card-top"><span class="product-icon">${productIconSVG(p.product_icon)}</span><div><strong>${esc(p.name)}</strong><span>${esc(p.category||'Sin categoría')} · SKU ${esc(p.sku||'—')}</span></div></div><div class="inventory-card-grid"><span>Stock <b class="${Number(p.current_stock)<=Number(p.min_stock)?'danger-text':''}">${num(p.current_stock)}</b></span><span>Venta <b>${money(p.suggested_sale_price,currency)}</b></span><span class="wide">📍 ${esc(shelfLabel(p))}</span></div><div class="inventory-card-actions"><button class="secondary info-product" data-id="${p.id}">Ver ficha</button><button class="ghost edit-product" data-id="${p.id}">Editar</button><button class="danger-ghost delete-product" data-id="${p.id}">Eliminar</button></div></article>`).join('')||'<div class="empty">No hay productos.</div>';
  $$('.edit-product').forEach(b=>b.addEventListener('click',()=>openProductDialog(productById(b.dataset.id))));
  $$('.info-product').forEach(b=>b.addEventListener('click',()=>openProductInfo(b.dataset.id)));
  $$('.delete-product').forEach(b=>b.addEventListener('click',()=>openDeleteProductDialog(b.dataset.id)));
}
function refreshUpsellSelect(excludeId=''){
  $('#product-upsell').innerHTML='<option value="">Ninguno</option>'+state.products.filter(p=>p.id!==excludeId).map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
}
function openProductDialog(p=null){
  refreshUpsellSelect(p?.id||'');$('#product-dialog-title').textContent=p?'Editar producto':'Nuevo producto';
  $('#product-id').value=p?.id||'';$('#product-name').value=p?.name||'';$('#product-sku').value=p?.sku||'Automático al guardar';$('#product-category').value=p?.category||'';$('#product-presentation').value=p?.presentation||'';$('#product-icon').value=p?.product_icon||'tablet';$('#product-unit').value=p?.unit||'unidad';$('#product-min-stock').value=p?.min_stock??5;$('#product-target-days').value=p?.target_days??14;$('#product-sale-price').value=p?.suggested_sale_price??'';$('#product-favorite').checked=Boolean(p?.favorite);$('#product-shelf-zone').value=p?.shelf_zone||'';$('#product-shelf-shelf').value=p?.shelf_shelf||'';$('#product-shelf-level').value=p?.shelf_level||'';$('#product-shelf-position').value=p?.shelf_position||'';$('#product-function-info').value=p?.function_info||'';$('#product-dosage-info').value=p?.dosage_info||'';$('#product-preferred-supplier').value=p?.preferred_supplier||'';$('#product-upsell').value=p?.upsell_product_id||'';$('#product-internal-notes').value=p?.internal_notes||'';
  $('#product-dialog').showModal();
}
async function saveProduct(e){
  e.preventDefault();const id=$('#product-id').value||null;
  const row={name:$('#product-name').value.trim(),category:$('#product-category').value.trim()||null,presentation:$('#product-presentation').value.trim()||null,product_icon:$('#product-icon').value,unit:$('#product-unit').value.trim()||'unidad',min_stock:Number($('#product-min-stock').value||0),target_days:Number($('#product-target-days').value||14),suggested_sale_price:Number($('#product-sale-price').value||0),favorite:$('#product-favorite').checked,shelf_zone:$('#product-shelf-zone').value.trim()||null,shelf_shelf:$('#product-shelf-shelf').value.trim()||null,shelf_level:$('#product-shelf-level').value.trim()||null,shelf_position:$('#product-shelf-position').value.trim()||null,function_info:$('#product-function-info').value.trim()||null,dosage_info:$('#product-dosage-info').value.trim()||null,preferred_supplier:$('#product-preferred-supplier').value.trim()||null,upsell_product_id:$('#product-upsell').value||null,internal_notes:$('#product-internal-notes').value.trim()||null};
  if(!id)row.pharmacy_id=state.pharmacy.id;else row.id=id;
  try{const saved=await db.saveProduct(row);$('#product-dialog').close();toast(`Producto guardado · SKU ${saved.sku||''}`);await refreshAll()}catch(err){toast(migrationFriendlyError(err),true)}
}
function openDeleteProductDialog(id){
  const p=productById(id);if(!p)return;state.pendingDeleteProductId=id;
  $('#delete-product-copy').innerHTML=`¿Seguro que quieres eliminar <strong>${esc(p.name)}</strong>? Actualmente registra <strong>${num(p.current_stock)} ${esc(p.unit)}</strong> en stock.`;
  $('#delete-product-dialog').showModal();
}
async function confirmDeleteProduct(){
  const id=state.pendingDeleteProductId;if(!id)return;const p=productById(id);const btn=$('#confirm-delete-product-btn');
  try{btn.disabled=true;await db.archiveProduct(id);$('#delete-product-dialog').close();state.pendingDeleteProductId=null;toast(`${p?.name||'Producto'} eliminado`);await refreshAll()}catch(err){toast(err.message,true)}finally{btn.disabled=false}
}
function openProductInfo(id){
  const p=productById(id);if(!p)return;const exp=nextExpiry(p.id);const related=productById(p.upsell_product_id);
  $('#product-info-content').innerHTML=`<div class="product-info-hero"><span class="product-icon large">${productIconSVG(p.product_icon)}</span><div><h2>${esc(p.name)}</h2><p>${esc(p.presentation||productIconLabel(p.product_icon))}</p></div></div><div class="info-grid"><div><span>Categoría</span><strong>${esc(p.category||'Sin registrar')}</strong></div><div><span>Ubicación</span><strong>${esc(shelfLabel(p))}</strong></div><div><span>Stock</span><strong>${num(p.current_stock)} ${esc(p.unit)}</strong></div><div><span>Precio sugerido</span><strong>${money(p.suggested_sale_price,currency)}</strong></div></div><section class="info-section"><h4>Función / uso</h4><p>${esc(p.function_info||'Sin registrar')}</p></section><section class="info-section dose-box"><h4>Dosis recomendada / indicaciones</h4><p>${esc(p.dosage_info||'Sin registrar')}</p><small>Información ingresada manualmente por la farmacia. Verificar según producto, presentación y paciente.</small></section><section class="info-section"><h4>Producto complementario</h4><p>${related?esc(related.name):'Sin configurar'}</p></section><div class="info-grid compact-info"><div><span>Último costo</span><strong>${money(p.last_cost,currency)}</strong></div><div><span>Costo promedio</span><strong>${money(p.avg_cost,currency)}</strong></div><div><span>Próxima caducidad</span><strong>${exp?fmtDate(exp.expiry_date):'—'}</strong></div><div><span>Proveedor</span><strong>${esc(p.preferred_supplier||p.last_supplier||'—')}</strong></div></div>${p.internal_notes?`<section class="info-section"><h4>Notas internas</h4><p>${esc(p.internal_notes)}</p></section>`:''}`;
  $('#product-info-dialog').showModal();
}

// ---------- POS / FACTURACIÓN ----------
function renderPos(){renderPosFilters();renderPosGallery();renderCart();updateHeldCount()}
function recentProductIds(){const ids=[];for(const s of state.sales){if(!ids.includes(s.product_id))ids.push(s.product_id);if(ids.length>=12)break}return ids}
function renderPosFilters(){
  const categories=[...new Set(state.products.map(p=>p.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es'));
  const chips=[['all','Todos'],['favorites','★ Favoritos'],['recent','Recientes'],...categories.map(c=>[`cat:${c}`,c])];
  $('#pos-category-chips').innerHTML=chips.map(([v,l])=>`<button class="chip ${state.posFilter===v?'active':''}" data-filter="${esc(v)}">${esc(l)}</button>`).join('');
  $$('#pos-category-chips .chip').forEach(b=>b.addEventListener('click',()=>{state.posFilter=b.dataset.filter;renderPosFilters();renderPosGallery()}));
}
function getFilteredPosProducts(){
  const q=$('#pos-search').value.trim().toLowerCase();const recent=recentProductIds();
  return state.products.filter(p=>{
    const matchesQ=!q||[p.name,p.sku,p.category,p.presentation,p.function_info].some(v=>String(v||'').toLowerCase().includes(q));
    let matchesFilter=true;if(state.posFilter==='favorites')matchesFilter=Boolean(p.favorite);else if(state.posFilter==='recent')matchesFilter=recent.includes(p.id);else if(state.posFilter.startsWith('cat:'))matchesFilter=p.category===state.posFilter.slice(4);
    return matchesQ&&matchesFilter;
  }).sort((a,b)=>Number(b.favorite)-Number(a.favorite)||a.name.localeCompare(b.name,'es'));
}
function renderPosGallery(){
  const rows=getFilteredPosProducts();
  $('#pos-gallery').innerHTML=rows.map(p=>`<article class="product-card ${Number(p.current_stock)<=0?'out-of-stock':''}" data-id="${p.id}"><button class="product-card-info" data-info-id="${p.id}" aria-label="Ver información">ⓘ</button><button class="product-card-main" data-add-id="${p.id}" ${Number(p.current_stock)<=0?'disabled':''}><span class="product-icon">${productIconSVG(p.product_icon)}</span><span class="product-card-name">${esc(p.name)}</span><span class="product-card-meta">${esc(p.presentation||p.category||'')}</span><span class="product-card-bottom"><strong>${money(p.suggested_sale_price,currency)}</strong><small class="${Number(p.current_stock)<=Number(p.min_stock)?'danger-text':''}">Stock ${num(p.current_stock)}</small></span></button></article>`).join('')||'<div class="empty gallery-empty">No encontré productos con ese filtro.</div>';
  $$('[data-add-id]').forEach(b=>b.addEventListener('click',()=>addToCart(b.dataset.addId)));
  $$('[data-info-id]').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();openProductInfo(b.dataset.infoId)}));
}
function posSearchKeydown(e){if(e.key==='Enter'){e.preventDefault();const first=getFilteredPosProducts().find(p=>Number(p.current_stock)>0);if(first)addToCart(first.id)}}
function addToCart(productId,qty=1,showUpsell=true){
  const p=productById(productId);if(!p||Number(p.current_stock)<=0)return toast('Producto sin stock.',true);
  let item=state.cart.find(x=>x.product_id===productId);const desired=(item?.quantity||0)+Number(qty);
  if(desired>Number(p.current_stock))return toast(`Solo hay ${num(p.current_stock)} en stock.`,true);
  if(item)item.quantity=desired;else state.cart.push({product_id:p.id,quantity:Number(qty),unit_price:Number(p.suggested_sale_price||0),suggested_price:Number(p.suggested_sale_price||0)});
  renderCart();if(showUpsell)showUpsellFor(p);if(isMobile())navigator.vibrate?.(20);
}
function updateCartItem(productId,changes){const item=state.cart.find(x=>x.product_id===productId);if(!item)return;Object.assign(item,changes);if(item.quantity<=0)state.cart=state.cart.filter(x=>x.product_id!==productId);renderCart()}
function cartTotals(){const subtotal=sum(state.cart,i=>i.quantity*i.unit_price);const discount=Math.min(Math.max(0,Number(state.posDiscount||0)),subtotal);return{subtotal,discount,total:Math.max(0,subtotal-discount)}}
function renderCart(){
  $('#pos-cart-lines').innerHTML=state.cart.map(item=>{const p=productById(item.product_id);return `<div class="cart-line" data-cart-id="${item.product_id}"><div class="cart-line-top"><div><strong>${esc(p?.name||'Producto')}</strong><span>${money(item.unit_price,currency)} c/u · stock ${num(p?.current_stock)}</span></div><button class="icon-btn cart-remove" aria-label="Quitar">×</button></div><div class="cart-line-controls"><div class="qty-control"><button class="qty-minus">−</button><input class="cart-qty" type="number" min="0.01" step="0.01" value="${item.quantity}"><button class="qty-plus">+</button></div><label class="cart-price-label">Precio<input class="cart-price" type="number" min="0" step="0.01" value="${Number(item.unit_price).toFixed(2)}"></label><strong class="line-total">${money(item.quantity*item.unit_price,currency)}</strong></div>${item.suggested_price&&item.unit_price<item.suggested_price?`<div class="price-note">Precio sugerido ${money(item.suggested_price,currency)} · diferencia ${money((item.suggested_price-item.unit_price)*item.quantity,currency)}</div>`:''}</div>`}).join('')||'<div class="empty cart-empty"><strong>Venta vacía</strong><span>Toca un producto para añadirlo.</span></div>';
  $$('.cart-line').forEach(el=>{const id=el.dataset.cartId;const p=productById(id);el.querySelector('.qty-minus').addEventListener('click',()=>updateCartItem(id,{quantity:Number(state.cart.find(x=>x.product_id===id).quantity)-1}));el.querySelector('.qty-plus').addEventListener('click',()=>{const item=state.cart.find(x=>x.product_id===id);if(item.quantity+1>Number(p.current_stock))return toast('No hay más stock disponible.',true);updateCartItem(id,{quantity:Number(item.quantity)+1})});el.querySelector('.cart-qty').addEventListener('change',e=>{const q=Math.max(0,Number(e.target.value||0));if(q>Number(p.current_stock)){e.target.value=state.cart.find(x=>x.product_id===id).quantity;return toast('Cantidad mayor al stock disponible.',true)}updateCartItem(id,{quantity:q})});el.querySelector('.cart-price').addEventListener('change',e=>updateCartItem(id,{unit_price:Math.max(0,Number(e.target.value||0))}));el.querySelector('.cart-remove').addEventListener('click',()=>{state.cart=state.cart.filter(x=>x.product_id!==id);renderCart()})});
  renderCartTotals();
}
function renderCartTotals(){
  const t=cartTotals();$('#pos-subtotal').textContent=money(t.subtotal,currency);$('#pos-discount-display').textContent=money(t.discount,currency);$('#pos-total').textContent=money(t.total,currency);$('#pos-item-count').textContent=`${state.cart.reduce((a,i)=>a+Number(i.quantity),0)} unidades`;
  $('#mobile-cart-count').textContent=state.cart.reduce((a,i)=>a+Number(i.quantity),0);$('#mobile-cart-total').textContent=money(t.total,currency);updateMobileCartJumpVisibility();
}

function updateMobileCartJumpVisibility(){
  const jump=$('#mobile-cart-jump'),cart=$('#pos-cart');if(!jump||!cart)return;
  if(!isMobile()||!state.cart.length||!$('#view-pos').classList.contains('active')){jump.classList.add('hidden');return}
  const r=cart.getBoundingClientRect();
  const viewportH=window.innerHeight||document.documentElement.clientHeight;
  const visible=r.top<viewportH-120&&r.bottom>120;
  jump.classList.toggle('hidden',visible);
}

function clearCart(confirmFirst=false){if(confirmFirst&&state.cart.length&&!confirm('¿Vaciar la venta actual?'))return;state.cart=[];state.posDiscount=0;state.shownUpsells.clear();$('#pos-sale-discount').value=0;$('#pos-sale-note').value='';hideUpsell();renderCart()}
function learnedUpsell(productId){
  const counts=new Map();for(const tx of completedTransactions()){const ids=[...new Set((tx.sales||[]).map(s=>s.product_id))];if(!ids.includes(productId))continue;ids.filter(id=>id!==productId).forEach(id=>counts.set(id,(counts.get(id)||0)+1))}
  const best=[...counts.entries()].sort((a,b)=>b[1]-a[1])[0];if(!best||best[1]<2)return null;return productById(best[0]);
}
function showUpsellFor(p){
  if(state.shownUpsells.has(p.id))return;state.shownUpsells.add(p.id);
  let related=productById(p.upsell_product_id);let reason='Producto complementario configurado';if(!related){related=learnedUpsell(p.id);reason='Suele venderse junto con este producto'}
  if(!related||Number(related.current_stock)<=0||state.cart.some(i=>i.product_id===related.id))return;
  const box=$('#upsell-suggestion');box.innerHTML=`<div class="upsell-icon">${productIconSVG(related.product_icon)}</div><div class="upsell-copy"><small>Sugerencia · ${esc(reason)}</small><strong>${esc(related.name)}</strong><span>${money(related.suggested_sale_price,currency)}</span></div><button class="secondary" id="accept-upsell">+ Añadir</button><button class="icon-btn" id="dismiss-upsell">×</button>`;box.classList.remove('hidden');
  $('#accept-upsell').addEventListener('click',()=>{addToCart(related.id,1,false);hideUpsell()});$('#dismiss-upsell').addEventListener('click',hideUpsell);clearTimeout(upsellTimer);upsellTimer=setTimeout(hideUpsell,9000);
}
function hideUpsell(){$('#upsell-suggestion').classList.add('hidden');clearTimeout(upsellTimer)}
async function checkoutSale(){
  if(!state.cart.length)return toast('Añade al menos un producto.',true);
  const bad=state.cart.find(i=>i.quantity<=0||i.quantity>Number(productById(i.product_id)?.current_stock||0));if(bad)return toast('Revisa las cantidades y el stock.',true);
  try{
    $('#checkout-btn').disabled=true;$('#checkout-btn').textContent='Registrando…';
    const txId=await db.recordPosSale(state.pharmacy.id,state.cart.map(i=>({product_id:i.product_id,quantity:Number(i.quantity),unit_price:Number(i.unit_price),suggested_price:Number(i.suggested_price||0)})),$('#pos-payment-method').value,state.posDiscount,$('#pos-sale-note').value.trim(),isoToday());
    const paid=cartTotals().total;clearCart(false);await refreshAll();toast(`Venta registrada · ${money(paid,currency)}`);const tx=state.transactions.find(t=>t.id===txId);if(tx)showReceipt(tx);
  }catch(err){toast(migrationFriendlyError(err),true)}finally{$('#checkout-btn').disabled=false;$('#checkout-btn').textContent='Cobrar'}
}

function heldKey(){return `farmacia-ai-held-${state.pharmacy?.id||'none'}`}
function getHeldSales(){try{return JSON.parse(localStorage.getItem(heldKey())||'[]')}catch{return []}}
function setHeldSales(rows){localStorage.setItem(heldKey(),JSON.stringify(rows));updateHeldCount()}
function updateHeldCount(){const n=state.pharmacy?getHeldSales().length:0;$('#held-count').textContent=n}
function suspendSale(){
  if(!state.cart.length)return toast('No hay productos para pausar.',true);
  const held=getHeldSales();held.unshift({id:crypto.randomUUID?.()||String(Date.now()),created_at:new Date().toISOString(),cart:state.cart,discount:state.posDiscount,payment:$('#pos-payment-method').value,note:$('#pos-sale-note').value});setHeldSales(held.slice(0,10));clearCart(false);toast('Venta pausada en este dispositivo')
}
function openHeldSales(){renderHeldSales();$('#held-sales-dialog').showModal()}
function renderHeldSales(){
  const held=getHeldSales();$('#held-sales-list').innerHTML=held.map(h=>{const total=Math.max(0,sum(h.cart,i=>i.quantity*i.unit_price)-Number(h.discount||0));return `<div class="list-item held-row"><div><strong>${fmtDateTime(h.created_at)}</strong><span class="meta">${h.cart.length} productos · ${money(total,currency)}</span></div><div class="row-actions"><button class="secondary resume-held" data-id="${h.id}">Retomar</button><button class="ghost delete-held" data-id="${h.id}">Eliminar</button></div></div>`}).join('')||'<div class="empty">No hay ventas pausadas.</div>';
  $$('.resume-held').forEach(b=>b.addEventListener('click',()=>{const all=getHeldSales(),h=all.find(x=>x.id===b.dataset.id);if(!h)return;if(state.cart.length&&!confirm('La venta actual será reemplazada. ¿Continuar?'))return;state.cart=h.cart.filter(i=>productById(i.product_id));state.posDiscount=Number(h.discount||0);$('#pos-sale-discount').value=state.posDiscount;$('#pos-payment-method').value=h.payment||'Efectivo';$('#pos-sale-note').value=h.note||'';setHeldSales(all.filter(x=>x.id!==h.id));$('#held-sales-dialog').close();renderCart();openView('pos')}));
  $$('.delete-held').forEach(b=>b.addEventListener('click',()=>{setHeldSales(getHeldSales().filter(x=>x.id!==b.dataset.id));renderHeldSales()}));
}
function openSaleHistory(){renderSaleHistoryList();$('#sale-history-dialog').showModal()}
function renderSaleHistoryList(){
  const el=$('#sale-history-list');if(!el)return;el.innerHTML=state.transactions.slice(0,60).map(tx=>`<article class="sale-history-card ${tx.status==='voided'?'voided':''}"><div><strong>${money(tx.total,currency)}</strong><span>${fmtDateTime(tx.created_at||tx.sold_at)} · ${esc(tx.payment_method)}</span><small>${(tx.sales||[]).map(s=>`${num(s.quantity)}× ${esc(s.products?.name||'')}`).join(' · ')||'Sin líneas'}</small></div><div class="sale-history-actions"><span class="badge ${tx.status==='voided'?'danger':''}">${tx.status==='voided'?'Anulada':'Completada'}</span><button class="ghost receipt-btn" data-id="${tx.id}">Recibo</button>${tx.status!=='voided'?`<button class="link-button danger-text void-sale-btn" data-id="${tx.id}">Anular</button>`:''}</div></article>`).join('')||'<div class="empty">Todavía no hay ventas de la nueva facturación.</div>';
  $$('.receipt-btn').forEach(b=>b.addEventListener('click',()=>showReceipt(state.transactions.find(t=>t.id===b.dataset.id))));
  $$('.void-sale-btn').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('¿Anular esta venta? El stock de sus productos será restaurado.'))return;try{await db.voidSale(b.dataset.id);toast('Venta anulada y stock restaurado');await refreshAll();renderSaleHistoryList()}catch(err){toast(migrationFriendlyError(err),true)}}));
}
function showReceipt(tx){if(!tx)return;const lines=(tx.sales||[]).map(s=>`<div class="receipt-line"><span>${num(s.quantity)} × ${esc(s.products?.name||'Producto')}</span><strong>${money(Number(s.quantity)*Number(s.unit_price),currency)}</strong></div>`).join('');$('#receipt-content').innerHTML=`<div class="receipt-brand"><strong>${esc(state.pharmacy.name)}</strong><span>Comprobante interno de venta</span></div><div class="receipt-meta"><span>${fmtDateTime(tx.created_at||tx.sold_at)}</span><span>${esc(tx.payment_method||'')}</span></div>${lines}<div class="receipt-summary"><div><span>Subtotal</span><strong>${money(tx.subtotal,currency)}</strong></div><div><span>Descuento</span><strong>${money(tx.discount,currency)}</strong></div><div class="receipt-total"><span>Total</span><strong>${money(tx.total,currency)}</strong></div></div>${tx.status==='voided'?'<div class="receipt-void">VENTA ANULADA</div>':''}`;$('#receipt-dialog').showModal()}

// ---------- INGRESOS / FACTURAS DE PROVEEDOR ----------
function renderSupplierOptions(){
  const select=$('#invoice-supplier');if(!select)return;const current=select.value;
  const names=state.suppliers.map(s=>s.name).filter(Boolean);
  select.innerHTML='<option value="">Selecciona un proveedor…</option>'+names.map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join('')+'<option value="Otro">Otro</option>';
  if(names.includes(current)||current==='Otro')select.value=current;
  updateInvoiceTotalRequirement();
}
function updateInvoiceTotalRequirement(){
  const supplier=$('#invoice-supplier')?.value||'';const total=$('#invoice-total');const mark=$('#invoice-total-required');
  if(!total)return;const required=supplier!=='Otro';total.required=required;total.min=required?'0.01':'0';if(mark)mark.classList.toggle('hidden',!required);
}
function openSupplierDialog(){
  $('#supplier-name').value='';$('#supplier-dialog').showModal();setTimeout(()=>$('#supplier-name').focus(),50);
}
async function saveSupplier(e){
  e.preventDefault();const name=$('#supplier-name').value.trim();if(!name)return;
  if(name.toLowerCase()==='otro')return toast('“Otro” ya está disponible como opción.',true);
  try{const saved=await db.addSupplier({pharmacy_id:state.pharmacy.id,name});$('#supplier-dialog').close();state.suppliers=await db.suppliers(state.pharmacy.id);renderSupplierOptions();$('#invoice-supplier').value=saved.name;updateInvoiceTotalRequirement();toast('Proveedor añadido')}catch(err){toast(/duplicate|unique/i.test(String(err.message))?'Ese proveedor ya existe.':err.message,true)}
}
function productSearchText(p){return [p.name,p.sku,p.category,p.presentation].filter(Boolean).join(' · ')}
function renderInvoicePickerResults(wrap,query=''){
  const results=wrap.querySelector('.line-product-results');const q=String(query||'').trim().toLowerCase();
  let rows=state.products.filter(p=>!q||[p.name,p.sku,p.category,p.presentation].some(v=>String(v||'').toLowerCase().includes(q))).slice(0,10);
  results.innerHTML=rows.map(p=>`<button type="button" class="invoice-product-result" data-id="${p.id}"><span><strong>${esc(p.name)}</strong><small>${esc(p.sku||'—')} · ${esc(p.category||'Sin categoría')}</small></span><em>Stock ${num(p.current_stock)}</em></button>`).join('')||'<div class="picker-empty">No se encontraron productos.</div>';
  results.classList.remove('hidden');
  results.querySelectorAll('.invoice-product-result').forEach(btn=>btn.addEventListener('mousedown',e=>e.preventDefault()));
  results.querySelectorAll('.invoice-product-result').forEach(btn=>btn.addEventListener('click',()=>selectInvoiceProduct(wrap,btn.dataset.id)));
}
function selectInvoiceProduct(wrap,id){
  const p=productById(id);if(!p)return;wrap.querySelector('.line-product').value=p.id;wrap.querySelector('.line-product-search').value=productSearchText(p);wrap.querySelector('.line-product-results').classList.add('hidden');
}
function addInvoiceLine(values={}){
  const wrap=document.createElement('div');wrap.className='invoice-line';wrap.innerHTML=`<div class="invoice-line-grid"><div class="invoice-product-picker wide-mobile"><label>Buscar producto<input class="line-product-search" autocomplete="off" placeholder="Nombre, SKU o categoría…"></label><input class="line-product" type="hidden" value="${esc(values.product_id||'')}"><div class="line-product-results hidden"></div></div><label>Cantidad<input class="line-qty" type="number" min="0.01" step="0.01" value="${esc(values.quantity||1)}" required></label><label>Costo/u<input class="line-cost" type="number" min="0" step="0.0001" value="${esc(values.cost_unit||'')}" required></label><label>Vence<input class="line-expiry" type="date" value="${esc(values.expiry_date||'')}"></label><button type="button" class="icon-btn remove-line" aria-label="Eliminar línea">×</button></div>`;
  $('#invoice-lines').appendChild(wrap);
  const search=wrap.querySelector('.line-product-search');if(values.product_id){const p=productById(values.product_id);if(p)search.value=productSearchText(p)}
  search.addEventListener('focus',()=>renderInvoicePickerResults(wrap,search.value));
  search.addEventListener('input',()=>{wrap.querySelector('.line-product').value='';renderInvoicePickerResults(wrap,search.value)});
  search.addEventListener('blur',()=>setTimeout(()=>wrap.querySelector('.line-product-results').classList.add('hidden'),150));
  wrap.querySelector('.remove-line').addEventListener('click',()=>{if($$('.invoice-line').length===1){search.value='';wrap.querySelector('.line-product').value='';wrap.querySelector('.line-qty').value=1;wrap.querySelector('.line-cost').value='';wrap.querySelector('.line-expiry').value=''}else wrap.remove()});
}
async function saveInvoice(e){
  e.preventDefault();const supplier=$('#invoice-supplier').value;const totalRaw=$('#invoice-total').value;
  if(!supplier)return toast('Selecciona un proveedor.',true);
  if(supplier!=='Otro'&&(totalRaw===''||Number(totalRaw)<=0))return toast('El total de la factura es obligatorio.',true);
  const lines=$$('.invoice-line').map(line=>({product_id:line.querySelector('.line-product').value,quantity:Number(line.querySelector('.line-qty').value),cost_unit:Number(line.querySelector('.line-cost').value),batch_no:'',expiry_date:line.querySelector('.line-expiry').value||''}));
  if(!lines.length)return toast('Añade al menos un producto a la factura.',true);if(lines.some(x=>!x.product_id||!x.quantity||x.quantity<=0))return toast('Selecciona un producto válido y revisa las cantidades.',true);
  try{await db.createInvoiceWithStock({p_pharmacy_id:state.pharmacy.id,p_supplier:supplier,p_invoice_number:$('#invoice-number').value.trim()||null,p_invoice_date:$('#invoice-date').value,p_total:totalRaw!==''?Number(totalRaw):null,p_file_path:null,p_ocr_text:null,p_lines:lines});$('#invoice-form').reset();$('#invoice-date').value=isoToday();$('#invoice-lines').innerHTML='';renderSupplierOptions();addInvoiceLine();toast('Ingreso guardado e inventario actualizado');await refreshAll()}catch(err){toast(migrationFriendlyError(err),true)}
}
function renderInvoices(){$('#invoice-history').innerHTML=state.invoices.map(i=>`<div class="list-item"><div><strong>${esc(i.supplier)}</strong><span class="meta">${fmtDate(i.invoice_date)} · ${esc(i.invoice_number||'Sin número')}</span></div><span>${i.total==null?'—':money(i.total,currency)}</span></div>`).join('')||'<div class="empty">Todavía no hay facturas de proveedor.</div>'}
function renderExpiry(){$('#expiry-body').innerHTML=state.batches.map(b=>{const d=daysUntil(b.expiry_date),cls=d<0||d<=30?'danger':d<=90?'warn':'';return `<tr><td><strong>${esc(b.products?.name||'')}</strong><span class="muted small">${esc(b.products?.sku||'')}</span></td><td>${esc(b.batch_no||'—')}</td><td>${fmtDate(b.expiry_date)}</td><td><span class="badge ${cls}">${d<0?`Vencido ${Math.abs(d)} d`:`${d} días`}</span></td><td>${num(b.quantity_remaining)}</td><td>${money(Number(b.quantity_remaining)*Number(b.cost_unit),currency)}</td></tr>`}).join('')||'<tr><td colspan="6"><div class="empty">No hay lotes con caducidad registrada.</div></td></tr>'}
function renderPurchases(){const suggestions=computePurchaseSuggestions(state.products,state.sales,cfg.DEFAULT_COVERAGE_DAYS||14);$('#purchase-body').innerHTML=suggestions.map(p=>`<tr><td><strong>${esc(p.name)}</strong></td><td>${num(p.current_stock)}</td><td>${num(p.sold30)}</td><td>${p.targetDays}</td><td>${p.suggested>0?`<span class="badge warn">Pedir ${p.suggested}</span>`:'<span class="badge">OK</span>'}</td><td>${esc(p.preferred_supplier||p.last_supplier||'—')}</td><td>${money(p.last_cost,currency)}</td></tr>`).join('')||'<tr><td colspan="7"><div class="empty">Añade productos para generar sugerencias.</div></td></tr>'}

// ---------- FINANZAS / REPORTES ----------
function renderFinance(){
  const sales30=state.sales.filter(s=>withinDays(s.sold_at,30)),exp30=state.expenses.filter(x=>withinDays(x.expense_date,30));const revenue=revenueForDays(30),cogs=sum(sales30,s=>s.quantity*s.unit_cost_snapshot),expenses=sum(exp30,x=>x.amount),gross=revenue-cogs,net=gross-expenses;
  $('#finance-kpis').innerHTML=[['Ingresos',money(revenue,currency),'Últimos 30 días'],['Costo vendido',money(cogs,currency),'Costo al momento de la venta'],['Gastos',money(expenses,currency),'Últimos 30 días'],['Resultado estimado',money(net,currency),`Margen bruto ${revenue?Math.round(gross/revenue*100):0}%`]].map(x=>`<div class="kpi"><div class="label">${x[0]}</div><div class="value">${x[1]}</div><div class="foot">${x[2]}</div></div>`).join('');
  $('#expenses-list').innerHTML=state.expenses.slice(0,12).map(x=>`<div class="list-item"><div><strong>${esc(x.category)}</strong><span class="meta">${fmtDate(x.expense_date)} · ${esc(x.description||'')}</span></div><span>${money(x.amount,currency)}</span></div>`).join('')||'<div class="empty">Sin gastos registrados.</div>';
}
async function saveExpense(e){e.preventDefault();try{await db.addExpense({pharmacy_id:state.pharmacy.id,expense_date:$('#expense-date').value,category:$('#expense-category').value.trim(),description:$('#expense-description').value.trim()||null,amount:Number($('#expense-amount').value)});e.target.reset();$('#expense-date').value=isoToday();toast('Gasto guardado');await refreshAll()}catch(err){toast(err.message,true)}}
function renderReports(){
  const sales30=state.sales.filter(s=>withinDays(s.sold_at,30)),byProd=new Map();sales30.forEach(s=>byProd.set(s.product_id,(byProd.get(s.product_id)||0)+Number(s.quantity)));const top=[...byProd.entries()].map(([id,q])=>({name:productById(id)?.name||'Producto',q})).sort((a,b)=>b.q-a.q).slice(0,8),max=Math.max(...top.map(x=>x.q),1);
  $('#top-products').innerHTML=top.map(x=>`<div class="bar-row"><div class="bar-head"><span>${esc(x.name)}</span><strong>${num(x.q)}</strong></div><div class="bar-track"><div class="bar-fill" style="width:${Math.max(4,x.q/max*100)}%"></div></div></div>`).join('')||'<div class="empty">No hay ventas en los últimos 30 días.</div>';
  const cats=new Map();state.products.forEach(p=>{const k=p.category||'Sin categoría',v=cats.get(k)||{count:0,stock:0,value:0};v.count++;v.stock+=Number(p.current_stock);v.value+=Number(p.current_stock)*Number(p.avg_cost);cats.set(k,v)});$('#category-summary').innerHTML=[...cats.entries()].sort((a,b)=>b[1].value-a[1].value).map(([k,v])=>`<div class="list-item"><div><strong>${esc(k)}</strong><span class="meta">${v.count} productos · ${num(v.stock)} unidades</span></div><span>${money(v.value,currency)}</span></div>`).join('')||'<div class="empty">Sin categorías.</div>';
}
function exportProducts(){const rows=state.products.map(p=>({SKU:p.sku||'',Producto:p.name,Categoria:p.category||'',Presentacion:p.presentation||'',Tipo_icono:productIconLabel(p.product_icon),Unidad:p.unit,Stock:p.current_stock,Stock_minimo:p.min_stock,Precio_sugerido:p.suggested_sale_price,Ubicacion:shelfLabel(p),Funcion:p.function_info||'',Dosis_indicaciones:p.dosage_info||'',Costo_promedio:p.avg_cost,Ultimo_costo:p.last_cost,Ultimo_proveedor:p.last_supplier||'',Proveedor_preferido:p.preferred_supplier||''}));if(!csvDownload('inventario-farmacia.csv',rows))toast('No hay datos para exportar',true)}
function exportSales(){const rows=state.sales.map(s=>({Fecha:s.sold_at,Venta:s.transaction_id||'LEGACY',Producto:s.products?.name||'',Cantidad:s.quantity,Precio_sugerido:s.suggested_price_snapshot||'',Precio_unitario:s.unit_price,Descuento_linea:s.line_discount||0,Costo_unitario:s.unit_cost_snapshot,Ingreso_linea:Number(s.quantity)*Number(s.unit_price),Costo:Number(s.quantity)*Number(s.unit_cost_snapshot)}));if(!csvDownload('ventas-farmacia.csv',rows))toast('No hay datos para exportar',true)}
async function seedDemo(){if(!confirm('¿Cargar datos ficticios? Solo funciona si todavía no hay productos.'))return;try{await db.seedDemo(state.pharmacy.id);toast('Datos demo cargados');await refreshAll()}catch(err){toast(migrationFriendlyError(err),true)}}

function migrationFriendlyError(err){const msg=String(err?.message||err||'Error');if(/suppliers|assign_product_sku|invoice_total|required|schema cache/i.test(msg))return `${msg}. Ejecuta supabase/migration_v2_3_ingresos.sql en Supabase.`;if(/suggested_sale_price|product_icon|record_pos_sale|sale_transactions/i.test(msg))return `${msg}. Ejecuta primero supabase/migration_v2_pos.sql en Supabase.`;return msg}

// Valores iniciales
$('#invoice-date').value=isoToday();$('#expense-date').value=isoToday();$('#discount-currency').textContent=currency;addInvoiceLine();updateInvoiceTotalRequirement();renderCart();
