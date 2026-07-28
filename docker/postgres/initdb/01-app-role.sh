#!/bin/bash
# Runs once, as the Postgres superuser, when the data volume is first created.
#
# Creates the least-privilege role the API connects as and the two databases it
# owns: the application database, and the shadow database Prisma needs for
# `migrate dev`. Pre-creating the shadow database is what lets the role stay
# NOCREATEDB — the credentials the app runs with can never create a database.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v app_user="$GART_DB_USER" \
  -v app_password="$GART_DB_PASSWORD" \
  -v app_db="$GART_DB" \
  -v shadow_db="$GART_DB_SHADOW" <<'EOSQL'
CREATE ROLE :"app_user" WITH LOGIN PASSWORD :'app_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE;

CREATE DATABASE :"app_db" OWNER :"app_user";
CREATE DATABASE :"shadow_db" OWNER :"app_user";
EOSQL

# citext backs the case-insensitive unique index on User.email. Installing it here
# keeps both databases identical and means the app role never needs the privilege.
for database in "$GART_DB" "$GART_DB_SHADOW"; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$database" \
    -c 'CREATE EXTENSION IF NOT EXISTS citext;'
done
