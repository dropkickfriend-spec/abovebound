import * as THREE from 'three';

/**
 * topology_flow.ts — Topology Flow Discovery Engine
 *
 * Generates 3D topological shapes (signed distance fields), places them inside
 * a flow chamber, runs simplified Navier-Stokes simulation, detects coherent
 * flow patterns ("threads"), and auto-adjusts parameters to amplify discoveries.
 * Also handles prime-based resource redistribution for enclosed ecosystems.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PHI = 1.6180339887;
const PHI_CONJUGATE = 0.6180339887;
const PHI_COMPRESSIVE = 0.3819660113;
const DEFAULT_RES = 16;
const TWO_PI = Math.PI * 2;

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface ShapeField {
  field: Float32Array;
  res: number;
  type: string;
}

export interface FlowThread {
  id: string;
  type: 'vortex' | 'laminar' | 'turbulent' | 'stagnation' | 'jet' | 'recirculation';
  strength: number;
  position: THREE.Vector3;
  direction: THREE.Vector3;
  extent: number;
  stability: number;
  novelty: number;
}

export interface FlowMetrics {
  totalKineticEnergy: number;
  avgVelocity: number;
  maxVorticity: number;
  threadCount: number;
  noveltyScore: number;
  efficiency: number;
}

export interface PrimeSpectrum {
  gaps: number[];
  density: number;
  goldenPhases: {
    compressive: number;
    critical: number;
    elongative: number;
  };
}

export interface RoomSpec {
  area: number;
  windowArea: number;
  orientation: string;
}

export interface CoolingRoomSpec {
  volume: number;
  heatLoad: number;
  hasExteriorWall: boolean;
}

export interface LightingResult {
  room: number;
  solarTubes: number;
  reflectors: number;
  savings: number;
}

export interface CoolingResult {
  room: number;
  strategy: string;
  earthTubeLength: number;
  thermalMassKg: number;
  stackEffectHeight: number;
  savings: number;
}

export interface WaterResult {
  rainwaterCapture: number;
  greywater: number;
  evaporativeCooling: number;
  totalSavings: number;
}

export interface EcosystemMetrics {
  lightingSavingsPercent: number;
  coolingSavingsPercent: number;
  waterSavingsPercent: number;
  totalEnergySavedKWh: number;
  primeResonanceScore: number;
}

export interface FloorplanRoom {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Floorplan {
  rooms: FloorplanRoom[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function idx(x: number, y: number, z: number, res: number): number {
  return x + y * res + z * res * res;
}

function clampInt(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function pseudoRandom(seed: number): () => number {
  let s = seed | 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function generateId(): string {
  return 'thr_' + Math.random().toString(36).substring(2, 10);
}

// ---------------------------------------------------------------------------
// 1. TopologyGenerator
// ---------------------------------------------------------------------------

export class TopologyGenerator {
  /**
   * Generates a 3D scalar field representing a shape via SDF.
   * Negative values = inside the shape, positive = outside.
   */
  generateShape(type: string, resolution: number = DEFAULT_RES): ShapeField {
    const n = resolution;
    const total = n * n * n;
    const field = new Float32Array(total);
    const freq = TWO_PI;

    for (let iz = 0; iz < n; iz++) {
      for (let iy = 0; iy < n; iy++) {
        for (let ix = 0; ix < n; ix++) {
          // Normalize coordinates to [-PI, PI]
          const x = ((ix / (n - 1)) * 2 - 1) * Math.PI;
          const y = ((iy / (n - 1)) * 2 - 1) * Math.PI;
          const z = ((iz / (n - 1)) * 2 - 1) * Math.PI;

          let val = 0;
          switch (type) {
            case 'gyroid': {
              const f = freq / TWO_PI * PHI;
              val = Math.sin(x * f) * Math.cos(y * f)
                  + Math.sin(y * f) * Math.cos(z * f)
                  + Math.sin(z * f) * Math.cos(x * f);
              break;
            }
            case 'schwarz_p': {
              val = Math.cos(x) + Math.cos(y) + Math.cos(z);
              break;
            }
            case 'diamond': {
              val = Math.sin(x) * Math.sin(y) * Math.sin(z)
                  + Math.sin(x) * Math.cos(y) * Math.cos(z)
                  + Math.cos(x) * Math.sin(y) * Math.cos(z)
                  + Math.cos(x) * Math.cos(y) * Math.sin(z);
              break;
            }
            case 'torus': {
              const R = Math.PI * 0.6;  // major radius
              const r = Math.PI * 0.25; // minor radius
              const qx = Math.sqrt(x * x + z * z) - R;
              val = Math.sqrt(qx * qx + y * y) - r;
              break;
            }
            case 'helix': {
              // Helical channel winding around the y-axis
              const helixR = Math.PI * 0.5;
              const helixPitch = 1.5;
              const tubeR = Math.PI * 0.2;
              const theta = Math.atan2(z, x);
              const distFromAxis = Math.sqrt(x * x + z * z);
              const helixY = (theta / TWO_PI) * helixPitch * Math.PI;
              const yWrapped = ((y - helixY) % (helixPitch * Math.PI) + helixPitch * Math.PI * 1.5) % (helixPitch * Math.PI) - helixPitch * Math.PI * 0.5;
              const dx = distFromAxis - helixR;
              val = Math.sqrt(dx * dx + yWrapped * yWrapped) - tubeR;
              break;
            }
            case 'fractal_sponge': {
              // Menger sponge approximation: 3 levels of recursive box removal
              val = -1; // start inside
              const check = (px: number, py: number, pz: number, size: number, depth: number): boolean => {
                if (depth <= 0) return false;
                const third = size / 3;
                // Normalize to sponge coords [0, size]
                const lx = ((px / Math.PI + 1) * 0.5) * size;
                const ly = ((py / Math.PI + 1) * 0.5) * size;
                const lz = ((pz / Math.PI + 1) * 0.5) * size;
                const cx = Math.floor(lx / third) % 3;
                const cy = Math.floor(ly / third) % 3;
                const cz = Math.floor(lz / third) % 3;
                const centerCount = (cx === 1 ? 1 : 0) + (cy === 1 ? 1 : 0) + (cz === 1 ? 1 : 0);
                if (centerCount >= 2) return true; // removed
                return check(px, py, pz, third, depth - 1);
              };
              if (check(x, y, z, 3, 3)) {
                val = 1; // outside (removed material)
              }
              break;
            }
            case 'random_organic': {
              // Perlin-like noise: sum of sines at different frequencies and phases
              const rng = pseudoRandom(42);
              val = 0;
              const octaves = 5;
              let amplitude = 1.0;
              let frequency = 1.0;
              for (let o = 0; o < octaves; o++) {
                const px = rng() * TWO_PI;
                const py = rng() * TWO_PI;
                const pz = rng() * TWO_PI;
                val += amplitude * (
                  Math.sin(x * frequency + px) *
                  Math.sin(y * frequency + py) *
                  Math.sin(z * frequency + pz)
                );
                amplitude *= 0.5;
                frequency *= 2.0;
              }
              break;
            }
            default: {
              // Default sphere SDF
              val = Math.sqrt(x * x + y * y + z * z) - Math.PI * 0.7;
              break;
            }
          }
          field[idx(ix, iy, iz, n)] = val;
        }
      }
    }
    return { field, res: n, type };
  }

  /**
   * Randomly perturbs a shape field to explore nearby topologies.
   */
  mutateShape(shape: ShapeField, mutations: number = 10): ShapeField {
    const n = shape.res;
    const total = n * n * n;
    const newField = new Float32Array(total);
    newField.set(shape.field);

    for (let m = 0; m < mutations; m++) {
      // Pick a random center point
      const cx = Math.random() * n;
      const cy = Math.random() * n;
      const cz = Math.random() * n;
      const radius = 1 + Math.random() * 3;
      const strength = (Math.random() - 0.5) * 0.5;

      for (let iz = 0; iz < n; iz++) {
        for (let iy = 0; iy < n; iy++) {
          for (let ix = 0; ix < n; ix++) {
            const dx = ix - cx;
            const dy = iy - cy;
            const dz = iz - cz;
            const dist2 = dx * dx + dy * dy + dz * dz;
            const r2 = radius * radius;
            if (dist2 < r2) {
              const falloff = 1 - dist2 / r2;
              newField[idx(ix, iy, iz, n)] += strength * falloff * falloff;
            }
          }
        }
      }
    }

    return { field: newField, res: n, type: shape.type + '_mutated' };
  }
}

