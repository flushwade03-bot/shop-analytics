#!/usr/bin/env bash
set -eu

required="ETSY_API_KEY ETSY_SHARED_SECRET ETSY_REFRESH_TOKEN"
for name in $required; do
  eval "value=\${$name-}"
  if [ -z "$value" ]; then
    echo "Missing required Codex environment secret: $name" >&2
    exit 1
  fi
done

umask 077
{
  printf 'ETSY_API_KEY=%s\n' "$ETSY_API_KEY"
  printf 'ETSY_SHARED_SECRET=%s\n' "$ETSY_SHARED_SECRET"
  printf 'ETSY_REDIRECT_URI=%s\n' "${ETSY_REDIRECT_URI:-http://localhost:3000/auth/etsy/callback}"
  printf 'ETSY_ACCESS_TOKEN=%s\n' "${ETSY_ACCESS_TOKEN:-}"
  printf 'ETSY_REFRESH_TOKEN=%s\n' "$ETSY_REFRESH_TOKEN"
  printf 'ETSY_TOKEN_SCOPE=%s\n' "${ETSY_TOKEN_SCOPE:-transactions_r listings_r listings_w}"
  printf 'ETSY_SHOP_ID=%s\n' "${ETSY_SHOP_ID:-}"
  printf 'PORT=3000\n'
} > .env

mkdir -p .data
chmod 700 .data
echo "Etsy credentials prepared for this ephemeral Codex task."
