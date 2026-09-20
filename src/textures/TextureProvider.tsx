import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { buildTextureLibrary, type TextureLibrary } from './library';
import { useUIStore } from '../state/useUIStore';

const TextureContext = createContext<TextureLibrary | null>(null);

/**
 * Builds the texture library once and shares it with the whole tree.
 *
 * Every generator that used to be memoised on the component instance - the
 * glow sprite alone was reached for by a dozen subsystems - now has exactly
 * one instance for the lifetime of the app.
 */
export function TextureProvider({
  children,
}: {
  children: (textures: TextureLibrary) => React.ReactNode;
}): React.ReactElement | null {
  const [library, setLibrary] = useState<TextureLibrary | null>(null);
  const setProgress = useUIStore((s) => s.setProgress);
  const built = useRef(false);

  useEffect(() => {
    // StrictMode double-invokes effects in dev; building twice would double
    // every canvas and every GPU upload.
    if (built.current) return;
    built.current = true;

    let cancelled = false;
    let made: TextureLibrary | null = null;

    void buildTextureLibrary((f) => {
      if (!cancelled) setProgress(0.04 + f * 0.96);
    })
      .then((lib) => {
        made = lib;
        if (cancelled) {
          lib.dispose();
          return;
        }
        setLibrary(lib);
      })
      .catch((err: unknown) => {
        console.error('texture generation failed', err);
      });

    return () => {
      cancelled = true;
      made?.dispose();
    };
  }, [setProgress]);

  if (!library) return null;

  return <TextureContext.Provider value={library}>{children(library)}</TextureContext.Provider>;
}

export function useTextures(): TextureLibrary {
  const lib = useContext(TextureContext);
  if (!lib) throw new Error('useTextures must be used inside <TextureProvider>');
  return lib;
}
