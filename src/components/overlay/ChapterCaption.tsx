import { useCallback, useRef } from 'react';
import { COPY } from '../../config/copy';
import { GATES } from '../../config/timeline';
import { useUpdate } from '../../lib/updateBus';
import { setOpacity, setStyle, setText } from '../../lib/domWrite';
import type { FrameState } from '../../state/frame';

/**
 * The three chapter titles.
 *
 * Each fades in over the 0.03 of scroll before its mark and out over the 0.03
 * after, so it is fully present exactly on the beat it names. "The Gate" sits
 * low in the frame instead of high, because at that moment the gate sign is
 * occupying the upper third.
 *
 * The caption yields entirely to the student panel: on the street the panel
 * is the text you are meant to be reading.
 */
export function ChapterCaption(): React.ReactElement {
  const wrapRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);

  const update = useCallback((f: FrameState) => {
    const { p } = f;

    let strongest = 0;
    let text = '';
    let low = false;
    for (const c of COPY.chapters) {
      const o = GATES.chapter(p, c.p);
      if (o > strongest) {
        strongest = o;
        text = c.text;
        low = c.low === true;
      }
    }

    if (text) setText(textRef.current, text);
    setStyle(wrapRef.current, 'top', low ? '76vh' : '7vh');
    setOpacity(wrapRef.current, strongest * (1 - f.panelStrength));
  }, []);

  useUpdate('overlay', update);

  return (
    <div
      ref={wrapRef}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: '7vh',
        textAlign: 'center',
        opacity: 0,
        pointerEvents: 'none',
      }}
    >
      <span
        ref={textRef}
        style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: 'clamp(15px, 2.1vw, 26px)',
          fontWeight: 400,
          letterSpacing: '0.12em',
          lineHeight: 1.5,
          color: 'rgba(255,236,206,0.9)',
          textShadow: '0 2px 24px rgba(0,0,0,0.7)',
        }}
      >
        {COPY.chapters[0]?.text ?? ''}
      </span>
    </div>
  );
}
