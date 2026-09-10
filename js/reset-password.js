let recoveryReady = false;

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

// Supabase מפענח את הטוקנים מה-URL בעצמו ומשגר אירוע PASSWORD_RECOVERY
supabaseClient.auth.onAuthStateChange((event) => {
  if(event === 'PASSWORD_RECOVERY'){
    recoveryReady = true;
    document.getElementById('formArea').style.display = '';
  }
});

// אם אחרי רגע לא זוהה אירוע שחזור - כנראה הקישור לא תקין/פג תוקף
setTimeout(() => {
  if(!recoveryReady){
    showErr('הקישור לא תקין או שפג תוקפו. בקשו קישור חדש דרך "שכחתי סיסמה" במסך ההתחברות.');
  }
}, 2500);
