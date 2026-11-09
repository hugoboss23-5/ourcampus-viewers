#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
umask 077

# Only install on the paired Intel Mac, as its logged-in user.
[[ "$(id -un)" == haroldshworts && "$(uname -m)" == x86_64 ]] || {
  echo "This installer is for Harold’s paired Mac." >&2; exit 1;
}
domain="gui/$(id -u)"
launchctl print "$domain" >/dev/null
/usr/bin/shasum -c site.sha256 >/dev/null
root="$HOME/Library/Application Support/OurCampus Public Viewers"
label=io.hugo.ourcampus-viewers
plist="$HOME/Library/LaunchAgents/$label.plist"
[[ ! -e "$root" && ! -e "$plist" ]] || { echo "Existing install: stop and preserve it first." >&2; exit 1; }
mkdir -p "$HOME/Library/LaunchAgents" "$root"
cp -R site "$root/site"
sed -e "s|@RUN@|$root|g" -e "s|@SITE@|$root/site|g" -e 's|@PORT@|18194|g' httpd.conf.in > "$root/httpd.conf"
/usr/sbin/httpd -t -f "$root/httpd.conf"
staged="$root/launch.plist"
plutil -create xml1 "$staged"
plutil -insert Label -string "$label" "$staged"
plutil -insert ProgramArguments -json '["/usr/sbin/httpd","-DFOREGROUND","-f"]' "$staged"
plutil -insert ProgramArguments.3 -string "$root/httpd.conf" "$staged"
plutil -insert RunAtLoad -bool YES "$staged"
plutil -insert KeepAlive -bool YES "$staged"
plutil -insert ThrottleInterval -integer 10 "$staged"
plutil -lint "$staged"
cp "$staged" "$plist"
launchctl bootstrap "$domain" "$plist"
for attempt in {1..20}; do
  if curl --fail --silent --max-time 2 http://127.0.0.1:18194/worldwide-stages-david/ >/dev/null &&
     curl --fail --silent --max-time 2 http://127.0.0.1:18194/bendac/ >/dev/null; then
    echo "Both sites respond on Harold’s loopback port 18194."; exit 0
  fi
  sleep 1
done
echo "The launch job did not serve both pages; see $root/httpd-error.log." >&2
exit 1
