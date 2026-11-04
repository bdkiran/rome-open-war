/**
 * Builds models/knight.glb, the soldier that stands for an army on the map,
 * from the Quaternius knight in models/source/quaternius-knight (CC0).
 *
 * The knight carries every culture's kit at once (a helmet, a shield and a
 * weapon), each attached to the bone that moves it: the helmet to the head,
 * the shield to the left forearm, the weapon to the right palm. Kit parts are
 * named `kit_<culture>_<part>`, and the game shows only the parts for an
 * army's culture (src/data/cultures.ts). Materials whose name starts with
 * `Faction` take the owner's colour. Four clips are kept: Idle and Walking,
 * and for an army besieging a city, Ready (weapon raised) and Attack (an
 * overhead strike).
 *
 *   npm run army-model
 *
 * Positions are in the knight's own units: it stands about 560 tall, its
 * head around y = 410-560, its hands hanging at y = 160 either side.
 */
import { readFileSync, writeFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { CULTURES, type Culture } from "@/data/cultures.js";

const SOURCE = "models/source/quaternius-knight";
const OUTPUT = "models/knight.glb";

const BRONZE = "#b08a4a";
const IRON = "#8d9093";
const WOOD = "#6b4f33";
const PLUME = "#2a2522";
const HAIR = "#6a4426";
const DARK_BRONZE = "#7d6234";
const SKIN = "#dfb388";

/** Pack colours changed on the way in: both pack helmets become bronze, as they were in this age. */
const RECOLOUR: Record<string, string> = { Grey: BRONZE, DarkGrey: DARK_BRONZE, Skin: SKIN };

// ---- Loading and materials ------------------------------------------------------

function loadFbx(name: string): THREE.Group {
  const buffer = readFileSync(`${SOURCE}/${name}.fbx`);
  return new FBXLoader().parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), "");
}

const materials = new Map<string, THREE.MeshStandardMaterial>();

/**
 * A matte, flat-coloured material, shared between parts with the same name
 * and colour. Names starting with "Faction" are recoloured in the game.
 */
function mat(name: string, color: string): THREE.MeshStandardMaterial {
  const key = `${name}|${color}`;
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ name, color, roughness: 1, metalness: 0, side: THREE.DoubleSide });
    materials.set(key, m);
  }
  return m;
}

/** A mesh with one normal per face, for the same faceted look as the rest of the map. */
function part(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  const faceted = geometry.index ? geometry.toNonIndexed() : geometry;
  faceted.computeVertexNormals();
  return new THREE.Mesh(faceted, material);
}

function group(name: string, ...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  g.add(...children);
  return g;
}

// ---- The knight and where things go on it --------------------------------------------

const knight = loadFbx("KnightCharacter");
knight.updateMatrixWorld(true);

function bone(name: string): THREE.Bone {
  let found: THREE.Bone | undefined;
  knight.traverse((node) => {
    if ((node as THREE.Bone).isBone && node.name === name) found = node as THREE.Bone;
  });
  if (!found) throw new Error(`No bone named ${name}`);
  return found;
}

/** The head's extent in the rest pose: the vertices that mostly follow the Head bone. */
function headBox(): THREE.Box3 {
  let skinned: THREE.SkinnedMesh | undefined;
  knight.traverse((node) => {
    if ((node as THREE.SkinnedMesh).isSkinnedMesh) skinned = node as THREE.SkinnedMesh;
  });
  if (!skinned) throw new Error("No skinned mesh in the knight");
  const head = skinned.skeleton.bones.indexOf(bone("Head"));
  const position = skinned.geometry.attributes.position;
  const index = skinned.geometry.attributes.skinIndex;
  const weight = skinned.geometry.attributes.skinWeight;
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    for (let k = 0; k < 4; k++) {
      if (index.getComponent(i, k) === head && weight.getComponent(i, k) > 0.5) {
        box.expandByPoint(v.fromBufferAttribute(position, i).applyMatrix4(skinned.matrixWorld));
      }
    }
  }
  return box;
}

const HEAD = headBox();
const HEAD_CENTRE = HEAD.getCenter(new THREE.Vector3());
const HEAD_SIZE = HEAD.getSize(new THREE.Vector3());

/**
 * Hangs `item` from `parent` so that, in the rest pose, it sits at `at`
 * turned by `turn` and scaled by `scale` (all in the knight's own units).
 */
