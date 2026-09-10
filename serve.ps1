# שרת מקומי קטן (ללא תלות בהתקנות - רק PowerShell המובנה בווינדוס).
# 1) מגיש את קבצי התוכנה (כמו פתיחה רגילה של index.html)
# 2) משמש כ"מתווך" ל-API של Finbot כדי לעקוף חסימת CORS של הדפדפן -
#    הדפדפן פונה ל-localhost (אותו מקור, מותר), והשרת הזה הוא שמדבר בפועל
#    עם Finbot מהצד שלו (קריאת שרת-לשרת, לא כפוף להגבלות CORS של דפדפן).
param([int]$Port = 8080)

# מכריח שימוש ב-TLS 1.2 בקריאות החוצה (ל-Finbot) - ב-Windows PowerShell 5.1
# ברירת המחדל לפעמים לא כוללת TLS 1.2, מה שגורם לכישלון חיבור ל-HTTPS מודרני.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$root = $PSScriptRoot
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "מריץ את התוכנה בכתובת: http://localhost:$Port/"
Write-Host "(השאירו את החלון הזה פתוח כל עוד אתם משתמשים בתוכנה. לסגירה: Ctrl+C)"

$mime = @{
  ".html"="text/html; charset=utf-8"; ".css"="text/css; charset=utf-8"
  ".js"="application/javascript; charset=utf-8"; ".json"="application/json; charset=utf-8"
  ".png"="image/png"; ".jpg"="image/jpeg"; ".svg"="image/svg+xml"; ".ico"="image/x-icon"
}

# שולח תשובה. תמיד "בולעת" שגיאות שקורות תוך כדי שליחה - כדי שלעולם לא תפיל
# את כל השרת (אם החיבור של הלקוח כבר נסגר וכו').
function Send-Bytes($res, [byte[]]$bytes, [string]$contentType, [int]$status = 200) {
  try {
    $res.StatusCode = $status
    $res.ContentType = $contentType
    $res.Headers.Add("Access-Control-Allow-Origin", "*")
    # מונע מהדפדפן לשמור בקאש גרסאות ישנות של html/js/css (גרם לכמה באגים "רפאים" בעבר)
    $res.Headers.Add("Cache-Control", "no-cache, no-store, must-revalidate")
    $res.Headers.Add("Pragma", "no-cache")
    $res.Headers.Add("Expires", "0")
    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
  } catch {
    Write-Host "[אזהרה] כשל בשליחת תשובה ללקוח: $($_.Exception.Message)"
  }
}

$latestFileExtensions = @(".csv", ".tsv", ".txt", ".xlsx")

# מאתר את הקובץ העדכני ביותר בתת-תיקייה נתונה (למשל "Mor-Levi") ומחזיר אותו כמו שהוא.
function Handle-LatestFile($res, [string]$folderName) {
  $folder = Join-Path $root $folderName
  if (-not (Test-Path $folder -PathType Container)) {
    Send-JsonError $res "התיקייה `"$folderName`" לא נמצאה." 404
    return
  }
  $latest = Get-ChildItem $folder -File | Where-Object { $latestFileExtensions -contains $_.Extension.ToLower() } | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1
  if (-not $latest) {
    Send-JsonError $res "לא נמצא קובץ מחירון בתיקייה `"$folderName`"." 404
    return
  }
  $bytes = [System.IO.File]::ReadAllBytes($latest.FullName)
  $ext = $latest.Extension.ToLower()
  $ct = if ($ext -eq ".xlsx") { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } else { "text/csv; charset=utf-8" }
  try { $res.Headers.Add("X-File-Name", [System.Uri]::EscapeDataString($latest.Name)) } catch {}
  Send-Bytes $res $bytes $ct 200
}

function Send-JsonError($res, [string]$message, [int]$status) {
  $json = (@{ status = 0; message = $message } | ConvertTo-Json)
  Send-Bytes $res ([System.Text.Encoding]::UTF8.GetBytes($json)) "application/json; charset=utf-8" $status
}

function Handle-FinbotProxy($req, $res) {
  try {
    $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
    $bodyText = $reader.ReadToEnd()
    $secret = $req.Headers["secret"]
    if([string]::IsNullOrWhiteSpace($secret)){
      Send-JsonError $res "לא נשלח מפתח API (secret header חסר)." 400
      return
    }
    try {
      $upstream = Invoke-WebRequest -Uri "https://api.finbotai.co.il/income" -Method Post `
        -Headers @{ "secret" = $secret } -ContentType "application/json; charset=utf-8" `
        -Body ([System.Text.Encoding]::UTF8.GetBytes($bodyText)) -UseBasicParsing -TimeoutSec 20
      $respBytes = [System.Text.Encoding]::UTF8.GetBytes($upstream.Content)
      Send-Bytes $res $respBytes "application/json; charset=utf-8" $upstream.StatusCode
    } catch {
      $webResp = $_.Exception.Response
      if ($webResp) {
        try {
          $stream = $webResp.GetResponseStream()
          $sr = New-Object System.IO.StreamReader($stream)
          $errBody = $sr.ReadToEnd()
          $statusCode = [int]$webResp.StatusCode
          Send-Bytes $res ([System.Text.Encoding]::UTF8.GetBytes($errBody)) "application/json; charset=utf-8" $statusCode
        } catch {
          Send-JsonError $res "שגיאת תקשורת עם Finbot: $($_.Exception.Message)" 502
        }
      } else {
        Write-Host "[Finbot proxy] שגיאה: $($_.Exception.Message)"
        Send-JsonError $res "שגיאת תקשורת עם Finbot: $($_.Exception.Message)" 502
      }
    }
  } catch {
    Write-Host "[Finbot proxy] שגיאה כללית: $($_.Exception.Message)"
    try { Send-JsonError $res "שגיאה פנימית בשרת המקומי: $($_.Exception.Message)" 500 } catch {}
  }
}

while ($listener.IsListening) {
  try {
    $context = $listener.GetContext()
  } catch {
    Write-Host "[שרת] שגיאה בקבלת בקשה: $($_.Exception.Message)"
    continue
  }
  $req = $context.Request
  $res = $context.Response
  try {
    $path = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath)

    if ($path -eq "/api/finbot/income" -and $req.HttpMethod -eq "POST") {
      Handle-FinbotProxy $req $res
    }
    elseif ($path -eq "/api/finbot/income") {
      Send-Bytes $res ([byte[]]@()) "text/plain" 200
    }
    elseif ($path -eq "/api/latest-file" -and $req.HttpMethod -eq "GET") {
      $folder = $req.QueryString["folder"]
      if ([string]::IsNullOrEmpty($folder)) { $folder = "Mor-Levi" }
      Handle-LatestFile $res $folder
    }
    else {
      if ($path -eq "/") { $path = "/index.html" }
      $filePath = Join-Path $root ($path.TrimStart('/'))
      if (Test-Path $filePath -PathType Leaf) {
        $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
        $ct = $mime[$ext]; if (-not $ct) { $ct = "application/octet-stream" }
        $bytes = [System.IO.File]::ReadAllBytes($filePath)
        Send-Bytes $res $bytes $ct 200
      } else {
        Send-Bytes $res ([System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $path")) "text/plain; charset=utf-8" 404
      }
    }
  } catch {
    Write-Host "[שרת] שגיאה בטיפול בבקשה: $($_.Exception.Message)"
    try { Send-JsonError $res "שגיאה פנימית: $($_.Exception.Message)" 500 } catch {}
  } finally {
    try { $res.OutputStream.Close() } catch {}
  }
}
