// World curvature for the tiny-planet zone. Every material's vertex shader drops each vertex by
// k·d², where d is its horizontal distance from the camera, so the ground falls away toward a close
// horizon. Gameplay never sees it: heights, collisions and positions stay flat. Things that live
// "in the sky" (dome, planets) opt out with material.userData.noCurve.
// A second, independent bend measures d along one world axis only (AXIS_CURVE across CURVE_AXIS):
// negative, it lifts the ground on both sides like the inside of a ring and leaves the other axis flat.
import * as THREE from 'three';

export const CURVE = { value: 0 };
export const AXIS_CURVE = { value: 0 };
export const CURVE_AXIS = { value: new THREE.Vector2(1, 0) }; // unit (x, z) direction the axis bend is measured along

// How far below its true position a point at (x, z) is drawn (negative: above). Used to line up HTML overlays.
export function curveDrop(x, z, cam) {
  const dx = x - cam.x, dz = z - cam.z, a = dx * CURVE_AXIS.value.x + dz * CURVE_AXIS.value.y;
  return CURVE.value * (dx * dx + dz * dz) + AXIS_CURVE.value * a * a;
}

const BEND = `
  {
    vec3 cw = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz); // view → world
    vec2 cd = cw.xz - cameraPosition.xz;
    float ca = dot(cd, uCurveAxis);
    mvPosition.xyz -= mat3(viewMatrix) * vec3(0.0, uCurve * dot(cd, cd) + uAxisCurve * ca * ca, 0.0);
    gl_Position = projectionMatrix * mvPosition;
  }`;

export function installCurvature() {
  THREE.Material.prototype.onBeforeCompile = function (shader) {
    if (this.userData.noCurve) return;
    let vs = shader.vertexShader;
    if (vs.includes('#include <project_vertex>')) vs = vs.replace('#include <project_vertex>', `#include <project_vertex>${BEND}`);
    else if (vs.includes('gl_Position = projectionMatrix * mvPosition;')) vs = vs.replace('gl_Position = projectionMatrix * mvPosition;', `gl_Position = projectionMatrix * mvPosition;${BEND}`); // sprites, particles
    else return;
    shader.uniforms.uCurve = CURVE;
    shader.uniforms.uAxisCurve = AXIS_CURVE;
    shader.uniforms.uCurveAxis = CURVE_AXIS;
    shader.vertexShader = `uniform float uCurve;\nuniform float uAxisCurve;\nuniform vec2 uCurveAxis;\n${vs}`;
  };
  // Curved and flat variants of the same material type must not share a compiled program.
  THREE.Material.prototype.customProgramCacheKey = function () { return this.userData.noCurve ? 'flat' : 'curved'; };
}

export function noCurve(material) { material.userData.noCurve = true; return material; }
