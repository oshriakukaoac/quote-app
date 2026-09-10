renderNav('customers.html');

function resetForm(){
  document.getElementById('custId').value = '';
  document.getElementById('custName').value = '';
  document.getElementById('custTaxId').value = '';
  document.getElementById('custAddress').value = '';
  document.getElementById('custContact').value = '';
  document.getElementById('custPhone').value = '';
  document.getElementById('custEmail').value = '';
  document.getElementById('formTitle').textContent = 'לקוח חדש';
}

async function saveCustomer(){
  const name = document.getElementById('custName').value.trim();
  if(!name){ toast('יש להזין שם לקוח'); return; }
  const c = {
    id: document.getElementById('custId').value || null,
    name,
    taxId: document.getElementById('custTaxId').value.trim(),
    address: document.getElementById('custAddress').value.trim(),
    contact: document.getElementById('custContact').value.trim(),
    phone: document.getElementById('custPhone').value.trim(),
    email: document.getElementById('custEmail').value.trim()
  };
  if(!c.id) delete c.id;
  await DB.Customers.save(c);
  toast('הלקוח נשמר בהצלחה');
  resetForm();
  renderList();
}

async function editCustomer(id){
  const c = await DB.Customers.get(id);
  if(!c) return;
  document.getElementById('custId').value = c.id;
  document.getElementById('custName').value = c.name || '';
  document.getElementById('custTaxId').value = c.taxId || '';
  document.getElementById('custAddress').value = c.address || '';
  document.getElementById('custContact').value = c.contact || '';
  document.getElementById('custPhone').value = c.phone || '';
  document.getElementById('custEmail').value = c.email || '';
  document.getElementById('formTitle').textContent = 'עריכת לקוח';
  document.getElementById('formCard').scrollIntoView({behavior:'smooth'});
}

async function deleteCustomer(id){
  if(!confirmAction('למחוק את הלקוח? הצעות קיימות ישמרו אך יוצגו ללא שיוך לקוח.')) return;
  await DB.Customers.remove(id);
  renderList();
}

async function renderList(){
  const list = await DB.Customers.all();
  const tbody = document.getElementById('custBody');
  if(!list.length){
    tbody.innerHTML = `<tr class="empty-row"><td colspan="5">אין עדיין לקוחות. הוסיפו לקוח בטופס למעלה.</td></tr>`;
    return;
  }
  tbody.innerHTML = list.map(c => `
    <tr>
      <td>${escapeHtml(c.name)}</td>
      <td>${escapeHtml(c.taxId||'')}</td>
      <td>${escapeHtml(c.phone||'')}</td>
      <td>${escapeHtml(c.email||'')}</td>
      <td class="text-left">
        <button class="btn sm" onclick="editCustomer('${c.id}')">עריכה</button>
        <button class="btn sm danger" onclick="deleteCustomer('${c.id}')">מחיקה</button>
      </td>
    </tr>`).join('');
}

renderList();
