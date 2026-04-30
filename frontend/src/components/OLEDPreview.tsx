// OLEDPreview.tsx — Animated OLED canvas preview with scanline effect
import { useEffect, useMemo, useRef, useState } from 'react';

interface Props {
  previews: string[];   // base64 raw binary bytes
  fps: number;
  width: number;
  height: number;
}

// decode base64 into Uint8Array
function decodeBase64(b64: string): Uint8Array {
  const byteCharacters = atob(b64);
  const byteArray = new Uint8Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteArray[i] = byteCharacters.charCodeAt(i);
  }
  return byteArray;
}

// Convert page-bytes to standard linear ImageData
function pageBytesToImageData(bytes: Uint8Array, width: number, height: number, phosphorGreen: boolean): ImageData {
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
}

export default function OLEDPreview({ previews, fps, width, height }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [phosphorGreen, setPhosphorGreen] = useState(false);
  const [scale, setScale] = useState(3);
  const interval = fps > 0 ? 1000 / fps : 100;
  const buffers = useMemo(() => previews.map((preview) => decodeBase64(preview)), [previews]);

  // Calculate responsive scale based on container size
  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current) return;
      const container = containerRef.current;
      const maxWidth = container.clientWidth - 40; // padding
      const maxHeight = container.clientHeight - 80; // padding + button
      
      const scaleX = maxWidth / width;
      const scaleY = maxHeight / height;
      const newScale = Math.min(Math.floor(Math.min(scaleX, scaleY)), 4);
      setScale(Math.max(newScale, 1));
    };

    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [width, height]);

  useEffect(() => {
    if (!canvasRef.current || buffers.length === 0) {
      return;
    }

    let animationId = 0;
    let frameIndex = 0;
    let lastTime = 0;

    const draw = (ts: number) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        animationId = requestAnimationFrame(draw);
        return;
      }

      if (ts - lastTime >= interval) {
        lastTime = ts;
        const ctx = canvas.getContext('2d');
        const frame = buffers[frameIndex];

        if (ctx && frame) {
          ctx.putImageData(pageBytesToImageData(frame, width, height, phosphorGreen), 0, 0);
        }

        frameIndex = (frameIndex + 1) % buffers.length;
      }

      animationId = requestAnimationFrame(draw);
    };

    animationId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationId);
  }, [buffers, interval, width, height, phosphorGreen]);

  // Calculate scale to fit in viewport while maintaining aspect ratio
  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="oled-bezel">
        <div style={{ padding: '8px', textAlign: 'center', borderBottom: '1px solid #333', background: '#000' }}>
          <button 
            className="btn-secondary" 
            onClick={() => setPhosphorGreen(!phosphorGreen)} 
            style={{ fontSize: 10, padding: '4px 8px', background: 'black', color: 'var(--cyan)', border: '1px solid var(--cyan)' }}
          >
            {phosphorGreen ? '// switch to white' : '// switch to green'}
          </button>
        </div>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <canvas
            ref={canvasRef}
            width={width}
            height={height}
            className="oled-screen"
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
  );
}
