import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import {
  AdditiveBlending,
  Color,
  Group,
  Mesh,
  PointLight,
  Raycaster,
  Sprite,
  SpriteMaterial,
  Vector2,
  Vector3,
} from 'three';
import { useTextures } from '../../textures/TextureProvider';
import { createMoteField, SpriteField, useFieldPixelScale } from '../fx/SpriteField';
import { mat } from '../../lib/materials';
import { clamp, lerp } from '../../lib/math';
import { GATES, MUSIC_BOX_OPEN_SECONDS } from '../../config/timeline';
import { INTRO_FIT } from '../../config/cameraKeys';
import { prompt } from '../../config/copy';
import { readViewport } from '../../hooks/useViewport';
import { musicBoxHit } from './musicBoxHit';
import { useNightEdge, useNightUpdate } from '../../scenes/nightVisibility';
import { QUALITY } from '../../config/quality';
import { useUIStore } from '../../state/useUIStore';
import { setOpacity, setStyle } from '../../lib/domWrite';
import { frame, type FrameState } from '../../state/frame';
import { viewport } from '../../state/viewport';

const BOX_POSITION = new Vector3(4.4, 0, 58);
const HINT_HEIGHT = 4.4;

const scratchNdc = new Vector2();
const scratchProject = new Vector3();

/**
 * The music box on its pedestal, beside the path to the gate.
 *
 * It is the film's only real interaction, so it has to advertise itself
 * without a button: the key turns on its own, the seam glows and pulses, the
 * lid lifts a little when the cursor is over it, and a hint tracks it in
 * screen space. Opening it lifts the lid, releases motes, and starts the song.
 *
 * Skipping it costs nothing — the scroll never waits, and the ambient pad
 * carries on regardless.
 */
