import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";
import { shade } from "@/render/figures.js";
import { contrastText } from "@/render/colors.js";

/**
 * The 3D models for armies and cities. Each is built from simple shapes in
 * code, so the game works with no model files at all. Real models can take
 * their place: list them in models/models.json (see models/README.md) and
 * they're loaded at start and used instead.
 */

/** Something on the map that can animate. */
export interface Figure {
  object: THREE.Object3D;
  /** Called every frame. `stride` from -1 to 1 swings the legs while walking; 0 stands still. */
  animate(stride: number, delta: number): void;
}

const SKIN = "#e3c29b";
const METAL = "#c9ccd1";
const STONE = "#cbbfa3";
const ROOF = "#b5563a";

// ---- Materials --------------------------------------------------------------

const materials = new Map<string, THREE.MeshLambertMaterial>();

/** A shared flat-shaded material. Faded ones are for armies that have used their moves. */
function mat(color: string, faded = false): THREE.MeshLambertMaterial {
  const key = `${color}|${faded}`;
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true, transparent: faded, opacity: faded ? 0.5 : 1 });
    materials.set(key, m);
  }
  return m;
}

function box(w: number, h: number, d: number, material: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
}

/** A limb hanging from a pivot at its top, so rotating the pivot swings it. */
function limb(w: number, h: number, material: THREE.Material, x: number, y: number, z: number): THREE.Object3D {
  const pivot = new THREE.Group();
  const mesh = box(w, h, w, material);
  mesh.position.y = -h / 2;
  pivot.add(mesh);
  pivot.position.set(x, y, z);
  return pivot;
}

// ---- Flags and banners --------------------------------------------------------

const textures = new Map<string, THREE.CanvasTexture>();

/** A banner texture in a faction's colour, with text and optional pips, and a swallowtail. */
function bannerTexture(color: string, text: string, pips: number, emblem: boolean): THREE.CanvasTexture {
  const key = `${color}|${text}|${pips}|${emblem}`;
  const cached = textures.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 96;
  const ctx = canvas.getContext("2d")!;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(128, 0);
  ctx.lineTo(108, 48);
  ctx.lineTo(128, 96);
  ctx.lineTo(0, 96);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#1b252b";
  ctx.stroke();

  const ink = contrastText(color);
  ctx.fillStyle = ink;
  ctx.strokeStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (emblem) {
    // A laurel wreath: two arcs of leaves around a circle.
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(56, 48, 24, Math.PI * 0.6, Math.PI * 1.4);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(56, 48, 24, -Math.PI * 0.4, Math.PI * 0.4);
    ctx.stroke();
    for (let i = 0; i < 7; i++) {
      for (const side of [-1, 1]) {
        const a = Math.PI / 2 + side * (Math.PI * 0.12 + i * 0.12 * Math.PI);
        ctx.beginPath();
        ctx.ellipse(56 + Math.cos(a) * 24, 48 + Math.sin(a) * 24, 5, 2.5, a, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else {
    ctx.font = "700 40px system-ui, sans-serif";
    ctx.fillText(text, 56, pips > 0 ? 38 : 48);
    const gap = Math.min(10, 84 / Math.max(pips, 1));
    for (let i = 0; i < pips; i++) {
      ctx.beginPath();
      ctx.arc(56 - ((pips - 1) * gap) / 2 + i * gap, 76, 3.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  textures.set(key, texture);
  return texture;
}

/**
 * A pole with a banner facing the camera (for cities). A lowered banner
 * hangs at half-mast, greyed.
 */
function flag(
  color: string,
  text: string,
  pips: number,
  height: number,
  emblem: boolean,
  faded: boolean,
  lowered = false,
): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, height, 5), mat("#3b2c1e", faded));
  pole.position.y = height / 2;
  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 18),
    new THREE.MeshBasicMaterial({
      map: bannerTexture(color, text, pips, emblem),
      transparent: true,
      alphaTest: 0.05,
      side: THREE.DoubleSide,
      opacity: faded ? 0.6 : 1,
      color: lowered ? "#9a9a9a" : "#ffffff",
    }),
  );
  banner.position.set(12.5, lowered ? height * 0.45 : height - 9.5, 0);
  g.add(pole, banner);
  return g;
}

// ---- Armies -----------------------------------------------------------------

export interface ArmyLook {
  color: string;
  /** The army's strength, shown on the banner, e.g. "415". */
  label: string;
  /** Regiments in the army, shown as pips under the number. */
  regiments: number;
  faded: boolean;
}

/**
 * An army on the map: one standard-bearer in the faction's colours, carrying
 * a banner with the army's strength and a pip per regiment. The model faces
 * the way it's walking; the banner always turns to face the camera.
 */
export function buildArmy(look: ArmyLook, library: ModelLibrary): Figure {
  const custom = library.army(look.color, look.faded);
  const figure = custom ?? standardBearer(look.color, look.faded);

  const banner = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 18),
    new THREE.MeshBasicMaterial({
      map: bannerTexture(look.color, look.label, look.regiments, false),
      transparent: true,
      alphaTest: 0.05,
      side: THREE.DoubleSide,
      opacity: look.faded ? 0.6 : 1,
    }),
  );
  // The banner hangs from the top of the pole the bearer carries (or, for a
  // model from a file, a pole planted beside it).
  const bannerHolder = new THREE.Group();
  bannerHolder.position.set(8, 56, 0);
  banner.position.set(12.5, 0, 0);
  bannerHolder.add(banner);
  figure.object.add(bannerHolder);
  if (custom) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 64, 5), mat("#3b2c1e", look.faded));
    pole.position.set(8, 32, 0);
    figure.object.add(pole);
  }

  return {
    object: figure.object,
    animate(stride, delta) {
      figure.animate(stride, delta);
      // Keep the banner square to the camera whichever way the bearer faces.
      bannerHolder.rotation.y = -figure.object.rotation.y;
    },
  };
}

