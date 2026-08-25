import * as THREE from 'three';

/**
 * V3 — Shortest Route Connections from V1 Settled Nodes
 *
 * Takes V1's stabilized positions and computes:
 *   1. Delaunay-like nearest-neighbor graph (connect each node to its K nearest)
 *   2. Minimum Spanning Tree (Prim's algorithm on the neighbor graph)
 *   3. Shortest path network (MST edges = the "discovered" connections)
 *
 * These line segments are the data V5 consumes to find closed loops → planes.
 */

export interface Edge {
  a: number;   // index into nodes
  b: number;
  length: number;
  isMST: boolean;  // true if part of minimum spanning tree
}

export class V3Engine {
  scene: THREE.Scene;
  points: THREE.Points;
  mstLines: THREE.LineSegments;     // MST edges (thick, bright)
  neighborLines: THREE.LineSegments; // All neighbor edges (thin, dim)

  nodes: THREE.Vector3[] = [];
  edges: Edge[] = [];
  mstEdges: Edge[] = [];
  neighborK: number = 6; // connect each node to K nearest neighbors

  // Stability tracking
  private _captured: boolean = false;
  private _framesSinceCapture: number = 0;
  private _captureSignature: string = '';

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Points
    const ptGeo = new THREE.BufferGeometry();
    const ptMat = new THREE.PointsMaterial({ size: 0.1, vertexColors: true, transparent: true, opacity: 0.9 });
    this.points = new THREE.Points(ptGeo, ptMat);
    this.scene.add(this.points);

    // MST lines (primary structure)
    const mstGeo = new THREE.BufferGeometry();
    const mstMat = new THREE.LineBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.8, linewidth: 2 });
    this.mstLines = new THREE.LineSegments(mstGeo, mstMat);
    this.scene.add(this.mstLines);

    // Neighbor lines (secondary, dimmer)
    const nbGeo = new THREE.BufferGeometry();
    const nbMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.15 });
    this.neighborLines = new THREE.LineSegments(nbGeo, nbMat);
    this.scene.add(this.neighborLines);
  }

  /** Capture settled positions from V1 */
  captureFromV1(settledNodes: THREE.Vector3[]) {
    if (!settledNodes || settledNodes.length < 3) return;
    const signature = settledNodes
      .map(p => `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`)
      .join('|');
    if (signature === this._captureSignature) return;
    this._captureSignature = signature;
    this.nodes = settledNodes.map(p => p.clone());
    this._buildGraph();
    this._captured = true;
    this._framesSinceCapture = 0;
  }

  /** Build K-nearest-neighbor graph + MST */
  private _buildGraph() {
    const N = this.nodes.length;
    if (N < 2) return;

    // 1. Build all-pairs distance (only compute K nearest per node)
    this.edges = [];
    const adjList: number[][] = Array.from({ length: N }, () => []);

    for (let i = 0; i < N; i++) {
      // Compute distances to all other nodes
      const dists: { j: number; d: number }[] = [];
      for (let j = 0; j < N; j++) {
        if (i === j) continue;
        dists.push({ j, d: this.nodes[i].distanceTo(this.nodes[j]) });
      }
      dists.sort((a, b) => a.d - b.d);

      // Connect to K nearest
      const K = Math.min(this.neighborK, dists.length);
      for (let k = 0; k < K; k++) {
        const { j, d } = dists[k];
        // Avoid duplicate edges
        if (!adjList[i].includes(j)) {
          adjList[i].push(j);
          adjList[j].push(i);
          this.edges.push({ a: i, b: j, length: d, isMST: false });
        }
      }
    }

    // 2. Prim's MST on the full edge set
    this.mstEdges = [];
    const inMST = new Set<number>();
    inMST.add(0);

    // Priority queue (simple: just scan edges each time)
    while (inMST.size < N) {
      let bestEdge: Edge | null = null;
      let bestDist = Infinity;

      for (const edge of this.edges) {
        const aIn = inMST.has(edge.a);
        const bIn = inMST.has(edge.b);
        if (aIn !== bIn && edge.length < bestDist) {
          bestDist = edge.length;
          bestEdge = edge;
        }
      }

      if (!bestEdge) break; // Disconnected graph
      bestEdge.isMST = true;
      this.mstEdges.push(bestEdge);
      inMST.add(bestEdge.a);
      inMST.add(bestEdge.b);
    }
  }

  isStable() {
    return this._captured && this._framesSinceCapture > 10;
  }

  update() {
    if (!this._captured) return;
    this._framesSinceCapture++;

    const N = this.nodes.length;
    if (N < 2) return;

    // Update point positions
    const positions: number[] = [];
    const colors: number[] = [];
    for (let i = 0; i < N; i++) {
      const p = this.nodes[i];
      positions.push(p.x, p.y, p.z);
      // Color by degree (how many MST connections)
      const degree = this.mstEdges.filter(e => e.a === i || e.b === i).length;
      const hue = 0.5 + degree * 0.05;
      const c = new THREE.Color().setHSL(hue % 1, 0.8, 0.6);
      colors.push(c.r, c.g, c.b);
    }

    this.points.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.points.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;

    // MST lines
    const mstPos: number[] = [];
    for (const e of this.mstEdges) {
      const a = this.nodes[e.a], b = this.nodes[e.b];
      mstPos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    this.mstLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(mstPos, 3));
    this.mstLines.geometry.attributes.position.needsUpdate = true;

    // Neighbor lines (non-MST)
    const nbPos: number[] = [];
    const nbCol: number[] = [];
    for (const e of this.edges) {
      if (e.isMST) continue;
      const a = this.nodes[e.a], b = this.nodes[e.b];
      nbPos.push(a.x, a.y, a.z, b.x, b.y, b.z);
      // Dim cyan
      nbCol.push(0, 0.6, 0.6, 0, 0.6, 0.6);
    }
    this.neighborLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(nbPos, 3));
    this.neighborLines.geometry.setAttribute('color', new THREE.Float32BufferAttribute(nbCol, 3));
    this.neighborLines.geometry.attributes.position.needsUpdate = true;
    this.neighborLines.geometry.attributes.color.needsUpdate = true;
  }

  /** Get all edges (for V5 to find closed loops) */
  getEdges(): Edge[] { return this.edges; }
  getMSTEdges(): Edge[] { return this.mstEdges; }
  getNodes(): THREE.Vector3[] { return this.nodes; }

  /** Get total MST length (useful metric) */
  getMSTLength(): number {
    return this.mstEdges.reduce((sum, e) => sum + e.length, 0);
  }

  saveState() {
    return {
      nodes: this.nodes.map(n => [n.x, n.y, n.z]),
      mstEdges: this.mstEdges.map(e => [e.a, e.b, e.length]),
    };
  }

  loadState(state: any) {
    if (!state) return;
    if (state.nodes) {
      this.nodes = state.nodes.map((p: number[]) => new THREE.Vector3(p[0], p[1], p[2]));
      this._buildGraph();
      this._captured = true;
    }
  }

  dispose() {
    this.scene.remove(this.points);
    this.scene.remove(this.mstLines);
    this.scene.remove(this.neighborLines);
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    this.mstLines.geometry.dispose();
    (this.mstLines.material as THREE.Material).dispose();
    this.neighborLines.geometry.dispose();
    (this.neighborLines.material as THREE.Material).dispose();
  }
}
