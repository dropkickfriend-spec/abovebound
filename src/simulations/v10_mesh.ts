import * as THREE from 'three';
import type { CompositeField } from './v9_lattice';

/**
 * V10 — Mesh / Surface Texture Optimizer
 *
 * Takes the lattice's composite material field (from V9) and carves
 * internal geometry through it using TPMS (Triply Periodic Minimal
 * Surfaces). This defines WHERE material exists vs. where channels
 * and voids are.
 *
 * The TPMS iso-surface creates the mesh topology:
 *   - Above threshold = solid material (lattice properties apply)
 *   - Below threshold = void/channel (flow path)
 *
 * Optimizes: surface area, porosity, channel connectivity, tortuosity
 * Outputs: a surface mesh + a carved material field for V1/V2 to explore
 */

export type TPMSType = 'gyroid' | 'diamond' | 'schwarz_p' | 'lidinoid' | 'neovius';

export interface MeshConfig {
  tpms: TPMSType;
  frequency: number;       // How many periods fit in the bounds (higher = finer channels)
  threshold: number;        // Iso-surface level: 0 = at surface, >0 = thicker walls
  porosity: number;         // Target porosity 0-1 (overrides threshold if set)
  roughness: number;        // Surface roughness modulation amplitude
}

export interface MeshMetrics {
  surfaceArea: number;      // Estimated surface area of the mesh
  porosity: number;         // Actual void fraction
  tortuosity: number;       // Path length / straight-line distance for flow
  channelCount: number;     // Number of distinct void regions detected
  avgChannelWidth: number;  // Average void channel width
}

// ── TPMS FUNCTIONS ──
// Each returns a scalar value; the iso-surface at value=threshold defines the mesh

function gyroid(x: number, y: number, z: number, freq: number): number {
  const f = freq * Math.PI;
  return Math.sin(x * f) * Math.cos(y * f) +
         Math.sin(y * f) * Math.cos(z * f) +
         Math.sin(z * f) * Math.cos(x * f);
}

function diamond(x: number, y: number, z: number, freq: number): number {
  const f = freq * Math.PI;
  return Math.sin(x * f) * Math.sin(y * f) * Math.sin(z * f) +
         Math.sin(x * f) * Math.cos(y * f) * Math.cos(z * f) +
         Math.cos(x * f) * Math.sin(y * f) * Math.cos(z * f) +
         Math.cos(x * f) * Math.cos(y * f) * Math.sin(z * f);
}

function schwarzP(x: number, y: number, z: number, freq: number): number {
  const f = freq * Math.PI;
  return Math.cos(x * f) + Math.cos(y * f) + Math.cos(z * f);
}

function lidinoid(x: number, y: number, z: number, freq: number): number {
  const f = freq * Math.PI;
  return 0.5 * (
    Math.sin(2 * x * f) * Math.cos(y * f) * Math.sin(z * f) +
    Math.sin(2 * y * f) * Math.cos(z * f) * Math.sin(x * f) +
    Math.sin(2 * z * f) * Math.cos(x * f) * Math.sin(y * f)
  ) - 0.5 * (
    Math.cos(2 * x * f) * Math.cos(2 * y * f) +
    Math.cos(2 * y * f) * Math.cos(2 * z * f) +
    Math.cos(2 * z * f) * Math.cos(2 * x * f)
  ) + 0.15;
}

function neovius(x: number, y: number, z: number, freq: number): number {
  const f = freq * Math.PI;
  return 3 * (Math.cos(x * f) + Math.cos(y * f) + Math.cos(z * f)) +
         4 * Math.cos(x * f) * Math.cos(y * f) * Math.cos(z * f);
}

function evaluateTPMS(type: TPMSType, x: number, y: number, z: number, freq: number): number {
  switch (type) {
    case 'gyroid': return gyroid(x, y, z, freq);
    case 'diamond': return diamond(x, y, z, freq);
    case 'schwarz_p': return schwarzP(x, y, z, freq);
    case 'lidinoid': return lidinoid(x, y, z, freq);
    case 'neovius': return neovius(x, y, z, freq);
  }
}

// ── V10 ENGINE ──

export class V10MeshEngine {
  scene: THREE.Scene;
  surfacePoints: THREE.Points;     // Visualize the iso-surface
  channelLines: THREE.LineSegments; // Visualize channel paths

