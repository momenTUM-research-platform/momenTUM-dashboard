#!/bin/sh
set -e

echo "Running database migrations..."
python3 -m alembic upgrade head

echo "Seeding admin user..."
python3 init_db.py

echo "Starting Uvicorn..."
exec uvicorn main:app --host 0.0.0.0 --port 8000 --reload
