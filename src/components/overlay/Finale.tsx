import { useCallback, useRef } from 'react';
import { COPY, DEFAULT_PROPS } from '../../config/copy';
import { GATES, WHITE_B } from '../../config/timeline';
import { useUpdate } from '../../lib/updateBus';
import { setOpacity, setStyle } from '../../lib/domWrite';
import { clamp, sstep } from '../../lib/math';
import { canHover } from '../../hooks/useViewport';
import { NARROW_ASPECT, viewport } from '../../state/viewport';
import type { FrameState } from '../../state/frame';

/**
 * Scene 6 and 7's DOM layer: the white-out, the glare, the blinks, and the
 * closing card.
 *
 * The white-out is a handover, not a fade. Exposure and bloom blow the 3D
 * frame out from the inside first (see `Renderer`); this layer only finishes
 * the last of it and then pulls back to reveal the day scene already running
 * underneath.
 *
 * The two blinks are the whole conceit of the finale: soft dark bars closing
 * from top and bottom on a sine, at 0.18 and 0.52 through the wake ramp, so
 * it reads as someone opening their eyes rather than a cross-fade.
 */
export function Finale({
  onReplay,
  teacherLabel = DEFAULT_PROPS.teacherLabel,
  classLabel = DEFAULT_PROPS.classLabel,
}: {
  onReplay: () => void;
  teacherLabel?: string;
  classLabel?: string;
}): React.ReactElement {
  const whiteRef = useRef<HTMLDivElement>(null);
  const vignetteRef = useRef<HTMLDivElement>(null);
  const lidTopRef = useRef<HTMLDivElement>(null);
  const lidBotRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const msgRef = useRef<HTMLParagraphElement>(null);
  const creditRef = useRef<HTMLDivElement>(null);
  const replayRef = useRef<HTMLButtonElement>(null);

  const update = useCallback((f: FrameState) => {
    const { p } = f;

    // Scene 1 uses the same white plane for the gift-box burst handover.
    if (f.opened && f.giftOpen < 1) {
      const oa = f.giftOpen;
      setOpacity(
        whiteRef.current,
        oa < 0.62 ? sstep(0.22, 0.62, oa) : 1 - sstep(0.66, 1, oa),
      );
      return;
    }
    if (!f.opened) {
      setOpacity(whiteRef.current, 0);
      return;
    }

    const wake = GATES.wake(p);
    const inDay = p > WHITE_B;

    setOpacity(whiteRef.current, GATES.whiteCover(p));

    // The fourth and largest haze source: a 30vmax white inset glow over the
    // whole frame. Halved (was 0.85) along with the exposure, bloom and
    // defocus in `Renderer` — together those four were the "fog".
    setOpacity(vignetteRef.current, inDay ? (1 - wake) * 0.42 : 0);

    const b1 = Math.sin(clamp((wake - 0.18) / 0.16, 0, 1) * Math.PI);
    const b2 = Math.sin(clamp((wake - 0.52) / 0.14, 0, 1) * Math.PI);
    const lid = Math.max(b1, b2 * 0.8) * (inDay ? 1 : 0);
    const lidScale = `scaleY(${lid.toFixed(3)})`;
    setStyle(lidTopRef.current, 'transform', lidScale);
    setStyle(lidBotRef.current, 'transform', lidScale);
    setOpacity(lidTopRef.current, lid > 0.01 ? 1 : 0);
    setOpacity(lidBotRef.current, lid > 0.01 ? 1 : 0);

    setOpacity(cardRef.current, inDay ? 1 : 0);

    // The portrait shot has no ring to wait for, so its card comes up early.
    const narrow = viewport.aspect < NARROW_ASPECT;
    const t1 = GATES.finaleTitle(p, narrow);
    // A small overshoot on the way in, so the line lands rather than appears.
    const pop = t1 < 1 ? 0.6 + t1 * 0.5 - Math.sin(t1 * Math.PI) * 0.06 : 1;
    setOpacity(titleRef.current, t1);
    setStyle(
      titleRef.current,
      'transform',
      `scale(${pop.toFixed(3)}) translateY(${((1 - t1) * 18).toFixed(1)}px)`,
    );

    setOpacity(msgRef.current, GATES.finaleMessage(p, narrow));
    setOpacity(creditRef.current, p >= WHITE_B ? GATES.finaleCredit(p, narrow) : 0);

    const rp = GATES.replayButton(p, narrow);
    setOpacity(replayRef.current, rp);
    setStyle(replayRef.current, 'pointerEvents', rp > 0.5 ? 'auto' : 'none');
  }, []);

  useUpdate('overlay', update);

  /**
   * The blur lives on a wrapper, not on the bar itself.
   *
   * CSS applies `filter` before `transform`, so blurring the bar and then
   * scaling it squashes the soft edge down to a couple of pixels — the lid
   * stops reading as an eyelid and becomes a hard sliding bar. Blurring the
   * parent instead keeps a constant 12px falloff at every scale, which is
   * what animating the height would have given, without touching layout.
   */
  const lidWrap: React.CSSProperties = {
    position: 'absolute',
    left: '-4%',
    right: '-4%',
    height: '54%',
    filter: 'blur(12px)',
    pointerEvents: 'none',
  };

  const lidBar: React.CSSProperties = {
    width: '100%',
    height: '100%',
    opacity: 0,
    transform: 'scaleY(0)',
    willChange: 'transform, opacity',
  };

  return (
    <>
      <div style={{ ...lidWrap, top: '-6%' }}>
        <div
          ref={lidTopRef}
          style={{
            ...lidBar,
            background:
              'radial-gradient(ellipse at 50% 100%, rgba(30,14,8,0.92) 0%, rgba(30,14,8,1) 55%)',
            transformOrigin: 'top',
          }}
        />
      </div>
      <div style={{ ...lidWrap, bottom: '-6%' }}>
        <div
          ref={lidBotRef}
          style={{
            ...lidBar,
            background:
              'radial-gradient(ellipse at 50% 0%, rgba(30,14,8,0.92) 0%, rgba(30,14,8,1) 55%)',
            transformOrigin: 'bottom',
          }}
        />
      </div>

      <div
        ref={vignetteRef}
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          opacity: 0,
          boxShadow: 'inset 0 0 40vmax 30vmax rgba(255,250,240,1)',
          // Its opacity is written every frame of the wake. On its own layer
          // that is a blend; without one it is this shadow rasterised again.
          willChange: 'opacity',
        }}
      />

      {/*
        The closing card's type scale is held identical to the standalone film
        — same clamps, same 46ch measure, same 22px rhythm and 7vw gutters.

        It is sized off the viewport WIDTH, which is what makes the headline
        land at its full 108px on a monitor. The ring behind it is not: the
        heads sit on a 30 degree cone (`HEAD_OFF_AXIS` in `DayScene`), about
        37vh from centre, so on a wide aspect the headline runs past a face.
        That is the reference film's framing, kept deliberately — not a
        regression to cap.
      */}
      <div
        ref={cardRef}
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 22,
          padding: '0 7vw',
          textAlign: 'center',
          opacity: 0,
          pointerEvents: 'none',
        }}
      >
        <h2
          ref={titleRef}
          style={{
            margin: 0,
            fontFamily: "'Playfair Display', serif",
            fontWeight: 700,
            // 38px of Playfair 700 needs ~420px for this line and the phone
            // column is 335px, so it broke to three. 30/8.5vw holds two.
            fontSize: 'clamp(30px, 8.5vw, 108px)',
            lineHeight: 1.08,
            color: '#fff8ee',
            textShadow:
              '0 4px 40px rgba(120,80,20,0.35), 0 1px 0 rgba(255,255,255,0.6)',
            textWrap: 'balance',
            transform: 'scale(0.6)',
            opacity: 0,
            willChange: 'transform, opacity',
          }}
        >
          {COPY.finaleTitle}
        </h2>
        <p
          ref={msgRef}
          style={{
            margin: 0,
            maxWidth: '46ch',
            fontFamily: "'Poppins', sans-serif",
            fontWeight: 400,
            fontSize: 'clamp(14px, 1.7vw, 20px)',
            lineHeight: 1.7,
            color: '#fffaf2',
            textShadow: '0 2px 24px rgba(60,40,10,0.45)',
            textWrap: 'pretty',
            opacity: 0,
          }}
        >
          {COPY.finaleMessage}
        </p>
        <div
          ref={creditRef}
          style={{
            display: 'flex',
            alignItems: 'center',
            // Two tracked labels and a dot on one line is 300px-odd; on a
            // phone they wrap rather than run off the side of the card.
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: 14,
            fontFamily: "'Poppins', sans-serif",
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: 'clamp(0.14em, 1.1vw, 0.28em)',
            textTransform: 'uppercase',
            color: '#fff4e2',
            textShadow: '0 2px 18px rgba(60,40,10,0.5)',
            opacity: 0,
          }}
        >
          <span>{teacherLabel}</span>
          <span
            style={{ width: 4, height: 4, borderRadius: '50%', background: 'currentColor' }}
          />
          <span>{classLabel}</span>
        </div>
      </div>

      <button
        ref={replayRef}
        type="button"
        onClick={onReplay}
        // `pointerleave` does not fire after a tap, so on a touch screen this
        // button would simply stay in its hover colour for the rest of the
        // film. Both handlers are skipped where hover is not a real state.
        onPointerEnter={(e) => {
          if (!canHover()) return;
          e.currentTarget.style.background = 'rgba(255,250,240,0.45)';
        }}
        onPointerLeave={(e) => {
          if (!canHover()) return;
          e.currentTarget.style.background = 'rgba(255,250,240,0.28)';
        }}
        className="tap-target"
        style={{
          position: 'absolute',
          right: 'calc(env(safe-area-inset-right, 0px) + clamp(12px, 3vw, 22px))',
          top: 'calc(env(safe-area-inset-top, 0px) + clamp(12px, 3vw, 22px))',
          pointerEvents: 'none',
          opacity: 0,
          cursor: 'pointer',
          border: '1px solid rgba(255,255,255,0.55)',
          borderRadius: 999,
          background: 'rgba(255,250,240,0.28)',
          backdropFilter: 'blur(8px)',
          color: '#fff',
          fontFamily: "'Poppins', sans-serif",
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.24em',
          textTransform: 'uppercase',
          padding: '10px 18px',
          textShadow: '0 1px 12px rgba(60,40,10,0.5)',
        }}
      >
        {COPY.replay}
      </button>

      <div
        ref={whiteRef}
        style={{
          position: 'absolute',
          inset: 0,
          background: '#fffdf8',
          opacity: 0,
          pointerEvents: 'none',
        }}
      />
    </>
  );
}
