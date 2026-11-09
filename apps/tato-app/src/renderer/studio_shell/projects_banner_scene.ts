// The Projects window's banner: an original three.js scene of a point-cloud portrait peeling away into
// a pulsing orb ringed by bars, over a moving aurora, with sparks, ribbons of light, motion trails,
// bloom, and a lens pass of streaks, fringing, vignette and grain.

import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  FogExp2,
  IcosahedronGeometry,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Quaternion,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Texture,
} from "three";
import { AfterimagePass } from "three/examples/jsm/postprocessing/AfterimagePass.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

/** The moment of the scene a still frame shows, under reduced motion: the portrait half peeled away. */
export const PROJECTS_BANNER_STILL_SECONDS = 5;

const FULL_SCREEN_VERTEX_SHADER = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }";

const AURORA_FRAGMENT_SHADER = `
  varying vec2 vUv; uniform float uTime;
  float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
  float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * n(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return v; }
  void main(){
    vec2 p = vUv * vec2(6.0, 3.0);
    float t = uTime * 0.12;
    vec2 q = vec2(fbm(p + vec2(t, -t * 0.6)), fbm(p + vec2(-t * 0.8, t) + 4.1));
    float f = fbm(p + 2.2 * q + vec2(t * 0.5, 0.0));
    vec3 col = mix(vec3(0.015, 0.01, 0.04), vec3(0.32, 0.08, 0.62), smoothstep(0.25, 0.75, f));
    col = mix(col, vec3(0.06, 0.20, 0.95), smoothstep(0.45, 0.95, q.x) * 0.8);
    col = mix(col, vec3(0.95, 0.16, 0.55), smoothstep(0.55, 0.95, q.y * f * 1.6) * 0.7);
    float band = exp(-pow((vUv.y - 0.62 - 0.08 * sin(vUv.x * 9.0 + uTime * 0.5)) * 9.0, 2.0));
    col += vec3(1.0, 0.55, 0.18) * band * 0.35 * f;
    col *= 0.55 + 0.45 * smoothstep(0.0, 0.55, vUv.y);
    gl_FragColor = vec4(pow(col, vec3(1.8)) * 0.55, 1.0);
  }`;

const LENS_FRAGMENT_SHADER = `
  uniform sampler2D tDiffuse; uniform float uTime; uniform float uAspect; varying vec2 vUv;
  float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  vec3 bright(vec2 uv){ return max(texture2D(tDiffuse, uv).rgb - 0.9, 0.0); }
  void main(){
    vec2 fromCenter = vUv - 0.5;
    float aberration = 0.0384 * dot(fromCenter, fromCenter);
    vec3 col = vec3(texture2D(tDiffuse, vUv + fromCenter * aberration).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - fromCenter * aberration).b);
    vec3 streak = vec3(0.0);
    for (int i = 1; i <= 28; i++) {
      float o = float(i) * 0.0065;
      streak += (bright(vUv + vec2(o, 0.0)) + bright(vUv - vec2(o, 0.0))) * exp(-float(i) * 0.11);
    }
    col += streak * vec3(0.35, 0.5, 1.0) * 0.16;
    col *= mix(0.45, 1.0, smoothstep(1.05, 0.25, length(fromCenter * vec2(uAspect * 0.75, 1.0))));
    col *= vec3(1.04, 0.98, 1.08);
    col += (h(vUv * 900.0 + fract(uTime) * 91.7) - 0.5) * 0.022;
    gl_FragColor = vec4(col, 1.0);
  }`;

const PORTRAIT_COLUMNS = 140;
const PORTRAIT_ROWS = 120;
const PORTRAIT_WIDTH = 3.6;
const PORTRAIT_HEIGHT = 3.1;
const PORTRAIT_CENTRE_X = -1.1;
const PORTRAIT_CENTRE_Y = 1.35;
const SPECTRUM_BAR_COUNT = 72;
const FLOOR_COLUMNS = 90;
const FLOOR_ROWS = 40;
const SPARK_COUNT = 2200;
const RIBBON_COUNT = 5;
const RIBBON_POINTS = 160;
const CAMERA_X = 0.15;
const CAMERA_DISTANCE = 6.2;
const CAMERA_LOOK_Y = 0.15;
const ORB_CENTRE = new Vector3(1.35, -1.0, -0.4);

