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

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cookies = parseCookies(req.headers.cookie);

  if (!cookies.misan_admin || cookies.misan_admin !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const { requestId, action } = req.body || {};

  if (!requestId || (action !== 'approved' && action !== 'declined')) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  const { error } = await supabase
    .from('access_requests')
    .update({ status: action })
    .eq('id', requestId);

  if (error) {
    return res.status(500).json({ error: 'Failed to update request' });
  }

  return res.status(200).json({ success: true });
};
