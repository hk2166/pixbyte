/*
 * esp32_oled_player.ino
 * ESP32 OLED Video Player — reads .oled binary from Flash / SD Card / WiFi
 * Supports SSD1306 (0x3C) and SH1106 (0x3C/0x3D) via I2C or SPI
 *
 * Wiring (I2C):
 *   SDA → GPIO 21
 *   SCL → GPIO 22
 *   VCC → 3.3V
 *   GND → GND
 *
 * Wiring (SPI):
 *   MOSI → GPIO 23
 *   SCLK → GPIO 18
 *   CS   → GPIO 5
 *   DC   → GPIO 16
 *   RST  → GPIO 17
 *   VCC  → 3.3V
 *   GND  → GND
 *
 * SD Card (SPI) — SD Card mode only:
 *   MOSI → GPIO 23, MISO → GPIO 19, CLK → GPIO 18, CS → GPIO 5
 */

 
#include <Wire.h>
#include <SPI.h>
#include <Arduino.h>
#if __has_include(<esp_flash.h>)
  #include <esp_flash.h>
  #define OLED_USE_ESP_FLASH_READ 1
#else
  #include <esp_spi_flash.h>
  #define OLED_USE_ESP_FLASH_READ 0
#endif
#include "frame_reader.h"
#include "oled_driver.h"

// ── Configuration ─────────────────────────────────────────────────────────────
// Set one of: MODE_RAW_FLASH, MODE_SD, MODE_WIFI
#define MODE_RAW_FLASH

// SD Card file path (MODE_SD only)
#define SD_FILENAME "/display.oled"




// WiFi settings (MODE_WIFI only)
#define WIFI_SSID     "Airtel"
#define WIFI_PASS     "jrg074dt"
#define SERVER_IP     "192.168.1.100"
#define SERVER_PORT   8000
#define JOB_ID        "abcd1234"

// I2C OLED address
#define OLED_ADDR     0x3C
// I2C speed: Theoretical frame rate ceiling at 400kHz for a 128x64 display is ~30fps 
// after I2C protocol overhead. At 800kHz it approaches 60fps.
// Set to 800000 if your module supports Fast Mode Plus.
#define I2C_CLOCK_HZ  400000

// ── Interface ─────────────────────────────────────────────────────────────────
// Set one of: I2C, SPI
// Note: SPI requires a 4-wire module (SDA/SCL on I2C modules become MOSI/SCLK on SPI modules)
// SPI can run at 10-40MHz, enabling true 30fps+ on 128x64 displays (up to 100x faster than I2C)
#define I2C 0
#define SPI 1
#define DISPLAY_INTERFACE I2C

// SPI pin configuration (only used when DISPLAY_INTERFACE == SPI)
#define SPI_MOSI_PIN  23  // MOSI / DIN
#define SPI_SCLK_PIN  18  // SCLK / CLK
#define SPI_CS_PIN    5   // Chip Select
#define SPI_DC_PIN    16  // Data/Command
#define SPI_RST_PIN   17  // Reset
#define SPI_CLOCK_HZ  10000000  // 10 MHz (can go up to 40MHz on some modules)

// ── Raw Flash mode: reads raw binary directly from memory offset 0x110000 ───────
#ifdef MODE_RAW_FLASH
#define RAW_FLASH_ADDR 0x110000
#endif

// ── Global state ──────────────────────────────────────────────────────────────
OledHeader g_header;
uint32_t   g_current_frame = 0;
uint8_t    g_oled_addr = OLED_ADDR;

#ifdef MODE_RAW_FLASH
uint8_t*   g_raw_frame_buf = nullptr;

bool raw_flash_read(uint32_t offset, void* dst, uint32_t len) {
#if OLED_USE_ESP_FLASH_READ
  esp_err_t err = esp_flash_read(nullptr, dst, RAW_FLASH_ADDR + offset, len);
#else
  esp_err_t err = spi_flash_read(RAW_FLASH_ADDR + offset, dst, len);
#endif
  if (err != ESP_OK) {
    Serial.printf("// ERROR: flash read failed at 0x%X (%d)\n", RAW_FLASH_ADDR + offset, err);
    return false;
  }
  return true;
}
#endif

