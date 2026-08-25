import * as THREE from 'three';
import type { Stabilization, MaterialField } from './v1';
import type { V1Engine } from './v1';

/**
 * V2 — Causal Node Discovery (90° phase, XZ plane bias)
 *
 * Same PSO algorithm as V1 but nodes start in XZ plane (90° rotated).
 * SHARES V1's material field — both swarms explore the same medium.
 * Together V1+V2 discover the full 3D topology from two orthogonal views.
 *
 * When overlaid, the combined settled positions reveal the complete structure.
 */

export interface V2Node {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  pbest: THREE.Vector3;
  fitness: number;
  pbestFitness: number;
  path: THREE.Vector3[];
  color: THREE.Color;
}

export class V2Engine {
  nodes: V2Node[] = [];
  maxNodes: number = 80;
  pathLength: number = 40;
  scene: THREE.Scene;
  points: THREE.Points;
  lines: THREE.LineSegments;

  phase: number = 0;
  rotationSpeed: number = 0.01;
  frameCount: number = 0;

  // PSO
  inertiaWeight: number = 0.7;
  cognitiveWeight: number = 1.5;
  socialWeight: number = 1.5;
  gbest: THREE.Vector3 = new THREE.Vector3();
  gbestFitness: number = -Infinity;

  // Reference to V1's material field (shared medium)
  private _materialRef: MaterialField | null = null;

  // Stabilization tracking
  stabilizations: Stabilization[] = [];
  private _stableFrames: number = 0;
  _stabilityThreshold: number = 0.0005;
  _requiredStableFrames: number = 40;
  private _lastStabilizationFrame: number = -100;
  settledPositions: THREE.Vector3[] = [];

  // Backward compat
  gridSize: number = 10;
  occupancy: Float32Array = new Float32Array(1000);

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    const geometry = new THREE.BufferGeometry();
    const material = new THREE.PointsMaterial({
      size: 0.08,
      vertexColors: true,
      transparent: true,
      opacity: 0.9
    });
    this.points = new THREE.Points(geometry, material);
    this.scene.add(this.points);

