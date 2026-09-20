uniform sampler2D uMap;
uniform float uOpacity;

varying vec3 vCol;
varying float vRot;

void main() {
  // Spin the sprite by rotating its UVs about the centre.
  vec2 uv = gl_PointCoord - 0.5;
  float s = sin(vRot);
  float c = cos(vRot);
  uv = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c) + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) discard;

  float a = texture2D(uMap, uv).a * uOpacity;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vCol, a);
}