// ---------------------------------------------------------------------------
// 2. FlowDiscovery
// ---------------------------------------------------------------------------

export class FlowDiscovery {
  private _res: number;
  private _total: number;
  _velocityX: Float32Array;
  _velocityY: Float32Array;
  _velocityZ: Float32Array;
  _pressure: Float32Array;
  _temperature: Float32Array;
  _threads: FlowThread[] = [];

  private _solid: Uint8Array;       // 1 = solid boundary, 0 = fluid
  private _forceX: Float32Array;    // external forcing per cell
  private _forceY: Float32Array;
  private _forceZ: Float32Array;
  private _viscosity: number = 0.01;
  private _diffusion: number = 0.001;
  private _stepCount: number = 0;
  private _previousThreadIds: Set<string> = new Set();

  constructor(resolution: number = DEFAULT_RES) {
    this._res = resolution;
    this._total = resolution * resolution * resolution;

    this._velocityX = new Float32Array(this._total);
    this._velocityY = new Float32Array(this._total);
    this._velocityZ = new Float32Array(this._total);
    this._pressure = new Float32Array(this._total);
    this._temperature = new Float32Array(this._total);
    this._solid = new Uint8Array(this._total);
    this._forceX = new Float32Array(this._total);
    this._forceY = new Float32Array(this._total);
    this._forceZ = new Float32Array(this._total);

    // Initialize with a gentle inflow from the -X face
    const n = this._res;
    for (let iz = 0; iz < n; iz++) {
      for (let iy = 0; iy < n; iy++) {
        const i = idx(0, iy, iz, n);
        this._velocityX[i] = 0.5;
        this._temperature[i] = 0.2;
      }
    }
  }

  /**
   * Places the topology shape as solid boundaries. Inside shape (negative SDF) = solid.
   */
  injectTopology(shape: ShapeField): void {
    const n = this._res;
    const sn = shape.res;

    for (let iz = 0; iz < n; iz++) {
      for (let iy = 0; iy < n; iy++) {
        for (let ix = 0; ix < n; ix++) {
          // Map flow grid to shape grid
          const sx = Math.floor((ix / n) * sn);
          const sy = Math.floor((iy / n) * sn);
          const sz = Math.floor((iz / n) * sn);
          const si = idx(
            clampInt(sx, 0, sn - 1),
            clampInt(sy, 0, sn - 1),
            clampInt(sz, 0, sn - 1),
            sn
          );
          const fi = idx(ix, iy, iz, n);
          // Negative SDF = inside the shape = solid boundary
          this._solid[fi] = shape.field[si] < 0 ? 1 : 0;
          // Zero out velocity in solid regions
          if (this._solid[fi]) {
            this._velocityX[fi] = 0;
            this._velocityY[fi] = 0;
            this._velocityZ[fi] = 0;
          }
        }
      }
    }
  }

  /**
   * Runs one step of simplified Navier-Stokes:
   * 1) Apply external forces
   * 2) Diffusion (viscous)
   * 3) Pressure projection (Jacobi iteration to enforce incompressibility)
   * 4) Velocity advection (semi-Lagrangian)
   * 5) Enforce boundary conditions
   * 6) Temperature advection / diffusion
   */
  step(dt: number = 0.05): void {
    const n = this._res;
    const total = this._total;

    // --- 1) External forces ---
    for (let i = 0; i < total; i++) {
      if (this._solid[i]) continue;
      this._velocityX[i] += this._forceX[i] * dt;
      this._velocityY[i] += this._forceY[i] * dt;
      this._velocityZ[i] += this._forceZ[i] * dt;
      // Buoyancy: temperature drives upward velocity
      this._velocityY[i] += this._temperature[i] * 0.1 * dt;
    }

    // --- 2) Diffusion (Jacobi iteration for viscous diffusion) ---
    const diffRate = this._viscosity * dt;
    if (diffRate > 0) {
      this._diffuseField(this._velocityX, diffRate, 10);
      this._diffuseField(this._velocityY, diffRate, 10);
      this._diffuseField(this._velocityZ, diffRate, 10);
    }

    // --- 3) Pressure projection (enforce divergence-free velocity) ---
    this._pressureProject(20);

    // --- 4) Advection (semi-Lagrangian) ---
    this._velocityX = this._advect(this._velocityX, dt);
    this._velocityY = this._advect(this._velocityY, dt);
    this._velocityZ = this._advect(this._velocityZ, dt);

    // --- 5) Boundary conditions ---
    this._enforceBoundaries();

    // --- 6) Temperature advection and diffusion ---
    const tempDiff = this._diffusion * dt;
    if (tempDiff > 0) {
      this._diffuseField(this._temperature, tempDiff, 10);
    }
    this._temperature = this._advect(this._temperature, dt);

    // Re-apply inflow at -X face
    for (let iz = 0; iz < n; iz++) {
      for (let iy = 0; iy < n; iy++) {
        const i = idx(0, iy, iz, n);
        if (!this._solid[i]) {
          this._velocityX[i] = 0.5;
          this._temperature[i] = 0.2;
        }
      }
    }

    this._stepCount++;
  }

