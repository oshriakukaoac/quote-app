renderNav('quote.html');

let settings = DB.defaultSettings();
const editId = qs('id');
let quote = null;
let notesTouched = false;
let lastSupplierResults = [];

async function populateCustomerSelect(){
  document.getElementById('customerSelect').value = quote.customerId || '';
  if(quote.customerId){
    const c = await DB.Customers.get(quote.customerId);
    document.getElementById('customerSearchInput').value = c ? c.name : '';
  }
}

function renderCustomerSearchResults(items){
  const holder = document.getElementById('customerSearchResults');
  if(!items.length){ holder.style.display = 'none'; holder.innerHTML = ''; return; }
  holder.innerHTML = items.map(c => `
    <div style="padding:8px 10px;border-bottom:1px solid var(--c-border);cursor:pointer;" onmousedown="selectCustomer('${c.id}')">
      <b>${escapeHtml(c.name)}</b><br>
      <span class="muted">${escapeHtml(c.phone||c.email||c.taxId||'')}</span>
    </div>`).join('');
  holder.style.display = 'block';
}

async function selectCustomer(customerId){
  const c = await DB.Customers.get(customerId);
  if(!c) return;
  document.getElementById('customerSelect').value = c.id;
  document.getElementById('customerSearchInput').value = c.name;
  document.getElementById('customerSearchResults').style.display = 'none';
}

document.getElementById('customerSearchInput').addEventListener('input', async function(){
  const q = this.value.trim().toLowerCase();
  document.getElementById('customerSelect').value = ''; // חיפוש חדש מבטל בחירה קודמת עד שבוחרים תוצאה
  if(!q){ renderCustomerSearchResults([]); return; }
  const all = await DB.Customers.all();
  const matches = all
    .filter(c => `${c.name} ${c.phone||''} ${c.email||''} ${c.taxId||''}`.toLowerCase().includes(q))
    .slice(0, 15);
  renderCustomerSearchResults(matches);
});
document.getElementById('customerSearchInput').addEventListener('focus', function(){
  if(this.value.trim()) this.dispatchEvent(new Event('input'));
});
document.getElementById('customerSearchInput').addEventListener('blur', function(){
  setTimeout(() => { document.getElementById('customerSearchResults').style.display = 'none'; }, 150);
});

/* ---- חיפוש והוספה מהקטלוג ---- */
function renderCatalogSearchResults(items){
  const holder = document.getElementById('catalogSearchResults');
  if(!items.length){ holder.style.display = 'none'; holder.innerHTML = ''; return; }
  holder.innerHTML = items.map(p => `
    <div style="padding:8px 10px;border-bottom:1px solid var(--c-border);cursor:pointer;" onmousedown="addCatalogProduct('${p.id}')">
      <b>${p.favorite ? '⭐ ' : ''}${escapeHtml(p.name)}</b><br>
      <span class="muted">${escapeHtml(p.sku||'')} · ${fmtMoney(p.salePrice)}</span>
    </div>`).join('');
  holder.style.display = 'block';
}

document.getElementById('catalogSearchInput').addEventListener('input', async function(){
  const q = this.value.trim().toLowerCase();
  if(!q){ renderCatalogSearchResults([]); return; }
  const all = await DB.Products.all();
  const matches = all
    .filter(p => `${p.name} ${p.sku||''}`.toLowerCase().includes(q))
    .slice(0, 15);
  renderCatalogSearchResults(matches);
});
document.getElementById('catalogSearchInput').addEventListener('focus', function(){
  if(this.value.trim()) this.dispatchEvent(new Event('input'));
});
document.getElementById('catalogSearchInput').addEventListener('blur', function(){
  setTimeout(() => { document.getElementById('catalogSearchResults').style.display = 'none'; }, 150);
});

async function renderQuickAddProducts(){
  const holder = document.getElementById('quickAddProducts');
  const all = await DB.Products.all();
  const favorites = all.filter(p => p.favorite);
  if(!favorites.length){
    holder.innerHTML = '<span class="muted">אין עדיין מוצרים מועדפים. סמנו כוכב ⭐ ליד מוצר ב<a href="products.html">קטלוג המוצרים</a> כדי שיופיע כאן כקיצור דרך.</span>';
    return;
  }
  holder.innerHTML = favorites.map(p =>
    `<button type="button" class="quick-add-btn" onclick="addCatalogProduct('${p.id}')">⭐ ${escapeHtml(p.name)}</button>`
  ).join('');
}

