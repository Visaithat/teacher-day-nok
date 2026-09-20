import { useCallback, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { ACESFilmicToneMapping } from 'three';
import { Orchestrator } from './scenes/Orchestrator';
import { CameraRig } from './scenes/CameraRig';
import { Renderer } from './scenes/Renderer';
import { AdaptiveQuality, PerfHud } from './scenes/PerfTools';
import { World } from './scenes/World';
import { TextureProvider } from './textures/TextureProvider';
import { Loader } from './components/overlay/Loader';
import { Grain } from './components/overlay/Grain';
import { GiftUI } from './components/overlay/GiftUI';
import { TitleCard } from './components/overlay/TitleCard';
import { ChapterCaption } from './components/overlay/ChapterCaption';
import { StudentPanel } from './components/overlay/StudentPanel';
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
import { QUALITY } from './config/quality';
import { DEFAULT_PROPS } from './config/copy';
import { SCROLLER_HEIGHT_VH, GIFT_OPEN_SECONDS } from './config/timeline';
import { frame, resetFrame } from './state/frame';
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
  const onStageClick = useCallback(() => {
    if (!frame.opened) {
      openGift();
      return;
    }
    if (frame.hoverMusicBox) openMusicBox();
  }, [openGift, openMusicBox]);

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
          gl={{
            powerPreference: 'high-performance',
            // The composer renders to its own non-multisampled targets, so
            // canvas MSAA would be paid for and then thrown away.
            antialias: false,
            toneMapping: ACESFilmicToneMapping,
            toneMappingExposure: 0.9,
          }}
          camera={{ fov: 52, near: 0.5, far: 3000, position: [0, 262, 232] }}
        >
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
        </div>
      </div>

      <div style={{ height: `${SCROLLER_HEIGHT_VH}vh`, pointerEvents: 'none' }} />
    </>
  );
}
