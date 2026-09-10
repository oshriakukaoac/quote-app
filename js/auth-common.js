/* ===== כלים משותפים למסכי ההתחברות/הרשמה/איפוס ===== */

function showErr(msg){
  const el = document.getElementById('errBox');
  if(!el) return;
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
  const info = document.getElementById('infoBox');
  if(info) info.style.display = 'none';
}
function showInfo(msg){
  const el = document.getElementById('infoBox');
  if(!el) return;
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
  const err = document.getElementById('errBox');
  if(err) err.style.display = 'none';
}

let authBusy = false;
function setAuthBusy(isBusy, btnId, busyLabel){
  authBusy = isBusy;
  const btn = document.getElementById(btnId);
  if(!btn) return;
  btn.disabled = isBusy;
  if(isBusy){
    btn.dataset.origText = btn.textContent;
    btn.textContent = busyLabel || 'רגע...';
  } else if(btn.dataset.origText){
    btn.textContent = btn.dataset.origText;
  }
}

/* עוטף Promise עם טיימאאוט - כדי שבקשה שנחסמת/נתקעת (למשל ע"י תוסף אבטחה
   בדפדפן) תיכשל אחרי כמה שניות עם הודעה ברורה, במקום להישאר תקועה לנצח. */
function withTimeout(promise, ms, timeoutMessage){
  ms = ms || 8000;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage || 'הבקשה נתקעה - כנראה תוסף בדפדפן חוסם אותה. נסו בגלישה בסתר.')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/* מציג חיווי חי "מתחבר... (Nש')" כל עוד הבקשה רצה, כדי שיהיה ברור שהמערכת
   באמת עובדת ולא תקועה. קוראים ל-stop() כשהתשובה חוזרת (הצלחה/שגיאה). */
function startLiveStatus(label, totalSeconds){
  let remaining = totalSeconds;
  showInfo(`${label} (עד ${remaining} שניות)`);
  const timer = setInterval(() => {
    remaining -= 1;
    if(remaining > 0) showInfo(`${label} (עד ${remaining} שניות)`);
  }, 1000);
  return function stop(){ clearInterval(timer); showInfo(''); };
}

function friendlyAuthError(error){
  if(!error) return 'שגיאה לא ידועה';
  if(error.status === 429) return 'יותר מדי ניסיונות ברצף. המתינו כמה דקות ונסו שוב.';
  if(error.message && /invalid login credentials/i.test(error.message)) return 'אימייל או סיסמה שגויים.';
  return error.message || 'שגיאה לא ידועה';
}

/* קוראים לזה מיד אחרי signIn מוצלח. בודק אם נדרש עוד שלב MFA,
   מציג אותו במקום, או ממשיך ל-index.html / mfa-setup.html בהתאם. */
async function afterSignedIn(mfaStepEls){
  const { data: aal, error: aalErr } = await supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel();
  if(aalErr){ showErr(friendlyAuthError(aalErr)); return; }

  if(aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2'){
    const { data: factors, error: factorsErr } = await supabaseClient.auth.mfa.listFactors();
    if(factorsErr){ showErr(friendlyAuthError(factorsErr)); return; }
    const totp = (factors.totp || []).find(f => f.status === 'verified');
    if(!totp){ showErr('שגיאת הגדרת אבטחה - פנו לתמיכה.'); return; }
    if(mfaStepEls) mfaStepEls.showMfaStep(totp.id);
    return;
  }

  const { data: factors2 } = await supabaseClient.auth.mfa.listFactors();
  const hasVerified = (factors2 && factors2.totp || []).some(f => f.status === 'verified');
  if(!hasVerified){
    location.href = 'mfa-setup.html';
    return;
  }

  location.href = 'index.html';
}
