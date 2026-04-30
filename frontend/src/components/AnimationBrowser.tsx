// AnimationBrowser.tsx — Pixbyte animation library browser (ported from pixbyte)
import { useState, useRef, useEffect } from 'react';
import type { OLEDAnimation } from '../data/animations';
import { animations } from '../data/animations';
import AnimOLEDCanvas from './AnimOLEDCanvas';
import AnimCodePanel from './AnimCodePanel';

const CATEGORIES = ['all', 'emoji', 'robot_eyes', 'icons', 'loaders', 'indian', 'festival', 'text_fx'];
const SIZES = [32, 48, 64] as const;

export default function AnimationBrowser() {
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [activeSize, setActiveSize] = useState<32 | 48 | 64>(64);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAnimation, setSelectedAnimation] = useState(animations[0]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const filteredAnimations = animations.filter(anim => {
    if (activeCategory !== 'all' && anim.category !== activeCategory) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = anim.name.toLowerCase().includes(q);
      const matchTag = anim.tags.some(t => t.toLowerCase().includes(q));
      if (!matchName && !matchTag) return false;
    }
    if (!anim.supportedSizes.includes(activeSize)) return false;
    return true;
  });

  return (
    <div className="anim-browser">
      {/* Left Panel: Gallery */}
      <div className="anim-left-panel">
        {/* Filter Bar */}
        <div className="anim-filter-bar">
          {/* Category Tabs */}
          <div className="anim-category-tabs">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`anim-cat-tab${activeCategory === cat ? ' active' : ''}`}
              >
                {"// "}{cat}
              </button>
            ))}
          </div>

          {/* Count Indicator */}
          <div className="anim-count-indicator">
            {"// "}{filteredAnimations.length} animations found
          </div>

          {/* Sub-filters */}
          <div className="anim-sub-filters">
            {/* Size Selector */}
            <div className="anim-size-selector">
              {SIZES.map(size => (
                <button
                  key={size}
                  onClick={() => setActiveSize(size)}
                  className={`anim-size-btn${activeSize === size ? ' active' : ''}`}
                >
                  {size}px
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="anim-search-wrap">
              <span className="anim-search-caret">&gt;</span>
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="search animations_ [/]"
                className="anim-search-input"
              />
            </div>
          </div>
        </div>

        {/* Animation Grid */}
        <div className="anim-grid-scroll">
          {filteredAnimations.length === 0 ? (
            <div className="anim-empty">
              {"// no animations found for query"}
            </div>
          ) : (
            <div className="anim-grid">
              {filteredAnimations.map((anim: OLEDAnimation) => {
                const isSelected = selectedAnimation.id === anim.id;
                return (
                  <div
                    key={anim.id}
                    onClick={() => setSelectedAnimation(anim)}
                    className={`anim-card${isSelected ? ' selected' : ''}`}
                  >
                    {/* Canvas Preview Area */}
                    <div className="anim-card-preview">
                      <AnimOLEDCanvas
                        animation={anim}
                        size={activeSize}
                        scale={2}
                        showCounter={false}
                      />
                    </div>

                    {/* Metadata */}
                    <div className="anim-card-meta">
                      <div className={`anim-card-name${isSelected ? ' active' : ''}`}>
                        {anim.name}
                      </div>
                      <div className="anim-card-desc">
                        {"// GFX · "}{anim.category === 'robot_eyes' ? 'rounded_rect' : `${anim.totalFrames} frames`} · {Math.round(1000/anim.fps)}ms
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right Panel: Code & Preview */}
      <AnimCodePanel animation={selectedAnimation} size={activeSize} />
    </div>
  );
}
