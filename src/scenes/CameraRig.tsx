import { useCameraSolver } from '../hooks/useCameraSolver';

/** Mounts the camera solver. Renders nothing. */
export function CameraRig(): null {
  useCameraSolver();
  return null;
}
