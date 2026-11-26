import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const { slug, admin } = req.query;

  // --- PART 1: SUPER ADMIN PANEL (/master-admin) ---
  if (admin === '1') {
    if (req.method === 'POST') {
      const { master_pass, action, buyer_name, custom_key, target_slug, current_status } = req.body;
      if (master_pass !== process.env.MASTER_ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Wrong Master Password!' });
      }

      if (action === 'create_key') {
        const keyCode = (custom_key || `RJ-${Math.floor(100000 + Math.random() * 900000)}`).toUpperCase().trim();
        const { error } = await supabase.from('saas_keys').insert([{ key_code: keyCode, buyer_name: buyer_name || 'Client' }]);
        if (error) return res.status(400).json({ error: error.message });
        return res.status(200).json({ success: true, key_code: keyCode });
      }

      if (action === 'toggle_page') {
        await supabase.from('saas_pages').update({ is_active: !current_status }).eq('slug', target_slug);
        return res.status(200).json({ success: true });
      }

      if (action === 'get_all') {
        const { data: keys } = await supabase.from('saas_keys').select('*').order('created_at', { ascending: false });
        const { data: pages } = await supabase.from('saas_pages').select('*').order('created_at', { ascending: false });
        const { data: reqs } = await supabase.from('saas_requests').select('page_slug, joined_at');
        return res.status(200).json({ success: true, keys, pages, reqs });
      }
    }

    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Super Admin Control Room</title>
  <style>
    body { background:#090d16; color:#fff; font-family:system-ui,sans-serif; padding:20px; max-width:1100px; margin:auto; }
    .card { background:#111827; border:1px solid #1f2937; border-radius:16px; padding:20px; margin-bottom:20px; }
    input, button { padding:12px; border-radius:10px; border:1px solid #374151; background:#1f2937; color:#fff; font-size:14px; }
    button { background:linear-gradient(90deg,#ec4899,#8b5cf6); border:none; font-weight:700; cursor:pointer; }
    table { width:100%; border-collapse:collapse; margin-top:15px; font-size:13px; }
    th, td { padding:12px; border-bottom:1px solid #1f2937; text-align:left; }
    th { color:#9ca3af; }
    .badge { padding:4px 8px; border-radius:6px; font-size:11px; font-weight:700; }
    .green { background:#065f46; color:#34d399; } .red { background:#7f1d1d; color:#f87171; }
  </style>
</head>
<body>
  <h2>👑 Super Admin Control Panel</h2>
  <div id="loginBox" class="card">
    <input type="password" id="mPass" placeholder="Enter Master Admin Password">
    <button onclick="loadAdmin()">Unlock Panel</button>
  </div>

  <div id="panel" style="display:none;">
    <div class="card">
      <h3>🔑 Generate New Activation Key (Buyer Access)</h3>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;">
        <input type="text" id="buyerName" placeholder="Buyer Name / WhatsApp">
        <input type="text" id="customKey" placeholder="Custom Key (Optional)">
        <button onclick="createKey()">Create License Key</button>
      </div>
      <div id="keyMsg" style="margin-top:10px;color:#34d399;font-weight:bold;"></div>
    </div>

    <div class="card" style="overflow-x:auto;">
      <h3>📊 All Client Landing Pages & Live Stats</h3>
      <table>
        <thead>
          <tr><th>Page / Channel</th><th>Username & ID</th><th>Buyer & Key</th><th>Today / Total</th><th>Dash Pass</th><th>Action</th></tr>
        </thead>
        <tbody id="pagesBody"></tbody>
      </table>
    </div>

    <div class="card" style="overflow-x:auto;">
      <h3>🎟️ License Keys History</h3>
      <table>
        <thead><tr><th>Key Code</th><th>Buyer Name</th><th>Status</th><th>Used On Page</th></tr></thead>
        <tbody id="keysBody"></tbody>
      </table>
    </div>
  </div>

  <script>
    let savedPass = '';
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

      const todayStr = new Date().toISOString().slice(0,10);
      const keyMap = {};
      (data.keys || []).forEach(k => keyMap[k.key_code] = k.buyer_name);

      document.getElementById('pagesBody').innerHTML = (data.pages || []).map(p => {
        const pReqs = (data.reqs || []).filter(r => r.page_slug === p.slug);
        const todayCount = pReqs.filter(r => r.joined_at.startsWith(todayStr)).length;
        return \`<tr>
          <td><b>\${p.channel_title}</b><br><small>/p/\${p.slug}</small></td>
          <td>\${p.channel_username}<br><small>\${p.channel_id}</small></td>
          <td><b>\${keyMap[p.license_key] || 'Admin'}</b><br><small>\${p.license_key}</small></td>
          <td>Today: <b>\${todayCount}</b> | Total: <b>\${pReqs.length}</b></td>
          <td><code>\${p.dashboard_pass}</code></td>
          <td>
            <a href="/dash/\${p.slug}?master=\${encodeURIComponent(savedPass)}" target="_blank" style="color:#38bdf8;margin-right:10px;">Open Dash</a>
            <button onclick="togglePage('\${p.slug}', \${p.is_active})" style="padding:6px 10px;font-size:12px;background:\${p.is_active ? '#dc2626' : '#16a34a'}">
              \${p.is_active ? 'Block' : 'Activate'}
            </button>
          </td>
        </tr>\`;
      }).join('');

      document.getElementById('keysBody').innerHTML = (data.keys || []).map(k => \`<tr>
        <td><code>\${k.key_code}</code></td>
        <td>\${k.buyer_name}</td>
        <td><span class="badge \${k.status==='unused'?'green':'red'}">\${k.status}</span></td>
        <td>\${k.assigned_slug || '-'}</td>
      </tr>\`).join('');
    }

    async function createKey() {
      const buyer_name = document.getElementById('buyerName').value;
      const custom_key = document.getElementById('customKey').value;
      const res = await fetch('/api/dash-admin?admin=1', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ master_pass: savedPass, action: 'create_key', buyer_name, custom_key })
      });
      const data = await res.json();
      if (data.success) {
        document.getElementById('keyMsg').innerText = 'New Key Created: ' + data.key_code;
        loadAdmin();
      } else alert(data.error);
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
  const { data: page } = await supabase.from('saas_pages').select('*').eq('slug', slug).single();
  if (!page) return res.status(404).send('Dashboard Not Found');

  if (req.method === 'POST') {
    const { password } = req.body;
    if (password !== page.dashboard_pass && password !== process.env.MASTER_ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Galat Password!' });
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: requests } = await supabase
      .from('saas_requests')
      .select('*')
      .eq('page_slug', slug)
      .gte('joined_at', thirtyDaysAgo)
      .order('joined_at', { ascending: false });

    return res.status(200).json({
      success: true,
      page: {
        title: page.channel_title,
        username: page.channel_username,
        dp: page.dp_url,
        slug: page.slug,
        is_active: page.is_active
      },
      requests: requests || []
    });
  }

  const autoMaster = req.query.master || '';
  res.setHeader('Content-Type', 'text/html');
  return res.status(200).send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Analytics Dashboard - ${page.channel_title}</title>
  <style>
    body { background:#070b14; color:#fff; font-family:system-ui,sans-serif; padding:20px; max-width:950px; margin:auto; }
    .login { max-width:380px; margin:80px auto; background:#111827; padding:30px; border-radius:20px; text-align:center; border:1px solid #1f2937; }
    input { width:100%; padding:14px; border-radius:12px; border:1px solid #374151; background:#1f2937; color:#fff; margin:15px 0; box-sizing:border-box; }
    button { width:100%; padding:14px; border-radius:12px; border:none; background:linear-gradient(90deg,#3b82f6,#8b5cf6); color:#fff; font-weight:700; cursor:pointer; }
    .header { display:flex; align-items:center; gap:15px; background:#111827; padding:20px; border-radius:20px; margin-bottom:20px; border:1px solid #1f2937; }
    .header img { width:64px; height:64px; border-radius:50%; border:2px solid #3b82f6; object-fit:cover; }
    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:15px; margin-bottom:20px; }
    .stat { background:#111827; padding:20px; border-radius:16px; border:1px solid #1f2937; }
    .stat small { color:#9ca3af; font-size:12px; } .stat h2 { margin:8px 0 0; font-size:28px; color:#38bdf8; }
    .box { background:#111827; padding:20px; border-radius:16px; border:1px solid #1f2937; margin-bottom:20px; overflow-x:auto; }
    table { width:100%; border-collapse:collapse; font-size:13px; }
    th, td { padding:12px; border-bottom:1px solid #1f2937; text-align:left; }
    th { color:#9ca3af; }
  </style>
</head>
<body>
  <div id="loginView" class="login">
    <h2>🔒 Client Analytics</h2>
    <p style="color:#9ca3af;font-size:13px;">Enter your auto-generated password to view leads</p>
    <input type="password" id="passInput" value="${autoMaster}" placeholder="Enter Dashboard Password">
    <button onclick="unlockDash()">Open Dashboard</button>
  </div>

  <div id="dashView" style="display:none;">
    <div class="header">
      <img src="${page.dp_url}">
      <div>
        <h2 style="margin:0;">${page.channel_title}</h2>
        <div style="color:#9ca3af;font-size:13px;margin-top:4px;">${page.channel_username} • Status: <b style="color:#22c55e;">● Ads Tracking Active</b></div>
      </div>
    </div>

    <div class="grid">
      <div class="stat"><small>TODAY REQUESTS</small><h2 id="cToday">0</h2></div>
      <div class="stat"><small>YESTERDAY REQUESTS</small><h2 id="cYesterday">0</h2></div>
      <div class="stat"><small>LAST 30 DAYS</small><h2 id="c30">0</h2></div>
    </div>

    <div class="box">
      <h3>📢 Ad-Wise Performance (Kis Ad se kitne aaye)</h3>
      <table><thead><tr><th>Ad Name</th><th>Total Requests</th></tr></thead><tbody id="adBody"></tbody></table>
    </div>

    <div class="box">
      <h3>👥 Recent Join Requests (Zero Fake Click Verified)</h3>
      <table><thead><tr><th>User Name</th><th>Username</th><th>Ad Source</th><th>Time</th></tr></thead><tbody id="userBody"></tbody></table>
    </div>
  </div>

  <script>
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

      const reqs = data.requests;
      const now = new Date();
      const todayStr = now.toISOString().slice(0,10);
      const yestStr = new Date(now - 86400000).toISOString().slice(0,10);

      document.getElementById('cToday').innerText = reqs.filter(r => r.joined_at.startsWith(todayStr)).length;
      document.getElementById('cYesterday').innerText = reqs.filter(r => r.joined_at.startsWith(yestStr)).length;
      document.getElementById('c30').innerText = reqs.length;

      const adCounts = {};
      reqs.forEach(r => { adCounts[r.ad_name] = (adCounts[r.ad_name] || 0) + 1; });
      document.getElementById('adBody').innerHTML = Object.entries(adCounts)
        .sort((a,b) => b[1]-a[1])
        .map(([ad, cnt]) => \`<tr><td><b>\${ad}</b></td><td>\${cnt}</td></tr>\`).join('') || '<tr><td colspan="2">No data yet</td></tr>';

      document.getElementById('userBody').innerHTML = reqs.slice(0, 100).map(r => \`<tr>
        <td><b>\${r.user_full_name || 'Telegram User'}</b></td>
        <td>\${r.user_username}</td>
        <td><span style="background:#1e3a8a;padding:3px 8px;border-radius:6px;font-size:11px;">\${r.ad_name}</span></td>
        <td>\${new Date(r.joined_at).toLocaleString()}</td>
      </tr>\`).join('') || '<tr><td colspan="4">No requests yet</td></tr>';
    }
    if (document.getElementById('passInput').value) unlockDash();
  </script>
</body>
</html>`);
}
