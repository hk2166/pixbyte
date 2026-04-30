/*
 * frame_reader.h — .oled binary parser for Flash, SD Card, and WiFi modes
 */
#pragma once
#include <stdint.h>
#include <string.h>

#define OLED_MAGIC       0x44454C4F  // "OLED" LE
#define OLED_HEADER_SIZE 16

struct OledHeader {
  uint16_t width;
  uint16_t height;
  uint8_t  fps;
  uint8_t  driver_id;  // 0=SSD1306, 1=SH1106
  uint32_t frame_count;
};

// ── Flash mode ────────────────────────────────────────────────────────────────
inline bool oled_parse_header(const uint8_t* data, uint32_t len, OledHeader* hdr) {
  if (len < OLED_HEADER_SIZE) {
    Serial.println("// ERROR: header too short");
    return false;
  }
  
  // Validate magic bytes
  if (memcmp(data, "OLED", 4) != 0) {
    Serial.println("// ERROR: invalid magic bytes (expected 'OLED')");
    Serial.printf("// Got: 0x%02X 0x%02X 0x%02X 0x%02X\n", data[0], data[1], data[2], data[3]);
    return false;
  }
  
  // Validate version
  if (data[4] != 0x01) {
    Serial.printf("// ERROR: unsupported format version 0x%02X (expected 0x01)\n", data[4]);
    return false;
  }
  
  hdr->width       = (uint16_t)data[5] | ((uint16_t)data[6] << 8);
  hdr->height      = (uint16_t)data[7] | ((uint16_t)data[8] << 8);
  hdr->fps         = data[9];
  hdr->driver_id   = data[10];
  hdr->frame_count = (uint32_t)data[11] | ((uint32_t)data[12] << 8)
                   | ((uint32_t)data[13] << 16) | ((uint32_t)data[14] << 24);
  
  // Validate driver ID matches compiled configuration
  #if defined(DISPLAY_INTERFACE) && DISPLAY_INTERFACE == I2C
    // For I2C mode, check driver compatibility
    // Note: This is a compile-time check placeholder - actual driver validation
    // would require knowing which driver is compiled in
    if (hdr->driver_id > 2) {
      Serial.printf("// WARNING: driver_id %d may not be compatible with I2C mode\n", hdr->driver_id);
    }
  #endif
  
  return true;
}

inline bool oled_read_frame_flash(const uint8_t* data, uint32_t frame_idx,
                                   uint32_t frame_size, uint32_t header_size,
                                   uint8_t* out_buf) {
  uint32_t offset = header_size + frame_idx * frame_size;
  memcpy(out_buf, data + offset, frame_size);
  return true;
}

// ── SD Card mode ──────────────────────────────────────────────────────────────
#ifdef MODE_SD
#include <SD.h>
inline bool oled_parse_header_file(File& f, OledHeader* hdr) {
  uint8_t buf[OLED_HEADER_SIZE];
  f.seek(0);
  if (f.read(buf, OLED_HEADER_SIZE) != OLED_HEADER_SIZE) return false;
  return oled_parse_header(buf, OLED_HEADER_SIZE, hdr);
}

inline bool oled_read_frame_sd(File& f, uint32_t frame_idx,
                                uint32_t frame_size, uint8_t* out_buf) {
  uint32_t offset = OLED_HEADER_SIZE + frame_idx * frame_size;
  if (!f.seek(offset)) return false;
  return f.read(out_buf, frame_size) == (int)frame_size;
}
#endif

// ── WiFi Streaming mode ───────────────────────────────────────────────────────
#ifdef MODE_WIFI
#include <WiFi.h>
#include <HTTPClient.h>
#include <Arduino_JSON.h>

inline bool oled_fetch_meta(const char* host, uint16_t port,
                             const char* job_id, OledHeader* hdr) {
  HTTPClient http;
  char url[128];
  snprintf(url, sizeof(url), "http://%s:%d/api/stream/%s/meta", host, port, job_id);
  http.begin(url);
  int code = http.GET();
  if (code != 200) { http.end(); return false; }

  JSONVar obj = JSON.parse(http.getString());
  hdr->width       = (int)obj["width"];
  hdr->height      = (int)obj["height"];
  hdr->fps         = (int)obj["fps"];
  hdr->frame_count = (int)obj["frame_count"];
  hdr->driver_id   = strcmp((const char*)obj["driver"], "SH1106") == 0 ? 1 : 0;
  http.end();
  return true;
}

inline bool oled_fetch_frame(const char* host, uint16_t port,
                              const char* job_id, uint32_t frame_idx,
                              uint32_t frame_size, uint8_t* out_buf) {
  HTTPClient http;
  char url[160];
  snprintf(url, sizeof(url), "http://%s:%d/api/stream/%s/frame/%lu",
           host, port, job_id, frame_idx);
  http.begin(url);
  int code = http.GET();
  if (code != 200) { http.end(); return false; }

  WiFiClient* stream = http.getStreamPtr();
  uint32_t received = 0;
  while (received < frame_size && http.connected()) {
    if (stream->available()) {
      out_buf[received++] = stream->read();
    }
  }
  http.end();
  return received == frame_size;
}
#endif