  config: MeshConfig = {
    tpms: 'gyroid',
    frequency: 2.0,
    threshold: 0.0,
    porosity: 0.5,
    roughness: 0.05,
  };

  metrics: MeshMetrics = {
    surfaceArea: 0, porosity: 0, tortuosity: 1.0,
    channelCount: 0, avgChannelWidth: 0,
  };

  // The carved field: stores whether each voxel is solid (1) or void (0)
  solidMask: Float32Array | null = null;
  // The fitness field modulated by surface proximity
  meshFitnessField: Float32Array | null = null;

  private _resolution: number = 16;
  private _bounds: number = 2.0;
  private _built: boolean = false;
  private _frameCount: number = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    const ptGeo = new THREE.BufferGeometry();
    const ptMat = new THREE.PointsMaterial({
      size: 0.04, vertexColors: true, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending
    });
    this.surfacePoints = new THREE.Points(ptGeo, ptMat);
    this.scene.add(this.surfacePoints);

    const lineGeo = new THREE.BufferGeometry();
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x00ff88, transparent: true, opacity: 0.2,
      blending: THREE.AdditiveBlending
    });
    this.channelLines = new THREE.LineSegments(lineGeo, lineMat);
    this.scene.add(this.channelLines);
  }

  /** Configure for an optimizer type */
  configure(optimizer: string) {
    switch (optimizer) {
      case 'thermal':
        this.config = { tpms: 'gyroid', frequency: 2.0, threshold: 0.0, porosity: 0.5, roughness: 0.03 };
        break;
      case 'electrical':
        this.config = { tpms: 'diamond', frequency: 2.5, threshold: 0.1, porosity: 0.4, roughness: 0.01 };
        break;
      case 'blockchain':
        this.config = { tpms: 'schwarz_p', frequency: 1.5, threshold: -0.2, porosity: 0.6, roughness: 0.08 };
        break;
      case 'math':
        this.config = { tpms: 'lidinoid', frequency: 2.0, threshold: 0.0, porosity: 0.5, roughness: 0.1 };
        break;
    }
    this._built = false;
  }

  /** Build the mesh by evaluating the TPMS over the 3D grid */
  buildMesh(compositeField?: CompositeField) {
    const res = compositeField?.resolution || this._resolution;
    const bounds = compositeField?.bounds || this._bounds;
    this._resolution = res;
    this._bounds = bounds;
    const step = (bounds * 2) / (res - 1);
    const n = res * res * res;

    this.solidMask = new Float32Array(n);
    this.meshFitnessField = new Float32Array(n);

    let solidCount = 0;
    let surfaceArea = 0;

    for (let xi = 0; xi < res; xi++) {
      for (let yi = 0; yi < res; yi++) {
        for (let zi = 0; zi < res; zi++) {
          const px = xi * step - bounds;
          const py = yi * step - bounds;
          const pz = zi * step - bounds;
          const idx = xi * res * res + yi * res + zi;

          // Evaluate TPMS + roughness modulation
          const roughNoise = this.config.roughness * (Math.sin(px * 17.3) * Math.cos(py * 13.7) * Math.sin(pz * 19.1));
          const tpmsVal = evaluateTPMS(this.config.tpms, px, py, pz, this.config.frequency) + roughNoise;

          // Solid where TPMS > threshold
          const isSolid = tpmsVal > this.config.threshold;
          this.solidMask[idx] = isSolid ? 1.0 : 0.0;
          if (isSolid) solidCount++;

          // Surface proximity = fitness (interesting for PSO)
          // High fitness near the zero-crossing of the TPMS (the surface itself)
          const surfaceProximity = 1.0 / (Math.abs(tpmsVal - this.config.threshold) + 0.05);

          // If composite field is provided, multiply by its properties
          let baseFitness = surfaceProximity;
          if (compositeField) {
            baseFitness *= (1.0 + compositeField.fitnessField[idx] * 0.5);
          }

          this.meshFitnessField[idx] = baseFitness;

          // Approximate surface area by counting boundary voxels
          if (xi > 0 && yi > 0 && zi > 0 && xi < res - 1 && yi < res - 1 && zi < res - 1) {
            const neighbors = [
              this.solidMask[(xi + 1) * res * res + yi * res + zi] ?? 0,
              this.solidMask[(xi - 1) * res * res + yi * res + zi] ?? 0,
            ];
            // If solid but has a void neighbor → surface
            if (isSolid && neighbors.some(n => n === 0)) {
              surfaceArea += step * step;
            }
          }
        }
      }
    }

    // Compute metrics
    this.metrics.porosity = 1.0 - (solidCount / n);
    this.metrics.surfaceArea = surfaceArea;
    this.metrics.tortuosity = 1.0 + (1.0 - this.metrics.porosity) * 2.0; // Approximate
    this.metrics.avgChannelWidth = this.metrics.porosity > 0 ? (bounds * 2 * this.metrics.porosity / this.config.frequency) : 0;
    this.metrics.channelCount = Math.max(1, Math.round(this.config.frequency * this.config.frequency * this.metrics.porosity * 8));

    this._built = true;
  }

  /** Get mesh fitness field for V1.setMaterial() customField injection */
  getFitnessField(): Float32Array | null {
    return this.meshFitnessField;
  }

  /** Get solid mask for V6 thermal diffusion (solid blocks flow) */
  getSolidMask(): Float32Array | null {
    return this.solidMask;
  }

  getResolution(): number { return this._resolution; }
  getBounds(): number { return this._bounds; }
  getMetrics(): MeshMetrics { return this.metrics; }

  update() {
    this._frameCount++;

    if (!this._built) this.buildMesh();

    // Visualize the iso-surface points and void channel lines
    if (this.solidMask) {
      const res = this._resolution;
      const bounds = this._bounds;
      const step = (bounds * 2) / (res - 1);
      const surfPos: number[] = [];
      const surfCol: number[] = [];
      const chanPos: number[] = [];

      for (let xi = 1; xi < res - 1; xi++) {
        for (let yi = 1; yi < res - 1; yi++) {
          for (let zi = 1; zi < res - 1; zi++) {
            const idx = xi * res * res + yi * res + zi;
            const px = xi * step - bounds;
            const py = yi * step - bounds;
            const pz = zi * step - bounds;

            const solid = this.solidMask[idx] > 0.5;
            const neighbors = [
              this.solidMask[(xi + 1) * res * res + yi * res + zi],
              this.solidMask[(xi - 1) * res * res + yi * res + zi],
              this.solidMask[xi * res * res + (yi + 1) * res + zi],
              this.solidMask[xi * res * res + (yi - 1) * res + zi],
              this.solidMask[xi * res * res + yi * res + (zi + 1)],
              this.solidMask[xi * res * res + yi * res + (zi - 1)],
            ];

            // Surface point: solid with at least one void neighbor
            if (solid && neighbors.some(n => n < 0.5)) {
              surfPos.push(px, py, pz);
              // Color by TPMS type
              const tpmsVal = evaluateTPMS(this.config.tpms, px, py, pz, this.config.frequency);
              const t = Math.abs(tpmsVal) * 0.5;
              surfCol.push(0.0, 0.8 + t * 0.2, 0.5 + t * 0.5);
            }

            // Channel lines: void with void neighbor → shows flow path connectivity
            if (!solid) {
              if (xi < res - 2 && this.solidMask[(xi + 1) * res * res + yi * res + zi] < 0.5) {
                chanPos.push(px, py, pz, px + step, py, pz);
              }
              if (yi < res - 2 && this.solidMask[xi * res * res + (yi + 1) * res + zi] < 0.5) {
                chanPos.push(px, py, pz, px, py + step, pz);
              }
            }
          }
        }
      }

      this.surfacePoints.geometry.setAttribute('position', new THREE.Float32BufferAttribute(surfPos, 3));
      this.surfacePoints.geometry.setAttribute('color', new THREE.Float32BufferAttribute(surfCol, 3));
      this.surfacePoints.geometry.attributes.position.needsUpdate = true;
      this.surfacePoints.geometry.attributes.color.needsUpdate = true;

      if (chanPos.length > 0) {
        this.channelLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(chanPos, 3));
        this.channelLines.geometry.attributes.position.needsUpdate = true;
      }
    }
  }

  isStable(): boolean { return this._built; }

  dispose() {
    this.scene.remove(this.surfacePoints);
    this.scene.remove(this.channelLines);
    this.surfacePoints.geometry.dispose();
    (this.surfacePoints.material as THREE.Material).dispose();
    this.channelLines.geometry.dispose();
    (this.channelLines.material as THREE.Material).dispose();
  }
}
