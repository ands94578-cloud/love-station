const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const coupons=[['甜點兌換券','🍰','美味補給','挑一份喜歡的甜點，今天的甜度由我負責。'],['飲料兌換券','🧋','美味補給','你的專屬外送員上線，甜度冰塊都記得。'],['宵夜兌換券','🍜','美味補給','晚一點也沒關係，陪你把肚子和心填滿。'],['早餐兌換券','🥐','美味補給','把早安做成你最喜歡的早餐。'],['大餐兌換券','🍝','美味補給','今晚你選餐廳，我負責買單與陪伴。'],['抱抱充電券','🧸','親密時光','給你一個不趕時間、剛剛好的擁抱。'],['親親兌換券','💋','親密時光','在彼此都願意的時候，送上一個甜甜的吻。'],['按摩放鬆券','👐','親密時光','舒舒服服的肩頸按摩，力道由你決定。'],['撒嬌通行券','🎀','親密時光','今天可以多黏我一點，你的撒嬌我接住。'],['浪漫約會券','🌷','一起生活','留一個下午給我們，行程由我用心安排。'],['電影之夜券','🎬','一起生活','你選電影，我準備零食與最舒服的位置。'],['散步牽手券','🌙','一起生活','把手機收起來，陪你慢慢走一段路。'],['家事代勞券','🧺','貼心照顧','挑一件家事交給我，讓你安心休息。'],['專心聽你說券','💌','貼心照顧','不急著給建議，先好好聽你把話說完。'],['驚喜小禮券','🎁','貼心照顧','一份為你挑選、在約定預算內的小驚喜。'],['任性願望券','✨','貼心照顧','提出一個小願望，我們一起商量怎麼完成。']].map((a,i)=>({id:i,name:a[0],icon:a[1],category:a[2],desc:a[3]}));
// [hash, icon, label, roles that can open it]
const pages=[['home','⌂','補給站首頁','bg'],['shop','✂','戀愛兌換券','g'],['draw','☆','每週小幸運','g'],['admin','⚙','男友後台','b'],['letters','✉','悄悄情書','bg'],['wishes','✧','許願池','g'],['mood','☀','今天的心情','g'],['memories','▧','我們的回憶','bg'],['games','⚄','情侶小遊戲','bg']];
const ROLE={boyfriend:{label:'男友',key:'b',from:'帥氣可愛小寶貝男友'},girlfriend:{label:'女友',key:'g'}};
const cfg=window.LOVE_CONFIG||{};

// ── 資料層：所有讀寫都經過 loveApi（測試時可整個換掉）──────────────
function makeSupabaseApi(){
  if(!cfg.supabaseUrl||!cfg.supabaseAnonKey||!window.supabase)return null;
  const sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
  const ok=({data,error})=>{if(error)throw error;return data};
  const rows=t=>sb.from(t).select('*').order('created_at').then(ok);
  return {
    async session(){return ok(await sb.auth.getSession()).session},
    onAuthChange(cb){sb.auth.onAuthStateChange((ev,s)=>cb(s))},
    async signIn(email,password){ok(await sb.auth.signInWithPassword({email,password}))},
    async signOut(){await sb.auth.signOut()},
    async load(userId){
      const profile=ok(await sb.from('profiles').select('*').eq('id',userId).maybeSingle());
      if(!profile)return {profile:null};
      const [couple,wallet,draws,letters,wishes,moods,memories]=await Promise.all([sb.from('couples').select('*').eq('id',profile.couple_id).single().then(ok),rows('issued_coupons'),rows('weekly_draws'),rows('letters'),rows('wishes'),rows('moods'),rows('memories')]);
      const paths=memories.map(m=>m.photo_path).filter(Boolean);
      if(paths.length){const urls=ok(await sb.storage.from('memories').createSignedUrls(paths,3600));const byPath=Object.fromEntries(urls.map(u=>[u.path,u.signedUrl]));memories.forEach(m=>m.photo=byPath[m.photo_path]||'')}
      return {profile,couple,wallet,draws,letters,wishes,moods,memories};
    },
    subscribe(cb){sb.channel('love-station').on('postgres_changes',{event:'*',schema:'public'},cb).subscribe()},
    async drawWeekly(){return ok(await sb.rpc('draw_weekly'))},
    async requestRedeem(id,note){ok(await sb.rpc('request_redeem',{p_id:id,p_note:note}))},
    async completeRedeem(id){ok(await sb.rpc('complete_redeem',{p_id:id}))},
    async giftCoupon(coupon){ok(await sb.rpc('gift_coupon',{p_coupon:coupon}))},
    async replyWish(id,reply,status){ok(await sb.rpc('reply_wish',{p_id:id,p_reply:reply,p_status:status}))},
    async updateSettings(nickname,anniversary){ok(await sb.rpc('update_settings',{p_nickname:nickname,p_anniversary:anniversary||null}))},
    async insert(table,row){ok(await sb.from(table).insert(row))},
    async uploadPhoto(path,file){ok(await sb.storage.from('memories').upload(path,file,{contentType:file.type}))}
  };
}
window.loveApi=window.loveApi||makeSupabaseApi();

