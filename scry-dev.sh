#!/bin/sh
# Builds and starts Scry's -dev containers, which copy in this folder's code each time they start, and opens Scry in the
# browser. It can start Nexus's beside them, linked.
# Run it with: sh scry-dev.sh
set -eu
cd "$(dirname "$0")"
export COMPOSE_IGNORE_ORPHANS=1

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed. On macOS, install Docker Desktop. On Linux, sh scry.sh installs Docker Engine."
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running. Start Docker, then run this again."
  exit 1
fi

# Clones a checkout the build needs, when it is missing.
fetch() {
  [ -d "$2" ] && return 0
  if ! command -v git >/dev/null 2>&1; then
    echo "$1 is missing at $2, and Git is not installed to fetch it. Install Git, or put $1 there, then run this again."
    exit 1
  fi
  echo "Fetching $1 into $2."
  git clone "$3" "$2"
}

# A -dev database's password, made the first time and kept in .env.dev beside that product's compose.dev.yaml,
# apart from the release containers' .env.
password() {
  [ -f "$1/.env.dev" ] && return 0
  printf '%s=%s\n' "$2" "$(head -c 24 /dev/urandom | base64 | tr -d '+/=\n')" > "$1/.env.dev.tmp"
  mv "$1/.env.dev.tmp" "$1/.env.dev"
}

# Asks this computer to trust the authority Caddy made for this product's addresses, the first time it meets it.
trust() {
  cert="$(mktemp)"
  if ! compose cp "$1:/data/caddy/pki/authorities/local/root.crt" "$cert" >/dev/null 2>&1; then
    echo "Could not read $2's certificate authority, so the browser warns about its addresses."
    rm -f "$cert"
    return 0
  fi
  case "$(uname -s)" in
    Darwin)
      sha="$(openssl x509 -noout -fingerprint -sha1 -in "$cert" | cut -d= -f2 | tr -d :)"
      if ! security find-certificate -a -Z | grep -q "$sha"; then
        echo "macOS asks for your password to trust $2 in Docker, so the browser trusts its addresses."
        security add-trusted-cert -r trustRoot -k "$HOME/Library/Keychains/login.keychain-db" "$cert" ||
          echo "$2's certificate authority is not trusted, so the browser warns about its addresses."
      fi
      ;;
    Linux)
      target=
      if command -v update-ca-certificates >/dev/null 2>&1; then
        target="/usr/local/share/ca-certificates/pluperfect-$1.crt"
        update=update-ca-certificates
      elif command -v update-ca-trust >/dev/null 2>&1; then
        target="/etc/pki/ca-trust/source/anchors/pluperfect-$1.crt"
        update=update-ca-trust
      fi
      if [ -n "$target" ] && ! cmp -s "$cert" "$target"; then
        echo "sudo asks for your password to trust $2 in Docker, so this computer trusts its addresses."
        { sudo install -m 644 "$cert" "$target" && sudo "$update"; } ||
          echo "$2's certificate authority is not trusted, so the browser warns about its addresses."
      fi
      # Chrome on Linux reads its own store rather than the system's.
      if command -v certutil >/dev/null 2>&1 && [ -d "$HOME/.pki/nssdb" ]; then
        certutil -d "sql:$HOME/.pki/nssdb" -A -t "C,," -n "Pluperfect $1" -i "$cert" || true
      fi
      ;;
  esac
  rm -f "$cert"
}

# Shows the installer's address, with its install code, while the product is not set up yet.
install_code() {
  if compose logs --no-log-prefix "$1" | grep "is not set up yet"; then
    echo "Open the address above to set $2 up, and enter that install code."
  fi
}

open_page() {
  if command -v open >/dev/null 2>&1; then open "$1"; elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$1"; fi
}


fetch Nexus ../Nexus https://github.com/PluperfectData/Nexus.git
fetch Pluperfect.Jwt ../../Pluperfect.Jwt https://github.com/mnwachukwu/Pluperfect.Jwt.git
fetch Pluperfect.Mail ../../Pluperfect.Mail https://github.com/mnwachukwu/Pluperfect.Mail.git

both=
printf 'Start Nexus'"'"'s -dev containers too, linked to Scry? [y/N] '
read -r answer
case "$answer" in [Yy]*) both=1 ;; esac
compose() {
  if [ -n "$both" ]; then docker compose -f compose.dev.both.yaml "$@"; else docker compose -f compose.dev.yaml --env-file .env.dev "$@"; fi
}

password . SCRY_DEV_DB_PASSWORD
[ -n "$both" ] && password ../Nexus NEXUS_DEV_DB_PASSWORD

echo "Building and starting the -dev containers. The first build takes several minutes."
if ! compose up --build --detach --wait --wait-timeout 600; then
  # A container whose start failed on a taken port later starts with no network, so none is kept.
  compose rm --force --volumes >/dev/null 2>&1 || true
  echo
  echo "They did not start. The lines above say why. They take the ports development uses, so stop any copy"
  echo "running from the code, or in Docker, first."
  exit 1
fi

trust scry-caddy-dev Scry
[ -n "$both" ] && trust nexus-caddy-dev Nexus
install_code scry-api-dev Scry
[ -n "$both" ] && install_code nexus-api-dev Nexus
open_page https://localhost:6160
[ -n "$both" ] && open_page https://localhost:6165
echo
echo "Scry is at https://localhost:6160, and its API at https://localhost:6161. Its Mailpit is at"
echo "http://localhost:6162, and its MySQL answers on 127.0.0.1:6166 for MySQL Workbench, as scry, with the password"
echo "in Scry's .env.dev."
if [ -n "$both" ]; then
  echo "Nexus is at https://localhost:6165, and its service at https://localhost:6163. Its Mailpit is at"
  echo "http://localhost:6168, and its MySQL answers on 127.0.0.1:6167 for MySQL Workbench, as nexus, with the"
  echo "password in Nexus's .env.dev."
fi
if [ -n "$both" ]; then
  stop="docker compose -f compose.dev.both.yaml stop"
else
  stop="docker compose -f compose.dev.yaml --env-file .env.dev stop"
fi
echo "To see saved changes, restart a container, with docker restart or Docker Desktop. After changing a project or"
echo "package file, or compose.dev.yaml, run this again. This stops the -dev containers:"
echo "  $stop"
