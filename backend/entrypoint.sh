#!/bin/sh
set -e

echo "⏳ Waiting for Postgres to be ready..."
until nc -z postgres 5432; do
  sleep 1
done

echo "✅ Postgres is up. Running migrations..."
python3 -m alembic upgrade head

echo "Seeding admin user..."
python3 init_db.py

echo "Starting Uvicorn..."
exec uvicorn main:app --host 0.0.0.0 --port 8000 --reload