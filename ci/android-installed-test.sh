#!/usr/bin/env bash
# One-time manual calibration: install the candidate PWA as a WebAPK on an Android
# emulator and verify the wallet CSV export from the installed context.
# $1 = public HTTPS base URL of the served candidate (cloudflared quick tunnel).
# Synthetic data only: one device-wallet piece seeded via a harness page on the same
# origin. No accounts, no secrets. All stage evidence lands in ./evidence.
set -u
BASE="${1%/}"
EV=evidence
mkdir -p "$EV"
log() { echo "[t+$(date +%s)] $*" | tee -a "$EV/stages.log"; }
shot() { adb exec-out screencap -p > "$EV/$1.png" 2>/dev/null && log "screenshot $1"; }
dump() { adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb exec-out cat /sdcard/ui.xml > "$EV/$1.xml" 2>/dev/null; }

# tap_center <match-file> <candidates...>: tap the center of the first node whose
# text or content-desc equals (or contains, for *-suffixed patterns) a candidate.
cat > "$EV/tap.py" <<'PY'
import re, subprocess, sys
xml_path = sys.argv[1]
pats = sys.argv[2:]
xml = open(xml_path, encoding='utf-8', errors='ignore').read()
nodes = re.findall(r'<node[^>]*>', xml)
def attrs(tag):
    return dict(re.findall(r'([\w:-]+)="([^"]*)"', tag))
best = None
for tag in nodes:
    a = attrs(tag)
    hay = [a.get('text', ''), a.get('content-desc', '')]
    for p in pats:
        sub = p.endswith('*')
        needle = p[:-1] if sub else p
        for h in hay:
            if not h:
                continue
            if (needle in h) if sub else (h.strip() == needle):
                b = re.findall(r'\[(\d+),(\d+)\]', a.get('bounds', ''))
                if len(b) == 2:
                    x = (int(b[0][0]) + int(b[1][0])) // 2
                    y = (int(b[0][1]) + int(b[1][1])) // 2
                    print(f"tap {x} {y} <= {h[:60]}")
                    sys.exit(0)
print("NO-MATCH")
sys.exit(1)
PY

tap_for() { # name candidates...
  local name="$1"; shift
  dump "$name"
  local out
  out=$(python3 "$EV/tap.py" "$EV/$name.xml" "$@")
  log "$out"
  case "$out" in tap*) return 0;; *) return 1;; esac
}

log "stage 0: device + chrome first-run suppression"
adb wait-for-device
adb shell input keyevent 82 >/dev/null 2>&1
adb shell 'echo "chrome --no-first-run --disable-fre" > /data/local/tmp/chrome-command-line && chmod 644 /data/local/tmp/chrome-command-line' 2>/dev/null
adb shell am force-stop com.android.chrome
sleep 2

log "stage 1: seed synthetic device wallet via same-origin harness page"
adb shell am start -a android.intent.action.VIEW -d "$BASE/__seed.html" com.android.chrome >> "$EV/stages.log" 2>&1
sleep 12
# first-run dialogs, if the command-line flag did not suppress them
tap_for 01-fre "Use without an account" "Accept & continue" "Get started" "No thanks" || true
sleep 3
dump 01-seed
shot 01-seed
if grep -q 'SEEDED' "$EV/01-seed.xml"; then log "seed page confirmed"; else log "WARN: seed page text not found in dump"; fi

log "stage 2: open candidate home in chrome (service worker registers)"
adb shell am start -a android.intent.action.VIEW -d "$BASE/" com.android.chrome >> "$EV/stages.log" 2>&1
sleep 18
shot 02-home

log "stage 3: open chrome menu and install the app"
if tap_for 03-menu "More options"; then
  adb shell input tap $(python3 "$EV/tap.py" "$EV/03-menu.xml" "More options" | awk '/^tap/{print $2,$3}') 2>/dev/null
