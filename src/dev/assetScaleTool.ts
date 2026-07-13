import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { requiredElement } from "../ui/appShell";

type AssetId = (typeof ASSETS)[number]["id"];

type AssetDefinition = {
  id: string;
  label: string;
  url: string;
  scale: number;
  rotationY?: number;
};

type Slot = {
  select: HTMLSelectElement;
  range: HTMLInputElement;
  number: HTMLInputElement;
  scale: number;
};

const ASSETS = [
  {
    id: "player/plane-1",
    label: "PLAYER · PLANE 1",
    url: new URL("../../assets/player/plane-1/plane-1.glb", import.meta.url)
      .href,
    scale: 0.56,
    rotationY: Math.PI,
  },
  {
    id: "enemies/riftspike",
    label: "ENEMY · RIFTSPIKE",
    url: new URL(
      "../../assets/enemies/riftspike/riftspike.glb",
      import.meta.url,
    ).href,
    scale: 1,
  },
  {
    id: "enemies/riftmaw",
    label: "BOSS · RIFTMAW",
    url: new URL("../../assets/enemies/riftmaw/riftmaw.glb", import.meta.url)
      .href,
    scale: 7.25 / 13.4,
  },
] as const satisfies readonly AssetDefinition[];

export function serializeAssetScales(
  values: ReadonlyArray<readonly [string, number]>,
) {
  return JSON.stringify(
    {
      assetScales: Object.fromEntries(
        values.map(([id, scale]) => [id, Number(scale.toFixed(4))]),
      ),
    },
    null,
    2,
  );
}