function attach(item: THREE.Object3D, parent: THREE.Object3D, at: THREE.Vector3, turn: THREE.Euler, scale = 1): void {
  const placed = new THREE.Matrix4().compose(at, new THREE.Quaternion().setFromEuler(turn), new THREE.Vector3(scale, scale, scale));
  new THREE.Matrix4().copy(parent.matrixWorld).invert().multiply(placed).decompose(item.position, item.quaternion, item.scale);
  parent.add(item);
}

/** Puts a pack helmet on the head, sized to fit it, in bronze. */
function packHelmet(file: string, fit: number, lift: number, forward: number): THREE.Group {
  const helmet = loadFbx(file);
  helmet.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const recolour = (m: THREE.Material) => mat(m.name, RECOLOUR[m.name] ?? `#${(m as THREE.MeshPhongMaterial).color.getHexString()}`);
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(recolour) : recolour(mesh.material);
  });
  const box = new THREE.Box3().setFromObject(helmet);
  const centre = box.getCenter(new THREE.Vector3());
  const scale = (HEAD_SIZE.x * fit) / box.getSize(new THREE.Vector3()).x;
  const holder = new THREE.Group();
  helmet.position.copy(centre).multiplyScalar(-1);
  holder.add(helmet);
  holder.scale.setScalar(scale);
  const at = HEAD_CENTRE.clone().add(new THREE.Vector3(0, HEAD_SIZE.y * lift, forward));
  holder.position.copy(at);
  return holder;
}

/** A crest running front to back over the top of the head: a half-disc, thin from side to side. */
function crest(material: THREE.Material, length: number, height: number, thickness: number): THREE.Mesh {
  const shape = new THREE.Shape();
  shape.absellipse(0, 0, length / 2, height, 0, Math.PI, false, 0);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false, curveSegments: 7 });
  geometry.translate(0, 0, -thickness / 2);
  geometry.rotateY(Math.PI / 2);
  return part(geometry, material);
}

// ---- Helmets ---------------------------------------------------------------------

function romanHelmet(): THREE.Object3D {
  const helmet = packHelmet("Helmet1", 1.12, 0.16, -4);
  const plume = crest(mat("Plume", PLUME), HEAD_SIZE.z * 0.75, HEAD_SIZE.y * 0.55, 16);
  plume.position.set(HEAD_CENTRE.x, HEAD.max.y + HEAD_SIZE.y * 0.12, HEAD_CENTRE.z - 6);
  return group("helmet", helmet, plume);
}

function hellenisticHelmet(): THREE.Object3D {
  const helmet = packHelmet("Helmet2", 1.12, 0.1, 0);
  const plume = crest(mat("FactionCrest", "#c0392b"), HEAD_SIZE.z * 1.15, HEAD_SIZE.y * 0.6, 18);
  plume.position.set(HEAD_CENTRE.x, HEAD.max.y + HEAD_SIZE.y * 0.1, HEAD_CENTRE.z - 8);
  return group("helmet", helmet, plume);
}

/** A tall conical cap with a rim. */
function punicHelmet(): THREE.Object3D {
  const r = HEAD_SIZE.x * 0.7;
  const cone = part(new THREE.ConeGeometry(r, HEAD_SIZE.y * 0.95, 9), mat("Bronze", BRONZE));
  cone.position.set(HEAD_CENTRE.x, HEAD.max.y + HEAD_SIZE.y * 0.02, HEAD_CENTRE.z + 4);
  const rim = part(new THREE.CylinderGeometry(r * 1.06, r * 1.06, 16, 9), mat("Bronze", BRONZE));
  rim.position.set(HEAD_CENTRE.x, HEAD.max.y - HEAD_SIZE.y * 0.43, HEAD_CENTRE.z + 4);
  return group("helmet", cone, rim);
}

/** No helmet: a head of hair, swept back. */
function celticHair(): THREE.Object3D {
  const r = HEAD_SIZE.x * 0.62;
  const hair = part(new THREE.SphereGeometry(r, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.58), mat("Hair", HAIR));
  hair.scale.set(1, 1, 1.15);
  hair.position.set(HEAD_CENTRE.x, HEAD_CENTRE.y + HEAD_SIZE.y * 0.1, HEAD_CENTRE.z - 8);
  return group("helmet", hair);
}

/** A Phrygian helmet: a tall cap whose top curls forward. */
function thracianHelmet(): THREE.Object3D {
  const r = HEAD_SIZE.x * 0.58;
  const h = HEAD_SIZE.y * 1.0;
  const profile = [
    [r, 0], [r * 0.98, h * 0.3], [r * 0.85, h * 0.55], [r * 0.6, h * 0.78], [r * 0.3, h * 0.94], [0, h],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const geometry = new THREE.LatheGeometry(profile, 9);
  // Curl the top forward (+z): the higher, the further.
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / h;
    p.setZ(i, p.getZ(i) + Math.pow(t, 2.2) * r * 0.9);
  }
  const cap = part(geometry, mat("Bronze", BRONZE));
  cap.position.set(HEAD_CENTRE.x, HEAD_CENTRE.y - HEAD_SIZE.y * 0.02, HEAD_CENTRE.z - 6);
  return group("helmet", cap);
}

