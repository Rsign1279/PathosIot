import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Fit the backing buffer around the helmet, including room to turn.
const view = { left: .225, top: 0, width: .55, height: .72 };
const asset = name => new URL(`./assets/founder/${name}`, import.meta.url).href;

// The original helmet model stays aligned to the cutout. A mask on the
// actual material follows the pointer, including across the curved visor.
export async function createHelmetRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas, alpha: true, antialias: true, powerPreference: 'low-power'
  });
  Object.assign(canvas.style, {
    inset: `${view.top * 100}% auto auto ${view.left * 100}%`,
    width: `${view.width * 100}%`,
    height: `${view.height * 100}%`
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
  let noise, environment, brushTexture;
  const dispose = () => {
    scene.traverse(object => {
      if (!object.isMesh) return;
      for (const value of Object.values(object.material)) if (value?.isTexture) value.dispose();
      object.material.dispose();
      object.geometry.dispose();
    });
    noise?.dispose();
    brushTexture?.dispose();
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

    // Rasterize the gesture once, on a small texture. The shader samples a
    // continuous stroke instead of measuring every point for every fragment.
    const brushCanvas = document.createElement('canvas');
    brushCanvas.width = 320;
    brushCanvas.height = 250;
    const brushContext = brushCanvas.getContext('2d');
    if (!brushContext) throw new Error('Helmet brush canvas unavailable');
    brushContext.lineCap = 'round';
    brushContext.strokeStyle = brushContext.fillStyle = '#fff';
    brushTexture = new THREE.CanvasTexture(brushCanvas);
    brushTexture.flipY = false;
    brushTexture.generateMipmaps = false;
    brushTexture.minFilter = THREE.LinearFilter;
    const uniforms = {
      uReveal: { value: 0 },
      uBrush: { value: brushTexture },
      uBrushActive: { value: false },
      uBrushBounds: { value: new THREE.Vector4() },
      uNoise: { value: noise },
      uView: { value: new THREE.Vector4(view.left, view.top, view.width, view.height) }
    };

    function updateBrush(trail, time, duration) {
      uniforms.uBrushActive.value = trail.length > 0;
      if (!trail.length) return;
      const { width, height } = brushCanvas;
      brushContext.clearRect(0, 0, width, height);
      let left = 1, top = 1, right = 0, bottom = 0;
      for (let i = 0; i < trail.length; i++) {
        const point = trail[i];
        const from = trail[i - 1] || point;
        const remaining = 1 - Math.max(0, (time - point.time) / duration);
        const radius = .105 * Math.pow(remaining, .63) * height;
        const x = point.x * width, y = point.y * height;
        brushContext.globalAlpha = Math.min(1, remaining * 2.6);
        brushContext.beginPath();
        if (i === 0) {
          brushContext.arc(x, y, radius, 0, Math.PI * 2);
          brushContext.fill();
        } else {
          brushContext.lineWidth = radius * 2;
          brushContext.moveTo(from.x * width, from.y * height);
          brushContext.lineTo(x, y);
          brushContext.stroke();
        }
        // Allow room for both the rounded edge and its shader distortion.
        left = Math.min(left, point.x, from.x);
        top = Math.min(top, point.y, from.y);
        right = Math.max(right, point.x, from.x);
        bottom = Math.max(bottom, point.y, from.y);
      }
      uniforms.uBrushBounds.value.set(left - .13, top - .15, right + .13, bottom + .15);
      brushTexture.needsUpdate = true;
    }

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
            uniform float uReveal;
            uniform bool uBrushActive;
            uniform vec4 uView, uBrushBounds;
            uniform sampler2D uNoise, uBrush;`)
          .replace('#include <alphamap_fragment>', `#include <alphamap_fragment>
            if (uReveal < .999) {
              vec2 uv = (vHelmetClip.xy / vHelmetClip.w + 1.0) * 0.5;
              uv.y = 1.0 - uv.y;
              uv = uv * uView.zw + uView.xy;
              bool hasBrush = uBrushActive &&
                all(greaterThanEqual(uv, uBrushBounds.xy)) &&
                all(lessThanEqual(uv, uBrushBounds.zw));
              if (uReveal <= .001 && !hasBrush) discard;
              float coarse = texture2D(uNoise, uv * 2.8).r - .5;
              float fine = texture2D(uNoise, uv * 7.4).r - .5;
              float sweep = (uv.x - .25) / .5 + (uv.y - .3) * .32 + (coarse * .67 + fine * .33) * .23;
              float coverage = uReveal <= .001 ? 0.0 :
                smoothstep(-.019, .009, uReveal * 1.22 - .11 - sweep);
              if (hasBrush && coverage < .999) {
                vec2 warped = uv + vec2(coarse, fine) * .048;
                float brush = texture2D(uBrush, clamp(warped, 0.0, 1.0)).a;
                coverage = max(coverage, smoothstep(.02, .93, brush));
              }
              if (coverage < .01) discard;
              diffuseColor.a *= coverage;
            }`);
      };
    }

    // Prepare both programs and upload textures before taking pointer input.
    const textures = new Set([noise, brushTexture]);
    for (const mesh of meshes) {
      for (const value of Object.values(mesh.material)) if (value?.isTexture) textures.add(value);
    }
    for (const texture of textures) renderer.initTexture(texture);
    await renderer.compileAsync(scene, camera);

    return {
      resize(width, height) {
        const ratio = Math.min(devicePixelRatio || 1, 1.75, Math.sqrt(1_600_000 / (width * height)));
        renderer.setPixelRatio(ratio);
        renderer.setSize(width * view.width, height * view.height, false);
        camera.setViewOffset(width, height, width * view.left, height * view.top,
          width * view.width, height * view.height);
      },
      draw(reveal, yaw, pitch, trail, time, trailDuration) {
        uniforms.uReveal.value = reveal;
        wireMaterial.visible = reveal < .999;
        wireMaterial.opacity = .075 * (1 - reveal);
        pivot.rotation.set(pitch, yaw, 0);
        for (const mesh of meshes) mesh.material.visible = reveal > .001 || trail.length > 0;
        if (reveal < .999) updateBrush(trail, time, trailDuration);
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
