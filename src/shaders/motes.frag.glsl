uniform sampler2D uMap;
uniform float uOpacity;
uniform vec3 uColor;

varying float vLife;

void main() {
  float a = texture2D(uMap, gl_PointCoord).a * vLife * uOpacity;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
}
