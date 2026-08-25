import * as THREE from 'three';
import type { Edge } from './v3';

/**
 * V5 — Architectural Boundary Plane Generator
 *
 * Takes edges from V3 (0° view) and V4 (90° view).
 * Instead of just finding triangles, generates REAL architectural planes:
 *
 *   Thermal:    Room walls, floor/ceiling, spiral heat exchanger surfaces
 *   Electrical: PCB layer stackup (signal, ground, power, shield planes)
 *   Blockchain: Network segment partitions, radial routing planes
 *   Math:       Abstract manifold boundary surfaces
 *
 * "Walls" = flow-channeling boundaries applicable to ALL optimizer types.
 * These planes define WHERE flow can go (channels between walls)
 * and WHERE flow is blocked (the wall surfaces themselves).
 *
 * V6 reads the boundary planes to simulate detailed flow within channels.
 */

export type MembraneType = 'hollow' | 'insulating' | 'propagating';
export type MembraneState = 'closed' | 'open' | 'shrinking' | 'growing';

export type PlaneRole =
  | 'wall'        // Vertical boundary (room wall, partition)
  | 'floor'       // Horizontal bottom
  | 'ceiling'     // Horizontal top
  | 'partition'   // Internal divider
  | 'spiral'      // Spiral heat exchanger surface
  | 'layer'       // PCB signal/ground/power layer
  | 'shield'      // EM shielding plane
  | 'manifold';   // Abstract topological surface

export interface BoundaryPlane {
  id: number;
  center: THREE.Vector3;
  normal: THREE.Vector3;
  up: THREE.Vector3;
  width: number;
  height: number;
  role: PlaneRole;
  membraneType: MembraneType;
  state: MembraneState;
  conductivity: number;    // 0=block, 1=transparent
  area: number;
  spiralAngle?: number;
  spiralRadius?: number;
  layerIndex?: number;     // PCB layer number
}

// Legacy interface — V6/V7 still use this
export interface DetectedLoop {
  nodeIndices: number[];
  vertices: THREE.Vector3[];
  center: THREE.Vector3;
  normal: THREE.Vector3;
  area: number;
  perimeter: number;
  source: 'v3' | 'v4' | 'combined';
  membraneType: MembraneType;
  state: MembraneState;
}

export class V5Engine {
  scene: THREE.Scene;

  // Legacy groups (kept for App.tsx visibility compat)
  meshGroup: THREE.Group;
  wireframeGroup: THREE.Group;
  pointCloud: THREE.Points;

  // NEW architectural groups
  wallGroup: THREE.Group;        // Wall/partition planes
  floorCeilGroup: THREE.Group;   // Floor and ceiling planes
  spiralGroup: THREE.Group;      // Spiral heat exchanger geometry
  layerGroup: THREE.Group;       // PCB layer planes

  allNodes: THREE.Vector3[] = [];
  allEdges: Edge[] = [];

  // Legacy loops for V6/V7 compat
  loops: DetectedLoop[] = [];

  // New architectural planes
  boundaryPlanes: BoundaryPlane[] = [];

  private _captured: boolean = false;
  private _framesSinceCapture: number = 0;
  private _optimizer: string = 'thermal';
  private _frameCount: number = 0;
  private _bounds: number = 2.0;
  private _spiralAngle: number = 0;
  private _captureSignature: string = '';

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Legacy mesh group (V5 membrane faces)
    this.meshGroup = new THREE.Group();
    this.scene.add(this.meshGroup);

    this.wireframeGroup = new THREE.Group();
    this.scene.add(this.wireframeGroup);

    const ptGeo = new THREE.BufferGeometry();
    const ptMat = new THREE.PointsMaterial({ size: 0.06, color: 0xffff00, transparent: true, opacity: 0.5 });
    this.pointCloud = new THREE.Points(ptGeo, ptMat);
    this.scene.add(this.pointCloud);

    // Architectural groups
    this.wallGroup = new THREE.Group();
    this.scene.add(this.wallGroup);

    this.floorCeilGroup = new THREE.Group();
    this.scene.add(this.floorCeilGroup);

    this.spiralGroup = new THREE.Group();
    this.scene.add(this.spiralGroup);

