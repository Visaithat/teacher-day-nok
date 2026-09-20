uniform sampler2D uMap;
uniform float uOpacity;

varying float vTw;

void main() {
  vec4 t = texture2D(uMap, gl_PointCoord);
  gl_FragColor = vec4(vec3(1.0, 0.84, 0.52), t.a * vTw * uOpacity * 0.7);
}
