#!/usr/bin/env bash
# Builds www/ (Capacitor webDir) from docs/ (the last published copy of the Anyway web app),
# leaving out everything that must never ship inside the app binary.
set -euo pipefail
rm -rf www && mkdir -p www
rsync -a \
  --exclude 'admin.html' \
  --exclude 'anyway_business_plan_*' \
  --exclude 'coo_reports' \
  --exclude 'ios-ci-setup.md' \
  docs/ www/
test -f www/index.html || { echo "www/index.html missing"; exit 1; }
# the app must not depend on any CDN at runtime
if grep -Eq 'cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com' www/index.html; then
  echo "index.html still references a CDN; vendor it under vendor/ first"; exit 1
fi
echo "www ready: $(find www -type f | wc -l) files, $(du -sh www | cut -f1)"
