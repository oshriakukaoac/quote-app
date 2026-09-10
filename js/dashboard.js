renderNav('index.html');

function statCard(num, label){
  return `<div class="stat"><div class="num">${num}</div><div class="label">${label}</div></div>`;
}

async function renderStats(){
  const [customers, products, quotes] = await Promise.all([DB.Customers.all(), DB.Products.all(), DB.Quotes.all()]);
  const drafts = quotes.filter(q => q.status === 'draft').length;
  const finals = quotes.filter(q => q.status === 'final').length;
  document.getElementById('stats').innerHTML =
    statCard(quotes.length, 'סה"כ הצעות מחיר') +
    statCard(drafts, 'טיוטות פתוחות') +
    statCard(customers.length, 'לקוחות') +
    statCard(products.length, 'מוצרים ושירותים בקטלוג');
}

async function renderQuotes(){
  const filter = document.getElementById('filterStatus').value;
  const [customers, allQuotes] = await Promise.all([DB.Customers.all(), DB.Quotes.all()]);
  let quotes = filter ? allQuotes.filter(q => q.status === filter) : allQuotes;

  const tbody = document.getElementById('quotesBody');
  if(!quotes.length){
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">אין עדיין הצעות מחיר. <a href="quote.html">ליצירת הצעה ראשונה</a></td></tr>`;
    return;
  }
  tbody.innerHTML = quotes.map(q => {
    const customer = customers.find(c => c.id === q.customerId);
    const totals = calcQuoteTotals(q);
    const statusLabel = q.status === 'final' ? 'סופי' : 'טיוטה';
    return `<tr>
      <td>${q.number ?? '—'}</td>
      <td>${escapeHtml(customer ? customer.name : 'ללא לקוח')}</td>
      <td>${fmtDate(q.date)}</td>
      <td><span class="badge ${q.status}">${statusLabel}</span></td>
      <td>${fmtMoney(totals.total)}</td>
      <td class="text-left">
        <a class="btn sm" href="quote.html?id=${q.id}">עריכה</a>
        <a class="btn sm" href="quote-print.html?id=${q.id}" target="_blank">PDF</a>
        <button class="btn sm" onclick="dupQuote('${q.id}')">שכפול</button>
        <button class="btn sm danger" onclick="delQuote('${q.id}')">מחיקה</button>
      </td>
    </tr>`;
  }).join('');
}

async function dupQuote(id){
  const copy = await DB.Quotes.duplicate(id);
  if(copy){ toast('ההצעה שוכפלה בהצלחה'); location.href = 'quote.html?id=' + copy.id; }
}
async function delQuote(id){
  if(!confirmAction('למחוק את ההצעה? הפעולה בלתי הפיכה.')) return;
  await DB.Quotes.remove(id);
  renderStats(); renderQuotes();
}

document.getElementById('filterStatus').addEventListener('change', renderQuotes);
renderStats();
renderQuotes();
