create table if not exists admin_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz default now()
);
alter table admin_settings enable row level security;

-- No RLS policies are added on purpose: this table is only ever read/written
-- via the Supabase service-role key from the admin serverless functions,
-- which bypasses RLS entirely. It must never be exposed to anon/authenticated
-- clients directly.

-- Seed a placeholder, NOT a real password. This is intentionally not a valid
-- bcrypt hash, so api/admin/[action].js will keep authenticating against the
-- existing Vercel ADMIN_PASSWORD env var until a real password is set —
-- login keeps working uninterrupted right after this migration runs.
-- To set the real password, log into /admin/ once (using the existing
-- Vercel ADMIN_PASSWORD) and use the new "Change Password" panel — it writes
-- a proper bcrypt hash into this row and Supabase becomes the source of truth
-- from then on.
insert into admin_settings (key, value)
values ('admin_password', 'CHANGE_ME_ON_FIRST_LOGIN')
on conflict (key) do nothing;
