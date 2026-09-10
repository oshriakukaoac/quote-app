renderNav('customers.html');

const CUST_FIELD_DEFS = [
  { key: 'name', label: 'שם לקוח *', required: true },
  { key: 'taxId', label: 'ת.ז. / עוסק מורשה', required: false },
  { key: 'phone', label: 'טלפון', required: false },
  { key: 'email', label: 'אימייל', required: false },
  { key: 'street', label: 'רחוב', required: false },
  { key: 'streetNumber', label: 'מספר רחוב', required: false },
  { key: 'city', label: 'עיר', required: false }
];

let custHeaders = [];
let custRows = [];
let custMap = {};

function guessCustomerColumnMap(headers){
  const map = {};
  headers.forEach((h, idx) => {
    const t = (h || '').trim();
    if(map.name === undefined && /שם.*מוצג|שם.*לקוח/.test(t)) map.name = idx;
    else if(map.taxId === undefined && /ת\.?ז|עוסק|ח\.?פ/.test(t)) map.taxId = idx;
    else if(map.phone === undefined && /טלפון|נייד|פלאפון/.test(t)) map.phone = idx;
    else if(map.email === undefined && /מייל|email/i.test(t)) map.email = idx;
    else if(map.streetNumber === undefined && /מספר\s*רחוב/.test(t)) map.streetNumber = idx;
    else if(map.street === undefined && /^רחוב$|כתובת/.test(t)) map.street = idx;
    else if(map.city === undefined && /עיר/.test(t)) map.city = idx;
  });
  if(map.name === undefined){
    const fallback = headers.findIndex(h => /שם/.test(h || ''));
    map.name = fallback >= 0 ? fallback : 0;
  }
  return map;
}

document.getElementById('fileInput').addEventListener('change', function(){
  const file = this.files[0];
  if(file) handleFile(file);
});

async function handleFile(file){
  const isXlsx = /\.xlsx$/i.test(file.name);
  const buffer = await file.arrayBuffer();
  let headers, rows;
  if(isXlsx){
    const parsed = await XLSX_MINI.parse(buffer);
    headers = parsed.headers;
    rows = parsed.rows;
  } else {
    const text = decodeFileBuffer(buffer);
    const firstLine = text.split(/\r?\n/, 1)[0] || '';
    const delimiter = detectDelimiter(firstLine);
    const all = parseDelimitedText(text, delimiter);
    headers = all[0] || [];
    rows = all.slice(1);
  }
  if(!headers.length){ toast('לא ניתן לקרוא את הקובץ'); return; }

  custHeaders = headers;
  custRows = rows;
  custMap = guessCustomerColumnMap(headers);
  renderMappingUI();
  document.getElementById('mappingArea').style.display = '';
  document.getElementById('rowCountLabel').textContent = rows.length.toLocaleString('he-IL');
}

function renderMappingUI(){
  const holder = document.getElementById('mappingFields');
  holder.innerHTML = CUST_FIELD_DEFS.map(f => {
    const options = ['<option value="-1">— ללא —</option>'].concat(
      custHeaders.map((h, idx) => `<option value="${idx}" ${custMap[f.key] === idx ? 'selected' : ''}>${escapeHtml(h)}</option>`)
    ).join('');
    return `<div class="field"><label>${f.label}</label><select data-field="${f.key}" onchange="onCustMapChange('${f.key}', this.value)">${options}</select></div>`;
  }).join('');
  renderCustPreview();
}

function onCustMapChange(field, value){
  const v = parseInt(value);
  if(v === -1) delete custMap[field]; else custMap[field] = v;
  renderCustPreview();
}

function rowToCustomer(row){
  const get = key => (custMap[key] !== undefined ? (row[custMap[key]] || '').trim() : '');
  const streetPart = [get('street'), get('streetNumber')].filter(Boolean).join(' ');
  const address = [streetPart, get('city')].filter(Boolean).join(', ');
  return {
    name: get('name'),
    taxId: get('taxId'),
    phone: get('phone'),
    email: get('email'),
    address,
    contact: ''
  };
}

function renderCustPreview(){
  document.getElementById('previewHead').innerHTML = '<tr>' + CUST_FIELD_DEFS.map(f => `<th>${f.label.replace(' *','')}</th>`).join('') + '</tr>';
  const sample = custRows.slice(0, 10).map(rowToCustomer);
  document.getElementById('previewBody').innerHTML = sample.map(c => `
    <tr>
      <td>${escapeHtml(c.name)}</td>
      <td>${escapeHtml(c.taxId)}</td>
      <td>${escapeHtml(c.phone)}</td>
      <td>${escapeHtml(c.email)}</td>
      <td colspan="3">${escapeHtml(c.address)}</td>
    </tr>`).join('') || `<tr class="empty-row"><td colspan="7">אין נתונים להצגה</td></tr>`;
}

async function doImport(){
  if(custMap.name === undefined){ toast('יש להתאים לפחות את עמודת השם'); return; }
  const existing = await DB.Customers.all();
  let added = 0, updated = 0, skipped = 0;
  toast(`מייבא ${custRows.length.toLocaleString('he-IL')} לקוחות... זה יכול לקחת כמה שניות`);
  for(const row of custRows){
    const c = rowToCustomer(row);
    if(!c.name){ skipped++; continue; }
    const match = existing.find(x => x.name.trim().toLowerCase() === c.name.toLowerCase());
    if(match){
      Object.assign(match, {
        taxId: c.taxId || match.taxId,
        phone: c.phone || match.phone,
        email: c.email || match.email,
        address: c.address || match.address
      });
      await DB.Customers.save(match);
      updated++;
    } else {
      const created = await DB.Customers.save(c);
      existing.push(created);
      added++;
    }
  }
  document.getElementById('importResult').textContent =
    `יובאו: ${added} לקוחות חדשים, עודכנו: ${updated} קיימים` + (skipped ? `, דולגו: ${skipped} ללא שם` : '');
  toast('הייבוא הושלם בהצלחה');
}
