export class PharmacyDB{
  constructor(client){this.sb=client}

  // Paginación explícita: nunca confiar en el límite de 1.000 filas del servidor.
  async allRows(build){
    const rows=[];let offset=0;
    for(;;){const {data,error}=await build().range(offset,offset+499);if(error)throw error;
      rows.push(...(data||[]));if((data||[]).length<500)break;offset+=500;}
    return rows;
  }
  async customers(pharmacyId){return this.allRows(()=>this.sb.from('customers').select('*').eq('pharmacy_id',pharmacyId).eq('active',true).order('name').order('id'))}
  async customerSummary(pharmacyId){const {data,error}=await this.sb.rpc('customer_summary',{p_pharmacy_id:pharmacyId});if(error)throw error;return data||[]}
  async saveCustomer(row){const query=row.id?this.sb.from('customers').update({...row,updated_at:new Date().toISOString()}).eq('id',row.id):this.sb.from('customers').insert(row);const {data,error}=await query.select().single();if(error)throw error;return data}
  async categories(pharmacyId){return this.allRows(()=>this.sb.from('product_categories').select('*').eq('pharmacy_id',pharmacyId).order('name').order('id'))}
  async addCategory(row){const {data,error}=await this.sb.from('product_categories').insert(row).select().single();if(error)throw error;return data}
  async adjustments(pharmacyId){const {data,error}=await this.sb.from('stock_adjustments').select('*,products(name)').eq('pharmacy_id',pharmacyId).order('created_at',{ascending:false}).limit(50);if(error)throw error;return data||[]}
  async adjustStock(args){const {data,error}=await this.sb.rpc('adjust_product_stock',args);if(error)throw error;return data}
  async payInvoice(args){const {data,error}=await this.sb.rpc('pay_supplier_invoice',args);if(error)throw error;return data}

  async membership(){
    const {data,error}=await this.sb.from('pharmacy_members').select('pharmacy_id,role,pharmacies(id,name,invite_code)').limit(1).maybeSingle();
    if(error)throw error;return data;
  }
  async createPharmacy(name){const {data,error}=await this.sb.rpc('create_pharmacy',{p_name:name});if(error)throw error;return data}
  async joinPharmacy(code){const {data,error}=await this.sb.rpc('join_pharmacy',{p_code:code.toUpperCase().trim()});if(error)throw error;return data}

  async products(pharmacyId){return this.allRows(()=>this.sb.from('products').select('*').eq('pharmacy_id',pharmacyId).eq('active',true).order('name').order('id'))}
  async saveProduct(row){
    if(row.id){const {data,error}=await this.sb.from('products').update(row).eq('id',row.id).select().single();if(error)throw error;return data}
    const {data,error}=await this.sb.from('products').insert(row).select().single();if(error)throw error;return data;
  }
  async archiveProduct(productId){
    const {data,error}=await this.sb.from('products').update({active:false,updated_at:new Date().toISOString()}).eq('id',productId).select().single();
    if(error)throw error;return data;
  }

  async suppliers(pharmacyId){
    const {data,error}=await this.sb.from('suppliers').select('*').eq('pharmacy_id',pharmacyId).eq('active',true).order('name');
    if(error){if(String(error.message||'').includes('suppliers'))return [];throw error}
    return data||[];
  }
  async addSupplier(row){
    const {data,error}=await this.sb.from('suppliers').insert(row).select().single();if(error)throw error;return data;
  }

