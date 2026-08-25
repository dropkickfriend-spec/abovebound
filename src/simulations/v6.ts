import * as THREE from 'three';
import type { DetectedLoop, MembraneState, MembraneType, BoundaryPlane } from './v5';
import type { V5Engine } from './v5';
import type { Edge } from './v3';
import type { Stabilization } from './v1';

/**
 * V6 — Detailed Flow Channel Renderer
 *
 * References the ENTIRE chain: V1 stabilizations, V3/V4 MST edges, V5 boundary planes.
 * Simulates and renders detailed flow THROUGH the architectural channels defined by V5:
 *
 *   Thermal:    Spiral heat flow along exchanger walls, room convection,
 *               temperature gradient rendering on wall/floor surfaces
 *   Electrical: Current density on PCB layers, via column signal propagation,
 *               impedance coloring, signal wave animation
 *   Blockchain: Data packet routing along radial channels, broadcast waves,
 *               throughput heatmap on partition surfaces
 *   Math:       Abstract flow along manifold surfaces, topological current
 *
 * Can REQUEST membrane state changes (open/close/shrink/grow) via V5 callbacks.
 * Reports flow metrics to V7 for meta-optimization.
 */

export type FlowCategory = 'thermal' | 'electrical' | 'blockchain' | 'math';

export interface ImpedanceParams {
  traceWidth_mm: number;
  traceThickness_mm: number;
  dielectricConstant: number;
  substrateHeight_mm: number;
  frequency_GHz: number;
  Z0: number;
  propagationDelay_ps_mm: number;
  loss_dB_mm: number;
}

export interface FlowPath {
  loopIndices: number[];
  flowRate: number;
  resistance: number;
  bottleneckIndex: number;
  direction: THREE.Vector3;
  impedance?: ImpedanceParams;
}

export interface FlowMetrics {
  totalFlow: number;
  avgResistance: number;
  bottleneckCount: number;
  efficiency: number;
  pathCount: number;
  membranesModified: number;
  avgImpedance?: number;
  impedanceMismatch?: number;
  maxPropDelay?: number;
}

export interface MembraneRequest {
  loopIndex: number;
  requestedState: MembraneState;
  reason: string;
}

export class V6Engine {
  scene: THREE.Scene;

  // Visual elements (kept for App.tsx compat)
  flowLines: THREE.LineSegments;
  flowParticles: THREE.Points;
  heatmapPoints: THREE.Points;

  // ── THERMAL GRID ──
  thermalGrid: THREE.Points;
  private _gridSize: number = 12;
  private _thermalField: Float32Array = new Float32Array(1728);
  private _thermalFlux: Float32Array = new Float32Array(1728);
  private _solidMask: Uint8Array = new Uint8Array(1728);
  private _T_AMBIENT: number = 298;
  private _thermalAlpha: number = 0.012;

  // NEW: Detailed architectural flow rendering
  spiralFlowGroup: THREE.Group;       // Spiral heat flow particles + trails
  channelFlowGroup: THREE.Group;      // Flow arrows in channels between walls
  surfaceGradientGroup: THREE.Group;  // Temperature/density gradients ON surfaces
  signalWaveGroup: THREE.Group;       // Signal propagation waves (electrical)

  // Chain references
  stabilizations: Stabilization[] = [];
  mstEdgesV3: Edge[] = [];
  mstEdgesV4: Edge[] = [];
  loops: DetectedLoop[] = [];
  boundaryPlanes: BoundaryPlane[] = [];

  // Flow state
  flowPaths: FlowPath[] = [];
  metrics: FlowMetrics = { totalFlow: 0, avgResistance: 0, bottleneckCount: 0, efficiency: 0, pathCount: 0, membranesModified: 0 };
  pendingRequests: MembraneRequest[] = [];

  private _flowField: Float32Array = new Float32Array(0);
  private _resistanceField: Float32Array = new Float32Array(0);

  // Spiral flow particles (thermal mode)
  private _spiralParticles: { pos: THREE.Vector3; vel: THREE.Vector3; angle: number; radius: number; temp: number }[] = [];

  // Channel flow particles (all modes)
  private _channelParticles: { pos: THREE.Vector3; vel: THREE.Vector3; target: number; pathIdx: number; energy: number }[] = [];

  // Signal wave state (electrical)
  private _signalPhase: number = 0;

