function clearCookie(name) {
  const parts = [
    `${name}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
  ];
  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }
  return parts.join('; ');
}

module.exports = async (req, res) => {
  res.setHeader('Set-Cookie', [
    clearCookie('misan_session'),
    clearCookie('misan_refresh'),
  ]);

  res.writeHead(302, { Location: '/investors/' });
  return res.end();
};
