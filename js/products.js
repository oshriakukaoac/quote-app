renderNav('products.html');

let settings = DB.defaultSettings();
let lastSupplierSearchResults = [];

/* ---- מילוי מהיר ממאגר הספקים ---- */
function fillFromSupplierItem(item){
  if(!document.getElementById('prodName').value.trim()) document.getElementById('prodName').value = item.description || '';
  document.getElementById('prodSku').value = item.mfrSku || item.supplierSku || '';
  document.getElementById('prodCategory').value = item.category || '';
  document.getElementById('prodSupplier').value = item.supplier || '';
  document.getElementById('prodSupplierPrice').value = item.cost || '';
  document.getElementById('prodCost').value = item.cost || '';
  delete document.getElementById('prodSale').dataset.manual;
  updateCalc();
  document.getElementById('formCard').scrollIntoView({behavior:'smooth'});
  toast('הפרטים מולאו מהספק — בדקו ואשרו לפני שמירה');
}

function renderSupplierSearchResults(items){
  lastSupplierSearchResults = items;
  const holder = document.getElementById('supplierSearchResults');
  if(!items.length){ holder.style.display = 'none'; holder.innerHTML = ''; return; }
  holder.innerHTML = items.map(it => `
    <div style="padding:8px 10px;border-bottom:1px solid var(--c-border);cursor:pointer;" onmousedown="selectSupplierItem('${it.id}')">
      <b>${escapeHtml(it.description)}</b><br>
      <span class="muted">מק"ט: ${escapeHtml(it.supplierSku||it.mfrSku||'')} · ${escapeHtml(it.supplier)} · עלות: ${fmtMoney(it.cost)}</span>
    </div>`).join('');
  holder.style.display = 'block';
}

function selectSupplierItem(id){
  const item = lastSupplierSearchResults.find(x => x.id === id);
  if(!item) return;
  document.getElementById('supplierSearchResults').style.display = 'none';
  document.getElementById('supplierSearch').value = '';
  fillFromSupplierItem(item);
}

document.getElementById('supplierSearch').addEventListener('input', async function(){
  const results = await DB.SupplierPrices.search(this.value, 15);
  renderSupplierSearchResults(results);
});
document.getElementById('supplierSearch').addEventListener('blur', function(){
  setTimeout(() => { document.getElementById('supplierSearchResults').style.display = 'none'; }, 150);
});

/* מילוי אוטומטי כשמגיעים ממסך "מאגר ספקים" עם פריט שנבחר */
(function loadPendingSupplierItem(){
  if(qs('fromSupplier') !== '1') return;
  const raw = sessionStorage.getItem('qs_pending_supplier_item');
  if(!raw) return;
  sessionStorage.removeItem('qs_pending_supplier_item');
  try{
    const item = JSON.parse(raw);
    setTimeout(() => fillFromSupplierItem(item), 0);
  }catch(e){}
})();

function updateCalc(fromSaleField){
  const cost = parseFloat(document.getElementById('prodCost').value) || 0;
  let margin = parseFloat(document.getElementById('prodMargin').value);
  if(isNaN(margin)) margin = settings.defaultMargin;
  const vat = settings.defaultVat;

  const calc = calcPricing(cost, margin, vat);
  document.getElementById('calcCostVat').textContent = fmtMoney(calc.costWithVat);
  document.getElementById('calcSuggested').textContent = fmtMoney(calc.suggestedSaleBeforeVat);
  document.getElementById('calcProfit').textContent = fmtMoney(calc.profitAmount);
  document.getElementById('profitPreviewLabel').textContent = `לאחר ${margin}% רווח`;
  document.getElementById('profitPreview').textContent = fmtMoney(calc.suggestedSaleBeforeVat);
  document.getElementById('profitVatPreview').textContent = `מחיר סופי ללקוח: ${fmtMoney(calc.suggestedSaleWithVat)} כולל מע״מ`;

  // אם המשתמש לא שינה ידנית את מחיר המכירה - נעדכן אותו ואת המחיר הסופי בהתאם
  const saleInput = document.getElementById('prodSale');
  if(!fromSaleField && !saleInput.dataset.manual){
    saleInput.value = calc.suggestedSaleBeforeVat.toFixed(2);
  }
  if(fromSaleField) saleInput.dataset.manual = '1';

  const saleVal = parseFloat(saleInput.value) || 0;
  const saleWithVat = saleVal * (1 + vat/100);
  document.getElementById('calcFinal').textContent = fmtMoney(saleWithVat);
  document.getElementById('saleWithVat').textContent = fmtMoney(saleWithVat);
  document.getElementById('saleVatLabel').textContent = `מחיר סופי כולל מע״מ (${vat}%)`;
}

function applySuggested(){
  const cost = parseFloat(document.getElementById('prodCost').value) || 0;
  let margin = parseFloat(document.getElementById('prodMargin').value);
  if(isNaN(margin)) margin = settings.defaultMargin;
  const calc = calcPricing(cost, margin, settings.defaultVat);
  const saleInput = document.getElementById('prodSale');
  saleInput.value = calc.suggestedSaleBeforeVat.toFixed(2);
  delete saleInput.dataset.manual;
  updateCalc();
}

