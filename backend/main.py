"""
main.py — Minimal FastAPI backend serving only display configurations
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from processor.video import DISPLAY_CONFIGS

app = FastAPI(title="ESP32 OLED Display Configs", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ══════════════════════════════════════════════════════════════════════════════
# API Endpoint
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/")
async def get_displays():
    """Return available display configurations."""
    return {"displays": [
        {"key": k, **v} for k, v in DISPLAY_CONFIGS.items()
    ]}


# ── Static File Serving ───────────────────────────────────────────────────────

# Mount static files for frontend
FRONTEND_DIR = Path(__file__).parent.parent / "frontend" / "dist"

if FRONTEND_DIR.exists():
    # Serve static assets (JS, CSS, images, etc.)
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="assets")
