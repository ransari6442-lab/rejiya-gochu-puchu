import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    license_key,
    slug,
    bot_token,
    channel_id,
    channel_title,
    channel_username,
    dp_url,
    pixel_id,
    capi_token,
    theme_id
  } = req.body;

  if (!license_key || !slug || !bot_token || !channel_id || !pixel_id || !capi_token) {
    return res.status(400).json({ error: 'सभी फ़ील्ड भरना अनिवार्य है!' });
  }

  const cleanSlug = slug.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
  if (cleanSlug.length < 3) {
    return res.status(400).json({ error: 'पेज का नाम कम से कम 3 अक्षरों का रखें।' });
  }

  try {
    const { data: keyData, error: keyErr } = await supabase
      .from('saas_keys')
      .select('*')
      .eq('key_code', license_key.trim())
      .single();

    if (keyErr || !keyData) {
      return res.status(403).json({ error: 'गलत Activation Key! एडमिन से सही Key लें।' });
    }
    if (keyData.status !== 'unused') {
      return res.status(403).json({ error: 'यह Activation Key पहले ही इस्तेमाल हो चुकी है या ब्लॉक है।' });
    }

    const { data: existingPage } = await supabase
      .from('saas_pages')
      .select('slug')
      .eq('slug', cleanSlug)
      .single();

    if (existingPage) {
      return res.status(400).json({ error: 'यह लिंक नाम पहले से बुक है, कोई दूसरा नाम चुनें।' });
    }

    const randomPin = Math.floor(1000 + Math.random() * 9000);
    const dashboardPass = `RJ-${randomPin}`;

    const { error: insertErr } = await supabase.from('saas_pages').insert([{
      slug: cleanSlug,
      license_key: license_key.trim(),
      bot_token: bot_token.trim(),
      channel_id: channel_id.trim(),
      channel_title,
      channel_username,
      dp_url,
      pixel_id: pixel_id.trim(),
      capi_token: capi_token.trim(),
      theme_id: Number(theme_id) || 1,
      dashboard_pass: dashboardPass
    }]);

    if (insertErr) {
      return res.status(500).json({ error: 'पेज सेव करने में समस्या आई: ' + insertErr.message });
    }

    await supabase
      .from('saas_keys')
      .update({ status: 'active', assigned_slug: cleanSlug })
      .eq('key_code', license_key.trim());

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
