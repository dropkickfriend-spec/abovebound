import * as THREE from 'three';

/**
 * V11 — Hardware Builder
 *
 * Takes the material (V9 lattice) and geometry (V10 mesh) and constructs
 * the physical product form factor. This defines the BOUNDARIES that
 * V3/V4 MST routing operates within.
 *
 * The hardware builder creates:
 *   1. An outer shell (product shape: cylinder, box, PCB, panel, etc.)
 *   2. Internal constraint zones (where components must go)
 *   3. Port/terminal positions (entry/exit points for flow/signal)
 *   4. Boundary nodes that V3/V4 use as their routing space
 *
 * V3/V4 can only build MST connections WITHIN this hardware envelope.
 */

export type ProductShape = 'cylinder' | 'box' | 'pcb' | 'panel' | 'sphere' | 'custom';

export interface HardwarePort {
  position: THREE.Vector3;
  normal: THREE.Vector3;    // Direction the port faces
  type: 'thermal_in' | 'thermal_out' | 'signal_in' | 'signal_out' | 'power' | 'ground';
  label: string;
}

export interface ConstraintZone {
  center: THREE.Vector3;
  radius: number;
  type: 'component' | 'exclusion' | 'routing_channel';
  label: string;
}

export interface HardwareSpec {
  shape: ProductShape;
  dimensions: { x: number; y: number; z: number };
  wallThickness: number;
  ports: HardwarePort[];
  constraints: ConstraintZone[];
}

// ── PRODUCT TEMPLATES ──

function stubbySpec(): HardwareSpec {
  return {
    shape: 'cylinder',
    dimensions: { x: 0.8, y: 1.2, z: 0.8 },
    wallThickness: 0.08,
    ports: [
      { position: new THREE.Vector3(0, 0.6, 0), normal: new THREE.Vector3(0, 1, 0), type: 'thermal_in', label: 'Top Opening' },
      { position: new THREE.Vector3(0, -0.6, 0), normal: new THREE.Vector3(0, -1, 0), type: 'thermal_out', label: 'Base Drain' },
    ],
    constraints: [
      { center: new THREE.Vector3(0, 0, 0), radius: 0.3, type: 'component', label: 'Magnetocaloric Core' },
      { center: new THREE.Vector3(0.35, 0, 0), radius: 0.1, type: 'component', label: 'Battery' },
    ],
  };
}

function eskySpec(): HardwareSpec {
  return {
    shape: 'box',
    dimensions: { x: 1.5, y: 1.0, z: 1.0 },
    wallThickness: 0.12,
    ports: [
      { position: new THREE.Vector3(0, 0.5, 0), normal: new THREE.Vector3(0, 1, 0), type: 'thermal_in', label: 'Lid Opening' },
      { position: new THREE.Vector3(0.75, -0.5, 0), normal: new THREE.Vector3(1, 0, 0), type: 'thermal_out', label: 'Drain' },
      { position: new THREE.Vector3(-0.75, 0, 0), normal: new THREE.Vector3(-1, 0, 0), type: 'power', label: 'Battery Bay' },
    ],
    constraints: [
      { center: new THREE.Vector3(0, 0, 0), radius: 0.4, type: 'routing_channel', label: 'Recirculation Zone' },
      { center: new THREE.Vector3(-0.6, 0, 0), radius: 0.2, type: 'component', label: 'Pump Assembly' },
      { center: new THREE.Vector3(0.6, -0.3, 0), radius: 0.15, type: 'component', label: 'Magnetocaloric Array' },
    ],
  };
}

function pcbSpec(): HardwareSpec {
  return {
    shape: 'pcb',
    dimensions: { x: 2.0, y: 0.1, z: 1.5 },
    wallThickness: 0.01,
    ports: [
      { position: new THREE.Vector3(-0.9, 0.05, 0), normal: new THREE.Vector3(-1, 0, 0), type: 'signal_in', label: 'Input Header' },
      { position: new THREE.Vector3(0.9, 0.05, 0), normal: new THREE.Vector3(1, 0, 0), type: 'signal_out', label: 'Output Header' },
      { position: new THREE.Vector3(0, 0.05, -0.7), normal: new THREE.Vector3(0, 0, -1), type: 'power', label: 'Power In' },
      { position: new THREE.Vector3(0, 0.05, 0.7), normal: new THREE.Vector3(0, 0, 1), type: 'ground', label: 'Ground Plane' },
    ],
    constraints: [
      { center: new THREE.Vector3(-0.4, 0, 0), radius: 0.2, type: 'component', label: 'Regulation Module' },
      { center: new THREE.Vector3(0.4, 0, 0), radius: 0.25, type: 'component', label: 'Storage Bank' },
      { center: new THREE.Vector3(0, 0, 0), radius: 0.5, type: 'routing_channel', label: 'Trace Routing Area' },
    ],
  };
}

