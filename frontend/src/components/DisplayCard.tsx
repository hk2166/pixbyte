// DisplayCard.tsx — Selectable display option card
import type { DisplayConfig } from '../types';

interface Props {
  config: DisplayConfig;
  selected: boolean;
  onSelect: (key: DisplayConfig['key']) => void;
}

export default function DisplayCard({ config, selected, onSelect }: Props) {
  const isNarrow = config.height === 32;
  const transportLabel =
    config.key.includes('spi') || [3, 4, 5, 6].includes(config.driver_id)
      ? 'SPI'
      : config.driver_id === 7
        ? 'I2C/PAR'
        : 'I²C';
  const modeLabel = config.driver_id === 7 ? 'text-only' : '1-bit';

  return (
    <div
      className={`display-card${selected ? ' selected' : ''}`}
      onClick={() => onSelect(config.key)}
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(config.key);
        }
      }}
    >
      {/* Mini OLED outline icon */}
      <div className="display-icon" style={{ height: isNarrow ? 12 : 22 }}>
        {selected && <span style={{ fontSize: 7, color: 'inherit' }}>▪▪</span>}
      </div>

      <div className="display-info">
        <span className="display-driver">{config.driver}</span>
        <span className="display-res">
          {config.width}×{config.height} · {modeLabel} · {transportLabel}
        </span>
      </div>

      <div className="display-fps">
        <span className="label-dim">~{config.fps}</span>
        <br />
        <span className="label-dim" style={{ fontSize: 9 }}>fps</span>
      </div>
    </div>
  );
}
