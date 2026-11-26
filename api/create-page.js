export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SB_URL = (process.env.SUPABASE_URL || '').trim();
  const SB_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

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

  const {
    owner_name,
    bot_token,
    channel_id,
    channel_title,
    channel_username,
    dp_url,
    pixel_id,
    capi_token,
    theme_id
  } = req.body || {};

  if (!bot_token || !channel_id || !pixel_id || !capi_token) {
    return res.status(400).json({ error: 'सभी फ़ील्ड भरना अनिवार्य है!' });
  }

  const baseName = (channel_username && channel_username !== 'Private Channel')
    ? channel_username.replace('@', '')
    : (channel_title || 'channel');

  let cleanSlug = baseName.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (cleanSlug.length < 3) cleanSlug = 'channel';

  try {
    const existing = await sbFetch(`saas_pages?slug=eq.${encodeURIComponent(cleanSlug)}&select=slug`);
    if (Array.isArray(existing) && existing.length > 0) {
      cleanSlug = `${cleanSlug}-${Math.floor(100 + Math.random() * 900)}`;
    }

    const randomPin = Math.floor(1000 + Math.random() * 9000);
    const dashboardPass = `RJ-${randomPin}`;
    const autoKey = `AUTO-${Date.now()}`;

    await sbFetch('saas_keys', {
      method: 'POST',
      body: JSON.stringify([{
        key_code: autoKey,
        buyer_name: (owner_name || channel_title || 'User').trim(),
        assigned_slug: cleanSlug,
        status: 'active'
      }])
    });

    const insertRes = await sbFetch('saas_pages', {
      method: 'POST',
      body: JSON.stringify([{
        slug: cleanSlug,
        license_key: autoKey,
        bot_token: bot_token.trim(),
        channel_id: channel_id.trim(),
        channel_title,
        channel_username,
        dp_url,
        pixel_id: pixel_id.trim(),
        capi_token: capi_token.trim(),
        theme_id: Number(theme_id) || 1,
        dashboard_pass: dashboardPass
      }])
    });

    if (insertRes && insertRes.message) {
      return res.status(500).json({ error: 'Database Error: ' + insertRes.message });
    }

    const host = req.headers.host;
    const webhookUrl = `https://${host}/webhook/${cleanSlug}`;
    await fetch(`https://api.telegram.org/bot${bot_token.trim()}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ['chat_join_request']
      })
    });

    return res.status(200).json({
      success: true,
      landing_url: `https://${host}/p/${cleanSlug}?ad={{ad.name}}`,
      dashboard_url: `https://${host}/dash/${cleanSlug}`,
      dashboard_pass: dashboardPass
    });
  } catch (err) {
    return res.status(500).json({ error: 'सर्वर एरर: ' + err.message });
  }
}