function panelSpec(): HardwareSpec {
  return {
    shape: 'panel',
    dimensions: { x: 2.0, y: 1.5, z: 0.15 },
    wallThickness: 0.02,
    ports: [
      { position: new THREE.Vector3(-1.0, 0, 0), normal: new THREE.Vector3(-1, 0, 0), type: 'thermal_in', label: 'Sun Side' },
      { position: new THREE.Vector3(1.0, 0, 0), normal: new THREE.Vector3(1, 0, 0), type: 'thermal_out', label: 'Radiator Side' },
    ],
    constraints: [
      { center: new THREE.Vector3(0, 0, 0), radius: 0.6, type: 'routing_channel', label: 'Heat Pipe Network' },
      { center: new THREE.Vector3(0, 0.5, 0), radius: 0.2, type: 'component', label: 'Cold Plate' },
    ],
  };
}

function networkSpec(): HardwareSpec {
  return {
    shape: 'sphere',
    dimensions: { x: 1.5, y: 1.5, z: 1.5 },
    wallThickness: 0.05,
    ports: [
      { position: new THREE.Vector3(0, 0.75, 0), normal: new THREE.Vector3(0, 1, 0), type: 'signal_in', label: 'Uplink' },
      { position: new THREE.Vector3(0, -0.75, 0), normal: new THREE.Vector3(0, -1, 0), type: 'signal_out', label: 'Downlink' },
      { position: new THREE.Vector3(0.75, 0, 0), normal: new THREE.Vector3(1, 0, 0), type: 'signal_out', label: 'Peer East' },
      { position: new THREE.Vector3(-0.75, 0, 0), normal: new THREE.Vector3(-1, 0, 0), type: 'signal_out', label: 'Peer West' },
      { position: new THREE.Vector3(0, 0, 0.75), normal: new THREE.Vector3(0, 0, 1), type: 'signal_out', label: 'Peer North' },
      { position: new THREE.Vector3(0, 0, -0.75), normal: new THREE.Vector3(0, 0, -1), type: 'signal_out', label: 'Peer South' },
    ],
    constraints: [
      { center: new THREE.Vector3(0, 0, 0), radius: 0.3, type: 'component', label: 'Ledger Core' },
    ],
  };
}

// ── V11 ENGINE ──

export class V11HardwareEngine {
  scene: THREE.Scene;
  shellLines: THREE.LineSegments;   // Wireframe of the hardware shell
  portPoints: THREE.Points;         // Visualize ports
  constraintLines: THREE.LineSegments; // Constraint zone boundaries

  spec: HardwareSpec;
  boundaryNodes: THREE.Vector3[] = [];  // Nodes V3/V4 route within

  private _built: boolean = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    const shellGeo = new THREE.BufferGeometry();
    const shellMat = new THREE.LineBasicMaterial({
      color: 0xff8800, transparent: true, opacity: 0.4,
      blending: THREE.AdditiveBlending
    });
    this.shellLines = new THREE.LineSegments(shellGeo, shellMat);
    this.scene.add(this.shellLines);

    const portGeo = new THREE.BufferGeometry();
    const portMat = new THREE.PointsMaterial({
      size: 0.15, vertexColors: true, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending
    });
    this.portPoints = new THREE.Points(portGeo, portMat);
    this.scene.add(this.portPoints);

    const conGeo = new THREE.BufferGeometry();
    const conMat = new THREE.LineBasicMaterial({
      color: 0xffff00, transparent: true, opacity: 0.15,
    });
    this.constraintLines = new THREE.LineSegments(conGeo, conMat);
    this.scene.add(this.constraintLines);

