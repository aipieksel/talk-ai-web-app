create table if not exists user_vault (
  user_id text primary key,
  nonce text not null,
  ciphertext text not null,
  updated_at timestamptz not null default now()
);
