import { useEffect, useRef } from 'react';
import { COPY } from '../../config/copy';
import { useUIStore } from '../../state/useUIStore';

/**
 * Scene 1's only instruction: a line of text and a button that bobs.
 *
 * It fades out the instant the box is clicked rather than waiting for the lid,
 * so the click feels answered immediately while the animation plays behind it.
 */
export function GiftUI({ onOpen }: { onOpen: () => void }): React.ReactElement {
  const opened = useUIStore((s) => s.opened);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !opened) return;
    el.style.transition = 'opacity 400ms ease';
    el.style.opacity = '0';
    el.style.pointerEvents = 'none';
  }, [opened]);

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-end',
        padding: '0 24px 9vh',
        textAlign: 'center',
        gap: 14,
      }}
    >
      <p
        style={{
          margin: 0,
          fontFamily: "'Playfair Display', serif",
          fontSize: 'clamp(20px, 3.2vw, 38px)',
          fontWeight: 400,
          letterSpacing: '0.01em',
          lineHeight: 1.5,
          color: '#f6e3c2',
          textShadow: '0 2px 30px rgba(0,0,0,0.6)',
        }}
      >
        {COPY.giftPrompt}
      </p>
      <button
        type="button"
        onClick={onOpen}
        style={{
          pointerEvents: 'auto',
          cursor: 'pointer',
          animation: 'tdBob 3.4s ease-in-out infinite',
          border: '1px solid rgba(246,227,194,0.45)',
          background: 'rgba(20,14,10,0.35)',
          backdropFilter: 'blur(6px)',
          color: '#fff6e6',
          fontFamily: "'Poppins', sans-serif",
          fontSize: 13,
          fontWeight: 500,
          letterSpacing: '0.24em',
          textTransform: 'uppercase',
          padding: '14px 26px',
          borderRadius: 999,
        }}
      >
        {COPY.giftButton}
      </button>
    </div>
  );
}
