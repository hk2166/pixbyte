// App.tsx — Main application shell with two modes: Video Converter + Animation Library
import { useState, useEffect, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import DisplayCard from './components/DisplayCard';
import OLEDPreview from './components/OLEDPreview';
import DeliveryPanel from './components/DeliveryPanel';
import AnimationBrowser from './components/AnimationBrowser';
import { fetchDisplays, uploadVideo, startProcessing, subscribeStatus } from './api';
import { getWiringGuide } from './displayWiring';
import { useSerial } from './context/SerialContext';
import type { DisplayConfig, DisplayKey, ProcessingState, VideoInfo } from './types';
import './index.css';

type AppMode = 'converter' | 'animations';

const INITIAL_STATE: ProcessingState = {
  status: 'idle',
  progress: 0,
  message: '// ready_',
  jobId: null,
  stats: null,
  previews: [],
  frameCount: 0,
  fps: 0,
  config: {},
};

export default function App() {
  const [mode, setMode] = useState<AppMode>('converter');
  const [displays, setDisplays] = useState<DisplayConfig[]>([]);

  const [selectedDisplay, setSelectedDisplay] = useState<DisplayKey>('ssd1306_128x64');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [useDither, setUseDither] = useState(true);
  const [dedupThreshold, setDedupThreshold] = useState(0.02);
  const [customFps, setCustomFps] = useState<number | null>(null);
  const [proc, setProc] = useState<ProcessingState>(INITIAL_STATE);
  const [showWiring, setShowWiring] = useState(false);
  const unsubRef = useRef<(() => void) | null>(null);

  const { connectionState, connect, disconnect, isSupported: serialSupported } = useSerial();

  const getErrorMessage = (error: unknown) => (
    error instanceof Error ? error.message : 'unexpected failure'
  );

  // Load display configs on mount
  useEffect(() => {
    fetchDisplays()
      .then(d => setDisplays(d.displays))
      .catch(() => {
        // Fallback display configs if backend not yet running
        setDisplays([
          { key: 'sh1106_128x64',  driver: 'SH1106',   driver_id: 1, width: 128, height: 64, fps: 8,  label: '1.3" OLED (I2C)' },
          { key: 'sh1106_128x64_spi',  driver: 'SH1106',   driver_id: 1, width: 128, height: 64, fps: 15,  label: '1.3" OLED (SPI)' },
          { key: 'ssd1106_128x64', driver: 'SSD1106',  driver_id: 2, width: 128, height: 64, fps: 8,  label: '1.3" OLED (SSD)' },
          { key: 'ssd1306_128x64', driver: 'SSD1306',  driver_id: 0, width: 128, height: 64, fps: 10, label: '0.96" OLED (I2C)' },
          { key: 'ssd1306_128x64_spi', driver: 'SSD1306',  driver_id: 0, width: 128, height: 64, fps: 15, label: '0.96" OLED (SPI)' },
          { key: 'ssd1306_128x32', driver: 'SSD1306',  driver_id: 0, width: 128, height: 32, fps: 15, label: '0.96" OLED 32px' },
          { key: 'ili9341_320x240', driver: 'ILI9341', driver_id: 3, width: 320, height: 240, fps: 15, label: '2.8" SPI TFT' },
          { key: 'st7735_160x128',  driver: 'ST7735',  driver_id: 4, width: 160, height: 128, fps: 15, label: '1.8" SPI TFT' },
          { key: 'st7789_240x240',  driver: 'ST7789',  driver_id: 5, width: 240, height: 240, fps: 15, label: '1.54" SPI TFT' },
          { key: 'max7219_8x8',     driver: 'MAX7219', driver_id: 6, width: 8,   height: 8,   fps: 2,  label: 'LED Matrix' },
          { key: 'hd44780_16x2',    driver: 'HD44780', driver_id: 7, width: 80,  height: 16,  fps: 1,  label: '16x2 LCD' },
        ] as DisplayConfig[]);
      });
  }, []);

  useEffect(() => () => unsubRef.current?.(), []);

  // Dropzone
  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) {
      setVideoFile(accepted[0]);
      setVideoInfo(null);
      setProc(INITIAL_STATE);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'video/*': ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.gif'] },
    multiple: false,
  });

  const handleDisplaySelect = useCallback((key: DisplayKey) => {
    if (key === selectedDisplay) return;

    unsubRef.current?.();
    unsubRef.current = null;
    setSelectedDisplay(key);
    setCustomFps(null);
    setProc(INITIAL_STATE);
  }, [selectedDisplay]);

  const selectedConfig = displays.find(d => d.key === selectedDisplay);
  const wiringGuide = getWiringGuide(selectedConfig);
  const effectiveFps = customFps ?? selectedConfig?.fps ?? 10;

  const handleProcess = async () => {
    if (!videoFile) return;
    if (unsubRef.current) unsubRef.current();

    setProc({ ...INITIAL_STATE, status: 'uploading', message: '// uploading file_', progress: 2 });

    try {
      // Upload
      const { job_id, info } = await uploadVideo(videoFile);
      setVideoInfo(info);
      setProc(p => ({ ...p, jobId: job_id, status: 'queued', progress: 10, message: '// queued for processing_' }));

      // Start processing
      await startProcessing({
        job_id,
        display_key: selectedDisplay,
        target_fps: customFps ?? undefined,
        use_dither: useDither,
        dedup_threshold: dedupThreshold,
      });

      setProc(p => ({ ...p, status: 'processing', progress: 15, message: '// pipeline started_' }));

      // Subscribe to SSE
      const unsub = subscribeStatus(
        job_id,
        (data) => {
          setProc(p => ({
            ...p,
            progress: data.progress,
            message: data.message,
            status: data.status,
            ...(data.status === 'done' ? {
              stats: data.stats,
              previews: data.previews ?? [],
              frameCount: data.frame_count ?? 0,
              fps: data.fps ?? effectiveFps,
              config: data.config ?? {},
            } : {}),
          }));
        },
        () => {}
      );
      unsubRef.current = unsub;
    } catch (error: unknown) {
      setProc(p => ({ ...p, status: 'error', message: `// error: ${getErrorMessage(error)}`, progress: 0 }));
    }
  };

  const isProcessing = proc.status === 'processing' || proc.status === 'uploading' || proc.status === 'queued';
  const isDone = proc.status === 'done';
  const isError = proc.status === 'error';

  const previewWidth = selectedConfig?.width ?? 128;
  const previewHeight = selectedConfig?.height ?? 64;

  // Status dot
  let dotClass = '';
  if (isDone) dotClass = 'connected';
  else if (isProcessing) dotClass = 'processing';

  const statusText = isProcessing
    ? `// ${proc.message.replace('// ', '')}`
    : isDone
    ? `// done · ${proc.stats?.total_kb ?? 0}KB`
    : isError
    ? `// error`
    : '// idle';

  // Serial connection chip
  const chipContent = {
    DISCONNECTED: { icon: '○', text: 'not_connected', colorClass: 'chip-dim' },
    CONNECTING:   { icon: '◌', text: 'connecting...', colorClass: 'chip-yellow' },
    CONNECTED:    { icon: '●', text: 'serial_device · 115200', colorClass: 'chip-green' },
    ERROR:        { icon: '✕', text: 'connection_failed · retry?', colorClass: 'chip-red' },
  }[connectionState];

  const handleChipClick = () => {
    switch (connectionState) {
      case 'DISCONNECTED':
      case 'ERROR':
        connect();
        break;
      case 'CONNECTED':
        disconnect();
        break;
      default:
        break;
    }
  };

  return (
    <div className="app-shell">
      {/* ── Top Bar ─────────────────────────────────────────────────────── */}
      <header className="topbar no-select">
        <div className="topbar-left">
          <span className="logo">
            {mode === 'converter'
              ? `0x${selectedConfig?.driver_id === 1 ? '1106' : '1306'}`
              : '0x1306'}
          </span>
          <span className="logo-sub">
            {mode === 'converter'
              ? '// oled video converter for esp32'
              : '// oled animation tool for esp32'}
          </span>
        </div>

        {/* Mode Tabs */}
        <div className="topbar-tabs">
          <button
            className={`topbar-tab${mode === 'converter' ? ' active' : ''}`}
            onClick={() => setMode('converter')}
          >
            // video_converter
          </button>
          <button
            className={`topbar-tab${mode === 'animations' ? ' active' : ''}`}
            onClick={() => setMode('animations')}
          >
            // animation_library
          </button>
        </div>

        <div className="topbar-right">
          {mode === 'converter' && (
            <>
              <button className="btn-secondary" style={{ padding: '4px 8px', fontSize: 10, marginRight: 8 }} onClick={() => setShowWiring(true)}>
                // wiring_helper
              </button>
              <span className="label-dim">{statusText}</span>
              <div className={`status-dot ${dotClass}`} />
            </>
          )}
          {mode === 'animations' && (
            <button
              onClick={handleChipClick}
              disabled={connectionState === 'CONNECTING'}
              className={`serial-chip ${chipContent.colorClass}`}
            >
              <span>{chipContent.icon}</span>
              <span>{chipContent.text}</span>
            </button>
          )}
        </div>
      </header>

      {!serialSupported && (
        <div style={{ margin: '16px 24px 0 24px', padding: 12, background: 'var(--amber)', color: '#000', borderRadius: 'var(--radius)', fontSize: 13, fontWeight: 'bold', textAlign: 'center' }}>
          ⚠ Your browser does not support WebSerial. Please use Chrome or Edge.
        </div>
      )}

      {/* ── Converter Mode ─────────────────────────────────────────────── */}
      {mode === 'converter' && (
        <div className="main-content">
          {/* ── Left Panel ──────────────────────────────────────────────── */}
          <aside className="left-panel">

            {/* Upload */}
            <div className="section">
              <div className="section-header">
                <span className="section-title">// upload_video</span>
                {videoFile && <span className="label-dim">{(videoFile.size / 1024 / 1024).toFixed(1)}MB</span>}
              </div>
              <div {...getRootProps()} className={`drop-zone${isDragActive ? ' active' : ''}`}>
                <input {...getInputProps()} id="video-file-input" />
                {!videoFile ? (
                  <>
                    <div className="drop-icon">▶</div>
                    <div className="drop-text">
                      drop video or <span>click to browse</span>
                    </div>
                    <div className="drop-hint">MP4 · MOV · AVI · MKV · WEBM · GIF</div>
                  </>
                ) : (
                  <div className="drop-text" style={{ color: 'var(--cyan)' }}>
                    ✓ {videoFile.name}
                  </div>
                )}
              </div>
              {videoFile && (
                <div className="file-info-row">
                  <span className="file-name">{videoFile.name}</span>
                  {videoInfo?.duration && (
                    <span className="label-dim" style={{ marginRight: 8 }}>
                      {videoInfo.duration.toFixed(1)}s
                    </span>
                  )}
                  <button className="file-clear" onClick={() => { setVideoFile(null); setProc(INITIAL_STATE); }}>✕</button>
                </div>
              )}
            </div>

            {/* Display Selection */}
            <div className="section">
              <div className="section-header">
                <span className="section-title">// select_display</span>
              </div>
              <div className="display-grid">
                {displays.map(d => (
                  <DisplayCard
                    key={d.key}
                    config={d}
                    selected={d.key === selectedDisplay}
                    onSelect={handleDisplaySelect}
                  />
                ))}
              </div>
            </div>

            {/* Processing Options */}
            <div className="section">
              <div className="section-header">
                <span className="section-title">// processing_options</span>
              </div>

              {/* FPS slider */}
              <div className="control-row">
                <span className="control-label">fps</span>
                <div className="slider-wrap">
                  <input
                    type="range" min={5} max={15} step={1}
                    value={effectiveFps}
                    onChange={e => setCustomFps(Number(e.target.value))}
                  />
                  <span className="slider-val">{effectiveFps}</span>
                </div>
              </div>

              {/* Dedup threshold */}
              <div className="control-row">
                <span className="control-label">dedup</span>
                <div className="slider-wrap">
                  <input
                    type="range" min={0} max={0.1} step={0.005}
                    value={dedupThreshold}
                    onChange={e => setDedupThreshold(Number(e.target.value))}
                  />
                  <span className="slider-val">{(dedupThreshold * 100).toFixed(1)}%</span>
                </div>
              </div>

              {/* Dithering toggle */}
              <div className="toggle-row">
                <span className="toggle-label">floyd-steinberg dithering</span>
                <button
                  className={`toggle${useDither ? ' on' : ''}`}
                  onClick={() => setUseDither(v => !v)}
                  aria-pressed={useDither}
                  id="dither-toggle"
                />
              </div>

              <div className="divider" />
            </div>

            {/* Process Button */}
            <div className="section">
              <button
                className={`btn-process${isProcessing ? ' processing' : ''}`}
                onClick={handleProcess}
                disabled={!videoFile || isProcessing}
                id="process-btn"
              >
                {isProcessing ? (
                  <><div className="spinner" /> {proc.message}</>
                ) : (
                  <>▶ PROCESS VIDEO</>
                )}
              </button>

              {(isProcessing || isDone || isError) && (
                <div className="progress-wrap">
                  <div className="progress-track">
                    <div
                      className={`progress-fill${isDone ? ' done' : isError ? ' error' : ''}`}
                      style={{ width: `${proc.progress}%` }}
                    />
                  </div>
                  <span className="progress-msg">{proc.message}</span>
                </div>
              )}
            </div>
          </aside>

          {/* ── Right Panel ─────────────────────────────────────────────── */}
          <main className="right-panel">
            {/* Preview Area */}
            <div className="preview-area">
              <div className="preview-topbar">
                <span className="label-dim">// preview</span>
                <span className="frame-counter">
                  {isDone
                    ? `frame_${String(proc.frameCount).padStart(4, '0')} · ${proc.fps || effectiveFps}fps · ${previewWidth}×${previewHeight}`
                    : `${previewWidth}×${previewHeight} · 1-bit`}
                </span>
              </div>

              <div className="preview-canvas-wrap">
                {isDone && proc.previews.length > 0 ? (
                  <OLEDPreview
                    previews={proc.previews}
                    fps={proc.fps || effectiveFps}
                    width={previewWidth}
                    height={previewHeight}
                  />
                ) : (
                  <div className="preview-empty">
                    <div className="preview-empty-icon">▣</div>
                    <span className="label-dim">
                      {isProcessing ? proc.message : '// awaiting processed frames_'}
                    </span>
                    {isProcessing && <div className="spinner" style={{ color: 'var(--cyan-dim)' }} />}
                  </div>
                )}
              </div>
            </div>

            {/* Delivery Panel */}
            <DeliveryPanel
              jobId={proc.jobId}
              stats={proc.stats}
              config={selectedConfig || proc.config || {}}
              frameCount={proc.frameCount}
              fps={proc.fps || effectiveFps}
            />
          </main>
        </div>
      )}

      {/* ── Animation Library Mode ─────────────────────────────────────── */}
      {mode === 'animations' && (
        <AnimationBrowser />
      )}

      {/* ── Wiring Guide Modal ────────────────────────────────────────── */}
      {showWiring && (
        <div className="modal-overlay" onClick={() => setShowWiring(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="label-cyan">
                // esp32_wroom_v1_wiring · {wiringGuide.title}
              </span>
              <button className="modal-close" onClick={() => setShowWiring(false)}>✕</button>
            </div>
            <div className="modal-body">
              {wiringGuide.imageSrc && (
                <img
                  src={wiringGuide.imageSrc}
                  alt="ESP32 Wiring Helper"
                  className="wiring-img"
                />
              )}
              <div className="wiring-text">
                <span className="label-dim">// {wiringGuide.interfaceLabel} pinout:</span>
                <div className="wiring-grid">
                  {wiringGuide.pins.map(pin => (
                    <div className="wiring-row" key={pin.label}>
                      <span className="value">{pin.label}</span>
                      <span className="label-dim">→</span>
                      <span className="value">
                        {pin.target}
                        {pin.note && <span className="label-dim"> ({pin.note})</span>}
                      </span>
                    </div>
                  ))}
                </div>
                {wiringGuide.note && <div className="wiring-note">{wiringGuide.note}</div>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