/** A soldier holding a tall standard, about 34 units tall, facing +z. */
function standardBearer(color: string, faded: boolean): Figure {
  const g = new THREE.Group();
  const tunic = mat(color, faded);
  const ink = mat("#2a3238", faded);
  const skin = mat(SKIN, faded);
  const metal = mat(METAL, faded);

  const legs = [limb(3, 13, ink, -2.2, 13, 0), limb(3, 13, ink, 2.2, 13, 0)];
  g.add(...legs);
  const body = new THREE.Group();
  g.add(body);

  const torso = box(10, 12, 6, tunic);
  torso.position.y = 19;
  const cloak = box(11, 15, 1.5, mat(shade(color, -0.3), faded));
  cloak.position.set(0, 18, -3.6);
  const belt = box(10.4, 1.6, 6.4, ink);
  belt.position.y = 15;
  const head = new THREE.Mesh(new THREE.SphereGeometry(3.8, 8, 6), skin);
  head.position.y = 29;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(4.2, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), metal);
  helmet.position.y = 29.6;
  const crest = box(1, 3.2, 6.5, tunic);
  crest.position.y = 34.6;
  // Both arms up to the pole, which he holds out in front.
  const right = limb(2.5, 10, skin, 5.8, 24.5, 0);
  right.rotation.set(-0.5, 0, 0.45);
  const left = limb(2.5, 10, skin, -5.8, 24.5, 0);
  left.rotation.set(-0.5, 0, -0.9);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 58, 6), mat("#3b2c1e", faded));
  pole.position.set(8, 29, 3);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(1.6, 6, 4), mat("#d9b24a", faded));
  finial.position.set(8, 58.5, 3);
  body.add(torso, cloak, belt, head, helmet, crest, right, left, pole, finial);

  return {
    object: g,
    animate(stride) {
      legs[0].rotation.x = stride * 0.55;
      legs[1].rotation.x = -stride * 0.55;
      body.position.y = Math.abs(stride) * 0.7;
    },
  };
}

// ---- Cities -----------------------------------------------------------------

/**
 * A town that grows with its level: more houses and a taller keep at each
 * level. Walls appear only once built: a low palisade, then stone walls, then
 * great walls with towers. A banner in the owner's colours flies over it
 * while it has a garrison, and hangs at half-mast when it doesn't.
 */
