// World curvature for the tiny-planet zone. Every material's vertex shader drops each vertex by
// k·d², where d is its horizontal distance from the camera, so the ground falls away toward a close
// horizon. Gameplay never sees it: heights, collisions and positions stay flat. Things that live
// "in the sky" (dome, planets) opt out with material.userData.noCurve.
import * as THREE from 'three';

export const CURVE = { value: 0 };

// How far below its true position a point at (x, z) is drawn. Used to line up HTML overlays.
export const curveDrop = (x, z, cam) => CURVE.value * ((x - cam.x) ** 2 + (z - cam.z) ** 2);

const BEND = `
  {
    vec3 cw = transpose(mat3(viewMatrix)) * (mvPosition.xyz - viewMatrix[3].xyz); // view → world
    vec2 cd = cw.xz - cameraPosition.xz;
    mvPosition.xyz -= mat3(viewMatrix) * vec3(0.0, uCurve * dot(cd, cd), 0.0);
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
    shader.vertexShader = `uniform float uCurve;\n${vs}`;
  };
  // Curved and flat variants of the same material type must not share a compiled program.
  THREE.Material.prototype.customProgramCacheKey = function () { return this.userData.noCurve ? 'flat' : 'curved'; };
}

export function noCurve(material) { material.userData.noCurve = true; return material; }
