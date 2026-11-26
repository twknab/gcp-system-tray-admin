#!/bin/bash
# <xbar.title>CloudBar</xbar.title>
# <xbar.desc>Read-only Google Cloud dashboard: spend, services, status, alerts.</xbar.desc>
# <xbar.dependencies>node22,gcloud</xbar.dependencies>
# <swiftbar.hideRunInTerminal>true</swiftbar.hideRunInTerminal>
# <swiftbar.hideLastUpdated>true</swiftbar.hideLastUpdated>
# <swiftbar.hideDisablePlugin>true</swiftbar.hideDisablePlugin>
#
# SwiftBar runs plugins with a minimal PATH, so find node ourselves.

# Resolve this script's real location (the plugin folder usually holds a symlink).
SOURCE="${BASH_SOURCE[0]}"
while [ -L "$SOURCE" ]; do
  TARGET="$(readlink "$SOURCE")"
  case "$TARGET" in /*) SOURCE="$TARGET" ;; *) SOURCE="$(cd "$(dirname "$SOURCE")" && pwd)/$TARGET" ;; esac
done
DIR="$(cd "$(dirname "$SOURCE")" && pwd)"

CONFIG="${CLOUDBAR_CONFIG:-$HOME/.config/cloudbar/config.json}"
NODE=""
if [ -f "$CONFIG" ]; then
  NODE="$(sed -n 's/.*"nodePath"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$CONFIG" | head -n1)"
fi
for candidate in "$NODE" /opt/homebrew/bin/node /usr/local/bin/node; do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then NODE="$candidate"; break; fi
  NODE=""
done
if [ -z "$NODE" ]; then
  NODE="$(ls -d "$HOME"/.nvm/versions/node/v*/bin/node 2>/dev/null | sort -V | tail -n1)"
fi

if [ -z "$NODE" ] || [ ! -x "$NODE" ]; then
  echo "☁︎ ?"
  echo "---"
  echo "Node.js 22+ not found — see README | href=https://github.com/twknab/gcp-system-tray-admin#install"
  exit 0
fi
if [ ! -f "$DIR/dist/cli.js" ]; then
  echo "☁︎ ?"
  echo "---"
  echo "CloudBar is not built — run: npm ci && npm run build"
  exit 0
fi

exec "$NODE" "$DIR/dist/cli.js" "$@"
