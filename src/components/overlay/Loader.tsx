import { useEffect, useRef } from 'react';
import { useUIStore } from '../../state/useUIStore';
import { COPY } from '../../config/copy';

/**
 * "Wrapping your gift…" — the boot screen.
 *
 * Progress is the real fraction of textures generated, not a scripted
 * animation, so a slow machine shows a slow bar instead of a fast bar and
 * then a stall.
 */
export function Loader(): React.ReactElement | null {
  const progress = useUIStore((s) => s.progress);
  const booted = useUIStore((s) => s.booted);
  const pendingOpen = useUIStore((s) => s.pendingOpen);
  const rootRef = useRef<HTMLDivElement>(null);
  const goneRef = useRef(false);

  useEffect(() => {
    if (!booted || goneRef.current) return;
    goneRef.current = true;
    const el = rootRef.current;
    if (!el) return;
    el.style.transition = 'opacity 700ms ease';
    el.style.opacity = '0';
    const id = window.setTimeout(() => {
      el.style.display = 'none';
    }, 760);
    return () => window.clearTimeout(id);
  }, [booted]);

  const pct = String(Math.round(progress * 100)).padStart(2, '0');

  return (
    <div
      ref={rootRef}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        background: '#0a0a0f',
        color: '#f6e3c2',
        pointerEvents: 'auto',
      }}
    >
      <span
        className="loader-spinner"
        style={{
          width: 30,
          height: 30,
          border: '1px solid rgba(246,227,194,0.22)',
          borderTopColor: '#f6e3c2',
          borderRadius: '50%',
          animation: 'tdSpin 1s linear infinite',
        }}
      />
      <span
        style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: 18,
          fontWeight: 400,
          letterSpacing: '0.08em',
          lineHeight: 1.5,
        }}
      >
        {COPY.loaderTitle}
      </span>
      <div style={{ width: 'min(180px, 56vw)', height: 1, background: 'rgba(246,227,194,0.18)' }}>
        <div
          style={{
            width: `${Math.round(progress * 100)}%`,
            height: '100%',
            background: '#f6e3c2',
            transition: 'width 180ms linear',
          }}
        />
      </div>
      <span
        style={{
          fontFamily: 'ui-monospace, Menlo, monospace',
          fontSize: 10,
          letterSpacing: '0.2em',
          color: 'rgba(246,227,194,0.55)',
        }}
      >
        {pendingOpen ? COPY.loaderPreparing : `${pct}%`}
      </span>
    </div>
  );
}
