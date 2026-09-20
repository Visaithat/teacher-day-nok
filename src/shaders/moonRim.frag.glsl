// A thin atmospheric halo on a shell 4.8% larger than the moon.
uniform float uOpacity;
uniform vec3 uColor;

varying vec3 vN;
varying vec3 vV;

void main() {
  float rim = pow(1.0 - clamp(dot(vN, vV), 0.0, 1.0), 8.0);
  gl_FragColor = vec4(uColor, rim * uOpacity);
}
