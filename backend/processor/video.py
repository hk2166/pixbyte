"""
video.py — FFmpeg-based frame extractor for ESP32 OLED converter
Extracts frames at target FPS, resizes to display resolution, converts to grayscale.
"""
import subprocess
import tempfile
import os
import shutil
from pathlib import Path
from PIL import Image
from typing import Generator, Tuple, Optional, List


DISPLAY_CONFIGS = {
    "sh1106_128x64": {
        "driver": "SH1106",
        "width": 128,
        "height": 64,
        "fps": 8,
        "driver_id": 1,
        "label": '1.3" OLED (SH1106, 128×64, I2C, 1-bit)',
    },
    "sh1106_128x64_spi": {
        "driver": "SH1106",
        "width": 128,
        "height": 64,
        "fps": 15,
        "driver_id": 1,
        "label": '1.3" OLED (SH1106, 128×64, SPI, 1-bit)',
    },
    "ssd1106_128x64": {
        "driver": "SSD1106",
        "width": 128,
        "height": 64,
        "fps": 8,
        "driver_id": 2,
        "label": '1.3" OLED (SSD1106, 128×64, 1-bit)',
    },
    "ssd1306_128x64": {
        "driver": "SSD1306",
        "width": 128,
        "height": 64,
        "fps": 10,
        "driver_id": 0,
        "label": '0.96" OLED (SSD1306, 128×64, I2C, 1-bit)',
    },
    "ssd1306_128x64_spi": {
        "driver": "SSD1306",
        "width": 128,
        "height": 64,
        "fps": 15,
        "driver_id": 0,
        "label": '0.96" OLED (SSD1306, 128×64, SPI, 1-bit)',
    },
    "ssd1306_128x32": {
        "driver": "SSD1306",
        "width": 128,
        "height": 32,
        "fps": 15,
        "driver_id": 0,
        "label": '0.96" OLED (SSD1306, 128×32, 1-bit)',
    },
    "ili9341_320x240": {
        "driver": "ILI9341",
        "width": 320,
        "height": 240,
        "fps": 15,
        "driver_id": 3,
        "label": '2.8" TFT (ILI9341, SPI, 1-bit)',
    },
    "st7735_160x128": {
        "driver": "ST7735",
        "width": 160,
        "height": 128,
        "fps": 15,
        "driver_id": 4,
        "label": '1.8" TFT (ST7735, SPI, 1-bit)',
    },
    "st7789_240x240": {
        "driver": "ST7789",
        "width": 240,
        "height": 240,
        "fps": 15,
        "driver_id": 5,
        "label": '1.54" TFT (ST7789, SPI, 1-bit)',
    },
    "max7219_8x8": {
        "driver": "MAX7219",
        "width": 8,
        "height": 8,
        "fps": 2,
        "driver_id": 6,
        "label": 'LED Matrix (MAX7219, SPI, 1-bit)',
    },
    "hd44780_16x2": {
        "driver": "HD44780",
        "width": 80,
        "height": 16,
        "fps": 1,
        "driver_id": 7,
        "label": '16x2 LCD (HD44780, I2C/Par)',
    },
}


def get_video_info(video_path: str) -> dict:
    """Get video duration and original FPS using ffprobe."""
    cmd = [
        "ffprobe", "-v", "quiet", "-print_format", "json",
        "-show_streams", video_path
    ]
    import json
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe failed: {result.stderr}")
    data = json.loads(result.stdout)
    for stream in data.get("streams", []):
        if stream.get("codec_type") == "video":
            duration = float(stream.get("duration", 0))
            r_frame_rate = stream.get("r_frame_rate", "30/1")
            num, den = r_frame_rate.split("/")
            fps = float(num) / float(den)
            return {"duration": duration, "fps": fps,
                    "width": stream.get("width"), "height": stream.get("height")}
    raise RuntimeError("No video stream found")


def extract_frames(
    video_path: str,
    display_key: str,
    target_fps: Optional[int] = None,
    progress_callback=None,
) -> Tuple[List[Image.Image], int]:
    """
    Extract frames from video using FFmpeg.
    Scales and stretches video to completely fill display dimensions.
    Returns (list_of_PIL_images, actual_fps).
    """
    config = DISPLAY_CONFIGS[display_key]
    w, h = config["width"], config["height"]
    fps = target_fps or config["fps"]
    video_filter = (
        f"fps={fps},"
        f"scale={w}:{h}:force_original_aspect_ratio=disable:flags=lanczos,"
        "setsar=1,"
        "format=gray"
    )

    tmp_dir = tempfile.mkdtemp(prefix="oled_frames_")
    try:
        # FFmpeg command:
        # 1. fps={fps} - set target frame rate
        # 2. scale={w}:{h}:force_original_aspect_ratio=disable - always stretch
        #    the source to the exact target display dimensions
        # 3. setsar=1 - normalize sample aspect ratio so every display preview/export
        #    uses square pixels after scaling
        # 4. format=gray - convert to grayscale
        cmd = [
            "ffmpeg", "-i", video_path,
            "-vf", video_filter,
            "-q:v", "2",
            os.path.join(tmp_dir, "frame_%06d.png"),
            "-y", "-loglevel", "error"
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"FFmpeg failed: {result.stderr}")

        frame_files = sorted(Path(tmp_dir).glob("frame_*.png"))
        total = len(frame_files)
        frames = []
        for i, fp in enumerate(frame_files):
            img = Image.open(fp).convert("L")  # ensure grayscale
            # Double-check dimensions match exactly
            if img.size != (w, h):
                img = img.resize((w, h), Image.Resampling.LANCZOS)
            frames.append(img)
            if progress_callback:
                progress_callback(i + 1, total)

        return frames, fps
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