/** A fixed pseudo-random number in [0, 1) for `n`, so the scene draws the same at every launch. */
function seededFraction(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

/** The soft round sprite every point is drawn with, or `null` where a 2D canvas is not offered. */
function softPointSprite(): Texture | null {
  const spriteCanvas = document.createElement("canvas");
  spriteCanvas.width = 64;
  spriteCanvas.height = 64;
  const drawing = spriteCanvas.getContext("2d");
  if (drawing === null) return null;
  const falloff = drawing.createRadialGradient(32, 32, 0, 32, 32, 32);
  falloff.addColorStop(0, "rgba(255,255,255,1)");
  falloff.addColorStop(0.35, "rgba(255,255,255,0.8)");
  falloff.addColorStop(1, "rgba(255,255,255,0)");
  drawing.fillStyle = falloff;
  drawing.fillRect(0, 0, 64, 64);
  return new CanvasTexture(spriteCanvas);
}

/** The banner's scene, drawn into its own canvas at the size of the element it is mounted in. */
export class ProjectsBannerScene {
  readonly canvas: HTMLCanvasElement;
  private readonly composer: EffectComposer;
  private readonly camera: PerspectiveCamera;
  private readonly bloomPass: UnrealBloomPass;
  private readonly lensPass: ShaderPass;
  private readonly drawEachFrame: Array<(seconds: number) => void> = [];
  private readonly disposeEverything: Array<() => void> = [];
  private animationFrameRequest: number | null = null;

  private constructor(private readonly renderer: WebGLRenderer, widthPx: number, heightPx: number, pointSprite: Texture) {
    this.canvas = renderer.domElement;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(widthPx, heightPx, false);
    renderer.setClearColor(0x000000);
    const scene = new Scene();
    scene.fog = new FogExp2(0x0a0418, 0.03);
    this.camera = new PerspectiveCamera(42, widthPx / heightPx, 0.1, 100);
    this.camera.position.set(CAMERA_X, 0.4, CAMERA_DISTANCE);
    this.addTheAurora(scene);
    this.addThePortrait(scene, pointSprite);
    this.addTheOrbAndItsSpectrumRing(scene);
    this.addTheFloor(scene, pointSprite);
    this.addTheSparks(scene, pointSprite);
    this.addTheRibbons(scene);
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, this.camera));
    this.composer.addPass(new AfterimagePass(0.6));
    this.bloomPass = new UnrealBloomPass(new Vector2(widthPx, heightPx), 0.8, 0.5, 0.4);
    this.composer.addPass(this.bloomPass);
    const lensPass = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uAspect: { value: widthPx / heightPx } },
      vertexShader: FULL_SCREEN_VERTEX_SHADER,
      fragmentShader: LENS_FRAGMENT_SHADER,
    });
    this.drawEachFrame.push((seconds) => {
      const timeUniform = lensPass.uniforms["uTime"];
      if (timeUniform !== undefined) timeUniform.value = seconds;
    });
    this.lensPass = lensPass;
    this.composer.addPass(lensPass);
    this.composer.addPass(new OutputPass());
    this.disposeEverything.push(() => pointSprite.dispose());
  }

  /** The scene at `widthPx` by `heightPx`, or `null` where the window cannot draw WebGL. */
  static create(widthPx: number, heightPx: number): ProjectsBannerScene | null {
    const pointSprite = softPointSprite();
    if (pointSprite === null || widthPx <= 0 || heightPx <= 0) return null;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, powerPreference: "low-power" });
    } catch {
      pointSprite.dispose();
      return null;
    }
    return new ProjectsBannerScene(renderer, widthPx, heightPx, pointSprite);
  }

  /** Draw from now on at `widthPx` by `heightPx`, as the element it is mounted in is resized. */
  resize(widthPx: number, heightPx: number): void {
    if (widthPx <= 0 || heightPx <= 0) return;
    this.renderer.setSize(widthPx, heightPx, false);
    this.composer.setSize(widthPx, heightPx);
    this.bloomPass.setSize(widthPx, heightPx);
    this.camera.aspect = widthPx / heightPx;
    this.camera.updateProjectionMatrix();
    const aspectUniform = this.lensPass.uniforms["uAspect"];
    if (aspectUniform !== undefined) aspectUniform.value = widthPx / heightPx;
  }

  /** Draw the scene as it stands `seconds` in. */
  drawAt(seconds: number): void {
    for (const drawPart of this.drawEachFrame) drawPart(seconds);
    this.camera.position.x = CAMERA_X + Math.sin(seconds * 0.25) * 0.45;
    this.camera.position.y = 0.4 + Math.sin(seconds * 0.18) * 0.15;
    this.camera.lookAt(CAMERA_X * 0.6, CAMERA_LOOK_Y, 0);
    this.composer.render();
  }

  /** Draw a frame each time the display refreshes, timed by `readMonotonicClockMs`, until `stop`. */
  play(readMonotonicClockMs: () => number): void {
    const startedAtMs = readMonotonicClockMs() - PROJECTS_BANNER_STILL_SECONDS * 1000;
    const drawTheNextFrame = () => {
      this.drawAt((readMonotonicClockMs() - startedAtMs) / 1000);
      this.animationFrameRequest = window.requestAnimationFrame(drawTheNextFrame);
    };
    drawTheNextFrame();
  }

  /** Stop drawing and let go of the GPU's resources. */
  stop(): void {
    if (this.animationFrameRequest !== null) window.cancelAnimationFrame(this.animationFrameRequest);
    this.animationFrameRequest = null;
    for (const dispose of this.disposeEverything) dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }

  private addTheAurora(scene: Scene): void {
    const auroraTime = { value: 0 };
    const auroraGeometry = new PlaneGeometry(60, 30);
    const auroraMaterial = new ShaderMaterial({ uniforms: { uTime: auroraTime }, depthWrite: false, fog: false, vertexShader: FULL_SCREEN_VERTEX_SHADER, fragmentShader: AURORA_FRAGMENT_SHADER });
    const aurora = new Mesh(auroraGeometry, auroraMaterial);
    aurora.position.set(0, 1.5, -9);
    scene.add(aurora);
    this.drawEachFrame.push((seconds) => {
      auroraTime.value = seconds;
    });
    this.disposeEverything.push(() => {
      auroraGeometry.dispose();
      auroraMaterial.dispose();
    });
  }

  private addThePortrait(scene: Scene, pointSprite: Texture): void {
    const pointCount = PORTRAIT_COLUMNS * PORTRAIT_ROWS;
    const restingPositions = new Float32Array(pointCount * 3);
    const pointColours = new Float32Array(pointCount * 3);
    const pointSeeds = new Float32Array(pointCount);
    const drawnPositions = new Float32Array(pointCount * 3);
    const colour = new Color();
    const sunsetLow = new Color(0xff6a3d);
    const sunsetHigh = new Color(0x2a3bff);
    const sunGlow = new Color(0xffd27a);
    const rimLight = new Color(0xff8a4c);
    for (let row = 0; row < PORTRAIT_ROWS; row++) {
      for (let column = 0; column < PORTRAIT_COLUMNS; column++) {
        const point = row * PORTRAIT_COLUMNS + column;
        const u = column / (PORTRAIT_COLUMNS - 1);
        const v = row / (PORTRAIT_ROWS - 1);
        restingPositions.set([(u - 0.5) * PORTRAIT_WIDTH + PORTRAIT_CENTRE_X, (v - 0.5) * PORTRAIT_HEIGHT + PORTRAIT_CENTRE_Y, 0], point * 3);
        const sunDx = u - 0.62;
        const sunDy = v - 0.42;
        colour.lerpColors(sunsetLow, sunsetHigh, Math.pow(v, 0.9)).lerp(sunGlow, Math.min(1, Math.exp(-(sunDx * sunDx + sunDy * sunDy) * 60) * 1.4));
        const headX = (u - 0.36) / 0.11;
        const headY = (v - 0.55) / 0.15;
        const isTheSilhouette = headX * headX + headY * headY < 1 || (v < 0.4 && Math.abs(u - 0.36) < 0.12 + (0.4 - v) * 0.9);
        if (isTheSilhouette) colour.setRGB(0.05, 0.05, 0.09).lerp(rimLight, 0.15);
        pointColours.set([colour.r, colour.g, colour.b], point * 3);
        pointSeeds[point] = seededFraction(point + 1);
      }
    }
    const portraitGeometry = new BufferGeometry();
    const positionAttribute = new BufferAttribute(drawnPositions, 3);
    portraitGeometry.setAttribute("position", positionAttribute);
    portraitGeometry.setAttribute("color", new BufferAttribute(pointColours, 3));
    const portraitMaterial = new PointsMaterial({ size: 0.062, map: pointSprite, vertexColors: true, transparent: true, depthWrite: false });
    scene.add(new Points(portraitGeometry, portraitMaterial));
    this.drawEachFrame.push((seconds) => {
      for (let point = 0; point < pointCount; point++) {
        const restingX = restingPositions[point * 3] ?? 0;
        const restingY = restingPositions[point * 3 + 1] ?? 0;
        const seed = pointSeeds[point] ?? 0;
        const u = (restingX - PORTRAIT_CENTRE_X) / PORTRAIT_WIDTH + 0.5;
        // How far the point has peeled off the portrait: its right edge dissolves first.
        const peelLinear = Math.min(1, Math.max(0, (u - 0.55 + seed * 0.25 + Math.sin(seconds * 0.6 + restingY * 1.7) * 0.04) / 0.45));
        const peel = peelLinear * peelLinear;
        const angle = seed * 6.283 + seconds * 0.9 + peel * 5;
        const radius = peel * (1.05 + seed * 0.9);
        const orbitX = ORB_CENTRE.x + Math.cos(angle) * radius;
        const orbitY = ORB_CENTRE.y + Math.sin(angle * 1.3) * radius * 0.55;
        const orbitZ = ORB_CENTRE.z + Math.sin(angle) * radius;
        const wobble = Math.sin(seconds * 1.5 + restingX * 2 + restingY * 3) * 0.04 * (1 - peel);
        drawnPositions[point * 3] = restingX + (orbitX - restingX) * peel;
        drawnPositions[point * 3 + 1] = restingY + (orbitY - restingY) * peel + wobble;
        drawnPositions[point * 3 + 2] = -(restingX - PORTRAIT_CENTRE_X) * 0.35 * (1 - peel) + orbitZ * peel + wobble * 2;
      }
      positionAttribute.needsUpdate = true;
    });
    this.disposeEverything.push(() => {
      portraitGeometry.dispose();
      portraitMaterial.dispose();
    });
  }

  private addTheOrbAndItsSpectrumRing(scene: Scene): void {
    const orbGeometry = new IcosahedronGeometry(0.85, 5);
    const orbMaterial = new MeshBasicMaterial({ color: 0x7c9bff, wireframe: true, transparent: true, opacity: 0.55 });
    const orb = new Mesh(orbGeometry, orbMaterial);
    orb.position.copy(ORB_CENTRE);
    scene.add(orb);
    const orbPositions = orbGeometry.getAttribute("position");
    const orbRestingPositions = Float32Array.from({ length: orbPositions.count * 3 }, (_, index) => orbPositions.getComponent(Math.floor(index / 3), index % 3));
    const coreGeometry = new SphereGeometry(0.32, 32, 32);
    const coreMaterial = new MeshBasicMaterial({ color: 0xff9a50 });
    const core = new Mesh(coreGeometry, coreMaterial);
    core.position.copy(ORB_CENTRE);
    scene.add(core);
    const barGeometry = new BoxGeometry(0.03, 1, 0.03);
    const barMaterial = new MeshBasicMaterial({ color: 0xffffff });
    const bars = new InstancedMesh(barGeometry, barMaterial, SPECTRUM_BAR_COUNT);
    for (let bar = 0; bar < SPECTRUM_BAR_COUNT; bar++) bars.setColorAt(bar, new Color().setHSL(0.62 - (bar / SPECTRUM_BAR_COUNT) * 0.55, 0.85, 0.32));
    scene.add(bars);
    const barMatrix = new Matrix4();
    const barRotation = new Quaternion();
    const barScale = new Vector3();
    const barPosition = new Vector3();
    this.drawEachFrame.push((seconds) => {
      for (let vertex = 0; vertex < orbPositions.count; vertex++) {
        const x = orbRestingPositions[vertex * 3] ?? 0;
        const y = orbRestingPositions[vertex * 3 + 1] ?? 0;
        const z = orbRestingPositions[vertex * 3 + 2] ?? 0;
        const swell = 1 + 0.12 * Math.sin(x * 4 + seconds * 2) * Math.cos(y * 5 - seconds * 1.6) + 0.06 * Math.sin(z * 7 + seconds * 3);
        orbPositions.setXYZ(vertex, x * swell, y * swell, z * swell);
      }
      orbPositions.needsUpdate = true;
      orb.rotation.set(0.3, seconds * 0.25, 0);
      for (let bar = 0; bar < SPECTRUM_BAR_COUNT; bar++) {
        const around = (bar / SPECTRUM_BAR_COUNT) * Math.PI * 2;
        const level =
          0.25 +
          Math.abs(Math.sin(bar * 0.37 + seconds * 3.1)) * 0.55 * Math.abs(Math.cos(bar * 0.11 - seconds * 1.3)) +
          0.25 * Math.pow(Math.abs(Math.sin(bar * 0.9 + seconds * 2)), 6);
        barPosition.set(ORB_CENTRE.x + Math.cos(around) * 1.55, ORB_CENTRE.y - 0.35 + level * 0.35, ORB_CENTRE.z + Math.sin(around) * 1.55);
        barScale.set(1, level * 0.7, 1);
        bars.setMatrixAt(bar, barMatrix.compose(barPosition, barRotation, barScale));
      }
      bars.instanceMatrix.needsUpdate = true;
    });
    this.disposeEverything.push(() => {
      for (const disposable of [orbGeometry, orbMaterial, coreGeometry, coreMaterial, barGeometry, barMaterial]) disposable.dispose();
      bars.dispose();
    });
  }

  private addTheFloor(scene: Scene, pointSprite: Texture): void {
    const floorPositions = new Float32Array(FLOOR_COLUMNS * FLOOR_ROWS * 3);
    const floorColours = new Float32Array(FLOOR_COLUMNS * FLOOR_ROWS * 3);
    const floorGeometry = new BufferGeometry();
    const positionAttribute = new BufferAttribute(floorPositions, 3);
    const colourAttribute = new BufferAttribute(floorColours, 3);
    floorGeometry.setAttribute("position", positionAttribute);
    floorGeometry.setAttribute("color", colourAttribute);
    const floorMaterial = new PointsMaterial({ size: 0.04, map: pointSprite, vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending });
    scene.add(new Points(floorGeometry, floorMaterial));
    const colour = new Color();
    this.drawEachFrame.push((seconds) => {
      for (let column = 0; column < FLOOR_COLUMNS; column++) {
        for (let row = 0; row < FLOOR_ROWS; row++) {
          const point = (column * FLOOR_ROWS + row) * 3;
          const x = (column / (FLOOR_COLUMNS - 1) - 0.5) * 16;
          const z = -row * 0.35 + 3;
          const lift = 0.35 * Math.sin(x * 0.8 + seconds * 1.8) * Math.cos(z * 0.6 - seconds) + 0.25 * Math.exp(-((x - 2.6) * (x - 2.6)) * 0.3) * Math.sin(seconds * 4 + z);
          floorPositions.set([x, -2.2 + lift, z], point);
          colour.setHSL(0.6 - lift * 0.4, 0.9, 0.35 + lift * 0.5);
          floorColours.set([colour.r, colour.g, colour.b], point);
        }
      }
      positionAttribute.needsUpdate = true;
      colourAttribute.needsUpdate = true;
    });
    this.disposeEverything.push(() => {
      floorGeometry.dispose();
      floorMaterial.dispose();
    });
  }

  private addTheSparks(scene: Scene, pointSprite: Texture): void {
    const sparkPositions = new Float32Array(SPARK_COUNT * 3);
    const sparkColours = new Float32Array(SPARK_COUNT * 3);
    const sparkHues = [0.58, 0.75, 0.92, 0.08];
    const colour = new Color();
    for (let spark = 0; spark < SPARK_COUNT; spark++) {
      colour.setHSL(sparkHues[spark % sparkHues.length] ?? 0.58, 0.9, 0.65);
      sparkColours.set([colour.r, colour.g, colour.b], spark * 3);
    }
    const sparkGeometry = new BufferGeometry();
    const positionAttribute = new BufferAttribute(sparkPositions, 3);
    sparkGeometry.setAttribute("position", positionAttribute);
    sparkGeometry.setAttribute("color", new BufferAttribute(sparkColours, 3));
    const sparkMaterial = new PointsMaterial({ size: 0.045, map: pointSprite, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false, blending: AdditiveBlending });
    scene.add(new Points(sparkGeometry, sparkMaterial));
    this.drawEachFrame.push((seconds) => {
      for (let spark = 0; spark < SPARK_COUNT; spark++) {
        const drift = seededFraction(spark * 1.9);
        let y = seededFraction(spark * 5.7) * 7 - 3 + ((seconds * 0.35 * (0.5 + drift)) % 7);
        if (y > 4) y -= 7;
        sparkPositions.set([seededFraction(spark * 3.1) * 14 - 7 + Math.sin(seconds * 0.7 + drift * 20) * 0.3, y, seededFraction(spark * 9.3) * 8 - 6], spark * 3);
      }
      positionAttribute.needsUpdate = true;
    });
    this.disposeEverything.push(() => {
      sparkGeometry.dispose();
      sparkMaterial.dispose();
    });
  }

  private addTheRibbons(scene: Scene): void {
    const ribbonHues = [0.62, 0.85, 0.95, 0.55, 0.08];
    for (let ribbon = 0; ribbon < RIBBON_COUNT; ribbon++) {
      const ribbonPositions = new Float32Array(RIBBON_POINTS * 3);
      const ribbonGeometry = new BufferGeometry();
      const positionAttribute = new BufferAttribute(ribbonPositions, 3);
      ribbonGeometry.setAttribute("position", positionAttribute);
      const ribbonMaterial = new LineBasicMaterial({ color: new Color().setHSL(ribbonHues[ribbon] ?? 0.62, 1, 0.62), transparent: true, opacity: 0.9, blending: AdditiveBlending });
      scene.add(new Line(ribbonGeometry, ribbonMaterial));
      this.drawEachFrame.push((seconds) => {
        for (let point = 0; point < RIBBON_POINTS; point++) {
          const x = (point / (RIBBON_POINTS - 1) - 0.5) * 14;
          const y = -0.4 + ribbon * 0.35 + 0.9 * Math.sin(x * 0.45 + seconds * (0.8 + ribbon * 0.17) + ribbon) * Math.cos(x * 0.2 - seconds * 0.4);
          ribbonPositions.set([x, y, -2.2 + Math.sin(x * 0.3 + seconds * 0.6 + ribbon * 1.3) * 1.6], point * 3);
        }
        positionAttribute.needsUpdate = true;
      });
      this.disposeEverything.push(() => {
        ribbonGeometry.dispose();
        ribbonMaterial.dispose();
      });
    }
  }
}

