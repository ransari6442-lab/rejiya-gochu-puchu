const THEMES = {
  1: { name: 'Modern Red', bg: 'radial-gradient(circle at top, #5c0a14, #0d0204 80%)', card: 'rgba(30,5,10,0.85)', ring: '#ff2a4b', btn: 'linear-gradient(90deg, #ff1e42, #b8001f)', text: '#fff', accent: '#ff4d6d' },
  2: { name: 'Cyberpunk', bg: 'linear-gradient(135deg, #090418 0%, #1a0933 50%, #05020d 100%)', card: 'rgba(18,8,38,0.88)', ring: '#00f3ff', btn: 'linear-gradient(90deg, #ff007f, #7928ca)', text: '#fff', accent: '#00f3ff' },
  3: { name: 'Gold & Emerald', bg: 'radial-gradient(circle at top, #064e3b, #021c15 85%)', card: 'rgba(4,35,26,0.9)', ring: '#fbbf24', btn: 'linear-gradient(90deg, #f59e0b, #d97706)', text: '#fef3c7', accent: '#fbbf24' },
  4: { name: 'Earthy', bg: 'linear-gradient(180deg, #e7e5d8 0%, #d6d3c0 100%)', card: 'rgba(255,255,255,0.75)', ring: '#6b705c', btn: '#586144', text: '#283618', accent: '#606c38' },
  5: { name: 'Glassmorphism', bg: 'linear-gradient(135deg, #4f46e5 0%, #9333ea 50%, #0284c7 100%)', card: 'rgba(255,255,255,0.16)', ring: '#ffffff', btn: 'rgba(255,255,255,0.28)', text: '#ffffff', accent: '#e0f2fe' },
  6: { name: 'Abstract Art', bg: 'radial-gradient(circle at top right, #9a3412, #18181b 70%)', card: 'rgba(24,24,27,0.9)', ring: '#fb923c', btn: 'linear-gradient(90deg, #f97316, #ea580c)', text: '#fff7ed', accent: '#fb923c' },
  7: { name: 'Cosmic', bg: 'radial-gradient(ellipse at bottom, #1e1b4b 0%, #030712 100%)', card: 'rgba(15,23,42,0.85)', ring: '#38bdf8', btn: 'linear-gradient(90deg, #0284c7, #3b82f6)', text: '#f8fafc', accent: '#38bdf8' },
  8: { name: 'Pastel', bg: 'linear-gradient(135deg, #fbcfe8 0%, #fef08a 50%, #bae6fd 100%)', card: 'rgba(255,255,255,0.88)', ring: '#f472b6', btn: '#fb7185', text: '#1e293b', accent: '#e11d48' }
};

