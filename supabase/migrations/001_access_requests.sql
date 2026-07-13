create table if not exists access_requests (
  id uuid primary key default gen_random_uuid(),
  investor_email text not null,
  file_id text not null,
  file_name text not null,
  project_name text not null,
  status text not null default 'pending',
  created_at timestamptz default now()
);
alter table access_requests enable row level security;
