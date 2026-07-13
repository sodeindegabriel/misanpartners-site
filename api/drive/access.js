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
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies.misan_session;

  if (!token) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);

  if (userError || !userData.user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const { fileId } = req.query;

  if (!fileId) {
    return res.status(400).json({ error: 'Missing fileId' });
  }

  const { data, error } = await supabase
    .from('access_requests')
    .select('status')
    .eq('investor_email', userData.user.email)
    .eq('file_id', fileId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    return res.status(500).json({ error: 'Failed to check access status' });
  }

  const latest = data && data[0];
  let status = 'none';

  if (latest) {
    if (latest.status === 'approved') status = 'approved';
    else if (latest.status === 'pending') status = 'pending';
    else if (latest.status === 'declined') status = 'declined';
    // 'revoked' (or any other value) falls through to 'none'
  }

  return res.status(200).json({ status });
};
