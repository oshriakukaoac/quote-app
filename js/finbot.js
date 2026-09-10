/* ===== אינטגרציה עם Finbot (הנהלת חשבונות) =====
   תיעוד: https://finbot.helpjuice.com/he_IL/api-docs-create-income
   POST https://api.finbotai.co.il/income , header "secret" = מפתח ה-API.
   הדפדפן חוסם קריאה ישירה מהאתר ל-API של Finbot (CORS - נבדק בפועל).
   לכן הבקשה נשלחת למתווך המקומי (/api/finbot/income), ש-serve.ps1 מריץ.
   ניסינו להעביר את זה ל-Supabase Edge Function (supabase/functions/finbot-proxy
   - הקוד עדיין שם) אבל נתקלנו בבאג פלטפורמה ב-Supabase: ה-gateway מחזיר 401
   על כל בקשה לפונקציה, גם עם JWT תקין (חדש או legacy) וגם כש-"Verify JWT" כבוי
   בהגדרות. נדחה את זה לשלב הפריסה ל-Vercel, שם ההעברה תהיה כפונקציית שרת
   רגילה בלי הבעיה הזו. בינתיים: כדי שהכפתור "שלח ל-Finbot" יעבוד, צריך להריץ
   את "מערכת הצעות מחיר" (serve.ps1 / הפעלת התוכנה.bat) ולהיכנס דרך
   http://localhost:8080 (ולא ע"י פתיחת index.html ישירות). */

const FINBOT_PROXY_PATH = '/api/finbot/income';
const FINBOT_DOC_TYPE_QUOTE = '7'; // הצעת מחיר

function buildFinbotPayload(quote, customer, settings){
  const discountValue = Number(quote.discountValue) || 0;
  return {
    type: FINBOT_DOC_TYPE_QUOTE,
    date: fmtDate(quote.date),
    language: 'HE', // ה-Swagger הרשמי של Finbot דורש אותיות גדולות (לא כמו שכתוב בתיעוד המילולי)
    currency: 'ILS',
    vatType: false, // המחירים אצלנו הם תמיד לפני מע"מ
    rounding: true,
    discountType: quote.discountType === 'percent' ? 2 : 1,
    discountAmount: discountValue,
    title: `הצעת מחיר ${quote.number ?? ''}`.trim().slice(0, 100),
    remark: (quote.notes || '').slice(0, 1500),
    // save:false בכוונה - נתקלנו במקרה שבו Finbot שייך את המסמך ללקוח קיים אחר
    // אצלם (ככל הנראה "התאמה חכמה" לפי שדות חסרים) במקום ליצור/להתאים לפי השם
    // שנשלח. כדי שזה לא יקרה שוב, לא מבקשים מהם ליצור/לעדכן כרטיס לקוח בכלל -
    // רק מציינים את השם על המסמך עצמו. ניהול כרטיסי הלקוחות ב-Finbot נשאר
    // ידני/דרך הייבוא התקופתי מ-Excel, לא דרך השליחה הזו.
    customer: {
      name: (customer && customer.name || 'לקוח').slice(0, 100),
      email: customer && customer.email ? customer.email.slice(0, 50) : undefined,
      phone: customer && customer.phone ? customer.phone.slice(0, 20) : undefined,
      address: customer && customer.address ? customer.address.slice(0, 100) : undefined,
      tax: customer && customer.taxId ? customer.taxId.slice(0, 9) : undefined,
      save: false
    },
    items: (quote.items || []).map(it => ({
      name: (it.name || 'פריט').slice(0, 100),
      amount: Number(it.qty) || 1,
      price: Number(it.unitPrice) || 0
    }))
  };
}

/* שולח הצעת מחיר ל-Finbot. מחזיר {ok, link, message} */
async function sendQuoteToFinbot(quote, customer, settings){
  if(!settings.finbotApiKey){
    return { ok: false, message: 'לא הוגדר מפתח API של Finbot בהגדרות המערכת.' };
  }
  if(location.protocol === 'file:'){
    return { ok: false, message: 'כדי לשלוח ל-Finbot צריך להריץ את "מערכת הצעות מחיר" (הפעלת התוכנה.bat) ולהיכנס לתוכנה דרך http://localhost:8080 במקום פתיחת הקובץ ישירות.' };
  }
  const payload = buildFinbotPayload(quote, customer, settings);
  // ל-header של HTTP מותר רק טווח תווים מצומצם (ISO-8859-1) - אם הודבק מפתח API
  // עם תו סמוי (כמו סימן כיווניות עברי RLM/LRM), הדפדפן פשוט מסרב לשלוח את
  // הבקשה עם שגיאה לא ברורה. מנקים כל תו שאינו ASCII מודפס מכל ערך header.
  const asciiSafe = s => String(s || '').replace(/[^\x20-\x7E]/g, '');
  let res, text;
  try{
    res = await fetch(FINBOT_PROXY_PATH, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'secret': asciiSafe(settings.finbotApiKey) },
      body: JSON.stringify(payload)
    });
    text = await res.text();
  }catch(e){
    return { ok: false, message: 'שגיאת רשת מול השרת המקומי. ודאו ש"מערכת הצעות מחיר" רצה (יש חלון PowerShell ממוזער פתוח), ושנכנסתם דרך http://localhost:8080.', error: String(e) };
  }
  if(res.status === 401){
    return { ok: false, message: 'מפתח ה-API נדחה (401) — בדקו שהמפתח בהגדרות תקין ולא נמחק.' };
  }
  let data;
  try{ data = JSON.parse(text); }catch(e){ data = null; }
  if(data && data.status === 1){
    return { ok: true, link: data.data, message: 'הצעת המחיר נוצרה ב-Finbot בהצלחה.' };
  }
  let errText = null;
  if(data){
    if(data.message) errText = data.message;
    else if(Array.isArray(data['[]']) && data['[]'][0] && data['[]'][0].errorText) errText = data['[]'][0].errorText;
    else if(Array.isArray(data.errors) && data.errors[0]) errText = data.errors[0].errorText || data.errors[0].message || JSON.stringify(data.errors[0]);
  }
  if(!errText){
    // לא זיהינו שדה שגיאה מוכר - מציגים את הטקסט הגולמי שהתקבל כדי שאפשר יהיה לאבחן
    errText = 'תגובה לא מזוהה מ-Finbot (סטטוס HTTP ' + res.status + '): ' + text.slice(0, 400);
  }
  return { ok: false, message: errText, raw: data, rawText: text, httpStatus: res.status };
}
