// types.ts — shared type definitions

export type DisplayKey = 'sh1106_128x64' | 'sh1106_128x64_spi' | 'ssd1106_128x64' | 'ssd1306_128x64' | 'ssd1306_128x64_spi' | 'ssd1306_128x32' | 'ili9341_320x240' | 'st7735_160x128' | 'st7789_240x240' | 'max7219_8x8' | 'hd44780_16x2';
export type JobStatus = 'idle' | 'uploading' | 'queued' | 'processing' | 'done' | 'error';
export type DeliveryTab = 'flash' | 'sd_card' | 'wifi';

export interface DisplayConfig {
  key: DisplayKey;
  driver: string;
  driver_id: number;
  width: number;
  height: number;
  fps: number;
  label: string;
}

export interface JobStats {
  total_bytes: number;
  total_kb: number;
  frame_count: number;
  frame_size_bytes: number;
  fps: number;
  duration_s: number;
  delivery_mode: 'flash' | 'sd_card';
}

export interface VideoInfo {
  duration?: number;
  fps?: number;
  width?: number;
  height?: number;
}

export interface DisplaysResponse {
  displays: DisplayConfig[];
}

export interface UploadResponse {
  job_id: string;
  filename: string;
  info: VideoInfo;
}

export interface ProcessResponse {
  job_id: string;
  status: Extract<JobStatus, 'queued'>;
}

export interface StatusEventData {
  progress: number;
  status: JobStatus;
  message: string;
  stats?: JobStats;
  previews?: string[];
  frame_count?: number;
  fps?: number;
  config?: Partial<DisplayConfig>;
}

export interface ProcessingState {
  status: JobStatus;
  progress: number;
  message: string;
  jobId: string | null;
  stats: JobStats | null;
  previews: string[];
  frameCount: number;
  fps: number;
  config: Partial<DisplayConfig>;
}
