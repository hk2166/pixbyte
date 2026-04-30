"""
dither.py — Floyd-Steinberg dithering for 1-bit OLED output
Converts grayscale PIL Images to 1-bit using error-diffusion dithering.
"""
import numpy as np
from PIL import Image


def floyd_steinberg(img: Image.Image) -> Image.Image:
    """
    Apply Floyd-Steinberg dithering to a grayscale image, returning a 1-bit image.
    Error diffusion pattern:
              X   7/16
        3/16  5/16  1/16
    """
    # Work in float32 for precision
    src = np.array(img.convert("L"), dtype=np.float32)
    h, w = src.shape

    for y in range(h):
        for x in range(w):
            old_pixel = src[y, x]
            new_pixel = 255.0 if old_pixel >= 128.0 else 0.0
            src[y, x] = new_pixel
            err = old_pixel - new_pixel

            if x + 1 < w:
                src[y, x + 1] += err * 7 / 16
            if y + 1 < h:
                if x - 1 >= 0:
                    src[y + 1, x - 1] += err * 3 / 16
                src[y + 1, x] += err * 5 / 16
                if x + 1 < w:
                    src[y + 1, x + 1] += err * 1 / 16

    # Clip and convert
    src = np.clip(src, 0, 255).astype(np.uint8)
    return Image.fromarray(src).convert("1")


def apply_dithering(frames: list[Image.Image], use_dither: bool = True) -> list[Image.Image]:
    """Apply Floyd-Steinberg or simple threshold to a list of grayscale frames."""
    result = []
    for frame in frames:
        if use_dither:
            result.append(floyd_steinberg(frame))
        else:
            # Simple threshold at 128
            result.append(frame.convert("L").point(lambda p: 255 if p >= 128 else 0).convert("1"))
    return result
