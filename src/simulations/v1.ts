import * as THREE from 'three';

/**
 * V1 — Causal Node Discovery (0° phase, YZ plane bias)
 *
 * Nodes explore a 3D MATERIAL FIELD using PSO (Particle Swarm Optimization).
 * The material field represents the physical medium being optimized —
 * thermal conductivity landscape, dielectric field, network topology, etc.
 *
 * Nodes discover HIGH-FITNESS positions in the material where structure exists.
 * STABILIZATIONS are logged when the swarm converges — these settled positions
 * are the "discovered structure" that feeds V3→V5→V7.
 *
 * V1 has a YZ plane bias (nodes start in YZ ring, explore outward).
 * V2 has the same algorithm with XZ plane bias — both overlaid find 3D topology.
 */

export interface V1Node {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  pbest: THREE.Vector3;       // Personal best position
  fitness: number;            // Current fitness at position
  pbestFitness: number;       // Best fitness ever found
  path: THREE.Vector3[];
  color: THREE.Color;
  magneticSusceptibility: number;
}

export interface Stabilization {
  frame: number;
  positions: { x: number; y: number; z: number }[];
  kineticEnergy: number;
  clusterCount: number;
  meanSeparation: number;
  avgFitness: number;
  timestamp: number;
}

/**
 * Material field: 3D scalar field the PSO explores.
 * Values represent "interestingness" — high values = structure discovered.
 */
export interface MaterialField {
  resolution: number;          // Grid resolution per axis
  bounds: number;              // World-space half-extent
  data: Float32Array;          // Flattened 3D grid [res^3]
  conductivity: number;        // Base thermal conductivity (W/mK)
  dielectricConstant: number;  // Base εr
  density: number;             // Base material density (kg/m³)
}

export class V1Engine {
  nodes: V1Node[] = [];
  maxNodes: number = 80;
  pathLength: number = 40;
  scene: THREE.Scene;
  points: THREE.Points;
  lines: THREE.LineSegments;

  phase: number = 0;
  rotationSpeed: number = 0.01;
  frameCount: number = 0;

  // ── PSO PARAMETERS ──
  inertiaWeight: number = 0.7;
  cognitiveWeight: number = 1.5;  // Pull toward personal best
  socialWeight: number = 1.5;     // Pull toward global best
  gbest: THREE.Vector3 = new THREE.Vector3();
  gbestFitness: number = -Infinity;

  // ── MATERIAL FIELD ──
  material: MaterialField;

  // ── STABILIZATION TRACKING ──
  stabilizations: Stabilization[] = [];
  private _stableFrames: number = 0;
  private _lastKE: number = Infinity;
  _stabilityThreshold: number = 0.0005;
  _requiredStableFrames: number = 40;
  private _lastStabilizationFrame: number = -100;
  settledPositions: THREE.Vector3[] = [];

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

    // Initialize default material field
    this.material = this._createDefaultMaterial();