// Login emails stay on this phone only, never in the public source.
const savedEmail=r=>{try{return localStorage.getItem('love-station-email-'+r)||''}catch{return ''}};
const saveEmail=(r,v)=>{try{localStorage.setItem('love-station-email-'+r,v)}catch{}};
let session=null,state=null,page='home',filter='全部',shopMode='catalog',moodSelected='開心',gameType='真心話',busy=false,loginRole=savedEmail('last-role')==='boyfriend'?'boyfriend':'girlfriend';
const role=()=>state?.profile?.role;
const me=()=>ROLE[role()];
const fromName=r=>r==='boyfriend'?ROLE.boyfriend.from:(state.couple.nickname||'寶貝');
const fmt=ts=>ts?new Date(ts).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'';
function toast(t){$('#toast').textContent=t;$('#toast').classList.add('show');clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3200)}
function weekInfo(now=Date.now()){const d=new Date(now+8*3600000);const day=d.getUTCDay();d.setUTCDate(d.getUTCDate()-((day+6)%7));d.setUTCHours(0,0,0,0);return {key:d.toISOString().slice(0,10),next:d.getTime()-8*3600000+7*86400000}}
const drawnThisWeek=()=>state.draws.some(d=>d.user_id===session.user.id&&d.week_start===weekInfo().key);
function errMsg(e){const m=String(e?.message||e);
  if(m.includes('already_drawn'))return '本週已領過幸運券囉，下週一再來！';
  if(m.includes('invalid_state'))return '這張券的狀態剛剛變了，畫面已更新。';
  if(m.includes('forbidden')||m.includes('row-level security'))return '這個動作只有另一半可以做喔。';
  if(m.includes('future_date'))return '紀念日不能設定在未來喔。';
  if(m.includes('Invalid login credentials'))return '密碼不對喔，再試一次。';
  if(m.includes('Failed to fetch')||m.includes('NetworkError'))return '連不上網路，等一下再試。';
  return '出了點小狀況：'+m}

async function refresh(keep=true,asModal=false){if(!session)return;state=await window.loveApi.load(session.user.id);const fresh=takeUnnotified();render(keep);if(!fresh.length)return;if(asModal&&!busy&&!$('#modal').open)notifyModal(fresh);else toast(fresh.length===1?fresh[0].icon+' '+fresh[0].text:`💝 有 ${fresh.length} 個新的小驚喜，看看選單上的紅點`)}
let refreshTimer;const refreshSoon=(asModal=false)=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>refresh(true,asModal).catch(()=>{}),300)};

// ── 通知：另一半的新動作。seen = 已經點進那一頁看過；notified = 已經跳過通知 ──
const readKeys=k=>{try{return new Set(JSON.parse(localStorage.getItem(k+session.user.id)||'[]'))}catch{return new Set()}};
const writeKeys=(k,set)=>{try{localStorage.setItem(k+session.user.id,JSON.stringify([...set].slice(-500)))}catch{}};
function events(){const mine=session.user.id,they=role()==='boyfriend'?'她':'他',out=[];const add=(key,page,icon,text,ts)=>out.push({key,page,icon,text,ts:ts||''});
  state.letters.filter(l=>l.author!==mine).forEach(l=>add('letter:'+l.id,'letters','💌',`${they}寫了一封情書給你：「${l.title}」`,l.created_at));
  state.memories.filter(m=>m.author!==mine).forEach(m=>add('memory:'+m.id,'memories','▧',`${they}收藏了一個回憶：「${m.title}」`,m.created_at));
  if(role()==='girlfriend'){
    state.wallet.forEach(w=>{const c=coupons[w.coupon];if(w.source==='男友的小驚喜')add('gift:'+w.id,'shop','🎟️',`他偷偷送你一張${c.name}`,w.created_at);if(w.status==='done')add('done:'+w.id,'shop','✅',`他兌現了你的${c.name} ♡`,w.done_at)});
    state.wishes.filter(w=>w.reply).forEach(w=>add('reply:'+w.id+':'+w.status+':'+w.reply,'wishes','✧',`他回覆了你的願望（${w.status}）：「${w.reply}」`,w.created_at));
  }else{
    state.wallet.filter(w=>w.status==='pending').forEach(w=>add('redeem:'+w.id,'admin','🎟️',`她想兌換${coupons[w.coupon].name}${w.note?'：'+w.note:''}`,w.requested_at));
    state.draws.filter(d=>d.user_id!==mine).forEach(d=>add('draw:'+d.id,'admin','🎁',`她抽到了${coupons[d.coupon].name}`,d.created_at));
    state.wishes.forEach(w=>add('wish:'+w.id,'admin','✧',`她許了一個願望：「${w.body}」`,w.created_at));
    state.moods.forEach(m=>add('mood:'+m.id,'admin','☀',`她今天覺得「${m.mood}」：${m.need}`,m.created_at));
  }
  return out.sort((a,b)=>b.ts.localeCompare(a.ts))}
const unseen=()=>{const s=readKeys('love-station-seen-');return events().filter(e=>!s.has(e.key))};
function markSeen(p){const s=readKeys('love-station-seen-');let changed=false;for(const e of events())if(e.page===p&&!s.has(e.key)){s.add(e.key);changed=true}if(changed)writeKeys('love-station-seen-',s)}
function takeUnnotified(){const n=readKeys('love-station-notified-');const fresh=unseen().filter(e=>!n.has(e.key));fresh.forEach(e=>n.add(e.key));if(fresh.length)writeKeys('love-station-notified-',n);return fresh}
function notifyModal(list){if(!list.length)return;modal(`<span class="eyebrow">WHILE YOU WERE AWAY</span><div class="prize">💝</div><h2>有 ${list.length} 個新的小驚喜</h2><div class="notice-list">${list.slice(0,6).map(e=>`<button class="notice-item" data-page="${e.page}" data-close><span>${e.icon}</span><span>${esc(e.text)}</span></button>`).join('')}</div>${list.length>6?`<p class="small">還有 ${list.length-6} 則，看看選單上的紅點 ♡</p>`:''}<button data-close class="primary">我知道了 ♡</button>`)}

