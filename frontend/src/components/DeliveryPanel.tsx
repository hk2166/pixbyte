// DeliveryPanel.tsx — Flash / SD Card / WiFi streaming delivery modes
import { useState, useEffect, useRef, useCallback } from 'react';
import type { JobStats, DisplayConfig, DeliveryTab } from '../types';
import { downloadUrl, streamMetaUrl } from '../api';
import { getTransportLabel, getWiringGuide } from '../displayWiring';
import { flashOledPayloadOverUsb, OLED_RAW_FLASH_ADDRESS } from '../espFlash';
import type { UsbFlashStatus } from '../espFlash';

interface Props {
  jobId: string | null;
  stats: JobStats | null;
  config: Partial<DisplayConfig>;
  frameCount: number;
  fps: number;
}

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8888';

function supportsEmbeddedDriver(config: Partial<DisplayConfig>) {
  return [0, 1, 2].includes(config.driver_id ?? -1);
}

function getServerPort(baseUrl: string) {
  try {
    const url = new URL(baseUrl);
    if (url.port) {
      return url.port;
    }
    return url.protocol === 'https:' ? '443' : '80';
  } catch {
    return '8888';
  }
}

// Virtual Display Modal Component with Interactive Resizing
function VirtualDisplayModal({ jobId, config, fps, onClose }: {
  jobId: string; 
  config: Partial<DisplayConfig>; 
  fps: number;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [frames, setFrames] = useState<Uint8Array[]>([]);
  const [frameIdx, setFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [phosphorGreen, setPhosphorGreen] = useState(false);

  const width = config.width || 128;
  const height = config.height || 64;
  const playbackFps = fps || config.fps || 10;
  const interval = 1000 / playbackFps;

  // Fetch all frames
  useEffect(() => {
    const fetchFrames = async () => {
      try {
        const response = await fetch(`${BASE}/api/download/${jobId}`);
        const arrayBuffer = await response.arrayBuffer();
        const data = new Uint8Array(arrayBuffer);
        
        // Skip 16-byte header
        const frameData = data.slice(16);
        const frameSize = (width * height) / 8;
        const frameCount = Math.floor(frameData.length / frameSize);
        
        const frameList: Uint8Array[] = [];
        for (let i = 0; i < frameCount; i++) {
          const start = i * frameSize;
          const end = start + frameSize;
          frameList.push(frameData.slice(start, end));
        }
        
        setFrames(frameList);
      } catch (err) {
        console.error('Failed to load frames:', err);
      }
    };
    
    fetchFrames();
  }, [jobId, width, height]);

  // Convert page bytes to ImageData
  const pageBytesToImageData = useCallback((bytes: Uint8Array): ImageData => {
    const imgData = new ImageData(width, height);
    const data = imgData.data;
    
    const colorR = phosphorGreen ? 0 : 255;
    const colorG = phosphorGreen ? 255 : 255;
    const colorB = phosphorGreen ? 70 : 255;

    const pages = Math.floor(height / 8);
    for (let page = 0; page < pages; page++) {
      for (let col = 0; col < width; col++) {
        const byte = bytes[page * width + col];
        for (let bit = 0; bit < 8; bit++) {
          const row = page * 8 + bit;
          const bitVal = (byte >> bit) & 1;
          const idx = (row * width + col) * 4;
          if (bitVal) {
            data[idx] = colorR;
            data[idx+1] = colorG;
            data[idx+2] = colorB;
            data[idx+3] = 255;
          } else {
            data[idx] = 0;
            data[idx+1] = 0;
            data[idx+2] = 0;
            data[idx+3] = 255;
          }
        }
      }
    }
    return imgData;
  }, [width, height, phosphorGreen]);

  // Animation loop
  useEffect(() => {
    if (frames.length === 0) return;
    
    let animationId: number;
    let lastTime = 0;
    let currentFrameIdx = 0;
    
    const draw = (ts: number) => {
      if (!canvasRef.current) {
        animationId = requestAnimationFrame(draw);
        return;
      }
      
      if (playing && ts - lastTime >= interval) {
        lastTime = ts;
        const ctx = canvasRef.current.getContext('2d')!;
        const frame = frames[currentFrameIdx % frames.length];
        
        if (frame) {
          const imgData = pageBytesToImageData(frame);
          ctx.putImageData(imgData, 0, 0);
        }
        
        currentFrameIdx = (currentFrameIdx + 1) % frames.length;
        setFrameIdx(currentFrameIdx);
      }
      
      animationId = requestAnimationFrame(draw);
    };
    
    animationId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationId);
  }, [frames, interval, playing, pageBytesToImageData]);

  const scale = 3;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 900 }}>
        <div className="modal-header">
          <span className="label-cyan">// VIRTUAL DISPLAY PREVIEW</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        
        <div className="modal-body" style={{ gap: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Left: Display Preview */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
                <div style={{ textAlign: 'center', color: 'var(--text-dim)', fontSize: 11 }}>
                <strong style={{ color: 'var(--cyan)' }}>{config.driver || 'OLED'}</strong> — {width}×{height} @ {playbackFps}fps
                <br/>
                Frame {frameIdx + 1} / {frames.length}
              </div>

              <div style={{ 
                display: 'inline-flex', 
                flexDirection: 'column',
                border: '1px solid var(--border)',
                background: '#000',
                boxShadow: '0 0 0 4px #0d0d0d, 0 0 0 5px var(--border), 0 0 40px rgba(0, 0, 0, 0.8)',
                position: 'relative'
              }}>
                <div style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #333', background: '#000' }}>
                  <button 
                    className="btn-secondary" 
                    onClick={() => setPhosphorGreen(!phosphorGreen)} 
                    style={{ fontSize: 10, padding: '4px 8px', background: 'black', color: 'var(--cyan)', border: '1px solid var(--cyan)', marginRight: 8 }}
                  >
                    {phosphorGreen ? 'White' : 'Green'}
                  </button>
                  <button 
                    className="btn-secondary" 
                    onClick={() => setPlaying(!playing)} 
                    style={{ fontSize: 10, padding: '4px 8px', background: 'black', color: 'var(--cyan)', border: '1px solid var(--cyan)' }}
                  >
                    {playing ? '⏸ Pause' : '▶ Play'}
                  </button>
                </div>
                
                <div style={{ position: 'relative' }}>
                  <canvas
                    ref={canvasRef}
                    width={width}
                    height={height}
                    style={{ 
                      width: `${width * scale}px`, 
                      height: `${height * scale}px`,
                      imageRendering: 'pixelated', 
                      display: 'block'
                    }}
                  />
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: 'none',
                    background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.15) 0px, transparent 1px, transparent 2px, rgba(0,0,0,0.15) 3px)',
                    zIndex: 1
                  }} />
                </div>
              </div>
            </div>

            {/* Right: Scaling Behavior */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <div style={{ color: 'var(--cyan)', fontSize: 12, fontWeight: 'bold', marginBottom: 8 }}>
                  // Full-Stretch Export
                </div>
                <div style={{ color: 'var(--text-dim)', fontSize: 10, lineHeight: 1.6, marginBottom: 12 }}>
                  Every display target uses forced full-stretch scaling during conversion.
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ 
                    padding: '10px 12px',
                    border: '1px solid var(--cyan)',
                    borderRadius: 'var(--radius)',
                    background: 'var(--cyan-faint)',
                  }}>
                    <div style={{ 
                      color: 'var(--cyan)',
                      fontSize: 11,
                      fontWeight: 500,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}>
                      stretch
                    </div>
                    <div style={{ color: 'var(--text-dim)', fontSize: 10, marginTop: 2 }}>
                      The source video is always resized to exactly {width}x{height}. No letterboxing, no crop, no aspect-ratio preservation.
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ 
                padding: '10px 12px',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                fontSize: 10,
                color: 'var(--text-dim)',
                lineHeight: 1.6
              }}>
                <strong style={{ color: 'var(--cyan)' }}>ℹ️ Preview Mode:</strong> This canvas is rendering the same already-stretched frames that will be exported for the selected display.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <button 
              className="btn-download" 
              onClick={onClose}
              style={{ minWidth: 200 }}
            >
              Close Preview
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


