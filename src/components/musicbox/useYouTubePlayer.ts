import { useCallback, useEffect, useRef } from 'react';
import { YOUTUBE_VIDEO_ID, YOUTUBE_VOLUME } from '../../config/copy';
import { clamp, lerp } from '../../lib/math';

/** The slice of the IFrame API this uses. */
interface YTPlayer {
  setVolume?: (v: number) => void;
  playVideo?: () => void;
  pauseVideo?: () => void;
  seekTo?: (seconds: number, allowSeekAhead: boolean) => void;
  mute?: () => void;
  unMute?: () => void;
  destroy?: () => void;
}

interface YTNamespace {
  Player: new (
    el: HTMLElement,
    options: {
      videoId: string;
      playerVars: Record<string, string | number>;
      events: { onReady: (e: { target: YTPlayer }) => void };
    },
  ) => YTPlayer;
}

interface YTWindow extends Window {
  YT?: YTNamespace;
  onYouTubeIframeAPIReady?: () => void;
}

const API_SRC = 'https://www.youtube.com/iframe_api';
/** If the API has not answered by now, the pad carries the film alone. */
const API_TIMEOUT = 9000;

let apiReady: Promise<YTNamespace> | null = null;

function loadApi(): Promise<YTNamespace> {
  if (apiReady) return apiReady;

  apiReady = new Promise<YTNamespace>((resolve, reject) => {
    const w = window as YTWindow;
    if (w.YT?.Player) {
      resolve(w.YT);
      return;
    }

    const previous = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      try {
        previous?.();
      } catch {
        /* not ours to care about */
      }
      if (w.YT) resolve(w.YT);
    };

    if (!document.querySelector('script[data-yt-api]')) {
      const script = document.createElement('script');
      script.src = API_SRC;
      script.dataset['ytApi'] = '1';
      script.onerror = () => reject(new Error('yt api blocked'));
      document.head.appendChild(script);
    }

    window.setTimeout(() => reject(new Error('yt api timeout')), API_TIMEOUT);
  });

  return apiReady;
}

export interface MusicController {
  /** Start the song, or start it again from the top after `stop`. */
  start: () => void;
  /** Mute or unmute the song, independently of the ambient pad. */
  setMuted: (muted: boolean) => void;
  /** Fade out and pause, for Replay. */
  stop: () => void;
}

/**
 * The class's chosen song, played through a hidden YouTube iframe.
 *
 * Nothing is fetched until the music box is actually opened — the API script,
 * the player and the video all load on that click. If any of it is blocked
 * the film simply keeps the ambient pad and never mentions it; the scroll is
 * never allowed to wait on this.
 */
export function useYouTubePlayer(muted: boolean): MusicController {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const startedRef = useRef(false);
  /**
   * Whether the song should be playing. `stop` clears it, so a player still
   * loading when Replay is pressed does not start the song on its own later.
   */
  const wantRef = useRef(false);
  /** `stop`'s delayed pause, cancelled if the song is started again first. */
  const pauseTimerRef = useRef(0);
  /** Bumped by every fade, so a newer fade stops an older one mid-ramp. */
  const fadeIdRef = useRef(0);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  useEffect(() => {
    const host = document.createElement('div');
    host.style.cssText =
      'position:absolute;left:0;bottom:0;width:1px;height:1px;overflow:hidden;opacity:0.01;pointer-events:none';
    document.body.appendChild(host);
    hostRef.current = host;
    return () => {
      playerRef.current?.destroy?.();
      playerRef.current = null;
      host.remove();
    };
  }, []);

  /** Ramp the volume rather than cutting it, in both directions. */
  const fadeVolume = useCallback((from: number, to: number, ms: number) => {
    const t0 = performance.now();
    const id = ++fadeIdRef.current;
    const step = (): void => {
      const player = playerRef.current;
      if (!player?.setVolume || id !== fadeIdRef.current) return;
      const k = clamp((performance.now() - t0) / ms, 0, 1);
      if (!mutedRef.current) player.setVolume(Math.round(lerp(from, to, k)));
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, []);

  const start = useCallback(() => {
    wantRef.current = true;
    window.clearTimeout(pauseTimerRef.current);

    // Again, after Replay. The player is already here and only paused, so it
    // starts over from the top - the same entrance as the first time.
    const existing = playerRef.current;
    if (existing) {
      existing.seekTo?.(0, true);
      existing.setVolume?.(0);
      existing.playVideo?.();
      fadeVolume(0, YOUTUBE_VOLUME, 3000);
      return;
    }

    // Still loading from the first time; `onReady` will play it.
    if (startedRef.current) return;
    startedRef.current = true;

    void loadApi()
      .then((YT) => {
        const host = hostRef.current;
        if (!host) return;
        const node = document.createElement('div');
        host.appendChild(node);

        playerRef.current = new YT.Player(node, {
          videoId: YOUTUBE_VIDEO_ID,
          playerVars: {
            autoplay: 1,
            controls: 0,
            playsinline: 1,
            loop: 1,
            playlist: YOUTUBE_VIDEO_ID,
            disablekb: 1,
          },
          events: {
            onReady: (e) => {
              e.target.setVolume?.(0);
              if (!wantRef.current) return;
              e.target.playVideo?.();
              // Three seconds, so it arrives under the scene rather than on it.
              fadeVolume(0, YOUTUBE_VOLUME, 3000);
            },
          },
        });
      })
      .catch((err: unknown) => {
        console.warn('YouTube player unavailable — ambient pad only', err);
      });
  }, [fadeVolume]);

  const setMuted = useCallback((next: boolean) => {
    const player = playerRef.current;
    if (!player) return;
    if (next) player.mute?.();
    else {
      player.unMute?.();
      player.setVolume?.(YOUTUBE_VOLUME);
    }
  }, []);

  const stop = useCallback(() => {
    wantRef.current = false;
    if (!playerRef.current) return;
    fadeVolume(YOUTUBE_VOLUME, 0, 1800);
    window.clearTimeout(pauseTimerRef.current);
    pauseTimerRef.current = window.setTimeout(() => playerRef.current?.pauseVideo?.(), 1900);
  }, [fadeVolume]);

  return { start, setMuted, stop };
}
