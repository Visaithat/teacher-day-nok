import { COPY } from '../../config/copy';
import { useUIStore } from '../../state/useUIStore';

/**
 * The sound toggle, bottom left.
 *
 * One control mutes both layers at once - the ambient pad and the song from
 * the music box - because from the viewer's side there is only ever "sound".
 */
export function MuteButton({ onToggle }: { onToggle: () => void }): React.ReactElement {
  const muted = useUIStore((s) => s.muted);

  return (
    <button
      type="button"
      onClick={onToggle}
      style={{
        position: 'absolute',
        left: 22,
        bottom: 22,
        pointerEvents: 'auto',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        border: '1px solid rgba(255,236,206,0.28)',
        borderRadius: 999,
        background: 'rgba(12,12,18,0.42)',
        backdropFilter: 'blur(6px)',
        color: 'rgba(255,242,224,0.86)',
        fontFamily: "'Poppins', sans-serif",
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: '0.22em',
        textTransform: 'uppercase',
        padding: '9px 15px',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: muted ? 'rgba(255,242,224,0.25)' : '#ffd08a',
        }}
      />
      <span>{muted ? COPY.soundOff : COPY.soundOn}</span>
    </button>
  );
}
