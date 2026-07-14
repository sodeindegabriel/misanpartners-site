/*
 * Consolidated admin API — one Vercel Serverless Function instead of six.
 * Vercel's [action].js dynamic-route convention maps /api/admin/<x> to this
 * file with req.query.action === '<x>', so every existing admin URL
 * (/api/admin/login, /api/admin/requests, etc.) keeps working unchanged.
 * This exists purely to stay under the platform's per-deployment function
 * count limit — the logic below is unchanged from the original per-route files.
 */
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

function requireAdmin(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  if (!cookies.misan_admin || cookies.misan_admin !== process.env.ADMIN_PASSWORD) {
    res.status(401).json({ error: 'Invalid credentials' });
    return false;
  }
  return true;
}

// Best-effort brute-force mitigation for the admin password. This state lives
// in the function instance's memory, so it resets on cold start and isn't
// shared across concurrent instances — it raises the bar against a naive
// scripted attacker hitting a single warm instance, but is NOT a substitute
// for a persistent-store-backed limiter (e.g. Vercel KV/Upstash) if this
// needs to be robust against a distributed attempt.
const loginAttempts = new Map(); // ip -> { count, firstAttemptAt }
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return xff.split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function isLoginRateLimited(ip) {
  const entry = loginAttempts.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.firstAttemptAt > LOGIN_WINDOW_MS) {
    loginAttempts.delete(ip);
    return false;
  }
  return entry.count >= LOGIN_MAX_ATTEMPTS;
}

function recordFailedLogin(ip) {
  const entry = loginAttempts.get(ip);
  const now = Date.now();
  if (!entry || now - entry.firstAttemptAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, firstAttemptAt: now });
  } else {
    entry.count += 1;
  }
}

function clearFailedLogins(ip) {
  loginAttempts.delete(ip);
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

async function handleLogin(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = getClientIp(req);

  if (isLoginRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
  }

  const { password } = req.body || {};

  if (!password || password !== process.env.ADMIN_PASSWORD) {
    recordFailedLogin(ip);
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  clearFailedLogins(ip);
  console.log('[admin-login] setting misan_admin cookie');
  res.setHeader('Set-Cookie', buildCookie('misan_admin', process.env.ADMIN_PASSWORD, 86400));
  return res.status(200).json({ success: true });
}

async function handleRequests(req, res) {
  if (!requireAdmin(req, res)) return;

  const { data, error } = await supabase
    .from('access_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ error: 'Failed to load requests' });
  }

  return res.status(200).json(data || []);
}

async function handleApprove(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireAdmin(req, res)) return;

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
}

async function handleInvestors(req, res) {
  const cookieHeader = req.headers.cookie || '';
  console.log('[admin-investors] cookie header:', cookieHeader ? 'present' : 'missing');
  console.log('[admin-investors] cookies:', cookieHeader.split(';').map((c) => c.trim().split('=')[0]));

  if (!requireAdmin(req, res)) return;

  const { data, error } = await supabase.auth.admin.listUsers();

  if (error) {
    return res.status(500).json({ error: 'Failed to load investors' });
  }

  const investors = (data.users || []).map((u) => ({
    id: u.id,
    email: u.email,
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at,
  }));

  return res.status(200).json(investors);
}

async function handleInvite(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireAdmin(req, res)) return;

  const { email } = req.body || {};

  if (!email) {
    return res.status(400).json({ error: 'Missing email' });
  }

  const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: 'https://misanpartners.com/investors/',
  });

  if (error) {
    return res.status(500).json({ error: error.message || 'Failed to send invite' });
  }

  return res.status(200).json({ success: true });
}

async function handleRevoke(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireAdmin(req, res)) return;

  const { userId } = req.body || {};

  if (!userId) {
    return res.status(400).json({ error: 'Missing userId' });
  }

  const { error } = await supabase.auth.admin.deleteUser(userId);

  if (error) {
    return res.status(500).json({ error: error.message || 'Failed to revoke investor' });
  }

  return res.status(200).json({ success: true });
}

const ROUTES = {
  login: handleLogin,
  requests: handleRequests,
  approve: handleApprove,
  investors: handleInvestors,
  invite: handleInvite,
  revoke: handleRevoke,
};

module.exports = async (req, res) => {
  // Parse the route straight from the request path rather than trusting the
  // shape of req.query.action — same fix applied to api/auth/[...action].js
  // after req.query.action proved unreliable for this deployment's routing.
  const pathname = (req.url || '').split('?')[0];
  const match = pathname.match(/^\/api\/admin\/(.+)$/);
  const action = match ? match[1] : null;
  const handler = action ? ROUTES[action] : null;

  if (!handler) {
    return res.status(404).json({ error: 'Not found' });
  }

  return handler(req, res);
};
