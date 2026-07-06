#!/usr/bin/env bash
# verify-qscoring.sh — sanity-check Cloudflare caching, redirects, and error behavior
# Usage: ./verify-qscoring.sh

set -u
DOMAIN="qscoring.com"
APEX="https://${DOMAIN}"
WWW="https://www.${DOMAIN}"

bold() { printf "\n\033[1m%s\033[0m\n" "$*"; }
ok()   { printf "  \033[32m✓\033[0m %s\n" "$*"; }
warn() { printf "  \033[33m!\033[0m %s\n" "$*"; }
fail() { printf "  \033[31m✗\033[0m %s\n" "$*"; }

# --- 1. Redirect chain ---------------------------------------------------
bold "1. Redirect chain (apex, http, www)"
for url in "http://${DOMAIN}/" "${APEX}/" "${WWW}/"; do
  hops=$(curl -s -o /dev/null -w "%{num_redirects}" -L "$url")
  final=$(curl -s -o /dev/null -w "%{url_effective}" -L "$url")
  status=$(curl -s -o /dev/null -w "%{http_code}" -L "$url")
  printf "  %s -> %s (hops=%s, status=%s)\n" "$url" "$final" "$hops" "$status"
  if [ "$hops" -le 1 ]; then ok "single hop"; else warn "multiple redirects ($hops)"; fi
done

# --- 2. HTML cache headers ----------------------------------------------
bold "2. HTML cache headers on key marketing routes"
for path in "/" "/methodology" "/performance" "/portfolio" "/blog"; do
  echo "  --- ${path}"
  curl -sI -H "Cache-Control: no-cache" "${WWW}${path}" \
    | grep -iE "^(HTTP/|cache-control|cf-cache-status|cf-ray|age|cdn-cache-control|vary):" \
    | sed 's/^/    /'
done

# --- 3. HIT/MISS behavior (two consecutive requests) --------------------
bold "3. Cache HIT/MISS on second request"
for path in "/" "/methodology" "/sitemap.xml" "/robots.txt"; do
  curl -s -o /dev/null "${WWW}${path}"           # warm
  status=$(curl -sI "${WWW}${path}" | awk -F': ' 'tolower($1)=="cf-cache-status"{print $2}' | tr -d '\r')
  printf "  %-15s cf-cache-status=%s\n" "$path" "${status:-<none>}"
done

# --- 4. Static asset caching --------------------------------------------
bold "4. Static asset caching (_next/static)"
asset=$(curl -s "${WWW}/" | grep -oE "/_next/static/[^\"']+\.(js|css)" | head -n1)
if [ -n "$asset" ]; then
  echo "  Sampled asset: $asset"
  curl -sI "${WWW}${asset}" \
    | grep -iE "^(HTTP/|cache-control|cf-cache-status|age|etag):" \
    | sed 's/^/    /'
else
  warn "Could not find a _next/static asset on the homepage"
fi

# --- 5. API endpoints: status + headers ---------------------------------
bold "5. API endpoint behavior"
for path in "/api/score/AAPL" "/api/search?q=apple"; do
  echo "  --- ${path}"
  curl -sI "${WWW}${path}" \
    | grep -iE "^(HTTP/|cache-control|cf-cache-status|content-type|x-ratelimit|retry-after):" \
    | sed 's/^/    /'
done

# --- 6. Light load test: 20 sequential requests to /api/score/AAPL ------
bold "6. Light load — 20 sequential requests to /api/score/AAPL"
declare -A codes
for i in $(seq 1 20); do
  c=$(curl -s -o /dev/null -w "%{http_code}" "${WWW}/api/score/AAPL")
  codes[$c]=$(( ${codes[$c]:-0} + 1 ))
done
for k in "${!codes[@]}"; do printf "  HTTP %s -> %s\n" "$k" "${codes[$k]}"; done

# --- 7. Sitemap + robots ------------------------------------------------
bold "7. Sitemap and robots.txt"
for path in "/sitemap.xml" "/robots.txt"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "${WWW}${path}")
  size=$(curl -s -o /dev/null -w "%{size_download}" "${WWW}${path}")
  printf "  %-15s HTTP %s, %s bytes\n" "$path" "$code" "$size"
done

bold "Done."
echo "Re-run after Cloudflare changes propagate (~1–2 minutes)."
echo "Healthy signals: single redirect hop, cf-cache-status=HIT on second request for cacheable paths,"
echo "long max-age on /_next/static, and zero 5xx in the light load test."
