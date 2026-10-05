import { useCallback, useRef } from 'react';
import { COPY } from '../../config/copy';
import { GATES } from '../../config/timeline';
import { useUpdate } from '../../lib/updateBus';
import { setOpacity, setStyle } from '../../lib/domWrite';
import type { FrameState } from '../../state/frame';
import { useViewport } from '../../hooks/useViewport';

/**
 * "Happy Teacher's Day" over the night sky, plus the scroll hint.
 *
 * The words do not fade in together - each lights up on its own scroll beat,
 * 0.032 apart, like stars switching on. The subtitle waits until all three
 * are up. Each word also lifts 14px as it arrives, which is what stops the
 * reveal reading as a plain opacity ramp.
 */
export function TitleCard(): React.ReactElement {
  const wrapRef = useRef<HTMLDivElement>(null);
  const wordRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const subRef = useRef<HTMLParagraphElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  // No "scroll" on a touch screen: it does not scroll there (`StepNav`).
  const { touch } = useViewport();

  const update = useCallback((f: FrameState) => {
    const { p } = f;
    setOpacity(wrapRef.current, f.opened ? GATES.titleIn(p) : 0);

    for (let i = 0; i < COPY.titleWords.length; i++) {
      const el = wordRefs.current[i];
      if (!el) continue;
      const o = GATES.titleWord(p, i, false);
      setOpacity(el, o);
      setStyle(el, 'transform', `translateY(${((1 - o) * 14).toFixed(2)}px)`);
    }

    const subO = GATES.titleWord(p, 0, true);
    setOpacity(subRef.current, subO);
    setStyle(subRef.current, 'transform', `translateY(${((1 - subO) * 14).toFixed(2)}px)`);

    setOpacity(hintRef.current, f.opened ? GATES.scrollHint(p) : 0);
  }, []);

  useUpdate('overlay', update);

  return (
    <>
      <div
        ref={wrapRef}
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '0 6vw',
          opacity: 0,
          pointerEvents: 'none',
        }}
      >
        <h1
          style={{
            margin: 0,
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            fontFamily: "'Playfair Display', serif",
            fontWeight: 600,
            // The floor drops so three Playfair words fit two lines on a
            // phone instead of three; 8.4vw still reaches 124px by 1476px.
            fontSize: 'clamp(34px, 8.4vw, 124px)',
            lineHeight: 1.34,
            letterSpacing: '0.01em',
            color: '#f3f6ff',
          }}
        >
          {COPY.titleWords.map((word, i) => (
            <span
              key={word}
              ref={(el) => {
                wordRefs.current[i] = el;
              }}
              style={{
                opacity: 0,
                marginRight: i === COPY.titleWords.length - 1 ? 0 : '0.28em',
                textShadow: '0 0 34px rgba(178,204,255,0.75)',
              }}
            >
              {word}
            </span>
          ))}
        </h1>
        <p
          ref={subRef}
          style={{
            margin: '22px 0 0',
            opacity: 0,
            fontSize: 'clamp(11px, 1.5vw, 15px)',
            fontWeight: 400,
            // 29 uppercase characters at 0.42em is 320px inside a 344px
            // column. The tracking is what runs out first, not the size.
            letterSpacing: 'clamp(0.18em, 1.2vw, 0.42em)',
            textTransform: 'uppercase',
            color: 'rgba(198,214,255,0.92)',
          }}
        >
          {COPY.titleSub}
        </p>
      </div>

      {touch ? null : (
        <div
          ref={hintRef}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 6dvh)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
            opacity: 0,
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              fontSize: 10,
              letterSpacing: '0.36em',
              textTransform: 'uppercase',
              color: 'rgba(214,226,255,0.75)',
            }}
          >
            {COPY.scrollHint}
          </span>
          <span
            style={{
              width: 1,
              height: 46,
              background: 'linear-gradient(rgba(214,226,255,0.9), rgba(214,226,255,0))',
              animation: 'tdPulse 2.2s ease-in-out infinite',
            }}
          />
        </div>
      )}
    </>
  );
}
