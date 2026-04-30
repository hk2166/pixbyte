#!/usr/bin/env bash

# run.sh — Starter script for 0x1306 ESP32 Converter
# Ensures unique ports and injects Homebrew paths for FFmpeg

echo "// killing any existing ghost processes on our custom ports..."
kill -9 $(lsof -t -i:8888) 2>/dev/null
kill -9 $(lsof -t -i:5888) 2>/dev/null

# 1. Provide exact paths for FFmpeg so python's subprocess doesn't fail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

echo "// starting backend [port 8888]..."
cd backend
python3 -m venv venv
source venv/bin/activate
# Install deps just in case
pip install -r requirements.txt > /dev/null 2>&1
# Run API in the background
uvicorn main:app --host 0.0.0.0 --port 8888 > backend.log 2>&1 &
BACKEND_PID=$!
cd ..

echo "// starting frontend [port 5888]..."
cd frontend
export VITE_API_URL="http://localhost:8888"
# Start Vite in the background
npm run dev -- --port 5888 > frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

echo ""
echo "============================================"
echo " SYSTEM IS LIVE & DEPLOYED! "
echo "============================================"
echo " ▶ Frontend UI:  http://localhost:5888"
echo " ▶ Backend API:  http://localhost:8888"
echo "============================================"
echo "// waiting for interrupts (CTRL+C to stop servers)"

# Trap SIGINT to clean up child processes on exit
trap "echo '// stopping servers...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" SIGINT SIGTERM

# Keep the script running
wait
