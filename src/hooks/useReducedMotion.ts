import { useEffect, useState } from 'react';
import { frame } from '../state/frame';

const QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Tracks prefers-reduced-motion, and mirrors it onto the frame singleton so
 * `useFrame` code can branch on it without a hook subscription.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined') return false;
    const initial = window.matchMedia(QUERY).matches;
    frame.reduced = initial;
    return initial;
  });

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const onChange = (e: MediaQueryListEvent) => {
      frame.reduced = e.matches;
      setReduced(e.matches);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
