#!/usr/bin/env bash
# Notarizes a Developer ID-signed Tatolab.app or .dmg with an App Store Connect API key, staples
# the ticket, and asks Gatekeeper to accept the result.
#
# Usage: notarize-and-staple.sh <Tatolab.app|file.dmg>
#   APPLE_API_KEY_PATH  path to the AuthKey_<id>.p8 file
#   APPLE_API_KEY_ID    the key's id
#   APPLE_API_ISSUER    the key's issuer id
set -euo pipefail

usage() { awk '/^# Usage:/{p=1} p&&/^#/{sub(/^# ?/,""); print; next} p{exit}' "$0" >&2; exit 2; }
[ $# -eq 1 ] || usage
notarization_target="${1%/}"
[ -e "$notarization_target" ] || { echo "no such file: $notarization_target" >&2; exit 1; }
for required_variable in APPLE_API_KEY_PATH APPLE_API_KEY_ID APPLE_API_ISSUER; do
  [ -n "${!required_variable:-}" ] || { echo "$required_variable is not set" >&2; exit 1; }
done
[ -f "$APPLE_API_KEY_PATH" ] || { echo "APPLE_API_KEY_PATH names no file: $APPLE_API_KEY_PATH" >&2; exit 1; }

submission_scratch_directory="$(mktemp -d)"
trap 'rm -rf "$submission_scratch_directory"' EXIT

case "$notarization_target" in
  *.app)
    submission="$submission_scratch_directory/$(basename "$notarization_target" .app).zip"
    ditto -c -k --sequesterRsrc --keepParent "$notarization_target" "$submission"
    gatekeeper_assessment=(spctl --assess --type execute -vv "$notarization_target")
    ;;
  *.dmg)
    submission="$notarization_target"
    gatekeeper_assessment=(spctl --assess --type open --context context:primary-signature -vv "$notarization_target")
    ;;
  *) echo "expected a .app or a .dmg: $notarization_target" >&2; exit 1 ;;
esac

xcrun notarytool submit "$submission" \
  --key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY_ID" --issuer "$APPLE_API_ISSUER" \
  --wait --timeout 45m --output-format json > "$submission_scratch_directory/submission.json"
cat "$submission_scratch_directory/submission.json"
notarization_status="$(plutil -extract status raw -o - "$submission_scratch_directory/submission.json")"
if [ "$notarization_status" != "Accepted" ]; then
  submission_id="$(plutil -extract id raw -o - "$submission_scratch_directory/submission.json")"
  xcrun notarytool log "$submission_id" \
    --key "$APPLE_API_KEY_PATH" --key-id "$APPLE_API_KEY_ID" --issuer "$APPLE_API_ISSUER" >&2 || true
  echo "notarization of $notarization_target ended $notarization_status" >&2
  exit 1
fi

xcrun stapler staple "$notarization_target"
xcrun stapler validate "$notarization_target"
"${gatekeeper_assessment[@]}"
echo "notarized and stapled $notarization_target"