/* ---- חיפוש והוספה ישירות ממאגר הספקים ---- */
function renderQuoteSupplierResults(items){
  lastSupplierResults = items;
  const holder = document.getElementById('supplierSearchResults');
  if(!items.length){ holder.style.display = 'none'; holder.innerHTML = ''; return; }
  holder.innerHTML = items.map(it => {
    const suggested = calcPricing(it.cost, settings.defaultMargin, settings.defaultVat).suggestedSaleBeforeVat;
    return `<div style="padding:8px 10px;border-bottom:1px solid var(--c-border);cursor:pointer;" onmousedown="addSupplierItemToQuote('${it.id}')">
      <b>${escapeHtml(it.description)}</b><br>
      <span class="muted">מק"ט: ${escapeHtml(it.supplierSku||it.mfrSku||'')} · ${escapeHtml(it.supplier)} · עלות: ${fmtMoney(it.cost)} · מחיר מוצע: ${fmtMoney(suggested)}</span>
    </div>`;
  }).join('');
  holder.style.display = 'block';
}

function addSupplierItemToQuote(supplierItemId){
  const it = lastSupplierResults.find(x => x.id === supplierItemId);
  if(!it) return;
  const suggested = calcPricing(it.cost, settings.defaultMargin, settings.defaultVat).suggestedSaleBeforeVat;
  quote.items.push({
    id: DB.genId(), productId: null,
    name: it.description, qty: 1, unitPrice: Math.round(suggested * 100) / 100
  });
  document.getElementById('supplierSearchResults').style.display = 'none';
  document.getElementById('supplierSearch').value = '';
  renderItems();
  toast(`${it.description} נוסף להצעה (מחיר לפי ${settings.defaultMargin}% רווח - ניתן לעריכה)`);
}

document.getElementById('supplierSearch').addEventListener('input', async function(){
  renderQuoteSupplierResults(await DB.SupplierPrices.search(this.value, 15));
});
document.getElementById('supplierSearch').addEventListener('blur', function(){
  setTimeout(() => { document.getElementById('supplierSearchResults').style.display = 'none'; }, 150);
});

async function addCatalogProduct(productId){
  const p = await DB.Products.get(productId);
  if(!p) return;
  quote.items.push({ id: DB.genId(), productId: p.id, name: p.name, qty: 1, unitPrice: p.salePrice || 0 });
  document.getElementById('catalogSearchResults').style.display = 'none';
  document.getElementById('catalogSearchInput').value = '';
  renderItems();
  await maybeAutoNotes();
  toast(`${p.name} נוסף להצעה`);
}

function fillForm(){
  document.getElementById('quoteId').value = quote.id || '';
  document.getElementById('quoteDate').value = quote.date || todayISO();
  document.getElementById('quoteStatus').value = quote.status || 'draft';
  document.getElementById('discountType').value = quote.discountType || 'fixed';
  document.getElementById('discountValue').value = quote.discountValue || 0;
  document.getElementById('vatPercent').value = quote.vatPercent ?? settings.defaultVat;
  document.getElementById('quoteNotes').value = quote.notes || '';
  document.getElementById('numberBadge').textContent = quote.number ? ('מספר הצעה: ' + quote.number) : 'מספר יוקצה עם השמירה הראשונה';
  document.getElementById('pageTitle').textContent = quote.id ? 'עריכת הצעת מחיר' : 'הצעת מחיר חדשה';
  const hasId = !!quote.id;
  document.getElementById('printBtn').disabled = !hasId;
  document.getElementById('whatsappBtn').disabled = !hasId;
  document.getElementById('finbotBtn').disabled = !hasId;
  document.getElementById('dupBtn').disabled = !hasId;
  document.getElementById('delBtn').disabled = !hasId;
}

function renderItems(){
  const tbody = document.getElementById('itemsBody');
  if(!quote.items.length){
    tbody.innerHTML = `<tr class="empty-row"><td colspan="5">אין פריטים עדיין. הוסיפו מהקטלוג או פריט חופשי.</td></tr>`;
  } else {
    tbody.innerHTML = quote.items.map(it => `
      <tr>
        <td><input type="text" value="${escapeHtml(it.name)}" oninput="updateItem('${it.id}','name',this.value)"></td>
        <td><input type="number" min="0" step="1" value="${it.qty}" oninput="updateItem('${it.id}','qty',this.value)"></td>
        <td><input type="number" min="0" step="0.01" value="${it.unitPrice}" oninput="updateItem('${it.id}','unitPrice',this.value)"></td>
        <td>${fmtMoney((Number(it.qty)||0) * (Number(it.unitPrice)||0))}</td>
        <td class="item-actions"><button class="btn sm" onclick="duplicateItem('${it.id}')" title="שכפול שורה">שכפול</button><button class="btn sm danger" onclick="removeItem('${it.id}')" title="הסרת מוצר">הסרה</button></td>
      </tr>`).join('');
  }
  renderTotals();
}