export function MusicBox(): React.ReactElement {
  const textures = useTextures();
  const camera = useThree((s) => s.camera);
  const quality = useUIStore((s) => s.quality);
  const hintRef = useRef<HTMLDivElement | null>(null);

  const lidRef = useRef<Group>(null);
  const keyRef = useRef<Group>(null);
  const glowRef = useRef<Sprite>(null);
  const lightRef = useRef<PointLight>(null);
  const hitRef = useRef<Mesh>(null);
  const hoverRef = useRef(0);
  const raycaster = useMemo(() => new Raycaster(), []);

  const glowMat = useMemo(
    () =>
      new SpriteMaterial({
        map: textures.glow,
        color: new Color('#ffd08a'),
        transparent: true,
        opacity: 0.5,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    [textures.glow],
  );

  const motes = useMemo(
    () =>
      createMoteField({
        count: QUALITY[quality].musicBoxMotes,
        map: textures.glow,
        colour: '#ffe0ac',
        spread: [0.9, 0.6],
        size: [0.1, 0.26],
        speed: [0.125, 0.4],
        rise: 6,
        floor: 3.2,
        sway: 0.35,
        seed: 0x11071c,
      }),
    [quality, textures.glow],
  );

  useFieldPixelScale(motes.uniforms.uPixelScale, 48, INTRO_FIT);

  // The hint is a DOM element tracking a 3D point, so it stays crisp.
  //
  // Its styling moved into `index.css` as `.mb-hint`: the pill was `nowrap` at
  // 0.26em tracking - about 230px of ribbon - and its anchor is clamped to
  // 16-84% of the frame, so on a phone it hung off both edges at once.
  useEffect(() => {
    const el = document.createElement('div');
    el.className = 'mb-hint';
    const pill = document.createElement('span');
    pill.textContent = prompt('musicHint', readViewport().coarse);
    const stalk = document.createElement('span');
    el.append(pill, stalk);
    document.querySelector('.overlay-root')?.appendChild(el);
    hintRef.current = el;
    return () => {
      el.remove();
      hintRef.current = null;
    };
  }, []);

  const stone = useMemo(() => mat('fabric', '#3a3540'), []);
  const brass = useMemo(() => mat('metal', '#c9a24a'), []);
  const wood = useMemo(() => mat('wood', '#6b3f22'), []);

  /**
   * Is this point on the music box?
   *
   * Lifted out of the update loop so the stage's click handler can run it
   * from where a tap actually landed - see `musicBoxHit.ts` for why a finger
   * cannot rely on the hover state the loop maintains.
   */
  const hitTest = useCallback(
    (ndcX: number, ndcY: number): boolean => {
      const f = frame;
      if (!hitRef.current || f.musicBoxOpen || !GATES.musicBoxInteractive(f.p)) return false;
      scratchNdc.set(ndcX, ndcY);
      raycaster.setFromCamera(scratchNdc, camera);
      return raycaster.intersectObject(hitRef.current, false).length > 0;
    },
    [camera],
  );

  useEffect(() => {
    musicBoxHit.test = hitTest;
    return () => {
      musicBoxHit.test = null;
    };
  }, [hitTest]);

  const update = useCallback(
    (f: FrameState) => {
      const { p, time } = f;
      const near = GATES.musicBoxNear(p);
      const open = f.musicBoxOpen;
      const oa = open ? clamp((time - f.musicBoxOpenedAt) / MUSIC_BOX_OPEN_SECONDS, 0, 1) : 0;

      // Hover test, only while the box is in play and still shut.
      const hovering = f.hasPointer && hitTest(f.ndcX, f.ndcY);
      f.hoverMusicBox = hovering;

      hoverRef.current = lerp(hoverRef.current, hovering ? 1 : 0, 0.12);
      const hover = hoverRef.current;

      // The key never stops turning, whether or not anyone is watching.
      if (keyRef.current) keyRef.current.rotation.y = time * 0.7;

      const pulse = 0.5 + Math.sin(time * 1.9) * 0.18;

      if (lidRef.current) {
        // A tease on hover, then all the way open.
        lidRef.current.rotation.x = -(hover * 0.18 + smooth(oa) * 1.5);
      }

      // A floor under `near` keeps a faint glow even before the beat, so the
      // box is discoverable rather than appearing from nothing.
      glowMat.opacity = (open ? 0.95 : pulse * (0.45 + hover * 0.4)) * Math.max(near, 0.25);
      if (glowRef.current) glowRef.current.scale.setScalar(1.4 + oa * 1.6 + hover * 0.3);
      if (lightRef.current) {
        lightRef.current.intensity =
          (open ? 26 : 8 + pulse * 6 + hover * 6) * Math.max(near, 0.2);
      }

      motes.uniforms.uTime.value = open ? time - f.musicBoxOpenedAt : 0;
      motes.uniforms.uOpacity.value = open ? 0.75 : 0;

      // Track the hint to the box in screen space.
      const el = hintRef.current;
      if (el) {
        scratchProject.copy(BOX_POSITION);
        scratchProject.y += HINT_HEIGHT;
        scratchProject.project(camera);
        const visible = near > 0.05 && !open && scratchProject.z < 1;
        setOpacity(el, visible ? near : 0);
        if (visible) {
          // One `transform`, not `left`/`top`: those are layout properties,
          // and this is written on every frame the camera moves. The second
          // half of each term is the pill's own anchoring, which used to be
          // the stylesheet's `translate(-50%, -100%)`.
          const x = clamp(scratchProject.x * 0.5 + 0.5, 0.16, 0.84) * viewport.w;
          const y = clamp(-scratchProject.y * 0.5 + 0.5, 0.12, 0.88) * viewport.h;
          setStyle(
            el,
            'transform',
            `translate(calc(${x.toFixed(1)}px - 50%), calc(${y.toFixed(1)}px - 100%))`,
          );
        }
      }
    },
    [camera, glowMat, motes, raycaster],
  );

  useNightUpdate('garden', 'musicbox', update);

  // The update above stops once the garden is hidden, so the two things it
  // was still holding are let go here; they used to go with the unmount.
  const edge = useMemo(
    () => ({
      onShow: () => {
        hoverRef.current = 0;
      },
      onHide: () => {
        setOpacity(hintRef.current, 0);
        frame.hoverMusicBox = false;
      },
    }),
    [],
  );
  useNightEdge('garden', edge);

  return (
    <group position={BOX_POSITION.toArray()} rotation-y={-0.34}>
      <mesh position={[0, 1.25, 0]} material={stone}>
        <cylinderGeometry args={[0.62, 0.86, 2.5, 20]} />
      </mesh>
      <mesh position={[0, 2.5, 0]} material={brass}>
        <cylinderGeometry args={[0.78, 0.78, 0.16, 20]} />
      </mesh>
      <mesh position={[0, 2.95, 0]} material={wood}>
        <boxGeometry args={[1.5, 0.7, 1.0]} />
      </mesh>
      <mesh position={[0, 2.63, 0]} material={brass}>
        <boxGeometry args={[1.54, 0.06, 1.04]} />
      </mesh>
      {[-1, 1].map((sx) => (
        <mesh key={sx} position={[sx * 0.74, 2.95, 0.5]} material={brass}>
          <boxGeometry args={[0.05, 0.7, 0.05]} />
        </mesh>
      ))}

      <sprite ref={glowRef} material={glowMat} scale={[1.4, 1.4, 1]} position={[0, 3.2, 0]} />
      <pointLight
        ref={lightRef}
        color="#ffc477"
        intensity={9}
        distance={14}
        decay={2}
        position={[0, 3.25, 0]}
      />

      {/* Hinged at the back edge, so the panel swings rather than spins. */}
      <group ref={lidRef} position={[0, 3.3, -0.5]}>
        <mesh position={[0, 0, 0.5]} material={wood}>
          <boxGeometry args={[1.5, 0.14, 1.0]} />
        </mesh>
        <mesh position={[0, 0.08, 0.98]} material={brass}>
          <boxGeometry args={[1.54, 0.05, 0.06]} />
        </mesh>
        <mesh rotation-z={Math.PI / 2} material={brass}>
          <cylinderGeometry args={[0.055, 0.055, 1.5, 10]} />
        </mesh>
      </group>

      <group ref={keyRef} position={[0.8, 2.95, 0.2]} rotation-z={Math.PI / 2}>
        <mesh material={brass}>
          <cylinderGeometry args={[0.05, 0.05, 0.3, 8]} />
        </mesh>
        <mesh position={[0, 0.2, 0]} material={brass}>
          <torusGeometry args={[0.13, 0.035, 8, 18]} />
        </mesh>
      </group>

      <SpriteField geometry={motes.geometry} material={motes.material} />

      {/* An oversized invisible proxy: the box is small and easy to miss. */}
      <mesh ref={hitRef} position={[0, 3.1, 0]}>
        <boxGeometry args={[2.0, 1.6, 1.6]} />
        <meshBasicMaterial visible={false} />
      </mesh>
    </group>
  );
}

/** Smoothstep over the first 70% of the open, so the lid settles at the top. */
function smooth(oa: number): number {
  const t = clamp(oa / 0.7, 0, 1);
  return t * t * (3 - 2 * t);
}