    this.initNodes();
  }

  /** Create a material field with interesting topology for nodes to discover */
  private _createDefaultMaterial(): MaterialField {
    const res = 16;
    const bounds = 2.0;
    const data = new Float32Array(res * res * res);
    const step = (bounds * 2) / (res - 1);

    for (let x = 0; x < res; x++) {
      for (let y = 0; y < res; y++) {
        for (let z = 0; z < res; z++) {
          const px = x * step - bounds;
          const py = y * step - bounds;
          const pz = z * step - bounds;

          // Gyroid-like TPMS (triply periodic minimal surface) — real physics topology
          // Nodes discovering the zero-crossing of this field find the material's internal structure
          const gyroid = Math.sin(px * 2.0) * Math.cos(py * 2.0) +
                         Math.sin(py * 2.0) * Math.cos(pz * 2.0) +
                         Math.sin(pz * 2.0) * Math.cos(px * 2.0);

          // Diamond surface (another TPMS)
          const diamond = Math.sin(px * 2) * Math.sin(py * 2) * Math.sin(pz * 2) +
                          Math.sin(px * 2) * Math.cos(py * 2) * Math.cos(pz * 2) +
                          Math.cos(px * 2) * Math.sin(py * 2) * Math.cos(pz * 2) +
                          Math.cos(px * 2) * Math.cos(py * 2) * Math.sin(pz * 2);

          // Gradient: high near the surface (where interesting topology is)
          // The fitness is highest at the zero-crossing of the gyroid/diamond
          const surfaceProximity = 1.0 / (Math.abs(gyroid) + 0.1);
          const complexity = Math.abs(diamond) * 0.3;

          data[x * res * res + y * res + z] = surfaceProximity + complexity;
        }
      }
    }

    return { resolution: res, bounds, data, conductivity: 0.025, dielectricConstant: 4.5, density: 1200 };
  }

  /**
   * Set material from blueprint generator output.
   * This is the key integration point — the blueprint defines the material,
   * and the sim discovers optimal topology within it.
   */
  setMaterial(props: {
    conductivity?: number;
    dielectricConstant?: number;
    density?: number;
    geometry?: string; // 'gyroid' | 'diamond' | 'schwarz_p' | 'custom'
    resolution?: number;
  }) {
    const res = props.resolution || this.material.resolution;
    const bounds = this.material.bounds;
    const data = new Float32Array(res * res * res);
    const step = (bounds * 2) / (res - 1);

    const k = props.conductivity || this.material.conductivity;
    const er = props.dielectricConstant || this.material.dielectricConstant;

    for (let x = 0; x < res; x++) {
      for (let y = 0; y < res; y++) {
        for (let z = 0; z < res; z++) {
          const px = x * step - bounds;
          const py = y * step - bounds;
          const pz = z * step - bounds;

          let value = 0;
          const geo = props.geometry || 'gyroid';

          if (geo === 'gyroid') {
            const g = Math.sin(px * 2) * Math.cos(py * 2) + Math.sin(py * 2) * Math.cos(pz * 2) + Math.sin(pz * 2) * Math.cos(px * 2);
            value = 1.0 / (Math.abs(g) + 0.05);
          } else if (geo === 'diamond') {
            const d = Math.sin(px * 2) * Math.sin(py * 2) * Math.sin(pz * 2) +
                      Math.sin(px * 2) * Math.cos(py * 2) * Math.cos(pz * 2) +
                      Math.cos(px * 2) * Math.sin(py * 2) * Math.cos(pz * 2) +
                      Math.cos(px * 2) * Math.cos(py * 2) * Math.sin(pz * 2);
            value = 1.0 / (Math.abs(d) + 0.05);
          } else if (geo === 'schwarz_p') {
            const s = Math.cos(px * 2) + Math.cos(py * 2) + Math.cos(pz * 2);
            value = 1.0 / (Math.abs(s) + 0.05);
          }

          // Material properties modulate the field:
          // Higher conductivity = smoother field (heat spreads easily)
          // Higher dielectric = sharper boundaries (charge accumulates)
          value *= (1.0 + er * 0.1);
          value *= (1.0 / (k * 10 + 0.5));

          data[x * res * res + y * res + z] = value;
        }
      }
    }

    this.material = {
      resolution: res, bounds, data,
      conductivity: k,
      dielectricConstant: er,
      density: props.density || this.material.density,
    };

    // Reset PSO when material changes
    this.gbestFitness = -Infinity;
    for (const node of this.nodes) {
      node.pbestFitness = -Infinity;
    }
  }

  /** Sample the material field at a world position (trilinear interpolation) */
  sampleField(pos: THREE.Vector3): number {
    const { resolution: res, bounds, data } = this.material;
    const step = (bounds * 2) / (res - 1);

    const fx = (pos.x + bounds) / step;
    const fy = (pos.y + bounds) / step;
    const fz = (pos.z + bounds) / step;

    const x0 = Math.max(0, Math.min(res - 2, Math.floor(fx)));
    const y0 = Math.max(0, Math.min(res - 2, Math.floor(fy)));
    const z0 = Math.max(0, Math.min(res - 2, Math.floor(fz)));
    const dx = fx - x0;
    const dy = fy - y0;
    const dz = fz - z0;

    // Trilinear interpolation
    const c000 = data[x0 * res * res + y0 * res + z0];
    const c100 = data[(x0 + 1) * res * res + y0 * res + z0];
    const c010 = data[x0 * res * res + (y0 + 1) * res + z0];
    const c110 = data[(x0 + 1) * res * res + (y0 + 1) * res + z0];
    const c001 = data[x0 * res * res + y0 * res + (z0 + 1)];
    const c101 = data[(x0 + 1) * res * res + y0 * res + (z0 + 1)];
    const c011 = data[x0 * res * res + (y0 + 1) * res + (z0 + 1)];
    const c111 = data[(x0 + 1) * res * res + (y0 + 1) * res + (z0 + 1)];

    return c000 * (1 - dx) * (1 - dy) * (1 - dz) +
           c100 * dx * (1 - dy) * (1 - dz) +
           c010 * (1 - dx) * dy * (1 - dz) +
           c110 * dx * dy * (1 - dz) +
           c001 * (1 - dx) * (1 - dy) * dz +
           c101 * dx * (1 - dy) * dz +
           c011 * (1 - dx) * dy * dz +
           c111 * dx * dy * dz;
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
      // YZ plane bias — start as ring in YZ, PSO will scatter into 3D
      const pos = new THREE.Vector3(
        (Math.random() - 0.5) * 0.5,  // Small X spread
        Math.cos(angle) * radius,
        Math.sin(angle) * radius
      );

      const fitness = this.sampleField(pos);

      this.nodes.push({
        position: pos.clone(),
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.05,
          (Math.random() - 0.5) * 0.05,
          (Math.random() - 0.5) * 0.05,
        ),
        pbest: pos.clone(),
        fitness,
        pbestFitness: fitness,
        path: [],
        color: this.getCMYColor(i, 0),
        magneticSusceptibility: Math.random()
      });

      if (fitness > this.gbestFitness) {
        this.gbestFitness = fitness;
        this.gbest.copy(pos);
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

    // Adaptive inertia: starts high (explore), decays (exploit)
    const decayRate = 0.9995;
    this.inertiaWeight = Math.max(0.4, this.inertiaWeight * decayRate);

    const positions: number[] = [];
    const colors: number[] = [];
    const linePositions: number[] = [];
    const lineColors: number[] = [];

    this.nodes.forEach((node, idx) => {
      // ── REAL PSO UPDATE ──
      // 1. Evaluate fitness at current position
      node.fitness = this.sampleField(node.position);

      // 2. Update personal best
      if (node.fitness > node.pbestFitness) {
        node.pbestFitness = node.fitness;
        node.pbest.copy(node.position);
      }

      // 3. Update global best
      if (node.fitness > this.gbestFitness) {
        this.gbestFitness = node.fitness;
        this.gbest.copy(node.position);
      }

      // 4. PSO velocity update: v = w*v + c1*r1*(pbest-x) + c2*r2*(gbest-x)
      const r1 = Math.random();
      const r2 = Math.random();

      const cognitive = node.pbest.clone().sub(node.position).multiplyScalar(this.cognitiveWeight * r1);
      const social = this.gbest.clone().sub(node.position).multiplyScalar(this.socialWeight * r2);

      node.velocity.multiplyScalar(this.inertiaWeight);
      node.velocity.add(cognitive);
      node.velocity.add(social);

      // 5. Exclusion forces (prevent collapse to single point)
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

      // 6. Clamp velocity
      const maxSpeed = 0.08 * compressionLevel;
      if (node.velocity.length() > maxSpeed) {
        node.velocity.normalize().multiplyScalar(maxSpeed);
      }

      // 7. Update position
      node.position.add(node.velocity.clone().multiplyScalar(compressionLevel));

      // 8. Boundary reflection
      const bnd = this.material.bounds * 0.95;
      ['x', 'y', 'z'].forEach(axis => {
        const a = axis as 'x' | 'y' | 'z';
        if (Math.abs(node.position[a]) > bnd) {
          node.position[a] = Math.sign(node.position[a]) * bnd;
          node.velocity[a] *= -0.5;
        }
      });

      // Path recording
      node.path.push(node.position.clone());
      if (node.path.length > this.pathLength) node.path.shift();

      // Geometry
      positions.push(node.position.x, node.position.y, node.position.z);

      // Color by fitness: low=cyan, medium=magenta, high=yellow
      const fitnessNorm = Math.min(1, node.fitness / (this.gbestFitness + 0.01));
      const c = new THREE.Color();
      if (fitnessNorm < 0.5) c.setRGB(0, 1 - fitnessNorm, 1);
      else c.setRGB(fitnessNorm, 1 - fitnessNorm * 0.5, fitnessNorm * 0.5);
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
    this._lastKE = ke;

    // Update geometry
    this.points.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.points.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    this.lines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    this.lines.geometry.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));
    this.lines.geometry.attributes.position.needsUpdate = true;
    this.lines.geometry.attributes.color.needsUpdate = true;
  }

  getAnalysis() {
    const positions = this.nodes.map(n => n.position);
    if (positions.length < 3) return {
      bounds: new THREE.Box3(), size: new THREE.Vector3(),
      normal: new THREE.Vector3(0, 1, 0), center: new THREE.Vector3(),
      isStable: false, kineticEnergy: 0, stabilizationCount: 0, avgFitness: 0,
    };

    const bounds = new THREE.Box3().setFromPoints(positions);
    const size = new THREE.Vector3();
    bounds.getSize(size);

    let mean = new THREE.Vector3();
    positions.forEach(p => mean.add(p));
    mean.divideScalar(positions.length);

    const avgFitness = this.nodes.reduce((s, n) => s + n.fitness, 0) / this.nodes.length;

    return {
      bounds, size, normal: new THREE.Vector3(0, 1, 0), center: mean,
      isStable: this.isStable(),
      kineticEnergy: this.getKineticEnergy(),
      stabilizationCount: this.stabilizations.length,
      avgFitness,
    };
  }

  getLatestStabilization(): Stabilization | null {
    return this.stabilizations.length > 0 ? this.stabilizations[this.stabilizations.length - 1] : null;
  }

  getSettledNodes(): THREE.Vector3[] {
    return this.settledPositions.length > 0
      ? this.settledPositions
      : this.nodes.map(n => n.position.clone());
  }

  getMaterial(): MaterialField { return this.material; }

  saveState() {
    return this.nodes.map(n => ({
      p: [n.position.x, n.position.y, n.position.z],
      v: [n.velocity.x, n.velocity.y, n.velocity.z],
      c: n.color.getHex(),
      f: n.fitness,
    }));
  }

  loadState(state: any[]) {
    if (!state || !Array.isArray(state)) return;
    this.nodes = state.map(s => ({
      position: new THREE.Vector3(...s.p),
      velocity: new THREE.Vector3(...s.v),
      pbest: new THREE.Vector3(...s.p),
      fitness: s.f || 0, pbestFitness: s.f || 0,
      path: [],
      color: new THREE.Color(s.c),
      magneticSusceptibility: Math.random()
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
