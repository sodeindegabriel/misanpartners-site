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
  const token = cookies.misan_session;

  if (!token) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);

  if (userError || !userData.user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const { fileId, fileName, projectName } = req.body || {};

  if (!fileId || !fileName || !projectName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const investorEmail = userData.user.email;

  const { error: insertError } = await supabase.from('access_requests').insert({
    investor_email: investorEmail,
    file_id: fileId,
    file_name: fileName,
    project_name: projectName,
  });

  if (insertError) {
    return res.status(500).json({ error: 'Failed to save access request' });
  }

  console.log('[access-request] notify c@misanpartners.com:', {
    investorEmail,
    fileId,
    fileName,
    projectName,
  });

  return res.status(200).json({ success: true });
};
