/* ===== הגדרות חיבור ל-Supabase =====
   שני הערכים כאן בטוחים להיות ציבוריים בקוד (לא סודיים) - הם מוגנים ע"י
   Row Level Security במסד הנתונים, שמוודא שכל משתמש רואה רק את הנתונים שלו. */
const SUPABASE_URL = 'https://gskegdynjkvlhxbhfuav.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ZxNyqMyp4mbgWtFLuPXTug_hj1k7jK-';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
