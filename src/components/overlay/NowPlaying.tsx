import { useEffect, useRef } from 'react';
import { COPY } from '../../config/copy';
import { useUIStore } from '../../state/useUIStore';
import { useViewport } from '../../hooks/useViewport';

/**
 * A quiet chip in the corner once the music box is open.
 *
 * It exists so the song is attributed — nobody should wonder where the music
 * came from, or whether they triggered it.
 */
export function NowPlaying(): React.ReactElement {
  const musicOn = useUIStore((s) => s.musicOn);
  const { size } = useViewport();
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
        right: 'calc(env(safe-area-inset-right, 0px) + clamp(12px, 3vw, 22px))',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + clamp(12px, 3vw, 22px))',
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        // The full attribution is a 330px ribbon of 0.22em-tracked uppercase.
        // On a 390px frame it runs into the mute button at the other corner.
        maxWidth: 'min(52vw, 340px)',
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
          letterSpacing: 'clamp(0.12em, 0.9vw, 0.22em)',
          textTransform: 'uppercase',
          color: 'rgba(255,242,224,0.72)',
          whiteSpace: 'nowrap',
        }}
      >
        {/* Where the music came from is the point of the chip, but on a phone
            the shorter form is the only one that fits beside the mute pill. */}
        {size === 'phone' ? COPY.nowPlayingShort : COPY.nowPlaying}
      </span>
    </div>
  );
}
