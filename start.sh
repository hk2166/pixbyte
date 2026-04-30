#!/usr/bin/env bash
# Production startup script

set -e

echo "🚀 Starting ESP32 OLED Video Converter..."

# Check for DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
    echo "⚠️  WARNING: DATABASE_URL not set - analytics will be disabled"
fi

# Get port from environment or default to 8888
PORT=${PORT:-8888}

echo "📡 Starting server on port $PORT..."

# Start uvicorn with production settings
cd backend
exec uvicorn main:app \
    --host 0.0.0.0 \
    --port "$PORT" \
    --workers 4 \
    --log-level info \
    --access-log \
    --no-use-colors