    this.layerGroup = new THREE.Group();
    this.scene.add(this.layerGroup);
  }

  /**
   * Capture edges from V3 and V4, merge node sets, generate architecture.
   */
  captureFromV3V4(
    v3Nodes: THREE.Vector3[], v3Edges: Edge[],
    v4Nodes: THREE.Vector3[], v4Edges: Edge[],
    optimizer: string = 'thermal'
  ) {
    const signature = [
      optimizer,
      ...v3Nodes.map(p => `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`),
      'v4',
      ...v4Nodes.map(p => `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`),
      `e:${v3Edges.length}:${v4Edges.length}`,
    ].join('|');
    if (signature === this._captureSignature) return;
    this._captureSignature = signature;
    this._optimizer = optimizer;

    // Merge node sets
    this.allNodes = [
      ...v3Nodes.map(p => p.clone()),
      ...v4Nodes.map(p => p.clone()),
    ];
    const v3Count = v3Nodes.length;

    this.allEdges = [
      ...v3Edges.map(e => ({ ...e })),
      ...v4Edges.map(e => ({ a: e.a + v3Count, b: e.b + v3Count, length: e.length, isMST: e.isMST })),
    ];

    // Cross-edges: bridge V3↔V4 nodes
    for (let i = 0; i < v3Count; i++) {
      for (let j = 0; j < v4Nodes.length; j++) {
        const d = v3Nodes[i].distanceTo(v4Nodes[j]);
        if (d < 0.8) {
          this.allEdges.push({ a: i, b: j + v3Count, length: d, isMST: false });
        }
      }
    }

    // Step 1: find legacy loops for V6/V7 compat
    this._findLoops(optimizer);

    // Step 2: generate architectural planes from topology
    this._generateArchitecturalPlanes(optimizer);

    // Step 3: build all visual geometry
    this._buildAllGeometry();

    this._captured = true;
    this._framesSinceCapture = 0;
  }

  // ── LEGACY LOOP DETECTION (for V6/V7 backward compat) ──

  private _findLoops(optimizer: string) {
    this.loops = [];
    const N = this.allNodes.length;
    if (N < 3) return;

    const adj: Set<number>[] = Array.from({ length: N }, () => new Set());
    for (const e of this.allEdges) {
      if (e.a < N && e.b < N) {
        adj[e.a].add(e.b);
        adj[e.b].add(e.a);
      }
    }

    const foundTriangles = new Set<string>();
    for (let a = 0; a < N; a++) {
      for (const b of adj[a]) {
        if (b <= a) continue;
        for (const c of adj[b]) {
          if (c <= b) continue;
          if (adj[a].has(c)) {
            const key = `${a}-${b}-${c}`;
            if (!foundTriangles.has(key)) {
              foundTriangles.add(key);
              const verts = [this.allNodes[a], this.allNodes[b], this.allNodes[c]];
              const center = new THREE.Vector3().add(verts[0]).add(verts[1]).add(verts[2]).divideScalar(3);
              const ab = new THREE.Vector3().subVectors(verts[1], verts[0]);
              const ac = new THREE.Vector3().subVectors(verts[2], verts[0]);
              const normal = new THREE.Vector3().crossVectors(ab, ac).normalize();
              const area = new THREE.Vector3().crossVectors(ab, ac).length() * 0.5;
              const perimeter = verts[0].distanceTo(verts[1]) + verts[1].distanceTo(verts[2]) + verts[2].distanceTo(verts[0]);
              this.loops.push({
                nodeIndices: [a, b, c], vertices: verts,
                center, normal, area, perimeter,
                source: 'combined',
                membraneType: this._pickMembraneType(optimizer, area),
                state: 'closed',
              });
            }
          }
        }
      }
    }

    if (this.loops.length > 200) {
      this.loops.sort((a, b) => b.area - a.area);
      this.loops = this.loops.slice(0, 200);
    }

    // Augment loops with boundary plane data so V6 can use planes too
    for (const loop of this.loops) {
      this.boundaryPlanes.push({
        id: this.boundaryPlanes.length,
        center: loop.center.clone(),
        normal: loop.normal.clone(),
        up: new THREE.Vector3(0, 1, 0),
        width: Math.sqrt(loop.area),
        height: Math.sqrt(loop.area),
        role: 'partition',
        membraneType: loop.membraneType,
        state: loop.state,
        conductivity: loop.membraneType === 'propagating' ? 0.8 : loop.membraneType === 'hollow' ? 0.4 : 0.05,
        area: loop.area,
      });
    }
  }

  private _pickMembraneType(optimizer: string, area: number): MembraneType {
    if (optimizer === 'thermal') {
      if (area > 0.5) return 'propagating';
      if (area > 0.2) return 'hollow';
      return 'insulating';
    }
    if (optimizer === 'electrical') {
      return area > 0.3 ? 'propagating' : 'insulating';
    }
    return 'hollow';
  }

  // ── ARCHITECTURAL PLANE GENERATION ──

  private _generateArchitecturalPlanes(optimizer: string) {
    // Compute bounding box from node cloud
    const bbox = new THREE.Box3();
    for (const n of this.allNodes) bbox.expandByPoint(n);
    if (this.allNodes.length === 0) {
      bbox.set(new THREE.Vector3(-this._bounds, -this._bounds, -this._bounds),
               new THREE.Vector3(this._bounds, this._bounds, this._bounds));
    }

    const center = new THREE.Vector3();
    bbox.getCenter(center);
    const size = new THREE.Vector3();
    bbox.getSize(size);

    // Ensure minimum size
    size.x = Math.max(size.x, 2.0);
    size.y = Math.max(size.y, 2.0);
    size.z = Math.max(size.z, 2.0);

    switch (optimizer) {
      case 'thermal':
        this._generateThermalArchitecture(center, size);
        break;
      case 'electrical':
        this._generateElectricalArchitecture(center, size);
        break;
      case 'blockchain':
        this._generateBlockchainArchitecture(center, size);
        break;
      case 'math':
        this._generateMathArchitecture(center, size);
        break;
    }
  }

  /**
   * THERMAL architecture:
   * - Outer room walls (4 vertical planes)
   * - Floor and ceiling
   * - Archimedean spiral heat exchanger walls inside
   * - Internal partition walls from node clusters
   */
  private _generateThermalArchitecture(center: THREE.Vector3, size: THREE.Vector3) {
    const hx = size.x * 0.6;
    const hy = size.y * 0.5;
    const hz = size.z * 0.6;

    // ── OUTER WALLS ──
    // North wall (faces -Z)
    this._addPlane(center.clone().add(new THREE.Vector3(0, 0, hz)), new THREE.Vector3(0, 0, -1),
      hx * 2, hy * 2, 'wall', 'insulating', 0.05);
    // South wall (faces +Z)
    this._addPlane(center.clone().add(new THREE.Vector3(0, 0, -hz)), new THREE.Vector3(0, 0, 1),
      hx * 2, hy * 2, 'wall', 'insulating', 0.05);
    // East wall (faces -X)
    this._addPlane(center.clone().add(new THREE.Vector3(hx, 0, 0)), new THREE.Vector3(-1, 0, 0),
      hz * 2, hy * 2, 'wall', 'insulating', 0.05);
    // West wall (faces +X)
    this._addPlane(center.clone().add(new THREE.Vector3(-hx, 0, 0)), new THREE.Vector3(1, 0, 0),
      hz * 2, hy * 2, 'wall', 'insulating', 0.05);

    // ── FLOOR / CEILING ──
    this._addPlane(center.clone().add(new THREE.Vector3(0, -hy, 0)), new THREE.Vector3(0, 1, 0),
      hx * 2, hz * 2, 'floor', 'insulating', 0.1);
    this._addPlane(center.clone().add(new THREE.Vector3(0, hy, 0)), new THREE.Vector3(0, -1, 0),
      hx * 2, hz * 2, 'ceiling', 'hollow', 0.3);

    // ── SPIRAL HEAT EXCHANGER ──
    // Archimedean spiral: r = a + b*θ
    const spiralTurns = 3.5;
    const spiralSegments = 48;
    const innerR = hx * 0.15;
    const outerR = hx * 0.85;
    const spiralHeight = hy * 1.4;
    const b = (outerR - innerR) / (spiralTurns * Math.PI * 2);

    for (let i = 0; i < spiralSegments; i++) {
      const t0 = (i / spiralSegments) * spiralTurns * Math.PI * 2;
      const t1 = ((i + 1) / spiralSegments) * spiralTurns * Math.PI * 2;
      const r0 = innerR + b * t0;
      const r1 = innerR + b * t1;

      const x0 = center.x + r0 * Math.cos(t0);
      const z0 = center.z + r0 * Math.sin(t0);
      const x1 = center.x + r1 * Math.cos(t1);
      const z1 = center.z + r1 * Math.sin(t1);

      const segCenter = new THREE.Vector3((x0 + x1) / 2, center.y, (z0 + z1) / 2);
      const segDir = new THREE.Vector3(x1 - x0, 0, z1 - z0).normalize();
      const segNormal = new THREE.Vector3(-segDir.z, 0, segDir.x); // perpendicular in XZ
      const segLen = Math.sqrt((x1 - x0) ** 2 + (z1 - z0) ** 2);

      const plane = this._addPlane(segCenter, segNormal,
        segLen * 1.1, spiralHeight, 'spiral', 'propagating', 0.7);
      plane.spiralAngle = (t0 + t1) / 2;
      plane.spiralRadius = (r0 + r1) / 2;
    }

    // ── INTERNAL PARTITIONS from node clusters ──
    this._generatePartitionsFromNodes(center, size, 'thermal');
  }

  /**
   * ELECTRICAL architecture:
   * - PCB layer stackup (4 horizontal layers)
   * - Via columns connecting layers
   * - Ground plane shield
   * - Signal routing channels between layers
   */
  private _generateElectricalArchitecture(center: THREE.Vector3, size: THREE.Vector3) {
    const hx = size.x * 0.7;
    const hz = size.z * 0.7;
    const layerSpacing = size.y * 0.2;
    const layers = [
      { name: 'top_signal', y: center.y + layerSpacing * 1.5, type: 'propagating' as MembraneType, cond: 0.9 },
      { name: 'ground', y: center.y + layerSpacing * 0.5, type: 'insulating' as MembraneType, cond: 0.02 },
      { name: 'power', y: center.y - layerSpacing * 0.5, type: 'propagating' as MembraneType, cond: 0.85 },
      { name: 'bottom_signal', y: center.y - layerSpacing * 1.5, type: 'propagating' as MembraneType, cond: 0.9 },
    ];

    // ── PCB LAYERS ──
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i];
      const plane = this._addPlane(
        new THREE.Vector3(center.x, layer.y, center.z),
        new THREE.Vector3(0, 1, 0),
        hx * 2, hz * 2, 'layer', layer.type, layer.cond
      );
      plane.layerIndex = i;
    }

    // ── SHIELD WALLS (board edges) ──
    const boardH = layerSpacing * 3.5;
    this._addPlane(center.clone().add(new THREE.Vector3(hx, 0, 0)), new THREE.Vector3(-1, 0, 0),
      hz * 2, boardH, 'shield', 'insulating', 0.01);
    this._addPlane(center.clone().add(new THREE.Vector3(-hx, 0, 0)), new THREE.Vector3(1, 0, 0),
      hz * 2, boardH, 'shield', 'insulating', 0.01);
    this._addPlane(center.clone().add(new THREE.Vector3(0, 0, hz)), new THREE.Vector3(0, 0, -1),
      hx * 2, boardH, 'shield', 'insulating', 0.01);
    this._addPlane(center.clone().add(new THREE.Vector3(0, 0, -hz)), new THREE.Vector3(0, 0, 1),
      hx * 2, boardH, 'shield', 'insulating', 0.01);

    // ── VIA COLUMNS (vertical partitions connecting layers) ──
    const viaCount = 8;
    for (let i = 0; i < viaCount; i++) {
      const angle = (i / viaCount) * Math.PI * 2;
      const radius = hx * 0.5;
      const viaX = center.x + radius * Math.cos(angle);
      const viaZ = center.z + radius * Math.sin(angle);
      const viaNormal = new THREE.Vector3(Math.cos(angle + Math.PI / 2), 0, Math.sin(angle + Math.PI / 2));

      this._addPlane(new THREE.Vector3(viaX, center.y, viaZ), viaNormal,
        0.15, boardH, 'partition', 'propagating', 0.95);
    }

    this._generatePartitionsFromNodes(center, size, 'electrical');
  }

  /**
   * BLOCKCHAIN architecture:
   * - Radial partition planes (network segments)
   * - Concentric ring walls (routing layers)
   * - Central hub floor
   * - Outer boundary walls
   */
  private _generateBlockchainArchitecture(center: THREE.Vector3, size: THREE.Vector3) {
    const hx = size.x * 0.6;
    const hy = size.y * 0.4;
    const hz = size.z * 0.6;
    const radius = Math.min(hx, hz);

    // ── RADIAL PARTITIONS (network segments) ──
    const segments = 6;
    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      const normal = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
      const planeCenter = center.clone().add(
        new THREE.Vector3(Math.cos(angle) * radius * 0.5, 0, Math.sin(angle) * radius * 0.5)
      );
      this._addPlane(planeCenter, normal, radius, hy * 2, 'partition', 'propagating', 0.6);
    }

    // ── CONCENTRIC RING WALLS ──
    const rings = 3;
    for (let r = 1; r <= rings; r++) {
      const ringRadius = radius * (r / (rings + 1));
      const ringSegments = 16 + r * 8;
      for (let i = 0; i < ringSegments; i++) {
        const t0 = (i / ringSegments) * Math.PI * 2;
        const t1 = ((i + 1) / ringSegments) * Math.PI * 2;
        const x0 = center.x + ringRadius * Math.cos(t0);
        const z0 = center.z + ringRadius * Math.sin(t0);
        const x1 = center.x + ringRadius * Math.cos(t1);
        const z1 = center.z + ringRadius * Math.sin(t1);
        const segCenter = new THREE.Vector3((x0 + x1) / 2, center.y, (z0 + z1) / 2);
        const segDir = new THREE.Vector3(x1 - x0, 0, z1 - z0).normalize();
        const segNormal = new THREE.Vector3(-segDir.z, 0, segDir.x);
        const segLen = Math.sqrt((x1 - x0) ** 2 + (z1 - z0) ** 2);

        const type: MembraneType = r === rings ? 'insulating' : 'hollow';
        this._addPlane(segCenter, segNormal, segLen * 1.1, hy * 1.5, 'wall', type,
          type === 'insulating' ? 0.1 : 0.5);
      }
    }

    // ── FLOOR (hub) ──
    this._addPlane(center.clone().add(new THREE.Vector3(0, -hy, 0)), new THREE.Vector3(0, 1, 0),
      radius * 2, radius * 2, 'floor', 'propagating', 0.8);

    this._generatePartitionsFromNodes(center, size, 'blockchain');
  }

  /**
   * MATH architecture:
   * - Möbius-strip-inspired twisted planes
   * - Intersecting manifold surfaces
   * - Golden-ratio proportioned partitions
   */
  private _generateMathArchitecture(center: THREE.Vector3, size: THREE.Vector3) {
    const hx = size.x * 0.5;
    const hy = size.y * 0.5;
    const hz = size.z * 0.5;
    const PHI = (1 + Math.sqrt(5)) / 2;

    // ── TWISTED MANIFOLD STRIPS (Möbius-inspired) ──
    const stripSegments = 32;
    const stripRadius = hx * 0.7;
    const stripWidth = hy * 0.6;
    for (let i = 0; i < stripSegments; i++) {
      const t = (i / stripSegments) * Math.PI * 2;
      const twist = t * 0.5; // Half-twist = Möbius
      const x = center.x + stripRadius * Math.cos(t);
      const z = center.z + stripRadius * Math.sin(t);
      const tangent = new THREE.Vector3(-Math.sin(t), 0, Math.cos(t));
      // Normal rotates with twist
      const baseNormal = new THREE.Vector3(-Math.cos(t), 0, -Math.sin(t));
      const upComponent = new THREE.Vector3(0, 1, 0);
      const normal = baseNormal.clone().multiplyScalar(Math.cos(twist))
        .add(upComponent.clone().multiplyScalar(Math.sin(twist))).normalize();

      const segLen = (2 * Math.PI * stripRadius) / stripSegments;
      this._addPlane(new THREE.Vector3(x, center.y, z), normal,
        segLen * 1.1, stripWidth, 'manifold', 'hollow', 0.4);
    }

    // ── GOLDEN RATIO PARTITIONS ──
    // Planes at golden-ratio positions
    const positions = [-1 / PHI, 0, 1 / PHI];
    for (const px of positions) {
      this._addPlane(center.clone().add(new THREE.Vector3(px * hx, 0, 0)),
        new THREE.Vector3(1, 0, 0), hz * 1.5, hy * 1.5, 'partition', 'propagating', 0.6);
    }
    for (const pz of positions) {
      this._addPlane(center.clone().add(new THREE.Vector3(0, 0, pz * hz)),
        new THREE.Vector3(0, 0, 1), hx * 1.5, hy * 1.5, 'partition', 'propagating', 0.6);
    }

    // ── FLOOR / CEILING manifold ──
    this._addPlane(center.clone().add(new THREE.Vector3(0, -hy * 0.8, 0)), new THREE.Vector3(0, 1, 0),
      hx * 1.8, hz * 1.8, 'floor', 'hollow', 0.3);

    this._generatePartitionsFromNodes(center, size, 'math');
  }

  /** Generate partition planes from V3/V4 node clusters */
  private _generatePartitionsFromNodes(center: THREE.Vector3, size: THREE.Vector3, optimizer: string) {
    if (this.allNodes.length < 6) return;

    // Find clusters of coplanar-ish nodes using simple spatial binning
    const binSize = Math.max(size.x, size.z) * 0.3;
    const bins = new Map<string, THREE.Vector3[]>();

    for (const node of this.allNodes) {
      const bx = Math.floor(node.x / binSize);
      const bz = Math.floor(node.z / binSize);
      const key = `${bx},${bz}`;
      if (!bins.has(key)) bins.set(key, []);
      bins.get(key)!.push(node);
    }

    // Between adjacent bins with enough nodes, place a partition wall
    let partitionCount = 0;
    const maxPartitions = 8;
    for (const [key, nodes] of bins) {
      if (nodes.length < 2 || partitionCount >= maxPartitions) continue;
      const [bx, bz] = key.split(',').map(Number);

      // Check right neighbor
      const rightKey = `${bx + 1},${bz}`;
      if (bins.has(rightKey) && bins.get(rightKey)!.length >= 2) {
        const avgY = nodes.reduce((s, n) => s + n.y, 0) / nodes.length;
        const wallX = (bx + 1) * binSize;
        const wallZ = bz * binSize + binSize * 0.5;
        this._addPlane(
          new THREE.Vector3(wallX, avgY, wallZ),
          new THREE.Vector3(1, 0, 0),
          binSize * 0.8, size.y * 0.6,
          'partition',
          optimizer === 'thermal' ? 'hollow' : 'propagating',
          optimizer === 'thermal' ? 0.3 : 0.7
        );
        partitionCount++;
      }

      // Check front neighbor
      const frontKey = `${bx},${bz + 1}`;
      if (bins.has(frontKey) && bins.get(frontKey)!.length >= 2 && partitionCount < maxPartitions) {
        const avgY = nodes.reduce((s, n) => s + n.y, 0) / nodes.length;
        const wallX = bx * binSize + binSize * 0.5;
        const wallZ = (bz + 1) * binSize;
        this._addPlane(
          new THREE.Vector3(wallX, avgY, wallZ),
          new THREE.Vector3(0, 0, 1),
          binSize * 0.8, size.y * 0.6,
          'partition',
          optimizer === 'thermal' ? 'hollow' : 'propagating',
          optimizer === 'thermal' ? 0.3 : 0.7
        );
        partitionCount++;
      }
    }
  }

  /** Add a boundary plane and return it */
  private _addPlane(center: THREE.Vector3, normal: THREE.Vector3, width: number, height: number,
    role: PlaneRole, membraneType: MembraneType, conductivity: number): BoundaryPlane {
    const plane: BoundaryPlane = {
      id: this.boundaryPlanes.length,
      center: center.clone(),
      normal: normal.clone().normalize(),
      up: Math.abs(normal.y) > 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0),
      width, height, role, membraneType, state: 'closed',
      conductivity,
      area: width * height,
    };
    this.boundaryPlanes.push(plane);
    return plane;
  }

  // ── GEOMETRY BUILDING ──

  private _buildAllGeometry() {
    this._clearGroup(this.meshGroup);
    this._clearGroup(this.wireframeGroup);
    this._clearGroup(this.wallGroup);
    this._clearGroup(this.floorCeilGroup);
    this._clearGroup(this.spiralGroup);
    this._clearGroup(this.layerGroup);

    for (const plane of this.boundaryPlanes) {
      if (plane.state === 'open') continue;
      this._buildPlaneGeometry(plane);
    }

    // Update point cloud (boundary plane centers)
    const ptPos: number[] = [];
    for (const p of this.boundaryPlanes) {
      if (p.state !== 'open') ptPos.push(p.center.x, p.center.y, p.center.z);
    }
    this.pointCloud.geometry.setAttribute('position', new THREE.Float32BufferAttribute(ptPos, 3));
    this.pointCloud.geometry.attributes.position.needsUpdate = true;
  }

  private _buildPlaneGeometry(plane: BoundaryPlane) {
    // Create plane mesh
    const geo = new THREE.PlaneGeometry(plane.width, plane.height, 1, 1);

    // Orient plane to face its normal
    const quat = new THREE.Quaternion();
    quat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), plane.normal);
    geo.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(quat));
    geo.translate(plane.center.x, plane.center.y, plane.center.z);

    // Color by role and type
    const color = this._getPlaneColor(plane);
    const opacity = this._getPlaneOpacity(plane);

    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);

    // Wireframe outline
    const edges = new THREE.EdgesGeometry(geo);
    const lineMat = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: Math.min(1.0, opacity * 2.5),
    });
    const wireframe = new THREE.LineSegments(edges, lineMat);

    // Add to appropriate group
    const targetGroup = this._getTargetGroup(plane.role);
    targetGroup.add(mesh);
    this.wireframeGroup.add(wireframe);
  }

  private _getPlaneColor(plane: BoundaryPlane): number {
    // Role-based coloring
    switch (plane.role) {
      case 'wall': return plane.membraneType === 'insulating' ? 0x4488ff : 0x88ccff;
      case 'floor': return 0x66aa44;
      case 'ceiling': return 0x44aa88;
      case 'partition': return plane.membraneType === 'propagating' ? 0xff6644 : 0xffaa44;
      case 'spiral': return 0xff3366;
      case 'layer': return plane.membraneType === 'propagating' ? 0x44ffaa : 0x2266aa;
      case 'shield': return 0x8844ff;
      case 'manifold': return 0xcc66ff;
    }
  }

  private _getPlaneOpacity(plane: BoundaryPlane): number {
    const baseOpacity = plane.state === 'shrinking' ? 0.1 : plane.state === 'growing' ? 0.35 : 0.22;
    switch (plane.role) {
      case 'wall': return baseOpacity * 1.2;
      case 'floor': case 'ceiling': return baseOpacity * 0.8;
      case 'spiral': return baseOpacity * 1.5;
      case 'layer': return baseOpacity * 1.0;
      case 'shield': return baseOpacity * 0.6;
      case 'partition': return baseOpacity * 1.0;
      case 'manifold': return baseOpacity * 1.3;
    }
  }

  private _getTargetGroup(role: PlaneRole): THREE.Group {
    switch (role) {
      case 'wall': case 'partition': return this.wallGroup;
      case 'floor': case 'ceiling': return this.floorCeilGroup;
      case 'spiral': return this.spiralGroup;
      case 'layer': case 'shield': return this.layerGroup;
      case 'manifold': return this.wallGroup;
    }
  }

  private _clearGroup(group: THREE.Group) {
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      if ((child as THREE.Mesh).geometry) (child as THREE.Mesh).geometry.dispose();
      if ((child as THREE.Mesh).material) ((child as THREE.Mesh).material as THREE.Material).dispose();
    }
  }

  // ── UPDATE / ANIMATION ──

  update() {
    if (!this._captured) return;
    this._framesSinceCapture++;
    this._frameCount++;

    // Animate spiral planes with subtle rotation pulse
    if (this._optimizer === 'thermal' && this._frameCount % 3 === 0) {
      this._spiralAngle += 0.002;
      for (const child of this.spiralGroup.children) {
        if (child instanceof THREE.Mesh) {
          const mat = child.material as THREE.MeshBasicMaterial;
          const pulse = 0.15 + Math.sin(this._frameCount * 0.02) * 0.08;
          mat.opacity = pulse;
        }
      }
    }

    // Electrical: pulse layers to show signal propagation
    if (this._optimizer === 'electrical' && this._frameCount % 2 === 0) {
      let layerIdx = 0;
      for (const child of this.layerGroup.children) {
        if (child instanceof THREE.Mesh) {
          const mat = child.material as THREE.MeshBasicMaterial;
          const wave = Math.sin(this._frameCount * 0.05 + layerIdx * 1.5) * 0.5 + 0.5;
          mat.opacity = 0.1 + wave * 0.15;
          layerIdx++;
        }
      }
    }
  }

  isStable() { return this._captured && this._framesSinceCapture > 5; }

  // ── V6/V7 INTERFACE ──

  setMembraneState(loopIndex: number, state: MembraneState) {
    if (loopIndex >= 0 && loopIndex < this.loops.length) {
      if (this.loops[loopIndex].state === state) return;
      this.loops[loopIndex].state = state;
      // Also update corresponding boundary plane
      if (loopIndex < this.boundaryPlanes.length) {
        this.boundaryPlanes[loopIndex].state = state;
      }
      this._buildAllGeometry();
    }
  }

  setMembraneType(loopIndex: number, type: MembraneType) {
    if (loopIndex >= 0 && loopIndex < this.loops.length) {
      if (this.loops[loopIndex].membraneType === type) return;
      this.loops[loopIndex].membraneType = type;
      if (loopIndex < this.boundaryPlanes.length) {
        this.boundaryPlanes[loopIndex].membraneType = type;
      }
      this._buildAllGeometry();
    }
  }

  getLoops(): DetectedLoop[] { return this.loops; }
  getClosedLoops(): DetectedLoop[] { return this.loops.filter(l => l.state !== 'open'); }
  getOpenLoops(): DetectedLoop[] { return this.loops.filter(l => l.state === 'open'); }
  getBoundaryPlanes(): BoundaryPlane[] { return this.boundaryPlanes; }
  getArchitecturalPlanes(role?: PlaneRole): BoundaryPlane[] {
    return role ? this.boundaryPlanes.filter(p => p.role === role) : this.boundaryPlanes;
  }
  getSpiralPlanes(): BoundaryPlane[] { return this.boundaryPlanes.filter(p => p.role === 'spiral'); }
  getTotalArea(): number { return this.loops.reduce((sum, l) => sum + (l.state !== 'open' ? l.area : 0), 0); }
  getMembraneCount(): { hollow: number; insulating: number; propagating: number } {
    const counts = { hollow: 0, insulating: 0, propagating: 0 };
    for (const l of this.loops) if (l.state !== 'open') counts[l.membraneType]++;
    return counts;
  }

  saveState() {
    return {
      loops: this.loops.map(l => ({
        indices: l.nodeIndices, type: l.membraneType, state: l.state, area: l.area,
      })),
      planes: this.boundaryPlanes.length,
      roles: {
        walls: this.boundaryPlanes.filter(p => p.role === 'wall').length,
        floors: this.boundaryPlanes.filter(p => p.role === 'floor' || p.role === 'ceiling').length,
        spirals: this.boundaryPlanes.filter(p => p.role === 'spiral').length,
        layers: this.boundaryPlanes.filter(p => p.role === 'layer').length,
        partitions: this.boundaryPlanes.filter(p => p.role === 'partition').length,
      },
    };
  }

  loadState(state: any) {
    if (!state?.loops || !Array.isArray(state.loops) || this.loops.length === 0) return;
    for (let i = 0; i < Math.min(this.loops.length, state.loops.length); i++) {
      const saved = state.loops[i];
      if (saved?.type) this.loops[i].membraneType = saved.type;
      if (saved?.state) this.loops[i].state = saved.state;
      if (i < this.boundaryPlanes.length) {
        this.boundaryPlanes[i].membraneType = this.loops[i].membraneType;
        this.boundaryPlanes[i].state = this.loops[i].state;
      }
    }
    this._buildAllGeometry();
  }

  dispose() {
    this.scene.remove(this.meshGroup);
    this.scene.remove(this.wireframeGroup);
    this.scene.remove(this.pointCloud);
    this.scene.remove(this.wallGroup);
    this.scene.remove(this.floorCeilGroup);
    this.scene.remove(this.spiralGroup);
    this.scene.remove(this.layerGroup);
    this._clearGroup(this.meshGroup);
    this._clearGroup(this.wireframeGroup);
    this._clearGroup(this.wallGroup);
    this._clearGroup(this.floorCeilGroup);
    this._clearGroup(this.spiralGroup);
    this._clearGroup(this.layerGroup);
    this.pointCloud.geometry.dispose();
    (this.pointCloud.material as THREE.Material).dispose();
  }
}