  /**
   * Jacobi diffusion: solves (I - a * Laplacian) * x_new = x_old
   */
  private _diffuseField(field: Float32Array, rate: number, iterations: number): void {
    const n = this._res;
    const a = rate * n * n;
    const tmp = new Float32Array(this._total);

    for (let iter = 0; iter < iterations; iter++) {
      for (let iz = 1; iz < n - 1; iz++) {
        for (let iy = 1; iy < n - 1; iy++) {
          for (let ix = 1; ix < n - 1; ix++) {
            const i = idx(ix, iy, iz, n);
            if (this._solid[i]) { tmp[i] = 0; continue; }
            const neighbors =
              field[idx(ix - 1, iy, iz, n)] +
              field[idx(ix + 1, iy, iz, n)] +
              field[idx(ix, iy - 1, iz, n)] +
              field[idx(ix, iy + 1, iz, n)] +
              field[idx(ix, iy, iz - 1, n)] +
              field[idx(ix, iy, iz + 1, n)];
            tmp[i] = (field[i] + a * neighbors) / (1 + 6 * a);
          }
        }
      }
      field.set(tmp);
    }
  }

  /**
   * Pressure projection via Jacobi iteration.
   * Computes divergence, solves Poisson for pressure, subtracts gradient.
   */
  private _pressureProject(iterations: number): void {
    const n = this._res;
    const h = 1 / n;
    const div = new Float32Array(this._total);
    const p = this._pressure;
    p.fill(0);

    // Compute divergence of velocity
    for (let iz = 1; iz < n - 1; iz++) {
      for (let iy = 1; iy < n - 1; iy++) {
        for (let ix = 1; ix < n - 1; ix++) {
          const i = idx(ix, iy, iz, n);
          if (this._solid[i]) continue;
          div[i] = -0.5 * h * (
            this._velocityX[idx(ix + 1, iy, iz, n)] - this._velocityX[idx(ix - 1, iy, iz, n)] +
            this._velocityY[idx(ix, iy + 1, iz, n)] - this._velocityY[idx(ix, iy - 1, iz, n)] +
            this._velocityZ[idx(ix, iy, iz + 1, n)] - this._velocityZ[idx(ix, iy, iz - 1, n)]
          );
        }
      }
    }

    // Jacobi iteration for pressure Poisson equation
    const pTmp = new Float32Array(this._total);
    for (let iter = 0; iter < iterations; iter++) {
      for (let iz = 1; iz < n - 1; iz++) {
        for (let iy = 1; iy < n - 1; iy++) {
          for (let ix = 1; ix < n - 1; ix++) {
            const i = idx(ix, iy, iz, n);
            if (this._solid[i]) { pTmp[i] = 0; continue; }
            pTmp[i] = (
              div[i] +
              p[idx(ix - 1, iy, iz, n)] +
              p[idx(ix + 1, iy, iz, n)] +
              p[idx(ix, iy - 1, iz, n)] +
              p[idx(ix, iy + 1, iz, n)] +
              p[idx(ix, iy, iz - 1, n)] +
              p[idx(ix, iy, iz + 1, n)]
            ) / 6;
          }
        }
      }
      p.set(pTmp);
    }

    // Subtract pressure gradient from velocity
    for (let iz = 1; iz < n - 1; iz++) {
      for (let iy = 1; iy < n - 1; iy++) {
        for (let ix = 1; ix < n - 1; ix++) {
          const i = idx(ix, iy, iz, n);
          if (this._solid[i]) continue;
          this._velocityX[i] -= 0.5 * (p[idx(ix + 1, iy, iz, n)] - p[idx(ix - 1, iy, iz, n)]) / h;
          this._velocityY[i] -= 0.5 * (p[idx(ix, iy + 1, iz, n)] - p[idx(ix, iy - 1, iz, n)]) / h;
          this._velocityZ[i] -= 0.5 * (p[idx(ix, iy, iz + 1, n)] - p[idx(ix, iy, iz - 1, n)]) / h;
        }
      }
    }

    this._pressure = p;
  }

  /**
   * Semi-Lagrangian advection: trace backwards through velocity field.
   */
  private _advect(field: Float32Array, dt: number): Float32Array {
    const n = this._res;
    const result = new Float32Array(this._total);

    for (let iz = 1; iz < n - 1; iz++) {
      for (let iy = 1; iy < n - 1; iy++) {
        for (let ix = 1; ix < n - 1; ix++) {
          const i = idx(ix, iy, iz, n);
          if (this._solid[i]) { result[i] = 0; continue; }

          // Trace backwards
          let bx = ix - dt * n * this._velocityX[i];
          let by = iy - dt * n * this._velocityY[i];
          let bz = iz - dt * n * this._velocityZ[i];

          // Clamp to grid
          bx = Math.max(0.5, Math.min(n - 1.5, bx));
          by = Math.max(0.5, Math.min(n - 1.5, by));
          bz = Math.max(0.5, Math.min(n - 1.5, bz));

          // Trilinear interpolation
          const ix0 = Math.floor(bx);
          const iy0 = Math.floor(by);
          const iz0 = Math.floor(bz);
          const ix1 = ix0 + 1;
          const iy1 = iy0 + 1;
          const iz1 = iz0 + 1;

          const sx = bx - ix0;
          const sy = by - iy0;
          const sz = bz - iz0;

          result[i] =
            lerp(
              lerp(
                lerp(field[idx(ix0, iy0, iz0, n)], field[idx(ix1, iy0, iz0, n)], sx),
                lerp(field[idx(ix0, iy1, iz0, n)], field[idx(ix1, iy1, iz0, n)], sx),
                sy
              ),
              lerp(
                lerp(field[idx(ix0, iy0, iz1, n)], field[idx(ix1, iy0, iz1, n)], sx),
                lerp(field[idx(ix0, iy1, iz1, n)], field[idx(ix1, iy1, iz1, n)], sx),
                sy
              ),
              sz
            );
        }
      }
    }

    return result;
  }

  /**
   * Enforce no-slip boundary conditions at solid walls and domain edges.
   */
  private _enforceBoundaries(): void {
    const n = this._res;
    for (let iz = 0; iz < n; iz++) {
      for (let iy = 0; iy < n; iy++) {
        for (let ix = 0; ix < n; ix++) {
          const i = idx(ix, iy, iz, n);
          // Solid: zero velocity
          if (this._solid[i]) {
            this._velocityX[i] = 0;
            this._velocityY[i] = 0;
            this._velocityZ[i] = 0;
            continue;
          }
          // Domain edges: open boundary (outflow) on +X, no-slip on +-Y, +-Z
          if (ix === 0 || ix === n - 1) {
            // Inflow handled separately; outflow: copy neighbor
            if (ix === n - 1) {
              this._velocityX[i] = this._velocityX[idx(ix - 1, iy, iz, n)];
            }
          }
          if (iy === 0 || iy === n - 1) {
            this._velocityY[i] = 0;
          }
          if (iz === 0 || iz === n - 1) {
            this._velocityZ[i] = 0;
          }
        }
      }
    }
  }

