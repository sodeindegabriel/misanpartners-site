# Misan Partners — Website

A static, dependency-free site. Three surfaces:

- `index.html` — Landing + Manifesto (one continuous scroll experience)
- `investors/index.html` — Investor Login (the gate; front-end only)
- shared assets in `assets/` (self-hosted Inter fonts, CSS, JS, favicons, OG image)

No build step. No framework. No external requests (fonts are self-hosted).

## Preview locally

Run any static server from this folder (don't open via file:// — relative
routes resolve better over HTTP):

```
npx serve .
# or
python3 -m http.server 8000
```

Then open http://localhost:8000

## Deploy

Upload the entire folder to any static host and point
**misanpartners.com** (and www) at it:

- Netlify / Vercel / Cloudflare Pages — drag-and-drop or connect a repo
- Or any web host / S3+CloudFront — upload the files to the web root

Serve `index.html` at `/` and ensure `/investors/` serves
`investors/index.html`. Force HTTPS.

## Notes

- **Fonts** are self-hosted (`assets/fonts/Inter-*.woff2`). No Google Fonts call.
- **Favicon / OG**: set in each page's `<head>`; OG image at
  `assets/img/og-image.png`. `theme-color` is `#000`.
- **Links**: "Lagos" → `mailto:c@misanpartners.com`. "Investors" → `/investors/`.
- **Reduced motion** is respected (animations disabled, content shown static).

## Investor Login — needs a backend

`investors/index.html` is the visible gate only. It currently has an INTERIM
script that intercepts submit and shows a "by invitation" message. Replace it
with real, invitation-only authentication:

- POST the form to your auth endpoint over HTTPS (e.g. `/api/auth/login`).
- Never handle or store passwords client-side. Hash + salt server-side, or use
  a managed auth provider (Auth0, Clerk, Supabase Auth) with invite-only access.
- On success, set a secure, http-only session cookie and redirect to the
  protected documents area (the investor portal, built separately).
- Rate-limit login attempts; keep `/investors/` `noindex`.

© 2026 Misan Partners.
