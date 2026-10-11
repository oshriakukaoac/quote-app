// Cloudflare Pages Function: POST /api/finbot/income
// מתווך שרת-לשרת ל-API של Finbot (הדפדפן לא יכול לקרוא ל-Finbot ישירות בגלל CORS).
// זה אותו נתיב שה-frontend כבר משתמש בו (js/finbot.js -> /api/finbot/income),
// כך שאין שום שינוי בצד הלקוח - גם מקומית (serve.ps1) וגם בענן זה אותו URL יחסי.

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

function jsonError(message, status) {
  return new Response(JSON.stringify({ status: 0, message }), { status, headers: JSON_HEADERS });
}

export async function onRequestPost({ request }) {
  const secret = request.headers.get('secret');
  if (!secret) return jsonError('לא נשלח מפתח API (secret header חסר).', 400);

  let body;
  try {
    body = await request.text();
  } catch (e) {
    return jsonError('לא ניתן לקרוא את גוף הבקשה: ' + e.message, 400);
  }

  try {
    const upstream = await fetch('https://api.finbotai.co.il/income', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'secret': secret,
        'User-Agent': 'Mozilla/5.0 (compatible; QuoteApp/1.0)',
        'Accept': 'application/json'
      },
      body
    });
    const text = await upstream.text();
    return new Response(text, { status: upstream.status, headers: JSON_HEADERS });
  } catch (e) {
    return jsonError('שגיאת תקשורת עם Finbot: ' + e.message, 502);
  }
}

// כל שיטה אחרת (GET וכו') - לא נתמכת
export async function onRequest() {
  return new Response('Method not allowed', { status: 405 });
}