export function buildCity(
  color: string,
  look: {
    capital: boolean;
    level: number;
    walls: number;
    /** Whether a garrison holds it (true for an enemy city out of sight, so the fog gives nothing away). */
    garrisoned: boolean;
    /** The garrison's strength and regiments, shown on the banner; null to show the plain laurel. */
    garrison: { label: string; regiments: number } | null;
  },
  library: ModelLibrary,
): THREE.Object3D {
  const custom = library.city(look.capital);
  if (custom) return custom;

  const g = new THREE.Group();
  const stone = mat(STONE);
  const wall = mat("#d9cdb0");
  const wood = mat("#8a6a45");
  const roof = mat(ROOF);
  const plaster = mat("#efe6d2");

  const base = new THREE.Mesh(new THREE.CylinderGeometry(25, 27, 3, 6), stone);
  base.position.y = 1.5;
  g.add(base);

  // Walls: none, a palisade (1), stone (2), great walls with towers (3).
  if (look.walls > 0) {
    const half = 15;
    const height = [0, 5, 7, 9][look.walls];
    const material = look.walls === 1 ? wood : wall;
    for (const [x, z, w, d] of [[0, -half, 30, 2.4], [0, half, 30, 2.4], [-half, 0, 2.4, 30], [half, 0, 2.4, 30]] as const) {
      const segment = box(w, height, d, material);
      segment.position.set(x, 3 + height / 2, z);
      g.add(segment);
    }
    if (look.walls >= 2) {
      for (const [x, z] of [[-half, -half], [half, -half], [-half, half], [half, half]]) {
        const towerHeight = look.walls === 3 ? 14 : 10;
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.4, towerHeight, 6), wall);
        tower.position.set(x, 3 + towerHeight / 2, z);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(3.8, 4, 6), roof);
        cap.position.set(x, 5 + towerHeight, z);
        g.add(tower, cap);
      }
    }
    if (look.walls === 3) {
      const gate = box(8, 12, 4, wall);
      gate.position.set(0, 9, half);
      g.add(gate);
    }
  }

  // Houses: more with each level.
  const spots: [number, number, number][] = [
    [-7, -6, 1], [5, -8, 0.9], [-8, 6, 0.9], [7, 5, 1], [0, 9, 0.8], [-10, -1, 0.75], [10, -2, 0.8], [-3, 11, 0.7],
  ];
  const houses = [3, 5, 8][Math.max(0, Math.min(2, look.level - 1))];
  for (const [x, z, s] of spots.slice(0, houses)) {
    const house = box(8 * s, 6 * s, 7 * s, plaster);
    house.position.set(x, 3 + 3 * s, z);
    const top = new THREE.Mesh(new THREE.ConeGeometry(6.4 * s, 4 * s, 4), roof);
    top.rotation.y = Math.PI / 4;
    top.position.set(x, 3 + 6 * s + 2 * s, z);
    g.add(house, top);
  }

  // The government building: a hall, a forum's keep, or a senate with a second tower.
  const keepHeight = [8, 14, 18][Math.max(0, Math.min(2, look.level - 1))];
  const keep = box(8, keepHeight, 8, wall);
  keep.position.set(0, 3 + keepHeight / 2, -1);
  const keepRoof = new THREE.Mesh(new THREE.ConeGeometry(6.8, 6, 4), roof);
  keepRoof.rotation.y = Math.PI / 4;
  keepRoof.position.set(0, 6 + keepHeight, -1);
  g.add(keep, keepRoof);
  if (look.level >= 3) {
    const second = box(6, 12, 6, wall);
    second.position.set(-9, 9, -9);
    const secondRoof = new THREE.Mesh(new THREE.ConeGeometry(5, 5, 4), roof);
    secondRoof.rotation.y = Math.PI / 4;
    secondRoof.position.set(-9, 17.5, -9);
    g.add(second, secondRoof);
  }
  g.scale.setScalar([0.85, 1, 1.15][Math.max(0, Math.min(2, look.level - 1))]);

  // The banner flies when the city has a garrison, showing its strength, and
  // hangs at half-mast when it's undefended.
  const banner = look.garrison
    ? flag(color, look.garrison.label, look.garrison.regiments, look.capital ? 50 : 42, false, false)
    : flag(color, "", 0, look.capital ? 50 : 42, true, false, !look.garrisoned);
  banner.position.set(-1, 0, -10);
  g.add(banner);
  return g;
}

