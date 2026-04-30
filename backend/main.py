"""
main.py — FastAPI backend for ESP32 OLED Video Converter
"""
import asyncio
import io
import os
import uuid
import base64
import json
import tempfile
import shutil
from pathlib import Path
from typing import Optional

import aiofiles
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, BackgroundTasks, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse, Response, FileResponse
from fastapi.staticfiles import StaticFiles
from sse_starlette.sse import EventSourceResponse
from PIL import Image
from pydantic import BaseModel

from processor.video import extract_frames, DISPLAY_CONFIGS, get_video_info
from processor.dither import apply_dithering
from processor.encoder import deduplicate_frames, encode_oled_binary, get_binary_stats
from database import init_db, close_db, track_visitor

app = FastAPI(title="ESP32 OLED Video Converter", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Startup/Shutdown Events ───────────────────────────────────────────────────

@app.on_event("startup")
async def startup_event():
    """Initialize database connection on startup."""
    await init_db()


@app.on_event("shutdown")
async def shutdown_event():
    """Close database connection on shutdown."""
    await close_db()


# ── In-memory job store ────────────────────────────────────────────────────────
jobs: dict[str, dict] = {}
UPLOAD_DIR = Path(tempfile.gettempdir()) / "oled_uploads"
OUTPUT_DIR = Path(tempfile.gettempdir()) / "oled_outputs"
UPLOAD_DIR.mkdir(exist_ok=True)
OUTPUT_DIR.mkdir(exist_ok=True)


# ── Helper Functions ──────────────────────────────────────────────────────────

def get_client_ip(request: Request) -> str:
    """Extract client IP address from request."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ══════════════════════════════════════════════════════════════════════════════
# Core API Endpoints
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/")
async def root(request: Request):
    """Root endpoint - tracks visitors and returns API info."""
    # Track visitor
    ip = get_client_ip(request)
    await track_visitor(ip)
    
    return {
        "name": "ESP32 OLED Video Converter API",
        "version": "1.0.0",
        "status": "healthy",
        "endpoints": {
            "displays": "/api/displays",
            "upload": "/api/upload",
            "process": "/api/process"
        }
    }


@app.get("/api/displays")


def _clean_stale_users() -> None:
    """Remove IPs that haven't sent a heartbeat within the timeout window."""
    now = _time.time()
    stale = [ip for ip, ts in _active_users.items() if now - ts > _ACTIVE_TIMEOUT]
    for ip in stale:
        del _active_users[ip]


# ── Helpers ───────────────────────────────────────────────────────────────────


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/api/displays")
async def get_displays():
    """Return available display configurations."""
    return {"displays": [
        {"key": k, **v} for k, v in DISPLAY_CONFIGS.items()
    ]}

@app.post("/api/heartbeat")
async def heartbeat(request: Request):
    """Record a heartbeat from the client's IP to track active users."""
    ip = request.client.host if request.client else "unknown"
    # Also check X-Forwarded-For for proxied connections (Netlify, etc.)
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        ip = forwarded.split(",")[0].strip()
    _active_users[ip] = _time.time()
    _clean_stale_users()
    return {"active": len(_active_users)}


@app.get("/api/active-users")
async def active_users():
    """Return the number of currently active users (heartbeated within the last 60s)."""
    _clean_stale_users()
    return {"active": len(_active_users)}

@app.post("/api/upload")
async def upload_video(file: UploadFile = File(...)):
    """Accept video upload, return job_id."""
    if not file.filename:
        raise HTTPException(400, "No file provided")

    allowed = {".mp4", ".avi", ".mov", ".mkv", ".webm", ".gif"}
    ext = Path(file.filename).suffix.lower()
    if ext not in allowed:
        raise HTTPException(400, f"Unsupported format: {ext}")

    job_id = str(uuid.uuid4())[:8]
    dest = UPLOAD_DIR / f"{job_id}{ext}"

    try:
        async with aiofiles.open(dest, "wb") as f:
            while chunk := await file.read(UPLOAD_CHUNK_SIZE):
                await f.write(chunk)
    except Exception:
        dest.unlink(missing_ok=True)
        raise
    finally:
        await file.close()

    if dest.stat().st_size == 0:
        dest.unlink(missing_ok=True)
        raise HTTPException(400, "Uploaded file is empty")

    try:
        info = get_video_info(str(dest))
    except Exception:
        info = {}

    jobs[job_id] = {
        "status": "uploaded",
        "video_path": str(dest),
        "progress": 0,
        "message": "// file received",
        "info": info,
    }

    return {"job_id": job_id, "filename": file.filename, "info": info}


@app.post("/api/process")
async def process_video(
    background_tasks: BackgroundTasks,
    job_id: str = Form(...),
    display_key: str = Form(...),
    target_fps: Optional[int] = Form(None),
    use_dither: bool = Form(True),
    dedup_threshold: float = Form(0.02),
):
    """Trigger video processing pipeline. Returns immediately; use /api/status for SSE."""
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")
    if display_key not in DISPLAY_CONFIGS:
        raise HTTPException(400, f"Unknown display: {display_key}")
    if target_fps is not None and target_fps < 1:
        raise HTTPException(400, "Target FPS must be at least 1")
    if not 0 <= dedup_threshold <= 1:
        raise HTTPException(400, "Dedup threshold must be between 0 and 1")

    jobs[job_id]["status"] = "queued"
    jobs[job_id]["display_key"] = display_key
    jobs[job_id]["use_dither"] = use_dither
    jobs[job_id]["dedup_threshold"] = dedup_threshold
    jobs[job_id]["target_fps"] = target_fps

    background_tasks.add_task(_run_pipeline, job_id)
    return {"job_id": job_id, "status": "queued"}


async def _run_pipeline(job_id: str):
    """Background processing pipeline."""
    job = jobs[job_id]
    display_key = job["display_key"]
    config = DISPLAY_CONFIGS[display_key]

    def update(pct: int, msg: str):
        job["progress"] = pct
        job["message"] = msg

    try:
        job["status"] = "processing"
        update(5, "// extracting frames_")

        loop = asyncio.get_running_loop()

        def extract():
            return extract_frames(
                job["video_path"],
                display_key,
                target_fps=job.get("target_fps"),
            )

        frames, fps = await loop.run_in_executor(None, extract)
        if not frames:
            raise RuntimeError("No frames could be extracted from the uploaded video")
        update(40, f"// {len(frames)} frames extracted @ {fps}fps")

        def process():
            f = apply_dithering(frames, use_dither=job.get("use_dither", True))
            update(65, "// dithering complete_")
            f, new_fps = deduplicate_frames(f, threshold=job.get("dedup_threshold", 0.02), original_fps=fps)
            update(75, f"// {len(f)} frames after dedup (effective fps: {new_fps})")
            return f, new_fps

        processed, fps = await loop.run_in_executor(None, process)

        def encode():
            return encode_oled_binary(
                processed,
                config["width"],
                config["height"],
                fps,
                config["driver_id"],
            )

        update(80, "// bit-packing frames_")
        binary = await loop.run_in_executor(None, encode)
        update(90, "// generating output_")

        out_path = OUTPUT_DIR / f"{job_id}.oled"
        async with aiofiles.open(out_path, "wb") as f:
            await f.write(binary)

        stats = get_binary_stats(binary, config["width"], config["height"])

        def generate_previews():
            # Generate previews as base64-encoded raw page bytes
            preview_frames = processed[::max(1, len(processed)//30)]
            return [base64.b64encode(encode_oled_binary([f], config["width"], config["height"], fps, config["driver_id"])[16:]).decode() for f in preview_frames[:30]]
        
        previews = await loop.run_in_executor(None, generate_previews)

        job.update({
            "status": "done",
            "progress": 100,
            "message": "// processing complete_",
            "output_path": str(out_path),
            "stats": stats,
            "config": config,
            "previews": previews,
            "frame_count": len(processed),
            "fps": fps,
        })

    except Exception as e:
        job["status"] = "error"
        job["message"] = f"// error: {str(e)}"
        job["progress"] = 0


@app.get("/api/status/{job_id}")
async def job_status_sse(job_id: str):
    """SSE endpoint streaming job progress."""
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")

    async def event_gen():
        while True:
            job = jobs.get(job_id, {})
            data = {
                "progress": job.get("progress", 0),
                "status": job.get("status", "unknown"),
                "message": job.get("message", ""),
            }
            if job.get("status") == "done":
                data["stats"] = job.get("stats")
                data["previews"] = job.get("previews", [])
                data["frame_count"] = job.get("frame_count", 0)
                data["fps"] = job.get("fps", 0)
                data["config"] = job.get("config", {})
            yield {"data": json.dumps(data)}
            if job.get("status") in ("done", "error"):
                break
            await asyncio.sleep(0.4)

    return EventSourceResponse(event_gen())


@app.get("/api/download/{job_id}")
async def download_binary(job_id: str):
    """Download the processed .oled binary file."""
    job = jobs.get(job_id)
    if not job or job.get("status") != "done":
        raise HTTPException(404, "Job not ready")

    out_path = job["output_path"]
    async with aiofiles.open(out_path, "rb") as f:
        data = await f.read()

    return Response(
        content=data,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="display_{job_id}.oled"'},
    )


@app.get("/api/download/{job_id}/ino")
async def download_ino(job_id: str):
    """Generate and download a complete .ino file with embedded frames."""
    job = jobs.get(job_id)
    if not job or job.get("status") != "done":
        raise HTTPException(404, "Job not ready")

    config = job["config"]
    out_path = job["output_path"]
    
    async with aiofiles.open(out_path, "rb") as f:
        data = await f.read()
    
    # Skip 16-byte header, get frame data
    frame_data = data[16:]
    frame_count = job["frame_count"]
    fps = job["fps"]
    width = config["width"]
    height = config["height"]
    driver = config["driver"]
    driver_id = config["driver_id"]
    display_key = job.get("display_key", "")
    frame_size = (width * height) // 8
    
    # Determine if SPI or I2C
    is_spi = "spi" in display_key.lower() or driver_id in [3, 4, 5, 6]
    is_i2c = not is_spi and driver_id in [0, 1, 2]
    
    # Generate .ino file content
    ino_content = f"""/*
 * ESP32 OLED Video Player - Embedded Frames
 * Generated from video processing
 * 
 * Display: {driver} ({width}x{height})
 * Interface: {'SPI' if is_spi else 'I2C' if is_i2c else 'Custom'}
 * Frames: {frame_count} @ {fps}fps
 * Total size: {len(frame_data)} bytes
 * 
 * Wiring:
"""
    
    # Add wiring based on interface type
    if is_i2c:
        ino_content += """ *   VCC → 3.3V
 *   GND → GND
 *   SCL → GPIO 22
 *   SDA → GPIO 21
"""
    elif is_spi and driver_id in [0, 1, 2]:  # SH1106/SSD1306 SPI
        ino_content += """ *   VCC → 3.3V
 *   GND → GND
 *   CS  → GPIO 5
 *   DC  → GPIO 16
 *   RES → GPIO 17
 *   SDA → GPIO 23 (MOSI)
 *   SCK → GPIO 18
"""
    elif is_spi and driver_id in [3, 4, 5]:  # Color TFT SPI
        ino_content += """ *   VCC   → 3.3V
 *   GND   → GND
 *   CS    → GPIO 5
 *   RESET → GPIO 4
 *   DC/RS → GPIO 2
 *   MOSI  → GPIO 23
 *   SCK   → GPIO 18
 *   BL    → 3.3V or PWM
"""
    elif driver_id == 6:  # MAX7219
        ino_content += """ *   VCC → 5V (!)
 *   GND → GND
 *   CS  → GPIO 5
 *   DIN → GPIO 23
 *   CLK → GPIO 18
"""
    
    ino_content += """ */

#include <Wire.h>
"""
    
    if is_spi:
        ino_content += "#include <SPI.h>\n"
    
    # Add defines
    ino_content += f"""
#define FRAME_COUNT   {frame_count}
#define FRAME_SIZE    {frame_size}
#define FPS           {fps}
#define WIDTH         {width}
#define HEIGHT        {height}
#define DRIVER_ID     {driver_id}
"""
    
    if is_i2c:
        ino_content += """
// I2C Configuration
#define OLED_ADDR     0x3C
#define I2C_CLOCK_HZ  400000
#define SDA_PIN       21
#define SCL_PIN       22
"""
    elif is_spi and driver_id in [0, 1, 2]:  # OLED SPI
        ino_content += """
// SPI Configuration (OLED)
#define SPI_CS_PIN    5
#define SPI_DC_PIN    16
#define SPI_RST_PIN   17
#define SPI_MOSI_PIN  23
#define SPI_SCK_PIN   18
#define SPI_CLOCK_HZ  10000000
"""
    elif is_spi and driver_id in [3, 4, 5]:  # Color TFT SPI
        ino_content += """
// SPI Configuration (TFT)
#define TFT_CS        5
#define TFT_RST       4
#define TFT_DC        2
#define TFT_MOSI      23
#define TFT_SCK       18
#define SPI_CLOCK_HZ  40000000
"""
    elif driver_id == 6:  # MAX7219
        ino_content += """
// SPI Configuration (MAX7219)
#define MAX_CS        5
#define MAX_DIN       23
#define MAX_CLK       18
"""
    
    # Add frame data
    ino_content += f"""
// Embedded frame data ({len(frame_data)} bytes)
const uint8_t PROGMEM frames[] = {{
"""
    
    # Add frame data as hex bytes (16 bytes per line)
    for i in range(0, len(frame_data), 16):
        chunk = frame_data[i:i+16]
        hex_bytes = ", ".join(f"0x{b:02X}" for b in chunk)
        ino_content += f"  {hex_bytes},\n"
    
    ino_content = ino_content.rstrip(",\n") + "\n};\n\n"
    
    # Add driver code based on interface
    if is_i2c:
        # Determine if SH1106 or SSD1306
        is_sh1106 = driver_id == 1
        
        if is_sh1106:
            # SH1106 I2C driver
            ino_content += """
// ═══════════════════════════════════════════════════════════════════════════
// I2C OLED Driver (SH1106)
// ═══════════════════════════════════════════════════════════════════════════

void oled_cmd(uint8_t cmd) {
  Wire.beginTransmission(OLED_ADDR);
  Wire.write(0x00);  // Command mode
  Wire.write(cmd);
  Wire.endTransmission();
}

void oled_init() {
  Wire.setClock(I2C_CLOCK_HZ);
  Wire.begin(SDA_PIN, SCL_PIN);
  delay(100);
  
  oled_cmd(0xAE);          // Display off
  oled_cmd(0xD5); oled_cmd(0x80);  // Clock divide
  oled_cmd(0xA8); oled_cmd(0x3F);  // Multiplex ratio (63 = 64 rows)
  oled_cmd(0xD3); oled_cmd(0x00);  // Display offset
  oled_cmd(0x40);          // Start line = 0
  
  // SH1106 charge pump (different from SSD1306!)
  oled_cmd(0xAD); oled_cmd(0x8B);  // Internal DC-DC on
  oled_cmd(0x32);          // Pump voltage 8.0V
  
  oled_cmd(0xA1);          // Segment remap
  oled_cmd(0xC8);          // COM scan direction
  oled_cmd(0xDA); oled_cmd(0x12);  // COM pins
  oled_cmd(0x81); oled_cmd(0xCF);  // Contrast
  oled_cmd(0xD9); oled_cmd(0xF1);  // Precharge
  oled_cmd(0xDB); oled_cmd(0x40);  // VCOMH
  oled_cmd(0xA4);          // Display from RAM
  oled_cmd(0xA6);          // Normal display
  oled_cmd(0xAF);          // Display on
}

void oled_push_frame(const uint8_t* data) {
  // SH1106: Page-addressing mode only
  // Column offset = 2 because SH1106 RAM is 132px wide
  for (uint8_t page = 0; page < 8; page++) {
    oled_cmd(0xB0 + page);  // Set page address
    oled_cmd(0x02);          // Column low nibble = 2 (critical offset!)
    oled_cmd(0x10);          // Column high nibble = 0
    
    // Send 128 bytes for this page in 32-byte chunks
    for (uint8_t chunk = 0; chunk < 4; chunk++) {
      Wire.beginTransmission(OLED_ADDR);
      Wire.write(0x40);  // Data mode
      for (uint8_t i = 0; i < 32; i++) {
        Wire.write(pgm_read_byte(&data[page * 128 + chunk * 32 + i]));
      }
      Wire.endTransmission();
    }
  }
}
"""
        else:
            # SSD1306 I2C driver
            ino_content += """
// ═══════════════════════════════════════════════════════════════════════════
// I2C OLED Driver (SSD1306)
// ═══════════════════════════════════════════════════════════════════════════

void oled_cmd(uint8_t cmd) {
  Wire.beginTransmission(OLED_ADDR);
  Wire.write(0x00);  // Command mode
  Wire.write(cmd);
  Wire.endTransmission();
}

void oled_init() {
  Wire.setClock(I2C_CLOCK_HZ);
  Wire.begin(SDA_PIN, SCL_PIN);
  delay(100);
  
  oled_cmd(0xAE);          // Display off
  oled_cmd(0xD5); oled_cmd(0x80);  // Clock
  oled_cmd(0xA8); oled_cmd(HEIGHT - 1);  // Mux ratio
  oled_cmd(0xD3); oled_cmd(0x00);  // Display offset
  oled_cmd(0x40);          // Start line
  oled_cmd(0x8D); oled_cmd(0x14);  // Charge pump on (SSD1306)
  oled_cmd(0x20); oled_cmd(0x00);  // Horizontal addressing mode
  oled_cmd(0xA1);          // Segment remap
  oled_cmd(0xC8);          // COM scan direction
  oled_cmd(0xDA); oled_cmd(0x12);  // COM pins
  oled_cmd(0x81); oled_cmd(0xCF);  // Contrast
  oled_cmd(0xD9); oled_cmd(0xF1);  // Precharge
  oled_cmd(0xDB); oled_cmd(0x40);  // VCOMH
  oled_cmd(0xA4);          // Display from RAM
  oled_cmd(0xA6);          // Normal display
  oled_cmd(0xAF);          // Display on
}

void oled_push_frame(const uint8_t* data) {
  // SSD1306: Horizontal addressing mode with bulk transfer
  // Reset GRAM pointer to (0,0)
  oled_cmd(0x21); oled_cmd(0x00); oled_cmd(WIDTH - 1);  // Columns
  oled_cmd(0x22); oled_cmd(0x00); oled_cmd((HEIGHT / 8) - 1);  // Pages
  
  // Send frame data in 32-byte chunks
  for (uint16_t i = 0; i < FRAME_SIZE; i += 32) {
    Wire.beginTransmission(OLED_ADDR);
    Wire.write(0x40);  // Data mode
    for (uint8_t j = 0; j < 32 && (i + j) < FRAME_SIZE; j++) {
      Wire.write(pgm_read_byte(&data[i + j]));
    }
    Wire.endTransmission();
  }
}
"""
    elif is_spi and driver_id in [0, 1, 2]:  # OLED SPI
        # Determine if SH1106 or SSD1306
        is_sh1106 = driver_id == 1
        
        if is_sh1106:
            # SH1106-specific driver
            ino_content += """
// ═══════════════════════════════════════════════════════════════════════════
// SPI OLED Driver (SH1106)
// ═══════════════════════════════════════════════════════════════════════════

void oled_spi_cmd(uint8_t cmd) {
  digitalWrite(SPI_DC_PIN, LOW);
  digitalWrite(SPI_CS_PIN, LOW);
  SPI.transfer(cmd);
  digitalWrite(SPI_CS_PIN, HIGH);
}

void oled_init() {
  pinMode(SPI_CS_PIN, OUTPUT);
  pinMode(SPI_DC_PIN, OUTPUT);
  pinMode(SPI_RST_PIN, OUTPUT);
  
  digitalWrite(SPI_CS_PIN, HIGH);
  digitalWrite(SPI_RST_PIN, LOW);
  delay(10);
  digitalWrite(SPI_RST_PIN, HIGH);
  delay(10);
  
  SPI.begin(SPI_SCK_PIN, -1, SPI_MOSI_PIN, SPI_CS_PIN);
  SPI.setFrequency(SPI_CLOCK_HZ);
  
  oled_spi_cmd(0xAE);  // Display off
  oled_spi_cmd(0xD5); oled_spi_cmd(0x80);  // Clock divide
  oled_spi_cmd(0xA8); oled_spi_cmd(0x3F);  // Multiplex ratio (63 = 64 rows)
  oled_spi_cmd(0xD3); oled_spi_cmd(0x00);  // Display offset
  oled_spi_cmd(0x40);  // Start line = 0
  
  // SH1106 charge pump (different from SSD1306!)
  oled_spi_cmd(0xAD); oled_spi_cmd(0x8B);  // Internal DC-DC on
  oled_spi_cmd(0x32);  // Pump voltage 8.0V
  
  oled_spi_cmd(0xA1);  // Segment remap (mirror X)
  oled_spi_cmd(0xC8);  // COM scan direction (mirror Y)
  oled_spi_cmd(0xDA); oled_spi_cmd(0x12);  // COM pins config
  oled_spi_cmd(0x81); oled_spi_cmd(0xCF);  // Contrast
  oled_spi_cmd(0xD9); oled_spi_cmd(0xF1);  // Pre-charge
  oled_spi_cmd(0xDB); oled_spi_cmd(0x40);  // VCOMH deselect
  oled_spi_cmd(0xA4);  // Entire display on (use RAM)
  oled_spi_cmd(0xA6);  // Normal display (not inverted)
  oled_spi_cmd(0xAF);  // Display on
}

void oled_push_frame(const uint8_t* data) {
  // SH1106: Page-addressing mode only (no horizontal mode support)
  // Column offset = 2 because SH1106 RAM is 132px wide, display starts at col 2
  for (uint8_t page = 0; page < 8; page++) {
    oled_spi_cmd(0xB0 + page);  // Set page address
    oled_spi_cmd(0x02);          // Column low nibble = 2 (critical offset!)
    oled_spi_cmd(0x10);          // Column high nibble = 0
    
    digitalWrite(SPI_DC_PIN, HIGH);  // Data mode
    digitalWrite(SPI_CS_PIN, LOW);
    for (uint8_t col = 0; col < 128; col++) {
      SPI.transfer(pgm_read_byte(&data[page * 128 + col]));
    }
    digitalWrite(SPI_CS_PIN, HIGH);
  }
}
"""
        else:
            # SSD1306-specific driver
            ino_content += """
// ═══════════════════════════════════════════════════════════════════════════
// SPI OLED Driver (SSD1306)
// ═══════════════════════════════════════════════════════════════════════════

void oled_spi_cmd(uint8_t cmd) {
  digitalWrite(SPI_DC_PIN, LOW);
  digitalWrite(SPI_CS_PIN, LOW);
  SPI.transfer(cmd);
  digitalWrite(SPI_CS_PIN, HIGH);
}

void oled_init() {
  pinMode(SPI_CS_PIN, OUTPUT);
  pinMode(SPI_DC_PIN, OUTPUT);
  pinMode(SPI_RST_PIN, OUTPUT);
  
  digitalWrite(SPI_CS_PIN, HIGH);
  digitalWrite(SPI_RST_PIN, LOW);
  delay(10);
  digitalWrite(SPI_RST_PIN, HIGH);
  delay(10);
  
  SPI.begin(SPI_SCK_PIN, -1, SPI_MOSI_PIN, SPI_CS_PIN);
  SPI.setFrequency(SPI_CLOCK_HZ);
  
  oled_spi_cmd(0xAE);  // Display off
  oled_spi_cmd(0xD5); oled_spi_cmd(0x80);  // Clock divide
  oled_spi_cmd(0xA8); oled_spi_cmd(HEIGHT - 1);  // Multiplex ratio
  oled_spi_cmd(0xD3); oled_spi_cmd(0x00);  // Display offset
  oled_spi_cmd(0x40);  // Start line
  
  // SSD1306 charge pump
  oled_spi_cmd(0x8D); oled_spi_cmd(0x14);  // Charge pump on
  
  oled_spi_cmd(0x20); oled_spi_cmd(0x00);  // Horizontal addressing mode
  oled_spi_cmd(0xA1);  // Segment remap
  oled_spi_cmd(0xC8);  // COM scan direction
  oled_spi_cmd(0xDA); oled_spi_cmd(0x12);  // COM pins
  oled_spi_cmd(0x81); oled_spi_cmd(0xCF);  // Contrast
  oled_spi_cmd(0xD9); oled_spi_cmd(0xF1);  // Precharge
  oled_spi_cmd(0xDB); oled_spi_cmd(0x40);  // VCOMH
  oled_spi_cmd(0xA4);  // Display from RAM
  oled_spi_cmd(0xA6);  // Normal display
  oled_spi_cmd(0xAF);  // Display on
}

void oled_push_frame(const uint8_t* data) {
  // SSD1306: Horizontal addressing mode with bulk transfer
  oled_spi_cmd(0x21); oled_spi_cmd(0x00); oled_spi_cmd(WIDTH - 1);  // Column range
  oled_spi_cmd(0x22); oled_spi_cmd(0x00); oled_spi_cmd((HEIGHT / 8) - 1);  // Page range
  
  digitalWrite(SPI_DC_PIN, HIGH);
  digitalWrite(SPI_CS_PIN, LOW);
  for (uint16_t i = 0; i < FRAME_SIZE; i++) {
    SPI.transfer(pgm_read_byte(&data[i]));
  }
  digitalWrite(SPI_CS_PIN, HIGH);
}
"""
    else:
        # Generic fallback
        ino_content += """
// ═══════════════════════════════════════════════════════════════════════════
// Generic Display Driver (customize for your display)
// ═══════════════════════════════════════════════════════════════════════════

void oled_init() {
  // TODO: Add initialization for your display
  Serial.println("// WARNING: Generic driver - customize for your display!");
}

void oled_push_frame(const uint8_t* data) {
  // TODO: Add frame push logic for your display
}
"""
    
    # Add setup and loop
    ino_content += f"""
// ═══════════════════════════════════════════════════════════════════════════
// Main Program
// ═══════════════════════════════════════════════════════════════════════════

void setup() {{
  Serial.begin(115200);
  delay(500);
  Serial.println("// ESP32 OLED Player - Embedded Frames");
  Serial.printf("// Display: {driver} %dx%d @ %dfps\\n", WIDTH, HEIGHT, FPS);
  Serial.printf("// Interface: {'SPI' if is_spi else 'I2C' if is_i2c else 'Custom'}\\n");
  Serial.printf("// Frames: %d (total %d bytes)\\n", FRAME_COUNT, sizeof(frames));
  
  oled_init();
  Serial.println("// Playback started");
}}

void loop() {{
  static uint32_t frame_idx = 0;
  static unsigned long next_frame = 0;
  
  if (millis() >= next_frame) {{
    const uint8_t* frame_ptr = frames + (frame_idx * FRAME_SIZE);
    oled_push_frame(frame_ptr);
    
    frame_idx = (frame_idx + 1) % FRAME_COUNT;
    next_frame = millis() + (1000 / FPS);
  }}
}}
"""
    
    return Response(
        content=ino_content,
        media_type="text/plain",
        headers={"Content-Disposition": f'attachment; filename="oled_player_{driver.lower()}_{width}x{height}_{job_id}.ino"'},
    )



@app.get("/api/stream/{job_id}/meta")
async def stream_meta(job_id: str):
    """WiFi streaming mode: return metadata for ESP32 to configure itself."""
    job = jobs.get(job_id)
    if not job or job.get("status") != "done":
        raise HTTPException(404, "Job not ready")
    return {
        "width": job["config"]["width"],
        "height": job["config"]["height"],
        "fps": job["fps"],
        "frame_count": job["frame_count"],
        "driver": job["config"]["driver"],
    }


@app.get("/api/stream/{job_id}/frame/{index}")
async def stream_frame(job_id: str, index: int):
    """WiFi streaming mode: serve a single raw frame by index."""
    job = jobs.get(job_id)
    if not job or job.get("status") != "done":
        raise HTTPException(404, "Job not ready")
    if index < 0 or index >= job["frame_count"]:
        raise HTTPException(404, "Frame index out of range")

    config = job["config"]
    frame_size = (config["width"] * config["height"]) // 8
    header_size = 16

    async with aiofiles.open(job["output_path"], "rb") as f:
        await f.seek(header_size + index * frame_size)
        data = await f.read(frame_size)

    return Response(content=data, media_type="application/octet-stream")


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
