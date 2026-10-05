import { COPY } from '../../config/copy';
import { currentStops } from '../../hooks/useStepNav';
import { useViewport } from '../../hooks/useViewport';
import { useUIStore } from '../../state/useUIStore';

/**
 * Back, where you are, and Next - a phone or tablet's way through the film.
 *
 * Bottom centre, one row above the sound pill and the now-playing chip, and
 * well below the 74% line the student's message button is held above
 * (`EDGE_Y_BOTTOM` in `StudentMessage`), so the three never meet.
 *
 * Gone on the last stop. The finale is the end of the film and offers its own
 * Replay, and on the wide shot this row would sit on the nearest student's
 * face and their message - a swipe down still goes back.
 *
 * Next breathes on the first stop, until the film has been moved on once by
 * either a tap or a swipe. On a desktop the film tells you to scroll; here
 * this is that prompt.
 */
export function StepNav({
  next,
  back,
  hidden,
}: {
  next: () => void;
  back: () => void;
  /** The message dialog is open. */
  hidden: boolean;
}): React.ReactElement | null {
  // Re-render on a rotation: the finale has one stop on a tall frame and two
  // on a wide one, so the row of dots changes length.
  useViewport();
  const unlocked = useUIStore((s) => s.unlocked);
  const index = useUIStore((s) => s.stepIndex);

  const stops = currentStops();
  const atStart = index <= 0;
  const atEnd = index >= stops.length - 1;

  if (!unlocked || hidden || atEnd) return null;

  return (
    <nav className="step-nav" aria-label="Scenes">
      <button
        type="button"
        className="step-btn tap-target"
        style={{ visibility: atStart ? 'hidden' : 'visible' }}
        aria-label={COPY.stepBack}
        // Never let a press reach the stage, which opens the music box.
        onClick={(e) => {
          e.stopPropagation();
          back();
        }}
      >
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path
            d="m15 18-6-6 6-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {COPY.stepBack}
      </button>

      <ol className="step-dots" aria-hidden="true">
        {stops.map((s, i) => (
          <li key={s.label} data-on={i === index ? '' : undefined} />
        ))}
      </ol>

      <button
        type="button"
        className="step-btn tap-target"
        data-hint={atStart ? '' : undefined}
        aria-label={`${COPY.stepNext}${stops[index + 1] ? ` — ${stops[index + 1]?.label}` : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          next();
        }}
      >
        {COPY.stepNext}
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path
            d="m9 18 6-6-6-6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </nav>
  );
}