#if DISPLAY_INTERFACE == I2C
uint8_t detect_oled_i2c_address() {
  const uint8_t candidates[] = {0x3C, 0x3D};
  for (uint8_t i = 0; i < sizeof(candidates); i++) {
    Wire.beginTransmission(candidates[i]);
    if (Wire.endTransmission() == 0) {
      return candidates[i];
    }
  }
  return OLED_ADDR;
}
#endif

#ifdef MODE_SD
#include <SD.h>
File g_sd_file;
#define SD_CS_PIN 5
#endif

#ifdef MODE_WIFI
#include <WiFi.h>
#include <HTTPClient.h>
#endif

// ── Setup ─────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("// esp32_oled_player v1.0");

  #if DISPLAY_INTERFACE == I2C
    // CRITICAL: Wire.setClock() MUST be called BEFORE Wire.begin()
    Wire.setClock(I2C_CLOCK_HZ);
    Wire.begin(21, 22);
    g_oled_addr = detect_oled_i2c_address();
    Serial.printf("// I2C initialized at %d Hz, OLED addr=0x%02X\n", I2C_CLOCK_HZ, g_oled_addr);
  #elif DISPLAY_INTERFACE == SPI
    SPI.begin();
    pinMode(SPI_CS_PIN, OUTPUT);
    pinMode(SPI_DC_PIN, OUTPUT);
    pinMode(SPI_RST_PIN, OUTPUT);
    digitalWrite(SPI_CS_PIN, HIGH);
    digitalWrite(SPI_RST_PIN, HIGH);
    Serial.println("// SPI initialized");
  #endif

// ── Load header & init display ───────────────────────────────────────────
#ifdef MODE_RAW_FLASH
  uint8_t header_buf[OLED_HEADER_SIZE];
  
  Serial.printf("// Reading header from flash offset 0x%X\n", RAW_FLASH_ADDR);
  if (!raw_flash_read(0, header_buf, OLED_HEADER_SIZE)) {
    Serial.println("// ERROR: cannot read .oled header — halting");
    while (1) delay(1000);
  }
  Serial.printf("Magic: %02X %02X %02X %02X\n", 
    header_buf[0], header_buf[1], header_buf[2], header_buf[3]);
  Serial.printf("Version: %02X\n", header_buf[4]);
  Serial.printf("Width: %d Height: %d FPS: %d\n",
    header_buf[5] | (header_buf[6] << 8),
    header_buf[7] | (header_buf[8] << 8),
    header_buf[9]);
  Serial.printf("Driver: %02X\n", header_buf[10]);
  Serial.printf("Frames: %lu\n",
    (uint32_t)header_buf[11] | ((uint32_t)header_buf[12]<<8) | 
    ((uint32_t)header_buf[13]<<16) | ((uint32_t)header_buf[14]<<24));
  
  if (!oled_parse_header(header_buf, OLED_HEADER_SIZE, &g_header)) {
    Serial.println("// ERROR: invalid .oled header at 0x110000 — halting");
    while (1) delay(1000);
  }
  const uint32_t raw_frame_size = (uint32_t)(g_header.width * g_header.height) / 8;
  g_raw_frame_buf = (uint8_t*)malloc(raw_frame_size);
  if (!g_raw_frame_buf) {
    Serial.printf("// ERROR: cannot allocate %lu byte frame buffer — halting\n", raw_frame_size);
    while (1) delay(1000);
  }
  Serial.printf("// Header OK — raw flash mode: %lu frames @ %dfps (%dx%d)\n",
    g_header.frame_count, g_header.fps, g_header.width, g_header.height);
#endif

#ifdef MODE_SD
  if (!SD.begin(SD_CS_PIN)) {
    Serial.println("// ERROR: SD card init failed");
    while (1);
  }
  g_sd_file = SD.open(SD_FILENAME, FILE_READ);
  if (!g_sd_file) {
    Serial.println("// ERROR: cannot open " SD_FILENAME);
    while (1);
  }
  if (!oled_parse_header_file(g_sd_file, &g_header)) {
    Serial.println("// ERROR: invalid .oled header");
    while (1);
  }
  Serial.printf("// sd mode: %lu frames @ %dfps (%dx%d)\n",
    g_header.frame_count, g_header.fps, g_header.width, g_header.height);
