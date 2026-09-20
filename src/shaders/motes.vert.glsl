// Rising motes - the gift box burst and the music box's escaping sparks.
attribute float aPhase;
attribute float aSize;
attribute float aSpeed;

uniform float uTime;
uniform float uPixelScale;
uniform float uRise;     // total climb before recycling
uniform float uFloor;
uniform float uSway;

varying float vLife;

void main() {
  vec3 p = position;
  float t = mod(aPhase + uTime * aSpeed, 1.0);
  p.y = uFloor + t * uRise;
  p.x += sin(uTime * 0.8 + aPhase * 6.28) * uSway;

  // Fade in and out across the climb so nothing pops at either end.
  vLife = sin(t * 3.14159265);

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = aSize * (uPixelScale / -mv.z);
  gl_Position = projectionMatrix * mv;
}
