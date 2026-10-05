import { useLayoutEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { publishViewport } from '../state/viewport';

/**
 * The one writer of the viewport singleton.
 *
 * It reads R3F's `size` rather than `window`, because that is the box the
 * cameras actually project into - and because R3F debounces it, which is what
 * keeps a mobile URL bar from republishing on every scroll frame.
 *
 * Mounted first inside the canvas so the solved pose on frame one already has
 * real numbers to work from.
 */
export function ViewportProbe(): null {
  const size = useThree((s) => s.size);

  useLayoutEffect(() => {
    publishViewport(size.width, size.height);
  }, [size]);

  return null;
}
