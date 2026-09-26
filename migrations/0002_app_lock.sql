create table if not exists app_lock (
  id text primary key,
  enabled boolean not null default false,
  username text not null default '',
  salt text not null default '',
  hash text not null default '',
  iterations integer not null default 210000,
  session_hours integer not null default 168,
  updated_at timestamptz not null default now()
);

create table if not exists app_sessions (
  token_hash text primary key,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists lock_attempts (
  ip text primary key,
  fails integer not null default 0,
  locked_until timestamptz
);
