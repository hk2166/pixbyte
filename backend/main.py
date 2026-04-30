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

@app.get("/api/displays")
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
    
    # Catch-all route for SPA - must be last
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        """Serve the frontend SPA for all non-API routes."""
        # If it's an API route, let it 404 naturally
        if full_path.startswith("api/"):
            raise HTTPException(404, "Not found")
        
        # Try to serve the specific file if it exists
        file_path = FRONTEND_DIR / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        
        # Otherwise serve index.html for SPA routing
        index_path = FRONTEND_DIR / "index.html"
        if index_path.exists():
            return FileResponse(index_path)
        
        raise HTTPException(404, "Frontend not found")
