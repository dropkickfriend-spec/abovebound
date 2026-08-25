import * as THREE from 'three';

/**
 * V9 — Isotope/Element Lattice Compositor
 *
 * Builds a real 3D material from elements/isotopes in the codex.
 * This is the FIRST layer: it defines WHAT the material IS at every
 * point in space — atomic composition, crystal structure, local
 * conductivity, dielectric, density.
 *
 * Outputs a MaterialField that V1/V2 PSO swarms explore through.
 * Also outputs lattice node positions for visualization (overlaid).
 *
 * Crystal structures: FCC, BCC, HCP, Diamond Cubic
 * Each lattice site holds an element with real physical properties.
 */

export interface LatticeElement {
  symbol: string;
  name: string;
  atomicNumber: number;
  mass: number;            // g/mol
  radius: number;          // pm (picometers)
  conductivity: number;    // W/mK
  dielectric: number;      // relative permittivity
  density: number;         // kg/m³
  color: THREE.Color;
}

export interface LatticeCell {
  position: THREE.Vector3;
  element: LatticeElement;
  occupied: boolean;
  bondStrength: number;    // 0-1 how strongly bonded to neighbors
}

export type CrystalStructure = 'fcc' | 'bcc' | 'hcp' | 'diamond_cubic';

/** The composite material field output — feeds directly into V1.setMaterial() */
export interface CompositeField {
  resolution: number;
  bounds: number;
  conductivityField: Float32Array;   // Per-voxel thermal conductivity
  dielectricField: Float32Array;     // Per-voxel dielectric constant
  densityField: Float32Array;        // Per-voxel density
  fitnessField: Float32Array;        // Combined fitness for PSO
}

// ── ELEMENT DATABASE ──
const ELEMENTS: Record<string, LatticeElement> = {
  Cu: { symbol: 'Cu', name: 'Copper', atomicNumber: 29, mass: 63.55, radius: 128,
    conductivity: 401, dielectric: 1.0, density: 8960, color: new THREE.Color(0.85, 0.5, 0.2) },
  Si: { symbol: 'Si', name: 'Silicon', atomicNumber: 14, mass: 28.09, radius: 117,
    conductivity: 150, dielectric: 11.7, density: 2330, color: new THREE.Color(0.4, 0.4, 0.6) },
  C:  { symbol: 'C', name: 'Carbon (Graphene)', atomicNumber: 6, mass: 12.01, radius: 77,
    conductivity: 5000, dielectric: 2.4, density: 2267, color: new THREE.Color(0.2, 0.2, 0.2) },
  Al: { symbol: 'Al', name: 'Aluminium', atomicNumber: 13, mass: 26.98, radius: 143,
    conductivity: 237, dielectric: 1.0, density: 2700, color: new THREE.Color(0.7, 0.7, 0.75) },
  Ti: { symbol: 'Ti', name: 'Titanium', atomicNumber: 22, mass: 47.87, radius: 147,
    conductivity: 6.7, dielectric: 1.0, density: 4430, color: new THREE.Color(0.5, 0.5, 0.55) },
  Gd: { symbol: 'Gd', name: 'Gadolinium', atomicNumber: 64, mass: 157.25, radius: 180,
    conductivity: 10.6, dielectric: 1.0, density: 7900, color: new THREE.Color(0.0, 0.9, 0.6) },
  B10: { symbol: 'B-10', name: 'Boron-10', atomicNumber: 5, mass: 10.01, radius: 87,
    conductivity: 27, dielectric: 1.0, density: 2300, color: new THREE.Color(0.9, 0.3, 0.3) },
  Ag: { symbol: 'Ag', name: 'Silver', atomicNumber: 47, mass: 107.87, radius: 144,
    conductivity: 429, dielectric: 1.0, density: 10490, color: new THREE.Color(0.85, 0.85, 0.9) },
  Fe: { symbol: 'Fe', name: 'Iron', atomicNumber: 26, mass: 55.85, radius: 126,
    conductivity: 80, dielectric: 1.0, density: 7874, color: new THREE.Color(0.6, 0.3, 0.1) },
  SiO2: { symbol: 'SiO2', name: 'Silica (Aerogel)', atomicNumber: 14, mass: 60.08, radius: 160,
    conductivity: 0.015, dielectric: 3.8, density: 200, color: new THREE.Color(0.6, 0.8, 1.0) },
  Void: { symbol: '—', name: 'Vacuum', atomicNumber: 0, mass: 0, radius: 0,
    conductivity: 0.001, dielectric: 1.0, density: 0.001, color: new THREE.Color(0.05, 0.05, 0.05) },
};

