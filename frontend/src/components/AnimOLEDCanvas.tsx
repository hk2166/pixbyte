// AnimOLEDCanvas.tsx — Canvas renderer for pixbyte animations (ported from pixbyte)
import { useEffect, useRef, useState } from 'react';
import type { OLEDAnimation } from '../data/animations';

interface Props {
  animation: OLEDAnimation;
  size: number;
  scale?: number;
  showCounter?: boolean;
}

export default function AnimOLEDCanvas({ animation, size, scale = 4, showCounter = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentFrame, setCurrentFrame] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const isRobotEyes = animation.category === 'robot_eyes';
    const canvasWidth = isRobotEyes ? 128 : size;
    const canvasHeight = isRobotEyes ? 64 : size;

    let frameIdx = 0;
    let lastTime = 0;
    let isPaused = false;
    let animationFrameId: number;
    const frameInterval = 1000 / animation.fps;

    const render = (time: number) => {
      if (!lastTime) lastTime = time;
      const deltaTime = time - lastTime;

      if (deltaTime >= frameInterval || isPaused) {
        
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvasWidth * scale, canvasHeight * scale);

        ctx.save();
        ctx.scale(scale, scale);
        ctx.imageSmoothingEnabled = false;

        if (!isRobotEyes) {
          ctx.shadowBlur = 6;
          ctx.shadowColor = '#58a6ff';
        } else {
          ctx.shadowBlur = 0;
        }

        animation.drawFrame(ctx, frameIdx, size);

        ctx.restore();

        if (showCounter && currentFrame !== frameIdx) {
          setCurrentFrame(frameIdx);
        }

        if (!isPaused && deltaTime >= frameInterval) {
           frameIdx = (frameIdx + 1) % animation.totalFrames;
           lastTime = time - (deltaTime % frameInterval);
        } else if (isPaused) {
           lastTime = time; 
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;
      if (e.key === ' ') {
        e.preventDefault();
        isPaused = !isPaused;
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        isPaused = true;
        frameIdx = (frameIdx + 1) % animation.totalFrames;
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        isPaused = true;
        frameIdx = (frameIdx - 1 + animation.totalFrames) % animation.totalFrames;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    animationFrameId = requestAnimationFrame(render);

    return () => {
       cancelAnimationFrame(animationFrameId);
       window.removeEventListener('keydown', handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animation, size, scale, showCounter]);

  const isRobotEyes = animation.category === 'robot_eyes';
  const displayWidth = isRobotEyes ? 128 : size;
  const displayHeight = isRobotEyes ? 64 : size;

  return (
    <div className="anim-canvas-wrap">
      <div className="anim-canvas-bezel">
        <canvas
          ref={canvasRef}
          width={displayWidth * scale}
          height={displayHeight * scale}
          className="anim-canvas"
          style={{ width: displayWidth * scale, height: displayHeight * scale, maxWidth: '100%' }}
        />
      </div>
      {showCounter && (
        <div className="anim-canvas-info">
          <div className="anim-canvas-counter">
            <span>
              frame_{currentFrame.toString().padStart(2, '0')} / {animation.totalFrames.toString().padStart(2, '0')}
            </span>
            <span>{"// "}{Math.round(1000 / animation.fps)}ms per frame</span>
          </div>
          <div className="anim-canvas-hint">
            {"// space: play/pause · ←→: step frames"}
          </div>
        </div>
      )}
    </div>
  );
}
