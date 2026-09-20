import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

/**
 * The film always begins at the gift box, so the browser must not put the
 * scroll back where it was.
 *
 * The page is 3200vh of scroll spacer and the whole film is scrubbed from it.
 * On reload the browser restores the old scroll offset, but every other piece
 * of state - `frame.opened`, `frame.p`, the scene mounts - starts from zero,
 * so Scene 1 renders while the document sits at, say, 50%. Nothing looks wrong
 * until the gift is opened: the scroll unlocks, Lenis syncs to the restored
 * offset, and the film snaps to the middle.
 *
 * This has to run before the browser restores, which is why it is here at
 * module scope rather than in a hook - effects run too late. `useLenisScroll`
 * also forces the offset to zero on mount and on bfcache restore, because
 * `scrollRestoration` is advisory and a back/forward restore ignores it.
 */
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

const root = document.getElementById('root');
if (!root) throw new Error('#root missing from index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
