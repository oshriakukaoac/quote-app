// Supabase Edge Function: מעביר בקשות "שליחת הצעת מחיר" מהדפדפן ל-API של Finbot,
// כדי לעקוף חסימת CORS שלהם (לא ניתן לקרוא ל-Finbot ישירות מהדפדפן).
// זה מחליף את המתווך המקומי (server-src/Program.cs / serve.ps1) כדי שהשליחה
// ל-Finbot תעבוד גם כשהאתר רץ באינטרנט (erp.oac.co.il), לא רק כשהשרת המקומי פתוח.
//
// פריסה (מהדשבורד של Supabase, בלי צורך ב-CLI/Node):
// Edge Functions -> Deploy a new function -> שם: finbot-proxy -> להדביק את הקובץ הזה -> Deploy.

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ status: 0, message: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const secret = req.headers.get("secret");
  if (!secret) {
    return new Response(
      JSON.stringify({ status: 0, message: "לא נשלח מפתח API (secret header חסר)." }),
      { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  let bodyText: string;
  try {
    bodyText = await req.text();
  } catch (e) {
    return new Response(
      JSON.stringify({ status: 0, message: "לא ניתן לקרוא את גוף הבקשה: " + (e as Error).message }),
      { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  try {
    const upstream = await fetch("https://api.finbotai.co.il/income", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "secret": secret,
      },
      body: bodyText,
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ status: 0, message: "שגיאת תקשורת עם Finbot: " + (e as Error).message }),
      { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});
