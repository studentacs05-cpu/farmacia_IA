export async function extractInvoiceText(file, onProgress=()=>{}){
  if(!file) throw new Error('Selecciona una imagen primero.');
  if(file.type === 'application/pdf') throw new Error('El OCR del demo procesa imágenes. Puedes subir el PDF y rellenar los campos manualmente.');
  if(!file.type.startsWith('image/')) throw new Error('Formato no compatible con OCR.');
  if(!window.Tesseract) throw new Error('No se pudo cargar el motor OCR. Comprueba tu conexión.');
  const result = await window.Tesseract.recognize(file, 'spa+eng', {logger:m=>{ if(m.status==='recognizing text') onProgress(Math.round((m.progress||0)*100)); }});
  return result?.data?.text || '';
}
