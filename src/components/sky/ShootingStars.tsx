import { useCallback, useMemo, useRef } from 'react';
import { AdditiveBlending, Color, Group, Sprite, SpriteMaterial } from 'three';
import { useTextures } from '../../textures/TextureProvider';
import { GATES } from '../../config/timeline';
import { useNightEdge, useNightUpdate } from '../../scenes/nightVisibility';
import type { FrameState } from '../../state/frame';

/** Seconds between one streak and the next, per star. */
const CYCLE = 7;
/** Seconds a streak is visible. */
const STREAK = 1.1;

/**
 * Two shooting stars on offset seven-second cycles.
 *
 * Deliberately sparse: the sky beat is a held shot, and something crossing it
 * every few seconds gives the eye a reason to keep looking without turning
 * into weather. They stop once the camera tilts down toward the city.
 */
export function ShootingStars(): React.ReactElement {
  const textures = useTextures();

  const materials = useMemo(
    () =>
      [0, 1].map(
        () =>
          new SpriteMaterial({
            map: textures.glow,
            color: new Color('#e6eeff'),
            transparent: true,
            opacity: 0,
            blending: AdditiveBlending,
            depthWrite: false,
            fog: false,
            // Tilt the stretched sprite so the streak runs along its travel.
            rotation: -0.72,
          }),
      ),
    [textures.glow],
  );

  const groupRef = useRef<Group>(null);
  // Offset phases so the two never streak together.
  const clocks = useRef<number[]>([-3, -9]);

  const update = useCallback(
    (f: FrameState) => {
      const group = groupRef.current;
      if (!group) return;
      const active = GATES.shootingStarsActive(f.p);

      for (let i = 0; i < group.children.length; i++) {
        const sprite = group.children[i] as Sprite | undefined;
        const mat = materials[i];
        if (!sprite || !mat) continue;

        const t = (clocks.current[i] ?? 0) + f.dt;
        clocks.current[i] = t;

        const cy = t % CYCLE;
        if (active && cy < STREAK && cy >= 0) {
          const k = cy / STREAK;
          mat.opacity = Math.sin(k * Math.PI) * 0.85;
          sprite.position.set(-420 + k * 900 + i * 120, 620 - k * 240 - i * 70, -420 - i * 90);
        } else {
          mat.opacity = 0;
        }
      }
    },
    [materials],
  );

  useNightUpdate('sky', 'world', update);

  // The sky is hidden rather than rebuilt when the film is replayed, so the
  // offsets it used to get back by being rebuilt are put back here.
  const edge = useMemo(
    () => ({
      onShow: () => {
        clocks.current = [-3, -9];
      },
    }),
    [],
  );
  useNightEdge('sky', edge);

  return (
    <group ref={groupRef}>
      {materials.map((m, i) => (
        <sprite key={i} material={m} scale={[150, 5, 1]} />
      ))}
    </group>
  );
}
