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

async function sendApprovalEmail(investorEmail, fileName) {
  if (!process.env.RESEND_API_KEY) {
    console.log('[approve] RESEND_API_KEY not set, skipping approval email to', investorEmail);
    return;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Misan Partners <notifications@misanpartners.com>',
        to: investorEmail,
        subject: `Access approved — ${fileName}`,
        text: `Your request to access ${fileName} on the Misan Partners investor portal has been approved. Login to view it: https://misanpartners.com/investors/`,
      }),
    });

    if (!res.ok) {
      console.log('[approve] Failed to send approval email:', res.status, await res.text());
    }
  } catch (err) {
    console.log('[approve] Error sending approval email:', err.message);
  }
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
  const validActions = ['approved', 'declined', 'revoked'];

  if (!requestId || !validActions.includes(action)) {
    return res.status(400).json({ error: 'Invalid request' });
  }

  const { data, error } = await supabase
    .from('access_requests')
    .update({ status: action })
    .eq('id', requestId)
    .select('investor_email, file_name')
    .single();

  if (error) {
    return res.status(500).json({ error: 'Failed to update request' });
  }

  if (action === 'approved' && data) {
    await sendApprovalEmail(data.investor_email, data.file_name);
  }

  return res.status(200).json({ success: true });
};
