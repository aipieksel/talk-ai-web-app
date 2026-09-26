create table if not exists app_global (
  id text primary key,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into app_global (id, settings)
values ('default', '{}'::jsonb)
on conflict (id) do nothing;

create table if not exists password_reset_outbox (
  id text primary key,
  email text not null,
  url text not null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);
