const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

module.exports = async (req, res) => {
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
};