  /**
   * Compute curl (vorticity) at a point.
   */
  private _curl(ix: number, iy: number, iz: number): THREE.Vector3 {
    const n = this._res;
    const h2 = 2.0 / n;

    const dwdy = (this._velocityZ[idx(ix, Math.min(iy + 1, n - 1), iz, n)] -
                  this._velocityZ[idx(ix, Math.max(iy - 1, 0), iz, n)]) / h2;
    const dvdz = (this._velocityY[idx(ix, iy, Math.min(iz + 1, n - 1), n)] -
                  this._velocityY[idx(ix, iy, Math.max(iz - 1, 0), n)]) / h2;

    const dudz = (this._velocityX[idx(ix, iy, Math.min(iz + 1, n - 1), n)] -
                  this._velocityX[idx(ix, iy, Math.max(iz - 1, 0), n)]) / h2;
    const dwdx = (this._velocityZ[idx(Math.min(ix + 1, n - 1), iy, iz, n)] -
                  this._velocityZ[idx(Math.max(ix - 1, 0), iy, iz, n)]) / h2;

    const dvdx = (this._velocityY[idx(Math.min(ix + 1, n - 1), iy, iz, n)] -
                  this._velocityY[idx(Math.max(ix - 1, 0), iy, iz, n)]) / h2;
    const dudy = (this._velocityX[idx(ix, Math.min(iy + 1, n - 1), iz, n)] -
                  this._velocityX[idx(ix, Math.max(iy - 1, 0), iz, n)]) / h2;

    return new THREE.Vector3(dwdy - dvdz, dudz - dwdx, dvdx - dudy);
  }

  /**
   * Analyzes the velocity field to find coherent flow patterns ("threads").
   */
  detectThreads(): FlowThread[] {
    const n = this._res;
    const threads: FlowThread[] = [];
    const visited = new Uint8Array(this._total);

    // Precompute velocity magnitudes and curl magnitudes
    const velMag = new Float32Array(this._total);
    const curlMag = new Float32Array(this._total);
    let maxVel = 0;
    let maxCurl = 0;

    for (let iz = 1; iz < n - 1; iz++) {
      for (let iy = 1; iy < n - 1; iy++) {
        for (let ix = 1; ix < n - 1; ix++) {
          const i = idx(ix, iy, iz, n);
          if (this._solid[i]) continue;
          const vx = this._velocityX[i];
          const vy = this._velocityY[i];
          const vz = this._velocityZ[i];
          const vm = Math.sqrt(vx * vx + vy * vy + vz * vz);
          velMag[i] = vm;
          if (vm > maxVel) maxVel = vm;

          const c = this._curl(ix, iy, iz);
          const cm = c.length();
          curlMag[i] = cm;
          if (cm > maxCurl) maxCurl = cm;
        }
      }
    }

    if (maxVel < 1e-10) return [];

    const vortexThreshold = maxCurl * 0.4;
    const jetThreshold = maxVel * 0.7;
    const stagnationThreshold = maxVel * 0.05;
    const regionSize = Math.max(2, Math.floor(n / 4));

    // Scan regions
    for (let rz = 1; rz < n - 1; rz += regionSize) {
      for (let ry = 1; ry < n - 1; ry += regionSize) {
        for (let rx = 1; rx < n - 1; rx += regionSize) {
          const endX = Math.min(rx + regionSize, n - 1);
          const endY = Math.min(ry + regionSize, n - 1);
          const endZ = Math.min(rz + regionSize, n - 1);

          let sumVx = 0, sumVy = 0, sumVz = 0;
          let sumVelMag = 0, sumCurlMag = 0;
          let sumVelMag2 = 0;
          let cellCount = 0;
          let maxLocalCurl = 0;
          let maxLocalVel = 0;

          for (let iz = rz; iz < endZ; iz++) {
            for (let iy = ry; iy < endY; iy++) {
              for (let ix = rx; ix < endX; ix++) {
                const i = idx(ix, iy, iz, n);
                if (this._solid[i] || visited[i]) continue;
                sumVx += this._velocityX[i];
                sumVy += this._velocityY[i];
                sumVz += this._velocityZ[i];
                sumVelMag += velMag[i];
                sumVelMag2 += velMag[i] * velMag[i];
                sumCurlMag += curlMag[i];
                if (curlMag[i] > maxLocalCurl) maxLocalCurl = curlMag[i];
                if (velMag[i] > maxLocalVel) maxLocalVel = velMag[i];
                cellCount++;
              }
            }
          }

          if (cellCount < 2) continue;

          const avgVel = sumVelMag / cellCount;
          const avgCurl = sumCurlMag / cellCount;
          const variance = sumVelMag2 / cellCount - (avgVel * avgVel);
          const dirLen = Math.sqrt(sumVx * sumVx + sumVy * sumVy + sumVz * sumVz);
          const alignment = cellCount > 0 ? dirLen / (sumVelMag + 1e-10) : 0;

          const centerX = (rx + endX) * 0.5 / n;
          const centerY = (ry + endY) * 0.5 / n;
          const centerZ = (rz + endZ) * 0.5 / n;
          const pos = new THREE.Vector3(centerX, centerY, centerZ);
          const dir = dirLen > 1e-10
            ? new THREE.Vector3(sumVx / dirLen, sumVy / dirLen, sumVz / dirLen)
            : new THREE.Vector3(1, 0, 0);
          const extent = regionSize / n;

          let threadType: FlowThread['type'] | null = null;
          let strength = 0;

          // Classify by priority
          if (maxLocalCurl > vortexThreshold && avgCurl > vortexThreshold * 0.5) {
            threadType = 'vortex';
            strength = Math.min(1, avgCurl / maxCurl);
          } else if (maxLocalVel > jetThreshold && alignment > 0.7) {
            threadType = 'jet';
            strength = Math.min(1, maxLocalVel / maxVel);
          } else if (avgVel < stagnationThreshold) {
            threadType = 'stagnation';
            strength = Math.min(1, 1 - avgVel / (stagnationThreshold + 1e-10));
          } else if (variance > avgVel * avgVel * 0.5) {
            threadType = 'turbulent';
            strength = Math.min(1, Math.sqrt(variance) / maxVel);
          } else if (alignment > 0.8) {
            threadType = 'laminar';
            strength = Math.min(1, alignment * avgVel / maxVel);
          } else if (alignment < 0.3 && avgVel > stagnationThreshold * 2) {
            threadType = 'recirculation';
            strength = Math.min(1, (1 - alignment) * avgVel / maxVel);
          }

          if (threadType !== null && strength > 0.05) {
            const id = generateId();
            // Stability: how many previous thread types match nearby
            const stability = this._previousThreadIds.size > 0 ? 0.5 + this._stepCount * 0.01 : 0.1;

            // Novelty: how different from already-found threads in this detection
            let minDist = Infinity;
            for (const t of threads) {
              const d = pos.distanceTo(t.position);
              if (d < minDist) minDist = d;
            }
            const novelty = threads.length === 0 ? 1 : Math.min(1, minDist / (extent * 2));

            threads.push({
              id,
              type: threadType,
              strength,
              position: pos,
              direction: dir,
              extent,
              stability: Math.min(1, stability),
              novelty
            });

            // Mark region as visited
            for (let iz = rz; iz < endZ; iz++) {
              for (let iy = ry; iy < endY; iy++) {
                for (let ix = rx; ix < endX; ix++) {
                  visited[idx(ix, iy, iz, n)] = 1;
                }
              }
            }
          }
        }
      }
    }

    // Update tracking
    this._previousThreadIds = new Set(threads.map(t => t.id));
    this._threads = threads;
    return threads;
  }

