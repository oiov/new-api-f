#!/bin/sh
set -eu

if [ -z "${BACKEND_ORIGIN:-}" ]; then
  echo "BACKEND_ORIGIN is required"
  exit 1
fi

envsubst '${BACKEND_ORIGIN}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf
