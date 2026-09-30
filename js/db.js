export class PharmacyDB{
  constructor(client){this.sb=client}
  async membership(){const {data,error}=await this.sb.from('pharmacy_members').select('pharmacy_id,role,pharmacies(id,name,invite_code)').limit(1).maybeSingle();if(error)throw error;return data}
  async createPharmacy(name){const {data,error}=await this.sb.rpc('create_pharmacy',{p_name:name});if(error)throw error;return data}
  async joinPharmacy(code){const {data,error}=await this.sb.rpc('join_pharmacy',{p_code:code.toUpperCase().trim()});if(error)throw error;return data}
  async products(pharmacyId){const {data,error}=await this.sb.from('products').select('*').eq('pharmacy_id',pharmacyId).eq('active',true).order('name');if(error)throw error;return data||[]}
  async saveProduct(row){if(row.id){const {data,error}=await this.sb.from('products').update(row).eq('id',row.id).select().single();if(error)throw error;return data}else{const {data,error}=await this.sb.from('products').insert(row).select().single();if(error)throw error;return data}}
  async sales(pharmacyId,days=120){const since=new Date();since.setDate(since.getDate()-days);const {data,error}=await this.sb.from('sales').select('*,products(name,category)').eq('pharmacy_id',pharmacyId).gte('sold_at',since.toISOString().slice(0,10)).order('sold_at',{ascending:false});if(error)throw error;return data||[]}
  async recordSale(productId,qty,price,date,notes){const {data,error}=await this.sb.rpc('record_sale',{p_product_id:productId,p_quantity:Number(qty),p_unit_price:Number(price),p_sold_at:date,p_notes:notes||null});if(error)throw error;return data}
  async createInvoice(row){const {data,error}=await this.sb.from('invoices').insert(row).select().single();if(error)throw error;return data}
  async createInvoiceWithStock(args){const {data,error}=await this.sb.rpc('create_invoice_with_stock',args);if(error)throw error;return data}
  async uploadInvoice(pharmacyId,userId,file){if(!file)return null;const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');const path=`${pharmacyId}/${userId}/${Date.now()}-${safe}`;const {error}=await this.sb.storage.from('invoices').upload(path,file,{upsert:false});if(error)throw error;return path}
  async invoices(pharmacyId){const {data,error}=await this.sb.from('invoices').select('*').eq('pharmacy_id',pharmacyId).order('invoice_date',{ascending:false}).limit(30);if(error)throw error;return data||[]}
  async receiveStock(args){const {data,error}=await this.sb.rpc('receive_stock',args);if(error)throw error;return data}
  async expiryBatches(pharmacyId){const {data,error}=await this.sb.from('stock_batches').select('*,products(name,sku)').eq('pharmacy_id',pharmacyId).gt('quantity_remaining',0).not('expiry_date','is',null).order('expiry_date');if(error)throw error;return data||[]}
  async expenses(pharmacyId,days=120){const since=new Date();since.setDate(since.getDate()-days);const {data,error}=await this.sb.from('expenses').select('*').eq('pharmacy_id',pharmacyId).gte('expense_date',since.toISOString().slice(0,10)).order('expense_date',{ascending:false});if(error)throw error;return data||[]}
  async addExpense(row){const {data,error}=await this.sb.from('expenses').insert(row).select().single();if(error)throw error;return data}
  async seedDemo(pharmacyId){const {data,error}=await this.sb.rpc('seed_demo_data',{p_pharmacy_id:pharmacyId});if(error)throw error;return data}
}