function FlashTab({ jobId, stats, config, fps }: {
  jobId: string | null;
  stats: JobStats | null;
  config: Partial<DisplayConfig>;
  fps: number;
}) {
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [usbStatus, setUsbStatus] = useState<UsbFlashStatus>('idle');
  const [usbMessage, setUsbMessage] = useState('connect ESP32 over USB');
  const [usbProgress, setUsbProgress] = useState(0);
  const [usbLog, setUsbLog] = useState<string[]>([]);
  const readyToUpload = supportsEmbeddedDriver(config);
  const transportLabel = getTransportLabel(config);
  const wiringGuide = getWiringGuide(config);
  const canUseWebSerial = 'serial' in navigator;
  const isUsbBusy = ['fetching', 'connecting', 'flashing', 'resetting'].includes(usbStatus);

  const handleCopyCode = async () => {
    if (!jobId) return;
    
    setCopying(true);
    try {
      const response = await fetch(`${BASE}/api/download/${jobId}/ino`);
      if (!response.ok) throw new Error('Failed to fetch code');
      
      const code = await response.text();
      await navigator.clipboard.writeText(code);
      
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
      alert('Failed to copy code. Please try downloading the file instead.');
    } finally {
      setCopying(false);
    }
  };

  const handleUsbFlash = async () => {
    if (!jobId) return;

    setUsbStatus('idle');
    setUsbProgress(0);
    setUsbLog([]);

    try {
      await flashOledPayloadOverUsb(jobId, {
        onStatus: (status, message) => {
          setUsbStatus(status);
          setUsbMessage(message);
        },
        onProgress: setUsbProgress,
        onLog: (line) => {
          setUsbLog(prev => [...prev.slice(-5), line]);
        },
      });
    } catch (error) {
      setUsbStatus('error');
      setUsbMessage(error instanceof Error ? error.message : 'USB flash failed');
    }
  };

  return (
    <div className="delivery-content">
      <div className="delivery-left">
        <div className="stats-grid">
          <div className="stat-cell">
            <div className="stat-key">// size</div>
            <div className="stat-val">{stats ? `${stats.total_kb} KB` : '—'}</div>
          </div>
          <div className="stat-cell">
            <div className="stat-key">// frames</div>
            <div className="stat-val">{stats?.frame_count ?? '—'}</div>
          </div>
          <div className="stat-cell">
            <div className="stat-key">// duration</div>
            <div className="stat-val">{stats ? `${stats.duration_s}s` : '—'}</div>
          </div>
          <div className="stat-cell">
            <div className="stat-key">// frame_sz</div>
            <div className="stat-val">{stats ? `${stats.frame_size_bytes}B` : '—'}</div>
          </div>
        </div>

        <div className="info-box" style={{ background: 'var(--bg-card)', borderColor: 'var(--green)' }}>
          <span style={{ color: 'var(--green)' }}>✓</span>
          <div>
            <strong style={{ color: 'var(--green)' }}>
              {readyToUpload ? 'Ready to Upload' : 'Custom Driver Required'}
            </strong><br/>
            {readyToUpload
              ? 'Download the complete Arduino sketch below. All video frames are embedded in the code, so you can open it in Arduino IDE and flash it directly.'
              : 'The generated sketch embeds the converted frame data and board constants, but you still need to add the display-specific init and frame-push code for this target.'}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '20px' }}>
          <button 
            className="btn-download" 
            onClick={() => setShowPreview(true)}
            disabled={!jobId || !stats}
            style={{ 
              borderColor: 'var(--cyan)', 
              color: 'var(--cyan)', 
              width: '100%',
              padding: '14px', 
              fontSize: '15px', 
              fontWeight: 'bold',
              display: 'flex', 
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            👁️ PREVIEW ON VIRTUAL DISPLAY
          </button>

          <button
            className="btn-download"
            onClick={handleUsbFlash}
            disabled={!jobId || !stats || !canUseWebSerial || isUsbBusy}
            style={{
              borderColor: usbStatus === 'done' ? 'var(--green)' : usbStatus === 'error' ? 'var(--red)' : 'var(--amber)',
              color: usbStatus === 'done' ? 'var(--green)' : usbStatus === 'error' ? 'var(--red)' : 'var(--amber)',
              width: '100%',
              padding: '14px',
              fontSize: '14px',
              fontWeight: 'bold',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {isUsbBusy && <div className="spinner" style={{ width: 14, height: 14 }} />}
            {usbStatus === 'done' ? 'USB FLASH COMPLETE' : 'FLASH .OLED TO ESP32 (USB)'}
          </button>

          <div className={`usb-flash-box ${usbStatus === 'error' ? 'error' : usbStatus === 'done' ? 'done' : ''}`}>
            <div className="usb-flash-row">
              <span>{usbMessage}</span>
              <span>{usbProgress}%</span>
            </div>
            <div className="usb-flash-track">
              <div className="usb-flash-fill" style={{ width: `${usbProgress}%` }} />
            </div>
            <div className="usb-flash-help">
              Requires the player firmware already flashed in <span>MODE_RAW_FLASH</span>. Data is written to <span>0x{OLED_RAW_FLASH_ADDRESS.toString(16)}</span>.
            </div>
            {usbLog.length > 0 && (
              <div className="usb-flash-log">
                {usbLog.map((line, index) => (
                  <div key={`${index}-${line}`}>{line}</div>
                ))}
              </div>
            )}
          </div>

          <a
            href={jobId ? `${BASE}/api/download/${jobId}/ino` : '#'}
            download={`oled_player_${jobId}.ino`}
            style={{ textDecoration: 'none' }}
          >
            <button 
              className="btn-download" 
              style={{ 
                borderColor: 'var(--green)', color: 'var(--green)', width: '100%',
                padding: '16px', fontSize: '16px', fontWeight: 'bold',
                display: 'flex', justifyContent: 'center', boxShadow: '0 0 15px rgba(0, 255, 100, 0.1)'
              }} 
              disabled={!jobId || !stats}
            >
              ↓ DOWNLOAD .INO FILE
            </button>
          </a>

          <button 
            className="btn-download" 
            onClick={handleCopyCode}
            disabled={!jobId || !stats || copying}
            style={{ 
              borderColor: copied ? 'var(--green)' : 'var(--cyan)', 
              color: copied ? 'var(--green)' : 'var(--cyan)', 
              width: '100%',
              fontSize: '14px',
              display: 'flex', 
              justifyContent: 'center',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            {copying ? (
              <>
                <div className="spinner" style={{ width: 14, height: 14 }} />
                Copying...
              </>
            ) : copied ? (
              <>
                ✓ Copied to Clipboard!
              </>
            ) : (
              <>
                📋 Copy Code to Clipboard
              </>
            )}
          </button>
          
          <a
            href={jobId ? downloadUrl(jobId) : '#'}
            download={`display_${jobId}.oled`}
            style={{ textDecoration: 'none' }}
          >
            <button className="btn-download" disabled={!jobId || !stats} style={{ fontSize: '12px', padding: '8px' }}>
              ↓ Download .oled binary (advanced)
            </button>
          </a>
        </div>

        {showPreview && jobId && (
          <VirtualDisplayModal 
            jobId={jobId} 
            config={config}
            fps={fps}
            onClose={() => setShowPreview(false)} 
          />
        )}

        <div style={{ marginTop: '24px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
          <div style={{ color: 'var(--text-dim)', fontSize: 11, lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--cyan)' }}>How to use:</strong><br/>
            1. Download the .ino file above<br/>
            2. Open it in Arduino IDE<br/>
            3. Select <code style={{ color: 'var(--green)' }}>Tools → Board → ESP32 Dev Module</code><br/>
            4. Connect your ESP32 via USB<br/>
            5. Click Upload (Ctrl+U / Cmd+U)<br/>
            6. Video plays automatically after upload!
          </div>
        </div>
      </div>

      <div className="delivery-right" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <pre className="code-block" style={{ flex: 1 }}>
          <span className="cmt">{'// Arduino IDE Upload Steps'}</span>{'\n\n'}
          <span className="kw">1.</span> Open the downloaded .ino file{'\n'}
          <span className="kw">2.</span> Tools → Board → ESP32 Dev Module{'\n'}
          <span className="kw">3.</span> Tools → Port → (select your ESP32){'\n'}
          <span className="kw">4.</span> Sketch → Upload{'\n\n'}
          <span className="cmt">{'// The sketch includes:'}</span>{'\n'}
          {'   • All '}<span className="num">{stats?.frame_count ?? 0}</span> frames embedded{'\n'}
          {readyToUpload
            ? <>   • Complete {transportLabel} driver code{'\n'}</>
            : <>   • Driver TODO markers for custom display support{'\n'}</>}
          {'   • Optimized for '}<span className="num">{fps || stats?.fps || 0}</span>fps playback{'\n'}
          {'   • Auto-configured for '}<span className="num">{config.width ?? 128}</span>x<span className="num">{config.height ?? 64}</span>{'\n'}
        </pre>
        
        {config && (
          <div className="code-block" style={{ height: 'auto', minHeight: 90, padding: 0 }}>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
              <span className="cmt">// wiring: {wiringGuide.title} · {wiringGuide.interfaceLabel}</span>
            </div>
            
            <div className="wiring-panel">
              {wiringGuide.pins.map(pin => (
                <div className="wiring-row" key={pin.label}>
                  <span className="kw">{pin.label}</span>
                  <span className="label-dim">→</span>
                  <span className="num">
                    {pin.target}
                    {pin.note && <span className="label-dim"> ({pin.note})</span>}
                  </span>
                </div>
              ))}
              {wiringGuide.note && <div className="wiring-note">{wiringGuide.note}</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DeliveryPanel({ jobId, stats, config, frameCount, fps }: Props) {
  const [tab, setTab] = useState<DeliveryTab>('flash');
  const tabs: { id: DeliveryTab; label: string }[] = [
    { id: 'flash',   label: '// flash_mode' }
  ];

  return (
    <div className="delivery-panel">
      <div className="delivery-tabs">
        {tabs.map(t => (
          <button
            key={t.id}
            className={`delivery-tab${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
        {stats && (
          <span
            className={`size-badge ${stats.delivery_mode === 'flash' ? 'flash' : 'sd'}`}
            style={{ marginLeft: 'auto', alignSelf: 'center', marginRight: 12 }}
          >
            {stats.delivery_mode === 'flash' ? '⬤ flash safe' : '▲ sd required'}
          </span>
        )}
      </div>

      {tab === 'flash'   && <FlashTab jobId={jobId} stats={stats} config={config} fps={fps} />}
      
      
    </div>
  );
}
