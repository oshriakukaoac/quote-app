/* ===== כלים כלליים לקריאת קבצי מחירון (CSV/TSV) מספקים =====
   תומך בזיהוי קידוד אוטומטי (UTF-8 / UTF-16) ובזיהוי מפריד (טאב/פסיק),
   כולל טיפול נכון במרכאות בתוך שדות (לדוגמה מק"ט עם גרש). */

/* מפענח ArrayBuffer לטקסט, לפי סימון BOM אם קיים */
function decodeFileBuffer(buffer){
  const bytes = new Uint8Array(buffer);
  if(bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE){
    return new TextDecoder('utf-16le').decode(buffer);
  }
  if(bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF){
    return new TextDecoder('utf-16be').decode(buffer);
  }
  if(bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF){
    return new TextDecoder('utf-8').decode(buffer.slice(3));
  }
  return new TextDecoder('utf-8').decode(buffer);
}

/* מזהה את המפריד הסביר ביותר (טאב / פסיק / נקודה־פסיק) לפי שורת הכותרת */
function detectDelimiter(sampleLine){
  const candidates = ['\t', ',', ';'];
  let best = '\t', bestCount = -1;
  for(const c of candidates){
    const count = sampleLine.split(c).length - 1;
    if(count > bestCount){ bestCount = count; best = c; }
  }
  return best;
}

/* פירוק טקסט מופרד (CSV/TSV) לשורות של תאים, בכיבוד מרכאות RFC4180 */
function parseDelimitedText(text, delimiter){
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  text = text.replace(/^﻿/, ''); // הסרת BOM טקסטואלי אם נשאר
  for(let i = 0; i < text.length; i++){
    const ch = text[i];
    if(inQuotes){
      if(ch === '"'){
        if(text[i+1] === '"'){ field += '"'; i++; }
        else{ inQuotes = false; }
      } else {
        field += ch;
      }
    } else {
      if(ch === '"'){ inQuotes = true; }
      else if(ch === delimiter){ row.push(field); field = ''; }
      else if(ch === '\r'){ /* מתעלמים, נטפל ב-\n */ }
      else if(ch === '\n'){ row.push(field); rows.push(row); row = []; field = ''; }
      else field += ch;
    }
  }
  if(field.length || row.length){ row.push(field); rows.push(row); }
  // סינון שורות ריקות לגמרי בסוף הקובץ
  return rows.filter(r => !(r.length === 1 && r[0].trim() === ''));
}

/* מנחש מיפוי עמודות לפי שמות כותרת נפוצים */
function guessColumnMap(headers){
  const map = {};
  const norm = h => (h || '').trim();
  headers.forEach((h, idx) => {
    const t = norm(h);
    if(map.sku === undefined && /מק"?ט.*(מור לוי|ספק|פנימי)|^מק"?ט$/i.test(t)) map.sku = idx;
    else if(map.mfrSku === undefined && /מק"?ט.*יצרן/i.test(t)) map.mfrSku = idx;
    else if(map.description === undefined && /(תיאור|שם\s*פריט|שם\s*מוצר|description)/i.test(t)) map.description = idx;
    else if(map.price === undefined && /(מחיר|price|עלות)/i.test(t)) map.price = idx;
    else if(map.category === undefined && /(קטגור|category)/i.test(t)) map.category = idx;
    else if(map.manufacturer === undefined && /(יצרן|manufacturer|brand)/i.test(t)) map.manufacturer = idx;
    else if(map.availability === undefined && /(זמינ|מלאי|stock)/i.test(t)) map.availability = idx;
    else if(map.image === undefined && /(תמונ|image|photo)/i.test(t)) map.image = idx;
  });
  // ברירת מחדל למק"ט אם לא זוהה עמודה ייעודית - העמודה הראשונה
  if(map.sku === undefined) map.sku = 0;
  return map;
}

/* ממיר מחרוזת מחיר כמו "₪1,234.50" למספר */
function parsePriceString(s){
  if(s === undefined || s === null) return 0;
  const cleaned = String(s).replace(/[^\d.\-]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}