function renderTotals(){
  readTotalsInputs();
  const t = calcQuoteTotals(quote);
  document.getElementById('tSubtotal').textContent = fmtMoney(t.subtotal);
  document.getElementById('tDiscount').textContent = '- ' + fmtMoney(t.discountAmount);
  document.getElementById('tVat').textContent = fmtMoney(t.vatAmount) + ` (${t.vatPercent}%)`;
  document.getElementById('tTotal').textContent = fmtMoney(t.total);
}

function readTotalsInputs(){
  quote.discountType = document.getElementById('discountType').value;
  quote.discountValue = parseFloat(document.getElementById('discountValue').value) || 0;
  quote.vatPercent = parseFloat(document.getElementById('vatPercent').value) || 0;
}

function updateItem(itemId, field, value){
  const it = quote.items.find(x => x.id === itemId);
  if(!it) return;
  if(field === 'qty' || field === 'unitPrice') it[field] = parseFloat(value) || 0;
  else it[field] = value;
  renderTotals();
  refreshRowTotalsOnly();
}

function refreshRowTotalsOnly(){
  const rows = document.querySelectorAll('#itemsBody tr');
  quote.items.forEach((it, idx) => {
    const row = rows[idx];
    if(!row) return;
    const cell = row.children[3];
    if(cell) cell.textContent = fmtMoney((Number(it.qty)||0) * (Number(it.unitPrice)||0));
  });
}

async function removeItem(itemId){
  quote.items = quote.items.filter(x => x.id !== itemId);
  renderItems();
  await maybeAutoNotes();
}

function duplicateItem(itemId){
  const item = quote.items.find(x => x.id === itemId);
  if(!item) return;
  quote.items.push({...item, id: DB.genId()});
  renderItems();
  toast('הפריט שוכפל');
}

function addFreeItem(){
  quote.items.push({ id: DB.genId(), productId: null, name: 'פריט חדש', qty: 1, unitPrice: 0 });
  renderItems();
}

function composeProductBlock(product){
  const mkt = product.mkt || {};
  const lines = [];
  lines.push(mkt.title || product.name);
  if(mkt.intro){ lines.push('', mkt.intro); }
  if(mkt.specs && mkt.specs.length){ lines.push('', 'מפרט:', ...mkt.specs.map(s => '• ' + s)); }
  if(mkt.audience){ lines.push('', 'למי זה מתאים?', '', mkt.audience); }
  if(mkt.closing){ lines.push('', mkt.closing); }
  return lines.join('\n');
}

async function composeNotes(){
  const productIds = quote.items.filter(it => it.productId).map(it => it.productId);
  const products = await Promise.all(productIds.map(id => DB.Products.get(id)));
  const blocks = products
    .filter(Boolean)
    .filter(p => (p.mkt && (p.mkt.intro || (p.mkt.specs||[]).length || p.mkt.audience)))
    .map(composeProductBlock);
  return blocks.join('\n\n----------\n\n');
}

async function maybeAutoNotes(){
  if(notesTouched) return;
  document.getElementById('quoteNotes').value = await composeNotes();
}

async function refreshNotesFromItems(){
  document.getElementById('quoteNotes').value = await composeNotes();
  notesTouched = true; // מכאן והלאה זו עריכה מודעת של המשתמש
}

document.getElementById('quoteNotes').addEventListener('input', () => { notesTouched = true; });
['discountType','discountValue','vatPercent'].forEach(id => {
  document.getElementById(id).addEventListener('input', renderTotals);
  document.getElementById(id).addEventListener('change', renderTotals);
});

function collectQuoteFromForm(){
  quote.customerId = document.getElementById('customerSelect').value;
  quote.date = document.getElementById('quoteDate').value || todayISO();
  quote.status = document.getElementById('quoteStatus').value;
  readTotalsInputs();
  quote.notes = document.getElementById('quoteNotes').value;
  return quote;
}