export default async function handler(req, res) {
  const { slug, webhook, action } = req.query;
  const SB_URL = (process.env.SUPABASE_URL || '').trim();
  const SB_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  async function sbFetch(path, options = {}) {
    const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
      ...options,
      headers: {
        'apikey': SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    return r.json();
  }

  const pages = await sbFetch(`saas_pages?slug=eq.${encodeURIComponent(slug || '')}&select=*`);
  const page = Array.isArray(pages) ? pages[0] : null;

  if (!page) {
    return res.status(404).send('<h2 style="font-family:sans-serif;text-align:center;margin-top:50px;">404 - Page Not Found</h2>');
  }

  if (!page.is_active) {
    return res.status(403).send('<h2 style="font-family:sans-serif;text-align:center;margin-top:50px;color:red;">This page has been suspended by Administrator.</h2>');
  }

  // Page View Tracker
  if (action === 'track_view' && req.method === 'POST') {
    const { ad_name } = req.body || {};
    await sbFetch('saas_requests', {
      method: 'POST',
      body: JSON.stringify([{
        page_slug: slug,
        ad_name: (ad_name || 'Direct').slice(0, 40),
        user_telegram_id: 0,
        user_full_name: '__VIEW__',
        user_username: 'PageView'
      }])
    });
    return res.status(200).json({ ok: true });
  }

  // Telegram Join Request Webhook
  if (webhook === '1' && req.method === 'POST') {
    const update = req.body;
    if (update && update.chat_join_request) {
      const joinReq = update.chat_join_request;
      const user = joinReq.from;
      const rawName = joinReq.invite_link?.name || 'Direct';
      const adName = rawName.startsWith('AD:') ? rawName.replace('AD:', '') : rawName;

      await sbFetch('saas_requests', {
        method: 'POST',
        body: JSON.stringify([{
          page_slug: slug,
          ad_name: adName,
          user_telegram_id: user.id,
          user_full_name: [user.first_name, user.last_name].filter(Boolean).join(' '),
          user_username: user.username ? `@${user.username}` : 'No Username'
        }])
      });

      try {
        await fetch(`https://graph.facebook.com/v19.0/${page.pixel_id}/events?access_token=${page.capi_token}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: [{
              event_name: 'Lead',
              event_time: Math.floor(Date.now() / 1000),
              action_source: 'website',
              user_data: { external_id: [String(user.id)] },
              custom_data: { ad_name: adName, channel: page.channel_title }
            }]
          })
        });
      } catch (e) {}
    }
    return res.status(200).json({ ok: true });
  }

  // Dynamic Invite Link Generator
  if (action === 'get_invite' && req.method === 'POST') {
    const { ad_name } = req.body || {};
    const safeAd = (ad_name || 'Direct').slice(0, 28);

    try {
      const tgRes = await fetch(`https://api.telegram.org/bot${page.bot_token}/createChatInviteLink`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: page.channel_id,
          name: `AD:${safeAd}`,
          creates_join_request: true
        })
      });
      const tgData = await tgRes.json();
      if (tgData.ok) {
        return res.status(200).json({ invite_link: tgData.result.invite_link });
      }
      return res.status(400).json({ error: 'Invite link error' });
    } catch (e) {
      return res.status(500).json({ error: 'Server error' });
    }
  }

  const t = THEMES[page.theme_id] || THEMES[1];
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${page.channel_title} - Official Channel</title>
  <script>
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
    document,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', '${page.pixel_id}');
    fbq('track', 'PageView');
  </script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', system-ui, sans-serif; }
    body { min-height: 100vh; background: ${t.bg}; color: ${t.text}; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .container { width: 100%; max-width: 400px; background: ${t.card}; backdrop-filter: blur(16px); border: 1.5px solid ${t.ring}55; border-radius: 28px; padding: 36px 24px; text-align: center; box-shadow: 0 20px 50px rgba(0,0,0,0.45); }
    .dp-wrap { width: 124px; height: 124px; margin: 0 auto 20px; border-radius: 50%; padding: 4px; border: 3px solid ${t.ring}; box-shadow: 0 0 25px ${t.ring}88; }
    .dp-wrap img { width: 100%; height: 100%; border-radius: 50%; object-fit: cover; }
    .badge { font-size: 11px; letter-spacing: 2.5px; text-transform: uppercase; opacity: 0.75; margin-bottom: 6px; }
    h1 { font-size: 26px; font-weight: 800; margin-bottom: 10px; letter-spacing: 0.5px; }
    .sub { font-size: 14px; opacity: 0.85; line-height: 1.5; margin-bottom: 24px; }
    .wave { height: 24px; display: flex; align-items: center; justify-content: center; gap: 4px; margin-bottom: 26px; }
    .wave span { width: 4px; background: ${t.accent}; border-radius: 4px; animation: pulse 1.2s infinite ease-in-out; }
    @keyframes pulse { 0%, 100% { height: 6px; } 50% { height: 22px; } }
    .join-btn { width: 100%; padding: 16px 20px; border: none; border-radius: 50px; background: ${t.btn}; color: #fff; font-size: 17px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; box-shadow: 0 10px 25px rgba(0,0,0,0.3); }
    .status { font-size: 12px; margin-top: 16px; opacity: 0.85; }
    .status b { color: #22c55e; }
    .perks { margin-top: 18px; font-size: 13px; opacity: 0.85; line-height: 1.9; }
    .footer { margin-top: 26px; font-size: 11px; opacity: 0.5; }
  </style>
</head>
<body>
  <div class="container">
    <div class="dp-wrap"><img src="${page.dp_url}" alt="Channel DP"></div>
    <div class="badge">OFFICIAL TELEGRAM CHANNEL</div>
    <h1>${page.channel_title}</h1>
    <p class="sub">Daily premium updates, insights & exclusive community access.</p>
    <div class="wave">
      <span style="animation-delay:0.1s"></span><span style="animation-delay:0.3s"></span>
      <span style="animation-delay:0.5s"></span><span style="animation-delay:0.2s"></span>
      <span style="animation-delay:0.4s"></span><span style="animation-delay:0.1s"></span>
      <span style="animation-delay:0.3s"></span>
    </div>
    <button id="joinBtn" class="join-btn" onclick="handleJoin()"><span>✈ Join the Channel →</span></button>
    <div class="status">Status: <b>Ready</b> • opens in Telegram</div>
    <div class="perks">✓ Free to join<br>✓ 1 tap — opens in Telegram<br>✓ Leave anytime</div>
    <div class="footer">© 2026 ${page.channel_title} • Not affiliated with Telegram</div>
  </div>

  <script>
    let humanVerified = false;
    ['mousemove', 'touchstart', 'scroll', 'click'].forEach(ev => {
      window.addEventListener(ev, () => { humanVerified = true; }, { once: true });
    });
    const params = new URLSearchParams(window.location.search);
    const adName = params.get('ad') || 'Direct';

    // Record Page View
    fetch('/api/page-handler?slug=${slug}&action=track_view', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ad_name: adName })
    }).catch(() => {});

    async function handleJoin() {
      const btn = document.getElementById('joinBtn');
      btn.innerHTML = '<span>Connecting to Telegram...</span>';
      btn.disabled = true;
      try {
        const res = await fetch('/api/page-handler?slug=${slug}&action=get_invite', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ad_name: adName, human: humanVerified })
        });
        const data = await res.json();
        if (data.invite_link) window.location.href = data.invite_link;
        else { btn.innerHTML = '<span>Try Again</span>'; btn.disabled = false; }
      } catch (e) { btn.innerHTML = '<span>✈ Join the Channel →</span>'; btn.disabled = false; }
    }
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  return res.status(200).send(html);
}
