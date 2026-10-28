// Supabase Edge Function：通知另一半「有新的小驚喜」。
// 部署：Supabase → Edge Functions → Deploy a new function → Via Editor，名稱 notify-partner，貼上整份。
// 需要的密鑰（Edge Functions → Secrets）：VAPID_PRIVATE_KEY。
// 通知刻意不寫內容，要點進 App 才看得到是什麼。
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.117.3';

// 這三個值本來就是公開的（網站的 config.js 裡也有）。
const SUPABASE_URL = 'https://nhbsscoxtgqaekrvvvzy.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_VicuEgs9Vwk3xar3qJL54g_2Yo_lUh_';
const VAPID_PUBLIC_KEY = 'BC6e8_excpjtypGICjI3koKH88OMxXmZMS28qil6kND6AJHrXXFEVLdp5o4EflWDktFBGGji1lnvHzGZ98a9ttU';
const SITE = 'https://ands94578-cloud.github.io/love-station/';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

webpush.setVapidDetails(SITE, VAPID_PUBLIC_KEY, Deno.env.get('VAPID_PRIVATE_KEY') ?? '');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'method_not_allowed' });

  // 用呼叫者自己的登入憑證查資料，資料庫權限規則照樣生效。
  const authorization = req.headers.get('Authorization') ?? '';
  const sb = createClient(SUPABASE_URL, PUBLISHABLE_KEY, { global: { headers: { Authorization: authorization } } });
  const { data: { user } } = await sb.auth.getUser(authorization.replace(/^Bearer /, ''));
  if (!user) return reply(401, { error: 'not_signed_in' });

  const { data: subs, error } = await sb.rpc('partner_push_subscriptions');
  if (error) return reply(500, { error: error.message });

  const payload = JSON.stringify({ title: '寶貝的戀愛補給站', body: '有新的小驚喜在等你 ♡', url: SITE });
  let sent = 0;
  await Promise.all((subs ?? []).map(async (s: { endpoint: string; p256dh: string; auth: string }) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400, urgency: 'high' });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      // 手機關掉通知或換機後，這個地址就失效了，順手清掉。
      if (code === 404 || code === 410) await sb.rpc('remove_push_subscription', { p_endpoint: s.endpoint });
    }
  }));
  return reply(200, { sent });
});
