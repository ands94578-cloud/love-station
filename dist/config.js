// Supabase 連線設定（照 README「Supabase 設定」填入）。
// Publishable key 本來就會給瀏覽器看到，安全靠資料庫的權限規則（schema.sql），不是靠藏金鑰。
// 千萬不要把 Secret key（service_role）放進來。登入 email 也不要寫在這裡：這個儲存庫是公開的。
window.LOVE_CONFIG={
  supabaseUrl:'https://nhbsscoxtgqaekrvvvzy.supabase.co',
  supabaseAnonKey:'sb_publishable_VicuEgs9Vwk3xar3qJL54g_2Yo_lUh_',
  vapidPublicKey:'BC6e8_excpjtypGICjI3koKH88OMxXmZMS28qil6kND6AJHrXXFEVLdp5o4EflWDktFBGGji1lnvHzGZ98a9ttU'   // 手機推播的公開金鑰；私密金鑰只放在 Supabase 的 Secrets
};
