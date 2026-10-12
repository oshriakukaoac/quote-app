/* ===== מחשבון מחיר מהיר =====
   המצב הבסיסי הוא: עלות לפני מע"מ, אחוז רווח ואחוז מע"מ.
   כל שדה אחר שמשנים מתורגם חזרה למצב הבסיסי, וכל השדות מחושבים ממנו מחדש. */
renderNav('calculator.html');

const MARGIN_CHIPS = [10, 15, 20, 25, 30, 40, 50];
const FIELDS = {
  margin: 'cMargin', vat: 'cVat', cost: 'cCost', costVat: 'cCostVat',
  sale: 'cSale', saleVat: 'cSaleVat', profit: 'cProfit'
};

const state = { cost: null, margin: 25, vat: 18 };

function parseNum(str){
  const n = parseFloat(String(str).replace(/[,₪%\s]/g, ''));
  return isNaN(n) ? null : n;
}
function fmtNum(n){
  if(n === null || !isFinite(n)) return '';
  return String(Math.round(n * 100) / 100);
}

function computed(){
  const { cost, margin, vat } = state;
  if(cost === null) return { cost: null, costVat: null, sale: null, saleVat: null, profit: null };
  const sale = cost * (1 + margin / 100);
  return {
    cost,
    costVat: cost * (1 + vat / 100),
    sale,
    saleVat: sale * (1 + vat / 100),
    profit: sale - cost
  };
}

/* מעדכן את כל השדות חוץ מהשדה שהמשתמש מקליד בו כרגע */
function render(skipKey){
  const c = computed();
  const values = { ...c, margin: state.margin, vat: state.vat };
  for(const key in FIELDS){
    if(key === skipKey) continue;
    document.getElementById(FIELDS[key]).value = fmtNum(values[key]);
  }
  document.getElementById('marginLabel').textContent = fmtNum(state.margin) || '0';
  document.querySelectorAll('#marginChips button').forEach(b => {
    b.classList.toggle('active', Number(b.dataset.m) === state.margin);
  });
}

/* מתרגם ערך שהוזן בשדה כלשהו בחזרה למצב הבסיסי */
function applyInput(key, v){
  const vatF = 1 + state.vat / 100;
  switch(key){
    case 'margin': state.margin = v ?? 0; break;
    case 'vat': state.vat = v ?? 0; break;
    case 'cost': state.cost = v; break;
    case 'costVat': state.cost = v === null ? null : v / vatF; break;
    case 'sale':
    case 'saleVat':
    case 'profit': {
      if(v === null) return;
      const sale = key === 'sale' ? v : key === 'saleVat' ? v / vatF : null;
      if(state.cost && state.cost > 0){
        // יש עלות - משנים את אחוז הרווח
        const profit = key === 'profit' ? v : sale - state.cost;
        state.margin = Math.round(profit / state.cost * 100 * 100) / 100;
      } else if(sale !== null){
        // אין עלות עדיין - מחשבים אותה לפי אחוז הרווח הנוכחי
        state.cost = sale / (1 + state.margin / 100);
      }
      break;
    }
  }
}

function onInput(e){
  const key = e.target.dataset.key;
  applyInput(key, parseNum(e.target.value));
  render(key);
}

function setMargin(m){
  state.margin = m;
  render();
}

function resetCalc(){
  state.cost = null;
  document.getElementById('cName').value = '';
  render();
  document.getElementById('cCost').focus();
}

function summaryText(){
  const c = computed();
  const name = document.getElementById('cName').value.trim();
  return [
    name && `מוצר: ${name}`,
    `עלות לפני מע"מ: ${fmtMoney(c.cost)}`,
    `עלות כולל מע"מ: ${fmtMoney(c.costVat)}`,
    `מחיר מכירה (${fmtNum(state.margin)}% רווח) לפני מע"מ: ${fmtMoney(c.sale)}`,
    `מחיר מכירה כולל מע"מ: ${fmtMoney(c.saleVat)}`,
    `רווח: ${fmtMoney(c.profit)}`
  ].filter(Boolean).join('\n');
}

function copySummary(){
  if(state.cost === null){ toast('יש להזין מחיר קודם'); return; }
  navigator.clipboard.writeText(summaryText())
    .then(() => toast('הועתק'))
    .catch(() => toast('ההעתקה נכשלה'));
}

async function saveToCatalog(){
  const name = document.getElementById('cName').value.trim();
  if(!name){ toast('יש להזין שם מוצר'); document.getElementById('cName').focus(); return; }
  if(state.cost === null){ toast('יש להזין מחיר'); return; }
  const c = computed();
  try{
    await DB.Products.save({
      name,
      costPrice: Math.round(c.cost * 100) / 100,
      marginPercent: state.margin,
      salePrice: Math.round(c.sale * 100) / 100
    });
    toast('נשמר בקטלוג המוצרים ✓');
  }catch(err){
    console.error(err);
    toast('השמירה נכשלה: ' + (err.message || err));
  }
}

(async function init(){
  document.getElementById('marginChips').innerHTML = MARGIN_CHIPS
    .map(m => `<button type="button" class="calc-chip" data-m="${m}" onclick="setMargin(${m})">${m}%</button>`).join('');
  Object.values(FIELDS).forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('input', onInput);
    el.addEventListener('focus', () => el.select());
    el.addEventListener('blur', () => render());
  });
  render();
  try{
    const s = await DB.getSettings();
    state.vat = Number(s.defaultVat) || 18;
    state.margin = Number(s.defaultMargin) || 25;
    render();
  }catch(err){
    console.warn('[calculator] טעינת הגדרות נכשלה, משתמשים בברירות מחדל', err);
  }
})();
