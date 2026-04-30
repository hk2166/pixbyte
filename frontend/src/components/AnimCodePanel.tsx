// AnimCodePanel.tsx — Code output & preview for selected animation (ported from pixbyte RightPanel)
import { useState, useEffect, useRef } from 'react';
import type { OLEDAnimation } from '../data/animations';
import AnimOLEDCanvas from './AnimOLEDCanvas';
import { useSerial } from '../context/SerialContext';

interface Props {
  animation: OLEDAnimation;
  size: number;
}

export default function AnimCodePanel({ animation, size }: Props) {
  const [activeCodeTab, setActiveCodeTab] = useState<'arduino_c++' | 'micropython'>('arduino_c++');
  const [copied, setCopied] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [prereqCollapsed, setPrereqCollapsed] = useState(false);
  const [prereqErrorHighlight, setPrereqErrorHighlight] = useState<number | null>(null);
  const [prereqSuccessFlash, setPrereqSuccessFlash] = useState(false);

  const {
    connectionState,
    logs,
    clearLogs,
    hasMicroPython,
    runAnimationOnDevice,
    stopAnimation,
    isAnimationRunning,
  } = useSerial();
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const codeEl = document.getElementById('code-output-scroll');
    if (codeEl) codeEl.scrollTop = 0;
  }, [animation, activeCodeTab, size]);

  useEffect(() => {
    const saved = localStorage.getItem('prereq_collapsed');
    if (saved === 'true') {
      setPrereqCollapsed(true);
    }
  }, []);

  useEffect(() => {
    if (logs.length === 0) return;
    const lastLog = logs[logs.length - 1];

    if (lastLog.includes('raw REPL not detected')) {
      setPrereqErrorHighlight(1);
      setPrereqCollapsed(false);
      localStorage.setItem('prereq_collapsed', 'false');
    } else if (lastLog.includes('ImportError') && lastLog.includes('ssd1306')) {
      setPrereqErrorHighlight(2);
      setPrereqCollapsed(false);
      localStorage.setItem('prereq_collapsed', 'false');
    } else if (
      lastLog.includes('OSError') &&
      (lastLog.includes('I2C') || lastLog.includes('ENODEV') || lastLog.includes('19') || lastLog.includes('I2C bus error'))
    ) {
      setPrereqErrorHighlight(3);
      setPrereqCollapsed(false);
      localStorage.setItem('prereq_collapsed', 'false');
    } else if (lastLog.includes('animation running ✓')) {
      setPrereqSuccessFlash(true);
      setTimeout(() => setPrereqSuccessFlash(false), 2000);
      setPrereqErrorHighlight(null);
    }
  }, [logs]);

  const togglePrereq = () => {
    const newState = !prereqCollapsed;
    setPrereqCollapsed(newState);
    localStorage.setItem('prereq_collapsed', newState.toString());
  };

  const downloadSsd1306 = () => {
    const link = document.createElement('a');
    link.href = '/ssd1306.py';
    link.download = 'ssd1306.py';
    link.click();
  };

  useEffect(() => {
    if (terminalOpen && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, terminalOpen]);

  const handleCopy = () => {
    const code =
      activeCodeTab === 'arduino_c++'
        ? animation.getArduinoCode(size)
        : animation.getMicroPythonCode(size);

    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const togglePreview = async () => {
    if (isAnimationRunning) {
      await stopAnimation();
    } else {
      setTerminalOpen(true);
      const codeStr = animation.getMicroPythonCode(size);
      await runAnimationOnDevice(codeStr);
    }
  };

  const isConnected = connectionState === 'CONNECTED';
  const runTooltip = !isConnected
    ? '// connect esp32 to enable'
    : '// connect esp32 · requires micropython';

  const codeToShow =
    activeCodeTab === 'arduino_c++'
      ? animation.getArduinoCode(size)
      : animation.getMicroPythonCode(size);

  const codeLines = codeToShow.split('\n');

  return (
    <div className="anim-right-panel">
      {/* MicroPython Alert */}
      {isConnected && !hasMicroPython && (
        <div className="anim-alert-warn">
          <span>{"// ⚠ micropython not detected on this device · flash micropython first"}</span>
          <a href="https://micropython.org/download/ESP32_GENERIC" target="_blank" rel="noreferrer" className="anim-alert-link">
            download
          </a>
        </div>
      )}

      {/* SECTION 1: OLED Preview */}
      <section className="anim-preview-section">
        <div className="label-dim" style={{ fontSize: 11, marginBottom: 8, marginTop: 8 }}>{"// preview"}</div>
        <AnimOLEDCanvas animation={animation} size={size} scale={4} showCounter={true} />
      </section>

      {/* SECTION 2: Action Buttons */}
      <section className="anim-action-grid">
        <button
          disabled={!isConnected}
          title={runTooltip}
          onClick={togglePreview}
          className={`anim-action-btn ${
            isAnimationRunning ? 'stop' : isConnected ? 'primary' : 'disabled'
          }`}
        >
          {isAnimationRunning ? '⏹ stop_preview' : '▶ run_on_device'}
        </button>
        <button
          onClick={() => setDownloadModalOpen(true)}
          className="anim-action-btn primary"
        >
          ↓ download & flash
        </button>
        <button
          onClick={handleCopy}
          className="anim-action-btn primary"
        >
          📋 copy_code
        </button>
        <button
          onClick={() => {
            const isPy = activeCodeTab === 'micropython';
            const code = isPy
              ? animation.getMicroPythonCode(size)
              : animation.getArduinoCode(size);
            const blob = new Blob([code], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = isPy ? 'main.py' : `${animation.name}.ino`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }}
          className="anim-action-btn primary"
          style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}
        >
          <span>↓ download</span>
          <span style={{ fontSize: 8, opacity: 0.75 }}>
            {activeCodeTab === 'micropython' ? '.py' : '.ino'}
          </span>
        </button>
      </section>

      {/* SECTION 2.5: Prerequisites Card */}
      <section className="anim-prereq-card">
        <div onClick={togglePrereq} className={`anim-prereq-header${!prereqCollapsed ? ' open' : ''}`}>
          <div>
            <span className="label-dim">{"// "}</span>run_on_device · setup required
          </div>
          <div className="label-dim">{prereqCollapsed ? '[▶]' : '[▼]'}</div>
        </div>

        {!prereqCollapsed && (
          <div className="anim-prereq-body">
            {/* Step 1 */}
            <div className={`anim-prereq-step${prereqErrorHighlight === 1 ? ' error' : prereqSuccessFlash ? ' success' : ''}`}>
              <div className="anim-prereq-step-title">
                <span className="anim-prereq-num">①</span> flash micropython firmware to your esp32
              </div>
              <a href="https://micropython.org/download/ESP32_GENERIC/" target="_blank" rel="noreferrer" className="anim-action-btn primary" style={{ width: 'fit-content', marginTop: 4 }}>
                [↓ download micropython]
              </a>
              <div className="label-dim" style={{ fontSize: 11 }}>
                {"// one-time setup · takes ~2 min"}
                {prereqErrorHighlight === 1 && (
                  <span style={{ color: 'var(--red)', marginLeft: 8 }}>· micropython not found on device</span>
                )}
              </div>
            </div>

            {/* Step 2 */}
            <div className={`anim-prereq-step${prereqErrorHighlight === 2 ? ' error' : prereqSuccessFlash ? ' success' : ''}`}>
              <div className="anim-prereq-step-title">
                <span className="anim-prereq-num">②</span> upload ssd1306.py to your board
              </div>
              <button onClick={downloadSsd1306} className="anim-action-btn primary" style={{ width: 'fit-content', marginTop: 4 }}>
                [↓ download ssd1306.py]
              </button>
              <div className="label-dim" style={{ fontSize: 11 }}>
                {"// place in /lib folder on your esp32"}
                {prereqErrorHighlight === 2 && (
                  <span style={{ color: 'var(--red)', marginLeft: 8 }}>· ssd1306.py not found on device</span>
                )}
              </div>
            </div>

            {/* Step 3 */}
            <div className={`anim-prereq-step${prereqErrorHighlight === 3 ? ' error' : prereqSuccessFlash ? ' success' : ''}`}>
              <div className="anim-prereq-step-title">
                <span className="anim-prereq-num">③</span> wire your oled display
              </div>
              <div style={{ marginLeft: 20, lineHeight: 1.6, marginTop: 4, fontSize: 11 }}>
                SDA → <span style={{ color: 'var(--cyan)' }}>GPIO21</span> · SCL → <span style={{ color: 'var(--cyan)' }}>GPIO22</span>
                <br />
                VCC → <span style={{ color: 'var(--cyan)' }}>3.3V</span> · GND → <span style={{ color: 'var(--cyan)' }}>GND</span>
              </div>
              {prereqErrorHighlight === 3 && (
                <div style={{ color: 'var(--red)', fontSize: 11, marginTop: 4 }}>{"// oled not detected · check wiring"}</div>
              )}
            </div>

            <div style={{ color: 'var(--green)', paddingTop: 12, borderTop: '1px solid var(--border)', marginTop: 12, lineHeight: 1.6, fontSize: 11 }}>
              {"// arduino_c++ tab works without any of this"}
              <br />
              {"// copy code → arduino ide → upload directly"}
            </div>
          </div>
        )}
      </section>

      {/* SECTION 3: Code Output */}
      <section className="anim-code-section">
        <div className="anim-code-tabs">
          {(['arduino_c++', 'micropython'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveCodeTab(tab)}
              className={`anim-code-tab${activeCodeTab === tab ? ' active' : ''}`}
            >
              {"// "}{tab}
            </button>
          ))}
        </div>

        <div className="anim-code-output">
          <button onClick={handleCopy} className="anim-code-copy-btn">
            {copied ? '// copied!' : '[copy]'}
          </button>

          <div id="code-output-scroll" className="anim-code-scroll">
            <pre className="anim-code-pre">
              <div className="anim-code-lines">
                {codeLines.map((_, i) => (
                  <span key={i}>{i + 1}</span>
                ))}
              </div>
              <code className="anim-code-content">{codeToShow}</code>
            </pre>
          </div>
        </div>
      </section>

      {/* SECTION 4: Serial Terminal Panel */}
      <section className="anim-terminal-section">
        <button
          onClick={() => setTerminalOpen(!terminalOpen)}
          className="anim-terminal-toggle"
        >
          {`// serial_monitor ${terminalOpen ? '▲' : '▼'}`}
        </button>

        {terminalOpen && (
          <div className="anim-terminal">
            <button onClick={clearLogs} className="anim-terminal-clear">[clear]</button>
            <div className="anim-terminal-logs">
              {logs.map((log, i) => {
                if (log === '[[MIP_INSTALL_BUTTON]]') return null;

                let colorClass = '';
                if (log.includes('adjusting address') || log.includes('warning')) colorClass = 'warn';
                if (log.includes('no devices found') || log.includes('ERR:')) colorClass = 'error';

                return <span key={i} className={colorClass}>{log}</span>;
              })}
              <div className="anim-terminal-cursor">
                <span>&gt;</span>
                <span className="anim-cursor-blink" />
              </div>
              <div ref={terminalEndRef} />
            </div>
          </div>
        )}
      </section>

      {/* Download & Flash Modal */}
      {downloadModalOpen && (
        <div className="modal-overlay" onClick={() => setDownloadModalOpen(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <span className="label-dim">{"// get_code_on_your_esp32"}</span>
              <button className="modal-close" onClick={() => setDownloadModalOpen(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ gap: 16 }}>
              <p style={{ fontSize: 11, color: 'var(--text)' }}>choose your method:</p>

              {/* Option A */}
              <div style={{ border: '1px solid var(--border)', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ color: 'var(--cyan)', fontSize: 11 }}>OPTION A · arduino ide (recommended)</div>
                <ul style={{ color: 'var(--text-dim)', fontSize: 11, listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <li>1. click download below</li>
                  <li>2. open .ino file in arduino ide</li>
                  <li>3. select your board: ESP32 Dev Module</li>
                  <li>4. select port and upload</li>
                </ul>
                <button
                  onClick={() => {
                    const code = animation.getArduinoCode(size);
                    const blob = new Blob([code], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${animation.name}.ino`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }}
                  className="anim-action-btn primary" style={{ width: '100%' }}
                >
                  [↓ download {animation.name}.ino]
                </button>
              </div>

              {/* Option B */}
              <div style={{ border: '1px solid var(--border)', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ color: 'var(--cyan)', fontSize: 11 }}>OPTION B · micropython (run_on_device)</div>
                <p style={{ color: 'var(--text-dim)', fontSize: 11, lineHeight: 1.6 }}>
                  if you have micropython installed,<br />
                  use run_on_device to stream animation<br />
                  live — no upload needed.
                </p>
                <button
                  onClick={() => {
                    setDownloadModalOpen(false);
                    togglePreview();
                  }}
                  className="anim-action-btn" style={{ width: '100%', border: '1px solid var(--border)' }}
                >
                  [→ use run_on_device instead]
                </button>
              </div>

              <button
                onClick={() => setDownloadModalOpen(false)}
                className="anim-action-btn" style={{ width: '100%', color: 'var(--text-dim)' }}
              >
                [close]
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
