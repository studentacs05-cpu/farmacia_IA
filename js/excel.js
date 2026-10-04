// Exportación XLSX real, sin CDN ni dependencia en tiempo de ejecución.
// Texto como inlineStr: nombres/notas que comienzan con '=' no se ejecutan como fórmulas.
const enc=new TextEncoder();
const xml=value=>String(value??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function colName(n){let name='';for(n++;n;n=Math.floor((n-1)/26))name=String.fromCharCode(65+(n-1)%26)+name;return name}
const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0});
function crc32(data){let crc=0xffffffff;for(const b of data)crc=crcTable[(crc^b)&255]^(crc>>>8);return (crc^0xffffffff)>>>0}
function zip(files){
  const pieces=[],central=[];let offset=0;
  for(const [path,content] of files){
    const name=enc.encode(path),bytes=enc.encode(content),crc=crc32(bytes);
    const local=new Uint8Array(30+name.length),view=new DataView(local.buffer);
    view.setUint32(0,0x04034b50,true);view.setUint16(4,20,true);view.setUint16(6,0x800,true);view.setUint16(12,33,true);view.setUint32(14,crc,true);view.setUint32(18,bytes.length,true);view.setUint32(22,bytes.length,true);view.setUint16(26,name.length,true);local.set(name,30);
    const header=new Uint8Array(46+name.length),cv=new DataView(header.buffer);
    cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x800,true);cv.setUint16(14,33,true);cv.setUint32(16,crc,true);cv.setUint32(20,bytes.length,true);cv.setUint32(24,bytes.length,true);cv.setUint16(28,name.length,true);cv.setUint32(42,offset,true);header.set(name,46);
    pieces.push(local,bytes);central.push(header);offset+=local.length+bytes.length;
  }
  const centralSize=central.reduce((n,h)=>n+h.length,0),end=new Uint8Array(22),ev=new DataView(end.buffer);
  ev.setUint32(0,0x06054b50,true);ev.setUint16(8,files.length,true);ev.setUint16(10,files.length,true);ev.setUint32(12,centralSize,true);ev.setUint32(16,offset,true);
  return new Blob([...pieces,...central,end],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
export function buildXlsx(sheets){
  const head='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const files=[];const names=sheets.map((s,i)=>({name:String(s.name||`Hoja ${i+1}`).replace(/[\[\]:*?\/\\]/g,'').slice(0,31),id:i+1,rows:s.rows}));
  files.push(['[Content_Types].xml',head+`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${names.map(s=>`<Override PartName="/xl/worksheets/sheet${s.id}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`]);
  files.push(['_rels/.rels',head+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>']);
  files.push(['xl/workbook.xml',head+`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map(s=>`<sheet name="${xml(s.name)}" sheetId="${s.id}" r:id="rId${s.id}"/>`).join('')}</sheets></workbook>`]);
  files.push(['xl/_rels/workbook.xml.rels',head+`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map(s=>`<Relationship Id="rId${s.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${s.id}.xml"/>`).join('')}<Relationship Id="rStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`]);
  files.push(['xl/styles.xml',head+'<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF164C7E"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>']);
  for(const s of names){
    const headers=Object.keys(s.rows[0]||{}),rows=[headers,...s.rows.map(r=>headers.map(h=>r[h]))];
    if(rows.length>1048576)throw new Error('El período excede el límite de filas de Excel. Selecciona uno más corto.');
    const cells=rows.map((row,r)=>`<row r="${r+1}">${row.map((v,c)=>{const ref=colName(c)+(r+1);return typeof v==='number'&&Number.isFinite(v)?`<c r="${ref}" s="${r===0?1:2}"><v>${v}</v></c>`:`<c r="${ref}" t="inlineStr" s="${r===0?1:0}"><is><t xml:space="preserve">${xml(v)}</t></is></c>`}).join('')}</row>`).join('');
    files.push([`xl/worksheets/sheet${s.id}.xml`,head+`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${headers.map((h,c)=>`<col min="${c+1}" max="${c+1}" width="${/Factura|Producto|Nota|Fecha_hora/.test(h)?42:20}" customWidth="1"/>`).join('')}</cols><sheetData>${cells}</sheetData>${headers.length?`<autoFilter ref="A1:${colName(headers.length-1)}${rows.length}"/>`:''}</worksheet>`]);
  }
  return zip(files);
}
export function xlsxDownload(filename,sheets){const blob=buildXlsx(sheets),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)}