let installEvt=null;const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
function installCard(){if(standalone())return '';if(installEvt)return `<div class="banner row between"><span>把補給站放到手機桌面，打開就像 App ♡</span><button id="installApp" class="primary">加到桌面</button></div>`;if(isIOS)return '<div class="banner">♡ 想放到手機桌面嗎？用 Safari 點下方「分享」，再選「加入主畫面」。</div>';return ''}
function pageHeading(k,title,desc){return `<div class="page-top"><div class="eyebrow">${k}</div><h1>${title}</h1><p>${desc}</p></div>`}
function formKey(f){return f.id||f.dataset.id}
function keepForms(){const a=document.activeElement;return {focus:a?.form&&$('#app').contains(a)?[formKey(a.form),a.name]:null,forms:[...document.querySelectorAll('#app form')].map(f=>[formKey(f),[...f.elements].filter(x=>x.name&&x.type!=='file').map(x=>[x.name,x.value])])}}
function restoreForms(k){for(const [key,vals] of k.forms){const f=[...document.querySelectorAll('#app form')].find(f=>formKey(f)===key);if(f)for(const [n,v] of vals)if(f.elements[n])f.elements[n].value=v}if(k.focus){const f=[...document.querySelectorAll('#app form')].find(f=>formKey(f)===k.focus[0]);f?.elements[k.focus[1]]?.focus()}}

// ── 登入前的畫面 ───────────────────────────────────────────────
function gate(html){document.body.classList.add('signed-out');document.body.dataset.page='login';$('.demo').textContent='♡ 寶貝的戀愛補給站 · 只屬於我們兩個人';$('#nav').innerHTML='';$('#app').innerHTML=html}
function setupScreen(){gate(pageHeading('ALMOST THERE','補給站還差一步。','還沒連上資料庫，所以先不能登入。')+'<div class="card"><p>請照 README 的「Supabase 設定」建立專案，再把專案網址和公開金鑰填進 <b>config.js</b>。</p></div>')}
function loginScreen(){gate(`<section class="login"><img src="assets/dessert.webp" alt="粉紅手繪甜點兌換券"><div class="eyebrow">WELCOME TO OUR LITTLE LOVE CLUB</div><h1>今天是誰來補給呢？</h1><form id="loginForm" class="card form"><div class="role-pick">${[['girlfriend','🎀','我是女友','領券、抽獎、許願'],['boyfriend','🧸','我是男友','送券、回覆、照顧她']].map(([r,i,t,s])=>`<label><input type="radio" name="role" value="${r}" ${loginRole===r?'checked':''}><span><i>${i}</i><b>${t}</b><small>${s}</small></span></label>`).join('')}</div><label>Email<input type="email" name="username" required autocomplete="username" inputmode="email" autocapitalize="off" value="${esc(savedEmail(loginRole))}" placeholder="登入用的 email"></label><label>密碼<input type="password" name="password" required autocomplete="current-password" placeholder="輸入我們的小密碼"></label><button class="primary">登入補給站 ♡</button><span class="small">登入一次會記住，下次打開就不用再輸入。email 只存在這支手機。</span></form></section>`)}
function unboundScreen(){gate(pageHeading('ONE MORE STEP','帳號還沒綁定情侶。','這個帳號已經登入，但資料庫裡還沒設定你是男友還是女友。')+'<div class="card"><p>請在 Supabase 的 SQL Editor 執行 schema.sql 最下面的「綁定情侶」區塊，再重新整理。</p><button data-logout>登出</button></div>')}

