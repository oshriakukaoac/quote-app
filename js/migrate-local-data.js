renderNav('settings.html');

const OLD_KEYS = {
  customers: 'qs_customers',
  products: 'qs_products',
  quotes: 'qs_quotes',
  supplierPrices: 'qs_supplier_prices',
  settings: 'qs_settings'
};

function readOld(key){
  try{
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}

let oldData = null;

function scan(){
  const customers = readOld(OLD_KEYS.customers) || [];
  const products = readOld(OLD_KEYS.products) || [];
  const quotes = readOld(OLD_KEYS.quotes) || [];
  const supplierPrices = readOld(OLD_KEYS.supplierPrices) || [];
  const settings = readOld(OLD_KEYS.settings);
  oldData = { customers, products, quotes, supplierPrices, settings };

  const total = customers.length + products.length + quotes.length + supplierPrices.length;
  const box = document.getElementById('scanResult');
  if(total === 0 && !settings){
    box.textContent = 'לא נמצאו כאן נתונים ישנים מהגרסה המקומית (ייתכן שכבר יובאו, או שזה לא הדפדפן/הכתובת שבה עבדתם).';
    return;
  }
  box.innerHTML = `נמצאו נתונים ישנים בדפדפן הזה: <b>${customers.length}</b> לקוחות, <b>${products.length}</b> מוצרים, <b>${quotes.length}</b> הצעות מחיר, <b>${supplierPrices.length}</b> פריטי ספקים${settings ? ', והגדרות עסק' : ''}.`;
  document.getElementById('importBtn').disabled = false;
}

async function runMigration(){
  if(!oldData) return;
  if(!confirmAction('להעביר את כל הנתונים האלה לענן? הפעולה תוסיף אותם לנתונים הקיימים בענן (לא תמחק כלום).')) return;
  const btn = document.getElementById('importBtn');
  btn.disabled = true;
  btn.textContent = 'מעביר...';
  const status = document.getElementById('migrateStatus');
  try{
    status.textContent = 'מעביר נתונים לענן... זה יכול לקחת כמה רגעים אם יש הרבה נתונים (למשל מחירון ספקים גדול).';
    await DB.importAll(oldData);
    status.textContent = '✓ ההעברה הושלמה בהצלחה! ניתן לעבור לדשבורד ולבדוק שהכל תקין.';
    btn.textContent = 'הועבר בהצלחה';
    toast('הנתונים הועברו לענן בהצלחה');
  }catch(e){
    status.textContent = 'שגיאה בהעברה: ' + e.message;
    btn.disabled = false;
    btn.textContent = 'העברת הנתונים לענן';
  }
}

scan();
