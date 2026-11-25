#!/usr/bin/env bash
# One-time manual calibration: install the candidate PWA as a WebAPK on an Android
# emulator and verify the wallet CSV export from the installed context.
# $1 = public HTTPS base URL of the served candidate (cloudflared quick tunnel).
# Synthetic data only: one device-wallet piece seeded via a harness page on the same
# origin. No accounts, no secrets. All stage evidence lands in ./evidence.
#
# Hardened after run-3 diagnosis (D1-D6):
#  - stage taps are actually executed and their effect is verified by re-dump
#  - empty/failed UI dumps are a distinct environment error, never a NO-MATCH
#  - every adb call is time-bounded; a watchdog caps total runtime so the job
#    ends with time left for best-effort evidence collection
#  - shot/dump failures are logged, never silent
set -u
BASE="${1%/}"
EV=evidence
mkdir -p "$EV"
ADB_TIMEOUT=${ADB_TIMEOUT:-30}        # seconds, per adb invocation
DUMP_RETRIES=${DUMP_RETRIES:-3}       # attempts before declaring the UI dump unavailable
DEADLINE_SECONDS=${DEADLINE_SECONDS:-1200}  # 20 min in-script cap; workflow timeout must exceed this

log() { echo "[t+$(date +%s)] $*" | tee -a "$EV/stages.log"; }

# Continuous logcat from the start so a wedge is captured whatever happens later.
adb logcat -c >/dev/null 2>&1 || true
adb logcat > "$EV/logcat-full.txt" 2>/dev/null &
LOGCAT_PID=$!

# Watchdog: kill the script if it overruns, leaving the job time for evidence upload.
( sleep "$DEADLINE_SECONDS"; echo "[watchdog] deadline hit, killing harness" >> "$EV/stages.log"; kill -9 $$ 2>/dev/null ) &
WATCHDOG_PID=$!
trap 'kill $LOGCAT_PID $WATCHDOG_PID 2>/dev/null' EXIT

# fail <code> <message>: bounded best-effort evidence, then exit.
fail() {
  local code="$1"; shift
  log "FAIL($code): $*"
  shot "fail-$code" || true
  exit "$code"
}

# Time-bounded adb: adb_run <description> <adb args...>; returns adb's exit code.
adb_run() {
  local desc="$1"; shift
  timeout "$ADB_TIMEOUT" adb "$@"
  local rc=$?
  if [ "$rc" -eq 124 ]; then log "ERROR: adb timed out after ${ADB_TIMEOUT}s ($desc)"; fi
  return $rc
}

shot() { # name -> 0 on non-empty screenshot, 1 otherwise (always logged)
  if adb_run "screencap $1" exec-out screencap -p > "$EV/$1.png" 2>/dev/null && [ -s "$EV/$1.png" ]; then
    log "screenshot $1"; return 0
  fi
  log "WARN: screenshot $1 failed or empty"; rm -f "$EV/$1.png"; return 1
}

dump() { # name -> 0 on a non-empty hierarchy dump, 1 otherwise (always logged)
  adb_run "uiautomator dump $1" shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
  adb_run "read dump $1" exec-out cat /sdcard/ui.xml > "$EV/$1.xml" 2>/dev/null
  if [ -s "$EV/$1.xml" ] && grep -q '<hierarchy' "$EV/$1.xml"; then return 0; fi
  log "WARN: UI dump $1 empty or invalid"; rm -f "$EV/$1.xml"; return 1
}

# dump_retry <name>: dump with retries; dies with a DISTINCT environment error,
# so a broken dump can never be read as "element not found".
dump_retry() {
  local name="$1" i
  for i in $(seq 1 "$DUMP_RETRIES"); do
    dump "$name" && return 0
    sleep 5
  done
  fail 10 "UI dump unavailable after ${DUMP_RETRIES} attempts ($name) - environment error"
}

cat > "$EV/tap.py" <<'PY'
import re, sys
xml_path = sys.argv[1]
pats = sys.argv[2:]
xml = open(xml_path, encoding='utf-8', errors='ignore').read()
if '<hierarchy' not in xml:
    print("EMPTY-DUMP"); sys.exit(2)
nodes = re.findall(r'<node[^>]*>', xml)
def attrs(tag):
    return dict(re.findall(r'([\w:-]+)="([^"]*)"', tag))
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

# tap_node <name> <candidates...>: fresh dump, find, ACTUALLY tap. Returns 1 on no match.
tap_node() {
  local name="$1"; shift
  dump_retry "$name"
  local out xy
  out=$(python3 "$EV/tap.py" "$EV/$name.xml" "$@")
  case "$out" in
    tap*)
      xy=$(echo "$out" | awk '{print $2, $3}')
      adb_run "tap $xy" shell input tap $xy || return 1
      log "executed $out"
      return 0;;
    *) log "$out"; return 1;;
  esac
}

# tap_until_gone <name> <candidates...>: dump, tap the match FROM THAT SAME DUMP,
# then re-dump to prove dismissal (bounded). Never re-dumps between find and tap.
tap_until_gone() {
  local name="$1"; shift; local i out xy
  for i in 1 2 3; do
    dump_retry "$name"
    out=$(python3 "$EV/tap.py" "$EV/$name.xml" "$@")
    case "$out" in
      tap*)
        xy=$(echo "$out" | awk '{print $2, $3}')
        adb_run "dismiss tap $xy" shell input tap $xy || true
        log "executed $out"
        sleep 3;;
      NO-MATCH|EMPTY-DUMP)
        log "dismissed: no candidate remains ($name)"; return 0;;
    esac
  done
  dump_retry "$name"
  out=$(python3 "$EV/tap.py" "$EV/$name.xml" "$@")
  case "$out" in
    NO-MATCH|EMPTY-DUMP) log "dismissed: no candidate remains ($name, final check)"; return 0;;
    *) return 1;;
  esac
}

