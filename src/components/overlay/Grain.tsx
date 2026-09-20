import { DEFAULT_PROPS } from '../../config/copy';
import { useReducedMotion } from '../../hooks/useReducedMotion';

/**
 * Film grain over the whole frame.
 *
 * A static radial-dot background jittered by a stepped keyframe animation -
 * three positions, not a smooth slide, so it reads as film stock rather than
 * a moving texture. Purely CSS, so it costs nothing per frame.
 */
export function Grain({ enabled = DEFAULT_PROPS.grain }: { enabled?: boolean }) {
  const reduced = useReducedMotion();
  if (!enabled) return null;

  return (
    <div
      className="grain"
      style={{
        position: 'absolute',
        inset: '-8%',
        pointerEvents: 'none',
        opacity: 0.055,
        animation: reduced ? 'none' : 'tdGrain 1.1s steps(3) infinite',
        backgroundImage:
          'radial-gradient(rgba(255,255,255,0.9) 0.5px, transparent 0.6px)',
        backgroundSize: '3px 3px',
      }}
    />
  );
}
