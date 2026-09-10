let progressTimer = null;

function setProgress(pct){
  const wrap = document.getElementById('progressWrap');
  const bar = document.getElementById('progressBar');
  wrap.style.display = pct > 0 ? 'block' : 'none';
  bar.style.width = pct + '%';
}

function startProgressAnimation(){
  let pct = 8;
  setProgress(pct);
  clearInterval(progressTimer);
  progressTimer = setInterval(() => {
    pct = Math.min(pct + (85 - pct) * 0.25, 85); // מתקרב ל-85% אבל לא מגיע אליו, עד שהתשובה חוזרת בפועל
    setProgress(Math.round(pct));
  }, 220);
}
function stopProgressAnimation(success){
  clearInterval(progressTimer);
  if(success){
    setProgress(100);
    setTimeout(() => setProgress(0), 500);
  } else {
    setProgress(0);
  }
}

async function handleSignUp(){
  if(authBusy) return;
  showErr('');
  const firstName = document.getElementById('firstName').value.trim();
  const lastName = document.getElementById('lastName').value.trim();
  const email = document.getElementById('email').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const password = document.getElementById('password').value;
  const password2 = document.getElementById('password2').value;

  if(!firstName || !lastName){ showErr('נא למלא שם פרטי ושם משפחה'); return; }
  if(!email){ showErr('נא למלא אימייל'); return; }
  if(!password){ showErr('נא למלא סיסמה'); return; }
  if(password.length < 6){ showErr('הסיסמה חייבת להיות לפחות 6 תווים'); return; }
  if(password !== password2){ showErr('הסיסמאות אינן תואמות'); return; }

  setAuthBusy(true, 'mainActionBtn', 'נרשם...');
  startProgressAnimation();

  let data, error;
  try{
    ({ data, error } = await withTimeout(supabaseClient.auth.signUp({
      email, password,
      options: { data: { first_name: firstName, last_name: lastName, phone } }
    })));
  }catch(e){
    setAuthBusy(false, 'mainActionBtn');
    stopProgressAnimation(false);
    showErr(e.message);
    return;
  }

  setAuthBusy(false, 'mainActionBtn');

  if(error){
    stopProgressAnimation(false);
    showErr(friendlyAuthError(error));
    return;
  }

  stopProgressAnimation(true);
  document.getElementById('formArea').style.display = 'none';

  if(data.session){
    showInfo('נרשמת בהצלחה! מעביר אותך להתחברות...');
  } else {
    showInfo('נרשמת בהצלחה! נשלח אליך מייל אימות - לחצו על הקישור בו, ואז התחברו כאן.');
  }
  setTimeout(() => location.href = 'login.html', 1600);
}

document.getElementById('password2').addEventListener('keydown', e => { if(e.key === 'Enter') handleSignUp(); });
