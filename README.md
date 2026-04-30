# ESP32 OLED Video Converter (0x1306)

A full-stack, hacker-aesthetic web application designed specifically to convert standard video files into bit-packed, hardware-optimized formats for streaming and playback on ESP32-driven micro-OLED displays (SH1106 / SSD1306).

Built entirely around the severe bandwidth and memory constraints of embedded hardware, this tool bypasses heavy graphics libraries (like `U8g2`'s display buffers) to push raw bits directly down the I²C bus for high frame-rate video rendering.

---

## 🏗️ Architecture

The app is built in 3 modular parts:

1. **Frontend (Vite / React + TypeScript)**  
   Provides a dark, terminal-style aesthetic mimicking low-level tooling. Uses an HTML5 Canvas to render a simulated "lit-pixel" live preview with scanlines. Fetches SSE data for real-time progress.
2. **Backend (Python / FastAPI + FFmpeg)**  
   The core translation engine. Given any video file, it extracts scaled frames at the exact FPS required, crushes Grayscale using pure Floyd-Steinberg dithering mathematics, and packs continuous 8-row sequences vertically specifically to map 1:1 with standard OLED memory structures.
3. **Firmware (Arduino C++ framework)**  
   A boilerplate `esp32_oled_player` configured out-of-the-box to interpret the generated `.oled` raw payloads over 3 separate vectors: `Flash memory (PROGMEM)`, `SD Card (SPI)`, or Streaming directly over LAN (`WiFi`).

---

## 🛠️ Requirements
* **Node.js**: v18+ (for frontend)
* **Python**: v3.10+ (for backend)
* **FFmpeg**: Must be installed globally (e.g., `brew install ffmpeg`)
* **PlatformIO / Arduino IDE**: For flashing the micro-controller.

---

## 🚀 Running Locally

### 1. Start the Backend API (Python)
Navigate to the `backend` directory, initialize a virtual environment, and run the server on port `8001`:
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8001
```

### 2. Start the Frontend App (JavaScript)
Navigate to the `frontend` directory, install Node modules, and run the Vite host:
```bash
cd frontend
npm install
npm run dev -- --port 5174
```

Visit the frontend at **http://localhost:5174**.

---

## 🔌 Using on Hardware (ESP32)

1. Upload your video via the web UI and select your target display (e.g. `1.3" OLED SH1106`). 
2. Set your required target framerate (`fps`). Anything past 11 FPS on I²C heavily strains regular clock speeds. Set Floyd-Steinberg dithering to 'on' for maximum contrast visibility.
3. Wait for the `.oled` buffer extraction pipeline.
4. Download the generated `.oled` binary file via the Delivery Panel.

### Hardware Interface Options:
* **Flash Mode**: If your file size is < 2.8MB, flash it straight into unmapped flash regions on your ESP32 utilizing Esptool. The code snippet is provided within your frontend delivery portal automatically.
* **SD Card Mode**: Place `display.oled` directly in the root of an SD Card, tie MOSI/MISO/CLK/CS into your ESP32's SPI header, and change the definition to `#define MODE_SD` on line 18 in `/firmware/esp32_oled_player/esp32_oled_player.ino`.
* **WiFi Mode**: Stream real-time buffer blocks over localhost sockets straight off the Python FastAPI router to bypass storage all together. Ensure your device is on the same VLAN / host loop.

---

## 📂 Custom Binary Format (`.oled`)

Because standard containers (MP4, AVI) require bloated hardware decoders, this system creates custom header-embedded files meant explicitly for direct microcontroller delivery:

| Byte Offset | Size | Purpose | Example |
| :--- | :--- | :--- | :--- |
| `0-3` | 4 bytes | Magic Number (`OLED`) | `0x4F 0x4C 0x45 0x44` |
| `4` | 1 byte | Format Version | `0x01` |
| `5-6` | 2 bytes | Width (uint16 LE) | `128` |
| `7-8` | 2 bytes | Height (uint16 LE) | `64` |
| `9` | 1 byte | FPS | `10` |
| `10` | 1 byte | Driver ID | `0x01` (SH1106), `0x02` (SSD1306) |
| `11-14` | 4 bytes | Frame count (uint32 LE) | `1850` |
| `15` | 1 byte | Reserved | `0x00` |
| `16+` | `W * (H/8)` | Vertical Column Frame Buffers | ... bytes |

**Header Validation**: The firmware validates the magic bytes and version on startup. If validation fails, the ESP32 will print an error to Serial and halt, preventing garbage output from invalid binaries.

---

## ⚡ Performance Optimizations

### I2C Clock Speed
The firmware explicitly sets the I2C clock speed to **400kHz** (Fast Mode) by default. This provides:
- Theoretical frame rate ceiling of ~30fps for 128×64 displays after I2C protocol overhead
- At **800kHz** (Fast Mode Plus), frame rates can approach 60fps
- Configurable via `I2C_CLOCK_HZ` define in the firmware

### SPI Support (NEW)
For even higher performance, the firmware now supports **SPI mode** alongside I2C:
- SPI can run at **10-40MHz** — up to 100× faster than I2C
- Enables true 30fps+ playback on 128×64 displays
- Requires a 4-wire SPI OLED module (SDA/SCL pins become MOSI/SCLK)
- Configure via `#define DISPLAY_INTERFACE SPI` in firmware
- Default pins: MOSI=23, SCLK=18, CS=5, DC=16, RST=17

### Duplicate Frame Removal
The encoder automatically removes consecutive duplicate frames:
- Uses XOR-based pixel difference detection
- Default threshold: 2% pixel change (configurable via `dedup_threshold`)
- Significantly reduces file size for videos with static scenes
- Logs dropped frame count during encoding

### Frame Timing Stability
The firmware uses deadline-based scheduling for stable playback:
- Maintains precise frame timing even with I2C transaction variance
- Prevents playback speed drift over time
- Uses microsecond-precision timing for smooth animation

---

## 🎨 Real-Time Preview

The web UI includes a real-time 1-bit preview canvas:
- Shows the first 30 frames of your processed video
- Renders at actual display resolution (128×64 or 128×32) scaled 4× for visibility
- Animates at the encoded FPS using `requestAnimationFrame`
- Simulates OLED appearance with optional phosphor tint

---

## 🌐 Browser Compatibility

**WebSerial Flashing** requires a Chromium-based browser:
- ✅ Chrome 89+
- ✅ Edge 89+
- ❌ Firefox (not supported)
- ❌ Safari (not supported)

If your browser doesn't support WebSerial, the UI will display a warning banner and provide CLI flashing instructions using `esptool.py`.
