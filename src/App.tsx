import { useCallback, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { ACESFilmicToneMapping } from 'three';
import { Orchestrator } from './scenes/Orchestrator';
import { CameraRig } from './scenes/CameraRig';
import { Renderer } from './scenes/Renderer';
import { AdaptiveQuality, PerfHud } from './scenes/PerfTools';
import { ViewportProbe } from './scenes/ViewportProbe';
import { World } from './scenes/World';
import { TextureProvider } from './textures/TextureProvider';
import { Loader } from './components/overlay/Loader';
import { Grain } from './components/overlay/Grain';
import { GiftUI } from './components/overlay/GiftUI';
import { TitleCard } from './components/overlay/TitleCard';
import { ChapterCaption } from './components/overlay/ChapterCaption';
import { StudentPanel } from './components/overlay/StudentPanel';
import { StudentMessage } from './components/overlay/StudentMessage';
import { NowPlaying } from './components/overlay/NowPlaying';
import { ProgressRail } from './components/overlay/ProgressRail';
import { MuteButton } from './components/overlay/MuteButton';
import { CursorTrail } from './components/overlay/CursorTrail';
import { Finale } from './components/overlay/Finale';
import { FloatingLines } from './components/overlay/FloatingLines';
import { useLenisScroll } from './hooks/useLenisScroll';
import { useReducedMotion } from './hooks/useReducedMotion';
import { usePointerTracking } from './hooks/usePointerTracking';
import { useYouTubePlayer } from './components/musicbox/useYouTubePlayer';
import { musicBoxHit } from './components/musicbox/musicBoxHit';
import { QUALITY } from './config/quality';
import { DEFAULT_PROPS } from './config/copy';
import { SCROLLER_HEIGHT_VH, GIFT_OPEN_SECONDS } from './config/timeline';
import { frame, resetFrame } from './state/frame';
import { fitFov } from './state/viewport';
import { useUIStore } from './state/useUIStore';
import { filmAudio } from './audio/audio';

export default function App(): React.ReactElement {
  useReducedMotion();
  const scroll = useLenisScroll();
  const stageRef = useRef<HTMLDivElement>(null);
  usePointerTracking(stageRef);

  const quality = useUIStore((s) => s.quality);
  const booted = useUIStore((s) => s.booted);
  const opened = useUIStore((s) => s.opened);
  const muted = useUIStore((s) => s.muted);
  const setOpened = useUIStore((s) => s.setOpened);
  const setUnlocked = useUIStore((s) => s.setUnlocked);
  const setPendingOpen = useUIStore((s) => s.setPendingOpen);
  const setMusicOn = useUIStore((s) => s.setMusicOn);
  const toggleMuted = useUIStore((s) => s.toggleMuted);
  const replayStore = useUIStore((s) => s.replay);

  const settings = QUALITY[quality];
  const music = useYouTubePlayer(muted);

  const openGift = useCallback(() => {
    if (frame.opened) return;
    // A click that lands while the world is still building is remembered and
    // honoured the moment boot finishes, rather than being swallowed.
    if (!useUIStore.getState().booted) {
      setPendingOpen(true);
      return;
    }
    frame.opened = true;
    frame.openedAt = frame.time;
    filmAudio.start();
    setOpened(true);
  }, [setOpened, setPendingOpen]);

  const openMusicBox = useCallback(() => {
    if (frame.musicBoxOpen) return;
    frame.musicBoxOpen = true;
    frame.musicBoxOpenedAt = frame.time;
    setMusicOn(true);
    filmAudio.start();
    music.start();
  }, [music, setMusicOn]);

  // One click handler for the whole stage: the gift first, then the box.
  const onStageClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!frame.opened) {
        openGift();
        return;
      }
      if (frame.hoverMusicBox) {
        openMusicBox();
        return;
      }

      // `hoverMusicBox` is maintained by a raycast in the render loop, gated
      // on the pointer having moved. A finger does not move: a tap can reach
      // `click` with no `pointermove` and, if it is quick, with no animation
      // frame at all in between - so the first tap on the box used to be
      // swallowed and the song never started. Ask directly instead, from
      // where the tap actually landed.
      const el = stageRef.current;
      const test = musicBoxHit.test;
      if (!el || !test) return;
      const r = el.getBoundingClientRect();
      const ndcX = ((e.clientX - r.left) / r.width) * 2 - 1;
      const ndcY = -((e.clientY - r.top) / r.height) * 2 + 1;
      if (test(ndcX, ndcY)) openMusicBox();
    },
    [openGift, openMusicBox],
  );

  useEffect(() => {
    if (!booted) return;
    if (!useUIStore.getState().pendingOpen) return;
    setPendingOpen(false);
    openGift();
  }, [booted, openGift, setPendingOpen]);

  // Release the scroll once the lid animation has played out.
  useEffect(() => {
    if (!opened) return;
    const id = window.setTimeout(() => {
      frame.unlocked = true;
      // The gift scene unmounts here and stops publishing its progress. If a
      // backgrounded tab starved rAF during the lid animation this would be
      // left just under 1, and the finale layer checks it — so settle it.
      frame.giftOpen = 1;
      setUnlocked(true);
      scroll.current?.setLocked(false);
    }, GIFT_OPEN_SECONDS * 1000);
    return () => window.clearTimeout(id);
  }, [opened, scroll, setUnlocked]);

  const onMute = useCallback(() => {
    const next = !useUIStore.getState().muted;
    toggleMuted();
    filmAudio.setMuted(next);
    music.setMuted(next);
  }, [music, toggleMuted]);

  /**
   * Hold the film still while the phone's message card is open.
   *
   * `setPaused`, never `setLocked`: the latter rewinds to the top on release,
   * because for Scene 1 "unlock" means "the film starts now". Using it here
   * would send the reader back to the gift box every time they closed a letter.
   */
  const onHold = useCallback(
    (held: boolean) => {
      scroll.current?.setPaused(held);
    },
    [scroll],
  );

  const onReplay = useCallback(() => {
    resetFrame();
    replayStore();
    music.stop();
    scroll.current?.scrollToTop();
  }, [music, replayStore, scroll]);

  useEffect(() => () => filmAudio.dispose(), []);

  return (
    <>
      <div className="stage" ref={stageRef} onClick={onStageClick}>
        <Canvas
          dpr={settings.dpr as [number, number]}
          shadows={settings.shadows}
          // A mobile URL bar collapsing mid-scroll is a resize, and every one
          // of them reallocates the whole composer chain in `Renderer`. R3F's
          // own resize debounce is 0; this absorbs the churn.
          resize={{ debounce: 200, scroll: false }}
          gl={{
            powerPreference: 'high-performance',
            // The composer renders to its own non-multisampled targets, so
            // canvas MSAA would be paid for and then thrown away.
            antialias: false,
            toneMapping: ACESFilmicToneMapping,
            toneMappingExposure: 0.9,
          }}
          // The solver overwrites this on frame one; fitting it here only
          // keeps the very first paint from being framed for a wide window.
          camera={{ fov: fitFov(52), near: 0.5, far: 3000, position: [0, 262, 232] }}
        >
          <ViewportProbe />
          <AdaptiveQuality />
          <PerfHud />
          <Orchestrator />
          <CameraRig />
          <TextureProvider>{() => <World />}</TextureProvider>
          <Renderer />
        </Canvas>

        <div className="vignette" />

        <div className="overlay-root">
          <Grain enabled={DEFAULT_PROPS.grain} />
          <CursorTrail />
          <GiftUI onOpen={openGift} />
          <TitleCard />
          <ChapterCaption />
          <StudentPanel />
          <FloatingLines />
          <Finale onReplay={onReplay} />
          <NowPlaying />
          <ProgressRail />
          <MuteButton onToggle={onMute} />
          <Loader />
          {/* Last, so the dialog is last in the tab order too. */}
          <StudentMessage onHold={onHold} />
        </div>
      </div>

      <div style={{ height: `${SCROLLER_HEIGHT_VH}vh`, pointerEvents: 'none' }} />
    </>
  );
}
