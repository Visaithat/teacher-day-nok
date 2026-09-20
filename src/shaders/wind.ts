import { MeshStandardMaterial, type IUniform } from 'three';

/**
 * The wind that moves the flower beds and the grass.
 *
 * This is a `MeshStandardMaterial` with two small injections rather than a
 * custom shader, so the flowers keep real PBR lighting, shadows and the
 * environment map. The bend is a cheap cantilever: displacement scales with
 * `max(transformed.y, 0.0)`, so the base of every stem stays planted while
 * the tip travels. Phase comes from the instance's world X/Z, which makes the
 * gust visibly travel across the bed instead of every flower swaying in step.
 *
 * All 16 wind materials share ONE uniform object and ONE program:
 *
 *  - Sharing the uniforms means the update loop writes two numbers per frame
 *    for the entire garden.
 *  - `customProgramCacheKey` is not optional. Without it three.js treats each
 *    material's injected source as unique and compiles sixteen identical
 *    programs, which is a visible hitch on arrival at the garden.
 */

export interface WindUniforms {
  readonly uTime: IUniform<number>;
  readonly uLit: IUniform<number>;
}

export function createWindUniforms(): WindUniforms {
  return { uTime: { value: 0 }, uLit: { value: 1 } };
}

const VERTEX_HEAD = 'uniform float uTime;\n';

const VERTEX_BODY = /* glsl */ `
#ifdef USE_INSTANCING
  vec3 wWorld = instanceMatrix[3].xyz;
#else
  vec3 wWorld = vec3(0.0);
#endif
  float wPhase = wWorld.x * 0.16 + wWorld.z * 0.21;
  float wGust = 0.55 + 0.45 * sin(uTime * 0.23 + wWorld.x * 0.02);
  float wSway = sin(uTime * 1.35 + wPhase) * 0.07
              + sin(uTime * 0.47 + wPhase * 1.7) * 0.05;
  float wBend = max(transformed.y, 0.0);
  transformed.x += wSway * wGust * wBend * 1.4;
  transformed.z += wSway * wGust * wBend * 0.7;
`;

const FRAGMENT_HEAD = 'uniform float uLit;\n';

/** Never fully dark: the beds keep a base read even outside the garden beat. */
const FRAGMENT_BODY = 'gl_FragColor.rgb *= mix(0.45, 1.15, uLit);\n';

export interface WindMaterialOptions {
  readonly color: string;
  readonly emissive?: string;
}

export function createWindMaterial(
  uniforms: WindUniforms,
  { color, emissive }: WindMaterialOptions,
): MeshStandardMaterial {
  const m = new MeshStandardMaterial({
    color,
    roughness: 0.78,
    metalness: 0,
    emissive: emissive ?? color,
    emissiveIntensity: 0.12,
    envMapIntensity: 0.7,
  });

  m.onBeforeCompile = (shader) => {
    shader.uniforms['uTime'] = uniforms.uTime;
    shader.uniforms['uLit'] = uniforms.uLit;

    shader.vertexShader = VERTEX_HEAD + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>\n${VERTEX_BODY}`,
    );

    shader.fragmentShader = FRAGMENT_HEAD + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>\n${FRAGMENT_BODY}`,
    );
  };

  m.customProgramCacheKey = () => 'wind';
  return m;
}