export function mountAssetScaleTool(): { refresh: () => void } {
  const menu = requiredElement<HTMLDivElement>("#asset-scaling-menu");
  const preview = requiredElement<HTMLDivElement>("#asset-scaling-preview");
  const status = requiredElement<HTMLParagraphElement>("#asset-scaling-status");
  const controlsRoot = requiredElement<HTMLDivElement>(
    "#asset-scaling-controls",
  );
  const copyButton = requiredElement<HTMLButtonElement>("#copy-asset-scales");
  const feedback = requiredElement<HTMLParagraphElement>(
    "#asset-scaling-feedback",
  );

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  preview.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 1000);
  camera.position.set(8, 6, 10);
  const orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.target.set(0, 1, 0);
  scene.add(
    new THREE.HemisphereLight(0xd9f3ff, 0x18222b, 2.6),
    new THREE.DirectionalLight(0xffffff, 3.4),
  );
  const keyLight = scene.children.at(-1) as THREE.DirectionalLight;
  keyLight.position.set(6, 10, 8);

  const models = new Map<AssetId, THREE.Group>();
  const displayed = new THREE.Group();
  scene.add(displayed);
  let grid: THREE.GridHelper | undefined;
  const slots = ASSETS.map((asset, index) =>
    createSlot(controlsRoot, index, asset.id, asset.scale),
  );

  const resize = () => {
    const width = preview.clientWidth;
    const height = preview.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(preview);

  for (const slot of slots) {
    slot.select.addEventListener("change", updatePreview);
    slot.range.addEventListener("input", () => {
      slot.scale = sliderToScale(Number(slot.range.value));
      slot.number.value = formatScale(slot.scale);
      updatePreview();
    });
    slot.number.addEventListener("input", () => {
      const value = Number(slot.number.value);
      if (!Number.isFinite(value) || value <= 0) return;
      slot.scale = THREE.MathUtils.clamp(value, 0.001, 100);
      slot.range.value = scaleToSlider(slot.scale).toString();
      updatePreview();
    });
    slot.number.addEventListener("change", () => {
      slot.scale = THREE.MathUtils.clamp(slot.scale, 0.001, 100);
      slot.number.value = formatScale(slot.scale);
      slot.range.value = scaleToSlider(slot.scale).toString();
      updatePreview();
    });
  }

  copyButton.addEventListener("click", async () => {
    const values = selectedValues(slots);
    if (!values.length) return;
    try {
      await navigator.clipboard.writeText(serializeAssetScales(values));
      feedback.textContent = `COPIED ${values.length} ASSET${values.length === 1 ? "" : "S"}`;
    } catch {
      feedback.textContent = "CLIPBOARD UNAVAILABLE";
    }
  });

  void Promise.all(
    ASSETS.map(async (asset) => {
      const gltf = await new GLTFLoader().loadAsync(asset.url);
      const model = gltf.scene;
      model.rotation.y = "rotationY" in asset ? asset.rotationY : 0;
      model.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(model);
      const center = bounds.getCenter(new THREE.Vector3());
      model.position.set(-center.x, -bounds.min.y, -center.z);
      const grounded = new THREE.Group();
      grounded.add(model);
      models.set(asset.id, grounded);
    }),
  )
    .then(() => {
      status.hidden = true;
      updatePreview();
    })
    .catch((error: unknown) => {
      status.textContent =
        error instanceof Error ? error.message.toUpperCase() : "LOAD FAILED";
    });

  function updatePreview() {
    const selected = new Set(
      slots.map((slot) => slot.select.value).filter(Boolean),
    );
    for (const slot of slots) {
      for (const option of slot.select.options) {
        option.disabled =
          option.value !== "" &&
          option.value !== slot.select.value &&
          selected.has(option.value);
      }
      const active = slot.select.value !== "";
      slot.range.disabled = !active;
      slot.number.disabled = !active;
    }

    displayed.clear();
    const entries = slots.flatMap((slot) => {
      const id = slot.select.value as AssetId | "";
      const source = id ? models.get(id) : undefined;
      if (!source) return [];
      const model = source.clone(true);
      model.scale.setScalar(slot.scale);
      model.updateMatrixWorld(true);
      const size = new THREE.Box3()
        .setFromObject(model)
        .getSize(new THREE.Vector3());
      return [{ model, size }];
    });
    if (!entries.length) return;

    const maxHeight = Math.max(...entries.map(({ size }) => size.y));
    const gap = Math.max(maxHeight * 0.18, 0.2);
    const totalWidth =
      entries.reduce((sum, { size }) => sum + size.x, 0) +
      gap * (entries.length - 1);
    let x = -totalWidth / 2;
    for (const { model, size } of entries) {
      model.position.x = x + size.x / 2;
      displayed.add(model);
      x += size.x + gap;
    }

    if (grid) scene.remove(grid);
    const gridSize = Math.max(totalWidth * 1.5, maxHeight * 2, 2);
    grid = new THREE.GridHelper(gridSize, 12, 0x477188, 0x263b47);
    scene.add(grid);
    orbit.target.set(0, maxHeight * 0.42, 0);
    const span = Math.max(totalWidth / camera.aspect, maxHeight, 1);
    const distance =
      span / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    camera.position
      .set(0.8, 0.5, 1)
      .normalize()
      .multiplyScalar(distance * 1.35)
      .add(orbit.target);
    camera.near = Math.max(distance / 100, 0.001);
    camera.far = distance * 100;
    camera.updateProjectionMatrix();
    orbit.update();
  }

  function animate() {
    requestAnimationFrame(animate);
    if (menu.hidden) return;
    orbit.update();
    renderer.render(scene, camera);
  }
  animate();

  return {
    refresh() {
      resize();
      updatePreview();
    },
  };
}

function createSlot(
  root: HTMLElement,
  index: number,
  initialAsset: AssetId,
  initialScale: number,
): Slot {
  const row = document.createElement("div");
  row.className = "asset-scale-row";
  row.innerHTML = `<select aria-label="Asset ${index + 1}"><option value="">NONE</option>${ASSETS.map((asset) => `<option value="${asset.id}">${asset.label}</option>`).join("")}</select><input type="range" min="-300" max="200" step="1" aria-label="Asset ${index + 1} scale"><input class="asset-scale-row__number" type="number" min="0.001" max="100" step="0.01" aria-label="Asset ${index + 1} scale value">`;
  root.append(row);
  const select = requiredElement<HTMLSelectElement>("select", row);
  const range = requiredElement<HTMLInputElement>('input[type="range"]', row);
  const number = requiredElement<HTMLInputElement>('input[type="number"]', row);
  select.value = initialAsset;
  range.value = scaleToSlider(initialScale).toString();
  number.value = formatScale(initialScale);
  return { select, range, number, scale: initialScale };
}

function selectedValues(
  slots: readonly Slot[],
): Array<readonly [string, number]> {
  return slots.flatMap((slot) =>
    slot.select.value ? [[slot.select.value, slot.scale] as const] : [],
  );
}

function sliderToScale(value: number) {
  return 10 ** (value / 100);
}

function scaleToSlider(value: number) {
  return Math.round(Math.log10(value) * 100);
}

function formatScale(value: number) {
  return Number(value.toFixed(4)).toString();
}