    // Default spec
    this.spec = stubbySpec();
  }

  /** Configure for an optimizer type */
  configure(optimizer: string) {
    switch (optimizer) {
      case 'thermal': this.spec = eskySpec(); break;
      case 'electrical': this.spec = pcbSpec(); break;
      case 'blockchain': this.spec = networkSpec(); break;
      case 'math': this.spec = panelSpec(); break;
      default: this.spec = stubbySpec();
    }
    this._built = false;
  }

  /** Build the hardware: generate shell wireframe, ports, and boundary nodes */
  build() {
    const { shape, dimensions: d, wallThickness: wt, ports, constraints } = this.spec;
    const shellPos: number[] = [];
    const portPos: number[] = [];
    const portCol: number[] = [];
    const conPos: number[] = [];
    this.boundaryNodes = [];

    // ── SHELL WIREFRAME ──
    if (shape === 'box' || shape === 'pcb' || shape === 'panel') {
      const hx = d.x / 2, hy = d.y / 2, hz = d.z / 2;
      // 12 edges of a box
      const corners = [
        [-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz],
        [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz],
      ];
      const edges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
      for (const [a, b] of edges) {
        shellPos.push(...corners[a], ...corners[b]);
      }
      // Inner shell (wallThickness inset)
      const ihx = hx - wt, ihy = hy - wt, ihz = hz - wt;
      if (ihx > 0 && ihy > 0 && ihz > 0) {
        const ic = [
          [-ihx, -ihy, -ihz], [ihx, -ihy, -ihz], [ihx, ihy, -ihz], [-ihx, ihy, -ihz],
          [-ihx, -ihy, ihz], [ihx, -ihy, ihz], [ihx, ihy, ihz], [-ihx, ihy, ihz],
        ];
        for (const [a, b] of edges) {
          shellPos.push(...ic[a], ...ic[b]);
        }
      }

      // Generate boundary nodes inside the shell
      const step = Math.max(d.x, d.y, d.z) / 8;
      for (let x = -hx + wt; x <= hx - wt; x += step) {
        for (let y = -hy + wt; y <= hy - wt; y += step) {
          for (let z = -hz + wt; z <= hz - wt; z += step) {
            this.boundaryNodes.push(new THREE.Vector3(x, y, z));
          }
        }
      }
    } else if (shape === 'cylinder') {
      const r = d.x / 2, h = d.y / 2;
      const segments = 16;
      for (let i = 0; i < segments; i++) {
        const a1 = (i / segments) * Math.PI * 2;
        const a2 = ((i + 1) / segments) * Math.PI * 2;
        const x1 = Math.cos(a1) * r, z1 = Math.sin(a1) * r;
        const x2 = Math.cos(a2) * r, z2 = Math.sin(a2) * r;
        // Top ring
        shellPos.push(x1, h, z1, x2, h, z2);
        // Bottom ring
        shellPos.push(x1, -h, z1, x2, -h, z2);
        // Verticals
        shellPos.push(x1, h, z1, x1, -h, z1);

        // Inner ring
        const ir = r - wt;
        if (ir > 0) {
          const ix1 = Math.cos(a1) * ir, iz1 = Math.sin(a1) * ir;
          const ix2 = Math.cos(a2) * ir, iz2 = Math.sin(a2) * ir;
          shellPos.push(ix1, h - wt, iz1, ix2, h - wt, iz2);
          shellPos.push(ix1, -h + wt, iz1, ix2, -h + wt, iz2);
        }
      }

      // Boundary nodes inside cylinder
      const step = r / 3;
      for (let y = -h + wt; y <= h - wt; y += step) {
        for (let a = 0; a < segments; a++) {
          const angle = (a / segments) * Math.PI * 2;
          for (let ri = step; ri < r - wt; ri += step) {
            this.boundaryNodes.push(new THREE.Vector3(Math.cos(angle) * ri, y, Math.sin(angle) * ri));
          }
        }
      }
    } else if (shape === 'sphere') {
      const r = d.x / 2;
      const rings = 8, segs = 12;
      for (let ring = 0; ring <= rings; ring++) {
        const phi = (ring / rings) * Math.PI;
        const y = Math.cos(phi) * r;
        const rr = Math.sin(phi) * r;
        for (let seg = 0; seg < segs; seg++) {
          const a1 = (seg / segs) * Math.PI * 2;
          const a2 = ((seg + 1) / segs) * Math.PI * 2;
          shellPos.push(Math.cos(a1) * rr, y, Math.sin(a1) * rr);
          shellPos.push(Math.cos(a2) * rr, y, Math.sin(a2) * rr);

          // Meridian lines
          if (ring < rings) {
            const phi2 = ((ring + 1) / rings) * Math.PI;
            const y2 = Math.cos(phi2) * r;
            const rr2 = Math.sin(phi2) * r;
            shellPos.push(Math.cos(a1) * rr, y, Math.sin(a1) * rr);
            shellPos.push(Math.cos(a1) * rr2, y2, Math.sin(a1) * rr2);
          }
        }
      }

      // Boundary nodes inside sphere
      const step = r / 3;
      for (let x = -r + wt; x <= r - wt; x += step) {
        for (let y = -r + wt; y <= r - wt; y += step) {
          for (let z = -r + wt; z <= r - wt; z += step) {
            if (x * x + y * y + z * z < (r - wt) * (r - wt)) {
              this.boundaryNodes.push(new THREE.Vector3(x, y, z));
            }
          }
        }
      }
    }

    // ── PORT VISUALIZATION ──
    const portColors: Record<string, number[]> = {
      thermal_in: [1, 0.3, 0],
      thermal_out: [0, 0.5, 1],
      signal_in: [0, 1, 0],
      signal_out: [1, 1, 0],
      power: [1, 0, 0],
      ground: [0.5, 0.5, 0.5],
    };

    for (const port of ports) {
      portPos.push(port.position.x, port.position.y, port.position.z);
      const c = portColors[port.type] || [1, 1, 1];
      portCol.push(c[0], c[1], c[2]);
      // Add ports as boundary nodes (V3/V4 must connect to these)
      this.boundaryNodes.push(port.position.clone());
    }

    // ── CONSTRAINT ZONES ──
    for (const zone of constraints) {
      // Draw circle around constraint
      const segs = 12;
      for (let i = 0; i < segs; i++) {
        const a1 = (i / segs) * Math.PI * 2;
        const a2 = ((i + 1) / segs) * Math.PI * 2;
        conPos.push(
          zone.center.x + Math.cos(a1) * zone.radius,
          zone.center.y,
          zone.center.z + Math.sin(a1) * zone.radius
        );
        conPos.push(
          zone.center.x + Math.cos(a2) * zone.radius,
          zone.center.y,
          zone.center.z + Math.sin(a2) * zone.radius
        );
      }
      // Add constraint center as boundary node
      this.boundaryNodes.push(zone.center.clone());
    }

    // Set geometries
    if (shellPos.length > 0) {
      this.shellLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(shellPos, 3));
      this.shellLines.geometry.attributes.position.needsUpdate = true;
    }
    if (portPos.length > 0) {
      this.portPoints.geometry.setAttribute('position', new THREE.Float32BufferAttribute(portPos, 3));
      this.portPoints.geometry.setAttribute('color', new THREE.Float32BufferAttribute(portCol, 3));
      this.portPoints.geometry.attributes.position.needsUpdate = true;
      this.portPoints.geometry.attributes.color.needsUpdate = true;
    }
    if (conPos.length > 0) {
      this.constraintLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(conPos, 3));
      this.constraintLines.geometry.attributes.position.needsUpdate = true;
    }

    this._built = true;
  }

  /** Get boundary nodes for V3/V4 to use as their routing space.
   *  These replace the "settled positions from V1/V2" — V3/V4 now
   *  route within the hardware envelope, not in free space. */
  getBoundaryNodes(): THREE.Vector3[] {
    return this.boundaryNodes;
  }

  /** Get ports as connection endpoints (V3/V4 must connect all ports) */
  getPorts(): HardwarePort[] {
    return this.spec.ports;
  }

  /** Get constraints so V6 can respect exclusion zones */
  getConstraints(): ConstraintZone[] {
    return this.spec.constraints;
  }

  /** Check if a point is inside the hardware envelope */
  isInside(point: THREE.Vector3): boolean {
    const d = this.spec.dimensions;
    const wt = this.spec.wallThickness;
    switch (this.spec.shape) {
      case 'box': case 'pcb': case 'panel':
        return Math.abs(point.x) < d.x / 2 - wt &&
               Math.abs(point.y) < d.y / 2 - wt &&
               Math.abs(point.z) < d.z / 2 - wt;
      case 'cylinder':
        return (point.x * point.x + point.z * point.z) < ((d.x / 2 - wt) ** 2) &&
               Math.abs(point.y) < d.y / 2 - wt;
      case 'sphere':
        return point.lengthSq() < ((d.x / 2 - wt) ** 2);
      default:
        return true;
    }
  }

  update() {
    if (!this._built) this.build();
  }

  isStable(): boolean { return this._built; }

  dispose() {
    this.scene.remove(this.shellLines);
    this.scene.remove(this.portPoints);
    this.scene.remove(this.constraintLines);
    this.shellLines.geometry.dispose();
    (this.shellLines.material as THREE.Material).dispose();
    this.portPoints.geometry.dispose();
    (this.portPoints.material as THREE.Material).dispose();
    this.constraintLines.geometry.dispose();
    (this.constraintLines.material as THREE.Material).dispose();
  }
}