    const lineGeometry = new THREE.BufferGeometry();
    const lineMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.3
    });
    this.lines = new THREE.LineSegments(lineGeometry, lineMaterial);
    this.scene.add(this.lines);

    this.initNodes();
  }

  /** Link to V1's material field so both explore the same medium */
  setMaterialRef(v1: V1Engine) {
    this._materialRef = v1.getMaterial();
  }

  /** Sample the shared material field */
  private _sampleField(pos: THREE.Vector3): number {
    if (!this._materialRef) return 0;
    const { resolution: res, bounds, data } = this._materialRef;
    const step = (bounds * 2) / (res - 1);

    const fx = (pos.x + bounds) / step;
    const fy = (pos.y + bounds) / step;
    const fz = (pos.z + bounds) / step;

    const x0 = Math.max(0, Math.min(res - 2, Math.floor(fx)));
    const y0 = Math.max(0, Math.min(res - 2, Math.floor(fy)));
    const z0 = Math.max(0, Math.min(res - 2, Math.floor(fz)));

    return data[x0 * res * res + y0 * res + z0] || 0;
  }

  getCMYColor(idx: number, phase: number) {
    const cyan = new THREE.Color(0, 1, 1);
    const magenta = new THREE.Color(1, 0, 1);
    const yellow = new THREE.Color(1, 1, 0);
    const t = (idx / this.maxNodes + phase * 0.1) % 3;
    let color = new THREE.Color();
    if (t < 1) color.lerpColors(cyan, magenta, t);
    else if (t < 2) color.lerpColors(magenta, yellow, t - 1);
    else color.lerpColors(yellow, cyan, t - 2);
    return color;
  }

  initNodes() {
    this.nodes = [];
    this.gbestFitness = -Infinity;

    for (let i = 0; i < this.maxNodes; i++) {
      const radius = 1.2 + Math.random() * 0.8;
      const angle = (i / this.maxNodes) * Math.PI * 2;
      // XZ plane bias (90° rotated from V1's YZ bias)
      const pos = new THREE.Vector3(
        Math.cos(angle) * radius,
        (Math.random() - 0.5) * 0.5,  // Small Y spread
        Math.sin(angle) * radius
      );

      this.nodes.push({
        position: pos.clone(),
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.05,
          (Math.random() - 0.5) * 0.05,
          (Math.random() - 0.5) * 0.05,
        ),
        pbest: pos.clone(),
        fitness: 0,
        pbestFitness: 0,
        path: [],
        color: this.getCMYColor(i, 0),
      });
    }
  }

  captureFromV1(v1Engine: any) {
    // Share V1's material field
    if (v1Engine && v1Engine.getMaterial) {
      this._materialRef = v1Engine.getMaterial();
    }
    // Also let V1's gbest influence V2's search (cross-swarm communication)
    if (v1Engine && v1Engine.gbest && v1Engine.gbestFitness > this.gbestFitness * 0.8) {
      // Nudge a few V2 nodes toward V1's best regions
      for (let i = 0; i < 3; i++) {
        const idx = Math.floor(Math.random() * this.nodes.length);
        this.nodes[idx].velocity.add(
          v1Engine.gbest.clone().sub(this.nodes[idx].position).multiplyScalar(0.01)
        );
      }
    }
  }

  isStable() {
    return this._stableFrames >= this._requiredStableFrames;
  }

  getKineticEnergy(): number {
    let ke = 0;
    for (const node of this.nodes) ke += node.velocity.lengthSq();
    return ke / this.nodes.length;
  }

  getMeanSeparation(): number {
    let totalDist = 0;
    for (let i = 0; i < this.nodes.length; i++) {
      let minD = Infinity;
      for (let j = 0; j < this.nodes.length; j++) {
        if (i === j) continue;
        const d = this.nodes[i].position.distanceTo(this.nodes[j].position);
        if (d < minD) minD = d;
      }
      totalDist += minD;
    }
    return totalDist / this.nodes.length;
  }

  getClusterCount(threshold: number = 0.5): number {
    const visited = new Set<number>();
    let clusters = 0;
    for (let i = 0; i < this.nodes.length; i++) {
      if (visited.has(i)) continue;
      clusters++;
      const queue = [i];
      while (queue.length > 0) {
        const curr = queue.pop()!;
        if (visited.has(curr)) continue;
        visited.add(curr);
        for (let j = 0; j < this.nodes.length; j++) {
          if (visited.has(j)) continue;
          if (this.nodes[curr].position.distanceTo(this.nodes[j].position) < threshold) {
            queue.push(j);
          }
        }
      }
    }
    return clusters;
  }

  update(optimizer: string = 'thermal', globalMemory: any = {}, thermalMode: string = 'cooling', compressionLevel: number = 1) {
    this.phase += this.rotationSpeed * compressionLevel;
    this.frameCount++;

    const decayRate = 0.9995;
    this.inertiaWeight = Math.max(0.4, this.inertiaWeight * decayRate);

    const positions: number[] = [];
    const colors: number[] = [];
    const linePositions: number[] = [];
    const lineColors: number[] = [];
    const bounds = this._materialRef?.bounds || 2.0;

    this.nodes.forEach((node, idx) => {
      // ── PSO UPDATE ──
      node.fitness = this._sampleField(node.position);

      if (node.fitness > node.pbestFitness) {
        node.pbestFitness = node.fitness;
        node.pbest.copy(node.position);
      }

      if (node.fitness > this.gbestFitness) {
        this.gbestFitness = node.fitness;
        this.gbest.copy(node.position);
      }

      const r1 = Math.random();
      const r2 = Math.random();
      const cognitive = node.pbest.clone().sub(node.position).multiplyScalar(this.cognitiveWeight * r1);
      const social = this.gbest.clone().sub(node.position).multiplyScalar(this.socialWeight * r2);

      node.velocity.multiplyScalar(this.inertiaWeight);
      node.velocity.add(cognitive);
      node.velocity.add(social);

      // Exclusion
      const exclusionForce = new THREE.Vector3();
      for (let j = 0; j < this.nodes.length; j++) {
        if (j === idx) continue;
        const d = node.position.distanceTo(this.nodes[j].position);
        if (d < 0.3) {
          exclusionForce.add(
            node.position.clone().sub(this.nodes[j].position).normalize().multiplyScalar(0.02 / (d + 0.05))
          );
        }
      }
      node.velocity.add(exclusionForce);

      // Clamp
      const maxSpeed = 0.08 * compressionLevel;
      if (node.velocity.length() > maxSpeed) {
        node.velocity.normalize().multiplyScalar(maxSpeed);
      }

      node.position.add(node.velocity.clone().multiplyScalar(compressionLevel));

      // Boundary
      const bnd = bounds * 0.95;
      ['x', 'y', 'z'].forEach(axis => {
        const a = axis as 'x' | 'y' | 'z';
        if (Math.abs(node.position[a]) > bnd) {
          node.position[a] = Math.sign(node.position[a]) * bnd;
          node.velocity[a] *= -0.5;
        }
      });

      node.path.push(node.position.clone());
      if (node.path.length > this.pathLength) node.path.shift();

      positions.push(node.position.x, node.position.y, node.position.z);

      // Color by fitness (shifted hue from V1 to distinguish the two swarms)
      const fitnessNorm = Math.min(1, node.fitness / (this.gbestFitness + 0.01));
      const c = new THREE.Color();
      if (fitnessNorm < 0.5) c.setRGB(1 - fitnessNorm, 0, 1);  // Magenta tint
      else c.setRGB(1, fitnessNorm * 0.5, 0);                    // Orange/yellow
      node.color.copy(c);
      colors.push(c.r, c.g, c.b);

      for (let i = 0; i < node.path.length - 1; i++) {
        linePositions.push(
          node.path[i].x, node.path[i].y, node.path[i].z,
          node.path[i + 1].x, node.path[i + 1].y, node.path[i + 1].z
        );
        const opacity = i / node.path.length;
        lineColors.push(
          c.r * opacity, c.g * opacity, c.b * opacity,
          c.r * opacity, c.g * opacity, c.b * opacity
        );
      }
    });

    // ── STABILIZATION DETECTION ──
    const ke = this.getKineticEnergy();
    if (ke < this._stabilityThreshold) {
      this._stableFrames++;
    } else {
      this._stableFrames = Math.max(0, this._stableFrames - 2);
    }

    if (this._stableFrames >= this._requiredStableFrames &&
        this.frameCount - this._lastStabilizationFrame > 60) {
      const avgFitness = this.nodes.reduce((s, n) => s + n.fitness, 0) / this.nodes.length;
      const stab: Stabilization = {
        frame: this.frameCount,
        positions: this.nodes.map(n => ({ x: n.position.x, y: n.position.y, z: n.position.z })),
        kineticEnergy: ke,
        clusterCount: this.getClusterCount(),
        meanSeparation: this.getMeanSeparation(),
        avgFitness,
        timestamp: Date.now(),
      };
      this.stabilizations.push(stab);
      if (this.stabilizations.length > 50) this.stabilizations.shift();
      this._lastStabilizationFrame = this.frameCount;
      this.settledPositions = this.nodes.map(n => n.position.clone());
    }

    this.updateOccupancy();

    this.points.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.points.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    this.lines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    this.lines.geometry.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));
    this.lines.geometry.attributes.position.needsUpdate = true;
    this.lines.geometry.attributes.color.needsUpdate = true;
  }

  updateOccupancy() {
    this.occupancy.fill(0);
    const step = 4 / this.gridSize;
    this.nodes.forEach(n => {
      const gx = Math.floor((n.position.x + 2) / step);
      const gy = Math.floor((n.position.y + 2) / step);
      const gz = Math.floor((n.position.z + 2) / step);
      if (gx >= 0 && gx < this.gridSize && gy >= 0 && gy < this.gridSize && gz >= 0 && gz < this.gridSize) {
        this.occupancy[gx * this.gridSize * this.gridSize + gy * this.gridSize + gz] += 0.1;
      }
    });
  }

  getLatestStabilization(): Stabilization | null {
    return this.stabilizations.length > 0 ? this.stabilizations[this.stabilizations.length - 1] : null;
  }

  getSettledNodes(): THREE.Vector3[] {
    return this.settledPositions.length > 0
      ? this.settledPositions
      : this.nodes.map(n => n.position.clone());
  }

  saveState() {
    return this.nodes.map(n => ({
      p: [n.position.x, n.position.y, n.position.z],
      v: [n.velocity.x, n.velocity.y, n.velocity.z]
    }));
  }

  loadState(state: any[]) {
    if (!state || !Array.isArray(state)) return;
    this.nodes = state.map(s => ({
      position: new THREE.Vector3(...s.p),
      velocity: new THREE.Vector3(...s.v),
      pbest: new THREE.Vector3(...s.p),
      fitness: 0, pbestFitness: 0,
      path: [],
      color: new THREE.Color().setHSL(0.1, 0.8, 0.5)
    }));
  }

  dispose() {
    this.scene.remove(this.points);
    this.scene.remove(this.lines);
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    this.lines.geometry.dispose();
    (this.lines.material as THREE.Material).dispose();
  }
}
