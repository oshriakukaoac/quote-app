renderNav('supplier-import.html');

const FIELD_DEFS = [
  { key: 'sku', label: 'מק"ט (מפתח יבוא) *', required: true },
  { key: 'description', label: 'תיאור / שם מוצר *', required: true },
  { key: 'price', label: 'מחיר עלות *', required: true },
  { key: 'mfrSku', label: 'מק"ט יצרן (אופציונלי)', required: false },
  { key: 'category', label: 'קטגוריה (אופציונלי)', required: false },
  { key: 'manufacturer', label: 'יצרן (אופציונלי)', required: false },
  { key: 'availability', label: 'זמינות (אופציונלי)', required: false },
  { key: 'image', label: 'תמונה (אופציונלי)', required: false }
];

let parsedHeaders = [];
let parsedRows = [];
let currentMap = {};

document.getElementById('fileInput').addEventListener('change', function(){
  const file = this.files[0];
  if(file) handleFile(file);
});

async function handleFile(file){
  const buffer = await file.arrayBuffer();
  const text = decodeFileBuffer(buffer);
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const delimiter = detectDelimiter(firstLine);
  const rows = parseDelimitedText(text, delimiter);
  if(!rows.length){ toast('לא נמצאו שורות בקובץ'); return; }

  parsedHeaders = rows[0];
  parsedRows = rows.slice(1);
  currentMap = guessColumnMap(parsedHeaders);

  if(!document.getElementById('supplierName').value.trim()){
    const guess = file.name.match(/mor[-_]?levi/i) ? 'מור לוי' : file.name.match(/c-?data/i) ? 'CDATA' : '';
    if(guess) document.getElementById('supplierName').value = guess;
  }

  renderMappingUI();
  document.getElementById('mappingArea').style.display = '';
  document.getElementById('rowCountLabel').textContent = parsedRows.length.toLocaleString('he-IL');
}

/* טעינה אוטומטית של הקובץ העדכני ביותר מתיקיית Mor-Levi (דרך שרת ה-EXE) + ייבוא מלא */
async function loadLatestFromFolder(folder){
  folder = folder || 'Mor-Levi';
  try{
    const resp = await fetch('/api/latest-file?folder=' + encodeURIComponent(folder));
    if(!resp.ok){
      const err = await resp.json().catch(() => ({message: resp.statusText}));
      toast('שגיאה: ' + (err.message || 'לא נמצא קובץ'));
      return;
    }
    const nameHeader = resp.headers.get('X-File-Name');
    const filename = nameHeader ? decodeURIComponent(nameHeader) : (folder + '.csv');
    const blob = await resp.blob();
    const file = new File([blob], filename);
    await handleFile(file);
    if(!document.getElementById('supplierName').value.trim()) document.getElementById('supplierName').value = 'מור לוי';
    await doImport();
    toast('נטען וייובא אוטומטית: ' + filename);
  }catch(e){
    toast('שגיאה בטעינה אוטומטית: ' + e.message + ' (ודאו שהתוכנה רצה דרך מערכת הצעות מחיר.exe)');
  }
}

function renderMappingUI(){
  const holder = document.getElementById('mappingFields');
  holder.innerHTML = FIELD_DEFS.map(f => {
    const options = ['<option value="-1">— ללא —</option>'].concat(
      parsedHeaders.map((h, idx) => `<option value="${idx}" ${currentMap[f.key] === idx ? 'selected' : ''}>${escapeHtml(h)}</option>`)
    ).join('');
    return `<div class="field"><label>${f.label}</label><select data-field="${f.key}" onchange="onMapChange('${f.key}', this.value)">${options}</select></div>`;
  }).join('');
  renderPreview();
}

function onMapChange(field, value){
  const v = parseInt(value);
  if(v === -1) delete currentMap[field]; else currentMap[field] = v;
  renderPreview();
}

function rowToItem(row){
  const get = key => (currentMap[key] !== undefined ? (row[currentMap[key]] || '').trim() : '');
  return {
    supplierSku: get('sku'),
    mfrSku: get('mfrSku'),
    description: get('description'),
    cost: parsePriceString(get('price')),
    category: get('category'),
    manufacturer: get('manufacturer'),
    availability: get('availability'),
    imageUrl: get('image')
  };
}