  /**
   * Adjusts local boundary conditions and forcing to stretch/amplify a discovered thread.
   */
  amplifyThread(threadId: string, factor: number = 1.5): void {
    const thread = this._threads.find(t => t.id === threadId);
    if (!thread) return;

    const n = this._res;
    const center = thread.position;
    const dir = thread.direction;
    const radius = thread.extent * n * 0.5;

    for (let iz = 0; iz < n; iz++) {
      for (let iy = 0; iy < n; iy++) {
        for (let ix = 0; ix < n; ix++) {
          const px = ix / n;
          const py = iy / n;
          const pz = iz / n;
          const dx = px - center.x;
          const dy = py - center.y;
          const dz = pz - center.z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

          if (dist < thread.extent * 1.5) {
            const i = idx(ix, iy, iz, n);
            const falloff = Math.max(0, 1 - dist / (thread.extent * 1.5));
            const amplification = falloff * falloff * (factor - 1);

            if (thread.type === 'vortex') {
              // Add tangential forcing to strengthen the vortex
              const toCenter = new THREE.Vector3(dx, dy, dz).normalize();
              const tangent = new THREE.Vector3().crossVectors(dir, toCenter).normalize();
              this._forceX[i] += tangent.x * amplification * 0.5;
              this._forceY[i] += tangent.y * amplification * 0.5;
              this._forceZ[i] += tangent.z * amplification * 0.5;
            } else if (thread.type === 'jet' || thread.type === 'laminar') {
              // Add directional forcing
              this._forceX[i] += dir.x * amplification * 0.3;
              this._forceY[i] += dir.y * amplification * 0.3;
              this._forceZ[i] += dir.z * amplification * 0.3;
              // Slightly erode nearby solids to widen the channel
              if (this._solid[i] && falloff > 0.6) {
                this._solid[i] = 0;
              }
            } else if (thread.type === 'recirculation') {
              // Add centripetal forcing
              this._forceX[i] -= dx * amplification * 0.2;
              this._forceY[i] -= dy * amplification * 0.2;
              this._forceZ[i] -= dz * amplification * 0.2;
            } else if (thread.type === 'turbulent') {
              // Reduce viscosity nearby to let turbulence develop
              // Implemented via increased local forcing variation
              this._forceX[i] += (Math.sin(ix * PHI) * amplification * 0.1);
              this._forceY[i] += (Math.sin(iy * PHI) * amplification * 0.1);
              this._forceZ[i] += (Math.sin(iz * PHI) * amplification * 0.1);
            }
            // Stagnation: no amplification needed (it is the absence of flow)
          }
        }
      }
    }
  }

  /**
   * Returns aggregate flow metrics.
   */
  getFlowMetrics(): FlowMetrics {
    const n = this._res;
    let totalKE = 0;
    let sumVel = 0;
    let maxVort = 0;
    let usefulFlow = 0;
    let fluidCells = 0;

    for (let iz = 1; iz < n - 1; iz++) {
      for (let iy = 1; iy < n - 1; iy++) {
        for (let ix = 1; ix < n - 1; ix++) {
          const i = idx(ix, iy, iz, n);
          if (this._solid[i]) continue;
          fluidCells++;

          const vx = this._velocityX[i];
          const vy = this._velocityY[i];
          const vz = this._velocityZ[i];
          const v2 = vx * vx + vy * vy + vz * vz;
          totalKE += 0.5 * v2;
          sumVel += Math.sqrt(v2);

          const c = this._curl(ix, iy, iz);
          const cm = c.length();
          if (cm > maxVort) maxVort = cm;

          // "Useful" flow = flow aligned with the primary direction (+X inflow)
          if (vx > 0) usefulFlow += vx;
        }
      }
    }

    const avgVelocity = fluidCells > 0 ? sumVel / fluidCells : 0;
    const efficiency = totalKE > 1e-10 ? usefulFlow / (totalKE * 2 + 1e-10) : 0;

    let noveltyScore = 0;
    for (const t of this._threads) {
      noveltyScore += t.novelty * t.strength;
    }

    return {
      totalKineticEnergy: totalKE,
      avgVelocity,
      maxVorticity: maxVort,
      threadCount: this._threads.length,
      noveltyScore,
      efficiency: Math.min(1, Math.max(0, efficiency))
    };
  }
}

// ---------------------------------------------------------------------------
// 3. PrimeRedistribution
// ---------------------------------------------------------------------------

export class PrimeRedistribution {
  private _spectrum: PrimeSpectrum | null = null;
  private _lightingResults: LightingResult[] = [];
  private _coolingResults: CoolingResult[] = [];
  private _waterResult: WaterResult | null = null;

  /**
   * Captures V8 prime spectrum data for use in optimization.
   */
  injectPrimeSpectrum(spectrum: PrimeSpectrum): void {
    this._spectrum = spectrum;
  }

  /**
   * Uses prime gap patterns to find optimal solar tube placement.
   * Gaps map to window spacing that maximizes diffuse light distribution.
   */
  optimizeLighting(rooms: RoomSpec[]): LightingResult[] {
    const gaps = this._spectrum?.gaps ?? [2, 4, 6, 2, 4, 2, 4, 6, 8, 4];
    const density = this._spectrum?.density ?? 0.15;
    const compressive = this._spectrum?.goldenPhases?.compressive ?? PHI_COMPRESSIVE;

    this._lightingResults = rooms.map((room, i) => {
      // Solar tube count: area-based, modulated by prime gap pattern
      const gapMod = gaps[i % gaps.length] / (Math.max(...gaps) + 1e-10);
      const baseCount = Math.ceil(room.area / 15); // 1 tube per 15 m^2
      const solarTubes = Math.max(1, Math.round(baseCount * (1 + gapMod * compressive)));

      // Reflector count: window-area proportional, prime-density modulated
      const reflectorBase = Math.ceil(room.windowArea / 2);
      const reflectors = Math.max(1, Math.round(reflectorBase * (1 + density * PHI)));

      // Orientation-based savings multiplier
      const orientationMultipliers: Record<string, number> = {
        north: 0.6, south: 1.0, east: 0.8, west: 0.75,
        northeast: 0.7, northwest: 0.65, southeast: 0.9, southwest: 0.85
      };
      const orientMul = orientationMultipliers[room.orientation.toLowerCase()] ?? 0.75;

      // Light savings: % reduction in artificial lighting
      const savings = Math.min(0.85, orientMul * (0.3 + solarTubes * 0.08 + reflectors * 0.05));

      return { room: i, solarTubes, reflectors, savings };
    });

    return this._lightingResults;
  }

