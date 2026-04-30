/*
 * oled_driver.h — Bare-metal I2C and SPI OLED driver for SSD1306 and SH1106
 * Bypasses library overhead for maximum frame throughput.
 */
#pragma once
#include <Wire.h>
#include <SPI.h>
#include <stdint.h>

#define OLED_CMD  0x00
#define OLED_DATA 0x40

// SSD1306 init sequence (128x64)
static const uint8_t SSD1306_INIT_128x64[] = {
  0xAE, 0x20, 0x00, 0x40, 0xA1, 0xC8,
  0xDA, 0x12, 0x81, 0xCF, 0xD9, 0xF1,
  0xDB, 0x40, 0xA4, 0xA6, 0xD5, 0x80,
  0x8D, 0x14, 0xAF
};

// SSD1306 init sequence (128x32)
static const uint8_t SSD1306_INIT_128x32[] = {
  0xAE, 0x20, 0x00, 0x40, 0xA1, 0xC8,
  0xDA, 0x02, 0x81, 0x8F, 0xD9, 0xF1,
  0xDB, 0x40, 0xA4, 0xA6, 0xD5, 0x80,
  0x8D, 0x14, 0xAF
};

// SH1106 init sequence (128x64)
static const uint8_t SH1106_INIT[] = {
  0xAE, 0xD5, 0x80, 0xA8, 0x3F, 0xD3,
  0x00, 0x40, 0x8D, 0x14, 0x20, 0x00,
  0xA1, 0xC8, 0xDA, 0x12, 0x81, 0xCF,
  0xD9, 0xF1, 0xDB, 0x40, 0xA4, 0xA6, 0xAF
};

// ── I2C Functions ─────────────────────────────────────────────────────────────

inline void oled_send_cmd(uint8_t addr, uint8_t cmd) {
  Wire.beginTransmission(addr);
  Wire.write(OLED_CMD);
  Wire.write(cmd);
  Wire.endTransmission();
}

inline void oled_init_i2c(uint8_t addr, uint8_t driver_id, uint8_t width, uint8_t height) {
  const uint8_t* seq;
  uint8_t len;
  if (driver_id == 1 || driver_id == 2) {           // SH1106 / SSD1106
    seq = SH1106_INIT; len = sizeof(SH1106_INIT);
  } else if (height == 32) {      // SSD1306 128x32
    seq = SSD1306_INIT_128x32; len = sizeof(SSD1306_INIT_128x32);
  } else {                        // SSD1306 128x64
    seq = SSD1306_INIT_128x64; len = sizeof(SSD1306_INIT_128x64);
  }
  
  // CRITICAL: Set horizontal addressing mode (0x20, 0x00)
  // Without this, SSD1306 defaults to page mode and frames won't display correctly
  for (uint8_t i = 0; i < len; i++) oled_send_cmd(addr, seq[i]);
}

// Blast one frame directly into GRAM
// CRITICAL: Resets column/page pointer every frame so writing always starts at (0,0)
// Without this, frame 2+ goes to wrong position causing scrolling/corrupt display
inline void oled_push_frame_i2c(uint8_t addr, const uint8_t* buf, uint32_t len,
                                uint8_t width, uint8_t height, uint8_t driver_id) {
  uint8_t pages = height / 8;

  if (driver_id == 1 || driver_id == 2) {
    for (uint8_t page = 0; page < pages; page++) {
      const uint32_t page_offset = page * width;
      oled_send_cmd(addr, 0xB0 + page);
      oled_send_cmd(addr, 0x02);
      oled_send_cmd(addr, 0x10);

      for (uint32_t col = 0; col < width; col += 32) {
        uint32_t chunk = min(32U, (uint32_t)width - col);
        Wire.beginTransmission(addr);
        Wire.write(OLED_DATA);
        for (uint32_t j = 0; j < chunk; j++) {
          Wire.write(buf[page_offset + col + j]);
        }
        Wire.endTransmission();
      }
    }
    return;
  }

  // Reset GRAM write pointer to top-left before EVERY frame
  oled_send_cmd(addr, 0x21); oled_send_cmd(addr, 0); oled_send_cmd(addr, width - 1);
  oled_send_cmd(addr, 0x22); oled_send_cmd(addr, 0); oled_send_cmd(addr, pages - 1);

  // CRITICAL: ESP32 Wire buffer is 128 bytes including the 0x40 control byte
  // Send in 32-byte chunks to avoid buffer overflow and silent truncation
  // Without proper chunking, only the first 127 bytes write and display stays mostly black
  for (uint32_t i = 0; i < len; i += 32) {
    uint32_t chunk = min(32U, len - i);
    Wire.beginTransmission(addr);
    Wire.write(OLED_DATA);  // 0x40 = data mode
    for (uint32_t j = 0; j < chunk; j++) {
      Wire.write(buf[i + j]);
    }
    Wire.endTransmission();
  }
}

// ── SPI Functions ─────────────────────────────────────────────────────────────

inline void oled_spi_cmd(uint8_t cmd) {
  digitalWrite(SPI_DC_PIN, LOW);  // Command mode
  digitalWrite(SPI_CS_PIN, LOW);
  SPI.transfer(cmd);
  digitalWrite(SPI_CS_PIN, HIGH);
}

inline void oled_spi_data(const uint8_t* data, uint32_t len) {
  digitalWrite(SPI_DC_PIN, HIGH);  // Data mode
  digitalWrite(SPI_CS_PIN, LOW);
  SPI.transferBytes(data, nullptr, len);
  digitalWrite(SPI_CS_PIN, HIGH);
}

inline void oled_init_spi(uint8_t driver_id, uint8_t width, uint8_t height) {
  // Hardware reset
  digitalWrite(SPI_RST_PIN, LOW);
  delay(10);
  digitalWrite(SPI_RST_PIN, HIGH);
  delay(10);

  const uint8_t* seq;
  uint8_t len;
  if (driver_id == 1 || driver_id == 2) {           // SH1106 / SSD1106
    seq = SH1106_INIT; len = sizeof(SH1106_INIT);
  } else if (height == 32) {      // SSD1306 128x32
    seq = SSD1306_INIT_128x32; len = sizeof(SSD1306_INIT_128x32);
  } else {                        // SSD1306 128x64
    seq = SSD1306_INIT_128x64; len = sizeof(SSD1306_INIT_128x64);
  }
  
  for (uint8_t i = 0; i < len; i++) {
    oled_spi_cmd(seq[i]);
  }
}

inline void oled_push_frame_spi(const uint8_t* buf, uint32_t len,
                                uint8_t width, uint8_t height, uint8_t driver_id) {
  uint8_t pages = height / 8;

  if (driver_id == 1 || driver_id == 2) {
    SPI.beginTransaction(SPISettings(SPI_CLOCK_HZ, MSBFIRST, SPI_MODE0));
    for (uint8_t page = 0; page < pages; page++) {
      oled_spi_cmd(0xB0 + page);
      oled_spi_cmd(0x02);
      oled_spi_cmd(0x10);
      oled_spi_data(buf + (page * width), width);
    }
    SPI.endTransaction();
    return;
  }

  // Set column and page address range
  oled_spi_cmd(0x21); oled_spi_cmd(0); oled_spi_cmd(width - 1);
  oled_spi_cmd(0x22); oled_spi_cmd(0); oled_spi_cmd(pages - 1);

  // Begin SPI transaction and blast entire frame at once
  SPI.beginTransaction(SPISettings(SPI_CLOCK_HZ, MSBFIRST, SPI_MODE0));
  oled_spi_data(buf, len);
  SPI.endTransaction();
}
