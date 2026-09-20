// Falling petals - garden blossom and the Scene 7 drift toward the lens.
//
// The source ran these as individual Sprites, one material each, updating
// every position on the CPU. Here the whole field is one draw call and the
// fall, sway, spin and recycling all happen on the GPU.
attribute float aPhase;
attribute float aSize;
attribute float aFall;   // units per second
attribute vec3 aColor;

uniform float uTime;
uniform float uPixelScale;
uniform float uSpan;     // vertical distance a petal falls before recycling
uniform float uFloor;    // y it recycles at

varying vec3 vCol;
varying float vRot;

void main() {
  vCol = aColor;
  vRot = uTime * 0.72 + aPhase;

  vec3 p = position;
  // mod() gives free recycling: a petal that passes the floor reappears at
  // the top with no CPU branch and no per-particle state.
  p.y = uFloor + mod(p.y - uFloor - aFall * uTime, uSpan);
  // Amplitude 0.6: the source integrated a small per-frame nudge, which
  // works out to about this much lateral swing at 60fps.
  p.x += sin(uTime * 0.6 + aPhase) * 0.6;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = aSize * (uPixelScale / -mv.z);
  gl_Position = projectionMatrix * mv;
}
