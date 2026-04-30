import { ESPLoader, Transport } from 'esptool-js';
import type {
  FlashFreqValues,
  FlashModeValues,
  FlashSizeValues,
  IEspLoaderTerminal,
} from 'esptool-js';
import { downloadUrl } from './api';

export const OLED_RAW_FLASH_ADDRESS = 0x110000;

interface SerialPortLike {
  close?: () => Promise<void>;
}

interface NavigatorWithSerial extends Navigator {
  serial?: {
    requestPort: () => Promise<SerialPortLike>;
  };
}

export type UsbFlashStatus =
  | 'idle'
  | 'fetching'
  | 'connecting'
  | 'flashing'
  | 'resetting'
  | 'done'
  | 'error';

export interface UsbFlashCallbacks {
  onStatus?: (status: UsbFlashStatus, message: string) => void;
  onProgress?: (percent: number) => void;
  onLog?: (line: string) => void;
}

function assertOledPayload(data: Uint8Array) {
  if (data.length < 16 || data[0] !== 0x4f || data[1] !== 0x4c || data[2] !== 0x45 || data[3] !== 0x44) {
    throw new Error('Downloaded file is not a valid .oled payload');
  }
}

async function fetchOledPayload(jobId: string) {
  const response = await fetch(downloadUrl(jobId));
  if (!response.ok) {
    throw new Error(await response.text());
  }

  const payload = new Uint8Array(await response.arrayBuffer());
  assertOledPayload(payload);
  return payload;
}

export async function flashOledPayloadOverUsb(jobId: string, callbacks: UsbFlashCallbacks = {}) {
  const serial = (navigator as NavigatorWithSerial).serial;
  if (!serial) {
    throw new Error('WebSerial is not available. Use Chrome or Edge over HTTPS/localhost.');
  }

  callbacks.onStatus?.('fetching', 'downloading processed .oled payload');
  callbacks.onProgress?.(0);
  const payload = await fetchOledPayload(jobId);
  callbacks.onLog?.(`payload: ${payload.length} bytes`);

  callbacks.onStatus?.('connecting', 'select the ESP32 USB serial port');
  const port = await serial.requestPort();
  const transport = new Transport(port as never, false);

  const terminal: IEspLoaderTerminal = {
    clean: () => undefined,
    write: (data: string) => {
      if (data.trim()) callbacks.onLog?.(data.trim());
    },
    writeLine: (data: string) => {
      if (data.trim()) callbacks.onLog?.(data.trim());
    },
  };

  const loader = new ESPLoader({
    transport,
    baudrate: 921600,
    terminal,
    debugLogging: false,
  });

  try {
    callbacks.onStatus?.('connecting', 'connecting to ESP32 bootloader');
    const chip = await loader.main();
    callbacks.onLog?.(`connected: ${chip}`);

    callbacks.onStatus?.('flashing', `writing payload at 0x${OLED_RAW_FLASH_ADDRESS.toString(16)}`);
    await loader.writeFlash({
      fileArray: [{ data: payload, address: OLED_RAW_FLASH_ADDRESS }],
      flashMode: 'keep' as FlashModeValues,
      flashFreq: 'keep' as FlashFreqValues,
      flashSize: 'keep' as FlashSizeValues,
      eraseAll: false,
      compress: true,
      reportProgress: (_fileIndex, written, total) => {
        callbacks.onProgress?.(total > 0 ? Math.round((written / total) * 100) : 0);
      },
    });

    callbacks.onStatus?.('resetting', 'resetting ESP32');
    await loader.after('hard_reset');
    callbacks.onProgress?.(100);
    callbacks.onStatus?.('done', 'payload flashed; ESP32 should restart playback');
  } finally {
    try {
      await transport.disconnect();
    } catch {
      await port.close?.();
    }
  }
}
