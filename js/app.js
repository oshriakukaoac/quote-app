/* ===== כלים משותפים + ניווט ===== */

function fmtMoney(n){
  n = Number(n) || 0;
  return '₪' + n.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(iso){
  if(!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if(isNaN(d)) return iso;
  const p = n => String(n).padStart(2,'0');
  return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()}`;
}
function todayISO(){
  return new Date().toISOString().slice(0,10);
}
function escapeHtml(s){
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
  }[c]));
}
function qs(name){
  return new URLSearchParams(location.search).get(name);
}

function toast(msg){
  let el = document.getElementById('app-toast');
  if(!el){
    el = document.createElement('div');
    el.id = 'app-toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2200);
}

function confirmAction(msg){
  return window.confirm(msg);
}

/* חישוב סיכומי הצעת מחיר: סכום ביניים, הנחה, מע"מ, סה"כ לתשלום */
function calcQuoteTotals(quote){
  const items = quote.items || [];
  const subtotal = items.reduce((sum, it) => sum + (Number(it.qty)||0) * (Number(it.unitPrice)||0), 0);
  let discountAmount = 0;
  if(quote.discountType === 'percent'){
    discountAmount = subtotal * (Number(quote.discountValue)||0) / 100;
  } else {
    discountAmount = Number(quote.discountValue) || 0;
  }
  discountAmount = Math.min(discountAmount, subtotal);
  const afterDiscount = subtotal - discountAmount;
  const vatPercent = Number(quote.vatPercent) || 0;
  const vatAmount = afterDiscount * vatPercent / 100;
  const total = afterDiscount + vatAmount;
  return { subtotal, discountAmount, afterDiscount, vatPercent, vatAmount, total };
}

/* מחשבון רווחיות: מקבל עלות לפני מע"מ, אחוז רווח ואחוז מע"מ */
function calcPricing(costPrice, marginPercent, vatPercent){
  costPrice = Number(costPrice) || 0;
  marginPercent = Number(marginPercent) || 0;
  vatPercent = Number(vatPercent) || 0;
  const costWithVat = costPrice * (1 + vatPercent/100);
  const suggestedSaleBeforeVat = costPrice * (1 + marginPercent/100);
  const suggestedSaleWithVat = suggestedSaleBeforeVat * (1 + vatPercent/100);
  const profitAmount = suggestedSaleBeforeVat - costPrice;
  return { costWithVat, suggestedSaleBeforeVat, suggestedSaleWithVat, profitAmount };
}

const NAV_ITEMS = [
  { href: 'index.html', label: 'דשבורד' },
  { href: 'customers.html', label: 'לקוחות' },
  { href: 'products.html', label: 'קטלוג מוצרים' },
  { href: 'supplier-import.html', label: 'קטלוג ספקים' },
  { href: 'quote.html', label: 'הצעת מחיר חדשה', cta: true }
];

function renderNav(activeHref){
  const holder = document.getElementById('nav-placeholder');
  if(!holder) return;
  const links = NAV_ITEMS.map(item => {
    const isActive = item.href === activeHref;
    const cls = ['', isActive ? 'active' : '', item.cta ? 'cta' : ''].filter(Boolean).join(' ');
    return `<a href="${item.href}" class="${cls}">${item.label}</a>`;
  }).join('');
  const settingsActive = activeHref === 'settings.html';
  holder.outerHTML = `
    <div class="topnav">
      <div class="topnav-inner">
        <div class="brand"><span class="logo-badge">OAC</span><span>הצעות מחיר</span></div>
        <div class="nav-links">${links}</div>
        <div class="nav-spacer"></div>
        <a href="settings.html" class="nav-settings ${settingsActive ? 'active' : ''}">⚙️ הגדרות</a>
        <a href="#" class="nav-settings" onclick="handleSignOut();return false;">🚪 התנתק</a>
      </div>
    </div>`;
}