// ---- Shields (built facing +z, centred on the origin) ------------------------------------

/** The Roman scutum: tall, curved, with a ridge and a boss. */
function scutum(): THREE.Object3D {
  const radius = 260;
  const arc = 0.78;
  const face = part(new THREE.CylinderGeometry(radius, radius, 380, 6, 1, true, -arc / 2, arc), mat("FactionShield", "#c0392b"));
  face.position.z = -radius;
  const ridge = part(new THREE.BoxGeometry(14, 360, 10), mat("Bronze", BRONZE));
  ridge.position.z = 6;
  const boss = part(new THREE.SphereGeometry(30, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), mat("Bronze", BRONZE));
  boss.rotation.x = Math.PI / 2;
  boss.position.z = 6;
  return group("shield", face, ridge, boss);
}

/** The hoplite's round shield, with a bronze rim. */
function aspis(): THREE.Object3D {
  const face = part(new THREE.CylinderGeometry(150, 150, 12, 14), mat("FactionShield", "#c0392b"));
  face.rotation.x = Math.PI / 2;
  const rim = part(new THREE.TorusGeometry(150, 11, 4, 14), mat("Bronze", BRONZE));
  rim.position.z = 4;
  return group("shield", face, rim);
}

/** An oval shield with a boss; the Celtic one is taller and has a spine. */
function oval(width: number, height: number, spine: boolean): THREE.Object3D {
  const face = part(new THREE.CylinderGeometry(1, 1, 12, 14), mat("FactionShield", "#c0392b"));
  face.scale.set(width / 2, 1, height / 2);
  face.rotation.x = Math.PI / 2;
  const parts: THREE.Object3D[] = [face];
  if (spine) {
    const rib = part(new THREE.BoxGeometry(16, height * 0.92, 10), mat("Wood", WOOD));
    rib.position.z = 8;
    parts.push(rib);
  }
  const boss = part(new THREE.SphereGeometry(spine ? 26 : 32, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), mat("Iron", IRON));
  boss.rotation.x = Math.PI / 2;
  boss.position.z = spine ? 14 : 6;
  parts.push(boss);
  return group("shield", ...parts);
}

/** The pelta: a crescent with its horns up. */
function pelta(): THREE.Object3D {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, 130, Math.PI * 1.05, Math.PI * 1.95 + Math.PI * 2, true);
  shape.absarc(0, 40, 85, Math.PI * 1.9, Math.PI * 1.1, true);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 12, bevelEnabled: false, curveSegments: 10 });
  geometry.translate(0, -10, -6);
  const face = part(geometry, mat("FactionShield", "#c0392b"));
  // The horns curl outward: reflect the mirrored shape so it reads as one crescent.
  return group("shield", face);
}

// ---- Weapons (built along +y from the grip at the origin) ---------------------------------

function spear(length: number): THREE.Object3D {
  const shaft = part(new THREE.CylinderGeometry(5, 6, length, 6), mat("Wood", WOOD));
  shaft.position.y = length * 0.25;
  const tip = part(new THREE.ConeGeometry(13, 70, 4), mat("Iron", IRON));
  tip.position.y = length * 0.75 + 30;
  return group("weapon", shaft, tip);
}

function packSword(file: string): THREE.Object3D {
  return group("weapon", loadFbx(file));
}

/** The falx: a long handle and a blade curving forward. */
function falx(): THREE.Object3D {
  const handle = part(new THREE.CylinderGeometry(7, 7, 110, 6), mat("Wood", WOOD));
  handle.position.y = -15;
  // The blade: a strip that bends forward (+z) as it goes.
  const shape = new THREE.Shape();
  const steps = 8;
  const length = 250;
  const spine: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    spine.push([Math.sin(t * 1.1) * length * 0.55, Math.sin(t * 1.4) * length * 0.75]);
  }
  shape.moveTo(spine[0][0] - 12, spine[0][1]);
  for (const [z, y] of spine) shape.lineTo(z - 12 * (1 - y / length), y);
  for (const [z, y] of [...spine].reverse()) shape.lineTo(z + 14 * (1 - y / length) + 2, y);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 6, bevelEnabled: false });
  geometry.translate(0, 0, -3);
  geometry.rotateY(-Math.PI / 2);
  const blade = part(geometry, mat("Iron", IRON));
  blade.position.y = 40;
  return group("weapon", handle, blade);
}

