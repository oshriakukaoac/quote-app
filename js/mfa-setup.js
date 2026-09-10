let enrolledFactorId = null;

async function startEnrollment(){
  try{
    // ודא שיש סשן פעיל (בלי סשן אין טעם להישאר כאן)
    const { data: sessionData } = await withTimeout(supabaseClient.auth.getSession());
    if(!sessionData.session){ location.href = 'login.html'; return; }

    // אם כבר יש factor לא-מאומת מניסיון קודם שנקטע - ננקה אותו כדי להתחיל נקי
    const { data: factors } = await withTimeout(supabaseClient.auth.mfa.listFactors());
    const unverified = (factors && factors.totp || []).filter(f => f.status !== 'verified');
    for(const f of unverified){
      await withTimeout(supabaseClient.auth.mfa.unenroll({ factorId: f.id }));
    }
    const alreadyVerified = (factors && factors.totp || []).find(f => f.status === 'verified');
    if(alreadyVerified){
      // כבר יש MFA מוגדר ומאומת - אין צורך בהרשמה נוספת
      location.href = 'index.html';
      return;
    }

    const { data, error } = await withTimeout(supabaseClient.auth.mfa.enroll({ factorType: 'totp' }));
    if(error){ showErr(friendlyAuthError(error)); return; }
    enrolledFactorId = data.id;
    document.getElementById('qrHolder').innerHTML = data.totp.qr_code;
    document.getElementById('secretText').textContent = data.totp.secret;
  }catch(e){
    showErr(e.message);
  }
}

async function verifyEnrollment(){
  if(authBusy) return;
  showErr('');
  const code = document.getElementById('mfaCode').value.trim();
  if(!/^\d{6}$/.test(code)){ showErr('קוד האימות חייב להיות 6 ספרות'); return; }
  if(!enrolledFactorId){ showErr('שגיאה: לא נמצא רישום פעיל. רעננו את הדף ונסו שוב.'); return; }

  setAuthBusy(true, 'verifyBtn', 'מאמת...');
  try{
    const { data: challenge, error: chErr } = await withTimeout(supabaseClient.auth.mfa.challenge({ factorId: enrolledFactorId }));
    if(chErr){ setAuthBusy(false, 'verifyBtn'); showErr(friendlyAuthError(chErr)); return; }
    const { error: verErr } = await withTimeout(supabaseClient.auth.mfa.verify({
      factorId: enrolledFactorId, challengeId: challenge.id, code
    }));
    setAuthBusy(false, 'verifyBtn');
    if(verErr){ showErr('קוד שגוי, נסו שוב.'); return; }

    document.getElementById('formArea').style.display = 'none';
    showInfo('נרשמת בהצלחה! מעביר אותך לאתר...');
    setTimeout(() => location.href = 'index.html', 1500);
  }catch(e){
    setAuthBusy(false, 'verifyBtn');
    showErr(e.message);
  }
}

document.getElementById('mfaCode').addEventListener('keydown', e => {
  if(e.key === 'Enter') verifyEnrollment();
});

startEnrollment();
