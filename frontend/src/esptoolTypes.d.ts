declare module 'esptool-js' {
  export class Transport {
    constructor(device: unknown, tracing?: boolean, enableSlipReader?: boolean);
    disconnect(): Promise<void>;
  }

  export interface IEspLoaderTerminal {
    clean(): void;
    write(data: string): void;
    writeLine(data: string): void;
  }

  export type FlashSizeValues = 'detect' | 'keep' | '256KB' | '512KB' | '1MB' | '2MB' | '2MB-c1' | '4MB' | '4MB-c1' | '8MB' | '16MB' | '32MB' | '64MB' | '128MB';
  export type FlashModeValues = 'keep' | 'dio' | 'qio' | 'dout' | 'qout';
  export type FlashFreqValues = 'keep' | '80m' | '60m' | '48m' | '40m' | '30m' | '26m' | '24m' | '20m' | '16m' | '15m' | '12m';

  export interface LoaderOptions {
    transport: Transport;
    baudrate: number;
    terminal?: IEspLoaderTerminal;
    debugLogging?: boolean;
  }

  export interface FlashOptions {
    fileArray: { data: Uint8Array; address: number }[];
    flashMode: FlashModeValues;
    flashFreq: FlashFreqValues;
    flashSize: FlashSizeValues;
    eraseAll: boolean;
    compress: boolean;
    reportProgress?: (fileIndex: number, written: number, total: number) => void;
  }

  export class ESPLoader {
    constructor(options: LoaderOptions);
    main(mode?: string): Promise<string>;
    writeFlash(options: FlashOptions): Promise<void>;
    after(mode?: string): Promise<void>;
  }
}
