uniform float uOpacity;

varying float vTw;
varying vec3 vCol;

void main() {
  float d = length(gl_PointCoord - vec2(0.5));
  // A tight core plus a wide faint bleed - a hard disc reads as confetti.
  float core = smoothstep(0.5, 0.12, d);
  float bleed = smoothstep(0.5, 0.0, d) * 0.35;
  float a = (core + bleed) * vTw * uOpacity;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vCol, a);
}
