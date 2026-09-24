#!/bin/zsh
set -eu

# Keep the callback capability in Keychain, not in this script or launchd.
callback_token=$(/usr/bin/security find-generic-password \
  -s com.hankhuang.wishlist.minimax-callback-token \
  -a Wishlist-MiniMax-Pilot -w)
if (( ${#callback_token} < 32 )); then
  print -u2 'MiniMax callback credential is unavailable'
  exit 1
fi
export WISHLIST_MINIMAX_CALLBACK_TOKEN="$callback_token"
unset callback_token
export PATH="${HOME}/.minimax/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

script_dir=${0:A:h}
cd "$script_dir"
exec /opt/homebrew/bin/node "$script_dir/poller.mjs" "$@"