// ---- Putting the kits on -----------------------------------------------------------

interface Kit {
  helmet: THREE.Object3D;
  shield: THREE.Object3D;
  /** Shield size relative to how it's built. */
  shieldScale?: number;
  weapon: THREE.Object3D;
  /** How the weapon is held: hanging point-down like a sword, or upright like a spear. */
  grip: "sword" | "spear";
  weaponScale?: number;
}

const KITS: Record<Culture, () => Kit> = {
  roman: () => ({ helmet: romanHelmet(), shield: scutum(), weapon: packSword("ShortSword"), grip: "sword", weaponScale: 0.62 }),
  hellenistic: () => ({ helmet: hellenisticHelmet(), shield: aspis(), weapon: spear(950), grip: "spear" }),
  punic: () => ({ helmet: punicHelmet(), shield: oval(230, 300, false), weapon: spear(760), grip: "spear" }),
  celtic: () => ({ helmet: celticHair(), shield: oval(190, 380, true), weapon: packSword("Sword"), grip: "sword", weaponScale: 0.7 }),
  thracian: () => ({ helmet: thracianHelmet(), shield: pelta(), weapon: falx(), grip: "sword" }),
};

const head = bone("Head");
const leftForearm = bone("LowerArmL");
const rightPalm = bone("PalmR");
const palmAt = rightPalm.getWorldPosition(new THREE.Vector3());

for (const culture of CULTURES) {
  const kit = KITS[culture]();
  const name = (piece: string) => `kit_${culture}_${piece}`;

  kit.helmet.name = name("helmet");
  attach(kit.helmet, head, new THREE.Vector3(), new THREE.Euler());

  // The shield is carried on the left forearm, in front of the body, turned a little outward.
  kit.shield.name = name("shield");
  attach(kit.shield, leftForearm, new THREE.Vector3(78, 218, 62), new THREE.Euler(0, 0.32, 0), kit.shieldScale ?? 1);

  kit.weapon.name = name("weapon");
  const held = kit.grip === "sword"
    ? { at: palmAt.clone().add(new THREE.Vector3(0, -8, 4)), turn: new THREE.Euler(Math.PI - 0.45, 0, 0) }
    : { at: palmAt.clone().add(new THREE.Vector3(0, 0, 10)), turn: new THREE.Euler(0.1, 0, 0) };
  attach(kit.weapon, rightPalm, held.at, held.turn, kit.weaponScale ?? 1);
}

// The pack's own materials become the same matte kind as the kits', and the
// armour takes the owner's colour.
knight.traverse((node) => {
  const mesh = node as THREE.Mesh;
  if (!mesh.isMesh) return;
  const convert = (m: THREE.Material): THREE.Material => {
    if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial) return m;
    const color = (m as THREE.MeshPhongMaterial).color ?? new THREE.Color("#ffffff");
    if (m.name === "Armor") return mat("FactionArmor", `#${color.getHexString()}`);
    return mat(m.name, m.name === "Skin" ? SKIN : `#${color.getHexString()}`);
  };
  mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material);
});

/** The pack's clips to keep, and the names the game knows them by. */
const CLIPS: Record<string, string> = { Idle: "Idle", Walking: "Walking", Idle_swordRight: "Ready", swordAttackJump: "Attack" };
const clips = knight.animations.filter((clip) => clip.name.split("|")[1] in CLIPS);
for (const clip of clips) clip.name = CLIPS[clip.name.split("|")[1]];

// ---- Writing the file ------------------------------------------------------------

/** GLTFExporter reads its output through a FileReader, which Node doesn't have. */
class NodeFileReader {
  result: ArrayBuffer | string | null = null;
  onloadend: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob): void {
    void blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob: Blob): void {
    void blob.arrayBuffer().then((buffer) => {
      this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString("base64")}`;
      this.onloadend?.();
    });
  }
}
(globalThis as unknown as { FileReader: unknown }).FileReader = NodeFileReader;

const glb = (await new GLTFExporter().parseAsync(knight, { binary: true, animations: clips })) as ArrayBuffer;
writeFileSync(OUTPUT, Buffer.from(glb));
console.log(`Wrote ${OUTPUT}: ${(glb.byteLength / 1024).toFixed(0)} KB, kits for ${CULTURES.join(", ")}, clips ${clips.map((c) => c.name).join(", ")}.`);
