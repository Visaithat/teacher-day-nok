import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/**
 * Decompresses meshopt geometry off the main thread.
 *
 * The decoder ships its own worker mode (`useWorkers`), but it builds that
 * worker by stringifying two of its functions and referring to them by name -
 * so a minified build, where those names are gone, starts a worker that dies
 * on its first message. A real module worker survives the bundler.
 */

export interface DecodeRequest {
  id: number;
  count: number;
  size: number;
  source: Uint8Array;
  mode: string;
  filter: string;
}

export type DecodeResponse =
  | { id: number; ok: true; value: Uint8Array }
  | { id: number; ok: false; error: string };

interface WorkerScope {
  postMessage(message: DecodeResponse, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (e: MessageEvent<DecodeRequest>) => void): void;
}

const scope = self as unknown as WorkerScope;

scope.addEventListener('message', (e) => {
  const { id, count, size, source, mode, filter } = e.data;
  void MeshoptDecoder.ready
    .then(() => {
      const target = new Uint8Array(count * size);
      MeshoptDecoder.decodeGltfBuffer(target, count, size, source, mode, filter);
      scope.postMessage({ id, ok: true, value: target }, [target.buffer]);
    })
    .catch((err: unknown) => {
      scope.postMessage({ id, ok: false, error: String(err) });
    });
});
