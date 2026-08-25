import * as THREE from 'three';

export interface NumberNode {
  index: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  isOdd: boolean;
  isPrime: boolean;
  energy: number;
}

export class FundamentalEngine {
  nodes: NumberNode[] = [];
  maxNodes: number = 144; // 12x12 or similar
  scene: THREE.Scene;
  group: THREE.Group;
  points: THREE.Points;
  lines: THREE.LineSegments;
  
  // Causal Window: 0-13
  CAUSAL_WINDOW: number = 13;
  
  constructor(scene: THREE.Scene, rotation: THREE.Euler, color: THREE.Color) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.rotation.copy(rotation);
    this.scene.add(this.group);
    
    const geometry = new THREE.BufferGeometry();
    const material = new THREE.PointsMaterial({
      size: 0.1,
      vertexColors: true,
      transparent: true,
      opacity: 0.8
    });
    
    this.points = new THREE.Points(geometry, material);
    this.group.add(this.points);
    
    const lineMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.2
    });
    this.lines = new THREE.LineSegments(new THREE.BufferGeometry(), lineMaterial);
    this.group.add(this.lines);
    
    this.initNodes(color);
  }
  
  private isPrime(n: number): boolean {
    if (n <= 1) return false;
    for (let i = 2; i <= Math.sqrt(n); i++) {
      if (n % i === 0) return false;
    }
    return true;
  }
  
  initNodes(baseColor: THREE.Color) {
    this.nodes = [];
    const side = Math.sqrt(this.maxNodes);
    for (let i = 0; i < this.maxNodes; i++) {
      const x = (i % side) - side / 2;
      const y = Math.floor(i / side) - side / 2;
      
      this.nodes.push({
        index: i,
        position: new THREE.Vector3(x, y, 0),
        velocity: new THREE.Vector3(),
        isOdd: i % 2 !== 0,
        isPrime: this.isPrime(i),
        energy: 1.0
      });
    }
  }
  
  isStable() {
    // Stability in Fundamental means nodes have settled into their causal structures
    let totalVel = 0;
    this.nodes.forEach(n => totalVel += n.velocity.length());
    return totalVel / (this.nodes.length || 1) < 0.01;
  }

  saveState() {
    return {
      nodes: this.nodes.map(n => ({
        index: n.index,
        position: n.position.toArray(),
        velocity: n.velocity.toArray(),
        energy: n.energy
      }))
    };
  }

  loadState(state: any) {
    if (state.nodes) {
      state.nodes.forEach((sn: any, i: number) => {
        if (this.nodes[i]) {
          this.nodes[i].position.fromArray(sn.position);
          this.nodes[i].velocity.fromArray(sn.velocity);
          this.nodes[i].energy = sn.energy;
        }
      });
    }
  }

  update(phase: number, compressionLevel: number = 1) {
    const positions: number[] = [];
    const colors: number[] = [];
    const linePositions: number[] = [];
    const lineColors: number[] = [];
    
    const primeMultiple = compressionLevel > 1 ? this.getNthPrime(compressionLevel - 1) : 1;
    
    this.nodes.forEach((node, i) => {
      const force = new THREE.Vector3();
      
      // Causal Window Logic: 0-13
      // Nodes interact if their index difference is within the causal window
      const causalNeighbors: THREE.Vector3[] = [];
      for (let j = Math.max(0, i - this.CAUSAL_WINDOW); j <= Math.min(this.maxNodes - 1, i + this.CAUSAL_WINDOW); j++) {
        if (i === j) continue;
        const other = this.nodes[j];
        const dist = node.position.distanceTo(other.position);
        
        if (dist < 3) {
          causalNeighbors.push(other.position);
          
          if (node.isOdd && other.isOdd) {
            // Odd numbers (Systems) repel each other to maintain structural integrity
            force.add(node.position.clone().sub(other.position).normalize().multiplyScalar(0.02 / (dist + 0.1)));
          }
        }
      }
      
      if (!node.isOdd && causalNeighbors.length > 0) {
        // Even numbers (Noise) assimilate: they move towards the average position of their causal neighbors
        const avgPos = new THREE.Vector3();
        causalNeighbors.forEach(p => avgPos.add(p));
        avgPos.divideScalar(causalNeighbors.length);
        
        const assimilationForce = avgPos.sub(node.position).multiplyScalar(0.01);
        force.add(assimilationForce);
      }
      
      // Multiples of Primes: Next Compression Field
      // Nodes that are multiples of the current prime level get extra energy/oscillation
      if (node.index % primeMultiple === 0 && primeMultiple > 1) {
        force.y += Math.sin(phase + node.index) * 0.05;
        node.energy = 1.5;
      } else {
        node.energy *= 0.99;
      }
      
      node.velocity.add(force);
      node.velocity.multiplyScalar(0.9);
      node.position.add(node.velocity);
      
      positions.push(node.position.x, node.position.y, node.position.z);
      
      const color = new THREE.Color();
      if (node.isPrime) {
        color.setHSL(0.1, 1, 0.6); // Gold for primes
      } else if (node.isOdd) {
        color.setHSL(0.6, 0.8, 0.5); // Blue for system
      } else {
        color.setHSL(0, 0, 0.3); // Gray for noise
      }
      colors.push(color.r, color.g, color.b);
      
      // Render lines between causal neighbors
      if (i % 12 < 11) {
        const next = this.nodes[i + 1];
        linePositions.push(node.position.x, node.position.y, node.position.z);
        linePositions.push(next.position.x, next.position.y, next.position.z);
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
  
  private getNthPrime(n: number): number {
    const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29];
    return primes[n % primes.length];
  }
  
  dispose() {
    this.scene.remove(this.group);
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    this.lines.geometry.dispose();
    (this.lines.material as THREE.Material).dispose();
  }
}

export class MembraneDetector {
  static findPlanes(sim1: FundamentalEngine, sim2: FundamentalEngine): number[] {
    const positions: number[] = [];
    const worldPos1 = new THREE.Vector3();
    const worldPos2 = new THREE.Vector3();
    
    // We sample nodes to find where the two 90-degree rotated fields intersect
    // These intersections form the "planes" or "membranes"
    for (let i = 0; i < sim1.nodes.length; i += 2) {
      sim1.group.localToWorld(worldPos1.copy(sim1.nodes[i].position));
      for (let j = 0; j < sim2.nodes.length; j += 2) {
        sim2.group.localToWorld(worldPos2.copy(sim2.nodes[j].position));
        
        const dist = worldPos1.distanceTo(worldPos2);
        if (dist < 0.8) {
          // Intersection point found
          positions.push(worldPos1.x, worldPos1.y, worldPos1.z);
          positions.push(worldPos2.x, worldPos2.y, worldPos2.z);
        }
      }
    }
    return positions;
  }
}