async function saveQuote(forceStatus){
  collectQuoteFromForm();
  if(!quote.customerId){ toast('יש לבחור לקוח'); return; }
  if(!quote.items.length){ toast('יש להוסיף לפחות פריט אחד'); return; }
  if(forceStatus) quote.status = forceStatus;
  const saved = await DB.Quotes.save(quote);
  toast('ההצעה נשמרה בהצלחה');
  location.href = 'quote.html?id=' + saved.id;
}

function printQuote(){
  if(!quote.id) return;
  window.open('quote-print.html?id=' + quote.id, '_blank');
}

function openWhatsAppMessage(){
  if(!quote.id) return;
  location.href = 'whatsapp.html?quoteId=' + encodeURIComponent(quote.id);
}

function setFinbotStatus(text, isError){
  const el = document.getElementById('finbotStatus');
  el.textContent = text;
  el.style.color = isError ? 'var(--c-danger)' : 'var(--c-success)';
}

async function sendToFinbotHandler(){
  console.log('[Finbot] כפתור נלחץ. quote.id =', quote.id);
  setFinbotStatus('שולח ל-Finbot...', false);
  if(!quote.id){
    setFinbotStatus('שגיאה: קודם צריך לשמור את ההצעה (טיוטה או סופי).', true);
    return;
  }
  if(!settings.finbotApiKey){
    setFinbotStatus('שגיאה: לא הוגדר מפתח API של Finbot. עוברים למסך הגדרות...', true);
    setTimeout(() => location.href = 'settings.html', 1500);
    return;
  }
  const customer = await DB.Customers.get(quote.customerId);
  const totals = calcQuoteTotals(quote);
  const confirmMsg = `ליצור הצעת מחיר ב-Finbot?\n\nלקוח: ${customer ? customer.name : 'לא ידוע'}\nסה"כ לתשלום: ${fmtMoney(totals.total)}\n\nזה ייצור מסמך אמיתי ב-Finbot. ודאו שהלקוח נכון לפני אישור.`;
  if(!confirmAction(confirmMsg)){
    setFinbotStatus('בוטל.', false);
    return;
  }
  const btn = document.getElementById('finbotBtn');
  btn.disabled = true;
  btn.textContent = 'שולח...';
  try{
    const result = await sendQuoteToFinbot(quote, customer, settings);
    console.log('[Finbot] תוצאה:', result);
    btn.disabled = false;
    btn.textContent = 'שלח ל-Finbot';
    if(result.ok){
      setFinbotStatus('✓ ' + result.message + (result.link ? ' — ' : ''), false);
      if(result.link){
        const el = document.getElementById('finbotStatus');
        el.innerHTML += `<a href="${result.link}" target="_blank">פתיחת המסמך ב-Finbot</a>`;
      }
    } else {
      setFinbotStatus('שגיאה: ' + result.message, true);
      if(result.error) console.error('[Finbot] שגיאה טכנית:', result.error, result.raw);
    }
  } catch(e){
    console.error('[Finbot] חריגה לא צפויה:', e);
    btn.disabled = false;
    btn.textContent = 'שלח ל-Finbot';
    setFinbotStatus('שגיאה לא צפויה: ' + e.message + ' (פרטים בקונסולה - F12)', true);
  }
}

async function dupCurrent(){
  if(!quote.id) return;
  const copy = await DB.Quotes.duplicate(quote.id);
  if(copy){ toast('שוכפל למספר הצעה חדש'); location.href = 'quote.html?id=' + copy.id; }
}

async function delCurrent(){
  if(!quote.id) return;
  if(!confirmAction('למחוק את ההצעה? הפעולה בלתי הפיכה.')) return;
  await DB.Quotes.remove(quote.id);
  toast('ההצעה נמחקה');
  location.href = 'index.html';
}

async function init(){
  settings = await DB.getSettings();
  quote = editId ? await DB.Quotes.get(editId) : null;
  if(!quote){
    quote = {
      id: null,
      number: null,
      status: 'draft',
      customerId: '',
      date: todayISO(),
      items: [],
      discountType: 'fixed',
      discountValue: 0,
      vatPercent: settings.defaultVat,
      notes: ''
    };
  }
  notesTouched = !!(quote.notes && quote.notes.trim());

  await populateCustomerSelect();
  await renderQuickAddProducts();
  fillForm();
  renderItems();
}
init();