#endif

#ifdef MODE_WIFI
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("// connecting wifi");
  while (WiFi.status() != WL_CONNECTED) { delay(300); Serial.print("."); }
  Serial.println("\n// wifi connected: " + WiFi.localIP().toString());
  if (!oled_fetch_meta(SERVER_IP, SERVER_PORT, JOB_ID, &g_header)) {
    Serial.println("// ERROR: cannot fetch metadata");
    while (1);
  }
  Serial.printf("// wifi mode: %lu frames @ %dfps (%dx%d)\n",
    g_header.frame_count, g_header.fps, g_header.width, g_header.height);
#endif

  // Init OLED
  #if DISPLAY_INTERFACE == I2C
    oled_init_i2c(g_oled_addr, g_header.driver_id, g_header.width, g_header.height);
  #elif DISPLAY_INTERFACE == SPI
    oled_init_spi(g_header.driver_id, g_header.width, g_header.height);
  #endif
  
  Serial.println("// playback started — check display for output");
  Serial.printf("// frame_size=%lu bytes, fps=%d\n", 
    (uint32_t)(g_header.width * g_header.height) / 8, g_header.fps);
}

// ── Main loop ─────────────────────────────────────────────────────────────────
void loop() {
  static unsigned long next_frame_time = 0;
  static bool first_frame = true;
  
  if (first_frame) {
    next_frame_time = micros();
    first_frame = false;
  }
  
  const uint32_t frame_size = (g_header.width * g_header.height) / 8;

#ifdef MODE_RAW_FLASH
  const uint32_t frame_offset = OLED_HEADER_SIZE + (g_current_frame * frame_size);
  if (raw_flash_read(frame_offset, g_raw_frame_buf, frame_size)) {
    #if DISPLAY_INTERFACE == I2C
      oled_push_frame_i2c(g_oled_addr, g_raw_frame_buf, frame_size, g_header.width, g_header.height, g_header.driver_id);
    #elif DISPLAY_INTERFACE == SPI
      oled_push_frame_spi(g_raw_frame_buf, frame_size, g_header.width, g_header.height, g_header.driver_id);
    #endif
  }
#endif

#ifdef MODE_SD
  // For SD card, we need a buffer
  static uint8_t* frame_buf = nullptr;
  if (!frame_buf) frame_buf = (uint8_t*)malloc(frame_size);
  
  if (oled_read_frame_sd(g_sd_file, g_current_frame, frame_size, frame_buf)) {
    #if DISPLAY_INTERFACE == I2C
      oled_push_frame_i2c(g_oled_addr, frame_buf, frame_size, g_header.width, g_header.height, g_header.driver_id);
    #elif DISPLAY_INTERFACE == SPI
      oled_push_frame_spi(frame_buf, frame_size, g_header.width, g_header.height, g_header.driver_id);
    #endif
  }
#endif

#ifdef MODE_WIFI
  // For WiFi, we need a buffer
  static uint8_t* frame_buf = nullptr;
  if (!frame_buf) frame_buf = (uint8_t*)malloc(frame_size);
  
  if (oled_fetch_frame(SERVER_IP, SERVER_PORT, JOB_ID, g_current_frame, frame_size, frame_buf)) {
    #if DISPLAY_INTERFACE == I2C
      oled_push_frame_i2c(g_oled_addr, frame_buf, frame_size, g_header.width, g_header.height, g_header.driver_id);
    #elif DISPLAY_INTERFACE == SPI
      oled_push_frame_spi(frame_buf, frame_size, g_header.width, g_header.height, g_header.driver_id);
    #endif
  }
#endif

  g_current_frame = (g_current_frame + 1) % g_header.frame_count;

  // Deadline-based frame timing for stable playback
  const unsigned long frame_interval_us = 1000000UL / g_header.fps;
  next_frame_time += frame_interval_us;
  const long wait = (long)(next_frame_time - micros());
  
  if (wait > 0) {
    delayMicroseconds(wait);
  }
  // If wait < 0, we're behind schedule - skip compensation and continue
}