function resetForm(){
  document.getElementById('prodId').value = '';
  ['prodName','prodSku','prodCategory','prodSupplier','prodSupplierPrice',
   'mktTitle','mktIntro','mktSpecs','mktAudience','mktClosing'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('prodCost').value = '';
  document.getElementById('prodMargin').value = settings.defaultMargin;
  document.getElementById('prodSale').value = '';
  delete document.getElementById('prodSale').dataset.manual;
  document.getElementById('formTitle').textContent = 'מוצר / שירות חדש';
  updateCalc();
}

async function saveProduct(){
  const name = document.getElementById('prodName').value.trim();
  if(!name){ toast('יש להזין שם מוצר'); return; }
  const p = {
    id: document.getElementById('prodId').value || null,
    name,
    sku: document.getElementById('prodSku').value.trim(),
    category: document.getElementById('prodCategory').value.trim(),
    supplier: document.getElementById('prodSupplier').value.trim(),
    supplierPrice: parseFloat(document.getElementById('prodSupplierPrice').value) || 0,
    costPrice: parseFloat(document.getElementById('prodCost').value) || 0,
    marginPercent: parseFloat(document.getElementById('prodMargin').value) || 0,
    salePrice: parseFloat(document.getElementById('prodSale').value) || 0,
    mkt: {
      title: document.getElementById('mktTitle').value.trim(),
      intro: document.getElementById('mktIntro').value.trim(),
      specs: document.getElementById('mktSpecs').value.split('\n').map(s => s.trim()).filter(Boolean),
      audience: document.getElementById('mktAudience').value.trim(),
      closing: document.getElementById('mktClosing').value.trim()
    }
  };
  if(!p.id) delete p.id;
  else{
    // צריך לשמר את favorite הקיים כי הטופס לא עורך אותו
    const existing = await DB.Products.get(p.id);
    p.favorite = existing ? existing.favorite : false;
  }
  await DB.Products.save(p);
  toast('המוצר נשמר בהצלחה');
  resetForm();
  renderList();
}

async function editProduct(id){
  const p = await DB.Products.get(id);
  if(!p) return;
  document.getElementById('prodId').value = p.id;
  document.getElementById('prodName').value = p.name || '';
  document.getElementById('prodSku').value = p.sku || '';
  document.getElementById('prodCategory').value = p.category || '';
  document.getElementById('prodSupplier').value = p.supplier || '';
  document.getElementById('prodSupplierPrice').value = p.supplierPrice || '';
  document.getElementById('prodCost').value = p.costPrice || '';
  document.getElementById('prodMargin').value = p.marginPercent ?? settings.defaultMargin;
  document.getElementById('prodSale').value = p.salePrice || '';
  document.getElementById('prodSale').dataset.manual = '1';
  const mkt = p.mkt || {};
  document.getElementById('mktTitle').value = mkt.title || '';
  document.getElementById('mktIntro').value = mkt.intro || '';
  document.getElementById('mktSpecs').value = (mkt.specs || []).join('\n');
  document.getElementById('mktAudience').value = mkt.audience || '';
  document.getElementById('mktClosing').value = mkt.closing || '';
  document.getElementById('formTitle').textContent = 'עריכת מוצר';
  updateCalc();
  document.getElementById('formCard').scrollIntoView({behavior:'smooth'});
}

async function deleteProduct(id){
  if(!confirmAction('למחוק את המוצר מהקטלוג?')) return;
  await DB.Products.remove(id);
  renderList();
}

async function renderList(){
  const list = await DB.Products.all();
  const tbody = document.getElementById('prodBody');
  if(!list.length){
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7">אין עדיין מוצרים בקטלוג. הוסיפו מוצר בטופס למעלה.</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(p => `
    <tr>
      <td class="text-center"><span style="cursor:pointer;font-size:1.1rem;" title="${p.favorite ? 'הסרה ממועדפים' : 'הוספה למועדפים (קיצור דרך בהצעת מחיר)'}" onclick="toggleFavorite('${p.id}')">${p.favorite ? '⭐' : '☆'}</span></td>
      <td>${escapeHtml(p.name)}</td>
      <td>${escapeHtml(p.sku||'')}</td>
      <td>${fmtMoney(p.costPrice)}</td>
      <td>${p.marginPercent ?? 0}%</td>
      <td>${fmtMoney(p.salePrice)}</td>
      <td>${fmtMoney((p.salePrice||0) * (1 + settings.defaultVat/100))}</td>
      <td class="text-left">
        <button class="btn sm" onclick="editProduct('${p.id}')">עריכה</button>
        <button class="btn sm danger" onclick="deleteProduct('${p.id}')">מחיקה</button>
      </td>
    </tr>`).join('');
}

async function toggleFavorite(id){
  const p = await DB.Products.get(id);
  if(!p) return;
  p.favorite = !p.favorite;
  await DB.Products.save(p);
  renderList();
}

async function init(){
  settings = await DB.getSettings();
  document.getElementById('prodMargin').value = settings.defaultMargin;
  updateCalc();
  await renderList();
}
init();