// ── CRYSTAL STRUCTURE GENERATORS ──

function fccPositions(size: number, spacing: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  const half = Math.floor(size / 2);
  for (let x = -half; x <= half; x++) {
    for (let y = -half; y <= half; y++) {
      for (let z = -half; z <= half; z++) {
        const bx = x * spacing, by = y * spacing, bz = z * spacing;
        pts.push(new THREE.Vector3(bx, by, bz));
        pts.push(new THREE.Vector3(bx + spacing / 2, by + spacing / 2, bz));
        pts.push(new THREE.Vector3(bx + spacing / 2, by, bz + spacing / 2));
        pts.push(new THREE.Vector3(bx, by + spacing / 2, bz + spacing / 2));
      }
    }
  }
  return pts;
}

function bccPositions(size: number, spacing: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  const half = Math.floor(size / 2);
  for (let x = -half; x <= half; x++) {
    for (let y = -half; y <= half; y++) {
      for (let z = -half; z <= half; z++) {
        const bx = x * spacing, by = y * spacing, bz = z * spacing;
        pts.push(new THREE.Vector3(bx, by, bz));
        pts.push(new THREE.Vector3(bx + spacing / 2, by + spacing / 2, bz + spacing / 2));
      }
    }
  }
  return pts;
}

function hcpPositions(size: number, spacing: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  const half = Math.floor(size / 2);
  const c = spacing * Math.sqrt(8 / 3);
  for (let x = -half; x <= half; x++) {
    for (let y = -half; y <= half; y++) {
      for (let z = -half; z <= half; z++) {
        const bx = x * spacing + (y % 2) * spacing / 2;
        const by = y * spacing * Math.sqrt(3) / 2;
        const bz = z * c;
        pts.push(new THREE.Vector3(bx, by, bz));
        // Second atom in basis
        pts.push(new THREE.Vector3(bx + spacing / 2, by + spacing * Math.sqrt(3) / 6, bz + c / 2));
      }
    }
  }
  return pts;
}

function diamondCubicPositions(size: number, spacing: number): THREE.Vector3[] {
  const pts = fccPositions(size, spacing);
  const offset = spacing / 4;
  const extra: THREE.Vector3[] = [];
  for (const p of pts) {
    extra.push(new THREE.Vector3(p.x + offset, p.y + offset, p.z + offset));
  }
  return [...pts, ...extra];
}

// ── V9 ENGINE ──

export class V9LatticeEngine {
  scene: THREE.Scene;
  points: THREE.Points;
  bondLines: THREE.LineSegments;

  cells: LatticeCell[] = [];
  compositeField: CompositeField | null = null;

  // Configuration
  structure: CrystalStructure = 'fcc';
  primaryElement: string = 'Cu';
  secondaryElement: string = 'Void';
  alloyRatio: number = 0.8;     // Fraction of primary element
  latticeSize: number = 4;      // Unit cells per axis
  latticeSpacing: number = 0.3; // World units between sites
  defectRate: number = 0.05;    // Vacancy/defect probability

  // Field output resolution
  fieldResolution: number = 16;
  fieldBounds: number = 2.0;

  private _built: boolean = false;
  private _frameCount: number = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    const ptGeo = new THREE.BufferGeometry();
    const ptMat = new THREE.PointsMaterial({
      size: 0.06, vertexColors: true, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending
    });
    this.points = new THREE.Points(ptGeo, ptMat);
    this.scene.add(this.points);

