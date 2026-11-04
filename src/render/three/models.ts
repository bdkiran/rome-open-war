import * as THREE from "three";
import type { Culture } from "@/data/cultures.js";
import { buildTown } from "@/render/three/town.js";
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

// ---- Waving cloth -------------------------------------------------------------

/** Banner size, in model units. */
const FLAG_WIDTH = 24;
const FLAG_HEIGHT = 18;
/** The banner is turned a little about its pole, so its folds show from the camera. */
const FLAG_YAW = 0.42;
/** Length of one wave, as a share of the banner's width. */
const FLAG_WAVELENGTH = 0.9;

/** How a banner moves: how far its free edge swings, how many waves a second, how far it sags. */
export interface FlagMotion {
  amplitude: number;
  speed: number;
  droop: number;
}

/** The motions a banner can have. */
export const FLAG_MOTION = {
  /** Standing in the wind. */
  idle: { amplitude: 3.2, speed: 0.55, droop: 1.2 },
  /** Marching: flutters faster. */
  marching: { amplitude: 3.7, speed: 1, droop: 1 },
  /** An army that has used its moves: calmer. */
  spent: { amplitude: 2.2, speed: 0.33, droop: 1.6 },
  /** An undefended city at half-mast: hangs nearly still. */
  limp: { amplitude: 1, speed: 0.22, droop: 7 },
} satisfies Record<string, FlagMotion>;

/** The clock every banner waves to, in seconds. The map view sets it each frame. */
const flagClock = { value: 0 };

/** Sets the time all banners wave to (seconds). */
export function setFlagClock(seconds: number): void {
  flagClock.value = seconds;
}

/** A waving banner, and a way to change how it moves. */
interface Cloth {
  mesh: THREE.Mesh;
  /** Changes its motion without a jump: the wave carries on from where it is. */
  setMotion(motion: FlagMotion): void;
}

/**
 * Bends the plane in the vertex shader: pinned at the pole (x = 0), a
 * travelling wave whose swing grows toward the free edge, and a sag. The
 * normal follows the wave so the folds catch the light.
 */
const CLOTH_HEADER = /* glsl */ `
uniform float uFlagTime;
uniform float uFlagSpeed;
uniform float uFlagOffset;
uniform float uFlagAmp;
uniform float uFlagDroop;
const float FLAG_TAU = 6.2831853;
const float FLAG_W = ${FLAG_WIDTH.toFixed(1)};
const float FLAG_L = ${FLAG_WAVELENGTH.toFixed(2)};
`;
const CLOTH_NORMAL = /* glsl */ `
float flagU = clamp(position.x / FLAG_W, 0.0, 1.0);
float flagS = FLAG_TAU * (flagU / FLAG_L - (uFlagTime * uFlagSpeed + uFlagOffset));
float flagZ = uFlagAmp * pow(flagU, 1.2) * sin(flagS);
float flagSlope = uFlagAmp * (1.2 * pow(max(flagU, 0.0001), 0.2) * sin(flagS) + pow(flagU, 1.2) * cos(flagS) * FLAG_TAU / FLAG_L) / FLAG_W;
vec3 objectNormal = normalize(vec3(-flagSlope, 0.0, 1.0));
#ifdef USE_TANGENT
  vec3 objectTangent = vec3(tangent.xyz);
#endif
`;
const CLOTH_POSITION = /* glsl */ `
#include <begin_vertex>
transformed.z += flagZ;
transformed.y -= flagU * flagU * uFlagDroop + 0.15 * uFlagAmp * flagU * sin(flagS + 1.3);
`;

/**
 * A banner of lit cloth carrying `texture`, its left edge at the pole. Each
 * starts at its own point in the wave (`seed`, 0-1) so neighbours don't wave
 * in step.
 */
