// Supabase 連線設定（照 README「Supabase 設定」填入）。
// Publishable key 本來就會給瀏覽器看到，安全靠資料庫的權限規則（schema.sql），不是靠藏金鑰。
// 千萬不要把 Secret key（service_role）放進來。登入 email 也不要寫在這裡：這個儲存庫是公開的。
window.LOVE_CONFIG={
  supabaseUrl:'https://nhbsscoxtgqaekrvvvzy.supabase.co',
  supabaseAnonKey:'sb_publishable_3g96LbV4Y6WV3DpT3RODqw_4URY_xjd'
};
