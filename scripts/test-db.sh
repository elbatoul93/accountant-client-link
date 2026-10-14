#!/usr/bin/env bash
# Applies every migration from scratch on a throwaway PostgreSQL database and runs
# supabase/tests/*.test.sql against it.
#
#   DATABASE_URL=postgres://user:pass@host:5432/postgres scripts/test-db.sh   # existing server (CI)
#   scripts/test-db.sh                                                        # starts a temporary local server
set -euo pipefail
cd "$(dirname "$0")/.."

started=""
if [ -z "${DATABASE_URL:-}" ]; then
  PGBIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)
  [ -n "$PGBIN" ] || { echo "No PostgreSQL server found; set DATABASE_URL"; exit 1; }
  dir=$(mktemp -d); chmod 755 "$dir"
  runner=(); [ "$(id -u)" = 0 ] && { chown postgres "$dir"; runner=(su postgres -c); }
  run() { if [ ${#runner[@]} -gt 0 ]; then su postgres -c "$*"; else bash -c "$*"; fi; }
  run "$PGBIN/initdb -D $dir/data -A trust >/dev/null"
  run "$PGBIN/pg_ctl -D $dir/data -o '-p 54329 -k $dir -c listen_addresses=' -l $dir/log -w start >/dev/null"
  trap 'run "$PGBIN/pg_ctl -D $dir/data -m immediate stop >/dev/null" || true; rm -rf "$dir"' EXIT
  export PGHOST="$dir" PGPORT=54329 PGUSER=postgres
  DATABASE_URL="postgresql:///postgres?host=$dir&port=54329&user=postgres"
fi

export PGOPTIONS="-c client_min_messages=warning"
psql_() { psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q "$@"; }
psql_ -c "DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS auth CASCADE; DROP SCHEMA IF EXISTS storage CASCADE; CREATE SCHEMA public; GRANT USAGE ON SCHEMA public TO PUBLIC;" >/dev/null
psql_ -f supabase/tests/bootstrap.sql >/dev/null

echo "Applying migrations..."
for f in supabase/migrations/*.sql; do
  echo "  $(basename "$f")"
  psql_ -f "$f" >/dev/null
done

fail=0
for t in supabase/tests/*.test.sql; do
  [ -e "$t" ] || continue
  if out=$(psql_ -f "$t" 2>&1); then echo "PASS $(basename "$t")"; else echo "FAIL $(basename "$t")"; echo "$out"; fail=1; fi
done
exit $fail
