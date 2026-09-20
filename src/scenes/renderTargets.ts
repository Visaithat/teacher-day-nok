import type { Camera, Scene } from 'three';

/**
 * The film renders three separate scenes, and which one is on screen is a
 * function of the story, not of the React tree:
 *
 *  - the gift box, on its own camera, before the scroll is ever released
 *  - the night world, the main journey
 *  - the day scene, which takes over inside the white-out
 *
 * The renderer needs direct handles to all three. Passing them through React
 * would mean a re-render at exactly the two moments the picture must not
 * hitch, so they are published here instead.
 */
export interface RenderTargets {
  giftScene: Scene | null;
  giftCamera: Camera | null;
  dayScene: Scene | null;
  dayCamera: Camera | null;
}

export const renderTargets: RenderTargets = {
  giftScene: null,
  giftCamera: null,
  dayScene: null,
  dayCamera: null,
};
