(async function(){
  const id = qs('id');
  document.getElementById('backLink').href = 'quote.html' + (id ? '?id=' + id : '');

  const [settings, quote] = await Promise.all([
    DB.getSettings(),
    id ? DB.Quotes.get(id) : Promise.resolve(null)
  ]);

  if(!quote){
    document.getElementById('printRoot').innerHTML = '<p>הצעת המחיר לא נמצאה.</p>';
    return;
  }

  const customer = (quote.customerId ? await DB.Customers.get(quote.customerId) : null) || {};
  const totals = calcQuoteTotals(quote);
  const statusLabel = quote.status === 'final' ? '' : ' (טיוטה)';

  const rowsHtml = quote.items.map(it => `
    <tr>
      <td>${it.qty}</td>
      <td>${escapeHtml(it.name)}</td>
      <td>${fmtMoney(it.unitPrice)}</td>
      <td>${fmtMoney((Number(it.qty)||0) * (Number(it.unitPrice)||0))}</td>
    </tr>`).join('');

  const notesHtml = quote.notes && quote.notes.trim()
    ? `<div class="pp-notes"><h3>הערות</h3><div class="body">${escapeHtml(quote.notes)}</div></div>`
    : '';

  document.title = 'הצעת מחיר ' + (quote.number || '') + ' – ' + (customer.name || '');

  document.getElementById('printRoot').innerHTML = `
    <div class="pp-header">
      <div class="pp-company">
        <b>${escapeHtml(settings.companyName)}</b>
        עוסק מורשה מס': ${escapeHtml(settings.taxId)}<br>
        ${escapeHtml(settings.email)}<br>
        כתובת: ${escapeHtml(settings.address)}<br>
        ${escapeHtml(settings.phone)}<br>
        ${settings.website ? 'האתר שלנו: ' + escapeHtml(settings.website) : ''}
      </div>
      <div class="pp-logo">${escapeHtml(settings.logoText || 'OAC')}</div>
    </div>

    <div class="pp-title-bar">הצעת מחיר / ${quote.number ?? ''}${statusLabel}</div>

    <div class="pp-meta">
      <div class="blk">
        <div class="t">עבור:</div>
        שם: ${escapeHtml(customer.name || 'ללא לקוח')}<br>
        ${customer.address ? 'כתובת: ' + escapeHtml(customer.address) + '<br>' : ''}
        ${customer.taxId ? "עוסק מס': " + escapeHtml(customer.taxId) + '<br>' : ''}
      </div>
      <div class="blk text-left">
        <div class="t">מקור</div>
        תאריך מסמך: ${fmtDate(quote.date)}
      </div>
    </div>

    <table class="pp-table">
      <thead><tr><th>כמות</th><th>שם פריט / שירות</th><th>מחיר ליחידה</th><th>סה"כ (₪)</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>

    <div class="pp-totals">
      <div class="l"><span>סה"כ</span><span>${fmtMoney(totals.subtotal)}</span></div>
      <div class="l"><span>הנחה</span><span>${fmtMoney(totals.discountAmount)}</span></div>
      <div class="l"><span>מע"מ ${totals.vatPercent}%</span><span>${fmtMoney(totals.vatAmount)}</span></div>
      <div class="l grand"><span>סה"כ לתשלום</span><span>${fmtMoney(totals.total)}</span></div>
    </div>

    ${notesHtml}

    <div class="pp-footer">${escapeHtml(settings.tagline)}</div>
    <div class="pp-stamp">מסמך זה הופק באמצעות מערכת הצעות המחיר הפנימית</div>
  `;
})();