// ── 主畫面 ─────────────────────────────────────────────────────
function render(keep){
  if(!window.loveApi)return setupScreen();
  if(!session)return loginScreen();
  if(!state)return gate('<div class="card empty">正在打開補給站…</div>');
  if(!state.profile)return unboundScreen();
  document.body.classList.remove('signed-out');
  const kept=keep?keepForms():null;const allowed=pages.filter(x=>x[3].includes(me().key));
  page=location.hash.slice(1)||'home';if(!allowed.some(x=>x[0]===page)){page='home';history.replaceState(null,'','#home')}
  markSeen(page);const unread={};let total=0;for(const e of unseen()){unread[e.page]=(unread[e.page]||0)+1;total++}if(navigator.setAppBadge)(total?navigator.setAppBadge(total):navigator.clearAppBadge()).catch(()=>{});
  $('#nav').innerHTML=allowed.map(x=>`<a href="#${x[0]}" class="${page===x[0]?'active':''}" ${page===x[0]?'aria-current="page"':''}><span>${x[1]}</span>${x[2]}${unread[x[0]]?`<b class="badge" aria-label="${unread[x[0]]} 則新消息">${unread[x[0]]}</b>`:''}</a>`).join('');
  const w=$('header .wallet');if(role()==='girlfriend'){w.dataset.page='shop';w.firstChild.textContent='我的票夾 ';$('#walletCount').textContent=state.wallet.filter(x=>x.status==='available').length}else{w.dataset.page='admin';w.firstChild.textContent='待兌換 ';$('#walletCount').textContent=state.wallet.filter(x=>x.status==='pending').length}
  $('.demo').innerHTML=`♡ ${me().label}已登入 · 和另一半即時同步 <button data-logout>登出</button>`;
  document.body.dataset.page=page;$('#app').innerHTML=({home,shop,draw,letters,wishes,mood,memories,games,admin})[page]();if(kept)restoreForms(kept);updateCountdown()
}
function days(){const a=state.couple.anniversary;return a?Math.max(0,Math.floor((Date.now()-new Date(a+'T00:00:00+08:00'))/86400000)+1):null}
function home(){return role()==='boyfriend'?homeBoyfriend():homeGirlfriend()}
function homeGirlfriend(){const d=days();return `<section class="hero"><div><div class="eyebrow">A LITTLE LOVE, JUST FOR YOU</div><h1>嗨，${esc(state.couple.nickname)}。<br>今天也要被寵愛 ♡</h1><p>把小小的喜歡，變成摸得到的幸福。<br>這裡的甜、抱抱和偏愛，通通只給你。</p><button class="primary" data-page="shop">領取今天的甜蜜 ↗</button></div><img src="assets/dessert.webp" alt="粉紅手繪甜點兌換券：奶油白小狗、蝴蝶結灰貓與草莓蛋糕"></section>${installCard()}<div class="section-head"><div><h2>今天，想補給什麼？</h2><p>不需要特別的理由，你值得一點小幸福。</p></div><span class="eyebrow">LOVE MENU</span></div><div class="grid quick-grid"><button class="card quick-card" data-page="shop"><span class="icon">🎟️</span><h3>把喜歡兌現</h3><p>甜點、約會、抱抱，16 種偏愛 →</p></button><button class="card quick-card" data-page="draw"><span class="icon">🎁</span><h3>每週的小幸運</h3><p>${drawnThisWeek()?'本週驚喜已收到，下週再見':'本週還有 1 次，來拆開驚喜'} →</p></button><button class="card quick-card" data-page="letters"><span class="icon">💌</span><h3>有些話，只想給你</h3><p>打開一封藏著喜歡的情書 →</p></button></div><div class="home-bottom"><div class="note"><div class="eyebrow">A NOTE FOR YOU</div><h2 style="margin-top:13px">今天也辛苦了。</h2><p>世界可以很忙，但我會記得，<br>把最柔軟的位置留給你。</p><div class="small" style="text-align:right;margin-top:13px">— 你的專屬補給員 ♡</div></div><div class="card"><div class="row between"><h3>我們的小日常</h3><span class="tag">${d?`相愛第 ${d} 天`:'等待填上紀念日'}</span></div><p>今天的心情，有沒有想偷偷告訴我？</p><div class="moods">${[['🥰','開心'],['🙂','平靜'],['🥺','低落'],['😴','疲累']].map(([x,t])=>`<button data-page="mood" data-mood="${t}" aria-label="記錄今天的心情：${t}">${x}</button>`).join('')}</div><button class="text-link" data-page="memories">收藏一個屬於我們的瞬間 ↗</button></div></div>`}
function homeBoyfriend(){const d=days(),pending=state.wallet.filter(w=>w.status==='pending').length,open=state.wishes.filter(w=>!w.reply).length,m=state.moods.at(-1);return `<section class="hero"><div><div class="eyebrow">YOUR PERSONAL LOVE MANAGER</div><h1>嗨，帥氣可愛小寶貝男友。<br>今天也要好好寵她 ♡</h1><p>她的兌換、願望和心情都會出現在這裡。<br>把「我會記得」，變成真的。</p><button class="primary" data-page="admin">打開男友後台 ↗</button></div><img src="assets/dessert.webp" alt="粉紅手繪甜點兌換券：奶油白小狗、蝴蝶結灰貓與草莓蛋糕"></section>${installCard()}<div class="section-head"><div><h2>今天，要為她做什麼？</h2><p>小小的回應，就是很大的安心。</p></div><span class="eyebrow">TO-DO WITH LOVE</span></div><div class="grid quick-grid"><button class="card quick-card" data-page="admin"><span class="icon">🎟️</span><h3>等你兌現的券</h3><p>${pending?`有 ${pending} 張在等你回應`:'目前都兌現完了，送她一張驚喜吧'} →</p></button><button class="card quick-card" data-page="admin"><span class="icon">✧</span><h3>她的小願望</h3><p>${open?`${open} 個願望還沒回覆`:'每個願望都回覆過了'} →</p></button><button class="card quick-card" data-page="letters"><span class="icon">💌</span><h3>寫一封情書給她</h3><p>把不好意思說的話寫下來 →</p></button></div><div class="home-bottom"><div class="note"><div class="eyebrow">HER MOOD TODAY</div>${m?`<h2 style="margin-top:13px">她最近覺得「${esc(m.mood)}」</h2><p>她想要：${esc(m.need)}${m.body?`<br>${esc(m.body)}`:''}</p><div class="small" style="text-align:right;margin-top:13px">${fmt(m.created_at)}</div>`:'<h2 style="margin-top:13px">她還沒留下心情。</h2><p>找個時間問問她今天過得好嗎？</p>'}</div><div class="card"><div class="row between"><h3>我們的小日常</h3><span class="tag">${d?`相愛第 ${d} 天`:'到後台填上紀念日'}</span></div><p>一起收藏的瞬間：${state.memories.length} 個</p><button class="text-link" data-page="memories">收藏一個屬於我們的瞬間 ↗</button></div></div>`}
const couponThemes=['rose','honey','lilac','honey','sage','rose','rose','sage','lilac','sage','lilac','lilac','honey','rose','honey','lilac'];
const couponEnglish=['DESSERT TIME','SIP OF HAPPINESS','MIDNIGHT TREAT','GOOD MORNING','DINNER FOR TWO','A LITTLE HUG','SWEET KISSES','TAKE A BREAK','SPOIL ME PLEASE','A DATE WITH YOU','MOVIE NIGHT','MOONLIGHT WALK','LET ME HELP','I AM ALL EARS','JUST FOR YOU','MAKE A WISH'];
function couponArt(c){
  if(c.id<3)return `<div class="coupon-print print-${c.id}" role="img" aria-label="${c.name}手繪插圖：奶油小狗與蝴蝶結小貓"></div>`;
  return `<img class="coupon-illustration" src="assets/coupons/coupon-${String(c.id).padStart(2,'0')}.png" alt="${c.name}：奶油小狗與蝴蝶結小貓手繪券" loading="lazy" decoding="async" width="1254" height="1254">`;
}
function ticket(c,w){const status=w?.status||'catalog';return `<article class="ticket theme-${couponThemes[c.id]} ticket-${status}"><div class="ticket-tape" aria-hidden="true"></div><div class="ticket-kicker"><span>FOR MY FAVORITE HUMAN</span><span>♡</span></div><div class="ticket-art">${couponArt(c)}</div><div class="ticket-body"><div class="ticket-category"><span>${c.category}</span><span>${w?({available:'可使用',pending:'等待回應',done:'已兌現'})[status]:'專屬於你'}</span></div><h3>${c.name}</h3><span class="ticket-english">${couponEnglish[c.id]}</span><p>${c.desc}</p><div class="ticket-stub"><span>NO. ${String(c.id+1).padStart(3,'0')}<small>${w?esc(w.source):'ONE LITTLE HAPPINESS'}</small></span><span class="ticket-seal">${status==='done'?'已兌現':'WITH<br>LOVE'}</span></div>${w?`<button ${status!=='available'?'disabled':''} data-redeem="${w.id}" class="ticket-action">${({available:'兌現這份偏愛 ♡',pending:'已送出・等他回應',done:'已收藏這份幸福 ✓'})[status]}</button>`:`<button data-detail="${c.id}" class="ticket-action">打開這張小幸福 <span>↗</span></button>`}</div></article>`}

