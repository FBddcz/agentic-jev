import {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { ScenePreset } from "./scene-data";
export type SceneCanvasHandle = { capture: () => void; reset: () => void };
export const SceneCanvas = forwardRef<
  SceneCanvasHandle,
  {
    preset: ScenePreset;
    onRendered: (ms: number) => void;
    realisticRoom?: boolean;
  }
>(function SceneCanvas({ preset, onRendered, realisticRoom = false }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  useImperativeHandle(
    ref,
    () => ({
      reset() {
        controlsRef.current?.reset();
      },
      capture() {
        const canvas = rendererRef.current?.domElement;
        if (!canvas) return;
        canvas.toBlob((blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob),
            a = document.createElement("a");
          a.href = url;
          a.download = `shiyi-${preset.id}.png`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        });
      },
    }),
    [preset.id],
  );
  useEffect(() => {
    if (!host.current) return;
    const begin = performance.now();
    let disposed = false;
    let environment: THREE.Texture | null = null;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: true,
      });
    } catch {
      setError(true);
      return;
    }
    setError(false);
    setLoading(realisticRoom);
    let assetsReady = !realisticRoom;
    rendererRef.current = renderer;
    const element = host.current;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(preset.colors[3]);
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    if (preset.kind === "room") camera.position.set(6.7, 5.2, 7);
    else camera.position.set(3.1, 2.1, 5.2);
    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;
    controls.target.set(0, preset.kind === "room" ? 0.8 : 1.45, 0);
    controls.enableDamping = true;
    controls.minDistance = preset.kind === "room" ? 4 : 3;
    controls.maxDistance = 12;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.saveState();
    const hemi = new THREE.HemisphereLight(0xffffff, 0x9c9a87, 2.7);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff4e6, 4);
    sun.position.set(-3, 7, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -5;
    sun.shadow.camera.right = 5;
    sun.shadow.camera.top = 5;
    sun.shadow.camera.bottom = -5;
    sun.shadow.normalBias = 0.035;
    scene.add(sun);
    const materials: THREE.Material[] = [];
    const material = (color: string, roughness = 0.7) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness });
      materials.push(m);
      return m;
    };
    function add(
      geometry: THREE.BufferGeometry,
      color: string,
      x: number,
      y: number,
      z: number,
    ) {
      const mesh = new THREE.Mesh(geometry, material(color));
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      return mesh;
    }
    function box(
      color: string,
      w: number,
      h: number,
      d: number,
      x: number,
      y: number,
      z: number,
      r = 0.035,
    ) {
      return add(
        new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 4, h / 4, d / 4)),
        color,
        x,
        y,
        z,
      );
    }
    function sphere(
      color: string,
      r: number,
      x: number,
      y: number,
      z: number,
      sx = 1,
      sy = 1,
      sz = 1,
    ) {
      const m = add(new THREE.SphereGeometry(r, 32, 24), color, x, y, z);
      m.scale.set(sx, sy, sz);
      return m;
    }
    function cylinder(
      color: string,
      rt: number,
      rb: number,
      h: number,
      x: number,
      y: number,
      z: number,
    ) {
      return add(new THREE.CylinderGeometry(rt, rb, h, 48), color, x, y, z);
    }
    const [primary, secondary, wood, bg] = preset.colors;
    if (realisticRoom && preset.kind === "room") {
      camera.position.set(0, 1.6, 0.001);
      controls.target.set(0, 1.6, 0);
      controls.enablePan = false;
      controls.enableZoom = false;
      controls.minDistance = 0.001;
      controls.maxDistance = 0.001;
      controls.maxPolarAngle = Math.PI - 0.05;
      controls.rotateSpeed = -0.35;
      controls.saveState();
      new THREE.TextureLoader().load(
        "/scenes/kiara-interior.jpg",
        (texture) => {
          if (disposed) {
            texture.dispose();
            return;
          }
          texture.mapping = THREE.EquirectangularReflectionMapping;
          texture.colorSpace = THREE.SRGBColorSpace;
          environment = texture;
          scene.background = texture;
          renderer.toneMapping = THREE.NoToneMapping;
          assetsReady = true;
          setLoading(false);
        },
        undefined,
        () => {
          if (!disposed) {
            setError(true);
            setLoading(false);
          }
        },
      );
    } else {
      box(wood, 5, 0.13, 4.2, 0, -0.065, 0, 0.02);
      box(bg, 5, 2.8, 0.1, 0, 1.4, -2.06, 0.01);
      box(bg, 0.1, 2.8, 4.2, -2.46, 1.4, 0, 0.01);
      for (let x = -2.3; x < 2.5; x += 0.38)
        box("#8f826b", 0.007, 0.005, 4.1, x, 0.008, 0, 0.001);
      box(secondary, 3.25, 0.028, 2.4, 0.12, 0.025, 0.35, 0.01);
      const sofaWidth = preset.shape === "compact" ? 2.25 : 3.1;
      box(primary, sofaWidth, 0.38, 0.9, 0.1, 0.38, -1.18, 0.13);
      box(primary, sofaWidth, 0.64, 0.23, 0.1, 0.84, -1.58, 0.1);
      for (const sign of [-1, 1])
        box(
          primary,
          0.23,
          0.64,
          0.92,
          0.1 + sign * (sofaWidth / 2 - 0.12),
          0.64,
          -1.18,
          0.09,
        );
      for (let i = 0; i < 3; i++)
        box(
          primary,
          (sofaWidth - 0.5) / 3 - 0.025,
          0.15,
          0.65,
          0.1 + ((i - 1) * (sofaWidth - 0.5)) / 3,
          0.64,
          -1.13,
          0.06,
        );
      for (const sign of [-1, 1]) {
        const pillow = box(
          secondary,
          0.4,
          0.4,
          0.15,
          0.1 + sign * (sofaWidth / 2 - 0.45),
          0.95,
          -1.39,
          0.09,
        );
        pillow.rotation.z = sign * 0.17;
      }
      cylinder(wood, 0.68, 0.68, 0.09, 0.1, 0.49, 0.25);
      cylinder(wood, 0.24, 0.32, 0.44, 0.1, 0.25, 0.25);
      cylinder("#e7dfca", 0.08, 0.12, 0.18, -0.08, 0.625, 0.2);
      sphere("#657b57", 0.11, -0.08, 0.78, 0.2, 1, 0.5, 1);
      box("#f1eadb", 0.3, 0.045, 0.22, 0.36, 0.555, 0.38, 0.008);
      cylinder(wood, 0.32, 0.28, 0.08, -1.9, 0.64, -0.7);
      cylinder(wood, 0.04, 0.04, 0.6, -1.9, 0.3, -0.7);
      cylinder("#a28b67", 0.05, 0.05, 1.75, 1.99, 0.88, -1.22);
      cylinder("#e9dcbe", 0.2, 0.34, 0.38, 1.99, 1.92, -1.22);
      cylinder("#a28b67", 0.25, 0.25, 0.035, 1.99, 0.035, -1.22);
      box(wood, 1.38, 0.96, 0.055, 0.15, 1.98, -1.985, 0.01);
      box("#eee6d6", 1.27, 0.84, 0.03, 0.15, 1.98, -1.945, 0.003);
      const art = add(
        new THREE.CircleGeometry(0.28, 48),
        primary,
        0.07,
        2,
        -1.92,
      );
      art.scale.x = 0.8;
      box(secondary, 0.44, 0.35, 0.01, 0.38, 1.85, -1.91, 0.003);
      cylinder("#b7a58c", 0.23, 0.17, 0.48, -1.92, 0.24, 1.45);
      cylinder("#74805a", 0.018, 0.027, 1.05, -1.92, 0.88, 1.45);
      for (let i = 0; i < 7; i++) {
        const angle = i * 2.4;
        const leaf = sphere(
          "#728762",
          0.2,
          -1.92 + Math.cos(angle) * 0.2,
          0.85 + i * 0.085,
          1.45 + Math.sin(angle) * 0.18,
          1.35,
          0.35,
          0.7,
        );
        leaf.rotation.z = angle;
      }
      box("#e9f0ed", 0.012, 1.4, 1.4, -2.398, 1.8, 0.3, 0.001);
      box(wood, 0.025, 1.5, 0.035, -2.38, 1.8, 0.3, 0.001);
      box(wood, 0.025, 0.035, 1.5, -2.38, 1.8, 0.3, 0.001);
      const floor = add(new THREE.PlaneGeometry(200, 200), bg, 0, -0.14, 0);
      floor.rotation.x = -Math.PI / 2;
    }
    const resize = new ResizeObserver(() => {
      const { width, height } = element.getBoundingClientRect();
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    });
    resize.observe(element);
    let reported = false;
    renderer.setAnimationLoop(() => {
      controls.update();
      renderer.render(scene, camera);
      if (!reported && assetsReady) {
        reported = true;
        onRendered(performance.now() - begin);
      }
    });
    const lost = (event: Event) => {
      event.preventDefault();
      setError(true);
    };
    renderer.domElement.addEventListener("webglcontextlost", lost);
    return () => {
      disposed = true;
      environment?.dispose();
      resize.disconnect();
      renderer.setAnimationLoop(null);
      controls.dispose();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      materials.forEach((m) => m.dispose());
      renderer.dispose();
      renderer.domElement.remove();
      rendererRef.current = null;
      controlsRef.current = null;
    };
  }, [preset, onRendered, realisticRoom]);
  return (
    <div
      ref={host}
      className="scene-canvas"
      role="img"
      aria-label={
        preset.kind === "room"
          ? "可旋转的 3D 客厅预览"
          : "可旋转的 3D 数字人穿搭预览"
      }
    >
      {loading && <div className="scene-render-error">正在加载全景…</div>}
      {error && (
        <div className="scene-render-error">
          {realisticRoom
            ? "全景素材加载失败，请重试。"
            : "当前设备无法启用 3D 渲染，请使用支持 WebGL 的浏览器。"}
        </div>
      )}
    </div>
  );
});