  /**
   * Passive cooling optimization using prime density to modulate thermal mass.
   */
  optimizeCooling(rooms: CoolingRoomSpec[]): CoolingResult[] {
    const gaps = this._spectrum?.gaps ?? [2, 4, 6, 2, 4, 2, 4, 6, 8, 4];
    const density = this._spectrum?.density ?? 0.15;
    const elongative = this._spectrum?.goldenPhases?.elongative ?? PHI_CONJUGATE;

    this._coolingResults = rooms.map((room, i) => {
      const gapVal = gaps[i % gaps.length];
      const gapNorm = gapVal / (Math.max(...gaps) + 1e-10);

      // Earth tube length: proportional to heat load, extended by gap pattern
      const earthTubeBase = Math.sqrt(room.heatLoad) * 2; // meters
      const earthTubeLength = Math.round(earthTubeBase * (1 + gapNorm * elongative) * 10) / 10;

      // Thermal mass: prime density modulates kg of mass (concrete/water/PCM)
      const thermalMassBase = room.volume * 5; // 5 kg per m^3 baseline
      const thermalMassKg = Math.round(thermalMassBase * (1 + density * PHI));

      // Stack effect chimney height
      const stackEffectHeight = room.hasExteriorWall
        ? Math.round((3 + room.volume * 0.02 * (1 + gapNorm)) * 10) / 10
        : 0;

      // Strategy selection
      let strategy = 'thermal_mass';
      if (room.hasExteriorWall && room.heatLoad > 2000) {
        strategy = 'earth_tube_plus_stack';
      } else if (room.hasExteriorWall) {
        strategy = 'stack_effect';
      } else if (room.heatLoad > 3000) {
        strategy = 'earth_tube_plus_evaporative';
      }

      // Savings: estimated watts saved vs conventional AC
      const earthTubeSaving = earthTubeLength * 30; // ~30W per meter
      const massSaving = thermalMassKg * 0.05;      // 0.05W per kg (peak shaving)
      const stackSaving = stackEffectHeight * 50;    // 50W per meter height
      const totalSaving = earthTubeSaving + massSaving + stackSaving;
      const savings = Math.min(0.90, totalSaving / (room.heatLoad + 1e-10));

      return {
        room: i,
        strategy,
        earthTubeLength,
        thermalMassKg,
        stackEffectHeight,
        savings
      };
    });

    return this._coolingResults;
  }

  /**
   * Water harvesting and recycling optimization.
   */
  optimizeWater(floorArea: number, roofArea: number, occupants: number): WaterResult {
    const density = this._spectrum?.density ?? 0.15;
    const critical = this._spectrum?.goldenPhases?.critical ?? 1.0;

    // Rainwater capture: liters/year. Assume 800mm annual rainfall, collection efficiency 0.8
    const annualRainfall = 0.8; // meters
    const collectionEff = 0.8 * (1 + density * PHI_COMPRESSIVE);
    const rainwaterCapture = Math.round(roofArea * annualRainfall * collectionEff * 1000);

    // Greywater recycling: liters/day. Shower + sink = ~80L/person/day, reclaim 60%
    const dailyGrey = occupants * 80 * 0.6 * (1 + critical * 0.1);
    const greywater = Math.round(dailyGrey * 365);

    // Evaporative cooling water budget: liters/year
    const coolingDays = 120; // estimated hot days per year
    const evapRate = floorArea * 0.01; // liters per m^2 per day
    const evaporativeCooling = Math.round(evapRate * coolingDays);

    // Total savings vs mains water (liters/year)
    const conventionalUse = occupants * 200 * 365; // 200 L/person/day
    const totalSavings = Math.min(0.85, (rainwaterCapture + greywater) / (conventionalUse + 1e-10));

    this._waterResult = {
      rainwaterCapture,
      greywater,
      evaporativeCooling,
      totalSavings
    };

    return this._waterResult;
  }

  /**
   * Redistributes an energy field using prime gap patterns.
   * Energy accumulates at prime-gap positions creating natural resonance points.
   */
  redistributePrimes(energyField: Float32Array, resolution: number): Float32Array {
    const gaps = this._spectrum?.gaps ?? [2, 4, 6, 2, 4, 2, 4, 6, 8, 4];
    const n = resolution;
    const total = n * n * n;
    const output = new Float32Array(total);
    output.set(energyField);

    // Build prime-gap accumulation mask
    const mask = new Float32Array(total);
    let gapIdx = 0;
    let pos = 0;

    // Lay prime gaps along a space-filling curve (simple raster with golden ratio skip)
    while (pos < total) {
      const gap = gaps[gapIdx % gaps.length];
      pos += gap;
      if (pos < total) {
        mask[pos] = 1;
      }
      gapIdx++;
    }

    // Smooth the mask with a 3D kernel so energy flows toward resonance points
    const smoothMask = new Float32Array(total);
    const kernelR = 2;
    for (let iz = 0; iz < n; iz++) {
      for (let iy = 0; iy < n; iy++) {
        for (let ix = 0; ix < n; ix++) {
          let sum = 0;
          let count = 0;
          for (let dz = -kernelR; dz <= kernelR; dz++) {
            for (let dy = -kernelR; dy <= kernelR; dy++) {
              for (let dx = -kernelR; dx <= kernelR; dx++) {
                const nx = ix + dx;
                const ny = iy + dy;
                const nz = iz + dz;
                if (nx >= 0 && nx < n && ny >= 0 && ny < n && nz >= 0 && nz < n) {
                  sum += mask[idx(nx, ny, nz, n)];
                  count++;
                }
              }
            }
          }
          smoothMask[idx(ix, iy, iz, n)] = sum / count;
        }
      }
    }

    // Redistribute: shift energy toward high-mask regions
    const totalEnergy = energyField.reduce((a, b) => a + b, 0);
    if (totalEnergy < 1e-10) return output;

    let maskSum = 0;
    for (let i = 0; i < total; i++) {
      maskSum += smoothMask[i];
    }

    if (maskSum < 1e-10) return output;

    // Blend: keep some original distribution, shift some toward prime pattern
    const blendFactor = PHI_COMPRESSIVE; // 38.2% shifted to prime resonance
    for (let i = 0; i < total; i++) {
      const original = energyField[i];
      const primePortion = (smoothMask[i] / maskSum) * totalEnergy;
      output[i] = original * (1 - blendFactor) + primePortion * blendFactor;
    }

    return output;
  }

