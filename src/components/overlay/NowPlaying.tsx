import { useEffect, useRef } from 'react';
import { COPY } from '../../config/copy';
import { useUIStore } from '../../state/useUIStore';

/**
 * A quiet chip in the corner once the music box is open.
 *
 * It exists so the song is attributed — nobody should wonder where the music
 * came from, or whether they triggered it.
 */
export function NowPlaying(): React.ReactElement {
  const musicOn = useUIStore((s) => s.musicOn);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = 'opacity 900ms ease';
    el.style.opacity = musicOn ? '1' : '0';
  }, [musicOn]);

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        right: 22,
        bottom: 22,
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        border: '1px solid rgba(255,236,206,0.18)',
        borderRadius: 999,
        background: 'rgba(12,12,18,0.42)',
        backdropFilter: 'blur(6px)',
        padding: '8px 14px',
        opacity: 0,
        pointerEvents: 'none',
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: '#ffd08a',
          animation: 'tdPulse 1.8s ease-in-out infinite',
        }}
      />
      <span
        style={{
          fontSize: 9,
          fontWeight: 500,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: 'rgba(255,242,224,0.72)',
        }}
      >
        {COPY.nowPlaying}
      </span>
    </div>
  );
}