  private _captured: boolean = false;
  private _framesSinceCapture: number = 0;
  private _category: FlowCategory = 'thermal';
  private _thermalMode: string = 'cooling';
  private _desiredDirection: THREE.Vector3 = new THREE.Vector3(0, 1, 0);
  private _frameCount: number = 0;
  private _bounds: number = 2.0;
  private _captureSignature: string = '';
  private _boundarySignature: string = '';

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Legacy flow path lines
    const flowGeo = new THREE.BufferGeometry();
    const flowMat = new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending,
    });
    this.flowLines = new THREE.LineSegments(flowGeo, flowMat);
    this.scene.add(this.flowLines);

    // Thermal grid
    const gridGeo = new THREE.BufferGeometry();
    const gridMat = new THREE.PointsMaterial({
      size: 0.1, vertexColors: true, transparent: true, opacity: 0.35,
    });
    this.thermalGrid = new THREE.Points(gridGeo, gridMat);
    this.scene.add(this.thermalGrid);
    this._initThermalGrid();

    // Channel flow particles
    const ptGeo = new THREE.BufferGeometry();
    const ptMat = new THREE.PointsMaterial({
      size: 0.04, vertexColors: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending,
    });
    this.flowParticles = new THREE.Points(ptGeo, ptMat);
    this.scene.add(this.flowParticles);

    // Heatmap at membrane centers
    const heatGeo = new THREE.BufferGeometry();
    const heatMat = new THREE.PointsMaterial({
      size: 0.12, vertexColors: true, transparent: true, opacity: 0.5,
    });
    this.heatmapPoints = new THREE.Points(heatGeo, heatMat);
    this.scene.add(this.heatmapPoints);

    // NEW: architectural flow groups
    this.spiralFlowGroup = new THREE.Group();
    this.scene.add(this.spiralFlowGroup);

    this.channelFlowGroup = new THREE.Group();
    this.scene.add(this.channelFlowGroup);

    this.surfaceGradientGroup = new THREE.Group();
    this.scene.add(this.surfaceGradientGroup);

    this.signalWaveGroup = new THREE.Group();
    this.scene.add(this.signalWaveGroup);
  }

  captureChain(
    v1Stabilizations: Stabilization[],
    v3MSTEdges: Edge[], v3Nodes: THREE.Vector3[],
    v4MSTEdges: Edge[], v4Nodes: THREE.Vector3[],
    v5Loops: DetectedLoop[],
    category: FlowCategory,
    thermalMode: string = 'cooling'
  ) {
    const signature = [
      category,
      thermalMode,
      `s:${v1Stabilizations.length}`,
      `e:${v3MSTEdges.length}:${v4MSTEdges.length}`,
      ...v5Loops.map(loop => `${loop.nodeIndices.join(',')}:${loop.membraneType}:${loop.state}`),
    ].join('|');
    if (signature === this._captureSignature) return;
    this._captureSignature = signature;
    this.stabilizations = v1Stabilizations;
    this.mstEdgesV3 = v3MSTEdges;
    this.mstEdgesV4 = v4MSTEdges;
    this.loops = v5Loops.map(l => ({ ...l }));
    this._category = category;
    this._thermalMode = thermalMode;

    this._setDesiredDirection(category, thermalMode);

    const N = this.loops.length;
    this._flowField = new Float32Array(N);
    this._resistanceField = new Float32Array(N);

    for (let i = 0; i < N; i++) {
      this._resistanceField[i] = this._computeResistance(this.loops[i], category);
    }

    this._T_AMBIENT = thermalMode === 'cooling' ? 293 : 313;
    this._mapMembranesToGrid();
    this._findFlowPaths();
    this._initChannelParticles();

    if (category === 'thermal') this._initSpiralParticles();

    this._captured = true;
    this._framesSinceCapture = 0;
  }

  /** Capture V5's architectural boundary planes for detailed rendering */
  captureBoundaryPlanes(planes: BoundaryPlane[]) {
    const signature = planes
      .map(p => `${p.id}:${p.role}:${p.membraneType}:${p.state}:${p.width.toFixed(3)}:${p.height.toFixed(3)}`)
      .join('|');
    if (signature === this._boundarySignature) return;
    this._boundarySignature = signature;
    this.boundaryPlanes = planes.map(p => ({ ...p }));
    this._buildSurfaceGradients();
  }

  private _setDesiredDirection(category: FlowCategory, thermalMode: string) {
    switch (category) {
      case 'thermal':
        this._desiredDirection = thermalMode === 'cooling'
          ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, -1, 0);
        break;
      case 'electrical':
        this._desiredDirection = new THREE.Vector3(1, 0, 0);
        break;
      case 'blockchain':
        this._desiredDirection = new THREE.Vector3(0, 0, 0);
        break;
      default:
        this._desiredDirection = new THREE.Vector3(0, 1, 0);
    }
  }

  private _computeResistance(loop: DetectedLoop, category: FlowCategory): number {
    const baseResistance = 1.0 / (loop.area + 0.01);
    switch (category) {
      case 'thermal': {
        const m: Record<MembraneType, number> = { propagating: 0.2, hollow: 1.0, insulating: 5.0 };
        return baseResistance * m[loop.membraneType];
      }
      case 'electrical': {
        const imp = this._computeImpedance(loop);
        const mismatch = Math.abs(imp.Z0 - 50) / 50;
        const loss = imp.loss_dB_mm * (loop.perimeter / 3);
        return (mismatch * 5.0 + loss * 2.0 + 0.1) * baseResistance;
      }
      case 'blockchain': {
        const m: Record<MembraneType, number> = { propagating: 0.3, hollow: 0.8, insulating: 2.0 };
        return baseResistance * m[loop.membraneType];
      }
      default: return baseResistance;
    }
  }

  private _computeImpedance(loop: DetectedLoop): ImpedanceParams {
    const area = loop.area;
    const perimeter = loop.perimeter;
    const traceWidth = Math.max(0.1, Math.min(2.0, area * 3.0));
    const traceThickness = 0.035;
    const substrateHeight = 1.6;
    let dielectricConstant: number;
    switch (loop.membraneType) {
      case 'propagating': dielectricConstant = 3.5; break;
      case 'insulating': dielectricConstant = 4.5; break;
      case 'hollow': dielectricConstant = 1.0; break;
    }
    const frequency = Math.max(0.1, Math.min(10, 2.0 / (perimeter + 0.1)));
    const w = traceWidth, t = traceThickness, h = substrateHeight, er = dielectricConstant;
    let Z0: number;
    const ratio = w / h;
    if (ratio <= 1) {
      const eff = (er + 1) / 2 + ((er - 1) / 2) * (1 / Math.sqrt(1 + 12 * h / w));
      Z0 = (60 / Math.sqrt(eff)) * Math.log(8 * h / w + w / (4 * h));
    } else {
      const eff = (er + 1) / 2 + ((er - 1) / 2) * (1 / Math.sqrt(1 + 12 * h / w));
      Z0 = (120 * Math.PI) / (Math.sqrt(eff) * (ratio + 1.393 + 0.667 * Math.log(ratio + 1.444)));
    }
    const propagationDelay = 3.336 * Math.sqrt(0.475 * er + 0.67);
    const sigma = 5.8e7;
    const mu0 = 4 * Math.PI * 1e-7;
    const Rs = Math.sqrt(Math.PI * frequency * 1e9 * mu0 / sigma);
    const loss = (8.686 * Rs) / (Z0 * w * 1e-3);
    return { traceWidth_mm: traceWidth, traceThickness_mm: traceThickness, dielectricConstant,
      substrateHeight_mm: substrateHeight, frequency_GHz: frequency, Z0,
      propagationDelay_ps_mm: propagationDelay, loss_dB_mm: loss };
  }

  // ── FLOW PATHS ──

  private _findFlowPaths() {
    this.flowPaths = [];
    const N = this.loops.length;
    if (N < 2) return;

    const adj: Set<number>[] = Array.from({ length: N }, () => new Set());
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const shared = this.loops[i].nodeIndices.filter(n => this.loops[j].nodeIndices.includes(n));
        if (shared.length >= 2) { adj[i].add(j); adj[j].add(i); continue; }
        const d = this.loops[i].center.distanceTo(this.loops[j].center);
        if (d < 1.5) { adj[i].add(j); adj[j].add(i); }
      }
    }

    const scored = this.loops.map((l, i) => ({
      index: i,
      score: this._category === 'blockchain' ? -l.center.length() : l.center.dot(this._desiredDirection),
    }));
    scored.sort((a, b) => a.score - b.score);

    const visited = new Set<number>();
    const maxPaths = Math.min(30, N);

    for (const start of scored) {
      if (visited.has(start.index) || this.flowPaths.length >= maxPaths) continue;
      if (this.loops[start.index].state === 'open') continue;

      const path: number[] = [];
      const queue = [start.index];
      const pathVisited = new Set<number>();

      while (queue.length > 0) {
        const curr = queue.shift()!;
        if (pathVisited.has(curr)) continue;
        pathVisited.add(curr); visited.add(curr); path.push(curr);
        for (const next of adj[curr]) {
          if (pathVisited.has(next) || this.loops[next].state === 'open') continue;
          const cs = this._category === 'blockchain' ? this.loops[curr].center.length() : this.loops[curr].center.dot(this._desiredDirection);
          const ns = this._category === 'blockchain' ? this.loops[next].center.length() : this.loops[next].center.dot(this._desiredDirection);
          if (ns >= cs - 0.1) queue.push(next);
        }
      }

      if (path.length >= 2) {
        const totalR = path.reduce((sum, i) => sum + this._resistanceField[i], 0);
        const bottleneck = path.reduce((worst, i) => this._resistanceField[i] > this._resistanceField[worst] ? i : worst, path[0]);
        const dir = new THREE.Vector3().subVectors(
          this.loops[path[path.length - 1]].center, this.loops[path[0]].center
        ).normalize();
        this.flowPaths.push({ loopIndices: path, flowRate: 1.0 / (totalR + 0.01), resistance: totalR, bottleneckIndex: bottleneck, direction: dir });
      }
    }
  }

  // ── SPIRAL FLOW PARTICLES (thermal) ──

  private _initSpiralParticles() {
    this._spiralParticles = [];
    const count = 120;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 * 3.5; // 3.5 turns
      const radius = 0.3 + (angle / (Math.PI * 2 * 3.5)) * 1.2;
      const x = radius * Math.cos(angle);
      const z = radius * Math.sin(angle);
      const y = (Math.random() - 0.5) * 0.8;
      this._spiralParticles.push({
        pos: new THREE.Vector3(x, y, z),
        vel: new THREE.Vector3(),
        angle, radius,
        temp: this._T_AMBIENT + (Math.random() - 0.5) * 10,
      });
    }
  }

  private _updateSpiralParticles(compressionLevel: number) {
    const speed = 0.015 * compressionLevel;
    const isHeating = this._thermalMode === 'heating';

    for (const p of this._spiralParticles) {
      // Move along spiral: increase angle
      p.angle += speed;
      const maxAngle = Math.PI * 2 * 3.5;
      if (p.angle > maxAngle) p.angle -= maxAngle;

      const t = p.angle / maxAngle;
      const targetR = 0.3 + t * 1.2;
      p.radius += (targetR - p.radius) * 0.05;

      const targetX = p.radius * Math.cos(p.angle);
      const targetZ = p.radius * Math.sin(p.angle);
      p.vel.set(targetX - p.pos.x, 0, targetZ - p.pos.z).multiplyScalar(0.15);
      p.pos.add(p.vel);

      // Vertical convection: hot rises, cold sinks
      if (isHeating) {
        p.pos.y += (p.temp > this._T_AMBIENT ? 0.003 : -0.002) * compressionLevel;
      } else {
        p.pos.y += (p.temp < this._T_AMBIENT ? -0.002 : 0.003) * compressionLevel;
      }
      // Clamp vertical
      p.pos.y = Math.max(-0.8, Math.min(0.8, p.pos.y));

      // Temperature exchange: inner spiral is hotter, outer is cooler
      const tempTarget = isHeating
        ? this._T_AMBIENT + 20 * (1 - t)   // Heating: inner hot → outer cool
        : this._T_AMBIENT - 15 * (1 - t) + 15 * t; // Cooling: inner cold → outer warm
      p.temp += (tempTarget - p.temp) * 0.02;
    }
  }

  // ── CHANNEL FLOW PARTICLES (all modes) ──

  private _initChannelParticles() {
    this._channelParticles = [];
    const count = Math.min(250, Math.max(50, this.loops.length * 4));

    for (let i = 0; i < count; i++) {
      const pathIdx = i % Math.max(1, this.flowPaths.length);
      const path = this.flowPaths[pathIdx];
      if (!path || path.loopIndices.length === 0) {
        const loopIdx = i % Math.max(1, this.loops.length);
        const center = this.loops[loopIdx]?.center || new THREE.Vector3();
        this._channelParticles.push({
          pos: center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2)),
          vel: new THREE.Vector3(), target: loopIdx, pathIdx, energy: 0.5 + Math.random() * 0.5,
        });
        continue;
      }
      const startIdx = Math.floor(Math.random() * path.loopIndices.length);
      const loopIdx = path.loopIndices[startIdx];
      const center = this.loops[loopIdx].center;
      const nextIdx = (startIdx + 1) % path.loopIndices.length;
      this._channelParticles.push({
        pos: center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.1)),
        vel: new THREE.Vector3(), target: path.loopIndices[nextIdx], pathIdx,
        energy: 0.5 + Math.random() * 0.5,
      });
    }
  }

  private _updateChannelParticles(compressionLevel: number) {
    for (const p of this._channelParticles) {
      if (p.target >= 0 && p.target < this.loops.length) {
        const target = this.loops[p.target].center;
        const dir = new THREE.Vector3().subVectors(target, p.pos);
        const dist = dir.length();

        if (dist < 0.15) {
          // Reached target — advance along path
          let nextTarget = -1;
          const path = this.flowPaths[p.pathIdx];
          if (path) {
            const idx = path.loopIndices.indexOf(p.target);
            if (idx >= 0 && idx < path.loopIndices.length - 1) {
              nextTarget = path.loopIndices[idx + 1];
            } else {
              nextTarget = path.loopIndices[0]; // wrap
            }
          }
          p.target = nextTarget >= 0 ? nextTarget : p.target;
          p.energy = Math.min(1.0, p.energy + 0.1);
        } else {
          dir.normalize();
          const speed = 0.025 * compressionLevel * p.energy / (this._resistanceField[p.target] + 0.5);
          p.vel.lerp(dir.multiplyScalar(speed), 0.12);
        }
      }
      p.vel.multiplyScalar(0.94);
      p.pos.add(p.vel.clone().multiplyScalar(compressionLevel));
      p.energy *= 0.999;
    }
  }

  // ── SURFACE GRADIENTS ──

  private _buildSurfaceGradients() {
    this._clearGroup(this.surfaceGradientGroup);
    if (this.boundaryPlanes.length === 0) return;

    // Place gradient indicator points ON each boundary plane surface
    const positions: number[] = [];
    const colors: number[] = [];

    for (const plane of this.boundaryPlanes) {
      if (plane.state === 'open') continue;

      // Sample points on the plane surface
      const right = new THREE.Vector3().crossVectors(plane.normal, plane.up).normalize();
      if (right.length() < 0.01) right.set(1, 0, 0);
      const actualUp = new THREE.Vector3().crossVectors(right, plane.normal).normalize();

      const samplesW = Math.max(2, Math.min(5, Math.ceil(plane.width / 0.4)));
      const samplesH = Math.max(2, Math.min(5, Math.ceil(plane.height / 0.4)));

      for (let wi = 0; wi < samplesW; wi++) {
        for (let hi = 0; hi < samplesH; hi++) {
          const u = (wi / (samplesW - 1) - 0.5) * plane.width;
          const v = (hi / (samplesH - 1) - 0.5) * plane.height;
          const pt = plane.center.clone()
            .add(right.clone().multiplyScalar(u))
            .add(actualUp.clone().multiplyScalar(v));
          positions.push(pt.x, pt.y, pt.z);

          // Color by plane conductivity and type
          const c = new THREE.Color();
          if (this._category === 'thermal') {
            // Red=hot/propagating, Blue=cold/insulating
            if (plane.membraneType === 'propagating') {
              c.setRGB(0.9, 0.3, 0.1);
            } else if (plane.membraneType === 'insulating') {
              c.setRGB(0.1, 0.3, 0.9);
            } else {
              c.setRGB(0.5, 0.5, 0.2);
            }
          } else if (this._category === 'electrical') {
            if (plane.role === 'layer') {
              c.setRGB(0.2, 0.9, 0.5);
            } else if (plane.role === 'shield') {
              c.setRGB(0.6, 0.2, 0.9);
            } else {
              c.setRGB(0.2, 0.7, 0.9);
            }
          } else if (this._category === 'blockchain') {
            const dist = plane.center.length();
            const t = Math.min(1, dist / 2);
            c.setRGB(1 - t, t, 0.3);
          } else {
            c.setHSL(plane.conductivity * 0.3, 0.8, 0.5);
          }
          colors.push(c.r, c.g, c.b);
        }
      }
    }

    if (positions.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      const mat = new THREE.PointsMaterial({
        size: 0.08, vertexColors: true, transparent: true, opacity: 0.4,
        blending: THREE.AdditiveBlending,
      });
      this.surfaceGradientGroup.add(new THREE.Points(geo, mat));
    }
  }

  // ── SIGNAL WAVE (electrical) ──

  private _updateSignalWave() {
    this._clearGroup(this.signalWaveGroup);
    if (this._category !== 'electrical' || this.boundaryPlanes.length === 0) return;

    this._signalPhase += 0.08;
    const positions: number[] = [];
    const colors: number[] = [];

    // Signal wave propagates along layer planes
    const layers = this.boundaryPlanes.filter(p => p.role === 'layer');
    for (const layer of layers) {
      const right = new THREE.Vector3().crossVectors(layer.normal, new THREE.Vector3(0, 0, 1)).normalize();
      if (right.length() < 0.01) right.set(1, 0, 0);

      const waveFront = 20;
      for (let i = 0; i < waveFront; i++) {
        const t = i / waveFront;
        const waveX = (t - 0.5) * layer.width;
        const wavePhase = this._signalPhase - t * 6;
        const waveAmp = Math.sin(wavePhase) * 0.15;

        const pt = layer.center.clone()
          .add(right.clone().multiplyScalar(waveX))
          .add(layer.normal.clone().multiplyScalar(waveAmp));
        positions.push(pt.x, pt.y, pt.z);

        const intensity = (Math.sin(wavePhase) + 1) * 0.5;
        colors.push(0.2, 0.8 * intensity, 0.3 + 0.7 * intensity);
      }
    }

    if (positions.length > 0) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      const mat = new THREE.PointsMaterial({
        size: 0.06, vertexColors: true, transparent: true, opacity: 0.7,
        blending: THREE.AdditiveBlending,
      });
      this.signalWaveGroup.add(new THREE.Points(geo, mat));
    }
  }

  // ── EVALUATE AND MODIFY V5 ──

  evaluateAndModify(v5: V5Engine | null) {
    if (!this._captured || !v5) return;

    // Capture boundary planes from V5
    if (v5.getBoundaryPlanes) {
      const planes = v5.getBoundaryPlanes();
      if (planes.length !== this.boundaryPlanes.length) {
        this.captureBoundaryPlanes(planes);
      }
    }

    this.pendingRequests = [];
    let modified = 0;

    for (const path of this.flowPaths) {
      const bottleneck = path.bottleneckIndex;
      const loop = this.loops[bottleneck];
      if (!loop) continue;
      const resistance = this._resistanceField[bottleneck];

      if (resistance > 3.0 && loop.membraneType === 'insulating') {
        if (this._category === 'thermal') {
          if (this._thermalMode === 'cooling') {
            this.pendingRequests.push({ loopIndex: bottleneck, requestedState: 'open',
              reason: 'thermal-cooling: insulating bottleneck blocks heat dissipation' });
          } else if (resistance > 5.0) {
            this.pendingRequests.push({ loopIndex: bottleneck, requestedState: 'shrinking',
              reason: 'thermal-heating: extreme bottleneck, shrink for minimal flow' });
          }
        } else if (this._category === 'electrical') {
          this.pendingRequests.push({ loopIndex: bottleneck, requestedState: 'growing',
            reason: 'electrical: insulating bottleneck in signal path' });
        }
      }

      if (loop.membraneType === 'propagating' && loop.area < 0.15) {
        this.pendingRequests.push({ loopIndex: bottleneck, requestedState: 'growing',
          reason: `${this._category}: propagating membrane too small` });
      }
    }

    const maxChanges = 5;
    for (let i = 0; i < Math.min(maxChanges, this.pendingRequests.length); i++) {
      const req = this.pendingRequests[i];
      v5.setMembraneState(req.loopIndex, req.requestedState);
      modified++;
    }
    this.metrics.membranesModified = modified;
  }

  isStable() { return this._captured && this._framesSinceCapture > 10; }

  update(optimizer: string = 'thermal', thermalMode: string = 'cooling', compressionLevel: number = 1) {
    if (!this._captured) return;
    this._framesSinceCapture++;
    this._frameCount++;
    this._thermalMode = thermalMode;

    // Update flow field
    for (let i = 0; i < this.loops.length; i++) this._flowField[i] *= 0.95;
    for (const path of this.flowPaths) {
      for (const idx of path.loopIndices) {
        this._flowField[idx] += path.flowRate * 0.1 * compressionLevel;
        this._flowField[idx] = Math.min(this._flowField[idx], 2.0);
      }
    }

    // Metrics
    let totalFlow = 0, totalResistance = 0, bottlenecks = 0;
    for (let i = 0; i < this.loops.length; i++) {
      totalFlow += this._flowField[i];
      totalResistance += this._resistanceField[i];
      if (this._resistanceField[i] > 3.0) bottlenecks++;
    }
    const N = Math.max(1, this.loops.length);
    this.metrics = {
      totalFlow, avgResistance: totalResistance / N, bottleneckCount: bottlenecks,
      efficiency: Math.min(1.0, totalFlow / (N * 2.0)), pathCount: this.flowPaths.length,
      membranesModified: this.metrics.membranesModified,
    };

    // Electrical impedance stats
    if (this._category === 'electrical' && this.flowPaths.length > 0) {
      const impedances: number[] = [];
      let maxDelay = 0;
      for (const path of this.flowPaths) {
        let pathZ = 0, pathDelay = 0;
        for (const idx of path.loopIndices) {
          if (idx < this.loops.length) {
            const imp = this._computeImpedance(this.loops[idx]);
            pathZ += imp.Z0;
            pathDelay += imp.propagationDelay_ps_mm * (this.loops[idx].perimeter / 3);
          }
        }
        pathZ /= Math.max(1, path.loopIndices.length);
        path.impedance = this._computeImpedance(this.loops[path.loopIndices[0]] || this.loops[0]);
        impedances.push(pathZ);
        if (pathDelay > maxDelay) maxDelay = pathDelay;
      }
      const avgZ = impedances.reduce((s, z) => s + z, 0) / impedances.length;
      const variance = impedances.reduce((s, z) => s + (z - avgZ) ** 2, 0) / impedances.length;
      this.metrics.avgImpedance = avgZ;
      this.metrics.impedanceMismatch = Math.sqrt(variance);
      this.metrics.maxPropDelay = maxDelay;
    }

    // Thermal diffusion
    this._T_AMBIENT = thermalMode === 'cooling' ? 293 : 313;
    this._diffuseHeat(compressionLevel);
    this._updateThermalGeometry();
    this.thermalGrid.visible = this._category === 'thermal';

    // Update particles
    this._updateChannelParticles(compressionLevel);
    if (this._category === 'thermal') this._updateSpiralParticles(compressionLevel);

    // Electrical signal wave
    if (this._category === 'electrical') this._updateSignalWave();

    // Render
    this._buildFlowLines();
    this._buildHeatmap();
    this._buildParticleGeometry();

    // Manage group visibility
    this.spiralFlowGroup.visible = this._category === 'thermal';
    this.signalWaveGroup.visible = this._category === 'electrical';
    this.channelFlowGroup.visible = true;
    this.surfaceGradientGroup.visible = true;
  }

  // ── RENDERING ──

  private _buildParticleGeometry() {
    const positions: number[] = [];
    const colors: number[] = [];

    // Channel particles (all modes)
    for (const p of this._channelParticles) {
      positions.push(p.pos.x, p.pos.y, p.pos.z);
      const flow = p.target >= 0 && p.target < this._flowField.length ? this._flowField[p.target] : 0;
      const t = Math.min(1, flow);
      const c = new THREE.Color();
      if (this._category === 'thermal') {
        c.setRGB(0.8 + t * 0.2, 0.3 - t * 0.2, 0.1);
      } else if (this._category === 'electrical') {
        c.setRGB(0.1, 0.6 + t * 0.4, 0.8);
      } else if (this._category === 'blockchain') {
        c.setRGB(t, t * 0.8, 0.2);
      } else {
        c.setHSL(t * 0.3, 0.9, 0.5 + t * 0.3);
      }
      colors.push(c.r, c.g, c.b);
    }

    // Spiral particles (thermal only)
    if (this._category === 'thermal') {
      for (const p of this._spiralParticles) {
        positions.push(p.pos.x, p.pos.y, p.pos.z);
        const tempNorm = Math.min(1, Math.max(0, (p.temp - this._T_AMBIENT + 15) / 30));
        colors.push(tempNorm, 0.1 + (1 - tempNorm) * 0.3, 1 - tempNorm);
      }
    }

    this.flowParticles.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.flowParticles.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.flowParticles.geometry.attributes.position.needsUpdate = true;
    if (this.flowParticles.geometry.attributes.color) {
      this.flowParticles.geometry.attributes.color.needsUpdate = true;
    }
  }

  private _buildFlowLines() {
    const positions: number[] = [];
    const colors: number[] = [];

    for (const path of this.flowPaths) {
      for (let i = 0; i < path.loopIndices.length - 1; i++) {
        const a = this.loops[path.loopIndices[i]].center;
        const b = this.loops[path.loopIndices[i + 1]].center;
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
        const intensity = Math.min(1, path.flowRate * 2);
        const c = new THREE.Color();
        if (this._category === 'thermal') c.setRGB(intensity, 0.2, 1 - intensity);
        else if (this._category === 'electrical') c.setRGB(0.2, intensity, 1 - intensity * 0.5);
        else if (this._category === 'blockchain') c.setRGB(intensity, intensity, 0.2);
        else c.setHSL(0.8, 0.8, 0.3 + intensity * 0.4);
        colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
      }
    }

    // Add spiral flow trail lines (thermal)
    if (this._category === 'thermal' && this._spiralParticles.length > 1) {
      for (let i = 0; i < this._spiralParticles.length - 1; i++) {
        const a = this._spiralParticles[i].pos;
        const b = this._spiralParticles[i + 1].pos;
        if (a.distanceTo(b) < 0.5) {
          positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
          const tA = Math.min(1, Math.max(0, (this._spiralParticles[i].temp - this._T_AMBIENT + 15) / 30));
          const tB = Math.min(1, Math.max(0, (this._spiralParticles[i + 1].temp - this._T_AMBIENT + 15) / 30));
          colors.push(tA, 0.1, 1 - tA, tB, 0.1, 1 - tB);
        }
      }
    }

    this.flowLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.flowLines.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.flowLines.geometry.attributes.position.needsUpdate = true;
    if (this.flowLines.geometry.attributes.color) {
      this.flowLines.geometry.attributes.color.needsUpdate = true;
    }
  }

  private _buildHeatmap() {
    const positions: number[] = [];
    const colors: number[] = [];

    for (let i = 0; i < this.loops.length; i++) {
      const loop = this.loops[i];
      if (loop.state === 'open') continue;
      positions.push(loop.center.x, loop.center.y, loop.center.z);
      const flow = this._flowField[i];
      const resistance = this._resistanceField[i];
      const c = new THREE.Color();
      if (resistance > 3.0) {
        c.setRGB(1, 0.2, 0.1);
      } else {
        const t = Math.min(1, flow);
        c.setRGB(t * 0.5, 0.5 + t * 0.5, 1 - t * 0.3);
      }
      colors.push(c.r, c.g, c.b);
    }

    this.heatmapPoints.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.heatmapPoints.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.heatmapPoints.geometry.attributes.position.needsUpdate = true;
    if (this.heatmapPoints.geometry.attributes.color) {
      this.heatmapPoints.geometry.attributes.color.needsUpdate = true;
    }
  }

  // ── THERMAL GRID ──

  private _initThermalGrid() {
    const size = this._gridSize;
    const total = size * size * size;
    this._thermalField = new Float32Array(total);
    this._thermalFlux = new Float32Array(total);
    this._solidMask = new Uint8Array(total);
    for (let i = 0; i < total; i++) {
      this._thermalField[i] = this._T_AMBIENT + (Math.random() - 0.5) * 2;
    }
    this._updateThermalGeometry();
  }

  /**
   * Import V12 house thermal data into the 3D grid.
   * Maps 2D floorplan walls into 3D solid mask, projects temperature field,
   * and generates airflow particles between vents.
   */
  importHouseData(houseData: {
    gridW: number; gridH: number;
    thermalGrid: Float32Array;
    wallMask: Uint8Array;
    airflowX: Float32Array;
    airflowY: Float32Array;
    rooms: { x: number; y: number; width: number; height: number; ceilingHeight: number; wallType: string; co2Level?: number }[];
  }) {
    const size = this._gridSize;
    const { gridW, gridH } = houseData;

    // Map 2D house grid into 3D cube — extrude walls vertically
    for (let gx = 0; gx < size; gx++) {
      for (let gy = 0; gy < size; gy++) {
        // Map 3D grid coords to 2D house grid coords
        const hx = Math.floor(gx / size * gridW);
        const hy = Math.floor(gy / size * gridH);
        const hIdx = hy * gridW + hx;

        for (let gz = 0; gz < size; gz++) {
          const idx3d = gx * size * size + gy * size + gz;
          const heightFraction = gz / size; // 0=floor, 1=ceiling

          if (hx < gridW && hy < gridH) {
            // Walls: extrude full height
            if (houseData.wallMask[hIdx] === 1) {
              this._solidMask[idx3d] = 1;
              this._thermalField[idx3d] = houseData.thermalGrid[hIdx] + 273; // Convert °C to K
            } else {
              // Air cell: temperature varies with height (hot rises)
              this._solidMask[idx3d] = 0;
              const tempC = houseData.thermalGrid[hIdx];
              const heightBonus = heightFraction * 3; // +3°C at ceiling
              this._thermalField[idx3d] = (tempC + heightBonus) + 273;

              // Generate airflow particles from V12 velocity field
              const vx = houseData.airflowX[hIdx] || 0;
              const vy = houseData.airflowY[hIdx] || 0;
              if (Math.abs(vx) + Math.abs(vy) > 0.01 && Math.random() < 0.05) {
                const BND = this._bounds;
                const step = (BND * 2) / (size - 1);
                this._channelParticles.push({
                  pos: new THREE.Vector3(
                    -BND + gx * step,
                    -BND + gy * step,
                    -BND + gz * step
                  ),
                  vel: new THREE.Vector3(vx * 0.5, vy * 0.5, (heightFraction - 0.5) * 0.01),
                  target: 0,
                  pathIdx: 0,
                  energy: Math.abs(vx) + Math.abs(vy),
                });
              }
            }
          }
        }
      }
    }

    // Cap particles
    if (this._channelParticles.length > 500) {
      this._channelParticles = this._channelParticles.slice(-500);
    }

    this._updateThermalGeometry();
    console.log(`[V6] Imported house data: ${houseData.rooms.length} rooms, ${this._channelParticles.length} flow particles`);
  }

  private _mapMembranesToGrid() {
    this._solidMask.fill(0);
    const size = this._gridSize;
    const BND = this._bounds;
    const step = (BND * 2) / (size - 1);

    // Map V5 loops (legacy)
    for (const loop of this.loops) {
      if (loop.state === 'open') continue;
      const gx = Math.floor((loop.center.x + BND) / step);
      const gy = Math.floor((loop.center.y + BND) / step);
      const gz = Math.floor((loop.center.z + BND) / step);
      if (gx >= 0 && gx < size && gy >= 0 && gy < size && gz >= 0 && gz < size) {
        const idx = gx * size * size + gy * size + gz;
        this._solidMask[idx] = 1;
        if (loop.membraneType === 'propagating') this._thermalField[idx] += 0.5;
      }
    }

    // Map boundary planes to grid (walls block heat)
    for (const plane of this.boundaryPlanes) {
      if (plane.state === 'open') continue;
      if (plane.membraneType !== 'insulating') continue;
      const gx = Math.floor((plane.center.x + BND) / step);
      const gy = Math.floor((plane.center.y + BND) / step);
      const gz = Math.floor((plane.center.z + BND) / step);
      if (gx >= 0 && gx < size && gy >= 0 && gy < size && gz >= 0 && gz < size) {
        this._solidMask[gx * size * size + gy * size + gz] = 1;
      }
    }
  }

  private _diffuseHeat(compressionLevel: number) {
    const size = this._gridSize;
    const dt = 0.1 * compressionLevel;
    const alpha = this._thermalAlpha;

    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
        for (let z = 0; z < size; z++) {
          const i = x * size * size + y * size + z;
          if (this._solidMask[i]) continue;

          const T = this._thermalField[i];
          const Tx1 = x > 0 ? this._thermalField[(x - 1) * size * size + y * size + z] : this._T_AMBIENT;
          const Tx2 = x < size - 1 ? this._thermalField[(x + 1) * size * size + y * size + z] : this._T_AMBIENT;
          const Ty1 = y > 0 ? this._thermalField[x * size * size + (y - 1) * size + z] : this._T_AMBIENT;
          const Ty2 = y < size - 1 ? this._thermalField[x * size * size + (y + 1) * size + z] : this._T_AMBIENT;
          const Tz1 = z > 0 ? this._thermalField[x * size * size + y * size + (z - 1)] : this._T_AMBIENT;
          const Tz2 = z < size - 1 ? this._thermalField[x * size * size + y * size + (z + 1)] : this._T_AMBIENT;

          this._thermalFlux[i] = alpha * dt * (Tx1 + Tx2 + Ty1 + Ty2 + Tz1 + Tz2 - 6 * T);
        }
      }
    }

    for (let i = 0; i < this._thermalField.length; i++) {
      this._thermalField[i] += this._thermalFlux[i];
      this._thermalField[i] -= (this._thermalField[i] - this._T_AMBIENT) * 0.005;
    }
  }

  private _updateThermalGeometry() {
    const size = this._gridSize;
    const BND = this._bounds;
    const step = (BND * 2) / (size - 1);
    const positions: number[] = [];
    const colors: number[] = [];

    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
        for (let z = 0; z < size; z++) {
          const i = x * size * size + y * size + z;
          const T = this._thermalField[i];
          if (Math.abs(T - this._T_AMBIENT) > 0.4) {
            positions.push(x * step - BND, y * step - BND, z * step - BND);
            const tNorm = Math.min(1, Math.max(0, (T - this._T_AMBIENT) / 20));
            const c = new THREE.Color();
            if (tNorm < 0.5) c.setRGB(0, 1 - tNorm, 1);
            else c.setRGB(tNorm, 1 - tNorm * 0.5, tNorm * 0.3);
            colors.push(c.r, c.g, c.b);
          }
        }
      }
    }

    this.thermalGrid.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.thermalGrid.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.thermalGrid.geometry.attributes.position.needsUpdate = true;
    if (this.thermalGrid.geometry.attributes.color) {
      this.thermalGrid.geometry.attributes.color.needsUpdate = true;
    }
  }

  // ── GETTERS ──

  getMetrics(): FlowMetrics { return this.metrics; }
  getFlowPaths(): FlowPath[] { return this.flowPaths; }
  getPendingRequests(): MembraneRequest[] { return this.pendingRequests; }
  getFlowField(): Float32Array { return this._flowField; }
  getResistanceField(): Float32Array { return this._resistanceField; }
  getThermalField(): Float32Array { return this._thermalField; }
  getGridSize(): number { return this._gridSize; }

  saveState() {
    return {
      metrics: this.metrics,
      flowPaths: this.flowPaths.map(p => ({ indices: p.loopIndices, rate: p.flowRate, resistance: p.resistance })),
      category: this._category,
      thermalField: Array.from(this._thermalField),
      spiralParticles: this._spiralParticles.length,
      channelParticles: this._channelParticles.length,
      boundaryPlanes: this.boundaryPlanes.length,
    };
  }

  loadState(state: any) {
    if (!state) return;
    if (state.metrics) this.metrics = { ...this.metrics, ...state.metrics };
    if (Array.isArray(state.thermalField) && state.thermalField.length === this._thermalField.length) {
      this._thermalField.set(state.thermalField);
      this._updateThermalGeometry();
    }
    if (Array.isArray(state.flowPaths)) {
      for (let i = 0; i < Math.min(this.flowPaths.length, state.flowPaths.length); i++) {
        const saved = state.flowPaths[i];
        if (Number.isFinite(saved?.rate)) this.flowPaths[i].flowRate = saved.rate;
        if (Number.isFinite(saved?.resistance)) this.flowPaths[i].resistance = saved.resistance;
      }
    }
  }

  private _clearGroup(group: THREE.Group) {
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      if ((child as any).geometry) (child as any).geometry.dispose();
      if ((child as any).material) ((child as any).material as THREE.Material).dispose();
    }
  }

  dispose() {
    this.scene.remove(this.flowLines);
    this.scene.remove(this.flowParticles);
    this.scene.remove(this.heatmapPoints);
    this.scene.remove(this.thermalGrid);
    this.scene.remove(this.spiralFlowGroup);
    this.scene.remove(this.channelFlowGroup);
    this.scene.remove(this.surfaceGradientGroup);
    this.scene.remove(this.signalWaveGroup);
    this.flowLines.geometry.dispose();
    (this.flowLines.material as THREE.Material).dispose();
    this.flowParticles.geometry.dispose();
    (this.flowParticles.material as THREE.Material).dispose();
    this.heatmapPoints.geometry.dispose();
    (this.heatmapPoints.material as THREE.Material).dispose();
    this.thermalGrid.geometry.dispose();
    (this.thermalGrid.material as THREE.Material).dispose();
    this._clearGroup(this.spiralFlowGroup);
    this._clearGroup(this.channelFlowGroup);
    this._clearGroup(this.surfaceGradientGroup);
    this._clearGroup(this.signalWaveGroup);
  }
}
