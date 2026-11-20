import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const brushCount = 10;
const asset = name => new URL(`./assets/founder/${name}`, import.meta.url).href;

// The original helmet model stays aligned to the cutout. A mask on the
// actual material follows the pointer, including across the curved visor.
export async function createHelmetRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas, alpha: true, antialias: true, powerPreference: 'low-power'
  });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.36;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1.28, .1, 25);
  camera.position.z = 7;
  const pivot = new THREE.Group();
  pivot.position.y = .77;
  scene.add(pivot);

  const decoder = new DRACOLoader().setDecoderPath(new URL('./assets/vendor/draco/', import.meta.url).href).setWorkerLimit(1);
  let noise, environment;
  const dispose = () => {
    scene.traverse(object => {
      if (!object.isMesh) return;
      for (const value of Object.values(object.material)) if (value?.isTexture) value.dispose();
      object.material.dispose();
      object.geometry.dispose();
    });
    noise?.dispose();
    environment?.dispose();
    renderer.dispose();
  };

  try {
    const [modelResult, noiseResult] = await Promise.allSettled([
      new GLTFLoader().setDRACOLoader(decoder).loadAsync(asset('helmet.glb')),
      new THREE.TextureLoader().loadAsync(asset('reveal-noise.webp'))
    ]);
    if (noiseResult.status === 'fulfilled') noise = noiseResult.value;
    if (modelResult.status === 'rejected') throw modelResult.reason;
    const model = modelResult.value.scene;
    pivot.add(model);
    if (noiseResult.status === 'rejected') throw noiseResult.reason;
    noise.wrapS = noise.wrapT = THREE.RepeatWrapping;
    const bounds = new THREE.Box3().setFromObject(model);
    model.position.copy(bounds.getCenter(new THREE.Vector3())).negate();
    pivot.scale.setScalar(2.43 / bounds.getSize(new THREE.Vector3()).y);

    const studio = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    environment = pmrem.fromScene(studio, .04);
    scene.environment = environment.texture;
    studio.dispose();
    pmrem.dispose();

    const uniforms = {
      uReveal: { value: 0 },
      uBrush: { value: Array.from({ length: brushCount }, () => new THREE.Vector3()) },
      uNoise: { value: noise },
      uAspect: { value: 1.28 }
    };
    const wireMaterial = new THREE.MeshBasicMaterial({
      color: 0x4a5554, wireframe: true, transparent: true, opacity: .075, depthWrite: false
    });
    const meshes = [];
    model.traverse(object => { if (object.isMesh) meshes.push(object); });
    for (const mesh of meshes) {
      const wire = new THREE.Mesh(mesh.geometry, wireMaterial);
      mesh.add(wire);
      mesh.renderOrder = 2;
      const material = mesh.material;
      material.side = THREE.FrontSide;
      material.transparent = true;
      material.envMapIntensity = 1.3;
      material.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec4 vHelmetClip;')
          .replace('#include <project_vertex>', '#include <project_vertex>\nvHelmetClip=gl_Position;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>
            varying vec4 vHelmetClip;
            uniform float uReveal, uAspect;
            uniform sampler2D uNoise;
            uniform vec3 uBrush[${brushCount}];`)
          .replace('#include <alphamap_fragment>', `#include <alphamap_fragment>
            vec2 uv = (vHelmetClip.xy / vHelmetClip.w + 1.0) * 0.5;
            uv.y = 1.0 - uv.y;
            float rough = texture2D(uNoise, uv * 2.8).r * .67
                        + texture2D(uNoise, uv * 7.4).r * .33 - .5;
            float sweep = (uv.x - .25) / .5 + (uv.y - .3) * .32 + rough * .23;
            float coverage = uReveal >= .999 ? 1.0 : uReveal <= .001 ? 0.0
                           : smoothstep(-.019, .009, uReveal * 1.22 - .11 - sweep);
            for (int i=0; i<${brushCount}; i++) {
              if (uBrush[i].z <= 0.0) continue;
              vec2 delta = uv - uBrush[i].xy;
              delta.x *= uAspect;
              float edge = uBrush[i].z * (1.0 + rough * 1.65) - length(delta);
              coverage = max(coverage, smoothstep(-.006, .004, edge));
            }
            if (coverage < .01) discard;
            diffuseColor.a *= coverage;`);
      };
    }

    return {
      resize(width, height) {
        const ratio = Math.min(devicePixelRatio || 1, 1.75, Math.sqrt(1_600_000 / (width * height)));
        renderer.setPixelRatio(ratio);
        renderer.setSize(width, height, false);
        camera.aspect = uniforms.uAspect.value = width / height;
        camera.updateProjectionMatrix();
      },
      draw(reveal, yaw, pitch, trail) {
        uniforms.uReveal.value = reveal;
        wireMaterial.opacity = .075 * (1 - reveal);
        pivot.rotation.set(pitch, yaw, 0);
        for (let i = 0; i < brushCount; i++) {
          const point = trail[i];
          const brush = uniforms.uBrush.value[i];
          if (point) brush.set(point.x, point.y, point.radius);
          else brush.set(0, 0, 0);
        }
        renderer.render(scene, camera);
      },
      dispose
    };
  } catch (error) {
    dispose();
    throw error;
  } finally {
    decoder.dispose();
  }
}
