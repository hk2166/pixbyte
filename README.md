# 🎨 ESP32 OLED Video Converter

Convert videos to binary frames for ESP32 OLED displays. Upload a video, select your display, and get a ready-to-flash Arduino sketch with embedded frames.

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new)
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

## ✨ Features

- **🎬 Video Processing**: Convert MP4, AVI, MOV, MKV, WebM, GIF to OLED frames
- **📺 Multiple Displays**: Support for SSD1306, SH1106, ILI9341, ST7735, ST7789, MAX7219, HD44780
- **⚡ Real-time Preview**: See your video on a virtual OLED display before flashing
- **📦 One-Click Download**: Get complete Arduino .ino file with embedded frames
- **🔧 Display-Specific Code**: Automatically generates correct driver code for your display
- **📊 Analytics**: Track visitors and collect feedback (optional, Neon PostgreSQL)
- **🎨 Dithering**: Floyd-Steinberg dithering for better image quality
- **🗜️ Frame Deduplication**: Removes duplicate frames to save space
- **📐 Aspect Ratio**: Maintains video aspect ratio with letterboxing

## 🚀 Quick Start

### Local Development

```bash
# Clone the repository
git clone https://github.com/yourusername/oled-converter.git
cd oled-converter/pixbyte

# Install dependencies
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cd ..

cd frontend
npm install
cd ..

# Start both servers
./run.sh
```

Open `http://localhost:5888` in your browser.

### Docker

```bash
docker-compose up --build
```

Open `http://localhost:8888` in your browser.

## 📋 Requirements

- **Python 3.11+**
- **Node.js 20+**
- **FFmpeg** (for video processing)
- **PostgreSQL** (optional, for analytics)

## 🎯 Supported Displays

| Display | Resolution | Interface | FPS |
|---------|-----------|-----------|-----|
| SSD1306 | 128×64 | I2C/SPI | 10-15 |
| SH1106 | 128×64 | I2C/SPI | 8-15 |
| SSD1306 | 128×32 | I2C | 15 |
| ILI9341 | 320×240 | SPI | 15 |
| ST7735 | 160×128 | SPI | 15 |
| ST7789 | 240×240 | SPI | 15 |
| MAX7219 | 8×8 | SPI | 2 |
| HD44780 | 16×2 | I2C/Parallel | 1 |

## 🔧 How It Works

1. **Upload Video**: Drag & drop or select a video file
2. **Select Display**: Choose your OLED display type
3. **Configure**: Adjust FPS, dithering, and deduplication
4. **Process**: Backend extracts frames using FFmpeg
5. **Preview**: See real-time preview on virtual display
6. **Download**: Get complete .ino file with embedded frames
7. **Flash**: Open in Arduino IDE and upload to ESP32

## 📊 Analytics (Optional)

Track visitors and collect feedback using Neon PostgreSQL:

```bash
# Set up database
cp backend/.env.example backend/.env
# Edit .env and add your DATABASE_URL

# Tables are created automatically on startup
```

See [ANALYTICS_SETUP.md](ANALYTICS_SETUP.md) for details.

## 🚢 Deployment

Deploy to your favorite platform:

- **Railway**: One-click deploy with `railway.toml`
- **Render**: Auto-deploy with `render.yaml`
- **Docker**: Use included `Dockerfile` and `docker-compose.yml`
- **Fly.io**: `flyctl launch`
- **Vercel**: Use `vercel.json` (serverless)

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed instructions.

## 🏗️ Architecture

```
pixbyte/
├── backend/              # FastAPI Python backend
│   ├── main.py          # API endpoints
│   ├── database.py      # PostgreSQL integration
│   └── processor/       # Video processing
│       ├── video.py     # FFmpeg frame extraction
│       ├── encoder.py   # Binary encoding
│       └── dither.py    # Image dithering
├── frontend/            # React + TypeScript frontend
│   └── src/
│       ├── App.tsx      # Main application
│       ├── api.ts       # API client
│       └── components/  # UI components
├── Dockerfile           # Production container
├── docker-compose.yml   # Local development
└── run.sh              # Development startup script
```

## 🔌 API Endpoints

### Video Processing
- `POST /api/upload` - Upload video file
- `POST /api/process` - Start processing
- `GET /api/status/{job_id}` - SSE status stream
- `GET /api/download/{job_id}` - Download .oled binary
- `GET /api/download/{job_id}/ino` - Download .ino file

### Analytics
- `POST /api/track-visit` - Track visitor
- `GET /api/analytics/summary` - Get analytics summary
- `POST /api/feedback` - Submit feedback

### Displays
- `GET /api/displays` - List supported displays

## 🛠️ Development

```bash
# Backend
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8888

# Frontend
cd frontend
npm run dev -- --port 5888
```

## 🧪 Testing

```bash
# Test backend API
curl http://localhost:8888/api/displays

# Test health check
curl http://localhost:8888/health

# Test video upload
curl -X POST -F "file=@video.mp4" http://localhost:8888/api/upload
```

## 📝 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | No | Neon PostgreSQL connection string |
| `PORT` | No | Server port (default: 8888) |
| `VITE_API_URL` | No | Frontend API URL (default: http://localhost:8888) |

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- **FFmpeg** - Video processing
- **FastAPI** - Backend framework
- **React** - Frontend framework
- **Neon** - PostgreSQL database
- **Vite** - Frontend build tool

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/oled-converter/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/oled-converter/discussions)
- **Email**: your-email@example.com

## 🎉 Demo

Try it live: [https://your-app.railway.app](https://your-app.railway.app)

---

Made with ❤️ for the ESP32 maker community
