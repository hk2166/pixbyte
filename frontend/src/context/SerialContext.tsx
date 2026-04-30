/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
  useRef,
} from "react";

export type ConnectionState =
  | "DISCONNECTED"
  | "CONNECTING"
  | "CONNECTED"
  | "ERROR";

interface SerialContextValue {
  isSupported: boolean;
  connectionState: ConnectionState;
  portInfo: { usbVendorId?: number; usbProductId?: number } | null;
  logs: string[];
  isAnimationRunning: boolean;
  hasMicroPython: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  sendData: (data: string) => Promise<void>;
  runAnimationOnDevice: (code: string) => Promise<void>;
  stopAnimation: () => Promise<void>;
  clearLogs: () => void;
  addLog: (log: string) => void;
}

const SerialContext = createContext<SerialContextValue | null>(null);

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

export const SerialProvider = ({ children }: { children: ReactNode }) => {
  const [isSupported, setIsSupported] = useState(true);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("DISCONNECTED");
  const [portInfo, setPortInfo] = useState<{
    usbVendorId?: number;
    usbProductId?: number;
  } | null>(null);
  const [hasMicroPython, setHasMicroPython] = useState(true);
  const [logs, setLogs] = useState<string[]>([
    "// 0x1306.dev · interactive terminal",
    "// waiting for device connection_",
  ]);
  const [isAnimationRunning, setIsAnimationRunning] = useState(false);

  const portRef = useRef<any>(null);

  const isRunningRef = useRef(false);
  const readerRef = useRef<ReadableStreamDefaultReader | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsSupported("serial" in navigator);
    }
  }, []);

  const addLog = (log: string) => setLogs((prev) => [...prev, log].slice(-100));
  const clearLogs = () => setLogs([]);

  const sendData = async (data: string) => {
    if (!portRef.current || !portRef.current.writable) {
      throw new Error("Serial port is not connected");
    }

    const enc = new TextEncoder();
    const writer = writerRef.current ?? portRef.current.writable.getWriter();
    const shouldReleaseLock = writerRef.current == null;

    try {
      await writer.write(enc.encode(data));
    } finally {
      if (shouldReleaseLock) {
        try {
          writer.releaseLock();
        } catch { /* empty */ }
      }
    }
  };

  const executeSequence = async (
    writer: WritableStreamDefaultWriter<any>,
    reader: ReadableStreamDefaultReader<any>,
    code: string,
  ) => {
    const enc = new TextEncoder();
    const dec = new TextDecoder();
    let pendingRead: Promise<ReadableStreamReadResult<any>> | null = null;

    const readUntil = async (timeoutMs: number): Promise<string> => {
      let result = "";
      const deadline = Date.now() + timeoutMs;

      while (Date.now() < deadline) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) break;

        try {
          if (!pendingRead) {
            pendingRead = reader.read();
          }

          const timeoutPromise = new Promise<null>((r) =>
            setTimeout(() => r(null), Math.min(remaining, 200)),
          );

          const winner = await Promise.race([pendingRead, timeoutPromise]);

          if (winner === null) {
            continue;
          }

          pendingRead = null;
          const { value, done } =
            winner as ReadableStreamReadResult<Uint8Array>;
          if (done) break;
          if (value) result += dec.decode(value, { stream: true });

          if (
            result.includes("raw REPL") ||
            result.includes("CTRL-B") ||
            result.includes("raw_repl") ||
            result.includes(">")
          ) {
            break;
          }
        } catch (e) {
          addLog("// ERR read: " + (e as Error).message);
          pendingRead = null;
          break;
        }
      }

      return result;
    };

    addLog("// [1/4] interrupting...");
    await writer.write(new Uint8Array([0x03]));
    await delay(300);
    await writer.write(new Uint8Array([0x03]));
    await delay(1000);
    const step1Response = await readUntil(600);

    addLog("// DBG step1 flush: [" + step1Response.substring(0, 80) + "]");

    addLog("// [2/4] entering raw REPL...");
    await writer.write(new Uint8Array([0x01]));
    await delay(800);
    const replCheck = await readUntil(2000);

    addLog("// DBG step2 repl: [" + replCheck.substring(0, 80) + "]");

    const isRawRepl =
      replCheck.includes("raw REPL") ||
      replCheck.includes("CTRL-B") ||
      replCheck.includes("raw_repl") ||
      replCheck.includes(">");

    if (!isRawRepl) {
      addLog(
        "// ERR: raw REPL not detected · received: " +
          replCheck.substring(0, 50),
      );
      return;
    }
    addLog("// raw REPL confirmed ✓");

    addLog(`// [3/4] sending code... (${code.length} bytes)`);
    const CHUNK_SIZE = 256;
    for (let i = 0; i < code.length; i += CHUNK_SIZE) {
      const chunk = code.slice(i, i + CHUNK_SIZE);
      await writer.write(enc.encode(chunk));
      await delay(100);
    }

    addLog("// [4/4] executing...");
    await writer.write(new Uint8Array([0x04]));
    await delay(3000);
    const output = await readUntil(2000);

    if (output.includes("Traceback") || output.includes("Error")) {
      addLog("// ERR: " + output.trim());
      return;
    }

    addLog("// animation running ✓ · click stop to clear");
    setIsAnimationRunning(true);
  };

  const runAnimationOnDevice = async (animationCode: string) => {
    if (isRunningRef.current) {
      console.log("already running, ignoring click");
      return;
    }
    isRunningRef.current = true;

    if (!portRef.current) {
      isRunningRef.current = false;
      return;
    }

    if (readerRef.current) {
      try {
        await readerRef.current.cancel();
      } catch { /* empty */ }
      try {
        readerRef.current.releaseLock();
      } catch { /* empty */ }
      readerRef.current = null;
    }
    if (writerRef.current) {
      try {
        writerRef.current.releaseLock();
      } catch { /* empty */ }
      writerRef.current = null;
    }

    const port = portRef.current;
    if (port.readable?.locked) {
      addLog("// ERR: Port is currently locked (Reader). Please reconnect.");
      isRunningRef.current = false;
      return;
    }
    if (port.writable?.locked) {
      addLog("// ERR: Port is currently locked (Writer). Please reconnect.");
      isRunningRef.current = false;
      return;
    }

    const writer = port.writable.getWriter();
    const reader = port.readable.getReader();
    writerRef.current = writer;
    readerRef.current = reader;

    try {
      await executeSequence(writer, reader, animationCode);
    } finally {
      try {
        await reader.cancel();
      } catch { /* empty */ }
      try {
        reader.releaseLock();
      } catch { /* empty */ }
      try {
        writer.releaseLock();
      } catch { /* empty */ }
      readerRef.current = null;
      writerRef.current = null;
      isRunningRef.current = false;
    }
  };

  const stopAnimation = async () => {
    if (!portRef.current) return;

    if (readerRef.current) {
      try {
        await readerRef.current.cancel();
      } catch { /* empty */ }
      try {
        readerRef.current.releaseLock();
      } catch { /* empty */ }
      readerRef.current = null;
    }
    if (writerRef.current) {
      try {
        writerRef.current.releaseLock();
      } catch { /* empty */ }
      writerRef.current = null;
    }

    const port = portRef.current;
    if (port.readable?.locked || port.writable?.locked) {
      addLog("// ERR: Port locked. Cannot stop animation.");
      return;
    }

    const writer = port.writable.getWriter();
    const reader = port.readable.getReader();
    writerRef.current = writer;
    readerRef.current = reader;

    try {
      await writer.write(new Uint8Array([0x03]));
      await delay(500);
      await writer.write(new Uint8Array([0x01]));
      await delay(500);

      try {
        await Promise.race([
          reader.read(),
          new Promise<any>((r) => setTimeout(() => r({ done: true }), 100)),
        ]);
      } catch { /* empty */ }

      const clearCode =
        "from machine import I2C, Pin\nimport ssd1306\n" +
        "i2c = I2C(0, scl=Pin(22), sda=Pin(21), freq=400000)\n" +
        "oled = ssd1306.SSD1306_I2C(128, 64, i2c)\n" +
        "oled.fill(0)\noled.show()\n";

      const enc = new TextEncoder();
      const CHUNK_SIZE = 256;
      for (let i = 0; i < clearCode.length; i += CHUNK_SIZE) {
        await writer.write(enc.encode(clearCode.slice(i, i + CHUNK_SIZE)));
        await delay(50);
      }
      await delay(200);
      await writer.write(new Uint8Array([0x04]));
      await delay(1000);

      addLog("// display cleared ✓");
      setIsAnimationRunning(false);
    } finally {
      try {
        await reader.cancel();
      } catch { /* empty */ }
      try {
        reader.releaseLock();
      } catch { /* empty */ }
      try {
        writer.releaseLock();
      } catch { /* empty */ }
      readerRef.current = null;
      writerRef.current = null;
    }
  };

  const connect = async () => {
    if (!("serial" in navigator)) return;

    try {
      setConnectionState("CONNECTING");
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 115200 });

      portRef.current = port;
      setPortInfo(port.getInfo());
      setConnectionState("CONNECTED");
      addLog("// system: device connected at 115200 baud");
      setHasMicroPython(true);
    } catch (err: any) {
      setConnectionState("ERROR");
      addLog(`// ERR: ${err.message || "connection failed"}`);
    }
  };

  const disconnect = async () => {
    try {
      if (readerRef.current) {
        await readerRef.current.cancel();
      }
      if (portRef.current) {
        await portRef.current.close();
      }
    } catch (e) {
      console.error(e);
    } finally {
      portRef.current = null;
      readerRef.current = null;
      writerRef.current = null;
      setConnectionState("DISCONNECTED");
      setPortInfo(null);
      setIsAnimationRunning(false);
      addLog("// system: disconnected");
    }
  };

  return (
    <SerialContext.Provider
      value={{
        isSupported,
        connectionState,
        portInfo,
        logs,
        isAnimationRunning,
        hasMicroPython,
        connect,
        disconnect,
        sendData,
        runAnimationOnDevice,
        stopAnimation,
        clearLogs,
        addLog,
      }}
    >
      {children}
    </SerialContext.Provider>
  );
};

export const useSerial = () => {
  const ctx = useContext(SerialContext);
  if (!ctx) throw new Error("useSerial must be used within SerialProvider");
  return ctx;
};
