#!/usr/bin/env bash
# First-run setup for Talk AI as a local website.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

say() { printf "\n%s\n" "$1"; }
ask() {
  local prompt="$1"
  local default="${2:-}"
  local reply=""
  if [ -n "$default" ]; then
    read -r -p "$prompt [$default]: " reply || true
    printf "%s" "${reply:-$default}"
  else
    read -r -p "$prompt: " reply || true
    printf "%s" "$reply"
  fi
}

say "Talk AI setup"
say "This package is a local website. There is no Electron or Mac app wrapper."

if [ ! -d node_modules ]; then
  say "Installing website dependencies…"
  npm install
else
  say "Website dependencies already installed."
fi

want_lock=0
lock_user=""
lock_pass=""
if [ -t 0 ]; then
  lock_choice="$(ask "Protect this copy with a username and password? (y/N)" "N")"
  case "$lock_choice" in
    y|Y|yes|YES)
      want_lock=1
      lock_user="$(ask "Username" "admin")"
      stty -echo
      lock_pass="$(ask "Password (min 8 chars)")"
      stty echo
      printf "\n"
      if [ "${#lock_pass}" -lt 8 ]; then
        echo "Password too short — skipping lock. You can enable it later in Settings → Security."
        want_lock=0
      fi
      ;;
  esac
fi

if [ "$want_lock" = "1" ]; then
  mkdir -p data
  node --input-type=module -e "
    import { pbkdf2Sync, randomBytes } from 'node:crypto';
    import { writeFileSync } from 'node:fs';
    const username = process.argv[1];
    const password = process.argv[2];
    const salt = randomBytes(16).toString('hex');
    const iterations = 210000;
    const hash = pbkdf2Sync(password, Buffer.from(salt, 'hex'), iterations, 32, 'sha256').toString('hex');
    writeFileSync('data/lock.json', JSON.stringify({
      enabled: true,
      username,
      salt,
      hash,
      iterations,
      session_hours: 168,
    }, null, 2));
    console.log('Wrote data/lock.json');
  " "$lock_user" "$lock_pass"
  say "Sign-in is on. Open Talk AI and sign in with that username."
fi

say "Done."
say "Start the website with:  npm run dev"
say "First launch: Settings → Security if you want to add a lock later."

if [ -t 0 ]; then
  start_now="$(ask "Start it now? (Y/n)" "Y")"
  case "$start_now" in
    n|N|no|NO) exit 0 ;;
  esac
  npm run dev
fi
