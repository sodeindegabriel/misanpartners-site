const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  header.split(';').forEach((pair) => {
    const index = pair.indexOf('=');
    if (index === -1) return;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    cookies[key] = decodeURIComponent(value);
  });
  return cookies;
}

async function getGoogleAccessToken() {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    grant_type: 'refresh_token',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  const data = await res.json();
  console.log('[google-auth-debug] status:', res.status, 'response:', JSON.stringify(data));

  if (!res.ok) {
    throw new Error(data.error_description || 'Failed to refresh Google access token');
  }

  return data.access_token;
}

module.exports = async (req, res) => {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.misan_session;

  if (!token) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);

  if (userError || !userData.user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const { folderId } = req.query;

  if (!folderId) {
    return res.status(400).json({ error: 'Missing folderId' });
  }

  let accessToken;
  try {
    accessToken = await getGoogleAccessToken();
  } catch (err) {
    return res.status(502).json({ error: 'Failed to authenticate with Google Drive' });
  }

  const listParams = new URLSearchParams({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id,name,mimeType,size,modifiedTime)',
  });

  const driveRes = await fetch(`https://www.googleapis.com/drive/v3/files?${listParams}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const driveData = await driveRes.json();

  if (!driveRes.ok) {
    return res.status(502).json({ error: 'Failed to list Drive files' });
  }

  return res.status(200).json(driveData.files || []);
};
