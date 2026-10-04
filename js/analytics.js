export const money = (value, currency = 'C$') => `${currency} ${Number(value || 0).toLocaleString('es-NI', {minimumFractionDigits:2, maximumFractionDigits:2})}`;
export const num = value => Number(value || 0).toLocaleString('es-NI', {maximumFractionDigits:2});
export const isoToday = () => {const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
export function daysUntil(dateString){ if(!dateString) return null; const now=new Date(); now.setHours(0,0,0,0); const d=new Date(`${dateString}T00:00:00`); return Math.ceil((d-now)/86400000); }
export function computePurchaseSuggestions(products, sales, coverageDefault=14){
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-30);
  const byProduct = new Map();
  for(const s of sales){ if(new Date(`${s.sold_at}T00:00:00`) >= cutoff) byProduct.set(s.product_id,(byProduct.get(s.product_id)||0)+Number(s.quantity||0)); }
  return products.map(p=>{
    const sold30=byProduct.get(p.id)||0; const daily=sold30/30; const targetDays=Number(p.target_days||coverageDefault); const desired=Math.max(Number(p.min_stock||0), daily*targetDays); let suggested=Math.max(0,Math.ceil(desired-Number(p.current_stock||0)));
    if(sold30===0 && Number(p.current_stock||0)<=Number(p.min_stock||0)) suggested=Math.max(suggested,Math.ceil(Number(p.min_stock||0)*2-Number(p.current_stock||0)));
    return {...p,sold30,daily,targetDays,suggested};
  }).sort((a,b)=>b.suggested-a.suggested);
}
export function csvDownload(filename, rows){
  if(!rows.length) return false; const headers=Object.keys(rows[0]); const esc=v=>`"${String(typeof v==='string'&&/^[=+@-]/.test(v)?"'"+v:v??'').replaceAll('"','""')}"`; const csv='\ufeff'+[headers.map(esc).join(','),...rows.map(r=>headers.map(h=>esc(r[h])).join(','))].join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url); return true;
}
