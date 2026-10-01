export class PharmacyDB{
  constructor(client){this.sb=client}

  async membership(){
    const {data,error}=await this.sb.from('pharmacy_members').select('pharmacy_id,role,pharmacies(id,name,invite_code)').limit(1).maybeSingle();
    if(error)throw error;return data;
  }
  async createPharmacy(name){const {data,error}=await this.sb.rpc('create_pharmacy',{p_name:name});if(error)throw error;return data}
  async joinPharmacy(code){const {data,error}=await this.sb.rpc('join_pharmacy',{p_code:code.toUpperCase().trim()});if(error)throw error;return data}

  async products(pharmacyId){
    const {data,error}=await this.sb.from('products').select('*').eq('pharmacy_id',pharmacyId).eq('active',true).order('name');
    if(error)throw error;return data||[];
  }
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

  async sales(pharmacyId,days=180){
    const since=new Date();since.setDate(since.getDate()-days);
    const {data,error}=await this.sb.from('sales')
      .select('*,products(name,category),sale_transactions(id,status,payment_method,discount,total,created_at)')
      .eq('pharmacy_id',pharmacyId).gte('sold_at',since.toISOString().slice(0,10)).order('sold_at',{ascending:false});
    if(error)throw error;
    return (data||[]).filter(s=>!s.transaction_id || s.sale_transactions?.status!=='voided');
  }
  async saleTransactions(pharmacyId,days=90){
    const since=new Date();since.setDate(since.getDate()-days);
    const {data,error}=await this.sb.from('sale_transactions')
      .select('*,sales(id,product_id,quantity,unit_price,unit_cost_snapshot,suggested_price_snapshot,line_discount,products(name,category))')
      .eq('pharmacy_id',pharmacyId).gte('sold_at',since.toISOString().slice(0,10)).order('created_at',{ascending:false}).limit(120);
    if(error){
      // Permite que el frontend muestre una instrucción clara si la migración V2 todavía no fue ejecutada.
      if(String(error.message||'').includes('sale_transactions'))return [];
      throw error;
    }
    return data||[];
  }
  async recordPosSale(pharmacyId,items,paymentMethod,saleDiscount,notes,date){
    const {data,error}=await this.sb.rpc('record_pos_sale',{
      p_pharmacy_id:pharmacyId,
      p_items:items,
      p_payment_method:paymentMethod||'Efectivo',
      p_sale_discount:Number(saleDiscount||0),
      p_notes:notes||null,
      p_sold_at:date
    });
    if(error)throw error;return data;
  }
  async voidSale(transactionId){const {data,error}=await this.sb.rpc('void_sale_transaction',{p_transaction_id:transactionId});if(error)throw error;return data}

  // Método legado, conservado por compatibilidad con datos/vistas V1.
  async recordSale(productId,qty,price,date,notes){const {data,error}=await this.sb.rpc('record_sale',{p_product_id:productId,p_quantity:Number(qty),p_unit_price:Number(price),p_sold_at:date,p_notes:notes||null});if(error)throw error;return data}

  async createInvoice(row){const {data,error}=await this.sb.from('invoices').insert(row).select().single();if(error)throw error;return data}
  async createInvoiceWithStock(args){const {data,error}=await this.sb.rpc('create_invoice_with_stock',args);if(error)throw error;return data}
  async uploadInvoice(pharmacyId,userId,file){
    if(!file)return null;
    const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
    const path=`${pharmacyId}/${userId}/${Date.now()}-${safe}`;
    const {error}=await this.sb.storage.from('invoices').upload(path,file,{upsert:false});if(error)throw error;return path;
  }
  async invoices(pharmacyId){const {data,error}=await this.sb.from('invoices').select('*').eq('pharmacy_id',pharmacyId).order('invoice_date',{ascending:false}).limit(30);if(error)throw error;return data||[]}
  async receiveStock(args){const {data,error}=await this.sb.rpc('receive_stock',args);if(error)throw error;return data}
  async expiryBatches(pharmacyId){const {data,error}=await this.sb.from('stock_batches').select('*,products(name,sku)').eq('pharmacy_id',pharmacyId).gt('quantity_remaining',0).not('expiry_date','is',null).order('expiry_date');if(error)throw error;return data||[]}
  async expenses(pharmacyId,days=180){const since=new Date();since.setDate(since.getDate()-days);const {data,error}=await this.sb.from('expenses').select('*').eq('pharmacy_id',pharmacyId).gte('expense_date',since.toISOString().slice(0,10)).order('expense_date',{ascending:false});if(error)throw error;return data||[]}
  async addExpense(row){const {data,error}=await this.sb.from('expenses').insert(row).select().single();if(error)throw error;return data}
  async seedDemo(pharmacyId){const {data,error}=await this.sb.rpc('seed_demo_data',{p_pharmacy_id:pharmacyId});if(error)throw error;return data}
}
