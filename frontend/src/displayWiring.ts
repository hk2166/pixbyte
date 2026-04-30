import type { DisplayConfig } from './types';

export interface WiringPin {
  label: string;
  target: string;
  note?: string;
}

export interface WiringGuide {
  title: string;
  interfaceLabel: string;
  imageSrc?: string;
  pins: WiringPin[];
  note?: string;
}

function isOledDriver(config: Partial<DisplayConfig>) {
  return [0, 1, 2].includes(config.driver_id ?? -1);
}

export function isSpiDisplay(config: Partial<DisplayConfig>) {
  return Boolean(config.key?.includes('spi')) || [3, 4, 5, 6].includes(config.driver_id ?? -1);
}

export function getTransportLabel(config: Partial<DisplayConfig>) {
  if (isSpiDisplay(config)) {
    return 'SPI';
  }
  if (config.driver_id === 7) {
    return 'I2C/parallel';
  }
  return 'I2C';
}

function getDisplayName(config: Partial<DisplayConfig>) {
  const driver = config.driver ?? 'Selected display';
  const size = config.width && config.height ? ` (${config.width}x${config.height})` : '';
  return `${driver}${size}`;
}

export function getWiringGuide(config: Partial<DisplayConfig> = {}): WiringGuide {
  const title = getDisplayName(config);

  if (isOledDriver(config) && isSpiDisplay(config)) {
    return {
      title,
      interfaceLabel: 'SPI OLED',
      pins: [
        { label: 'VCC', target: '3.3V' },
        { label: 'GND', target: 'GND' },
        { label: 'CS', target: 'GPIO 5' },
        { label: 'DC', target: 'GPIO 16' },
        { label: 'RES', target: 'GPIO 17' },
        { label: 'SDA/MOSI', target: 'GPIO 23' },
        { label: 'SCK', target: 'GPIO 18' },
      ],
    };
  }

  if (isOledDriver(config)) {
    return {
      title,
      interfaceLabel: 'I2C OLED',
      imageSrc: config.driver_id === 1 || config.driver_id === 2
        ? '/esp32_sh1106_wiring.png'
        : '/esp32_wiring.png',
      pins: [
        { label: 'VCC', target: '3.3V' },
        { label: 'GND', target: 'GND' },
        { label: 'SCL', target: 'GPIO 22' },
        { label: 'SDA', target: 'GPIO 21' },
      ],
      note: 'Uses ESP32 Wire defaults with OLED address 0x3C.',
    };
  }

  if ([3, 4, 5].includes(config.driver_id ?? -1)) {
    const pins: WiringPin[] = [
      { label: 'VCC', target: '3.3V' },
      { label: 'GND', target: 'GND' },
      { label: 'CS', target: 'GPIO 5' },
      { label: 'RESET', target: 'GPIO 4' },
      { label: 'DC/RS', target: 'GPIO 2' },
      { label: 'MOSI', target: 'GPIO 23' },
      { label: 'SCK', target: 'GPIO 18' },
      { label: 'BL/LED', target: '3.3V or PWM' },
    ];

    if (config.driver_id === 5) {
      pins.splice(7, 0, { label: 'MISO', target: 'GPIO 19', note: 'optional' });
    }

    return {
      title,
      interfaceLabel: 'SPI TFT',
      pins,
    };
  }

  if (config.driver_id === 6) {
    return {
      title,
      interfaceLabel: 'SPI LED matrix',
      pins: [
        { label: 'VCC', target: '5V', note: 'required' },
        { label: 'GND', target: 'GND' },
        { label: 'CS', target: 'GPIO 5' },
        { label: 'DIN', target: 'GPIO 23' },
        { label: 'CLK', target: 'GPIO 18' },
      ],
    };
  }

  if (config.driver_id === 7) {
    return {
      title,
      interfaceLabel: 'HD44780 LCD',
      pins: [
        { label: 'VCC', target: '5V or module spec' },
        { label: 'GND', target: 'GND' },
        { label: 'RS', target: 'GPIO (custom)' },
        { label: 'E', target: 'GPIO (custom)' },
        { label: 'D4-D7', target: '4 GPIOs' },
      ],
      note: 'Text-only target. Use an I2C backpack or define a custom 4-bit parallel pin map.',
    };
  }

  return {
    title,
    interfaceLabel: 'custom',
    pins: [
      { label: 'VCC', target: 'module spec' },
      { label: 'GND', target: 'GND' },
      { label: 'DATA', target: 'custom GPIOs' },
    ],
    note: 'Add the display-specific init and frame-push wiring for this target.',
  };
}
