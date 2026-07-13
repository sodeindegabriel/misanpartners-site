export const config = {
  matcher: [
    '/investors/portal/:path*',
    '/investors/data/:file(.*\\.json)',
  ],
};

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

export default async function middleware(request) {
  const cookies = parseCookies(request.headers.get('cookie'));
  const token = cookies.misan_session;

  if (!token) {
    return Response.redirect(new URL('/investors/', request.url), 302);
  }

  const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: process.env.SUPABASE_SERVICE_KEY,
    },
  });

  if (!response.ok) {
    return Response.redirect(new URL('/investors/', request.url), 302);
  }
}
