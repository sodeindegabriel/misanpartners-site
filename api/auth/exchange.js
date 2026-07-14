const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

function buildCookie(name, value, maxAge) {
  const parts = [
    `${name}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAge}`,
  ];
  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }
  return parts.join('; ');
}

module.exports = async (req, res) => {
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
};
