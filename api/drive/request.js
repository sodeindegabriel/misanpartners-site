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

async function sendRequestNotification({ investorEmail, fileName, projectName, isReRequest }) {
  if (!process.env.RESEND_API_KEY) return;
  const subject = isReRequest
    ? `Re-request: ${fileName} — previously declined`
    : `New access request: ${fileName}`;
  const body = isReRequest
    ? `${investorEmail} is re-requesting access to ${fileName} in ${projectName}. This was previously declined.\n\nReview: https://misanpartners.com/admin/`
    : `${investorEmail} has requested access to ${fileName} in ${projectName}.\n\nApprove or decline: https://misanpartners.com/admin/`;
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Misan Partners <notifications@misanpartners.com>',
      to: ['c@misanpartners.com'],
      subject,
      text: body,
    }),
  });
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

  const { data: existingRows, error: existingError } = await supabase
    .from('access_requests')
    .select('id, status')
    .eq('investor_email', investorEmail)
    .eq('file_id', fileId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (existingError) {
    return res.status(500).json({ error: 'Failed to save access request' });
  }

  const existingRow = existingRows && existingRows[0];
  const wasDeclined = existingRow && existingRow.status === 'declined';

  if (existingRow) {
    const { error: updateError } = await supabase
      .from('access_requests')
      .update({ status: 'pending' })
      .eq('id', existingRow.id);

    if (updateError) {
      return res.status(500).json({ error: 'Failed to save access request' });
    }
  } else {
    const { error: insertError } = await supabase.from('access_requests').insert({
      investor_email: investorEmail,
      file_id: fileId,
      file_name: fileName,
      project_name: projectName,
    });

    if (insertError) {
      return res.status(500).json({ error: 'Failed to save access request' });
    }
  }

  try {
    await sendRequestNotification({
      investorEmail,
      fileName,
      projectName,
      isReRequest: wasDeclined,
    });
  } catch (err) {
    console.log('[access-request] Failed to send notification email:', err.message);
  }

  return res.status(200).json({ success: true });
};