function shop(){const list=shopMode==='wallet'?state.wallet.slice().reverse().map(w=>({c:coupons[w.coupon],w})):coupons.map(c=>({c}));return pageHeading('THE LOVE COUPON SHOP','把偏愛，放進口袋。','16 種小小幸福，每一張都是「我想對你好」的另一種說法。')+`<div class="row between"><div class="tabs"><button data-shop="catalog" class="${shopMode==='catalog'?'selected':''}">兌換券商店 · 16</button><button data-shop="wallet" class="${shopMode==='wallet'?'selected':''}">我的票夾 · ${state.wallet.length}</button></div><button class="text-link" data-page="draw">每週免費抽一張 ↗</button></div><div class="tabs">${['全部','美味補給','親密時光','一起生活','貼心照顧'].map(t=>`<button data-filter="${t}" class="${filter===t?'selected':''}">${t}</button>`).join('')}</div><div class="grid coupon-grid">${list.filter(x=>filter==='全部'||x.c.category===filter).map(x=>ticket(x.c,x.w)).join('')||'<p class="empty full">這個分類還沒有券，去抽一份驚喜吧。</p>'}</div><div class="banner">♡ 商店供瀏覽券種；可用券由每週抽獎或男友贈送。兌換時間與內容一起商量，親密互動隨時可以改期或婉拒。</div>`}
function draw(){const used=drawnThisWeek(),mine=state.draws.filter(d=>d.user_id===session.user.id);return pageHeading('A WEEKLY LITTLE SURPRISE','這週的幸運，會是什麼呢？','轉一下，把一整週的小期待，變成一張只屬於你的戀愛券。')+`<section class="draw-panel"><span class="tag">每週一 00:00 更新 · 台北時間</span><div class="machine" id="machine"><div class="globe">${'<span></span>'.repeat(6)}</div><div class="machine-base"><b>♡</b></div></div><h2>${used?'這週的偏愛已經送達！':'今天的驚喜，等你打開'}</h2><p>16 種兌換券等機率抽取，每次一定獲得 1 張。</p><button id="drawButton" class="primary" ${used||busy?'disabled':''}>${busy?'正在打開小幸運…':used?'本週已抽取 ♡':'轉出我的小幸運 ✨'}</button><p style="margin:20px 0 0">距離下一次補給</p><div class="countdown" id="countdown"></div><span class="small">抽中的券會自動放進「我的票夾」，男友也會看到</span></section><div class="section-head"><h2>我的幸運紀錄</h2></div>${mine.length?mine.slice().reverse().map(d=>`<div class="card row between"><span>${coupons[d.coupon].icon} ${coupons[d.coupon].name}</span><span class="small">${fmt(d.created_at)}</span></div>`).join(''):'<div class="card empty">第一份小幸運，還在等你 ♡</div>'}`}
function letters(){return pageHeading('LOVE, IN LITTLE WORDS','悄悄話，有一整封。','把不好意思當面說的喜歡，慢慢寫給彼此。')+`<div class="two"><form id="letterForm" class="card form"><h3>寫一封情書 ✉</h3><p class="small">寄件人：${esc(fromName(role()))}</p><label>信封上的話<input name="title" required maxlength="60" placeholder="今天又多喜歡你一點"></label><label>想說的話<textarea name="body" required maxlength="3000" placeholder="親愛的，我想告訴你…"></textarea></label><button class="primary">放進情書盒 ♡</button><span class="small">送出後，${role()==='boyfriend'?'她':'他'}打開補給站就會看到。</span></form><div class="stack">${state.letters.length?state.letters.slice().reverse().map(l=>`<button class="note" style="text-align:left" data-letter="${l.id}"><span class="eyebrow">${l.author===session.user.id?'FROM ME':'FOR YOU'}</span><h3 style="margin-top:15px">${esc(l.title)}</h3><p>${esc(l.body.length>65?l.body.slice(0,65)+'…':l.body)}</p><div class="small" style="margin-top:15px">${esc(fromName(l.author_role))} · ${fmt(l.created_at)}<br>輕輕拆開 ↗</div></button>`).join(''):'<div class="note"><h3>情書盒還空空的。</h3><p>第一封，要由誰先寫呢？</p></div>'}</div></div>`}
function wishes(){return pageHeading('MAKE A LITTLE WISH','你的願望，我想聽。','想去的地方、想吃的東西，或一個想被理解的小心情。')+`<div class="two"><form id="wishForm" class="card form"><h3>投下一顆願望星星 ✧</h3><label>願望類別<select name="category"><option>一起去旅行</option><option>一起吃好吃的</option><option>想收到的小驚喜</option><option>想對你說</option></select></label><label>我的小願望<textarea name="body" required maxlength="500" placeholder="想和你去海邊，看一次日落。"></textarea></label><button class="primary">讓願望漂向你 ✨</button></form><div class="stack">${state.wishes.length?state.wishes.slice().reverse().map(w=>`<article class="card entry"><span class="tag">${esc(w.status)}</span><p style="margin-top:12px">${esc(w.body)}</p>${w.reply?`<div class="note">男友回覆：${esc(w.reply)}</div>`:''}<small>${esc(w.category)} · ${fmt(w.created_at)}</small></article>`).join(''):'<div class="note"><h3>第一顆星星的位置，留給你。</h3><p>寫下願望後，男友會在他的後台看到並回覆。</p></div>'}</div></div>`}
function mood(){return pageHeading('EVERY FEELING IS WELCOME','今天的你，是什麼天氣？','晴天想陪你笑，下雨的時候，就陪你一起撐傘。')+`<div class="two"><form id="moodForm" class="card form"><h3>留一個心情給今天</h3><div class="moods">${[['🥰','開心'],['🙂','平靜'],['🥺','低落'],['😴','疲累'],['😤','煩躁']].map(([e,t])=>`<button type="button" data-mood="${t}" class="${moodSelected===t?'selected':''}">${e}<small>${t}</small></button>`).join('')}</div><label>想被怎麼陪伴？<select name="need"><option>給我一個抱抱</option><option>聽我說就好</option><option>陪我吃點好吃的</option><option>讓我安靜一下</option></select></label><label>多說一點點（選填）<textarea name="body" maxlength="500" placeholder="今天發生了…"></textarea></label><button class="primary">收藏今天的心情</button><span class="small">男友會在他的首頁看到你的心情。</span></form><div class="stack">${state.moods.length?state.moods.slice().reverse().map(m=>`<div class="card entry"><span class="tag">${esc(m.mood)}</span><h3 style="margin-top:12px">${esc(m.need)}</h3><p>${esc(m.body)||'今天先不說話，也沒關係。'}</p><small>${fmt(m.created_at)}</small></div>`).join(''):'<div class="note"><h3>每一種心情，都值得被接住。</h3><p>不必把心情整理得很漂亮，才來這裡。</p></div>'}</div></div>`}
function memories(){return pageHeading('OUR SCRAPBOOK','把我們，收藏起來。','平凡的一天，因為有你，就值得被記住。')+`<form id="memoryForm" class="card form"><div class="two"><label>這個瞬間的名字<input name="title" required maxlength="60" placeholder="第一次一起做甜點"></label><label>是哪一天？<input name="day" type="date" required></label></div><label>當時的小故事<textarea name="body" required maxlength="1000" placeholder="那天的蛋糕有點歪，但我們笑得很開心。"></textarea></label><label>貼一張照片（選填，JPG / PNG / WebP，最多 1 MB）<input type="file" name="photo" accept="image/jpeg,image/png,image/webp"></label><button class="primary">貼進我們的剪貼簿 ♡</button></form><div class="section-head"><h2>我們的時光小格子</h2><span class="small">${state.memories.length} 個瞬間</span></div><div class="grid">${state.memories.length?state.memories.slice().reverse().map(m=>`<article class="card entry">${m.photo?`<img class="memory-img" src="${esc(m.photo)}" alt="${esc(m.title)}">`:'<div class="memory-placeholder">🌷</div>'}<span class="small">${esc(m.day)} · ${esc(fromName(m.author===session.user.id?role():(role()==='boyfriend'?'girlfriend':'boyfriend')))}</span><h3 style="margin-top:10px">${esc(m.title)}</h3><p>${esc(m.body)}</p></article>`).join(''):'<div class="note full"><h3>還沒貼上照片的空白，也很可愛。</h3><p>從今天開始，一起把這裡填滿吧。</p></div>'}</div>`}
const questions={'真心話':['你最近一次覺得被我愛著，是什麼時候？','如果重來一次第一次約會，你想帶我去哪裡？','有什麼小事是你一直想和我一起做的？','哪一個屬於我們的瞬間，你想再過一次？','你喜歡我怎麼安慰你？'],'甜蜜任務':['看著對方，說出今天最想感謝的一件事。','各挑一首歌，交換今天的心情。','如果彼此願意，牽手安靜待一分鐘。','用三個詞形容對方，告訴對方原因。','一起安排一個不用花錢的小約會。'],'默契二選一':['海邊日落，還是山上日出？','在家煮飯，還是出門探店？','驚喜約會，還是一起規劃？','下雨天看電影，還是窩著聊天？','收到一封情書，還是一束花？']};
function games(){return pageHeading('PLAY A LITTLE, LOVE A LOT','今天，重新認識你。','不用分輸贏的小遊戲，只要多靠近彼此一點。')+`<div class="tabs">${Object.keys(questions).map(t=>`<button data-game="${t}" class="${gameType===t?'selected':''}">${t}</button>`).join('')}</div><div class="card game-card"><span class="eyebrow">JUST THE TWO OF US</span><div style="font-size:45px;margin-top:18px">${gameType==='甜蜜任務'?'🎀':gameType==='真心話'?'💌':'🧩'}</div><div id="question" class="game-question">${questions[gameType][0]}</div><button id="nextQuestion" class="primary">換一張小卡 ↻</button><p style="margin:20px 0 0">輪流回答，或先猜猜對方的答案。<br>不想回答或不想做，隨時都可以跳過。</p></div>`}
function admin(){const pending=state.wallet.filter(w=>w.status==='pending');return pageHeading('FROM YOUR PERSONAL LOVE MANAGER','專屬寵愛，補貨中。','管理小驚喜、回應願望，把「我會記得」變成真的。')+`<div class="grid stats"><div class="card"><b>${pending.length}</b><span class="small">等待兌換</span></div><div class="card"><b>${state.wishes.filter(w=>w.status!=='已實現').length}</b><span class="small">等待實現的願望</span></div><div class="card"><b>${state.wallet.filter(w=>w.status==='done').length}</b><span class="small">已完成的小幸福</span></div></div><div class="section-head"><h2>兌換小清單</h2></div><div class="card">${pending.length?pending.map(w=>`<div class="table-row"><div class="row between"><h3>${coupons[w.coupon].icon} ${coupons[w.coupon].name}</h3><button data-complete="${w.id}">標記已完成 ♡</button></div><p>${esc(w.note)||'沒有附上備註，找時間一起聊聊吧。'}</p><span class="small">${fmt(w.requested_at)}</span></div>`).join(''):'<p style="margin:0">目前沒有等待兌換的券。</p>'}</div><div class="two"><form id="giftForm" class="card form"><h3>偷偷送一張券 🎟️</h3><label>挑選一份偏愛<select name="coupon">${coupons.map(c=>`<option value="${c.id}">${c.icon} ${c.name}</option>`).join('')}</select></label><p>送出後會直接出現在她的票夾裡。</p><button class="primary">送進寶貝的票夾</button></form><form id="settingsForm" class="card form"><h3>我們的小設定</h3><label>她的專屬暱稱<input name="nickname" value="${esc(state.couple.nickname)}" required maxlength="20"></label><label>在一起的日子<input type="date" name="anniversary" value="${esc(state.couple.anniversary||'')}"></label><button>儲存設定</button></form></div><div class="section-head"><h2>願望回音</h2></div><div class="stack">${state.wishes.slice().reverse().map(w=>`<form class="card form wishReply" data-id="${w.id}"><span class="small">${esc(w.category)} · ${fmt(w.created_at)}</span><p>${esc(w.body)}</p><label>回覆<input name="reply" value="${esc(w.reply||'')}" required maxlength="300"></label><label>進度<select name="status">${['已收到','安排中','已實現'].map(s=>`<option ${w.status===s?'selected':''}>${s}</option>`).join('')}</select></label><button>儲存回音</button></form>`).join('')||'<div class="card small">許願池有新願望時，就會出現在這裡。</div>'}</div><div class="section-head"><h2>她的心情紀錄</h2></div><div class="stack">${state.moods.slice(-10).reverse().map(m=>`<div class="card entry"><span class="tag">${esc(m.mood)}</span><h3 style="margin-top:12px">${esc(m.need)}</h3><p>${esc(m.body)||'今天先不說話，也沒關係。'}</p><small>${fmt(m.created_at)}</small></div>`).join('')||'<div class="card small">她留下心情時，會出現在這裡。</div>'}</div>`}
function modal(html){$('#modal').innerHTML=html;$('#modal').showModal()}
function close(){ $('#modal').close() }
$('#modal').addEventListener('click',e=>{if(e.target!==e.currentTarget)return;const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close()});
function updateCountdown(){const el=$('#countdown');if(!el)return;const sec=Math.max(0,Math.floor((weekInfo().next-Date.now())/1000));el.textContent=`${Math.floor(sec/86400)} 天 ${String(Math.floor(sec/3600)%24).padStart(2,'0')} : ${String(Math.floor(sec/60)%60).padStart(2,'0')} : ${String(sec%60).padStart(2,'0')}`;if(!busy&&$('#drawButton'))$('#drawButton').disabled=drawnThisWeek()}
async function act(fn,msg){try{await fn();await refresh(false);if(msg)toast(msg);return true}catch(e){toast(errMsg(e));refreshSoon();return false}}

