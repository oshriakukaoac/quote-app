/* ===== שומר גישה: דורש התחברות (וMFA מאומת) בכל עמודי התוכנה =====
   חייב להיטען אחרי supabase-config.js ולפני שאר קוד העמוד.
   כולל טיימאאוט הגנתי: אם הבקשה ל-Supabase נתקעת (למשל בגלל תוסף אבטחה
   שחוסם בשקט), לא נשארים תקועים לנצח - מציגים הודעה ברורה. */
(async function requireAuth(){
  function timeoutPromise(ms){
    return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
  }
  try{
    const { data } = await Promise.race([
      supabaseClient.auth.getSession(),
      timeoutPromise(8000)
    ]);
    if(!data.session){ location.href = 'login.html'; return; }
    try{
      const { data: aal } = await Promise.race([
        supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel(),
        timeoutPromise(8000)
      ]);
      if(aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2'){
        // יש סשן אבל עוד לא הושלם אימות דו-שלבי לסשן הזה - חוזרים להתחברות להשלים
        location.href = 'login.html';
      }
    }catch(e){
      // אם בדיקת ה-MFA נתקעת - עדיף לתת למשתמש להמשיך (יש כבר סשן תקף)
      // במקום לתקוע אותו על מסך ריק, אבל נרשום אזהרה בקונסולה.
      console.warn('[auth-guard] בדיקת MFA נכשלה/נתקעה:', e.message);
    }
  }catch(e){
    console.error('[auth-guard] כשל בבדיקת התחברות (ייתכן תוסף חוסם):', e.message);
    document.title = 'שגיאת חיבור - ' + document.title;
    const banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;top:0;right:0;left:0;background:#c8393a;color:#fff;padding:10px 16px;text-align:center;font-size:.9rem;z-index:9999;';
    banner.textContent = 'שגיאה בבדיקת ההתחברות (ייתכן תוסף בדפדפן חוסם) - אם התוכנה לא עובדת, נסו בגלישה בסתר. ';
    const link = document.createElement('a');
    link.href = 'login.html'; link.textContent = 'חזרה להתחברות'; link.style.color = '#fff'; link.style.textDecoration = 'underline';
    banner.appendChild(link);
    document.addEventListener('DOMContentLoaded', () => document.body.prepend(banner));
    if(document.body) document.body.prepend(banner);
  }
})();

async function handleSignOut(){
  try{
    await Promise.race([
      supabaseClient.auth.signOut(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))
    ]);
  }catch(e){ /* גם אם זה נכשל - עדיין נעביר להתחברות */ }
  location.href = 'login.html';
}
