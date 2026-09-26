create table if not exists provider_credential (
  provider text primary key,
  nonce text not null,
  ciphertext text not null,
  last_four text not null,
  updated_at timestamptz not null default now()
);

update app_global
set settings = settings - 'customApiKey'
where settings ? 'customApiKey';
