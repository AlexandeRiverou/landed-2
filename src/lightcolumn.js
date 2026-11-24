// Columns of light that mark an objective: the persuasion light pillar (persuasion.js) and the Hold The Line beacon
// (challenges.js). A column stands on the ground and has to reach the objective however high that floats: in the
// cloud and floating-island lands the ground lies hundreds of metres down, and a fixed-height column stopped short
// of the hoop it was pointing at. Each column now stretches to pass its objective by OVER m, stops at a cave roof,
// and fades out softly over its top FADE_TOP instead of ending in a hard edge.
import * as THREE from 'three';

export const FADE_TOP = 0.3; // the top 30% of a column fades from full to nothing
export const OVER = 120;     // m: the full-strength part of a column passes its objective by this much

let fade = null;
// A 1×64 alpha ramp along a column (a cylinder's uv.y runs 0 at the bottom to 1 at the top): solid, then a smooth
// fade to nothing over the top FADE_TOP. Shared by every column; disposeTree only disposes `map`, never `alphaMap`.
export function columnFade() {
  if (fade) return fade;
  const N = 64, data = new Uint8Array(N * 4);
  for (let i = 0; i < N; i++) {
    const a = Math.round(255 * (1 - THREE.MathUtils.smoothstep(i / (N - 1), 1 - FADE_TOP, 1)));
    data.set([a, a, a, 255], i * 4);
  }
  fade = new THREE.DataTexture(data, 1, N);
  fade.magFilter = fade.minFilter = THREE.LinearFilter;
  fade.needsUpdate = true;
  return fade;
}

// How tall a column standing on `ground` must be: at least `min` m, tall enough that its full-strength part passes
// `topY` (the objective's height) by OVER m, and never through a roof (`roof`: the ceiling over it, Infinity in the
// open). At least 20 m, so a column in a low cave is still there.
export function columnHeight(ground, topY, min, roof = Infinity) {
  const h = Math.max(min, (topY + OVER - ground) / (1 - FADE_TOP));
  return Math.max(20, Number.isFinite(roof) ? Math.min(h, roof - ground) : h);
}