function cloth(texture: THREE.Texture, motion: FlagMotion, seed: number, look: { opacity: number; tint: string }): Cloth {
  const geometry = new THREE.PlaneGeometry(FLAG_WIDTH, FLAG_HEIGHT, 16, 6);
  geometry.translate(FLAG_WIDTH / 2, 0, 0);
  const tint = new THREE.Color(look.tint);
  const material = new THREE.MeshLambertMaterial({
    map: texture,
    color: tint,
    // A floor under the shading, so the number stays legible in a deep fold.
    emissive: tint.clone().multiplyScalar(0.3),
    emissiveMap: texture,
    transparent: true,
    alphaTest: 0.05,
    side: THREE.DoubleSide,
    opacity: look.opacity,
  });
  const uniforms = {
    uFlagTime: flagClock,
    uFlagSpeed: { value: motion.speed },
    uFlagOffset: { value: seed },
    uFlagAmp: { value: motion.amplitude },
    uFlagDroop: { value: motion.droop },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${CLOTH_HEADER}`)
      .replace("#include <beginnormal_vertex>", CLOTH_NORMAL)
      .replace("#include <begin_vertex>", CLOTH_POSITION);
  };
  // Every banner runs the same shader; only its uniforms differ.
  material.customProgramCacheKey = () => "flag-cloth";

  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.y = FLAG_YAW;
  return {
    mesh,
    setMotion(next) {
      if (next.speed !== uniforms.uFlagSpeed.value) {
        // Keep the wave's current position: time * speed + offset is unchanged.
        uniforms.uFlagOffset.value += flagClock.value * (uniforms.uFlagSpeed.value - next.speed);
        uniforms.uFlagSpeed.value = next.speed;
      }
      uniforms.uFlagAmp.value = next.amplitude;
      uniforms.uFlagDroop.value = next.droop;
    },
  };
}

/**
 * A pole with a waving banner (for cities). A lowered banner hangs limp at
 * half-mast, greyed.
 */
function flag(
  color: string,
  text: string,
  pips: number,
  height: number,
  emblem: boolean,
  faded: boolean,
  seed: number,
  lowered = false,
): THREE.Group {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, height, 5), mat("#3b2c1e", faded));
  pole.position.y = height / 2;
  const finial = new THREE.Mesh(new THREE.SphereGeometry(1.3, 6, 4), mat("#d9b24a", faded));
  finial.position.y = height + 0.8;
  const banner = cloth(bannerTexture(color, text, pips, emblem), lowered ? FLAG_MOTION.limp : FLAG_MOTION.idle, seed, {
    opacity: faded ? 0.6 : 1,
    tint: lowered ? "#9a9a9a" : "#ffffff",
  });
  banner.mesh.position.set(0.5, lowered ? height * 0.45 : height - 9.5, 0);
  g.add(pole, finial, banner.mesh);
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
  /** Where in its wave the banner starts (0-1), so neighbouring banners don't wave in step. */
  seed: number;
  /** Which kit the soldier carries (helmet, shield, weapon), if the army model has kits. */
  culture: Culture;
}

/**
 * An army on the map: one standard-bearer in the faction's colours, carrying
 * a waving banner with the army's strength and a pip per regiment. The model
 * faces the way it's walking; the banner always turns to face the camera, and
 * flutters faster while it marches.
 */
export function buildArmy(look: ArmyLook, library: ModelLibrary): Figure {
  const custom = library.army(look.color, look.faded, look.culture);
  const figure = custom ?? standardBearer(look.color, look.faded);

  const resting = look.faded ? FLAG_MOTION.spent : FLAG_MOTION.idle;
  const banner = cloth(bannerTexture(look.color, look.label, look.regiments, false), resting, look.seed, {
    opacity: look.faded ? 0.6 : 1,
    tint: "#ffffff",
  });
  // The banner hangs from the top of the pole the bearer carries (or, for a
  // model from a file, a pole planted behind his right shoulder, clear of a
  // shield on his left arm).
  const polePlace = custom ? FILE_MODEL_POLE : { x: 8, z: 0 };
  const bannerHolder = new THREE.Group();
  bannerHolder.position.set(polePlace.x, 56, polePlace.z);
  banner.mesh.position.set(0.5, 0, 0);
  bannerHolder.add(banner.mesh);
  figure.object.add(bannerHolder);
  if (custom) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 64, 5), mat("#3b2c1e", look.faded));
    pole.position.set(polePlace.x, 32, polePlace.z);
    figure.object.add(pole);
  }

  return {
    object: figure.object,
    animate(stride, delta) {
      figure.animate(stride, delta);
      banner.setMotion(stride !== 0 ? FLAG_MOTION.marching : resting);
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
 * A city: its town (town.ts: houses and civic buildings in its culture's
 * style, more with each level, and its walls once built), and a banner in
 * the owner's colours that waves over it while it has a garrison and hangs
 * limp at half-mast when it doesn't.
 */
export function buildCity(
  color: string,
  look: {
    capital: boolean;
    level: number;
    walls: number;
    /** The owner's culture, which sets the town's style. */
    culture: Culture;
    /** Whether a garrison holds it (true for an enemy city out of sight, so the fog gives nothing away). */
    garrisoned: boolean;
    /** The garrison's strength and regiments, shown on the banner; null to show the plain laurel. */
    garrison: { label: string; regiments: number } | null;
    /** Where in its wave the banner starts (0-1); also lays out the town. */
    seed: number;
  },
  library: ModelLibrary,
): THREE.Object3D {
  const custom = library.city(look.capital);
  if (custom) return custom;

  const g = new THREE.Group();
  g.add(buildTown({ culture: look.culture, level: look.level, walls: look.walls, capital: look.capital, seed: look.seed }));

  // The banner flies when the city has a garrison, showing its strength, and
  // hangs at half-mast when it's undefended.
  const banner = look.garrison
    ? flag(color, look.garrison.label, look.garrison.regiments, look.capital ? 50 : 42, false, false, look.seed)
    : flag(color, "", 0, look.capital ? 50 : 42, true, false, look.seed, !look.garrisoned);
  banner.position.set(-1, 0, -10);
  g.add(banner);
  return g;
}

/** Where a watchtower stands on its tile (model units from the centre), and how much room it takes. */
export const WATCHTOWER_SPOT = { x: 16, z: -8, radius: 8 };

/**
 * A watchtower: a timber tower on a stone footing with a lookout platform,
 * a roof, and a pennant in its owner's colours. It stands to one side of
 * its tile, so an army there is still seen.
 */
export function buildWatchtower(color: string): THREE.Object3D {
  const g = new THREE.Group();
  const footing = new THREE.Mesh(new THREE.CylinderGeometry(6, 7, 2, 6), mat(STONE));
  footing.position.y = 1;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(3, 4.2, 18, 4), mat("#8a6a45"));
  shaft.rotation.y = Math.PI / 4;
  shaft.position.y = 11;
  const platform = box(10, 2, 10, mat("#a07c52"));
  platform.position.y = 21;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(7.5, 6, 4), mat(ROOF));
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 25.5;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 8, 4), mat("#5a4630"));
  pole.position.y = 32;
  const pennant = box(5, 3, 0.4, mat(color));
  pennant.position.set(2.5, 34, 0);
  g.add(footing, shaft, platform, roof, pole, pennant);
  g.position.set(WATCHTOWER_SPOT.x, 0, WATCHTOWER_SPOT.z);
  return g;
}

/**
 * A battle's clash, played once on its tile: a ring of dust spreading over
 * the ground and two crossed blades in the attacker's colours that flash up
 * and fade. `update` takes the progress from 0 to 1.
 */
export function clashBurst(color: string): { object: THREE.Object3D; update(progress: number): void } {
  const g = new THREE.Group();
  // The dust starts outside a city's footing (radius 25), so it isn't hidden under it.
  const dustMaterial = new THREE.MeshBasicMaterial({ color: "#e6dcc0", transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const dust = new THREE.Mesh(new THREE.RingGeometry(26, 36, 40), dustMaterial);
  dust.rotation.x = -Math.PI / 2;
  dust.position.y = 2;
  const steel = new THREE.MeshBasicMaterial({ color: "#f2f2ee", transparent: true, depthWrite: false });
  const hilt = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false });
  const blades = new THREE.Group();
  for (const lean of [-0.65, 0.65]) {
    const sword = new THREE.Group();
    const blade = box(6, 46, 1.5, steel);
    blade.position.y = 6;
    const guard = box(20, 4.5, 2, hilt);
    guard.position.y = -18;
    const grip = box(4.5, 12, 2, hilt);
    grip.position.y = -26;
    sword.add(blade, guard, grip);
    sword.rotation.z = lean;
    blades.add(sword);
  }
  blades.position.y = 58;
  g.add(dust, blades);
  return {
    object: g,
    update(progress: number) {
      const p = Math.min(1, Math.max(0, progress));
      dust.scale.setScalar(0.8 + 1.2 * p);
      dustMaterial.opacity = 0.85 * (1 - p);
      // The blades pop up in the first fifth, hold, then fade over the last 40%.
      blades.scale.setScalar(p < 0.2 ? 0.4 + 3.25 * p : 1.05);
      const fade = p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4;
      steel.opacity = fade;
      hilt.opacity = fade;
    },
  };
}

/**
 * A scout on the map: a lone soldier with a small pennant in his owner's
 * colours instead of an army's numbered banner.
 */
export function buildScout(color: string, culture: Culture, library: ModelLibrary): Figure {
  const figure = library.army(color, false, culture) ?? standardBearer(color, false);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 44, 5), mat("#3b2c1e"));
  pole.position.set(8, 22, 0);
  const pennant = new THREE.Mesh(new THREE.ConeGeometry(4, 13, 3), mat(color));
  pennant.rotation.z = -Math.PI / 2;
  pennant.position.set(14.5, 40, 0);
  figure.object.add(pole, pennant);
  return figure;
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

/** Names of kit parts in an army model: kit_<culture>_<part>. */
const KIT_PART = /^kit_([a-z]+)_/;

/** Whether a node is, or hangs from, a kit part. */
function inKit(node: THREE.Object3D): boolean {
  for (let n: THREE.Object3D | null = node; n; n = n.parent) if (KIT_PART.test(n.name)) return true;
  return false;
}

/** Where the banner pole stands beside an army model from a file: behind its right shoulder. */
const FILE_MODEL_POLE = { x: -4, z: -7 };

/** How long a model from a file takes to blend between standing and walking, in seconds. */
const FILE_MODEL_BLEND_SECONDS = 0.2;
/** Where the next copy of a model starts its idle clip (0-1), stepped for each copy. */
let idleStagger = 0;

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
 * "faction" are recoloured to the owner's colour, an animation clip whose
 * name contains "walk" plays while the army is moving, and one whose name
 * contains "idle" while it stands.
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

  /**
   * The army model from a file, if one is listed, carrying `culture`'s kit:
   * parts named `kit_<culture>_...` show only for that culture.
   */
  army(color: string, faded: boolean, culture: Culture): Figure | null {
    const model = this.loaded.get("army");
    return model ? this.fromFile(model, color, faded, this.manifest.soldierHeight ?? 36, 0, culture) : null;
  }

  city(capital: boolean): THREE.Object3D | null {
    const model = this.loaded.get(capital ? "capital" : "city") ?? this.loaded.get("city");
    if (!model) return null;
    return this.fromFile(model, null, false, 0, this.manifest.cityWidth ?? 60).object;
  }

  /** A copy of a loaded model, recoloured, scaled to size, with its walk animation hooked up. */
  private fromFile(model: LoadedModel, color: string | null, faded: boolean, height: number, width = 0, culture: Culture | null = null): Figure {
    const object = cloneSkinned(model.scene);
    // Show only this culture's kit.
    object.traverse((node) => {
      const kit = KIT_PART.exec(node.name);
      if (kit) node.visible = kit[1] === culture;
    });
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

    // Scale to size and stand it on the ground. Measured from the posed
    // vertices ("precise"), since a rigged mesh's stored bounds ignore its
    // bones, and without kit parts, so a long spear doesn't shrink the soldier.
    const measure = () => {
      object.updateMatrixWorld(true);
      const box = new THREE.Box3();
      object.traverse((node) => {
        if (!(node as THREE.Mesh).isMesh || inKit(node)) return;
        box.expandByObject(node, true);
      });
      return box.isEmpty() ? new THREE.Box3().setFromObject(object, true) : box;
    };
    const size = measure().getSize(new THREE.Vector3());
    const scale = height > 0 ? height / Math.max(size.y, 0.001) : width / Math.max(size.x, size.z, 0.001);
    object.scale.setScalar(scale);
    object.position.y -= measure().min.y;
    // A rigged mesh's bounds don't follow its animation, so don't let them hide it.
    object.traverse((node) => {
      if ((node as THREE.SkinnedMesh).isSkinnedMesh) node.frustumCulled = false;
    });
    const holder = new THREE.Group();
    holder.add(object);

    // A "walk" clip plays while moving; an "idle" clip, if there is one, while standing.
    const walkClip = model.animations.find((clip) => /walk/i.test(clip.name));
    const idleClip = model.animations.find((clip) => /idle/i.test(clip.name));
    const mixer = walkClip || idleClip ? new THREE.AnimationMixer(object) : null;
    const walk = walkClip && mixer ? mixer.clipAction(walkClip) : null;
    const idle = idleClip && mixer ? mixer.clipAction(idleClip) : null;
    if (idle) {
      idle.play();
      // Start each copy at a different point, so a row of armies doesn't breathe in step.
      idleStagger = (idleStagger + 0.37) % 1;
      idle.time = idleStagger * idleClip!.duration;
    }
    let walking = false;
    return {
      object: holder,
      animate(stride, delta) {
        if (!mixer) return;
        const moving = stride !== 0;
        if (moving !== walking) {
          walking = moving;
          const from = moving ? idle : walk;
          const to = moving ? walk : idle;
          if (to) to.reset().play();
          if (from && to) from.crossFadeTo(to, FILE_MODEL_BLEND_SECONDS, false);
          else if (from) from.stop();
        }
        mixer.update(delta);
      },
    };
  }
}
