// Star field. One point per star, twinkling entirely on the GPU.
attribute float aPhase;
attribute float aSize;
attribute vec3 aColor;

uniform float uTime;
uniform float uDpr;

varying float vTw;
varying vec3 vCol;

void main() {
  // Two sines at incommensurate rates: the twinkle never visibly repeats,
  // which is what stops a large field reading as a pulsing grid.
  vTw = 0.62 + 0.38 * sin(uTime * 1.35 + aPhase)
        * (0.4 + 0.6 * sin(uTime * 0.37 + aPhase * 2.1));
  vCol = aColor;

  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(aSize * uDpr * (720.0 / -mv.z), 0.7, 3.6 * uDpr);
  gl_Position = projectionMatrix * mv;
}
