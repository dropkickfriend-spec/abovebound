import * as THREE from 'three';

export interface BoundaryResult {
  points: THREE.Vector3[];
  area: number;
  centroid: THREE.Vector3;
  normal: THREE.Vector3;
}

export class BoundaryOptimizer {
  /**
   * Optimizes a boundary for a set of points on a detected plane.
   * Uses a simplified 2D Convex Hull algorithm (Monotone Chain) projected on the plane.
   */
  static optimize(nodes: THREE.Vector3[], planeNormal: THREE.Vector3 = new THREE.Vector3(0, 0, 1)): BoundaryResult {
    if (nodes.length < 3) {
      return { points: [], area: 0, centroid: new THREE.Vector3(), normal: planeNormal };
    }

    // 1. Create a local coordinate system for the plane
    const binormal = new THREE.Vector3();
    if (Math.abs(planeNormal.x) < 0.9) {
      binormal.set(1, 0, 0).cross(planeNormal).normalize();
    } else {
      binormal.set(0, 1, 0).cross(planeNormal).normalize();
    }
    const tangent = new THREE.Vector3().copy(planeNormal).cross(binormal).normalize();

    // 2. Project points onto 2D plane coordinates
    const centroid = new THREE.Vector3();
    nodes.forEach(n => centroid.add(n));
    centroid.divideScalar(nodes.length);

    const pts2D = nodes.map(n => {
      const rel = new THREE.Vector3().copy(n).sub(centroid);
      return {
        x: rel.dot(tangent),
        y: rel.dot(binormal),
        original: n
      };
    });

    // 3. Calculate Convex Hull (Monotone Chain)
    pts2D.sort((a, b) => a.x !== b.x ? a.x - b.x : a.y - b.y);

    const crossProduct = (a: any, b: any, c: any) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);

    const upper: any[] = [];
    for (const p of pts2D) {
      while (upper.length >= 2 && crossProduct(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
        upper.pop();
      }
      upper.push(p);
    }

    const lower: any[] = [];
    for (let i = pts2D.length - 1; i >= 0; i--) {
      const p = pts2D[i];
      while (lower.length >= 2 && crossProduct(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
        lower.pop();
      }
      lower.push(p);
    }

    upper.pop();
    lower.pop();
    const hull = upper.concat(lower);

    // 4. Calculate Area and convert back to 3D
    let area = 0;
    for (let i = 0; i < hull.length; i++) {
      const p1 = hull[i];
      const p2 = hull[(i + 1) % hull.length];
      area += (p1.x * p2.y - p2.x * p1.y);
    }
    area = Math.abs(area) * 0.5;

    const optimizedPoints = hull.map(h => h.original);

    return {
      points: optimizedPoints,
      area,
      centroid,
      normal: planeNormal
    };
  }

  /**
   * Calculates the "Membrane Tension" based on how much the nodes are pushing against the boundary.
   */
  static calculateTension(nodes: any[], boundary: BoundaryResult): number {
    if (boundary.points.length === 0) return 0;
    
    let totalTension = 0;
    nodes.forEach(n => {
      // Find distance to nearest boundary edge
      let minDist = Infinity;
      for (let i = 0; i < boundary.points.length; i++) {
        const p1 = boundary.points[i];
        const p2 = boundary.points[(i + 1) % boundary.points.length];
        
        // Simple point-to-line distance
        const line = new THREE.Vector3().copy(p2).sub(p1);
        const rel = new THREE.Vector3().copy(n.position).sub(p1);
        const projection = rel.dot(line) / line.lengthSq();
        const clamped = Math.max(0, Math.min(1, projection));
        const closest = new THREE.Vector3().copy(p1).add(line.multiplyScalar(clamped));
        const dist = n.position.distanceTo(closest);
        
        minDist = Math.min(minDist, dist);
      }
      
      // Tension increases as nodes get closer to the edge
      if (minDist < 0.2) {
        totalTension += (0.2 - minDist) * 5;
      }
    });

    return totalTension;
  }

  /**
   * Returns a repulsion vector to push a point back from the boundary.
   */
  static getRepulsionForce(point: THREE.Vector3, boundary: BoundaryResult, threshold: number = 0.2): THREE.Vector3 {
    const force = new THREE.Vector3();
    if (boundary.points.length < 3) return force;

    let minDist = Infinity;
    let closestEdgeNormal = new THREE.Vector3();

    for (let i = 0; i < boundary.points.length; i++) {
      const p1 = boundary.points[i];
      const p2 = boundary.points[(i + 1) % boundary.points.length];

      const edge = new THREE.Vector3().copy(p2).sub(p1);
      const rel = new THREE.Vector3().copy(point).sub(p1);
      const projection = rel.dot(edge) / edge.lengthSq();
      const clamped = Math.max(0, Math.min(1, projection));
      const closest = new THREE.Vector3().copy(p1).add(edge.multiplyScalar(clamped));
      const dist = point.distanceTo(closest);

      if (dist < minDist) {
        minDist = dist;
        // Normal to the edge pointing inwards
        // We use the plane normal to ensure the repulsion is in-plane
        const edgeDir = edge.clone().normalize();
        closestEdgeNormal.copy(edgeDir).cross(boundary.normal).normalize();
        
        // Ensure normal points towards the centroid
        const toCentroid = boundary.centroid.clone().sub(point);
        if (closestEdgeNormal.dot(toCentroid) < 0) {
          closestEdgeNormal.negate();
        }
      }
    }

    if (minDist < threshold) {
      const strength = (threshold - minDist) / threshold;
      force.copy(closestEdgeNormal).multiplyScalar(strength * 0.05);
    }

    return force;
  }
}
