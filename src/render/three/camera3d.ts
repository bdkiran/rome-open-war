import * as THREE from "three";
import type { Bounds, Point } from "@/map/topology.js";
import type { MapCamera } from "@/render/mapView.js";

/** Field of view, and how far the camera leans from looking straight down. */
const FOV = 38;
const TILT = THREE.MathUtils.degToRad(48);
const MAX_ZOOM = 3;

/**
 * A tilted perspective camera looking north over the map, like a strategy
 * game's campaign view. Map coordinates (x east, y south) become three.js
 * coordinates (x east, z south, y up).
 *
 * `zoom` means the same as in the 2D view: at 1, the ground under the
 * camera is shown at about one pixel per world unit.
 */
export class Camera3D implements MapCamera {
  readonly three = new THREE.PerspectiveCamera(FOV, 1, 4, 30000);
  /** The point on the ground the camera looks at, in map coordinates. */
  private target: Point = { x: 0, y: 0 };
  private distance = 800;
  private viewWidth = 1;
  private viewHeight = 1;
  private bounds: Bounds | null = null;
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly raycaster = new THREE.Raycaster();

  get zoom(): number {
    return this.distanceAtZoom1() / this.distance;
  }

  setBounds(bounds: Bounds): void {
    this.bounds = bounds;
    this.clamp();
  }

  setViewSize(width: number, height: number): void {
    this.viewWidth = width;
    this.viewHeight = height;
    this.three.aspect = width / Math.max(height, 1);
    this.three.updateProjectionMatrix();
    this.clamp();
  }

  panBy(dxScreen: number, dyScreen: number): void {
    const worldPerPixel = (2 * this.distance * Math.tan(THREE.MathUtils.degToRad(FOV) / 2)) / this.viewHeight;
    this.target.x -= dxScreen * worldPerPixel;
    // Dragging up and down moves over ground seen at a slant, so it covers more of it.
    this.target.y -= (dyScreen * worldPerPixel) / Math.cos(TILT);
    this.clamp();
  }

  zoomAt(screenPoint: Point, factor: number): void {
    const before = this.groundAt(screenPoint);
    this.distance /= factor;
    this.clamp();
    const after = this.groundAt(screenPoint);
    if (before && after) {
      this.target.x += before.x - after.x;
      this.target.y += before.y - after.y;
      this.clamp();
    }
  }

  centerOn(worldPoint: Point, zoom?: number): void {
    this.target = { ...worldPoint };
    if (zoom !== undefined) this.distance = this.distanceAtZoom1() / zoom;
    this.clamp();
  }

  fitToBounds(): void {
    if (!this.bounds) return;
    this.distance = this.maxDistance();
    this.target = { x: (this.bounds.minX + this.bounds.maxX) / 2, y: (this.bounds.minY + this.bounds.maxY) / 2 };
    this.clamp();
  }

  /** Where the point on the ground under a screen point is, in map coordinates. */
  groundAt(screenPoint: Point): Point | null {
    this.raycaster.setFromCamera(this.toNdc(screenPoint), this.three);
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.ground, hit) ? { x: hit.x, y: hit.z } : null;
  }

  /** A ray from the camera through a screen point, for picking. */
  rayAt(screenPoint: Point): THREE.Raycaster {
    this.raycaster.setFromCamera(this.toNdc(screenPoint), this.three);
    return this.raycaster;
  }

  /** Where a point in the 3D scene appears on screen, or null if it's behind the camera. */
  toScreen(position: THREE.Vector3): Point | null {
    const p = position.clone().project(this.three);
    if (p.z > 1) return null;
    return { x: ((p.x + 1) / 2) * this.viewWidth, y: ((1 - p.y) / 2) * this.viewHeight };
  }

  private toNdc(p: Point): THREE.Vector2 {
    return new THREE.Vector2((p.x / this.viewWidth) * 2 - 1, -(p.y / this.viewHeight) * 2 + 1);
  }

  /** The distance at which the ground is shown at zoom 1. */
  private distanceAtZoom1(): number {
    return this.viewHeight / (2 * Math.tan(THREE.MathUtils.degToRad(FOV) / 2));
  }

  /** Far enough out to see the whole map, and no further. */
  private maxDistance(): number {
    if (!this.bounds) return 5000;
    const b = this.bounds;
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(FOV) / 2);
    const forHeight = ((b.maxY - b.minY) * Math.cos(TILT)) / (2 * tanHalf);
    const forWidth = (b.maxX - b.minX) / (2 * tanHalf * this.three.aspect);
    return Math.max(forHeight, forWidth) * 1.02;
  }

  /** Keep the zoom within limits and the view's centre on the map, then place the camera. */
  private clamp(): void {
    this.distance = Math.min(this.maxDistance(), Math.max(this.distanceAtZoom1() / MAX_ZOOM, this.distance));
    if (this.bounds) {
      const b = this.bounds;
      this.target.x = Math.min(b.maxX, Math.max(b.minX, this.target.x));
      this.target.y = Math.min(b.maxY, Math.max(b.minY, this.target.y));
    }
    const { x, y } = this.target;
    this.three.position.set(x, this.distance * Math.cos(TILT), y + this.distance * Math.sin(TILT));
    this.three.lookAt(x, 0, y);
    this.three.updateMatrixWorld();
  }
}