    const bondGeo = new THREE.BufferGeometry();
    const bondMat = new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.15
    });
    this.bondLines = new THREE.LineSegments(bondGeo, bondMat);
    this.scene.add(this.bondLines);
  }

  /** Configure the lattice for a specific optimizer domain */
  configure(optimizer: string) {
    switch (optimizer) {
      case 'thermal':
        this.primaryElement = 'SiO2';
        this.secondaryElement = 'Gd';
        this.structure = 'fcc';
        this.alloyRatio = 0.7;
        this.defectRate = 0.02;
        break;
      case 'electrical':
        this.primaryElement = 'Cu';
        this.secondaryElement = 'Si';
        this.structure = 'diamond_cubic';
        this.alloyRatio = 0.6;
        this.defectRate = 0.01;
        break;
      case 'blockchain':
        this.primaryElement = 'Si';
        this.secondaryElement = 'C';
        this.structure = 'diamond_cubic';
        this.alloyRatio = 0.85;
        this.defectRate = 0.005;
        break;
      case 'math':
        this.primaryElement = 'C';
        this.secondaryElement = 'B10';
        this.structure = 'hcp';
        this.alloyRatio = 0.5;
        this.defectRate = 0.1;
        break;
    }
    this._built = false;
  }

  /** Build the crystal lattice */
  buildLattice() {
    const primary = ELEMENTS[this.primaryElement] || ELEMENTS.Cu;
    const secondary = ELEMENTS[this.secondaryElement] || ELEMENTS.Void;

    // Generate lattice site positions
    let positions: THREE.Vector3[];
    switch (this.structure) {
      case 'bcc': positions = bccPositions(this.latticeSize, this.latticeSpacing); break;
      case 'hcp': positions = hcpPositions(this.latticeSize, this.latticeSpacing); break;
      case 'diamond_cubic': positions = diamondCubicPositions(this.latticeSize, this.latticeSpacing); break;
      default: positions = fccPositions(this.latticeSize, this.latticeSpacing);
    }

    // Assign elements to sites
    this.cells = positions.map(pos => {
      const isDefect = Math.random() < this.defectRate;
      const isPrimary = Math.random() < this.alloyRatio;
      const element = isDefect ? ELEMENTS.Void : (isPrimary ? primary : secondary);

      return {
        position: pos,
        element,
        occupied: !isDefect,
        bondStrength: isDefect ? 0 : (0.5 + Math.random() * 0.5),
      };
    });

    // Build composite material field by sampling the lattice
    this._buildCompositeField();
    this._built = true;
  }

  /** Convert lattice cells into a continuous 3D material field */
  private _buildCompositeField() {
    const res = this.fieldResolution;
    const bounds = this.fieldBounds;
    const step = (bounds * 2) / (res - 1);
    const n = res * res * res;

    const kField = new Float32Array(n);
    const erField = new Float32Array(n);
    const rhoField = new Float32Array(n);
    const fitField = new Float32Array(n);

    // For each voxel, find the nearest lattice cells and interpolate properties
    for (let xi = 0; xi < res; xi++) {
      for (let yi = 0; yi < res; yi++) {
        for (let zi = 0; zi < res; zi++) {
          const px = xi * step - bounds;
          const py = yi * step - bounds;
          const pz = zi * step - bounds;
          const idx = xi * res * res + yi * res + zi;

          // Inverse-distance weighted interpolation from nearby cells
          let wSum = 0;
          let kSum = 0, erSum = 0, rhoSum = 0;

          for (const cell of this.cells) {
            const dx = px - cell.position.x;
            const dy = py - cell.position.y;
            const dz = pz - cell.position.z;
            const distSq = dx * dx + dy * dy + dz * dz;
            if (distSq < 0.001) continue;

            const w = cell.bondStrength / (distSq + 0.01);
            wSum += w;
            kSum += w * cell.element.conductivity;
            erSum += w * cell.element.dielectric;
            rhoSum += w * cell.element.density;
          }

          if (wSum > 0) {
            kField[idx] = kSum / wSum;
            erField[idx] = erSum / wSum;
            rhoField[idx] = rhoSum / wSum;
          } else {
            kField[idx] = 0.001;
            erField[idx] = 1.0;
            rhoField[idx] = 1.0;
          }

          // Fitness: interesting where material properties vary (gradients)
          // High fitness at boundaries between different materials
          fitField[idx] = 1.0; // will be set after gradient computation
        }
      }
    }

    // Compute fitness from property gradients (high gradient = interesting boundary)
    for (let xi = 1; xi < res - 1; xi++) {
      for (let yi = 1; yi < res - 1; yi++) {
        for (let zi = 1; zi < res - 1; zi++) {
          const idx = xi * res * res + yi * res + zi;
          const dkdx = Math.abs(kField[(xi + 1) * res * res + yi * res + zi] - kField[(xi - 1) * res * res + yi * res + zi]);
          const dkdy = Math.abs(kField[xi * res * res + (yi + 1) * res + zi] - kField[xi * res * res + (yi - 1) * res + zi]);
          const dkdz = Math.abs(kField[xi * res * res + yi * res + (zi + 1)] - kField[xi * res * res + yi * res + (zi - 1)]);
          const gradient = Math.sqrt(dkdx * dkdx + dkdy * dkdy + dkdz * dkdz);
          fitField[idx] = 1.0 + gradient * 0.1;
        }
      }
    }

    this.compositeField = {
      resolution: res, bounds,
      conductivityField: kField,
      dielectricField: erField,
      densityField: rhoField,
      fitnessField: fitField,
    };
  }

  /** Get the composite field formatted for V1.setMaterial() */
  getMaterialForV1(): { conductivity: number; dielectricConstant: number; density: number; geometry: string; resolution: number; customField?: Float32Array } | null {
    if (!this.compositeField) return null;
    const f = this.compositeField;

    // Average properties across the field
    let kAvg = 0, erAvg = 0, rhoAvg = 0;
    const n = f.resolution ** 3;
    for (let i = 0; i < n; i++) {
      kAvg += f.conductivityField[i];
      erAvg += f.dielectricField[i];
      rhoAvg += f.densityField[i];
    }
    kAvg /= n;
    erAvg /= n;
    rhoAvg /= n;

    return {
      conductivity: kAvg,
      dielectricConstant: erAvg,
      density: rhoAvg,
      geometry: this.structure === 'diamond_cubic' ? 'diamond' : 'gyroid',
      resolution: f.resolution,
      customField: f.fitnessField,
    };
  }

  /** Get lattice node positions for V3/V4 boundary seeding */
  getLatticeBounds(): THREE.Vector3[] {
    return this.cells.filter(c => c.occupied).map(c => c.position.clone());
  }

  update() {
    this._frameCount++;

    if (!this._built) this.buildLattice();

    // Update visualization
    const positions: number[] = [];
    const colors: number[] = [];
    const bondPos: number[] = [];
    const bondCol: number[] = [];

    for (const cell of this.cells) {
      if (!cell.occupied) continue;
      positions.push(cell.position.x, cell.position.y, cell.position.z);
      const c = cell.element.color;
      colors.push(c.r, c.g, c.b);
    }

    // Draw bonds between nearby occupied sites
    const bondCutoff = this.latticeSpacing * 1.1;
    const bondCutoffSq = bondCutoff * bondCutoff;
    const occupied = this.cells.filter(c => c.occupied);

    for (let i = 0; i < occupied.length; i++) {
      for (let j = i + 1; j < occupied.length; j++) {
        const distSq = occupied[i].position.distanceToSquared(occupied[j].position);
        if (distSq < bondCutoffSq) {
          const a = occupied[i], b = occupied[j];
          bondPos.push(a.position.x, a.position.y, a.position.z);
          bondPos.push(b.position.x, b.position.y, b.position.z);
          // Bond color = blend of element colors
          const ca = a.element.color, cb = b.element.color;
          bondCol.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b);
        }
      }
    }

    this.points.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.points.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;

    if (bondPos.length > 0) {
      this.bondLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(bondPos, 3));
      this.bondLines.geometry.setAttribute('color', new THREE.Float32BufferAttribute(bondCol, 3));
      this.bondLines.geometry.attributes.position.needsUpdate = true;
      this.bondLines.geometry.attributes.color.needsUpdate = true;
    }
  }

  isStable(): boolean { return this._built; }

  dispose() {
    this.scene.remove(this.points);
    this.scene.remove(this.bondLines);
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    this.bondLines.geometry.dispose();
    (this.bondLines.material as THREE.Material).dispose();
  }
}
