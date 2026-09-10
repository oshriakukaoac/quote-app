async function handleForgotPassword(){
  if(authBusy) return;
  showErr('');
  const email = document.getElementById('email').value.trim();
  if(!email){ showErr('נא להזין אימייל'); return; }
  setAuthBusy(true, 'mainActionBtn', 'שולח...');
  try{
    const { error } = await withTimeout(supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: location.origin + '/reset-password.html'
    }));
    setAuthBusy(false, 'mainActionBtn');
    if(error){ showErr(friendlyAuthError(error)); return; }
    document.getElementById('formArea').style.display = 'none';
    showInfo('איפוס סיסמה נשלח למייל. אנא בדקו בתיבת הדואר הנכנס או בספאם.');
  }catch(e){
    setAuthBusy(false, 'mainActionBtn');
    showErr(e.message);
  }
}

document.getElementById('email').addEventListener('keydown', e => { if(e.key === 'Enter') handleForgotPassword(); });
