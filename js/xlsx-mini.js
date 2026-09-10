/* ===== קורא XLSX מינימלי, ללא ספריות חיצוניות =====
   קובץ xlsx הוא בסך הכול ארכיון ZIP עם כמה קבצי XML בפנים. הפונקציות כאן
   מפרקות את מבנה ה-ZIP (Central Directory + Local File Headers), מפענחות
   דחיסת deflate דרך ה-API המובנה בדפדפן (DecompressionStream), ומפרשות את
   ה-XML עם DOMParser המובנה — הכול בלי שום ספרייה/הורדה חיצונית. */

const XLSX_MINI = (function(){

  function readU16(view, off){ return view.getUint16(off, true); }
  function readU32(view, off){ return view.getUint32(off, true); }

  /* מאתר את רשומת ה-End Of Central Directory וממנה את כל קבצי ה-ZIP */
  function listZipEntries(buffer){
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    const maxBack = Math.min(bytes.length, 65557);
    let eocdOffset = -1;
    for(let i = bytes.length - 22; i >= bytes.length - maxBack && i >= 0; i--){
      if(readU32(view, i) === 0x06054b50){ eocdOffset = i; break; }
    }
    if(eocdOffset === -1) throw new Error('קובץ ה-XLSX לא תקין (לא נמצא סוף ארכיון ZIP)');
    const cdEntries = readU16(view, eocdOffset + 10);
    const cdOffset = readU32(view, eocdOffset + 16);

    const entries = [];
    let p = cdOffset;
    for(let i = 0; i < cdEntries; i++){
      if(readU32(view, p) !== 0x02014b50) break;
      const compressionMethod = readU16(view, p + 10);
      const compressedSize = readU32(view, p + 20);
      const uncompressedSize = readU32(view, p + 24);
      const fileNameLen = readU16(view, p + 28);
      const extraLen = readU16(view, p + 30);
      const commentLen = readU16(view, p + 32);
      const localHeaderOffset = readU32(view, p + 42);
      const nameBytes = bytes.slice(p + 46, p + 46 + fileNameLen);
      const name = new TextDecoder('utf-8').decode(nameBytes);
      entries.push({ name, compressionMethod, compressedSize, uncompressedSize, localHeaderOffset });
      p += 46 + fileNameLen + extraLen + commentLen;
    }
    return entries;
  }

  /* מחזיר את התוכן (מפוענח) של קובץ בתוך ה-ZIP, כ-ArrayBuffer */
  async function extractEntry(buffer, entry){
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    const lp = entry.localHeaderOffset;
    if(readU32(view, lp) !== 0x04034b50) throw new Error('כותרת קובץ מקומית לא תקינה ב-ZIP');
    const fileNameLen = readU16(view, lp + 26);
    const extraLen = readU16(view, lp + 28);
    const dataStart = lp + 30 + fileNameLen + extraLen;
    const compressed = bytes.slice(dataStart, dataStart + entry.compressedSize);

    if(entry.compressionMethod === 0){
      return compressed.buffer.slice(compressed.byteOffset, compressed.byteOffset + compressed.byteLength);
    }
    if(entry.compressionMethod === 8){
      const ds = new DecompressionStream('deflate-raw');
      const writer = ds.writable.getWriter();
      writer.write(compressed);
      writer.close();
      const out = await new Response(ds.readable).arrayBuffer();
      return out;
    }
    throw new Error('שיטת דחיסה לא נתמכת בקובץ ה-XLSX (' + entry.compressionMethod + ')');
  }

  function colLetterToIndex(cellRef){
    const m = /^([A-Z]+)/.exec(cellRef);
    if(!m) return 0;
    const letters = m[1];
    let n = 0;
    for(let i = 0; i < letters.length; i++){
      n = n * 26 + (letters.charCodeAt(i) - 64);
    }
    return n - 1;
  }

  function parseSharedStrings(xmlText){
    if(!xmlText) return [];
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    const items = Array.from(doc.getElementsByTagName('si'));
    return items.map(si => {
      const tNodes = si.getElementsByTagName('t');
      return Array.from(tNodes).map(t => t.textContent).join('');
    });
  }

  function parseSheet(xmlText, sharedStrings){
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    const rowEls = Array.from(doc.getElementsByTagName('row'));
    const rows = [];
    let maxCol = 0;

    const parsedRows = rowEls.map(rowEl => {
      const cells = Array.from(rowEl.children);
      const rowData = [];
      cells.forEach(c => {
        const ref = c.getAttribute('r') || '';
        const idx = colLetterToIndex(ref || 'A1');
        maxCol = Math.max(maxCol, idx);
        const type = c.getAttribute('t');
        let value = '';
        if(type === 's'){
          const vNode = c.getElementsByTagName('v')[0];
          const sIdx = vNode ? parseInt(vNode.textContent, 10) : -1;
          value = sharedStrings[sIdx] || '';
        } else if(type === 'inlineStr'){
          const tNodes = c.getElementsByTagName('t');
          value = Array.from(tNodes).map(t => t.textContent).join('');
        } else if(type === 'str' || type === 'n' || !type){
          const vNode = c.getElementsByTagName('v')[0];
          value = vNode ? vNode.textContent : '';
        }
        rowData[idx] = value;
      });
      return rowData;
    });

    parsedRows.forEach(r => {
      const full = new Array(maxCol + 1).fill('');
      r.forEach((v, i) => { if(v !== undefined) full[i] = v; });
      rows.push(full);
    });
    return rows;
  }

  /* פונקציית הכניסה הראשית: מקבלת ArrayBuffer של קובץ xlsx, מחזירה
     {headers, rows} של הגיליון הראשון (Sheet1 / הגיליון הפעיל הראשון) */
  async function parse(buffer){
    const entries = listZipEntries(buffer);
    const byName = {};
    entries.forEach(e => byName[e.name] = e);

    // איתור שם קובץ הגיליון הראשון דרך workbook.xml + הקשרים שלו (rels)
    let sheetPath = 'xl/worksheets/sheet1.xml';
    try{
      const wbEntry = byName['xl/workbook.xml'];
      const relsEntry = byName['xl/_rels/workbook.xml.rels'];
      if(wbEntry && relsEntry){
        const wbXml = new TextDecoder('utf-8').decode(await extractEntry(buffer, wbEntry));
        const relsXml = new TextDecoder('utf-8').decode(await extractEntry(buffer, relsEntry));
        const wbDoc = new DOMParser().parseFromString(wbXml, 'application/xml');
        const firstSheet = wbDoc.getElementsByTagName('sheet')[0];
        const rId = firstSheet && firstSheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
        const relsDoc = new DOMParser().parseFromString(relsXml, 'application/xml');
        const rel = Array.from(relsDoc.getElementsByTagName('Relationship')).find(r => r.getAttribute('Id') === rId);
        if(rel){
          const target = rel.getAttribute('Target').replace(/^\//, '');
          sheetPath = target.startsWith('xl/') ? target : 'xl/' + target;
        }
      }
    }catch(e){ /* נשארים עם ברירת המחדל sheet1.xml */ }

    const sheetEntry = byName[sheetPath] || byName['xl/worksheets/sheet1.xml'];
    if(!sheetEntry) throw new Error('לא נמצא גיליון בתוך קובץ ה-XLSX');
    const sheetXml = new TextDecoder('utf-8').decode(await extractEntry(buffer, sheetEntry));

    let sharedStrings = [];
    const ssEntry = byName['xl/sharedStrings.xml'];
    if(ssEntry){
      const ssXml = new TextDecoder('utf-8').decode(await extractEntry(buffer, ssEntry));
      sharedStrings = parseSharedStrings(ssXml);
    }

    const rows = parseSheet(sheetXml, sharedStrings);
    return { headers: rows[0] || [], rows: rows.slice(1) };
  }

  return { parse };
})();
