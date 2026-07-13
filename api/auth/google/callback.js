module.exports = async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send('Missing authorization code');
  }

  const params = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    grant_type: 'authorization_code',
  });

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  const tokenData = await tokenRes.json();

  if (!tokenRes.ok) {
    return res.status(502).send('Failed to exchange authorization code');
  }

  console.log('[google-oauth] full token response:', JSON.stringify({
    has_access_token: !!tokenData.access_token,
    has_refresh_token: !!tokenData.refresh_token,
    scope: tokenData.scope,
    token_type: tokenData.token_type,
    refresh_token_preview: tokenData.refresh_token?.slice(0, 20)
  }));

  return res.status(200).send('Google Drive authorized. Check server logs for the refresh token.');
};