fi
sleep 3
shot 03-menu-open
if ! tap_for 03-install-item "Install app" "Add to Home screen" "Add to home screen"; then
  log "FAIL: no install menu item found"
  shot 03-no-install-item
  adb logcat -d -t 200 > "$EV/logcat.txt" 2>/dev/null
  exit 3
fi
adb shell input tap $(python3 "$EV/tap.py" "$EV/03-install-item.xml" "Install app" "Add to Home screen" "Add to home screen" | awk '/^tap/{print $2,$3}') 2>/dev/null
sleep 4
shot 03-install-dialog
if tap_for 03-confirm "Install" "Add"; then
  adb shell input tap $(python3 "$EV/tap.py" "$EV/03-confirm.xml" "Install" "Add" | awk '/^tap/{print $2,$3}') 2>/dev/null
fi
log "waiting for webapk package to appear"
PKG=""
for i in $(seq 1 24); do
  PKG=$(adb shell pm list packages 2>/dev/null | grep -o 'org\.chromium\.webapk[a-zA-Z0-9_.]*' | head -1)
  [ -n "$PKG" ] && break
  sleep 5
done
echo "$PKG" > "$EV/webapk-package.txt"
if [ -z "$PKG" ]; then
  log "FAIL: WebAPK package not installed within 120s"
  shot 03-install-failed
  adb logcat -d -t 300 > "$EV/logcat.txt" 2>/dev/null
  exit 4
fi
log "installed: $PKG"

log "stage 4: launch the installed app and open the wallet"
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >> "$EV/stages.log" 2>&1
sleep 12
shot 04-webapk-home
if ! tap_for 05-wallet-nav "دهبي"; then
  log "FAIL: wallet nav not found in installed app"
  shot 05-no-nav
  exit 5
fi
adb shell input tap $(python3 "$EV/tap.py" "$EV/05-wallet-nav.xml" "دهبي" | awk '/^tap/{print $2,$3}') 2>/dev/null
sleep 6
dump 05-wallet
shot 05-wallet
if grep -q 'قطعة تجريبية للاختبار' "$EV/05-wallet.xml"; then
  log "seeded synthetic piece visible in installed context (shared profile storage confirmed)"
else
  log "WARN: seeded piece text not in dump; will still attempt export"
fi

log "stage 5: tap export and verify the CSV download"
if ! tap_for 06-export "نزّل نسخة*"; then
  log "FAIL: export control not found"
  shot 06-no-export
  exit 6
fi
adb shell input tap $(python3 "$EV/tap.py" "$EV/06-export.xml" "نزّل نسخة*" | awk '/^tap/{print $2,$3}') 2>/dev/null
sleep 8
# possible download confirmation / duplicate-file dialog
tap_for 06-dl-dialog "Download" "تنزيل" "Replace" "استبدال" "OK" || true
sleep 5
shot 06-after-export
adb shell ls /sdcard/Download/ > "$EV/downloads-dir.txt" 2>/dev/null
CSV=$(grep -o 'dahabology-wallet-[0-9-]*\.csv' "$EV/downloads-dir.txt" | head -1)
if [ -z "$CSV" ]; then
  log "FAIL: no dahabology-wallet CSV in /sdcard/Download"
  adb logcat -d -t 300 > "$EV/logcat.txt" 2>/dev/null
  exit 7
fi
adb exec-out cat "/sdcard/Download/$CSV" > "$EV/$CSV" 2>/dev/null
log "downloaded: $CSV ($(wc -c < "$EV/$CSV") bytes)"
head -5 "$EV/$CSV" > "$EV/csv-head.txt"
grep -q 'قطعة تجريبية للاختبار' "$EV/$CSV" && log "CSV contains the seeded synthetic piece" || log "WARN: seeded note not found in CSV"
grep -q 'على الجهاز' "$EV/$CSV" && log "CSV source column marks the piece as on-device"
log "PASS: export verified from the installed context"
exit 0
