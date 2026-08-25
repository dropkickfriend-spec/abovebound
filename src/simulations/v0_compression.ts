import * as THREE from 'three';

export interface CompressionNode {
  position: THREE.Vector3;
  intensity: number;
  harmonic: number;
  prime: number;
}

export class V0CompressionEngine {
  nodes: CompressionNode[] = [];
  scene: THREE.Scene;
  points: THREE.Points;
  lines: THREE.LineSegments;
  
  // First Principles Parameters
  primes: number[] = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47];
  oddHarmonics: number[] = [1, 3, 5, 7, 9, 11, 13, 15];
  
  compressionFieldLevel: number = 1; // 1st to 7th
  phase: number = 0;
  
  constructor(scene: THREE.Scene) {
    this.scene = scene;
    
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.PointsMaterial({
      size: 0.05,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending
    });
    
    this.points = new THREE.Points(geometry, material);
    this.scene.add(this.points);
    
    const lineGeometry = new THREE.BufferGeometry();
    const lineMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending
    });
    this.lines = new THREE.LineSegments(lineGeometry, lineMaterial);
    this.scene.add(this.lines);
    
    this.initField();
  }
  
  initField() {
    this.nodes = [];
    const gridSize = 20;
    const aspect = 1.1; // "Slightly rectangle squares"
    
    for (let x = 0; x < gridSize; x++) {
      for (let y = 0; y < gridSize; y++) {
        const primeIdx = (x + y) % this.primes.length;
        const harmonicIdx = (x * y) % this.oddHarmonics.length;
        
        const pos = new THREE.Vector3(
          (x - gridSize/2) * aspect,
          (y - gridSize/2),
          0
        );
        
        this.nodes.push({
          position: pos,
          intensity: 0,
          harmonic: this.oddHarmonics[harmonicIdx],
          prime: this.primes[primeIdx]
        });
      }
    }
  }
  
  setCompressionLevel(level: number) {
    this.compressionFieldLevel = Math.max(1, Math.min(7, level));
  }
  
  isStable() {
    // Stability in V0 means we've reached a certain phase or the intensity has settled
    return this.phase > Math.PI * 4;
  }

  saveState() {
    return {
      phase: this.phase,
      compressionFieldLevel: this.compressionFieldLevel
    };
  }

  loadState(state: any) {
    if (state.phase !== undefined) this.phase = state.phase;
    if (state.compressionFieldLevel !== undefined) this.compressionFieldLevel = state.compressionFieldLevel;
  }

  update(optimizer: string = 'thermal', globalMemory: any = {}) {
    this.phase += 0.01;
    const positions: number[] = [];
    const colors: number[] = [];
    const linePositions: number[] = [];
    const lineColors: number[] = [];
    
    const color = new THREE.Color();
    
    this.nodes.forEach((node, idx) => {
      // Calculate intensity based on odd harmonics and prime distribution
      let intensity = 0;
      for (let i = 0; i < this.compressionFieldLevel; i++) {
        const h = this.oddHarmonics[i % this.oddHarmonics.length];
        const p = this.primes[i % this.primes.length];
        
        // Harmonic resonance using prime frequencies
        // We normalize the prime to a reasonable frequency range
        const freqX = h * 0.1;
        const freqY = p * 0.05;
        
        intensity += Math.sin(node.position.x * freqX + this.phase) * 
                     Math.cos(node.position.y * freqY + this.phase);
      }
      
      node.intensity = intensity / this.compressionFieldLevel;
      
      // Topological shape rendering (becomes visible at higher levels)
      // We displace Z based on intensity to create a "surface"
      const zDisplacement = node.intensity * (this.compressionFieldLevel * 0.5);
      const currentPos = node.position.clone();
      currentPos.z = zDisplacement;
      
      positions.push(currentPos.x, currentPos.y, currentPos.z);
      
      // Color based on prime and harmonic
      const hue = (node.prime / 50) + (node.harmonic / 20);
      color.setHSL(hue % 1, 0.8, 0.5 + node.intensity * 0.2);
      colors.push(color.r, color.g, color.b);
      
      // Lines to neighbors for topological grid
      if (idx % 20 < 19) { // Right neighbor
        const next = this.nodes[idx + 1];
        linePositions.push(currentPos.x, currentPos.y, currentPos.z);
        linePositions.push(next.position.x, next.position.y, next.intensity * (this.compressionFieldLevel * 0.5));
        lineColors.push(color.r, color.g, color.b, color.r, color.g, color.b);
      }
      if (idx < this.nodes.length - 20) { // Top neighbor
        const top = this.nodes[idx + 20];
        linePositions.push(currentPos.x, currentPos.y, currentPos.z);
        linePositions.push(top.position.x, top.position.y, top.intensity * (this.compressionFieldLevel * 0.5));
        lineColors.push(color.r, color.g, color.b, color.r, color.g, color.b);
      }
    });
    
    this.points.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.points.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    
    this.lines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    this.lines.geometry.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));
    this.lines.geometry.attributes.position.needsUpdate = true;
    this.lines.geometry.attributes.color.needsUpdate = true;
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
