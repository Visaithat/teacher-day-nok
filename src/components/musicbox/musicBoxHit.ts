/**
 * The music box's hit test, published for the stage's click handler.
 *
 * The box is opened by a click on the stage, and the handler only knows to
 * open it if `frame.hoverMusicBox` is already true - which is set by a raycast
 * that runs in the render loop, gated on the pointer having moved.
 *
 * That holds for a mouse and fails for a finger. A clean tap can reach `click`
 * without a single `pointermove`, and even with `pointerdown` feeding the
 * pointer position there may be no animation frame at all between putting the
 * finger down and lifting it. So the first tap on the music box did nothing,
 * and on a phone the song simply never started.
 *
 * Rather than guess, the click handler runs the test itself, from where the
 * tap actually landed. Same handle pattern as `dayChars.ts`, and for the same
 * reason: passing it through React would re-render the overlay every frame.
 */
export const musicBoxHit: {
  test: ((ndcX: number, ndcY: number) => boolean) | null;
} = { test: null };
