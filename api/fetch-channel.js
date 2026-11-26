export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { bot_token, channel_id } = req.body;
  if (!bot_token || !channel_id) {
    return res.status(400).json({ error: 'Bot Token और Channel ID दोनों ज़रूरी हैं' });
  }

  try {
    const chatRes = await fetch(`https://api.telegram.org/bot${bot_token}/getChat?chat_id=${encodeURIComponent(channel_id)}`);
    const chatData = await chatRes.json();

    if (!chatData.ok) {
      return res.status(400).json({ error: 'चैनल नहीं मिला! चेक करें कि बॉट उस चैनल में Admin है या नहीं।' });
    }

    const chat = chatData.result;
    let dp_url = 'https://i.ibb.co/1J2HgYpQ/IMG-20261103-094934-226.jpg';

    if (chat.photo && chat.photo.big_file_id) {
      const fileRes = await fetch(`https://api.telegram.org/bot${bot_token}/getFile?file_id=${chat.photo.big_file_id}`);
      const fileData = await fileRes.json();
      if (fileData.ok && fileData.result.file_path) {
        dp_url = `https://api.telegram.org/file/bot${bot_token}/${fileData.result.file_path}`;
      }
    }

    return res.status(200).json({
      success: true,
      title: chat.title || 'Official Channel',
      username: chat.username ? `@${chat.username}` : 'Private Channel',
      dp_url
    });
  } catch (err) {
    return res.status(500).json({ error: 'Telegram सर्वर से कनेक्ट नहीं हो पाया' });
  }
}
