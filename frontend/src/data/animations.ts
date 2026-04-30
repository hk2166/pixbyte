export interface OLEDAnimation {
  id: string;
  name: string;
  category:
    | "emoji"
    | "robot_eyes"
    | "icons"
    | "loaders"
    | "indian"
    | "festival"
    | "text_fx";
  tags: string[];
  supportedSizes: (32 | 48 | 64)[];
  fps: number;
  totalFrames: number;
  byteCount: number;
  frames: { [size: number]: Uint8Array[] };
  drawFrame: (
    ctx: CanvasRenderingContext2D,
    frameIndex: number,
    size: number,
  ) => void;
  getArduinoCode: (size: number) => string;
  getMicroPythonCode: (size: number) => string;
}

// Helpers
const getByteCount = (size: number) => (size * size) / 8;

const createBaseAnimation = (
  id: string,
  name: string,
  category: OLEDAnimation["category"],
  tags: string[],
  supportedSizes: (32 | 48 | 64)[],
  fps: number,
  totalFrames: number,
  drawFrame: (
    ctx: CanvasRenderingContext2D,
    frameIndex: number,
    size: number,
  ) => void,
  arduinoDrawCalls: string,
  microPythonDrawCalls: string,
): OLEDAnimation => {
  const maxBytes = Math.max(...supportedSizes.map(getByteCount));

  return {
    id,
    name,
    category,
    tags,
    supportedSizes,
    fps,
    totalFrames,
    byteCount: maxBytes,
    frames: {},
    drawFrame,
    getArduinoCode: () => {
      const delay = Math.round(1000 / fps);
      return `#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// 0x1306.dev · animation: ${name} · ${totalFrames} frames · ${delay}ms
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
#define SCREEN_ADDRESS 0x3C

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

#define FRAME_COUNT ${totalFrames}
#define FRAME_DELAY ${delay}

void drawFrame(int frame) {
  display.clearDisplay();

${arduinoDrawCalls}

  display.display();
}

void setup() {
  Wire.begin(21, 22); // SDA=21, SCL=22 for ESP32 DevKit // change to 0x3D if display not found
  display.begin(SSD1306_SWITCHCAPVCC, SCREEN_ADDRESS);
  display.clearDisplay();
  display.display();
}

void loop() {
  for (int i = 0; i < FRAME_COUNT; i++) {
    drawFrame(i);
    delay(FRAME_DELAY);
  }
}`;
    },
    getMicroPythonCode: () => {
      const delay = Math.round(1000 / fps);
      return `# 0x1306.dev · animation: ${name} · ${totalFrames} frames · ${delay}ms
import machine
import ssd1306
import time

i2c = machine.I2C(0, scl=machine.Pin(22), sda=machine.Pin(21)) # change to 0x3d if display not found
oled = ssd1306.SSD1306_I2C(128, 64, i2c)

def draw_frame(frame):
    oled.fill(0)
${microPythonDrawCalls}
    oled.show()

while True:
    for i in range(${totalFrames}):
        draw_frame(i)
        time.sleep_ms(${delay})
`;
    },
  };
};
const createRobotEyeAnimation = (
  id: string,
  name: string,
  tags: string[],
  fps: number,
  totalFrames: number,
  drawFrame: (
    ctx: CanvasRenderingContext2D,
    frameIndex: number,
    size: number,
  ) => void,
  arduinoDrawCalls: string,
  microPythonDrawCalls: string,
): OLEDAnimation => {
  return {
    id,
    name,
    category: "robot_eyes",
    tags,
    supportedSizes: [64],
    fps,
    totalFrames,
    byteCount: getByteCount(64),
    frames: {},
    drawFrame,
    getArduinoCode: () => {
      const delay = Math.round(1000 / fps);
      return `#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// 0x1306.dev · animation: ${name} · robot_eyes · ${delay}ms
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

void drawEyes(int lx, int ly, int lw, int lh, int lr,
              int rx, int ry, int rw, int rh, int rr) {
  display.fillRoundRect(lx - lw/2, ly - lh/2, lw, lh, lr, WHITE);
  display.fillRoundRect(rx - rw/2, ry - rh/2, rw, rh, rr, WHITE);
}

void drawFrame(int frame) {
  display.clearDisplay();
${arduinoDrawCalls}
  display.display();
}

void setup() {
  Wire.begin(21, 22);
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
}

void loop() {
  for (int i = 0; i < ${totalFrames}; i++) {
    drawFrame(i);
    delay(${delay});
  }
}`;
    },
    getMicroPythonCode: () => {
      const delay = Math.round(1000 / fps);
      return `# 0x1306.dev · animation: ${name} · robot_eyes · ${delay}ms
import machine, ssd1306, time

i2c = machine.I2C(0, scl=machine.Pin(22), sda=machine.Pin(21), freq=400000)
oled = ssd1306.SSD1306_I2C(128, 64, i2c)

def fill_round_rect(x, y, w, h, r, c=1):
    if r < 1: r = 1
    oled.fill_rect(x + r, y, w - 2*r, h, c)
    oled.fill_rect(x, y + r, r, h - 2*r, c)
    oled.fill_rect(x + w - r, y + r, r, h - 2*r, c)
    oled.ellipse(x + r,     y + r,     r, r, c, 0b0001)
    oled.ellipse(x + w - r, y + r,     r, r, c, 0b0010)
    oled.ellipse(x + r,     y + h - r, r, r, c, 0b0100)
    oled.ellipse(x + w - r, y + h - r, r, r, c, 0b1000)

def draw_eyes(lx, ly, lw, lh, lr, rx, ry, rw, rh, rr):
    fill_round_rect(lx - lw//2, ly - lh//2, lw, lh, lr)
    fill_round_rect(rx - rw//2, ry - rh//2, rw, rh, rr)

def draw_frame(frame):
    oled.fill(0)
${microPythonDrawCalls}
    oled.show()

while True:
    for i in range(${totalFrames}):
        draw_frame(i)
        time.sleep_ms(${delay})`;
    },
  };
};

const fillRoundRectCanvas = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) => {
  if (r < 1) r = 1;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.fill();
};