log "stage 0: device + chrome first-run suppression"
adb_run "wait-for-device" wait-for-device || fail 11 "device never appeared"
adb_run "unlock" shell input keyevent 82 >/dev/null 2>&1 || true
adb_run "chrome flags" shell 'echo "chrome --no-first-run --disable-fre" > /data/local/tmp/chrome-command-line && chmod 644 /data/local/tmp/chrome-command-line' 2>/dev/null || true
adb_run "force-stop chrome" shell am force-stop com.android.chrome || true
sleep 2

log "stage 1: seed synthetic device wallet via same-origin harness page"
adb_run "open seed page" shell am start -a android.intent.action.VIEW -d "$BASE/__seed.html" com.android.chrome >> "$EV/stages.log" 2>&1 || fail 12 "could not launch seed page"
sleep 12
# first-run dialogs, if the command-line flag did not suppress them: ACTUALLY tap,
# then prove the dialog is gone before continuing (run-3 defect D1).
if ! tap_until_gone 01-fre "Use without an account" "Accept & continue" "Get started" "No thanks"; then
  fail 8 "Chrome first-run modal not dismissed after 3 attempts"
fi
dump_retry 01-seed
shot 01-seed || true
if grep -q 'SEEDED' "$EV/01-seed.xml"; then
  log "seed page confirmed"
else
  fail 9 "seed page text not found in a valid dump - seed unconfirmed"
fi

log "stage 2: open candidate home in chrome (service worker registers)"
adb_run "open candidate" shell am start -a android.intent.action.VIEW -d "$BASE/" com.android.chrome >> "$EV/stages.log" 2>&1 || fail 13 "could not open candidate"
sleep 18
shot 02-home || true

log "stage 3: open chrome menu and install the app"
if tap_node 03-menu "More options"; then
  sleep 3
  shot 03-menu-open || true
else
  fail 14 "Chrome menu button not found in a valid dump"
fi
if ! tap_node 03-install-item "Install app" "Add to Home screen" "Add to home screen"; then
  fail 3 "no install menu item found in a valid dump"
fi
sleep 4
shot 03-install-dialog || true
tap_node 03-confirm "Install" "Add" || log "WARN: no confirm dialog matched; continuing to package check"

log "waiting for webapk package to appear"
PKG=""
for i in $(seq 1 "${WEBAPK_WAIT_LOOPS:-24}"); do
  PKG=$(adb_run "pm list packages" shell pm list packages 2>/dev/null | grep -o 'org\.chromium\.webapk[a-zA-Z0-9_.]*' | head -1)
  [ -n "$PKG" ] && break
  sleep 5
done
echo "$PKG" > "$EV/webapk-package.txt"
if [ -z "$PKG" ]; then
  fail 4 "WebAPK package not installed within $(( ${WEBAPK_WAIT_LOOPS:-24} * 5 ))s"
fi
log "installed: $PKG"

log "stage 4: launch the installed app and open the wallet"
adb_run "launch webapk" shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >> "$EV/stages.log" 2>&1 || fail 15 "could not launch WebAPK"
sleep 12
shot 04-webapk-home || true
if ! tap_node 05-wallet-nav "دهبي"; then
  fail 5 "wallet nav not found in installed app (valid dump)"
fi
sleep 6
dump_retry 05-wallet
shot 05-wallet || true
if grep -q 'قطعة تجريبية للاختبار' "$EV/05-wallet.xml"; then
  log "seeded synthetic piece visible in installed context (shared profile storage confirmed)"
else
  fail 16 "seeded piece text not in installed-app dump - shared storage unconfirmed"
fi

log "stage 5: tap export and verify the CSV download"
if ! tap_node 06-export "نزّل نسخة*"; then
  fail 6 "export control not found in a valid dump"
fi
sleep 8
# possible download confirmation / duplicate-file dialog
tap_node 06-dl-dialog "Download" "تنزيل" "Replace" "استبدال" "OK" || true
sleep 5
shot 06-after-export || true
adb_run "list downloads" shell ls /sdcard/Download/ > "$EV/downloads-dir.txt" 2>/dev/null || true
CSV=$(grep -o 'dahabology-wallet-[0-9-]*\.csv' "$EV/downloads-dir.txt" 2>/dev/null | head -1)
if [ -z "$CSV" ]; then
  fail 7 "no dahabology-wallet CSV in /sdcard/Download"
fi
adb_run "pull csv" exec-out cat "/sdcard/Download/$CSV" > "$EV/$CSV" 2>/dev/null || fail 17 "CSV pull failed"
[ -s "$EV/$CSV" ] || fail 17 "CSV empty after pull"
log "downloaded: $CSV ($(wc -c < "$EV/$CSV") bytes)"
head -5 "$EV/$CSV" > "$EV/csv-head.txt"
grep -q 'قطعة تجريبية للاختبار' "$EV/$CSV" && log "CSV contains the seeded synthetic piece" || log "WARN: seeded note not found in CSV"
grep -q 'على الجهاز' "$EV/$CSV" && log "CSV source column marks the piece as on-device"
log "PASS: export verified from the installed context"
exit 0
