/*
 * Consolidated auth API — one Vercel Serverless Function instead of seven.
 * Uses Vercel's [...action].js catch-all dynamic-route convention (not a
 * single [action].js) because /api/auth/google/callback is two path
 * segments deep — a single dynamic segment can't match it. req.query.action
 * arrives as an array of path segments, e.g. ['login'] or ['google','callback'].
 * Every existing URL (/api/auth/login, /api/auth/google/callback, etc.)
 * keeps resolving unchanged — the logic below is unchanged from the
 * original per-route files.
 */
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function buildCookie(name, value, maxAge) {
  // Always Secure: Vercel serves every deployment (production and preview)
  // over HTTPS, and `localhost` is exempted from the Secure requirement by
  // browsers, so there's no legitimate case where this cookie should ever
  // be allowed over plain HTTP.
  return [
    `${name}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAge}`,
    'Secure',
  ].join('; ');
}

function clearCookie(name) {
  return [
    `${name}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
    'Secure',
  ].join('; ');
}

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

async function handleLogin(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.session) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const { access_token, refresh_token } = data.session;
  const maxAge = 86400;

  res.setHeader('Set-Cookie', [
    buildCookie('misan_session', access_token, maxAge),
    buildCookie('misan_refresh', refresh_token, maxAge),
  ]);

  return res.status(200).json({ success: true });
}

async function handleLogout(req, res) {
  res.setHeader('Set-Cookie', [
    clearCookie('misan_session'),
    clearCookie('misan_refresh'),
  ]);

  res.writeHead(302, { Location: '/investors/' });
  return res.end();
}

async function handleVerify(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.misan_session;

  if (!token) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  return res.status(200).json({ email: data.user.email });
}

async function handleExchange(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { access_token, refresh_token } = req.body || {};

  if (!access_token || !refresh_token) {
    return res.status(400).json({ error: 'Missing tokens' });
  }

  const { data, error } = await supabase.auth.getUser(access_token);

  if (error || !data.user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const maxAge = 86400;

  res.setHeader('Set-Cookie', [
    buildCookie('misan_session', access_token, maxAge),
    buildCookie('misan_refresh', refresh_token, maxAge),
  ]);

  return res.status(200).json({ success: true });
}

async function handleSetPassword(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { access_token, refresh_token, password } = req.body || {};

  if (!access_token || !refresh_token || !password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(access_token);

  if (userError || !userData.user) {
    return res.status(401).json({ error: 'Invalid or expired link' });
  }

  const { error: updateError } = await supabase.auth.admin.updateUserById(userData.user.id, { password });

  if (updateError) {
    return res.status(500).json({ error: updateError.message || 'Failed to set password' });
  }

  const maxAge = 86400;

  res.setHeader('Set-Cookie', [
    buildCookie('misan_session', access_token, maxAge),
    buildCookie('misan_refresh', refresh_token, maxAge),
  ]);

  return res.status(200).json({ success: true });
}

async function handleResetPassword(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email } = req.body || {};

  if (!email) {
    return res.status(400).json({ error: 'Missing email' });
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: 'https://misanpartners.com/investors/setup',
  });

  if (error) {
    return res.status(500).json({ error: error.message || 'Failed to send reset link' });
  }

  return res.status(200).json({ success: true });
}

async function handleGoogleCallback(req, res) {
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

  console.log('[google-oauth] token exchange successful, has_refresh_token:', !!tokenData.refresh_token);

  return res.status(200).send('Google Drive authorized. Check server logs for the refresh token.');
}

const ROUTES = {
  login: handleLogin,
  logout: handleLogout,
  verify: handleVerify,
  exchange: handleExchange,
  setpassword: handleSetPassword,
  resetpassword: handleResetPassword,
};

module.exports = async (req, res) => {
  // Parse the route straight from the request path rather than trusting the
  // shape of req.query.action (string vs array vs slash-joined string varies
  // by runtime/routing convention) — this works regardless of that detail.
  const pathname = (req.url || '').split('?')[0];
  const match = pathname.match(/^\/api\/auth\/(.+)$/);
  const segments = match ? match[1].split('/').filter(Boolean) : [];

  if (segments.length === 2 && segments[0] === 'google' && segments[1] === 'callback') {
    return handleGoogleCallback(req, res);
  }

  if (segments.length === 1) {
    const handler = ROUTES[segments[0]];
    if (handler) return handler(req, res);
  }

  return res.status(404).json({ error: 'Not found' });
};
