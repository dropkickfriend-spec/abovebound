import * as THREE from 'three';

/**
 * FlowEngine - A Unified Field Simulation for BeyondBound.
 * Simulates Thermal, Magnetic, Radio, and Consensus (Blockchain) flows
 * as a single interconnected medium.
 */

export enum FlowState {
  GAS = 'gas',
  LIQUID = 'liquid',
  CRYSTAL = 'crystal',
  PLASMA = 'plasma'
}

export interface FlowCell {
  position: THREE.Vector3;
  temperature: number;      // Thermal Flow (0 to 1000)
  magnetic: THREE.Vector3;  // Magnetic Flow (Vector field)
  radio: number;            // Radio/EM Flow (Intensity)
  consensus: number;        // Blockchain/Numbers Flow (0 to 1: Chaos to Order)
  velocity: THREE.Vector3;  // Physical Flow (Movement)
  density: number;          // Mass Density
  viscosity: number;        // Resistance to flow (derived from consensus/state)
}

export class FlowEngine {
  private grid: FlowCell[][][];
  private size: THREE.Vector3;
  private resolution: number;
  private dt: number = 0.01;

  constructor(size: THREE.Vector3, resolution: number = 10) {
    this.size = size;
    this.resolution = resolution;
    this.grid = this.initGrid();
  }

  private initGrid(): FlowCell[][][] {
    const grid: FlowCell[][][] = [];
    const step = 1 / this.resolution;

    for (let x = 0; x < this.resolution; x++) {
      grid[x] = [];
      for (let y = 0; y < this.resolution; y++) {
        grid[x][y] = [];
        for (let z = 0; z < this.resolution; z++) {
          grid[x][y][z] = {
            position: new THREE.Vector3(x * step, y * step, z * step).multiply(this.size),
            temperature: 20, // Ambient
            magnetic: new THREE.Vector3(0, 0, 0),
            radio: 0,
            consensus: 0.5, // Neutral
            velocity: new THREE.Vector3(0, 0, 0),
            density: 1.0,
            viscosity: 0.1
          };
        }
      }
    }
    return grid;
  }

  /**
   * Main simulation step.
   * Updates all fields based on their interactions.
   */
  public step() {
    const nextGrid = this.cloneGrid();

    for (let x = 0; x < this.resolution; x++) {
      for (let y = 0; y < this.resolution; y++) {
        for (let z = 0; z < this.resolution; z++) {
          const cell = this.grid[x][y][z];
          const next = nextGrid[x][y][z];

          // 1. Calculate Consensus-driven Viscosity
          // High consensus (order) makes the medium rigid (Crystal)
          // Low consensus (chaos) makes it fluid (Gas/Plasma)
          next.viscosity = Math.pow(cell.consensus, 2) * 10; 

          // 2. Thermal Diffusion (Laplacian)
          const thermalLaplacian = this.calculateLaplacian(x, y, z, 'temperature');
          next.temperature += thermalLaplacian * 0.1 * this.dt;

          // 3. Magnetic-Thermal Coupling (Induction)
          // Moving magnetic fields or high intensity creates heat
          const magStrength = cell.magnetic.length();
          next.temperature += magStrength * 0.05 * this.dt;

          // 4. Radio Wave Propagation
          // Radio waves flow through the medium, attenuated by density
          const radioLaplacian = this.calculateLaplacian(x, y, z, 'radio');
          next.radio += (radioLaplacian - cell.density * 0.01) * this.dt;

          // 5. Consensus Flow (The "Numbers" / Blockchain)
          // Consensus tends to cluster (Order attracts order)
          const consensusLaplacian = this.calculateLaplacian(x, y, z, 'consensus');
          next.consensus += consensusLaplacian * 0.05 * this.dt;

          // 6. Velocity Field (Navier-Stokes simplified)
          // Pressure gradients (Temperature/Density) drive velocity
          const pressureGradient = this.calculateGradient(x, y, z, 'temperature');
          next.velocity.add(pressureGradient.multiplyScalar(-0.1 * this.dt));
          
          // Viscosity slows down velocity
          next.velocity.multiplyScalar(1 - next.viscosity * this.dt);
        }
      }
    }

    this.grid = nextGrid;
  }

  private calculateLaplacian(x: number, y: number, z: number, key: keyof FlowCell): any {
    const val = this.grid[x][y][z][key];
    let sum = 0;
    let count = 0;

    const neighbors = [
      [x+1, y, z], [x-1, y, z],
      [x, y+1, z], [x, y-1, z],
      [x, y, z+1], [x, y, z-1]
    ];

    neighbors.forEach(([nx, ny, nz]) => {
      if (this.isValid(nx, ny, nz)) {
        const nVal = this.grid[nx][ny][nz][key];
        if (typeof nVal === 'number') {
          sum += nVal;
          count++;
        }
      }
    });

    if (typeof val === 'number') {
      return (sum - count * val);
    }
    return 0;
  }

  private calculateGradient(x: number, y: number, z: number, key: keyof FlowCell): THREE.Vector3 {
    const grad = new THREE.Vector3();
    if (!this.isValid(x+1, y, z) || !this.isValid(x-1, y, z)) return grad;

    const vX1 = this.grid[x+1][y][z][key] as number;
    const vX2 = this.grid[x-1][y][z][key] as number;
    grad.x = (vX1 - vX2) / 2;

    const vY1 = this.grid[x][y+1][z][key] as number;
    const vY2 = this.grid[x][y-1][z][key] as number;
    grad.y = (vY1 - vY2) / 2;

    const vZ1 = this.grid[x][y][z+1][key] as number;
    const vZ2 = this.grid[x][y][z-1][key] as number;
    grad.z = (vZ1 - vZ2) / 2;

    return grad;
  }

  private isValid(x: number, y: number, z: number): boolean {
    return x >= 0 && x < this.resolution && y >= 0 && y < this.resolution && z >= 0 && z < this.resolution;
  }

  private cloneGrid(): FlowCell[][][] {
    return JSON.parse(JSON.stringify(this.grid));
  }

  public getGrid(): FlowCell[][][] {
    return this.grid;
  }

  /**
   * Returns the state of the medium at a specific point.
   */
  public getStateAt(x: number, y: number, z: number): FlowState {
    const cell = this.grid[x][y][z];
    if (cell.temperature > 800) return FlowState.PLASMA;
    if (cell.consensus > 0.8) return FlowState.CRYSTAL;
    if (cell.temperature > 100) return FlowState.GAS;
    return FlowState.LIQUID;
  }
}
