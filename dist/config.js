// Supabase 連線設定（照 README「Supabase 設定」填入）。
// 這裡的 anon 公開金鑰本來就會給瀏覽器看到，安全靠資料庫的權限規則（schema.sql），不是靠藏金鑰。
// 千萬不要把 service_role 金鑰放進來。
window.LOVE_CONFIG={
  supabaseUrl:'',        // 例：https://abcdefghijkl.supabase.co
  supabaseAnonKey:'',    // Project Settings → API → anon public（或 Publishable key）
  emails:{               // 在 Authentication → Users 建立的兩個帳號
    boyfriend:'',
    girlfriend:''
  }
};
