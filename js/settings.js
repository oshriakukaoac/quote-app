renderNav('settings.html');

async function load(){
  const s = await DB.getSettings();
  document.getElementById('companyName').value = s.companyName || '';
  document.getElementById('taxId').value = s.taxId || '';
  document.getElementById('address').value = s.address || '';
  document.getElementById('phone').value = s.phone || '';
  document.getElementById('email').value = s.email || '';
  document.getElementById('website').value = s.website || '';
  document.getElementById('tagline').value = s.tagline || '';
  document.getElementById('logoText').value = s.logoText || 'OAC';
  document.getElementById('defaultVat').value = s.defaultVat;
  document.getElementById('defaultMargin').value = s.defaultMargin;
  document.getElementById('nextQuoteNumber').value = s.nextQuoteNumber;
  document.getElementById('finbotApiKey').value = s.finbotApiKey || '';
}

async function save(){
  const s = {
    companyName: document.getElementById('companyName').value.trim(),
    taxId: document.getElementById('taxId').value.trim(),
    address: document.getElementById('address').value.trim(),
    phone: document.getElementById('phone').value.trim(),
    email: document.getElementById('email').value.trim(),
    website: document.getElementById('website').value.trim(),
    tagline: document.getElementById('tagline').value.trim(),
    logoText: document.getElementById('logoText').value.trim() || 'OAC',
    defaultVat: parseFloat(document.getElementById('defaultVat').value) || 0,
    defaultMargin: parseFloat(document.getElementById('defaultMargin').value) || 0,
    nextQuoteNumber: parseInt(document.getElementById('nextQuoteNumber').value) || 1,
    // מנקה תווים סמויים (כמו סימני כיווניות RLM/LRM) שלפעמים נדבקים בטעות עם המפתח -
    // הם גורמים לכשל שקט כששולחים את המפתח כ-header ב-HTTP (מותר רק ASCII שם)
    finbotApiKey: document.getElementById('finbotApiKey').value.trim().replace(/[^\x20-\x7E]/g, '')
  };
  await DB.saveSettings(s);
  toast('ההגדרות נשמרו בהצלחה');
}

async function exportBackup(){
  const data = await DB.exportAll();
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g, '-');
  a.href = url;
  a.download = `גיבוי-הצעות-מחיר-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  document.getElementById('backupStatus').textContent = `יוצא קובץ גיבוי: ${data.customers.length} לקוחות, ${data.products.length} מוצרים, ${data.quotes.length} הצעות, ${data.supplierPrices.length} פריטי ספקים.`;
}

function importBackup(file){
  if(!file) return;
  if(!confirmAction('ייבוא גיבוי יוסיף את הנתונים שבקובץ לנתונים הקיימים כאן בענן (לא ימחק כלום קיים). להמשיך?')) return;
  const reader = new FileReader();
  reader.onload = async function(){
    try{
      const data = JSON.parse(reader.result);
      document.getElementById('backupStatus').textContent = 'מייבא... זה יכול לקחת כמה רגעים אם יש הרבה נתונים.';
      await DB.importAll(data);
      document.getElementById('backupStatus').textContent = `שוחזר בהצלחה: ${(data.customers||[]).length} לקוחות, ${(data.products||[]).length} מוצרים, ${(data.quotes||[]).length} הצעות, ${(data.supplierPrices||[]).length} פריטי ספקים.`;
      toast('הנתונים שוחזרו בהצלחה');
      load();
    }catch(e){
      document.getElementById('backupStatus').textContent = 'שגיאה: קובץ הגיבוי לא תקין או שהייבוא נכשל (' + e.message + ')';
    }
  };
  reader.readAsText(file, 'utf-8');
}

async function resetAll(){
  if(!confirmAction('פעולה זו תמחק לצמיתות את כל הלקוחות, המוצרים, ההצעות ומחירוני הספקים בענן. לא ניתן לבטל. להמשיך?')) return;
  await DB.deleteAllData();
  toast('הנתונים אופסו');
  load();
}

load();