  /**
   * Returns metrics on ecosystem savings.
   */
  getEcosystemMetrics(): EcosystemMetrics {
    let lightingSavings = 0;
    if (this._lightingResults.length > 0) {
      lightingSavings = this._lightingResults.reduce((s, r) => s + r.savings, 0) / this._lightingResults.length;
    }

    let coolingSavings = 0;
    if (this._coolingResults.length > 0) {
      coolingSavings = this._coolingResults.reduce((s, r) => s + r.savings, 0) / this._coolingResults.length;
    }

    const waterSavings = this._waterResult?.totalSavings ?? 0;

    // Estimated energy saved: lighting ~2 kWh/m^2/year saved per % reduction
    const lightEnergy = lightingSavings * 200;  // rough kWh
    const coolEnergy = coolingSavings * 500;    // cooling is biggest load
    const totalEnergySavedKWh = lightEnergy + coolEnergy;

    // Prime resonance score: how well the prime spectrum aligned with optimizations
    const gaps = this._spectrum?.gaps ?? [];
    const gapVariance = gaps.length > 1
      ? gaps.reduce((s, g) => s + (g - gaps.reduce((a, b) => a + b, 0) / gaps.length) ** 2, 0) / gaps.length
      : 0;
    const primeResonanceScore = Math.min(1, Math.sqrt(gapVariance) * PHI_CONJUGATE * 0.5);

    return {
      lightingSavingsPercent: Math.round(lightingSavings * 100),
      coolingSavingsPercent: Math.round(coolingSavings * 100),
      waterSavingsPercent: Math.round(waterSavings * 100),
      totalEnergySavedKWh: Math.round(totalEnergySavedKWh),
      primeResonanceScore: Math.round(primeResonanceScore * 1000) / 1000
    };
  }
}

// ---------------------------------------------------------------------------
// 4. NaturalSystemsDesigner
// ---------------------------------------------------------------------------

export class NaturalSystemsDesigner {
  private _topoGen: TopologyGenerator;
  private _flowDisc: FlowDiscovery;
  private _primeRedist: PrimeRedistribution;
  private _lightDesign: any = null;
  private _coolDesign: any = null;
  private _waterDesign: any = null;
  private _novelFlowResult: { topology: ShapeField; threads: FlowThread[] } | null = null;

  constructor(resolution: number = DEFAULT_RES) {
    this._topoGen = new TopologyGenerator();
    this._flowDisc = new FlowDiscovery(resolution);
    this._primeRedist = new PrimeRedistribution();
  }

  /**
   * Returns optimal light tube positions, reflector angles, and window modifications.
   */
  designNaturalLighting(floorplan: Floorplan): {
    tubes: { x: number; y: number; diameter: number; angle: number }[];
    reflectors: { x: number; y: number; angle: number; width: number }[];
    windowMods: { room: number; action: string; detail: string }[];
  } {
    const tubes: { x: number; y: number; diameter: number; angle: number }[] = [];
    const reflectors: { x: number; y: number; angle: number; width: number }[] = [];
    const windowMods: { room: number; action: string; detail: string }[] = [];

    floorplan.rooms.forEach((room, i) => {
      const cx = room.x + room.w / 2;
      const cy = room.y + room.h / 2;
      const area = room.w * room.h;

      // Place tubes using golden ratio spiral from center
      const tubeCount = Math.max(1, Math.ceil(area / 15));
      for (let t = 0; t < tubeCount; t++) {
        const angle = t * PHI * TWO_PI;
        const radius = Math.sqrt(t / tubeCount) * Math.min(room.w, room.h) * 0.4;
        tubes.push({
          x: cx + Math.cos(angle) * radius,
          y: cy + Math.sin(angle) * radius,
          diameter: 0.3 + area * 0.002, // 30-50cm diameter
          angle: 0 // vertical
        });
      }

      // Place reflectors along edges
      const reflCount = Math.ceil((room.w + room.h) * 2 / 3);
      for (let r = 0; r < reflCount; r++) {
        const frac = r / reflCount;
        const perimeter = (room.w + room.h) * 2;
        const pos = frac * perimeter;
        let rx: number, ry: number, ra: number;

        if (pos < room.w) {
          rx = room.x + pos; ry = room.y; ra = 0;
        } else if (pos < room.w + room.h) {
          rx = room.x + room.w; ry = room.y + (pos - room.w); ra = Math.PI * 0.5;
        } else if (pos < room.w * 2 + room.h) {
          rx = room.x + room.w - (pos - room.w - room.h); ry = room.y + room.h; ra = Math.PI;
        } else {
          rx = room.x; ry = room.y + room.h - (pos - room.w * 2 - room.h); ra = Math.PI * 1.5;
        }

        reflectors.push({
          x: rx,
          y: ry,
          angle: ra + PHI_COMPRESSIVE, // tilt toward golden angle for diffuse spread
          width: 0.5
        });
      }

      // Window modifications
      if (area > 20) {
        windowMods.push({
          room: i,
          action: 'add_clerestory',
          detail: `High window at ${room.y}m, width ${room.w * 0.6}m for deep daylight penetration`
        });
      }
      if (area < 10) {
        windowMods.push({
          room: i,
          action: 'add_light_shelf',
          detail: `Horizontal reflector at 2.1m height to bounce light to ceiling`
        });
      }
    });

    this._lightDesign = { tubes, reflectors, windowMods };
    return { tubes, reflectors, windowMods };
  }

  /**
   * Returns earth tube paths, thermal mass placement, chimney positions, vent topology.
   */
  designPassiveCooling(floorplan: Floorplan, climate: string = 'temperate'): {
    earthTubes: { path: { x: number; y: number }[]; depth: number; diameter: number }[];
    thermalMass: { room: number; type: string; kg: number; position: string }[];
    chimneys: { x: number; y: number; height: number; diameter: number }[];
    vents: { room: number; type: string; position: string; area: number }[];
  } {
    const climateMultipliers: Record<string, number> = {
      tropical: 1.4, arid: 1.2, temperate: 1.0, continental: 0.9, polar: 0.6
    };
    const climateMul = climateMultipliers[climate] ?? 1.0;

    const earthTubes: { path: { x: number; y: number }[]; depth: number; diameter: number }[] = [];
    const thermalMass: { room: number; type: string; kg: number; position: string }[] = [];
    const chimneys: { x: number; y: number; height: number; diameter: number }[] = [];
    const vents: { room: number; type: string; position: string; area: number }[] = [];

    // Earth tube network: one main trunk + branches to each room
    const buildingCenterX = floorplan.rooms.reduce((s, r) => s + r.x + r.w / 2, 0) / floorplan.rooms.length;
    const buildingCenterY = floorplan.rooms.reduce((s, r) => s + r.y + r.h / 2, 0) / floorplan.rooms.length;

    floorplan.rooms.forEach((room, i) => {
      const cx = room.x + room.w / 2;
      const cy = room.y + room.h / 2;
      const area = room.w * room.h;

      // Earth tube path from building perimeter to room
      const tubeLength = Math.sqrt((cx - buildingCenterX) ** 2 + (cy - buildingCenterY) ** 2) + 5;
      earthTubes.push({
        path: [
          { x: buildingCenterX - 5 * climateMul, y: buildingCenterY },
          { x: buildingCenterX, y: buildingCenterY },
          { x: cx, y: cy }
        ],
        depth: 2 + climateMul * 0.5, // meters underground
        diameter: 0.15 + area * 0.002
      });

      // Thermal mass
      const massKg = Math.round(area * 50 * climateMul); // 50 kg/m^2 base, climate adjusted
      const massType = climate === 'arid' ? 'rammed_earth' : 'concrete_with_pcm';
      thermalMass.push({
        room: i,
        type: massType,
        kg: massKg,
        position: 'floor_and_interior_walls'
      });

      // Stack effect chimney for larger rooms
      if (area > 12) {
        chimneys.push({
          x: cx + room.w * 0.3,
          y: cy + room.h * 0.3,
          height: 3 + area * 0.05 * climateMul,
          diameter: 0.3 + area * 0.005
        });
      }

      // Vents: low inlet, high outlet for stack effect
      vents.push({
        room: i,
        type: 'inlet',
        position: 'low_wall_north',
        area: Math.max(0.05, area * 0.01 * climateMul)
      });
      vents.push({
        room: i,
        type: 'outlet',
        position: 'high_wall_south',
        area: Math.max(0.05, area * 0.015 * climateMul)
      });
    });

    this._coolDesign = { earthTubes, thermalMass, chimneys, vents };
    return { earthTubes, thermalMass, chimneys, vents };
  }

