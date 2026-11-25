#!/bin/sh
# Hỏi mã thiết lập (không hiện lên màn hình) rồi nạp worker/export/ vào Worker.
#   sh tools/import.sh https://qkp-design-api.<tên>.workers.dev
set -eu
printf 'Mã thiết lập (SETUP_TOKEN): '
stty -echo; read -r SETUP_TOKEN; stty echo; echo
export SETUP_TOKEN
exec node "$(dirname "$0")/import.mjs" "${1:?Thiếu địa chỉ Worker}"
