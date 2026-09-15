let recoveryReady = false;
let pendingFactorId = null;

async function handleUpdatePassword(){
  if(authBusy) return;
  showErr('');
  const p1 = document.getElementById('newPassword').value;
  const p2 = document.getElementById('newPassword2').value;
  if(p1.length < 6){ showErr('הסיסמה חייבת להיות לפחות 6 תווים'); return; }
  if(p1 !== p2){ showErr('הסיסמאות אינן תואמות'); return; }
  setAuthBusy(true, 'saveBtn', 'שומר...');
  try{
    const { error } = await withTimeout(supabaseClient.auth.updateUser({ password: p1 }));
    setAuthBusy(false, 'saveBtn');
    if(error){ showErr(friendlyAuthError(error)); return; }
    document.getElementById('formArea').style.display = 'none';
    showInfo('הסיסמה עודכנה בהצלחה! מעביר אתכם להתחברות...');
    setTimeout(() => location.href = 'login.html', 2000);
  }catch(e){
    setAuthBusy(false, 'saveBtn');
    showErr(e.message);
  }
}

async function handleMfaVerify(){
  if(authBusy) return;
  showErr('');
  const code = document.getElementById('mfaCode').value.trim();
  if(!/^\d{6}$/.test(code)){ showErr('קוד האימות חייב להיות 6 ספרות'); return; }
  setAuthBusy(true, 'mfaBtn', 'מאמת...');
  try{
    const { data: challenge, error: chErr } = await withTimeout(supabaseClient.auth.mfa.challenge({ factorId: pendingFactorId }));
    if(chErr){ setAuthBusy(false, 'mfaBtn'); showErr(friendlyAuthError(chErr)); return; }
    const { error: verErr } = await withTimeout(supabaseClient.auth.mfa.verify({
      factorId: pendingFactorId, challengeId: challenge.id, code
    }));
    setAuthBusy(false, 'mfaBtn');
    if(verErr){ showErr('קוד שגוי, נסו שוב.'); return; }
    document.getElementById('mfaRecoveryStep').style.display = 'none';
    document.getElementById('titleText').textContent = 'קביעת סיסמה חדשה';
    showErr(''); showInfo('');
    document.getElementById('formArea').style.display = 'block';
  }catch(e){
    setAuthBusy(false, 'mfaBtn');
    showErr(e.message);
  }
}

/* אחרי שחזור סשן מהקישור במייל - בודקים אם צריך גם אימות דו-שלבי (AAL2) לפני
   שמאפשרים לקבוע סיסמה חדשה. אם למשתמש יש MFA מופעל, Supabase דורש את זה
   כדי למנוע ממי שיש לו רק גישה למייל (בלי הטלפון) לאפס סיסמה. */
async function proceedAfterRecovery(){
  try{
    const { data: aal, error: aalErr } = await withTimeout(supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel());
    if(aalErr){ showErr(friendlyAuthError(aalErr)); return; }

    if(aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2'){
      const { data: factors, error: factorsErr } = await withTimeout(supabaseClient.auth.mfa.listFactors());
      if(factorsErr){ showErr(friendlyAuthError(factorsErr)); return; }
      const totp = (factors.totp || []).find(f => f.status === 'verified');
      if(!totp){ showErr('שגיאת הגדרת אבטחה - פנו לתמיכה.'); return; }
      pendingFactorId = totp.id;
      document.getElementById('titleText').textContent = 'אימות דו-שלבי';
      document.getElementById('mfaRecoveryStep').style.display = 'block';
      return;
    }

    document.getElementById('formArea').style.display = 'block';
  }catch(e){
    showErr(e.message);
  }
}

document.getElementById('mfaCode').addEventListener('keydown', e => { if(e.key === 'Enter') handleMfaVerify(); });

// Supabase מפענח את הטוקנים מה-URL בעצמו ומשגר אירוע PASSWORD_RECOVERY
supabaseClient.auth.onAuthStateChange((event) => {
  if(event === 'PASSWORD_RECOVERY'){
    recoveryReady = true;
    proceedAfterRecovery();
  }
});

// אם אחרי רגע לא זוהה אירוע שחזור - כנראה הקישור לא תקין/פג תוקף
setTimeout(() => {
  if(!recoveryReady){
    showErr('הקישור לא תקין או שפג תוקפו. בקשו קישור חדש דרך "שכחתי סיסמה" במסך ההתחברות.');
  }
}, 2500);