document.addEventListener('change',e=>{if(e.target.name==='role'&&e.target.form?.id==='loginForm'){loginRole=e.target.value;e.target.form.elements.username.value=savedEmail(loginRole)}});
document.addEventListener('click',async e=>{// <body> also carries data-page (for page-specific styles); only real links/buttons navigate.
  const el=e.target.closest('button,[data-page]:not(body)');if(!el)return;const d=el.dataset;
  if(d.logout!==undefined){await window.loveApi.signOut();return}
  if(!state?.profile)return;
  if(d.page){if(d.page==='shop'&&(el.classList.contains('wallet')||el.classList.contains('notice-item')))shopMode='wallet';location.hash=d.page;if(page===d.page)render()}
  if(d.shop){shopMode=d.shop;render()}
  if(d.filter){filter=d.filter;render()}
  if(d.close!==undefined)close();
  if(d.detail!==undefined){const c=coupons[+d.detail];modal(`<div class="modal-coupon theme-${couponThemes[c.id]}">${couponArt(c)}</div><h2>${c.name}</h2><p>${c.desc}</p><p class="small">一次兌換一份體驗；內容、預算與時間由兩人確認。<br>親密互動須彼此願意。</p><div class="row"><button data-close>先收藏在心裡</button><button class="primary" id="goDraw">去抽一張券</button></div>`)}
  if(el.id==='goDraw'){close();location.hash='draw'}
  if(d.redeem){const w=state.wallet.find(w=>w.id===d.redeem);if(!w||w.status!=='available')return;modal(`<h2>兌現 ${coupons[w.coupon].name}</h2><p>留個時間或小心願，男友會馬上收到。</p><form id="redeemForm" data-id="${w.id}" class="form"><label>兌換備註（選填）<textarea name="note" maxlength="300" placeholder="週六下午，一起吃草莓蛋糕好嗎？"></textarea></label><button class="primary">送出兌換申請 ♡</button><button type="button" data-close>再想一下</button></form>`)}
  if(d.letter){const l=state.letters.find(l=>l.id===d.letter);modal(`<div class="prize">💌</div><h2>${esc(l.title)}</h2><p style="text-align:left">${esc(l.body)}</p><p class="small">${esc(fromName(l.author_role))} · ${fmt(l.created_at)}</p><button data-close class="primary">好好收進心裡 ♡</button>`)}
  if(d.mood){moodSelected=d.mood;document.querySelectorAll('[data-mood]').forEach(b=>b.classList.toggle('selected',b.dataset.mood===moodSelected))}
  if(d.game){gameType=d.game;render()}
  if(el.id==='nextQuestion'){const arr=questions[gameType].filter(q=>q!==$('#question').textContent);$('#question').textContent=arr[Math.floor(Math.random()*arr.length)]}
  if(d.complete){el.disabled=true;await act(()=>window.loveApi.completeRedeem(d.complete),'已記下這份完成的小幸福 ♡')}
  if(el.id==='drawButton'&&!busy){busy=true;el.disabled=true;el.textContent='正在打開小幸運…';$('#machine')?.classList.add('shaking');try{const [result]=await Promise.all([window.loveApi.drawWeekly(),new Promise(r=>setTimeout(r,1500))]);const c=coupons[result.couponId];if($('#modal').open)close();modal(`<span class="eyebrow">LUCKY YOU!</span><div class="modal-coupon theme-${couponThemes[c.id]}">${couponArt(c)}</div><h2>抽中了，${c.name}！</h2><p>${c.desc}<br>已放進你的票夾，隨時可以兌現。</p><button id="seeWallet" class="primary">看看我的幸運券 ♡</button>`);for(let i=0;i<24;i++){const p=document.createElement('span');p.className='confetti';p.textContent=['♡','✧','✿'][i%3];p.style.cssText=`left:${Math.random()*100}%;color:${['#c87584','#ddbb79','#b3b58b'][i%3]};animation-delay:${Math.random()*.5}s`;document.body.appendChild(p);setTimeout(()=>p.remove(),3200)}}catch(err){toast(errMsg(err))}finally{busy=false;await refresh(false).catch(()=>render())}}
  if(el.id==='installApp'&&installEvt){const ev=installEvt;installEvt=null;ev.prompt();const r=await ev.userChoice;render();if(r.outcome==='accepted')toast('補給站已放到桌面囉 ♡')}
  if(el.id==='seeWallet'){close();shopMode='wallet';filter='全部';location.hash='shop'}
});
document.addEventListener('submit',async e=>{e.preventDefault();const f=e.target;const data=Object.fromEntries(new FormData(f));
  if(Object.entries(data).some(([k,v])=>typeof v==='string'&&f.elements[k]?.required&&!v.trim())){toast('請填入文字，不能只有空白喔。');return}
  const btn=f.querySelector('button:not([type=button])');if(btn?.disabled)return;if(btn)btn.disabled=true;
  try{
    if(f.id==='loginForm'){const email=data.username.trim().toLowerCase();try{await window.loveApi.signIn(email,data.password);saveEmail(data.role,email);saveEmail('last-role',data.role)}catch(err){toast(errMsg(err))}return}
    const api=window.loveApi,base={couple_id:state.profile.couple_id,author:session.user.id};
    if(f.id==='letterForm')await act(()=>api.insert('letters',{...base,author_role:role(),title:data.title.trim(),body:data.body.trim()}),'情書已經放進情書盒 ♡');
    else if(f.id==='wishForm')await act(()=>api.insert('wishes',{...base,category:data.category,body:data.body.trim()}),'願望已經漂向他了 ✨');
    else if(f.id==='moodForm')await act(()=>api.insert('moods',{...base,mood:moodSelected,need:data.need,body:data.body.trim()}),'今天的心情收到了 ♡');
    else if(f.id==='settingsForm'){if(data.anniversary&&new Date(data.anniversary+'T00:00:00+08:00')>Date.now()){toast('紀念日不能設定在未來喔。');return}await act(()=>api.updateSettings(data.nickname.trim(),data.anniversary),'設定已更新 ♡')}
    else if(f.id==='giftForm')await act(()=>api.giftCoupon(+data.coupon),'券已經送進她的票夾 🎟️');
    else if(f.id==='redeemForm'){if(await act(()=>api.requestRedeem(f.dataset.id,data.note.trim()),'兌換申請送出了，等男友回應 ♡'))close()}
    else if(f.classList.contains('wishReply'))await act(()=>api.replyWish(f.dataset.id,data.reply.trim(),data.status),'回音已經傳給她 ♡');
    else if(f.id==='memoryForm'){const file=f.elements.photo.files[0];if(file&&(file.size>1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type))){toast('請選擇 1 MB 以內的 JPG、PNG 或 WebP 照片。');return}
      await act(async()=>{let photo_path=null;if(file){photo_path=`${state.profile.couple_id}/${crypto.randomUUID()}.${file.type.split('/')[1]}`;await api.uploadPhoto(photo_path,file)}await api.insert('memories',{...base,title:data.title.trim(),day:data.day,body:data.body.trim(),photo_path})},'這個瞬間收藏好了 ♡')}
  }finally{if(btn?.isConnected)btn.disabled=false}
});

async function onSession(s){const changed=s?.user?.id!==session?.user?.id;session=s;if(!changed)return;state=null;location.hash='home';render();if(s){try{state=await window.loveApi.load(s.user.id)}catch(err){toast(errMsg(err));state=null;return}render();if(state.profile)notifyModal(takeUnnotified())}}
async function boot(){if(!window.loveApi)return render();window.loveApi.onAuthChange(onSession);window.loveApi.subscribe(()=>refreshSoon());await onSession(await window.loveApi.session().catch(()=>null));if(!session)render()}
window.addEventListener('hashchange',()=>{if(state?.profile){render();window.scrollTo({top:0,behavior:'smooth'})}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshSoon(true)});
setInterval(updateCountdown,1000);window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installEvt=e;if(page==='home'&&state?.profile)render(true)});window.addEventListener('appinstalled',()=>{installEvt=null;if(page==='home'&&state?.profile)render(true)});if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('sw.js').catch(()=>{});
boot();
