using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace QuoteAppServer
{
    // שרת מקומי קטן, כקובץ EXE אמיתי (בלי חלון קונסולה) -
    // 1) מגיש את קבצי התוכנה מהתיקייה שבה נמצא ה-EXE
    // 2) מתווך בקשות ל-API של Finbot כדי לעקוף חסימת CORS של הדפדפן
    static class Program
    {
        static string root;
        static HttpListener listener;
        static readonly Dictionary<string, string> Mime = new Dictionary<string, string>
        {
            { ".html", "text/html; charset=utf-8" },
            { ".css", "text/css; charset=utf-8" },
            { ".js", "application/javascript; charset=utf-8" },
            { ".json", "application/json; charset=utf-8" },
            { ".png", "image/png" },
            { ".jpg", "image/jpeg" },
            { ".svg", "image/svg+xml" },
            { ".ico", "image/x-icon" }
        };

        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            root = AppDomain.CurrentDomain.BaseDirectory;
            ServicePointManager.SecurityProtocol = SecurityProtocolType.Tls12;

            listener = new HttpListener();
            listener.Prefixes.Add("http://localhost:8080/");
            try
            {
                listener.Start();
            }
            catch (Exception ex)
            {
                MessageBox.Show("לא ניתן להפעיל את השרת המקומי בפורט 8080.\n\n" + ex.Message,
                    "מערכת הצעות מחיר", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            Thread serverThread = new Thread(ServerLoop);
            serverThread.IsBackground = true;
            serverThread.Start();

            try { Process.Start("http://localhost:8080/"); } catch { }

            NotifyIcon icon = new NotifyIcon();
            icon.Icon = System.Drawing.SystemIcons.Application;
            icon.Text = "מערכת הצעות מחיר - פועל (לחצו ימני לאפשרויות)";
            icon.Visible = true;

            ContextMenu menu = new ContextMenu();
            MenuItem openItem = new MenuItem("פתיחת התוכנה בדפדפן");
            openItem.Click += delegate { try { Process.Start("http://localhost:8080/"); } catch { } };
            MenuItem exitItem = new MenuItem("סגירת התוכנה");
            exitItem.Click += delegate
            {
                icon.Visible = false;
                try { listener.Stop(); } catch { }
                Application.Exit();
            };
            menu.MenuItems.Add(openItem);
            menu.MenuItems.Add(exitItem);
            icon.ContextMenu = menu;
            icon.DoubleClick += delegate { try { Process.Start("http://localhost:8080/"); } catch { } };

            Application.Run();
        }

        static void ServerLoop()
        {
            while (listener.IsListening)
            {
                HttpListenerContext ctx;
                try { ctx = listener.GetContext(); }
                catch { break; }
                ThreadPool.QueueUserWorkItem(HandleRequest, ctx);
            }
        }

        static void HandleRequest(object state)
        {
            HttpListenerContext ctx = (HttpListenerContext)state;
            HttpListenerRequest req = ctx.Request;
            HttpListenerResponse res = ctx.Response;
            try
            {
                string path = Uri.UnescapeDataString(req.Url.AbsolutePath);
                if (path == "/api/finbot/income" && req.HttpMethod == "POST")
                {
                    HandleFinbotProxy(req, res);
                }
                else if (path == "/api/latest-file" && req.HttpMethod == "GET")
                {
                    string folder = req.QueryString["folder"];
                    HandleLatestFile(res, string.IsNullOrEmpty(folder) ? "Mor-Levi" : folder);
                }
                else
                {
                    if (path == "/") path = "/index.html";
                    string relative = path.TrimStart('/').Replace('/', Path.DirectorySeparatorChar);
                    string filePath = Path.Combine(root, relative);
                    if (File.Exists(filePath))
                    {
                        string ext = Path.GetExtension(filePath).ToLower();
                        string ct;
                        if (!Mime.TryGetValue(ext, out ct)) ct = "application/octet-stream";
                        byte[] bytes = File.ReadAllBytes(filePath);
                        SendBytes(res, bytes, ct, 200);
                    }
                    else
                    {
                        SendBytes(res, Encoding.UTF8.GetBytes("404 Not Found: " + path), "text/plain; charset=utf-8", 404);
                    }
                }
            }
            catch (Exception ex)
            {
                try { SendJsonError(res, "שגיאה פנימית: " + ex.Message, 500); } catch { }
            }
            finally
            {
                try { res.OutputStream.Close(); } catch { }
            }
        }

        static readonly string[] LatestFileExtensions = { ".csv", ".tsv", ".txt", ".xlsx" };

        // מאתר את הקובץ העדכני ביותר בתת-תיקייה נתונה (למשל "Mor-Levi") ומחזיר אותו כמו שהוא -
        // כדי שהדפדפן לא יצטרך לדעת את השם המדויק (שמשתנה בכל הורדה).
        static void HandleLatestFile(HttpListenerResponse res, string folderName)
        {
            string folder = Path.Combine(root, folderName);
            if (!Directory.Exists(folder))
            {
                SendJsonError(res, "התיקייה \"" + folderName + "\" לא נמצאה.", 404);
                return;
            }
            FileInfo latest = null;
            foreach (string f in Directory.GetFiles(folder))
            {
                string ext = Path.GetExtension(f).ToLower();
                if (Array.IndexOf(LatestFileExtensions, ext) < 0) continue;
                FileInfo fi = new FileInfo(f);
                if (latest == null || fi.LastWriteTimeUtc > latest.LastWriteTimeUtc) latest = fi;
            }
            if (latest == null)
            {
                SendJsonError(res, "לא נמצא קובץ מחירון בתיקייה \"" + folderName + "\".", 404);
                return;
            }
            byte[] bytes = File.ReadAllBytes(latest.FullName);
            string extension = latest.Extension.ToLower();
            string ct = extension == ".xlsx"
                ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                : "text/csv; charset=utf-8";
            try { res.Headers.Add("X-File-Name", Uri.EscapeDataString(latest.Name)); } catch { }
            SendBytes(res, bytes, ct, 200);
        }

        static void SendBytes(HttpListenerResponse res, byte[] bytes, string contentType, int status)
        {
            res.StatusCode = status;
            res.ContentType = contentType;
            res.Headers.Add("Access-Control-Allow-Origin", "*");
            // בלי זה, דפדפנים נוטים לשמור בקאש גרסאות ישנות של קבצי html/js/css בלי שום
            // אינדיקציה למשתמש - גרם כבר לכמה באגים "רפאים" (עמוד נטען אבל מריץ קוד ישן).
            // כל תוכן שהתוכנה הזו מגישה קטן וזול לטעון מחדש, אז פשוט תמיד טוענים עדכני.
            res.Headers.Add("Cache-Control", "no-cache, no-store, must-revalidate");
            res.Headers.Add("Pragma", "no-cache");
            res.Headers.Add("Expires", "0");
            res.ContentLength64 = bytes.Length;
            res.OutputStream.Write(bytes, 0, bytes.Length);
        }

        static void SendJsonError(HttpListenerResponse res, string message, int status)
        {
            string json = "{\"status\":0,\"message\":" + JsonString(message) + "}";
            SendBytes(res, Encoding.UTF8.GetBytes(json), "application/json; charset=utf-8", status);
        }

        static string JsonString(string s)
        {
            return "\"" + s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\r", " ").Replace("\n", " ") + "\"";
        }

        static void HandleFinbotProxy(HttpListenerRequest req, HttpListenerResponse res)
        {
            string bodyText;
            using (StreamReader reader = new StreamReader(req.InputStream, Encoding.UTF8))
            {
                bodyText = reader.ReadToEnd();
            }
            string secret = req.Headers["secret"];
            if (string.IsNullOrEmpty(secret))
            {
                SendJsonError(res, "לא נשלח מפתח API (secret header חסר).", 400);
                return;
            }
            try
            {
                HttpWebRequest webReq = (HttpWebRequest)WebRequest.Create("https://api.finbotai.co.il/income");
                webReq.Method = "POST";
                webReq.ContentType = "application/json; charset=utf-8";
                webReq.Headers["secret"] = secret;
                webReq.UserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) QuoteAppServer/1.0";
                webReq.Accept = "application/json";
                webReq.Timeout = 20000;
                byte[] data = Encoding.UTF8.GetBytes(bodyText);
                webReq.ContentLength = data.Length;
                using (Stream s = webReq.GetRequestStream())
                {
                    s.Write(data, 0, data.Length);
                }

                using (HttpWebResponse webRes = (HttpWebResponse)webReq.GetResponse())
                using (Stream rs = webRes.GetResponseStream())
                using (StreamReader sr = new StreamReader(rs, Encoding.UTF8))
                {
                    string content = sr.ReadToEnd();
                    SendBytes(res, Encoding.UTF8.GetBytes(content), "application/json; charset=utf-8", (int)webRes.StatusCode);
                }
            }
            catch (WebException wex)
            {
                if (wex.Response != null)
                {
                    using (Stream rs = wex.Response.GetResponseStream())
                    using (StreamReader sr = new StreamReader(rs, Encoding.UTF8))
                    {
                        string content = sr.ReadToEnd();
                        int status = (int)((HttpWebResponse)wex.Response).StatusCode;
                        SendBytes(res, Encoding.UTF8.GetBytes(content), "application/json; charset=utf-8", status);
                    }
                }
                else
                {
                    SendJsonError(res, "שגיאת תקשורת עם Finbot: " + wex.Message, 502);
                }
            }
            catch (Exception ex)
            {
                SendJsonError(res, "שגיאת תקשורת עם Finbot: " + ex.Message, 502);
            }
        }
    }
}
