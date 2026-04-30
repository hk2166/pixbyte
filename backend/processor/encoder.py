"""
encoder.py — Bit-packing and .oled binary format encoder
Packs 1-bit frames into page-organized bytes matching SSD1306/SH1106 GRAM layout.

Binary format (.oled):
  Header (16 bytes):
    [0-3]  Magic: 0x4F 0x4C 0x45 0x44 ("OLED")
    [4]    Format version (set to 0x01)
    [5-6]  Width (uint16, little-endian)
    [7-8]  Height (uint16, little-endian)
    [9]    FPS (uint8)
    [10]   Driver ID (0x01=SH1106, 0=SSD1306)
    [11-14] Frame count (uint32, little-endian)
    [15]   Reserved, set to 0x00
  Frame Data:
    Each frame = ceil(W*H/8) bytes, page-organized (column-major within pages)
    128x64 → 1024 bytes, 128x32 → 512 bytes
"""
import struct
import numpy as np
from PIL import Image
from typing import Optional, List, Tuple


MAGIC = b"OLED"
HEADER_SIZE = 16


def frame_to_page_bytes(img: Image.Image, width: int, height: int) -> bytes:
    """
    Convert a 1-bit PIL image to page-organized bytes matching OLED GRAM layout.
    Pages = height // 8, each page contains 8 rows.
    For each page, for each column, pack 8 vertical pixels into one byte (LSB = top).
    """
    # Convert to numpy bool array (True = white/on)
    px = np.array(img.convert("1"), dtype=np.uint8)
    # Ensure correct size
    if px.shape != (height, width):
        img_resized = img.resize((width, height))
        px = np.array(img_resized.convert("1"), dtype=np.uint8)

    pages = height // 8
    frame_bytes = bytearray(pages * width)

    for page in range(pages):
        for col in range(width):
            byte_val = 0
            for bit in range(8):
                row = page * 8 + bit
                if px[row, col]:
                    byte_val |= (1 << bit)
            frame_bytes[page * width + col] = byte_val

    return bytes(frame_bytes)


def deduplicate_frames(frames: List[Image.Image], threshold: float = 0.02, original_fps: int = 30) -> Tuple[List[Image.Image], int]:
    """
    Remove consecutive duplicate frames.
    threshold: fraction of pixels that must differ to keep a frame (0=exact match only).
    """
    if not frames:
        return frames, original_fps

    result = [frames[0]]
    prev_arr = np.array(frames[0].convert("1"), dtype=np.uint8)
    width, height = frames[0].size

    for frame in frames[1:]:
        curr_arr = np.array(frame.convert("1"), dtype=np.uint8)
        diff = np.count_nonzero(curr_arr != prev_arr)
        changed_ratio = diff / (width * height)
        if changed_ratio >= threshold:
            result.append(frame)
            prev_arr = curr_arr

    dropped = len(frames) - len(result)
    print(f"Dropped {dropped} duplicate frames. Retained {len(result)} frames.")
    effective_fps = max(1, round((len(result) / len(frames)) * original_fps))
    return result, effective_fps


def encode_oled_binary(
    frames: List[Image.Image],
    width: int,
    height: int,
    fps: int,
    driver_id: int,
) -> bytes:
    """
    Encode all frames into the .oled binary format.
    Returns complete binary blob ready for download.
    """
    frame_count = len(frames)

    # Build header
    # 0-3: Magic (4s)
    # 4: Version (B)
    # 5-6: Width (H)
    # 7-8: Height (H)
    # 9: FPS (B)
    # 10: Driver ID (B)
    # 11-14: Frame count (I)
    # 15: Reserved (B)
    header = struct.pack(
        "<4sBHHBBIB",
        MAGIC,
        0x01,  # Version
        width,
        height,
        fps,
        driver_id,
        frame_count,
        0x00,  # Reserved
    )

    # Build frame data
    frame_data = bytearray()
    for frame in frames:
        frame_data.extend(frame_to_page_bytes(frame, width, height))

    return header + bytes(frame_data)


def get_binary_stats(data: bytes, width: int, height: int) -> dict:
    """Return stats about the encoded binary."""
    total_bytes = len(data)
    frame_size = (width * height) // 8
    frame_count = struct.unpack_from("<I", data, 11)[0]
    fps = data[9]
    duration_s = frame_count / fps if fps > 0 else 0

    return {
        "total_bytes": total_bytes,
        "total_kb": round(total_bytes / 1024, 1),
        "frame_count": frame_count,
        "frame_size_bytes": frame_size,
        "fps": fps,
        "duration_s": round(duration_s, 1),
        "delivery_mode": "flash" if total_bytes < 3 * 1024 * 1024 else "sd_card",
    }
