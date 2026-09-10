renderNav('whatsapp.html');

let settings = DB.defaultSettings();
let products = [];
let quotes = [];
let selected = new Set();

async function populateQuoteSelect(){
  const select = document.getElementById('quoteSelect');
  const customers = await DB.Customers.all();
  select.innerHTML = '<option value="">בחרו הצעת מחיר...</option>' + quotes.map(q => {
    const customer = customers.find(c => c.id === q.customerId);
    return `<option value="${q.id}">הצעה ${q.number || 'טיוטה'} — ${escapeHtml(customer ? customer.name : 'ללא לקוח')}</option>`;
  }).join('');
  const requestedId = qs('quoteId');
  if(requestedId && quotes.some(q => q.id === requestedId)){
    select.value = requestedId;
    buildMessage();
  }
}

function renderChips(){
  const holder = document.getElementById('productChips');
  if(!products.length){
    holder.innerHTML = '<span class="muted">אין עדיין מוצרים בקטלוג. <a href="products.html">הוספת מוצר</a></span>';
    return;
  }
  holder.innerHTML = products.map(p => `
    <div class="chip ${selected.has(p.id) ? 'selected' : ''}" onclick="toggle('${p.id}')">${escapeHtml(p.name)}</div>
  `).join('');
}

function toggle(id){
  if(selected.has(id)) selected.delete(id); else selected.add(id);
  renderChips();
  buildMessage();
}

function composeProductText(product, includePrice){
  const mkt = product.mkt || {};
  const lines = [];
  lines.push(mkt.title || product.name);
  if(mkt.intro){ lines.push('', mkt.intro); }
  if(mkt.specs && mkt.specs.length){ lines.push('', 'מפרט:', ...mkt.specs.map(s => '• ' + s)); }
  if(mkt.audience){ lines.push('', 'למי זה מתאים?', '', mkt.audience); }
  if(mkt.closing){ lines.push('', mkt.closing); }
  if(includePrice){
    const priceWithVat = (Number(product.salePrice)||0) * (1 + settings.defaultVat/100);
    lines.push('', `מחיר: ${fmtMoney(priceWithVat)} (כולל מע"מ)`);
  }
  return lines.join('\n');
}

function buildMessage(){
  const quoteId = document.getElementById('quoteSelect').value;
  if(quoteId){ buildQuoteMessage(quoteId); return; }
  const includePrice = document.getElementById('includePrice').checked;
  const chosen = products.filter(p => selected.has(p.id));
  if(!chosen.length){
    document.getElementById('messageOut').value = '';
    return;
  }
  const blocks = chosen.map(p => composeProductText(p, includePrice));
  const message = blocks.join('\n\n———————————\n\n') + '\n\n' + settings.tagline;
  document.getElementById('messageOut').value = message;
}

async function buildQuoteMessage(quoteId){
  const quote = quotes.find(q => q.id === quoteId) || await DB.Quotes.get(quoteId);
  if(!quote) return;
  const customer = quote.customerId ? await DB.Customers.get(quote.customerId) : null;
  const totals = calcQuoteTotals(quote);
  const includePrice = document.getElementById('includePrice').checked;
  const itemProducts = await Promise.all((quote.items || []).map(it => it.productId ? DB.Products.get(it.productId) : Promise.resolve(null)));
  const lines = [];
  (quote.items || []).forEach((it, index) => {
    const product = itemProducts[index];
    const mkt = product && product.mkt ? product.mkt : {};
    if(lines.length) lines.push('');
    lines.push(`*${mkt.title || it.name}*`);
    if(mkt.intro) lines.push(mkt.intro);
    if(mkt.specs && mkt.specs.length) lines.push('', '*מפרט:*', ...mkt.specs.map(spec => `• ${spec}`));
    if(mkt.audience) lines.push('', '*למי המחשב מתאים?*', mkt.audience);
    if(mkt.closing) lines.push('', `*${mkt.closing}*`);
    if(Number(it.qty) > 1) lines.push(`• כמות: ${it.qty}`);
    if(index < quote.items.length - 1) lines.push('');
  });
  if(includePrice){
    if(totals.discountAmount > 0) lines.push('', `הנחה: ${fmtMoney(totals.discountAmount)}`);
    lines.push('', `מחיר לפני מע״מ: ${fmtMoney(totals.afterDiscount)}`, `מחיר סופי ללקוח: *${fmtMoney(totals.total)} כולל מע״מ*`);
  }
  lines.push('', `*${settings.tagline}*`);
  document.getElementById('messageOut').value = lines.join('\n');
  document.getElementById('customerPhone').value = customer ? (customer.phone || '') : '';
}

function copyMessage(){
  const el = document.getElementById('messageOut');
  if(!el.value){ toast('בחרו לפחות מוצר אחד'); return; }
  el.select();
  navigator.clipboard.writeText(el.value)
    .then(() => toast('ההודעה הועתקה ללוח'))
    .catch(() => document.execCommand('copy'));
}

function sendWhatsApp(){
  const message = document.getElementById('messageOut').value.trim();
  if(!message){ toast('יש לבחור הצעה או מוצר'); return; }
  let phone = document.getElementById('customerPhone').value.replace(/\D/g, '');
  if(phone.startsWith('0')) phone = '972' + phone.slice(1);
  const url = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}`
    : `https://wa.me/?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank', 'noopener');
}

document.getElementById('includePrice').addEventListener('change', buildMessage);
document.getElementById('quoteSelect').addEventListener('change', function(){
  if(this.value) selected.clear();
  renderChips();
  buildMessage();
});

async function init(){
  [settings, products, quotes] = await Promise.all([DB.getSettings(), DB.Products.all(), DB.Quotes.all()]);
  await populateQuoteSelect();
  renderChips();
}
init();
