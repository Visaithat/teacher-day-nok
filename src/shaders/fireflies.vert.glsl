// Fireflies. Both the wander and the blink live here, so the CPU never
// touches a single position.
attribute float aPhase;
attribute float aSize;

uniform float uTime;

varying float vTw;

void main() {
  // Squaring the sine makes the blink spend most of its cycle dim and spike
  // bright, which is what reads as a firefly rather than a pulsing lamp.
  vTw = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(uTime * 2.2 + aPhase), 2.0);

  vec3 p = position + vec3(
    sin(uTime * 0.5 + aPhase) * 1.6,
    sin(uTime * 0.8 + aPhase * 1.7) * 1.1,
    cos(uTime * 0.4 + aPhase) * 1.4
  );

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = min(aSize * (300.0 / -mv.z), 7.0);
  gl_Position = projectionMatrix * mv;
}