  async sales(pharmacyId,days=365){
    const since=new Date();since.setDate(since.getDate()-days);
    const data=await this.allRows(()=>this.sb.from('sales').select('*,products(name,category),sale_transactions(id,status,payment_method,discount,total,created_at)')
      .eq('pharmacy_id',pharmacyId).gte('sold_at',since.toISOString().slice(0,10)).order('sold_at',{ascending:false}).order('id'));
    return data.filter(s=>!s.transaction_id||s.sale_transactions?.status!=='voided');
  }
  async saleTransactions(pharmacyId,days=365,filters={}){
    const since=new Date();since.setDate(since.getDate()-days);
    return this.allRows(()=>{
      let q=this.sb.from('sale_transactions').select('*,sales(id,product_id,quantity,unit_price,unit_cost_snapshot,suggested_price_snapshot,line_discount,product_name_snapshot,category_snapshot,products(name,category))')
        .eq('pharmacy_id',pharmacyId).order('created_at',{ascending:false}).order('id');
      if(!filters.all)q=q.gte('sold_at',filters.from||since.toISOString().slice(0,10));
      if(filters.to)q=q.lte('sold_at',filters.to);
      if(filters.customerId)q=q.eq('customer_id',filters.customerId);
      return q;
    });
  }
  async legacyTransactions(pharmacyId,from,to){
    const sales=await this.allRows(()=>this.sb.from('sales').select('*,products(name,category)').eq('pharmacy_id',pharmacyId).is('transaction_id',null).gte('sold_at',from).lte('sold_at',to).order('sold_at',{ascending:false}).order('id'));
    return sales.map(s=>({id:s.id,invoice_number:'Anterior-'+s.id,sold_at:s.sold_at,created_at:s.created_at,total:Number(s.quantity)*Number(s.unit_price),subtotal:Number(s.quantity)*Number(s.unit_price),discount:0,notes:s.notes,status:'completed',payment_method:'Sin registro',sales:[s],legacy:true}));
  }
  async recordPosSale(pharmacyId,items,paymentMethod,saleDiscount,notes,date,customerId=null,requestId=null){
    const {data,error}=await this.sb.rpc('record_pos_sale_v2_4',{
      p_pharmacy_id:pharmacyId,
      p_items:items,
      p_payment_method:paymentMethod||'Efectivo',
      p_sale_discount:Number(saleDiscount||0),
      p_notes:notes||null,
      p_sold_at:date,
      p_customer_id:customerId, p_request_id:requestId
    });
    if(error)throw error;return data;
  }
  async voidSale(transactionId){const {data,error}=await this.sb.rpc('void_sale_transaction',{p_transaction_id:transactionId});if(error)throw error;return data}

  // Método legado, conservado por compatibilidad con datos/vistas V1.
  async recordSale(productId,qty,price,date,notes){const {data,error}=await this.sb.rpc('record_sale',{p_product_id:productId,p_quantity:Number(qty),p_unit_price:Number(price),p_sold_at:date,p_notes:notes||null});if(error)throw error;return data}

  async createInvoice(row){const {data,error}=await this.sb.from('invoices').insert(row).select().single();if(error)throw error;return data}
  async createInvoiceWithStock(args){const {data,error}=await this.sb.rpc('create_invoice_with_stock_v2_4',args);if(error)throw error;return data}
  async uploadInvoice(pharmacyId,userId,file){
    if(!file)return null;
    const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
    const path=`${pharmacyId}/${userId}/${Date.now()}-${safe}`;
    const {error}=await this.sb.storage.from('invoices').upload(path,file,{upsert:false});if(error)throw error;return path;
  }
  async invoices(pharmacyId){return this.allRows(()=>this.sb.from('invoices').select('*').eq('pharmacy_id',pharmacyId).order('invoice_date',{ascending:false}).order('id'))}
  async receiveStock(args){const {data,error}=await this.sb.rpc('receive_stock',args);if(error)throw error;return data}
  async expiryBatches(pharmacyId){return this.allRows(()=>this.sb.from('stock_batches').select('*,products!inner(name,sku,active)').eq('pharmacy_id',pharmacyId).eq('products.active',true).gt('quantity_remaining',0).not('expiry_date','is',null).order('expiry_date').order('id'))}
  async expenses(pharmacyId,days=365){const since=new Date();since.setDate(since.getDate()-days);return this.allRows(()=>this.sb.from('expenses').select('*').eq('pharmacy_id',pharmacyId).gte('expense_date',since.toISOString().slice(0,10)).order('expense_date',{ascending:false}).order('id'))}
  async addExpense(row){const {data,error}=await this.sb.from('expenses').insert(row).select().single();if(error)throw error;return data}
  async seedDemo(pharmacyId){const {data,error}=await this.sb.rpc('seed_demo_data',{p_pharmacy_id:pharmacyId});if(error)throw error;return data}
}
