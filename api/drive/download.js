const { Readable } = require('stream');
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

  const { fileId, tier } = req.query;

  if (!fileId) {
    return res.status(400).json({ error: 'Missing fileId' });
  }

  // `tier` from the client is only a hint for already-open files. For anything else,
  // access must be independently confirmed against access_requests — never trust the
  // client-supplied tier to decide whether a locked file gets served.
  if (tier !== 'open') {
    const { data: accessRows, error: accessError } = await supabase
      .from('access_requests')
      .select('status')
      .eq('investor_email', userData.user.email)
      .eq('file_id', fileId)
      .eq('status', 'approved')
      .limit(1);

    if (accessError) {
      return res.status(500).json({ error: 'Failed to verify access' });
    }

    if (!accessRows || accessRows.length === 0) {
      return res.status(403).json({ error: 'Access requires approval' });
    }
  }

  let accessToken;
  try {
    accessToken = await getGoogleAccessToken();
  } catch (err) {
    return res.status(502).json({ error: 'Failed to authenticate with Google Drive' });
  }

  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=webContentLink,mimeType,name`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!metaRes.ok) {
    return res.status(502).json({ error: 'Failed to load file metadata' });
  }

  const meta = await metaRes.json();

  if (meta.mimeType && meta.mimeType.startsWith('video/')) {
    const viewUrl = `https://drive.google.com/file/d/${fileId}/preview`;
    res.writeHead(302, { Location: viewUrl });
    return res.end();
  }

  const isGoogleWorkspaceFile = (meta.mimeType || '').startsWith('application/vnd.google-apps');

  const fileRes = await fetch(
    isGoogleWorkspaceFile
      ? `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/pdf`
      : `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!fileRes.ok || !fileRes.body) {
    return res.status(502).json({ error: 'Failed to download file' });
  }

  const filename = isGoogleWorkspaceFile ? `${meta.name}.pdf` : meta.name;

  res.setHeader('Content-Type', isGoogleWorkspaceFile ? 'application/pdf' : meta.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  Readable.fromWeb(fileRes.body).pipe(res);
};