  /**
   * Rainwater collection, greywater paths, evaporative cooling zones.
   */
  designWaterSystem(floorplan: Floorplan, roofArea: number): {
    collection: { x: number; y: number; tankLiters: number }[];
    greywaterPaths: { from: string; to: string; litersPerDay: number }[];
    evapZones: { x: number; y: number; w: number; h: number; type: string }[];
  } {
    const totalFloorArea = floorplan.rooms.reduce((s, r) => s + r.w * r.h, 0);

    // Collection tanks: positioned near downspout locations (building corners)
    const minX = Math.min(...floorplan.rooms.map(r => r.x));
    const maxX = Math.max(...floorplan.rooms.map(r => r.x + r.w));
    const minY = Math.min(...floorplan.rooms.map(r => r.y));
    const maxY = Math.max(...floorplan.rooms.map(r => r.y + r.h));

    const tankCapacity = Math.round(roofArea * 50); // 50L per m^2 of roof
    const collection = [
      { x: minX - 1, y: minY - 1, tankLiters: Math.round(tankCapacity * 0.3) },
      { x: maxX + 1, y: minY - 1, tankLiters: Math.round(tankCapacity * 0.3) },
      { x: minX - 1, y: maxY + 1, tankLiters: Math.round(tankCapacity * 0.2) },
      { x: maxX + 1, y: maxY + 1, tankLiters: Math.round(tankCapacity * 0.2) }
    ];

    // Greywater paths
    const greywaterPaths = [
      { from: 'shower', to: 'toilet_flush', litersPerDay: Math.round(totalFloorArea * 0.3) },
      { from: 'kitchen_sink', to: 'garden_irrigation', litersPerDay: Math.round(totalFloorArea * 0.15) },
      { from: 'laundry', to: 'toilet_flush', litersPerDay: Math.round(totalFloorArea * 0.2) },
      { from: 'overflow', to: 'evaporative_cooling', litersPerDay: Math.round(totalFloorArea * 0.1) }
    ];

    // Evaporative cooling zones: position on south and west facing areas
    const evapZones = [
      {
        x: minX, y: maxY + 0.5,
        w: (maxX - minX), h: 1.5,
        type: 'misting_wall'
      },
      {
        x: maxX + 0.5, y: minY,
        w: 1.5, h: (maxY - minY),
        type: 'wetted_pad'
      }
    ];

    this._waterDesign = { collection, greywaterPaths, evapZones };
    return { collection, greywaterPaths, evapZones };
  }

  /**
   * Runs flow discovery N times, mutating topology each iteration,
   * keeping the best threads. Returns optimized topology + discovered threads.
   */
  findNovelFlows(topology: ShapeField, iterations: number = 20): {
    topology: ShapeField;
    threads: FlowThread[];
    metrics: FlowMetrics;
  } {
    let bestTopology = topology;
    let bestThreads: FlowThread[] = [];
    let bestScore = -Infinity;
    let bestMetrics: FlowMetrics = {
      totalKineticEnergy: 0, avgVelocity: 0, maxVorticity: 0,
      threadCount: 0, noveltyScore: 0, efficiency: 0
    };

    const gen = this._topoGen;

    for (let iter = 0; iter < iterations; iter++) {
      // Mutate topology (more mutations as iterations progress for exploration)
      const mutationCount = 3 + Math.floor(iter * PHI_CONJUGATE);
      const candidate = iter === 0 ? topology : gen.mutateShape(bestTopology, mutationCount);

      // Create a fresh flow discovery instance for clean simulation
      const flow = new FlowDiscovery(candidate.res);
      flow.injectTopology(candidate);

      // Run several simulation steps to develop flow patterns
      const simSteps = 15 + Math.floor(iter * 0.5);
      for (let s = 0; s < simSteps; s++) {
        flow.step(0.05);
      }

      // Detect threads
      const threads = flow.detectThreads();
      const metrics = flow.getFlowMetrics();

      // Score: weighted combination of thread count, novelty, diversity, and efficiency
      const typeSet = new Set(threads.map(t => t.type));
      const diversityBonus = typeSet.size * 0.3;
      const score = metrics.noveltyScore * PHI
                  + metrics.threadCount * 0.5
                  + diversityBonus
                  + metrics.efficiency * 2
                  + metrics.maxVorticity * 0.1;

      if (score > bestScore) {
        bestScore = score;
        bestTopology = candidate;
        bestThreads = threads;
        bestMetrics = metrics;
      }

      // Amplify the best threads found so far in the main flow discovery
      if (threads.length > 0) {
        // Pick the most novel thread to amplify
        const bestThread = threads.reduce((a, b) => a.novelty * a.strength > b.novelty * b.strength ? a : b);
        flow.amplifyThread(bestThread.id, 1.3 + iter * 0.05);
      }
    }

    this._novelFlowResult = { topology: bestTopology, threads: bestThreads };

    return {
      topology: bestTopology,
      threads: bestThreads,
      metrics: bestMetrics
    };
  }

  /**
   * Comprehensive report of all natural systems designed.
   */
  getDesignReport(): {
    lighting: any;
    cooling: any;
    water: any;
    novelFlows: { threadCount: number; types: string[]; bestTopologyType: string } | null;
    ecosystem: EcosystemMetrics;
  } {
    const novelFlows = this._novelFlowResult
      ? {
          threadCount: this._novelFlowResult.threads.length,
          types: [...new Set(this._novelFlowResult.threads.map(t => t.type))],
          bestTopologyType: this._novelFlowResult.topology.type
        }
      : null;

    return {
      lighting: this._lightDesign,
      cooling: this._coolDesign,
      water: this._waterDesign,
      novelFlows,
      ecosystem: this._primeRedist.getEcosystemMetrics()
    };
  }
}