/** A ring on the ground around a besieged city, in the besieger's colour. */
export function siegeRing(color: string): THREE.Mesh {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(30, 34, 36),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.8;
  return ring;
}

// ---- Models from files --------------------------------------------------------

/** What models/models.json can list. Each value is a .glb or .gltf file name in the models folder. */
interface ModelManifest {
  army?: string;
  city?: string;
  capital?: string;
  /** Height the army model is scaled to (default 36). */
  soldierHeight?: number;
  /** Width the city models are scaled to (default 60). */
  cityWidth?: number;
}

interface LoadedModel {
  scene: THREE.Object3D;
  animations: THREE.AnimationClip[];
}

/**
 * Supplies army and city models: from files listed in models/models.json
 * when there are any, otherwise built in code. Materials whose name contains
 * "faction" are recoloured to the owner's colour, and an animation clip whose
 * name contains "walk" plays while the army is moving.
 */
export class ModelLibrary {
  private readonly loaded = new Map<string, LoadedModel>();
  private manifest: ModelManifest = {};

  /** Loads whatever models/models.json lists. Resolves once they're ready (or failed). */
  async load(): Promise<void> {
    try {
      const response = await fetch("models/models.json", { cache: "no-cache" });
      if (!response.ok) return;
      this.manifest = (await response.json()) as ModelManifest;
    } catch {
      return;
    }
    const loader = new GLTFLoader();
    const entries = (["army", "city", "capital"] as const)
      .map((key) => [key, this.manifest[key]] as const)
      .filter((e): e is readonly [typeof e[0], string] => typeof e[1] === "string" && e[1].length > 0);
    await Promise.all(
      entries.map(async ([key, file]) => {
        try {
          const gltf = await loader.loadAsync(`models/${file}`);
          this.loaded.set(key, { scene: gltf.scene, animations: gltf.animations });
        } catch (error) {
          console.warn(`Couldn't load models/${file}; using the built-in ${key} model.`, error);
        }
      }),
    );
  }

  /** How many model files are in use. */
  get count(): number {
    return this.loaded.size;
  }

  /** The army model from a file, if one is listed. */
  army(color: string, faded: boolean): Figure | null {
    const model = this.loaded.get("army");
    return model ? this.fromFile(model, color, faded, this.manifest.soldierHeight ?? 36) : null;
  }

  city(capital: boolean): THREE.Object3D | null {
    const model = this.loaded.get(capital ? "capital" : "city") ?? this.loaded.get("city");
    if (!model) return null;
    return this.fromFile(model, null, false, 0, this.manifest.cityWidth ?? 60).object;
  }

  /** A copy of a loaded model, recoloured, scaled to size, with its walk animation hooked up. */
  private fromFile(model: LoadedModel, color: string | null, faded: boolean, height: number, width = 0): Figure {
    const object = cloneSkinned(model.scene);
    object.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      const recolor = (m: THREE.Material) => {
        const copy = m.clone() as THREE.MeshStandardMaterial;
        if (color && /faction/i.test(m.name) && "color" in copy) copy.color.set(color);
        if (faded) {
          copy.transparent = true;
          copy.opacity = 0.5;
        }
        return copy;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(recolor) : recolor(mesh.material);
    });

    // Scale to size and stand it on the ground.
    const size = new THREE.Box3().setFromObject(object).getSize(new THREE.Vector3());
    const scale = height > 0 ? height / Math.max(size.y, 0.001) : width / Math.max(size.x, size.z, 0.001);
    object.scale.setScalar(scale);
    const bounds = new THREE.Box3().setFromObject(object);
    object.position.y -= bounds.min.y;
    const holder = new THREE.Group();
    holder.add(object);

    const walk = model.animations.find((clip) => /walk/i.test(clip.name));
    const mixer = walk ? new THREE.AnimationMixer(object) : null;
    const action = walk && mixer ? mixer.clipAction(walk) : null;
    return {
      object: holder,
      animate(stride, delta) {
        if (!mixer || !action) return;
        if (stride !== 0 && !action.isRunning()) action.play();
        if (stride === 0 && action.isRunning()) action.stop();
        mixer.update(delta);
      },
    };
  }
}
