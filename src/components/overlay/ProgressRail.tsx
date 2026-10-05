import { useCallback, useEffect, useRef } from 'react';
import { COPY } from '../../config/copy';
import { GATES } from '../../config/timeline';
import { useUpdate } from '../../lib/updateBus';
import { setOpacity, setStyle } from '../../lib/domWrite';
import { useUIStore } from '../../state/useUIStore';
import { useViewport } from '../../hooks/useViewport';
import type { FrameState } from '../../state/frame';

/**
 * "THE JOURNEY" - a thin vertical rail showing how far through the film you
 * are. It appears when the scroll is released and disappears into the
 * white-out.
 *
 * The source animated the fill's `height` and the dot's `top` as percentages,
 * which lays out the page twice every frame for the whole scroll. Here the
 * fill is a `scaleY` and the dot a `translateY`, both composited on the GPU;
 * the track height is measured once and re-measured only on resize.
 */
export function ProgressRail(): React.ReactElement | null {
  const wrapRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const trackHeight = useRef(0);
  const unlocked = useUIStore((s) => s.unlocked);
  const { size, coarse, touch } = useViewport();
  const unlockedRef = useRef(unlocked);
  unlockedRef.current = unlocked;

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const measure = () => {
      trackHeight.current = el.getBoundingClientRect().height;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    const el = wrapRef.current;
    if (!el) return;
    el.style.transition = 'opacity 900ms ease';
  }, [unlocked]);

  const update = useCallback((f: FrameState) => {
    const { p } = f;
    if (unlockedRef.current) {
      setOpacity(wrapRef.current, GATES.progressRail(p));
    }
    setStyle(fillRef.current, 'transform', `scaleY(${p.toFixed(4)})`);
    setStyle(
      dotRef.current,
      'transform',
      `translate(-50%, ${(p * trackHeight.current).toFixed(1)}px)`,
    );
  }, []);

  useUpdate('overlay', update);

  // A phone or tablet plays the film stop to stop, and the dots in `StepNav`
  // are its rail. Two progress indicators would be one too many.
  if (touch) return null;

  return (
    <div
      ref={wrapRef}
      style={{
        position: 'absolute',
        right: 'clamp(10px, 2.5vw, 26px)',
        top: '50%',
        transform: 'translateY(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
        opacity: 0,
        pointerEvents: 'none',
      }}
    >
      {/*
        The label goes on a phone. It is a vertical strip of tracked capitals
        in the right-hand gutter - the same gutter the "now playing" chip has
        to reach into on a 390px frame - and of the two, the rail is the one
        that carries information. The rail itself stays.
      */}
      {size === 'phone' ? null : (
        <span
          style={{
            fontSize: 9,
            letterSpacing: '0.24em',
            writingMode: 'vertical-rl',
            color: 'rgba(255,236,206,0.5)',
          }}
        >
          {COPY.journeyLabel}
        </span>
      )}
      <div
        ref={trackRef}
        style={{
          position: 'relative',
          width: 2,
          height: 'min(38dvh, 300px)',
          borderRadius: 2,
          background: 'rgba(255,236,206,0.16)',
        }}
      >
        <div
          ref={fillRef}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            borderRadius: 2,
            background: 'linear-gradient(rgba(255,214,150,0.95), rgba(255,168,120,0.95))',
            transform: 'scaleY(0)',
            transformOrigin: 'top',
            willChange: 'transform',
          }}
        />
        <div
          ref={dotRef}
          style={{
            position: 'absolute',
            // A little larger where the rail is the only thing telling you
            // how far through the film you are, and there is no cursor.
            top: coarse ? -5.5 : -4.5,
            left: '50%',
            width: coarse ? 11 : 9,
            height: coarse ? 11 : 9,
            borderRadius: '50%',
            background: '#ffd08a',
            boxShadow: '0 0 14px 3px rgba(255,190,120,0.8)',
            transform: 'translate(-50%, 0)',
            willChange: 'transform',
          }}
        />
      </div>
    </div>
  );
}