export const animations: OLEDAnimation[] = [
  createBaseAnimation(
    "happy_face",
    "happy_face",
    "emoji",
    ["smile", "happy", "blinking"],
    [64],
    10,
    4,
    (ctx, frame, size) => {
      const cx = size / 2;
      const cy = size / 2;
      const r = size * 0.4;

      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;

      // Face outline
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      // Eyes - draw after face
      const blink = frame === 3;
      if (blink) {
        ctx.fillRect(cx - size * 0.2, cy - size * 0.12, size * 0.14, 2);
        ctx.fillRect(cx + size * 0.06, cy - size * 0.12, size * 0.14, 2);
      } else {
        ctx.fillRect(
          cx - size * 0.2,
          cy - size * 0.17,
          size * 0.09,
          size * 0.09,
        );
        ctx.fillRect(
          cx + size * 0.11,
          cy - size * 0.17,
          size * 0.09,
          size * 0.09,
        );
      }

      // Smile - manual arc loop for visual parity with OLED
      ctx.beginPath();
      // approximate math loop with canvas arc for better performance in preview
      ctx.arc(cx, cy, size * 0.23, 0.2 * Math.PI, 0.8 * Math.PI);
      ctx.stroke();
    },
    `  int cx = 64;
  int cy = 32;
  // --- face outlines ---
  display.drawCircle(cx, cy, 26, WHITE);

  // --- eyes --- draw AFTER face, BEFORE smile mask ---
  if (frame == 3) { // blink
    display.drawFastHLine(cx - 13, cy - 8, 9, WHITE);
    display.drawFastHLine(cx + 4, cy - 8, 9, WHITE);
  } else { // open
    display.fillRect(cx - 13, cy - 11, 6, 6, WHITE);
    display.fillRect(cx + 7, cy - 11, 6, 6, WHITE);
  }

  // --- smile --- bottom arc 200 to 340 degrees ---
  for (int a = 200; a < 340; a += 8) {
    float rad = a * 0.0174533;
    int x = cx + 15 * cos(rad);
    int y = cy + 15 * sin(rad);
    display.drawPixel(x, y, WHITE);
  }`,
    `    cx, cy = 64, 32  # center of 128x64 display
    # --- face outline ---
    oled.ellipse(cx, cy, 26, 26, 1)

    # --- eyes --- draw AFTER face, BEFORE smile mask
    if frame == 3:  # blink frame
        oled.hline(cx - 13, cy - 8, 9, 1)
        oled.hline(cx + 4,  cy - 8, 9, 1)
    else:  # open eyes
        oled.fill_rect(cx - 13, cy - 11, 6, 6, 1)
        oled.fill_rect(cx + 7,  cy - 11, 6, 6, 1)

    # --- smile --- use pixel loop NOT ellipse+mask
    import math
    for a in range(200, 340, 8):
        rad = math.radians(a)
        x = int(cx + 15 * math.cos(rad))
        y = int(cy + 15 * math.sin(rad))
        if 0 <= x <= 127 and 0 <= y <= 63:
            oled.pixel(x, y, 1)`,
  ),

  createBaseAnimation(
    "sad_face",
    "sad_face",
    "emoji",
    ["sad", "frown", "negative"],
    [64],
    5,
    4,
    (ctx, frame, size) => {
      const cx = size / 2;
      const cy = size / 2;
      const r = size * 0.4;

      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;

      // Face outline
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();

      // Eyes
      ctx.fillRect(cx - size * 0.2, cy - size * 0.17, size * 0.09, size * 0.09);
      ctx.fillRect(
        cx + size * 0.11,
        cy - size * 0.17,
        size * 0.09,
        size * 0.09,
      );

      // Frown
      ctx.beginPath();
      ctx.arc(cx, cy + size * 0.25, size * 0.12, 1.2 * Math.PI, 1.8 * Math.PI);
      ctx.stroke();
    },
    `  int cx = 64;
  int cy = 32;
  // --- face outlines ---
  display.drawCircle(cx, cy, 26, WHITE);

  // --- eyes --- small filled squares ---
  display.fillRect(cx - 13, cy - 11, 6, 6, WHITE);
  display.fillRect(cx + 7, cy - 11, 6, 6, WHITE);

  // --- frown --- shifted down ---
  for (int a = 20; a <= 161; a += 8) {
    float rad = a * 0.0174533;
    int x = cx + 13 * cos(rad);
    int y = cy + 6 + 8 * sin(rad);  // +6 pushes it into lower half
    display.drawPixel(x, y, WHITE);
  }`,
    `    cx, cy = 64, 32
    # --- face outline ---
    oled.ellipse(cx, cy, 26, 26, 1)

    # --- eyes --- small filled squares
    oled.fill_rect(cx - 13, cy - 11, 6, 6, 1)
    oled.fill_rect(cx + 7,  cy - 11, 6, 6, 1)

    # --- frown --- top arc from 20 to 160
    import math
    for a in range(20, 161, 8):
        rad = math.radians(a)
        x = int(cx + 13 * math.cos(rad))
        y = int(cy + 6 + 8 * math.sin(rad))  # +6 pushes it into lower half
        if 0 <= x <= 127 and 0 <= y <= 63:
            oled.pixel(x, y, 1)`,
  ),

  createBaseAnimation(
    "spinner",
    "spinner",
    "loaders",
    ["loading", "wait", "spin"],
    [32, 48],
    15,
    8,
    (ctx, frame, size) => {
      const cx = size / 2;
      const cy = size / 2;
      const baseAng = (frame / 8) * Math.PI * 2;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = size * 0.1;
      ctx.lineCap = "round";

      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.35, baseAng, baseAng + Math.PI * 1.5);
      ctx.stroke();
    },
    `  int cx = 64;
  int cy = 32;
  int r = 14;
  float angleOffset = (frame / 8.0) * 2 * PI;
  
  // --- spinner arc ---
  for (float a = 0; a < 1.5 * PI; a += 0.05) {
     float angle = a + angleOffset;
     display.drawPixel(cx + r * cos(angle), cy + r * sin(angle), WHITE);
     display.drawPixel(cx + (r-1) * cos(angle), cy + (r-1) * sin(angle), WHITE);
  }`,
    `    import math
    cx, cy, r = 64, 32, 14
    offset = (frame / 8.0) * 2 * math.pi
    
    # --- spinner arc ---
    a = 0
    while a < 1.5 * math.pi:
        angle = a + offset
        oled.pixel(int(cx + r * math.cos(angle)), int(cy + r * math.sin(angle)), 1)
        oled.pixel(int(cx + (r-1) * math.cos(angle)), int(cy + (r-1) * math.sin(angle)), 1)
        a += 0.05`,
  ),

  createBaseAnimation(
    "progress_bar",
    "progress_bar",
    "loaders",
    ["loading", "bar", "progress"],
    [64],
    8,
    8,
    (ctx, frame, size) => {
      const w = size * 0.8;
      const h = size * 0.15;
      const x = (size - w) / 2;
      const y = (size - h) / 2;

      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);

      const fillProgress = (frame / 7) * (w - 4);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x + 2, y + 2, fillProgress, h - 4);
    },
    `  // --- progress bar ---
  display.drawRect(14, 24, 100, 16, WHITE);
  display.fillRect(16, 26, (frame * 100) / 7 - 4, 12, WHITE);
  
  display.setCursor(54, 45);
  display.print(String((frame * 100) / 7) + "%");`,
    `    # --- progress bar ---
    oled.rect(14, 24, 100, 16, 1)
    oled.fill_rect(16, 26, int((frame * 100) / 7 - 4), 12, 1)
    
    oled.text(str(int((frame * 100) / 7)) + "%", 54, 45, 1)`,
  ),

  createBaseAnimation(
    "wifi_connecting",
    "wifi_connecting",
    "icons",
    ["wifi", "network", "connect"],
    [32, 48],
    4,
    4,
    (ctx, frame, size) => {
      const cx = size / 2;
      const cy = size * 0.7;
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = size * 0.08;
      ctx.lineCap = "round";

      if (frame >= 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
      if (frame >= 1) {
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.2, 1.25 * Math.PI, 1.75 * Math.PI);
        ctx.stroke();
      }
      if (frame >= 2) {
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.4, 1.25 * Math.PI, 1.75 * Math.PI);
        ctx.stroke();
      }
      if (frame >= 3) {
        ctx.beginPath();
        ctx.arc(cx, cy, size * 0.6, 1.25 * Math.PI, 1.75 * Math.PI);
        ctx.stroke();
      }
    },
    `  int cx = 64;
  int cy = 48;

  // --- wifi dot ---
  display.fillCircle(cx, cy, 3, WHITE);

  // --- wifi arcs ---
  if (frame >= 1) display.drawCircle(cx, cy, 12, WHITE);
  if (frame >= 2) display.drawCircle(cx, cy, 25, WHITE);
  if (frame >= 3) display.drawCircle(cx, cy, 38, WHITE);
  
  // mask out outside bounds to create a 90 deg wedge
  display.fillRect(0, cy + 1, 128, 64, BLACK);
  display.fillRect(0, 0, 24, cy, BLACK);
  display.fillRect(104, 0, 24, cy, BLACK);
  
  // erase specific side clipping
  display.fillTriangle(0, cy, 38, cy, 0, cy-38, BLACK);
  display.fillTriangle(128, cy, 90, cy, 128, cy-38, BLACK);`,
    `    cx, cy = 64, 48
    # --- wifi dot ---
    oled.fill_rect(cx - 2, cy - 2, 5, 5, 1)

    # --- wifi arcs ---
    if frame >= 1: oled.ellipse(cx, cy, 12, 12, 1)
    if frame >= 2: oled.ellipse(cx, cy, 25, 25, 1)
    if frame >= 3: oled.ellipse(cx, cy, 38, 38, 1)

    # mask out outside bounds
    oled.fill_rect(0, cy + 1, 128, 64, 0)
    
    # manual slope masking for wedge
    for i in range(48):
        oled.hline(0, cy - i, 64 - i, 0)
        oled.hline(64 + i, cy - i, 64, 0)`,
  ),

  createBaseAnimation(
    "diya_flame",
    "diya_flame",
    "indian",
    ["diya", "lamp", "festival"],
    [48, 64],
    12,
    6,
    (ctx, frame, size) => {
      const cx = size / 2;
      const cy = size * 0.6;
      ctx.fillStyle = "#ffffff";

      // Base
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.3, 0, Math.PI);
      ctx.closePath();
      ctx.fill();

      // Flame
      const isFlicker = frame % 3 === 0;
      const fx = cx + (isFlicker ? size * 0.02 : 0);
      const fy = cy - size * 0.15 + (isFlicker ? size * 0.02 : 0);

      ctx.beginPath();
      ctx.moveTo(fx, fy - size * 0.25);
      ctx.quadraticCurveTo(
        fx + size * 0.1,
        fy - size * 0.1,
        fx + size * 0.1,
        fy,
      );
      ctx.quadraticCurveTo(
        fx + size * 0.1,
        fy + size * 0.1,
        fx,
        fy + size * 0.1,
      );
      ctx.quadraticCurveTo(
        fx - size * 0.1,
        fy + size * 0.1,
        fx - size * 0.1,
        fy,
      );
      ctx.quadraticCurveTo(
        fx - size * 0.1,
        fy - size * 0.1,
        fx,
        fy - size * 0.25,
      );
      ctx.fill();
    },
    `  int cx = 64;
  int cy = 40;
  
  // --- base ---
  display.drawFastHLine(cx - 15, cy + 12, 30, WHITE);
  display.drawFastHLine(cx - 10, cy + 14, 20, WHITE);

  // --- bowl ---
  display.fillRect(cx - 20, cy, 40, 6, WHITE);
  display.fillCircle(cx, cy + 6, 15, WHITE); // wait till mask
  display.fillRect(cx - 20, cy - 15, 40, 15, BLACK); // mask the top half of circle

  // --- wick ---
  display.drawFastVLine(cx, cy - 6, 6, WHITE);

  // --- flame ---
  int8_t flameX[] = { 0,  1, -1,  2, -2,  1};
  int8_t flameY[] = {-8, -9, -7, -8, -9, -7};
  int fx = cx + flameX[frame];
  int fy = cy + flameY[frame];
  
  display.fillCircle(fx, fy - 2, 6, WHITE);
  display.fillTriangle(fx - 6, fy - 2, fx + 6, fy - 2, fx, fy - 14, WHITE);`,
    `    cx, cy = 64, 40
    # --- base ---
    oled.hline(cx - 15, cy + 12, 30, 1)
    oled.hline(cx - 10, cy + 14, 20, 1)

    # --- bowl ---
    oled.fill_rect(cx - 20, cy, 40, 6, 1)
    oled.ellipse(cx, cy + 6, 15, 15, 1, True, 12) # masks bottom half usually

    # --- wick ---
    oled.vline(cx, cy - 6, 6, 1)

    # --- flame ---
    flame_x = [0, 1, -1, 2, -2, 1]
    flame_y = [-8, -9, -7, -8, -9, -7]
    fx = cx + flame_x[frame]
    fy = cy + flame_y[frame]
    
    oled.ellipse(fx, fy - 2, 6, 6, 1, True)
    for i in range(12):
        oled.hline(fx - i//2, fy - 14 + i, i, 1)`,
  ),

  createBaseAnimation(
    "cricket_bat",
    "cricket_bat",
    "indian",
    ["cricket", "sport", "bat", "swing"],
    [64],
    12,
    8,
    (ctx, frame, size) => {
      const cx = size * 0.4;
      const cy = size * 0.7;
      ctx.fillStyle = "#ffffff";

      // Ball
      const ballX = cx - frame * size * 0.08 + size * 0.3;
      const ballY = cy + size * 0.1 - frame * size * 0.05;
      if (frame > 2) {
        ctx.beginPath();
        ctx.arc(ballX, ballY, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(ballX - 6, ballY - 1, 4, 1);
      }

      ctx.save();
      ctx.translate(cx, cy);
      // Swing logic
      const rotation =
        frame < 4
          ? -Math.PI / 4 + frame * 0.15
          : -Math.PI / 4 + 3 * 0.15 - (frame - 3) * 0.3;
      ctx.rotate(rotation);

      // Handle
      ctx.fillRect(-2, -size * 0.4, 4, size * 0.15);
      // Blade
      ctx.beginPath();
      ctx.moveTo(-4, -size * 0.25);
      ctx.lineTo(4, -size * 0.25);
      ctx.lineTo(5, 0);
      ctx.quadraticCurveTo(0, 5, -5, 0);
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    },
    `  int cx = 50;
  int cy = 40;

  // --- ball ---
  int8_t ballX[] = {70, 65, 60, 50, 40, 20, 0, -20};
  int8_t ballY[] = {45, 45, 45, 45, 40, 30, 20, 10};
  if (frame > 2) {
    display.fillCircle(ballX[frame], ballY[frame], 2, WHITE);
    display.drawFastHLine(ballX[frame] - 4, ballY[frame], 4, WHITE);
  }

  // --- bat swing ---
  int8_t hx[] = {cx-15, cx-10, cx-5,  cx,   cx+5, cx+10, cx+5,  cx};
  int8_t hy[] = {cy-20, cy-15, cy-10, cy-5, cy,   cy+5,  cy+15, cy+20};
  int8_t tx[] = {cx-25, cx-10, cx+10, cx+25, cx+30,cx+20, cx+5,  cx-10};
  int8_t ty[] = {cy-40, cy-35, cy-25, cy-15, cy,   cy+15, cy+30, cy+35};
  
  display.drawLine(cx, cy, hx[frame], hy[frame], WHITE); // handle
  for(int offset = -3; offset <= 3; offset++) {
    display.drawLine(hx[frame] + offset, hy[frame], tx[frame] + offset, ty[frame], WHITE);
  }`,
    `    cx, cy = 50, 40

    # --- ball ---
    ball_x = [70, 65, 60, 50, 40, 20, 0, -20]
    ball_y = [45, 45, 45, 45, 40, 30, 20, 10]
    if frame > 2:
        bx = ball_x[frame]
        by = ball_y[frame]
        oled.fill_rect(bx - 2, by - 2, 4, 4, 1)
        oled.hline(bx - 4, by, 4, 1)

    # --- bat swing ---
    hx = [cx-15, cx-10, cx-5,  cx,   cx+5, cx+10, cx+5,  cx]
    hy = [cy-20, cy-15, cy-10, cy-5, cy,   cy+5,  cy+15, cy+20]
    tx = [cx-25, cx-10, cx+10, cx+25, cx+30,cx+20, cx+5,  cx-10]
    ty = [cy-40, cy-35, cy-25, cy-15, cy,   cy+15, cy+30, cy+35]
    
    oled.line(cx, cy, hx[frame], hy[frame], 1)
    for offset in range(-3, 4):
        oled.line(hx[frame] + offset, hy[frame], tx[frame] + offset, ty[frame], 1)`,
  ),

  createBaseAnimation(
    "chai_cup",
    "chai_cup",
    "indian",
    ["tea", "drink", "cup"],
    [48],
    8,
    4,
    (ctx, frame, size) => {
      const cx = size / 2;
      const cy = size * 0.65;
      ctx.strokeStyle = "#ffffff";
      ctx.fillStyle = "#ffffff";
      ctx.lineWidth = 1;

      // Steam wisps
      const steamYArray = [
        [-8, -10, -8],
        [-10, -8, -10],
        [-8, -10, -10],
        [-10, -8, -8],
        [-8, -8, -10],
        [-10, -10, -8],
      ];
      const sy = steamYArray[frame % 6];
      ctx.fillRect(cx - 10, cy - 18 + sy[0], 2, 8);
      ctx.fillRect(cx, cy - 18 + sy[1], 2, 8);
      ctx.fillRect(cx + 10, cy - 18 + sy[2], 2, 8);

      // Cup Body (Trapezoid)
      const cupTopW = 28;
      const cupBotW = 20;
      const cupTopY = cy - 10;
      const cupBotY = cy + 10;
      ctx.beginPath();
      ctx.moveTo(cx - cupTopW / 2, cupTopY);
      ctx.lineTo(cx + cupTopW / 2, cupTopY);
      ctx.lineTo(cx + cupBotW / 2, cupBotY);
      ctx.lineTo(cx - cupBotW / 2, cupBotY);
      ctx.closePath();
      ctx.stroke();

      // Handle
      ctx.beginPath();
      ctx.arc(cx + cupTopW / 2 + 5, cy, 6.5, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();

      // Saucer line
      ctx.beginPath();
      ctx.moveTo(cx - 22, cupBotY + 3);
      ctx.lineTo(cx + 22, cupBotY + 3);
      ctx.stroke();
    },
    `  int cx = 64;
  int cy = 42;
  // --- steam wisps ---
  int sy[6][3] = {{-8,-10,-8}, {-10,-8,-10}, {-8,-10,-10}, {-10,-8,-8}, {-8,-8,-10}, {-10,-10,-8}};
  display.drawFastVLine(cx - 10, cy - 18 + sy[frame%6][0], 8, WHITE);
  display.drawFastVLine(cx,      cy - 18 + sy[frame%6][1], 8, WHITE);
  display.drawFastVLine(cx + 10, cy - 18 + sy[frame%6][2], 8, WHITE);

  // --- cup body ---
  int cup_top_w = 28; int cup_bot_w = 20;
  int cup_top_y = cy - 10; int cup_bot_y = cy + 10;
  display.drawFastHLine(cx - 14, cup_top_y, cup_top_w, WHITE);
  display.drawFastHLine(cx - 10, cup_bot_y, cup_bot_w, WHITE);
  display.drawLine(cx - 14, cup_top_y, cx - 10, cup_bot_y, WHITE);
  display.drawLine(cx + 14, cup_top_y, cx + 10, cup_bot_y, WHITE);

  // --- handle ---
  display.drawCircle(cx + 19, cy, 8, WHITE);
  display.fillRect(cx + 13, cy - 9, 6, 18, BLACK);

  // --- saucer ---
  display.drawFastHLine(cx - 22, cup_bot_y + 3, 44, WHITE);`,
    `    # steam positions
    steam_y = [[-8, -10, -8], [-10, -8, -10], [-8, -10, -10], [-10, -8, -8], [-8, -8, -10], [-10, -10, -8]]
    sy = steam_y[frame % 6]
    cx, cy = 64, 42
    # --- steam wisps ---
    oled.vline(cx - 10, cy - 18 + sy[0], 8, 1)
    oled.vline(cx,      cy - 18 + sy[1], 8, 1)
    oled.vline(cx + 10, cy - 18 + sy[2], 8, 1)
    # --- cup body ---
    cup_top_w, cup_bot_w, cup_top_y, cup_bot_y = 28, 20, cy - 10, cy + 10
    oled.hline(cx - cup_top_w // 2, cup_top_y, cup_top_w, 1)
    oled.hline(cx - cup_bot_w // 2, cup_bot_y, cup_bot_w, 1)
    oled.line(cx - cup_top_w // 2, cup_top_y, cx - cup_bot_w // 2, cup_bot_y, 1)
    oled.line(cx + cup_top_w // 2, cup_top_y, cx + cup_bot_w // 2, cup_bot_y, 1)
    # --- handle ---
    oled.ellipse(cx + cup_top_w // 2 + 5, cy, 5, 8, 1)
    oled.fill_rect(cx + cup_top_w // 2 + 5 - 6, cy - 9, 6, 18, 0)
    # --- saucer ---
    oled.hline(cx - 22, cup_bot_y + 3, 44, 1)`,
  ),

  createBaseAnimation(
    "auto_rickshaw",
    "auto_rickshaw",
    "indian",
    ["rickshaw", "tuk_tuk", "vehicle"],
    [64],
    10,
    6,
    (ctx, frame, size) => {
      const cx = size / 2;
      const cy = size / 2;
      ctx.strokeStyle = "#ffffff";
      ctx.fillStyle = "#ffffff";
      ctx.lineWidth = 1;

      // Chassis
      ctx.beginPath();
      ctx.moveTo(cx - 15, cy + 10);
      ctx.lineTo(cx + 10, cy + 10);
      ctx.lineTo(cx + 15, cy);
      ctx.lineTo(cx + 8, cy - 12);
      ctx.lineTo(cx - 12, cy - 12);
      ctx.closePath();
      ctx.stroke();

      // Window / Roof
      ctx.fillRect(cx - 15, cy - 12, 23, 2);
      ctx.beginPath();
      ctx.moveTo(cx - 10, cy - 10);
      ctx.lineTo(cx + 5, cy - 10);
      ctx.lineTo(cx + 12, cy);
      ctx.lineTo(cx + 8, cy);
      ctx.lineTo(cx + 2, cy - 8);
      ctx.lineTo(cx - 10, cy - 8);
      ctx.closePath();
      ctx.stroke();

      // Wheels
      const tireAnim = frame % 2 === 0;
      const drive = cx - 10;
      const front = cx + 12;
      ctx.beginPath();
      ctx.arc(drive, cy + 10, 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(front, cy + 10, 3, 0, Math.PI * 2);
      ctx.stroke();
      if (tireAnim) {
        ctx.fillRect(drive - 1, cy + 9, 2, 2);
        ctx.fillRect(front - 1, cy + 9, 2, 2);
      }
    },
    `  int cx = 64;
  int cy = 32;

  // --- chassis ---
  display.drawLine(cx - 15, cy + 10, cx + 10, cy + 10, WHITE);
  display.drawLine(cx + 10, cy + 10, cx + 15, cy, WHITE);
  display.drawLine(cx + 15, cy, cx + 8, cy - 12, WHITE);
  display.drawLine(cx + 8, cy - 12, cx - 12, cy - 12, WHITE);
  display.drawLine(cx - 12, cy - 12, cx - 15, cy + 10, WHITE);

  // --- roof and window ---
  display.fillRect(cx - 15, cy - 12, 23, 2, WHITE);
  display.drawLine(cx - 10, cy - 10, cx + 5, cy - 10, WHITE);
  display.drawLine(cx + 5, cy - 10, cx + 12, cy, WHITE);
  display.drawLine(cx + 12, cy, cx + 8, cy, WHITE);
  display.drawLine(cx + 8, cy, cx + 2, cy - 8, WHITE);
  display.drawLine(cx + 2, cy - 8, cx - 10, cy - 8, WHITE);
  display.drawLine(cx - 10, cy - 8, cx - 10, cy - 10, WHITE);

  // --- wheels ---
  int driveX = cx - 10;
  int frontX = cx + 12;
  int wY = cy + 10;
  display.drawCircle(driveX, wY, 4, WHITE);
  display.drawCircle(frontX, wY, 3, WHITE);

  // --- spokes ---
  int8_t spokeAngles[] = {0, 30, 60, 90, 120, 150};
  float angle = spokeAngles[frame % 6] * (PI / 180.0);
  
  display.drawLine(driveX, wY, driveX + 4 * cos(angle), wY + 4 * sin(angle), WHITE);
  display.drawLine(driveX, wY, driveX - 4 * cos(angle), wY - 4 * sin(angle), WHITE);
  
  display.drawLine(frontX, wY, frontX + 3 * cos(angle), wY + 3 * sin(angle), WHITE);
  display.drawLine(frontX, wY, frontX - 3 * cos(angle), wY - 3 * sin(angle), WHITE);`,
    `    import math
    cx, cy = 64, 32

    # --- chassis ---
    oled.line(cx - 15, cy + 10, cx + 10, cy + 10, 1)
    oled.line(cx + 10, cy + 10, cx + 15, cy, 1)
    oled.line(cx + 15, cy, cx + 8, cy - 12, 1)
    oled.line(cx + 8, cy - 12, cx - 12, cy - 12, 1)
    oled.line(cx - 12, cy - 12, cx - 15, cy + 10, 1)

    # --- roof and window ---
    oled.fill_rect(cx - 15, cy - 12, 23, 2, 1)
    oled.line(cx - 10, cy - 10, cx + 5, cy - 10, 1)
    oled.line(cx + 5, cy - 10, cx + 12, cy, 1)
    oled.line(cx + 12, cy, cx + 8, cy, 1)
    oled.line(cx + 8, cy, cx + 2, cy - 8, 1)
    oled.line(cx + 2, cy - 8, cx - 10, cy - 8, 1)
    oled.line(cx - 10, cy - 8, cx - 10, cy - 10, 1)

    # --- wheels ---
    driveX = cx - 10
    frontX = cx + 12
    wY = cy + 10
    oled.ellipse(driveX, wY, 4, 4, 1)
    oled.ellipse(frontX, wY, 3, 3, 1)

    # --- spokes ---
    spoke_angles = [0, 30, 60, 90, 120, 150]
    angle = spoke_angles[frame % 6] * (math.pi / 180.0)
    
    oled.line(driveX, wY, int(driveX + 4 * math.cos(angle)), int(wY + 4 * math.sin(angle)), 1)
    oled.line(driveX, wY, int(driveX - 4 * math.cos(angle)), int(wY - 4 * math.sin(angle)), 1)
    oled.line(frontX, wY, int(frontX + 3 * math.cos(angle)), int(wY + 3 * math.sin(angle)), 1)
    oled.line(frontX, wY, int(frontX - 3 * math.cos(angle)), int(wY - 3 * math.sin(angle)), 1)`,
  ),

  createBaseAnimation(
    "rupee_pulse",
    "rupee_pulse",
    "indian",
    ["money", "rupee", "pulse"],
    [48],
    12,
    6,
    (ctx, frame, size) => {
      const cx = size / 2;
      const cy = size / 2;

      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#ffffff";

      // ₹ Symbol
      ctx.font = `${size * 0.4}px JetBrains Mono`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("₹", cx, cy);

      // Pulse
      const r = (frame / 6) * (size * 0.4);
      ctx.globalAlpha = 1 - frame / 6;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(1, r), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    },
    `  int cx = 64;
  int cy = 32;

  // --- rupee symbol ---
  display.drawFastHLine(cx - 5, cy - 6, 10, WHITE);
  display.drawFastHLine(cx - 5, cy - 3, 8, WHITE);
  display.drawFastVLine(cx - 3, cy - 6, 6, WHITE);
  
  display.drawPixel(cx + 3, cy - 5, WHITE);
  display.drawPixel(cx + 4, cy - 4, WHITE);
  display.drawLine(cx - 3, cy - 1, cx + 5, cy + 6, WHITE);

  // --- pulse ---
  int r = frame * 4;
  if (r > 1) {
    if (frame % 2 == 0) {
      display.drawCircle(cx, cy, r, WHITE);
    } else {
      for(int i = 0; i < 360; i += 20) {
        display.drawPixel(cx + r * cos(i * PI / 180.0), cy + r * sin(i * PI / 180.0), WHITE);
      }
    }
  }`,
    `    import math
    cx, cy = 64, 32

    # --- rupee symbol ---
    oled.hline(cx - 5, cy - 6, 10, 1)
    oled.hline(cx - 5, cy - 3, 8, 1)
    oled.vline(cx - 3, cy - 6, 6, 1)
    oled.pixel(cx + 3, cy - 5, 1)
    oled.pixel(cx + 4, cy - 4, 1)
    oled.line(cx - 3, cy - 1, cx + 5, cy + 6, 1)

    # --- pulse ---
    r = frame * 4
    if r > 1:
        if frame % 2 == 0:
            oled.ellipse(cx, cy, r, r, 1)
        else:
            for i in range(0, 360, 20):
                oled.pixel(int(cx + r*math.cos(i*math.pi/180)), int(cy + r*math.sin(i*math.pi/180)), 1)`,
  ),

  createBaseAnimation(
    "train_moving",
    "train_moving",
    "indian",
    ["train", "vehicle", "travel"],
    [64],
    15,
    8,
    (ctx, frame, size) => {
      const cx = size / 2;
      const cy = size / 2 + size * 0.1;

      // Motion offset mapping
      const offset = -(frame * size * 0.05) % (size * 0.5);

      ctx.save();
      ctx.translate(offset, 0);

      ctx.strokeStyle = "#ffffff";
      ctx.fillStyle = "#ffffff";
      ctx.lineWidth = 1;

      // Track
      ctx.beginPath();
      ctx.moveTo(0, cy + 6);
      ctx.lineTo(size * 1.5, cy + 6);
      ctx.stroke();

      for (let i = 0; i < 3; i++) {
        const carX = cx + i * size * 0.4;
        // Box
        ctx.fillRect(carX, cy - 15, size * 0.35, 18);

        ctx.fillStyle = "#000000";
        ctx.fillRect(carX + 5, cy - 10, 6, 6);
        ctx.fillRect(carX + 15, cy - 10, 6, 6);

        ctx.fillStyle = "#ffffff";
        // Connectors
        if (i < 2) {
          ctx.fillRect(carX + size * 0.35, cy - 2, size * 0.05, 2);
        }

        // Wheels
        ctx.beginPath();
        ctx.arc(carX + 5, cy + 3, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(carX + size * 0.35 - 5, cy + 3, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    },
    `  int cx = 64;
  int cy = 38;
  
  // Motion offset mapping
  int offset = -((int)(frame * 3.2)) % 32;

  // --- track ---
  display.drawFastHLine(0, cy + 6, 128, WHITE);

  for (int i = 0; i < 3; i++) {
    int carX = cx + (i * 25) + offset;
    
    // box
    display.fillRect(carX, cy - 15, 22, 18, WHITE);
    display.fillRect(carX + 5, cy - 10, 6, 6, BLACK);
    display.fillRect(carX + 15, cy - 10, 6, 6, BLACK);
    
    // connectors
    if (i < 2) {
      display.fillRect(carX + 22, cy - 2, 3, 2, WHITE);
    }

    // wheels
    display.fillCircle(carX + 5, cy + 3, 2, WHITE);
    display.fillCircle(carX + 17, cy + 3, 2, WHITE);
  }`,
    `    cx, cy = 64, 38
    
    # Motion offset mapping
    offset = -int(frame * 3.2) % 32

    # --- track ---
    oled.hline(0, cy + 6, 128, 1)

    for i in range(3):
        car_x = cx + (i * 25) + offset
        
        # box
        oled.fill_rect(car_x, cy - 15, 22, 18, 1)
        oled.fill_rect(car_x + 5, cy - 10, 6, 6, 0)
        oled.fill_rect(car_x + 15, cy - 10, 6, 6, 0)
        
        # connectors
        if i < 2:
            oled.fill_rect(car_x + 22, cy - 2, 3, 2, 1)

        # wheels
        oled.ellipse(car_x + 5, cy + 3, 2, 2, 1, True)
        oled.ellipse(car_x + 17, cy + 3, 2, 2, 1, True)`,
  ),

  createBaseAnimation(
    "diwali_burst",
    "diwali_burst",
    "festival",
    ["firework", "diwali", "spark"],
    [64],
    12,
    8,
    (ctx, frame, size) => {
      const cx = size / 2;
      const cy = size / 2;

      ctx.strokeStyle = "#ffffff";
      const r = (frame / 8) * (size * 0.4);

      if (frame > 0) {
        ctx.lineWidth = Math.max(1, 3 - frame * 0.3);
        for (let i = 0; i < 8; i++) {
          const ang = (i * Math.PI) / 4;
          ctx.beginPath();
          ctx.moveTo(
            cx + Math.cos(ang) * (r * 0.5),
            cy + Math.sin(ang) * (r * 0.5),
          );
          ctx.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
          ctx.stroke();
        }
      }
    },
    `  int cx = 64;
  int cy = 32;

  if (frame > 0) {
    int length = frame * 4 + 4;
    for (int i = 0; i < 12; i++) {
      float ang = (i * 30) * PI / 180.0;
      float x0 = cx + (length * 0.5) * cos(ang);
      float y0 = cy + (length * 0.5) * sin(ang);
      float x1 = cx + length * cos(ang);
      float y1 = cy + length * sin(ang);
      
      display.drawLine(x0, y0, x1, y1, WHITE);
      display.drawPixel(x1 + 2 * cos(ang), y1 + 2 * sin(ang), WHITE); // sparkle
    }
  }`,
    `    import math
    cx, cy = 64, 32

    if frame > 0:
        length = frame * 4 + 4
        for i in range(12):
            ang = (i * 30) * math.pi / 180.0
            x0 = cx + (length * 0.5) * math.cos(ang)
            y0 = cy + (length * 0.5) * math.sin(ang)
            x1 = cx + length * math.cos(ang)
            y1 = cy + length * math.sin(ang)
            
            oled.line(int(x0), int(y0), int(x1), int(y1), 1)
            oled.pixel(int(x1 + 2 * math.cos(ang)), int(y1 + 2 * math.sin(ang)), 1)`,
  ),

  createBaseAnimation(
    "flag_wave",
    "flag_wave",
    "festival",
    ["flag", "india", "tricolor", "wave"],
    [64],
    10,
    6,
    (ctx, frame) => {
      const waveArray = [0, 1, 2, 3, 2, 1];
      const w = waveArray[frame % 6];
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;

      // Pole
      ctx.fillRect(20, 4, 2, 56);

      // Flag Body
      const flagX = 21;
      const flagW = 60 + w;
      const flagYTop = 8;

      ctx.fillRect(flagX, flagYTop, flagW, 10);
      ctx.strokeRect(flagX, flagYTop + 10, flagW, 10);
      ctx.fillRect(flagX, flagYTop + 20, flagW, 10);

      // Chakra dot
      ctx.beginPath();
      ctx.arc(flagX + flagW / 2, flagYTop + 15, 3, 0, Math.PI * 2);
      ctx.fill();
    },
    `  int wave[] = {0, 1, 2, 3, 2, 1};
  int w = wave[frame % 6];
  int pole_x = 20;
  display.drawFastVLine(pole_x, 4, 56, WHITE);
  int flag_x = 21;
  int flag_w = 60 + w;
  int flag_y_top = 8;
  display.fillRect(flag_x, flag_y_top, flag_w, 10, WHITE);
  display.fillRect(flag_x, flag_y_top + 10, flag_w, 10, BLACK);
  display.drawFastHLine(flag_x, flag_y_top + 10, flag_w, WHITE);
  display.drawFastHLine(flag_x, flag_y_top + 19, flag_w, WHITE);
  display.fillRect(flag_x, flag_y_top + 20, flag_w, 10, WHITE);
  display.drawCircle(flag_x + flag_w / 2, flag_y_top + 15, 4, WHITE);`,
    `    wave = [0, 1, 2, 3, 2, 1]
    w = wave[frame % 6]
    pole_x = 20
    oled.vline(pole_x, 4, 56, 1)
    flag_x = 21
    flag_w = 60 + w
    flag_y_top = 8
    # band 1 - top
    oled.fill_rect(flag_x, flag_y_top,      flag_w, 10, 1)
    # band 2 - middle
    oled.fill_rect(flag_x, flag_y_top + 10, flag_w, 10, 0)
    oled.hline(flag_x, flag_y_top + 10, flag_w, 1)
    oled.hline(flag_x, flag_y_top + 19, flag_w, 1)
    # band 3 - bottom
    oled.fill_rect(flag_x, flag_y_top + 20, flag_w, 10, 1)
    # chakra
    oled.ellipse(flag_x + flag_w // 2, flag_y_top + 15, 4, 4, 1)`,
  ),
  createRobotEyeAnimation(
    "eyes_default",
    "eyes_default",
    ["robot", "eyes", "blink", "idle"],
    10,
    4,
    (ctx, frame) => {
      const h = [28, 28, 2, 28][frame % 4];
      const r = frame === 2 ? 1 : 8;
      fillRoundRectCanvas(ctx, 32 - 19, 32 - h / 2, 38, h, r);
      fillRoundRectCanvas(ctx, 96 - 19, 32 - h / 2, 38, h, r);
    },
    `    int h[] = {28, 28, 2, 28};
    int r = (frame == 2) ? 1 : 8;
    drawEyes(32, 32, 38, h[frame], r, 96, 32, 38, h[frame], r);`,
    `    h = [28, 28, 2, 28][frame % 4]
    r = 1 if frame == 2 else 8
    draw_eyes(32, 32, 38, h, r, 96, 32, 38, h, r)`,
  ),
  createRobotEyeAnimation(
    "eyes_happy",
    "eyes_happy",
    ["robot", "eyes", "happy", "squish"],
    10,
    4,
    (ctx, frame) => {
      const h = [28, 24, 18, 24][frame % 4];
      const y = [32, 34, 37, 34][frame % 4];
      const r = 8;
      const drawHappyEye = (cx: number) => {
        fillRoundRectCanvas(ctx, cx - 19, y - h / 2, 38, h, r);
        const topFlatten = 28 - h;
        if (topFlatten > 0) {
          ctx.save();
          ctx.globalCompositeOperation = "destination-out";
          ctx.fillRect(cx - 19, y - h / 2, 38, topFlatten / 2);
          ctx.restore();
        }
      };
      drawHappyEye(32);
      drawHappyEye(96);
    },
    `    int h[] = {28, 24, 18, 24};
    int y[] = {32, 34, 37, 34};
    drawEyes(32, y[frame], 38, h[frame], 8, 96, y[frame], 38, h[frame], 8);
    if (h[frame] < 28) {
      int flatten = (28 - h[frame]) / 2;
      display.fillRect(32-19, y[frame]-h[frame]/2, 38, flatten, BLACK);
      display.fillRect(96-19, y[frame]-h[frame]/2, 38, flatten, BLACK);
    }`,
    `    h = [28, 24, 18, 24][frame % 4]
    y = [32, 34, 37, 34][frame % 4]
    draw_eyes(32, y, 38, h, 8, 96, y, 38, h, 8)
    if h < 28:
       flatten = (28 - h) // 2
       oled.fill_rect(32-19, y-h//2, 38, flatten, 0)
       oled.fill_rect(96-19, y-h//2, 38, flatten, 0)`,
  ),
  createRobotEyeAnimation(
    "eyes_angry",
    "eyes_angry",
    ["robot", "eyes", "angry", "mean"],
    10,
    4,
    (ctx, frame) => {
      const th = [0, 6, 12, 6][frame % 4];
      const drawAngryEye = (cx: number, isRight: boolean) => {
        fillRoundRectCanvas(ctx, cx - 19, 32 - 14, 38, 28, 8);
        if (th > 0) {
          ctx.save();
          ctx.globalCompositeOperation = "destination-out";
          if (!isRight) {
            // left eye inner top corner (right side)
            ctx.fillRect(cx, 32 - 14, 19, th);
          } else {
            // right eye inner top corner (left side)
            ctx.fillRect(cx - 19, 32 - 14, 19, th);
          }
          ctx.restore();
        }
      };
      drawAngryEye(32, false);
      drawAngryEye(96, true);
    },
    `    int th[] = {0, 6, 12, 6};
    drawEyes(32, 32, 38, 28, 8, 96, 32, 38, 28, 8);
    if (th[frame] > 0) {
      display.fillRect(32, 32-14, 19, th[frame], BLACK);
      display.fillRect(96-19, 32-14, 19, th[frame], BLACK);
    }`,
    `    th = [0, 6, 12, 6][frame % 4]
    draw_eyes(32, 32, 38, 28, 8, 96, 32, 38, 28, 8)
    if th > 0:
        oled.fill_rect(32, 32-14, 19, th, 0)
        oled.fill_rect(96-19, 32-14, 19, th, 0)`,
  ),
  createRobotEyeAnimation(
    "eyes_sleepy",
    "eyes_sleepy",
    ["robot", "eyes", "sleepy", "tired"],
    8,
    6,
    (ctx, frame) => {
      const h = [28, 22, 14, 8, 14, 22][frame % 6];
      const drawSleepyEye = (cx: number) => {
        fillRoundRectCanvas(ctx, cx - 19, 32 - 14 + (28 - h), 38, h, 4);
        // eyelid
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillRect(cx - 19, 32 - 14, 38, 10);
        ctx.restore();
      };
      drawSleepyEye(32);
      drawSleepyEye(96);
    },
    `    int heights[] = {28, 22, 14, 8, 14, 22};
    int h = heights[frame % 6];
    drawEyes(32, 32 + (28-h)/2, 38, h, 4, 96, 32 + (28-h)/2, 38, h, 4);
    display.fillRect(32-19, 32-14, 38, 10, BLACK);
    display.fillRect(96-19, 32-14, 38, 10, BLACK);`,
    `    heights = [28, 22, 14, 8, 14, 22]
    h = heights[frame % 6]
    draw_eyes(32, 32 + (28-h)//2, 38, h, 4, 96, 32 + (28-h)//2, 38, h, 4)
    oled.fill_rect(32-19, 32-14, 38, 10, 0)
    oled.fill_rect(96-19, 32-14, 38, 10, 0)`,
  ),
  createRobotEyeAnimation(
    "eyes_suspicious",
    "eyes_suspicious",
    ["robot", "eyes", "suspicious", "squint"],
    10,
    4,
    (ctx, frame) => {
      const hLeft = [28, 20, 12, 20][frame % 4];
      fillRoundRectCanvas(ctx, 32 - 19, 32 - hLeft / 2, 38, hLeft, 8);
      fillRoundRectCanvas(ctx, 96 - 19, 32 - 14, 38, 28, 8);
    },
    `    int hLeft[] = {28, 20, 12, 20};
    drawEyes(32, 32, 38, hLeft[frame], 8, 96, 32, 38, 28, 8);`,
    `    h_left = [28, 20, 12, 20][frame % 4]
    draw_eyes(32, 32, 38, h_left, 8, 96, 32, 38, 28, 8)`,
  ),
  createRobotEyeAnimation(
    "eyes_wide",
    "eyes_wide",
    ["robot", "eyes", "wide", "surprise"],
    10,
    4,
    (ctx, frame) => {
      const dw = [0, 4, 8, 4][frame % 4];
      const dh = [0, 4, 8, 4][frame % 4];
      const r = 8 + dw / 2;
      fillRoundRectCanvas(
        ctx,
        32 - (38 + dw) / 2,
        32 - (28 + dh) / 2,
        38 + dw,
        28 + dh,
        r,
      );
      fillRoundRectCanvas(
        ctx,
        96 - (38 + dw) / 2,
        32 - (28 + dh) / 2,
        38 + dw,
        28 + dh,
        r,
      );
    },
    `    int d[] = {0, 4, 8, 4};
    int w = 38 + d[frame];
    int h = 28 + d[frame];
    int r = 8 + d[frame]/2;
    drawEyes(32, 32, w, h, r, 96, 32, w, h, r);`,
    `    d = [0, 4, 8, 4][frame % 4]
    w, h, r = 38 + d, 28 + d, 8 + d//2
    draw_eyes(32, 32, w, h, r, 96, 32, w, h, r)`,
  ),
  createRobotEyeAnimation(
    "eyes_look_right",
    "eyes_look_right",
    ["robot", "eyes", "look", "right"],
    8,
    6,
    (ctx, frame) => {
      const ox = [0, 4, 8, 10, 8, 4][frame % 6];
      const drawEyeWithPupil = (cx: number) => {
        fillRoundRectCanvas(ctx, cx - 19, 32 - 14, 38, 28, 8);
        ctx.fillStyle = "#000000";
        ctx.beginPath();
        ctx.arc(cx + ox, 32, 8, 0, Math.PI * 2);
        ctx.fill();
      };
      drawEyeWithPupil(32);
      drawEyeWithPupil(96);
    },
    `    int ox[] = {0, 4, 8, 10, 8, 4};
    drawEyes(32, 32, 38, 28, 8, 96, 32, 38, 28, 8);
    display.fillCircle(32 + ox[frame], 32, 8, BLACK);
    display.fillCircle(96 + ox[frame], 32, 8, BLACK);`,
    `    ox = [0, 4, 8, 10, 8, 4][frame % 6]
    draw_eyes(32, 32, 38, 28, 8, 96, 32, 38, 28, 8)
    oled.ellipse(32 + ox, 32, 8, 8, 0)
    oled.ellipse(96 + ox, 32, 8, 8, 0)
    oled.show()`,
  ),
  createRobotEyeAnimation(
    "eyes_look_left",
    "eyes_look_left",
    ["robot", "eyes", "look", "left"],
    8,
    6,
    (ctx, frame) => {
      const ox = [0, -4, -8, -10, -8, -4][frame % 6];
      const drawEyeWithPupil = (cx: number) => {
        fillRoundRectCanvas(ctx, cx - 19, 32 - 14, 38, 28, 8);
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.beginPath();
        ctx.arc(cx + ox, 32, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      };
      drawEyeWithPupil(32);
      drawEyeWithPupil(96);
    },
    `    int ox[] = {0, -4, -8, -10, -8, -4};
    drawEyes(32, 32, 38, 28, 8, 96, 32, 38, 28, 8);
    display.fillCircle(32 + ox[frame], 32, 8, BLACK);
    display.fillCircle(96 + ox[frame], 32, 8, BLACK);`,
    `    ox = [0, -4, -8, -10, -8, -4][frame % 6]
    draw_eyes(32, 32, 38, 28, 8, 96, 32, 38, 28, 8)
    oled.ellipse(32 + ox, 32, 8, 8, 0)
    oled.ellipse(96 + ox, 32, 8, 8, 0)
    oled.show()`,
  ),
  createRobotEyeAnimation(
    "eyes_doughnut",
    "eyes_doughnut",
    ["robot", "eyes", "ring", "spidermaf"],
    8,
    4,
    (ctx) => {
      const drawRingEye = (cx: number) => {
        fillRoundRectCanvas(ctx, cx - 19, 32 - 14, 38, 28, 8);
        ctx.globalCompositeOperation = "destination-out";
        fillRoundRectCanvas(ctx, cx - 9, 32 - 5, 18, 10, 4);
        ctx.globalCompositeOperation = "source-over";
      };
      drawRingEye(32);
      drawRingEye(96);
    },
    `    drawEyes(32, 32, 38, 28, 8, 96, 32, 38, 28, 8);
    // Cutout inner part
    display.fillRoundRect(32 - 9, 32 - 5, 18, 10, 4, BLACK);
    display.fillRoundRect(96 - 9, 32 - 5, 18, 10, 4, BLACK);`,
    `    draw_eyes(32, 32, 38, 28, 8, 96, 32, 38, 28, 8)
    fill_round_rect(32 - 9, 32 - 5, 18, 10, 4, 0)
    fill_round_rect(96 - 9, 32 - 5, 18, 10, 4, 0)`,
  ),
  createRobotEyeAnimation(
    "eyes_pill_tall",
    "eyes_pill_tall",
    ["robot", "eyes", "tall", "vinny"],
    8,
    4,
    (ctx, frame) => {
      const h = [42, 40, 38, 40][frame % 4];
      fillRoundRectCanvas(ctx, 32 - 12, 32 - h / 2, 24, h, 12);
      fillRoundRectCanvas(ctx, 96 - 12, 32 - h / 2, 24, h, 12);
    },
    `    int h[] = {42, 40, 38, 40};
    drawEyes(32, 32, 24, h[frame], 12, 96, 32, 24, h[frame], 12);`,
    `    h = [42, 40, 38, 40][frame % 4]
    draw_eyes(32, 32, 24, h, 12, 96, 32, 24, h, 12)`,
  ),
  createRobotEyeAnimation(
    "eyes_pill_wide",
    "eyes_pill_wide",
    ["robot", "eyes", "wide", "abdulsalam"],
    8,
    4,
    (ctx, frame) => {
      const w = [50, 48, 46, 48][frame % 4];
      fillRoundRectCanvas(ctx, 32 - w / 2, 32 - 12, w, 24, 8);
      fillRoundRectCanvas(ctx, 96 - w / 2, 32 - 12, w, 24, 8);
    },
    `    int w[] = {50, 48, 46, 48};
    drawEyes(32, 32, w[frame], 24, 8, 96, 32, w[frame], 24, 8);`,
    `    w = [50, 48, 46, 48][frame % 4]
    draw_eyes(32, 32, w, 24, 8, 96, 32, w, 24, 8)`,
  ),
  createRobotEyeAnimation(
    "eyes_mini",
    "eyes_mini",
    ["robot", "eyes", "small", "picajo"],
    6,
    4,
    (ctx, frame) => {
      const s = [0, 1, 2, 1][frame % 4];
      fillRoundRectCanvas(ctx, 32 - 14, 32 - 11 + s, 28, 22 - s * 2, 6);
      fillRoundRectCanvas(ctx, 96 - 14, 32 - 11 + s, 28, 22 - s * 2, 6);
    },
    `    int s[] = {0, 1, 2, 1};
    drawEyes(32, 32, 28, 22 - s[frame]*2, 6, 96, 32, 28, 22 - s[frame]*2, 6);`,
    `    s = [0, 1, 2, 1][frame % 4]
    draw_eyes(32, 32, 28, 22 - s*2, 6, 96, 32, 28, 22 - s*2, 6)`,
  ),
  createRobotEyeAnimation(
    "eyes_glitch",
    "eyes_glitch",
    ["robot", "eyes", "glitch", "error"],
    12,
    6,
    (ctx, frame) => {
      const ox = [0, 2, -2, 4, -1, 0][frame % 6];
      const oy = [0, -2, 3, -1, 2, 0][frame % 6];
      if (frame % 3 === 0) {
        fillRoundRectCanvas(ctx, 32 - 19 + ox, 32 - 14 + oy, 38, 28, 8);
        fillRoundRectCanvas(ctx, 96 - 19 - ox, 32 - 14 - oy, 38, 28, 8);
      } else {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(32 - 19, 32 - 2, 38, 4);
        ctx.fillRect(96 - 19, 32 - 2, 38, 4);
      }
    },
    `    int ox[] = {0, 2, -2, 4, -1, 0};
    int oy[] = {0, -2, 3, -1, 2, 0};
    if (frame % 3 == 0) {
      drawEyes(32 + ox[frame], 32 + oy[frame], 38, 28, 8, 96 - ox[frame], 32 - oy[frame], 38, 28, 8);
    } else {
      display.clearDisplay();
      display.fillRect(32 - 19, 32 - 2, 38, 4, WHITE);
      display.fillRect(96 - 19, 32 - 2, 38, 4, WHITE);
      display.display();
    }`,
    `    ox = [0, 2, -2, 4, -1, 0]
    oy = [0, -2, 3, -1, 2, 0]
    if frame % 3 == 0:
        draw_eyes(32 + ox[frame % 6], 32 + oy[frame % 6], 38, 28, 8, 96 - ox[frame % 6], 32 - oy[frame % 6], 38, 28, 8)
    else:
        oled.fill(0)
        oled.fill_rect(32-19, 32-2, 38, 4, 1)
        oled.fill_rect(96-19, 32-2, 38, 4, 1)
        oled.show()`,
  ),
];
