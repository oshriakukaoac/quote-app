let pendingFactorId = null;

function showMfaStep(factorId){
  pendingFactorId = factorId;
  document.getElementById('credsStep').style.display = 'none';
  document.getElementById('mfaStep').style.display = 'block';
  document.getElementById('titleText').textContent = 'אימות דו-שלבי';
  showErr(''); showInfo('');
}

async function handleSignIn(){
  if(authBusy) return;
  showErr('');
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  if(!email || !password){ showErr('נא למלא אימייל וסיסמה'); return; }
  setAuthBusy(true, 'mainActionBtn', 'מתחבר...');
  const stopStatus = startLiveStatus('🔄 מתחבר לשרת...', 8);
  try{
    const { error } = await withTimeout(supabaseClient.auth.signInWithPassword({ email, password }));
    stopStatus();
    setAuthBusy(false, 'mainActionBtn');
    if(error){ showErr(friendlyAuthError(error)); return; }
    await afterSignedIn({ showMfaStep });
  }catch(e){
    stopStatus();
    setAuthBusy(false, 'mainActionBtn');
    showErr(e.message + ' — ודאו שאין תוסף אבטחה בדפדפן שחוסם, או נסו בגלישה בסתר.');
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
    location.href = 'index.html';
  }catch(e){
    setAuthBusy(false, 'mfaBtn');
    showErr(e.message);
  }
}

document.getElementById('password').addEventListener('keydown', e => { if(e.key === 'Enter') handleSignIn(); });
document.getElementById('mfaCode').addEventListener('keydown', e => { if(e.key === 'Enter') handleMfaVerify(); });

// אם כבר יש סשן פעיל ותקין - לדלג ישר קדימה
(async function checkExistingSession(){
  try{
    const { data } = await withTimeout(supabaseClient.auth.getSession(), 8000);
    if(data.session) await afterSignedIn({ showMfaStep });
  }catch(e){ /* אם זה נתקע - פשוט נשארים במסך ההתחברות הרגיל */ }
})();
