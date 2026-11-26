export default async function handler(req, res) {
  const { slug, admin } = req.query;
  const host = req.headers.host;

  const SB_URL = (process.env.SUPABASE_URL || '').trim();
  const SB_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const MASTER_PASS = (process.env.MASTER_ADMIN_PASSWORD || 'Ziya@Master2026').trim();

  if (!SB_URL || !SB_KEY) {
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(`<h2 style="font-family:sans-serif;color:red;text-align:center;margin-top:50px;">⚠️ Vercel Environment Variables में SUPABASE_URL या SUPABASE_SERVICE_ROLE_KEY सेट नहीं है!</h2>`);
  }

  async function sbFetch(path, options = {}) {
    const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
      ...options,
      headers: {
        'apikey': SB_KEY,
        'Authorization': `Bearer ${SB_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
        ...(options.headers || {})
      }
    });
    return r.json();
  }

  // --- PART 1: SUPER ADMIN PANEL (/master-admin) ---
  if (admin === '1') {
    if (req.method === 'POST') {
      const { master_pass, action, target_slug, current_status } = req.body || {};
      if (master_pass !== MASTER_PASS) {
        return res.status(401).json({ error: 'Wrong Master Password!' });
      }

      if (action === 'toggle_page') {
        await sbFetch(`saas_pages?slug=eq.${encodeURIComponent(target_slug)}`, {
          method: 'PATCH',
          body: JSON.stringify({ is_active: !current_status })
        });
        return res.status(200).json({ success: true });
      }

      if (action === 'get_all') {
        const keys = await sbFetch('saas_keys?select=*');
        const pages = await sbFetch('saas_pages?select=*&order=created_at.desc');
        const reqs = await sbFetch('saas_requests?select=page_slug,joined_at,user_full_name');
        return res.status(200).json({
          success: true,
          keys: Array.isArray(keys) ? keys : [],
          pages: Array.isArray(pages) ? pages : [],
          reqs: Array.isArray(reqs) ? reqs : []
        });
      }
    }

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Super Admin Control Room</title>
  <style>
    body { background:#090d16; color:#fff; font-family:system-ui,sans-serif; padding:20px; max-width:1200px; margin:auto; }
    .card { background:#111827; border:1px solid #1f2937; border-radius:16px; padding:20px; margin-bottom:20px; }
    input, button { padding:11px 14px; border-radius:10px; border:1px solid #374151; background:#1f2937; color:#fff; font-size:14px; }
    button { background:linear-gradient(90deg,#ec4899,#8b5cf6); border:none; font-weight:700; cursor:pointer; }
    .cp-btn { background:#1e293b; border:1px solid #38bdf8; color:#38bdf8; padding:4px 9px; font-size:11px; border-radius:6px; margin-left:4px; cursor:pointer; }
    .cp-btn:hover { background:#38bdf8; color:#090d16; }
    table { width:100%; border-collapse:collapse; margin-top:15px; font-size:13px; }
    th, td { padding:12px 10px; border-bottom:1px solid #1f2937; text-align:left; vertical-align:middle; }
    th { color:#9ca3af; }
    .toast { position:fixed; bottom:20px; right:20px; background:#22c55e; color:#052e16; padding:10px 18px; border-radius:10px; font-weight:800; display:none; z-index:999; }
  </style>
</head>
<body>
  <div id="toast" class="toast">Copied!</div>
  <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:15px;">
    <h2 style="margin:0;">👑 Super Admin Control Panel</h2>
    <div id="adminClock" style="background:#111827;border:1px solid #38bdf8;padding:8px 14px;border-radius:10px;color:#38bdf8;font-weight:700;font-size:13px;"></div>
  </div>
  <div id="loginBox" class="card">
    <input type="password" id="mPass" placeholder="Enter Master Admin Password">
    <button onclick="loadAdmin()">Unlock Panel</button>
  </div>

  <div id="panel" style="display:none;">
    <div class="card" style="overflow-x:auto;">
      <h3>📊 All Generated Landing Pages & Live Stats</h3>
      <table>
        <thead>
          <tr><th>Channel & Links</th><th>Username & ID</th><th>Created By</th><th>Requests (Today/Total)</th><th>Page Views</th><th>Dash Pass</th><th>Action</th></tr>
        </thead>
        <tbody id="pagesBody"></tbody>
      </table>
    </div>
  </div>

  <script>
    setInterval(() => {
      document.getElementById('adminClock').innerText = '🕒 Live IST: ' + new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    }, 1000);

    let savedPass = '';
    const origin = window.location.origin;

    function copyVal(txt) {
      navigator.clipboard.writeText(txt);
      const t = document.getElementById('toast');
      t.innerText = 'Copied: ' + txt;
      t.style.display = 'block';
      setTimeout(() => { t.style.display = 'none'; }, 2000);
    }

    async function loadAdmin() {
      savedPass = document.getElementById('mPass').value;
      const res = await fetch('/api/dash-admin?admin=1', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ master_pass: savedPass, action: 'get_all' })
      });
      const data = await res.json();
      if (!data.success) return alert(data.error);

      document.getElementById('loginBox').style.display = 'none';
      document.getElementById('panel').style.display = 'block';

      const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      const ownerMap = {};
      (data.keys || []).forEach(k => ownerMap[k.key_code] = k.buyer_name);

      document.getElementById('pagesBody').innerHTML = (data.pages || []).map(p => {
        const allRows = (data.reqs || []).filter(r => r.page_slug === p.slug);
        const realReqs = allRows.filter(r => r.user_full_name !== '__VIEW__');
        const views = allRows.filter(r => r.user_full_name === '__VIEW__');
        const todayCount = realReqs.filter(r => r.joined_at && new Date(r.joined_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) === todayStr).length;
        const adUrl = origin + '/p/' + p.slug + '?ad={{ad.name}}';
        const dashUrl = origin + '/dash/' + p.slug;
        return \`<tr>
          <td>
            <b>\${p.channel_title}</b><br>
            <div style="margin-top:5px;">
              <button class="cp-btn" onclick="copyVal('\${adUrl}')">Copy Ad Link</button>
              <button class="cp-btn" onclick="copyVal('\${dashUrl}')">Copy Dash Link</button>
            </div>
          </td>
          <td>\${p.channel_username} <button class="cp-btn" onclick="copyVal('\${p.channel_username}')">Copy</button><br><small>\${p.channel_id}</small></td>
          <td><b>\${ownerMap[p.license_key] || 'User'}</b></td>
          <td>Today: <b style="color:#22c55e;">\${todayCount}</b><br>Total: <b>\${realReqs.length}</b></td>
          <td><b>\${views.length}</b> Views</td>
          <td><code>\${p.dashboard_pass}</code> <button class="cp-btn" onclick="copyVal('\${p.dashboard_pass}')">Copy</button></td>
          <td>
            <a href="/dash/\${p.slug}?master=\${encodeURIComponent(savedPass)}" target="_blank" style="color:#38bdf8;display:inline-block;margin-bottom:6px;">Open Dash</a><br>
            <button onclick="togglePage('\${p.slug}', \${p.is_active})" style="padding:6px 10px;font-size:12px;background:\${p.is_active ? '#dc2626' : '#16a34a'}">
              \${p.is_active ? 'Block' : 'Activate'}
            </button>
          </td>
        </tr>\`;
      }).join('') || '<tr><td colspan="7">Abhi tak koi page nahi bana hai.</td></tr>';
    }

    async function togglePage(target_slug, current_status) {
      await fetch('/api/dash-admin?admin=1', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ master_pass: savedPass, action: 'toggle_page', target_slug, current_status })
      });
      loadAdmin();
    }
  </script>
</body>
</html>`);
  }

  // --- PART 2: CLIENT PRIVATE DASHBOARD (/dash/:slug) ---
  const pages = await sbFetch(`saas_pages?slug=eq.${encodeURIComponent(slug || '')}&select=*`);
  const page = Array.isArray(pages) ? pages[0] : null;
  if (!page) return res.status(404).send('Dashboard Not Found');

  if (req.method === 'POST') {
    const { password } = req.body || {};
    if (password !== page.dashboard_pass && password !== MASTER_PASS) {
      return res.status(401).json({ error: 'Galat Password!' });
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const requests = await sbFetch(`saas_requests?page_slug=eq.${encodeURIComponent(slug)}&joined_at=gte.${encodeURIComponent(thirtyDaysAgo)}&order=joined_at.desc`);

    return res.status(200).json({
      success: true,
      page: {
        title: page.channel_title,
        username: page.channel_username,
        dp: page.dp_url,
        slug: page.slug,
        is_active: page.is_active
      },
      requests: Array.isArray(requests) ? requests : []
    });
  }

  const autoMaster = req.query.master || '';
  const clientAdUrl = `https://${host}/p/${page.slug}?ad={{ad.name}}`;
  const clientDashUrl = `https://${host}/dash/${page.slug}`;

  res.setHeader('Content-Type', 'text/html');
  return res.status(200).send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Analytics Dashboard - ${page.channel_title}</title>
  <style>
    body { background:#070b14; color:#fff; font-family:system-ui,sans-serif; padding:20px; max-width:1020px; margin:auto; }
    .login { max-width:380px; margin:80px auto; background:#111827; padding:30px; border-radius:20px; text-align:center; border:1px solid #1f2937; }
    input { width:100%; padding:14px; border-radius:12px; border:1px solid #374151; background:#1f2937; color:#fff; margin:15px 0; box-sizing:border-box; }
    .btn-main { width:100%; padding:14px; border-radius:12px; border:none; background:linear-gradient(90deg,#3b82f6,#8b5cf6); color:#fff; font-weight:700; cursor:pointer; }
    .cp-btn { background:#1e293b; border:1px solid #38bdf8; color:#38bdf8; padding:6px 12px; font-size:12px; border-radius:8px; cursor:pointer; font-weight:600; }
    .cp-btn:hover { background:#38bdf8; color:#070b14; }
    .header { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:15px; background:#111827; padding:20px; border-radius:20px; margin-bottom:20px; border:1px solid #1f2937; }
    .header-left { display:flex; align-items:center; gap:15px; }
    .header img { width:64px; height:64px; border-radius:50%; border:2px solid #3b82f6; object-fit:cover; }
    .link-bar { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
    .live-pill { background:#0f172a; border:1px solid #22c55e; color:#4ade80; padding:6px 12px; border-radius:20px; font-size:12px; font-weight:700; }
    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:14px; margin-bottom:20px; }
    .stat { background:#111827; padding:18px; border-radius:16px; border:1px solid #1f2937; }
    .stat small { color:#9ca3af; font-size:11px; font-weight:700; letter-spacing:0.5px; }
    .stat h2 { margin:8px 0 0; font-size:26px; color:#38bdf8; }
    .filter-bar { display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap; }
    .f-btn { background:#1e293b; border:1px solid #334155; color:#cbd5e1; padding:7px 14px; border-radius:10px; font-size:12px; font-weight:700; cursor:pointer; }
    .f-btn.active { background:#3b82f6; color:#fff; border-color:#3b82f6; }
    .box { background:#111827; padding:20px; border-radius:16px; border:1px solid #1f2937; margin-bottom:20px; overflow-x:auto; }
    table { width:100%; border-collapse:collapse; font-size:13px; }
    th, td { padding:12px; border-bottom:1px solid #1f2937; text-align:left; }
    th { color:#9ca3af; }
    .toast { position:fixed; bottom:20px; right:20px; background:#22c55e; color:#052e16; padding:10px 18px; border-radius:10px; font-weight:800; display:none; z-index:999; }
  </style>
</head>
<body>
  <div id="toast" class="toast">Copied!</div>
  <div id="loginView" class="login">
    <h2>🔒 Client Analytics</h2>
    <p style="color:#9ca3af;font-size:13px;">Enter your auto-generated password to view leads</p>
    <input type="password" id="passInput" value="${autoMaster}" placeholder="Enter Dashboard Password">
    <button class="btn-main" onclick="unlockDash()">Open Dashboard</button>
  </div>

  <div id="dashView" style="display:none;">
    <div class="header">
      <div class="header-left">
        <img src="${page.dp_url}">
        <div>
          <h2 style="margin:0;">${page.channel_title}</h2>
          <div style="color:#9ca3af;font-size:13px;margin-top:4px;">${page.channel_username} • <span id="liveClock" style="color:#fbbf24;font-weight:700;"></span></div>
        </div>
      </div>
      <div class="link-bar">
        <span class="live-pill">● Active Campaigns: <b id="activeCamps">0</b></span>
        <button class="cp-btn" onclick="copyText('${clientAdUrl}')">📋 Copy Ad Link</button>
        <button class="cp-btn" onclick="copyText('${clientDashUrl}')">📋 Copy Dash Link</button>
        <button class="cp-btn" onclick="copyText('${page.dashboard_pass}')">🔑 Copy Password</button>
      </div>
    </div>

    <div class="grid">
      <div class="stat"><small>TODAY REQUESTS</small><h2 id="cToday" style="color:#22c55e;">0</h2></div>
      <div class="stat"><small>YESTERDAY REQUESTS</small><h2 id="cYesterday">0</h2></div>
      <div class="stat"><small>LAST 30 DAYS LEADS</small><h2 id="c30">0</h2></div>
      <div class="stat"><small>TODAY PAGE VIEWS</small><h2 id="vToday" style="color:#f472b6;">0</h2></div>
      <div class="stat"><small>30 DAYS PAGE VIEWS</small><h2 id="v30" style="color:#c084fc;">0</h2></div>
    </div>

    <div class="box">
      <h3>📢 Ad-Wise Campaign Performance (Views vs Join Requests)</h3>
      <table><thead><tr><th>Campaign / Ad Name</th><th>Page Views</th><th>Join Requests</th></tr></thead><tbody id="adBody"></tbody></table>
    </div>

    <div class="box">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:10px;">
        <h3 style="margin:0;">👥 Verified Join Requests (Zero Fake Click)</h3>
        <div class="filter-bar">
          <button class="f-btn active" id="btnAll" onclick="filterUsers('all')">30 Days (All)</button>
          <button class="f-btn" id="btnToday" onclick="filterUsers('today')">Today</button>
          <button class="f-btn" id="btnYest" onclick="filterUsers('yesterday')">Yesterday</button>
        </div>
      </div>
      <table><thead><tr><th>User Name</th><th>Username</th><th>Ad Source</th><th>Exact Time (IST)</th></tr></thead><tbody id="userBody"></tbody></table>
    </div>
  </div>

  <script>
    setInterval(() => {
      const el = document.getElementById('liveClock');
      if (el) {
        el.innerText = '🕒 ' + new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
      }
    }, 1000);

    let allRealReqs = [];
    let todayStr = '';
    let yestStr = '';

    function copyText(txt) {
      navigator.clipboard.writeText(txt);
      const t = document.getElementById('toast');
      t.innerText = 'Copied: ' + txt;
      t.style.display = 'block';
      setTimeout(() => { t.style.display = 'none'; }, 2000);
    }

    function istDate(iso) {
      return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    }

    function filterUsers(mode) {
      ['btnAll', 'btnToday', 'btnYest'].forEach(id => document.getElementById(id).classList.remove('active'));
      if (mode === 'all') document.getElementById('btnAll').classList.add('active');
      if (mode === 'today') document.getElementById('btnToday').classList.add('active');
      if (mode === 'yesterday') document.getElementById('btnYest').classList.add('active');

      let list = allRealReqs;
      if (mode === 'today') list = allRealReqs.filter(r => istDate(r.joined_at) === todayStr);
      if (mode === 'yesterday') list = allRealReqs.filter(r => istDate(r.joined_at) === yestStr);

      document.getElementById('userBody').innerHTML = list.slice(0, 150).map(r => \`<tr>
        <td><b>\${r.user_full_name || 'Telegram User'}</b></td>
        <td>\${r.user_username} <button class="cp-btn" style="padding:2px 6px;font-size:10px;" onclick="copyText('\${r.user_username}')">Copy</button></td>
        <td><span style="background:#1e3a8a;padding:3px 8px;border-radius:6px;font-size:11px;">\${r.ad_name}</span></td>
        <td>\${new Date(r.joined_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}</td>
      </tr>\`).join('') || '<tr><td colspan="4">Is filter mein abhi koi request nahi hai</td></tr>';
    }

    async function unlockDash() {
      const password = document.getElementById('passInput').value;
      const res = await fetch('/api/dash-admin?slug=${slug}', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (!data.success) return alert(data.error);

      document.getElementById('loginView').style.display = 'none';
      document.getElementById('dashView').style.display = 'block';

      const rows = data.requests || [];
      allRealReqs = rows.filter(r => r.user_full_name !== '__VIEW__');
      const allViews = rows.filter(r => r.user_full_name === '__VIEW__');

      const now = new Date();
      todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      yestStr = new Date(now.getTime() - 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

      document.getElementById('cToday').innerText = allRealReqs.filter(r => istDate(r.joined_at) === todayStr).length;
      document.getElementById('cYesterday').innerText = allRealReqs.filter(r => istDate(r.joined_at) === yestStr).length;
      document.getElementById('c30').innerText = allRealReqs.length;

      document.getElementById('vToday').innerText = allViews.filter(r => istDate(r.joined_at) === todayStr).length;
      document.getElementById('v30').innerText = allViews.length;

      const campStats = {};
      rows.forEach(r => {
        const name = r.ad_name || 'Direct';
        if (!campStats[name]) campStats[name] = { views: 0, leads: 0 };
        if (r.user_full_name === '__VIEW__') campStats[name].views++;
        else campStats[name].leads++;
      });

      const activeCampaigns = Object.keys(campStats).filter(k => k !== 'Direct' && k !== '{{ad.name}}');
      document.getElementById('activeCamps').innerText = activeCampaigns.length || Object.keys(campStats).length;

      document.getElementById('adBody').innerHTML = Object.entries(campStats)
        .sort((a,b) => b[1].leads - a[1].leads)
        .map(([ad, st]) => \`<tr><td><b>\${ad}</b></td><td>\${st.views}</td><td><b style="color:#22c55e;">\${st.leads}</b></td></tr>\`).join('') || '<tr><td colspan="3">No data yet</td></tr>';

      filterUsers('all');
    }
    if (document.getElementById('passInput').value) unlockDash();
  </script>
</body>
</html>`);
}