function renderPreview(){
  const fieldsOrder = ['sku','description','price','mfrSku','category','manufacturer','availability','image'];
  document.getElementById('previewHead').innerHTML = '<tr>' + FIELD_DEFS.map(f => `<th>${f.label.replace(' *','')}</th>`).join('') + '</tr>';
  const sample = parsedRows.slice(0, 10).map(rowToItem);
  document.getElementById('previewBody').innerHTML = sample.map(it => `
    <tr>
      <td>${escapeHtml(it.supplierSku)}</td>
      <td>${escapeHtml(it.description).slice(0,60)}</td>
      <td>${fmtMoney(it.cost)}</td>
      <td>${escapeHtml(it.mfrSku)}</td>
      <td>${escapeHtml(it.category)}</td>
      <td>${escapeHtml(it.manufacturer)}</td>
      <td>${escapeHtml(it.availability)}</td>
      <td>${it.imageUrl ? '🖼' : ''}</td>
    </tr>`).join('') || `<tr class="empty-row"><td colspan="8">אין נתונים להצגה</td></tr>`;
}

async function doImport(){
  const supplier = document.getElementById('supplierName').value.trim();
  if(!supplier){ toast('יש להזין שם ספק'); return; }
  if(currentMap.sku === undefined || currentMap.description === undefined || currentMap.price === undefined){
    toast('יש להשלים התאמה לפחות למק"ט, תיאור ומחיר'); return;
  }
  const items = parsedRows.map(rowToItem).filter(it => it.supplierSku || it.description);
  toast(`מייבא ${items.length.toLocaleString('he-IL')} פריטים... זה יכול לקחת כמה שניות`);
  const count = await DB.SupplierPrices.replaceForSupplier(supplier, items);
  toast(`יובאו ${count.toLocaleString('he-IL')} פריטים ממחירון "${supplier}"`);
  document.getElementById('mappingArea').style.display = 'none';
  document.getElementById('fileInput').value = '';
  await populateSupplierFilter();
  await renderResults();
}

async function clearSupplier(){
  const supplier = document.getElementById('supplierFilter').value;
  if(!supplier){ toast('בחרו ספק למחיקה'); return; }
  if(!confirmAction(`למחוק את כל מחירון "${supplier}" מהמאגר?`)) return;
  await DB.SupplierPrices.clearSupplier(supplier);
  await populateSupplierFilter();
  await renderResults();
}

async function populateSupplierFilter(){
  const sel = document.getElementById('supplierFilter');
  const suppliers = await DB.SupplierPrices.suppliers();
  const current = sel.value;
  sel.innerHTML = '<option value="">כל הספקים</option>' + suppliers.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  if(suppliers.includes(current)) sel.value = current;
}

async function renderResults(){
  const supplier = document.getElementById('supplierFilter').value;
  const query = document.getElementById('searchBox').value.trim().toLowerCase();
  let all = supplier ? await DB.SupplierPrices.bySupplier(supplier) : await DB.SupplierPrices.all();
  const total = all.length;
  let shown;
  if(query){
    shown = all.filter(it => `${it.supplierSku} ${it.mfrSku} ${it.description}`.toLowerCase().includes(query)).slice(0, 200);
    document.getElementById('resultsInfo').textContent = `נמצאו ${shown.length} תוצאות (מתוך ${total.toLocaleString('he-IL')} במאגר)`;
  } else {
    shown = all.slice(0, 50);
    document.getElementById('resultsInfo').textContent = total ? `מוצגים 50 הראשונים מתוך ${total.toLocaleString('he-IL')} — הקלידו לחיפוש ממוקד` : 'אין עדיין נתוני ספקים. ייבאו מחירון למעלה.';
  }
  lastRenderedResults = shown;
  document.getElementById('resultsBody').innerHTML = shown.map(it => `
    <tr>
      <td>${escapeHtml(it.supplierSku)}</td>
      <td>${escapeHtml(it.description)}</td>
      <td>${escapeHtml(it.manufacturer||'')}</td>
      <td>${escapeHtml(it.category||'')}</td>
      <td>${escapeHtml((it.availability||'').trim())}</td>
      <td>${fmtMoney(it.cost)}</td>
      <td class="text-left"><button class="btn sm primary" onclick="addToCatalog('${it.id}')">הוסף לקטלוג</button></td>
    </tr>`).join('') || `<tr class="empty-row"><td colspan="7">אין תוצאות</td></tr>`;
}

let lastRenderedResults = [];
function addToCatalog(id){
  const item = lastRenderedResults.find(x => x.id === id);
  if(!item) return;
  sessionStorage.setItem('qs_pending_supplier_item', JSON.stringify(item));
  location.href = 'products.html?fromSupplier=1';
}

document.getElementById('searchBox').addEventListener('input', renderResults);
document.getElementById('supplierFilter').addEventListener('change', renderResults);

populateSupplierFilter();
renderResults();
