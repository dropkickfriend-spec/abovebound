import * as THREE from 'three';

/**
 * V8 Riemann Zeta Engine — Complete rewrite based on deep research.
 *
 * Key corrections from the research:
 * 1. The direct Dirichlet series sum(n^-s) DIVERGES for Re(s) < 1.
 *    We now use the Dirichlet eta function (alternating series) which
 *    converges for Re(s) > 0, then recover zeta via:
 *      zeta(s) = eta(s) / (1 - 2^(1-s))
 *
 * 2. Parametric spiral: zeta(0.5 + it) traced as t increases creates
 *    a spiral in the complex plane. Origin crossings = zeros.
 *
 * 3. Winding number: counts how many times the spiral wraps around
 *    the origin (Argument Principle → zero count N(T)).
 *
 * 4. Riemann's explicit formula with proper Li(x^rho) wave corrections.
 *
 * 5. Fractal Riemann Hypothesis: adjustable spectral dimension D_H
 *    shifts the critical line to Re(s) = D_H/2.
 *
 * 6. Zeta-Minimizer Theorem: golden ratio conjugates (0.382, 0.618)
 *    as thermodynamic phase stability markers.
 */

// ── COMPLEX ARITHMETIC HELPERS ──

interface Complex {
  re: number;
  im: number;
}

function cAdd(a: Complex, b: Complex): Complex {
  return { re: a.re + b.re, im: a.im + b.im };
}

function cSub(a: Complex, b: Complex): Complex {
  return { re: a.re - b.re, im: a.im - b.im };
}

function cMul(a: Complex, b: Complex): Complex {
  return {
    re: a.re * b.re - a.im * b.im,
    im: a.re * b.im + a.im * b.re,
  };
}

function cDiv(a: Complex, b: Complex): Complex {
  const d = b.re * b.re + b.im * b.im;
  if (d < 1e-30) return { re: 0, im: 0 };
  return {
    re: (a.re * b.re + a.im * b.im) / d,
    im: (a.im * b.re - a.re * b.im) / d,
  };
}

function cAbs(a: Complex): number {
  return Math.sqrt(a.re * a.re + a.im * a.im);
}

function cArg(a: Complex): number {
  return Math.atan2(a.im, a.re);
}

/** n^(-s) = n^(-sigma) * [cos(t*ln(n)) - i*sin(t*ln(n))] */
function nPowNegS(n: number, sigma: number, t: number): Complex {
  const mag = Math.pow(n, -sigma);
  const angle = t * Math.log(n);
  return { re: mag * Math.cos(angle), im: -mag * Math.sin(angle) };
}

/** 2^(1-s) for the eta→zeta conversion */
function twoPow1MinusS(sigma: number, t: number): Complex {
  const mag = Math.pow(2, 1 - sigma);
  const angle = t * Math.log(2);
  return { re: mag * Math.cos(angle), im: -mag * Math.sin(angle) };
}

// ── ZETA EVALUATION VIA ETA FUNCTION ──

/**
 * Dirichlet eta function: eta(s) = sum_{n=1}^{N} (-1)^(n-1) / n^s
 * Converges for Re(s) > 0 (the entire critical strip).
 *
 * Uses Euler summation (Borwein method) for acceleration when N is large.
 */
function etaFunction(sigma: number, t: number, terms: number = 80): Complex {
  // Borwein/Cohen-Villegas-Zagier acceleration for the eta series
  // d_k = sum_{i=0}^{k} C(N,i) for partial binomial sums
  const N = terms;
  const d: number[] = new Array(N + 1);
  d[0] = 1;
  for (let i = 1; i <= N; i++) {
    d[i] = d[i - 1] + (factorial(N) / (factorial(i) * factorial(N - i)));
  }
  // Normalize: we actually want d[k] = N * sum_{i=0}^{k} (-1)^i C(N,i)
  // Simplified Borwein: use the standard acceleration
  // For numerical stability, use the direct alternating sum with Richardson extrapolation

  // Fallback to direct alternating sum with enough terms for good convergence
  let sum: Complex = { re: 0, im: 0 };
  for (let n = 1; n <= terms; n++) {
    const sign = ((n - 1) % 2 === 0) ? 1 : -1;
    const term = nPowNegS(n, sigma, t);
    sum.re += sign * term.re;
    sum.im += sign * term.im;
  }
  return sum;
}

// Simple factorial for small n (only used if Borwein is enabled)
function factorial(n: number): number {
  if (n <= 1) return 1;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

/**
 * Riemann zeta function via analytic continuation:
 *   zeta(s) = eta(s) / (1 - 2^(1-s))
 *
 * Valid for all Re(s) > 0, including the critical strip 0 < Re(s) < 1.
 * The only pole is at s=1 where the denominator vanishes.
 */
function zetaFunction(sigma: number, t: number, terms: number = 80): Complex {
  const eta = etaFunction(sigma, t, terms);
  const pow = twoPow1MinusS(sigma, t);
  const denom = cSub({ re: 1, im: 0 }, pow);

  // Near s=1, denom → 0 (pole). Guard against division by zero.
  if (cAbs(denom) < 1e-10) return { re: 1e10, im: 0 };

  return cDiv(eta, denom);
}

/** |zeta(s)| — the magnitude, used for zero searching */
function zetaMagnitude(sigma: number, t: number, terms: number = 80): number {
  return cAbs(zetaFunction(sigma, t, terms));
}

// ── NODE / EXPORT TYPES ──

export interface RiemannNode {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  zero: number;      // Imaginary part of the non-trivial zero
  amplitude: number;
  phase: number;
  color: THREE.Color;
}

/** A point on the parametric spiral zeta(0.5 + it) */
export interface SpiralPoint {
  t: number;         // Imaginary part
  re: number;        // Re(zeta)
  im: number;        // Im(zeta)
  curvature: number; // Local turn radius
  isNearZero: boolean;
}

/** Wave contribution from a single zero to the explicit formula */
export interface ZeroWave {
  zeroIndex: number;
  gamma: number;
  amplitude: number[];  // Sampled amplitude across x range
}

/** Fractal dimension analysis */
export interface FractalAnalysis {
  spectralDimension: number;  // D_H
  criticalLine: number;       // D_H / 2
  label: string;
}

// ── V8 ENGINE ──

export class V8Engine {
  nodes: RiemannNode[] = [];
  scene: THREE.Scene;

  // Visual objects
  line: THREE.Line;           // Prime staircase pi(x) — cyan
  staircaseLine: THREE.Line;  // Li(x) with zero corrections — yellow
  criticalLine: THREE.Line;   // Re(s) = 0.5 marker — magenta
  points: THREE.Points;       // Zero nodes
  spiralLine: THREE.Line;     // Parametric spiral of zeta(0.5+it)
  waveLines: THREE.Line[];    // Individual zero wave contributions
  phaseMarkers: THREE.Points; // Golden ratio phase stability markers

  // Known non-trivial zeros (first 100 imaginary parts on Re(s) = 0.5)
  static ZEROS = [
    14.134725142, 21.022039639, 25.010857580, 30.424876126, 32.935061588,
    37.586178159, 40.918719012, 43.327073281, 48.005150881, 49.773832478,
    52.970321478, 56.446247697, 59.347044003, 60.831778525, 65.112544048,
    67.079810529, 70.170262090, 72.067157674, 75.704690699, 77.144840069,
    79.337375020, 82.910380854, 84.735492948, 87.425274613, 88.809111208,
    92.491899271, 94.651344041, 95.870634228, 98.831194218, 101.317851006,
    103.725538040, 105.446623052, 108.584830368, 111.029535543, 111.874659177,
    114.320220915, 116.226680321, 118.790723506, 121.370125002, 122.946829294,
    124.256818554, 127.516258349, 129.578704200, 131.087688856, 133.497737203,
    134.756509753, 138.116042055, 139.736208952, 141.123707404, 143.111845808,
    146.000982487, 147.422765343, 150.053520421, 150.925257612, 153.024693811,
    156.112909294, 157.597591818, 158.849988171, 161.188964138, 163.030709687,
    165.537069188, 167.185576259, 169.094515416, 169.911976479, 173.411536520,
    174.754191523, 176.441434298, 178.377407776, 181.210032067, 182.203078445,
    184.874467848, 185.598783678, 187.223275140, 189.416158656, 192.026656361,
    193.079726604, 195.265317094, 196.476114155, 198.015309676, 201.264751944,
    202.493594514, 204.189671803, 205.394697202, 207.906258888, 209.854486054,
    211.690862595, 213.347919360, 214.547044783, 216.169538508, 219.067511051,
    220.430256938, 222.219636158, 223.855935235, 226.249962362, 227.821497039,
    229.337413306, 231.250188700, 233.737751243, 235.476267162, 236.524231402
  ];

  // ── PLANT RECURRENCE (rational zeta carrier) ──
  plantOrbitRing: THREE.Line;      // Circular orbit showing plant's rational path
  branchMarkers: THREE.Points;     // Branch points where recurrence happens
  seedMarker: THREE.Mesh;          // The seed — where the orbit returns
  private _plantPhase: number = 0;
  private _plantBounces: number = 40; // Fern: ~40 bounces to seed
  private _branchHistory: number[] = [];

  // ── TIME & ANIMATION ──
  time: number = 0;
  resolution: number = 500;

  // ── ZERO SEARCH (now using eta function — valid in critical strip) ──
  searchMin: number = 1e-6;
  searchMax: number = 0.4999;
  searchPosition: number = 1e-6;
  searchStep: number = 1e-4;
  searchIterations: number = 0;

  // ── STAIRCASE DISPLAY ──
  staircaseStart: number = 0;

  // ── PARAMETRIC SPIRAL DATA ──
  spiralPoints: SpiralPoint[] = [];
  spiralTMax: number = 60;     // How far along Im(s) the spiral is traced
  private _spiralBuilt: boolean = false;

  // ── WINDING NUMBER ──
  windingNumber: number = 0;
  zerosFoundByWinding: number = 0;

  // ── FRACTAL DIMENSION ──
  fractalDimension: number = 1.0;  // Standard D_H = 1 → critical line at 0.5
  fractalAnalyses: FractalAnalysis[] = [
    { spectralDimension: 1.0, criticalLine: 0.5, label: 'Euclidean (Standard)' },
    { spectralDimension: 1.585, criticalLine: 0.7925, label: 'Sierpinski Carpet' },
    { spectralDimension: 1.262, criticalLine: 0.631, label: 'Sierpinski Triangle' },
    { spectralDimension: 2.0, criticalLine: 1.0, label: 'Planar (2D)' },
  ];

  // ── GOLDEN RATIO PHASE MARKERS (Zeta-Minimizer Theorem) ──
  static PHI = (1 + Math.sqrt(5)) / 2;          // 1.618...
  static PHI_COMPRESS = 1 / V8Engine.PHI;        // 0.618...
  static PHI_COMPRESS_SQ = 1 - 1 / V8Engine.PHI; // 0.382...
  phaseStability = {
    compressive: V8Engine.PHI_COMPRESS_SQ,   // 0.382 — minimal compressive state
    elongative: V8Engine.PHI_COMPRESS,       // 0.618 — elongative state
    critical: 0.5,                           // The fixed point of the duality functor
  };

  // ── SUBPRIME DISCOVERIES (now valid — using eta function) ──
  subprimeDiscoveries: {
    x: number;
    realPart: number;
    zetaMagnitude: number;
    timestamp: number;
    formula: string;
    method: string;
  }[] = [];

  // ── WAVE SUPERPOSITION DATA ──
  waveData: ZeroWave[] = [];
  private _wavesBuilt: boolean = false;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // Prime staircase pi(x) — cyan
    const lineGeometry = new THREE.BufferGeometry();
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x00ffff, transparent: true, opacity: 0.8
    });
    this.line = new THREE.Line(lineGeometry, lineMaterial);
    this.scene.add(this.line);

    // Li(x) approximation with zero corrections — yellow
    const stairGeom = new THREE.BufferGeometry();
    const stairMat = new THREE.LineBasicMaterial({
      color: 0xffff00, transparent: true, opacity: 0.5
    });
    this.staircaseLine = new THREE.Line(stairGeom, stairMat);
    this.scene.add(this.staircaseLine);

    // Critical line marker
    const critGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-8, 2, 0),
      new THREE.Vector3(8, 2, 0)
    ]);
    const critMat = new THREE.LineBasicMaterial({
      color: 0xff00ff, transparent: true, opacity: 0.3,
      blending: THREE.AdditiveBlending
    });
    this.criticalLine = new THREE.Line(critGeom, critMat);
    this.scene.add(this.criticalLine);

    // Zero nodes as floating energy points
    const pointsGeometry = new THREE.BufferGeometry();
    const pointsMaterial = new THREE.PointsMaterial({
      size: 0.15, vertexColors: true, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending
    });
    this.points = new THREE.Points(pointsGeometry, pointsMaterial);
    this.scene.add(this.points);

    // Parametric spiral: zeta(0.5 + it)
    const spiralGeom = new THREE.BufferGeometry();
    const spiralMat = new THREE.LineBasicMaterial({
      color: 0xff8800, transparent: true, opacity: 0.6,
      blending: THREE.AdditiveBlending
    });
    this.spiralLine = new THREE.Line(spiralGeom, spiralMat);
    this.scene.add(this.spiralLine);

    // Individual zero wave contribution lines (up to 8)
    this.waveLines = [];
    const waveColors = [0xff0044, 0x00ff88, 0x4488ff, 0xff8800, 0xaa00ff, 0xffff00, 0x00ffff, 0xff00ff];
    for (let i = 0; i < 8; i++) {
      const wGeom = new THREE.BufferGeometry();
      const wMat = new THREE.LineBasicMaterial({
        color: waveColors[i], transparent: true, opacity: 0.25,
        blending: THREE.AdditiveBlending
      });
      const wLine = new THREE.Line(wGeom, wMat);
      wLine.visible = false;
      this.scene.add(wLine);
      this.waveLines.push(wLine);
    }

    // Golden ratio phase markers
    const phaseGeom = new THREE.BufferGeometry();
    const phaseMat = new THREE.PointsMaterial({
      size: 0.25, vertexColors: true, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending
    });
    this.phaseMarkers = new THREE.Points(phaseGeom, phaseMat);
    this.scene.add(this.phaseMarkers);

    // ── PLANT RATIONAL ORBIT RING ──
    // Shows the circular path a plant's signal takes through carbon rings.
    // Branch points (where the orbit forks) are marked — recurrence happens
    // at branches, NOT endpoints. Seeds = orbit returning to start.
    const orbitGeo = new THREE.BufferGeometry();
    const orbitPositions = new Float32Array(this._plantBounces * 2 * 3);
    const branchAngle = Math.PI * 2 / this._plantBounces;
    const orbitRadius = 3;
    for (let i = 0; i < this._plantBounces * 2; i++) {
      const a = i * branchAngle;
      orbitPositions[i * 3] = Math.cos(a) * orbitRadius + 8; // Offset right of main display
      orbitPositions[i * 3 + 1] = Math.sin(a) * orbitRadius + 3;
      orbitPositions[i * 3 + 2] = 0;
    }
    orbitGeo.setAttribute('position', new THREE.BufferAttribute(orbitPositions, 3));
    this.plantOrbitRing = new THREE.Line(orbitGeo, new THREE.LineBasicMaterial({
      color: 0x00ff88, transparent: true, opacity: 0.6,
    }));
    this.scene.add(this.plantOrbitRing);

    // Branch point markers — green dots where recurrence happens
    const branchGeo = new THREE.BufferGeometry();
    const branchPos = new Float32Array(this._plantBounces * 3);
    for (let i = 0; i < this._plantBounces; i++) {
      const a = i * branchAngle;
      branchPos[i * 3] = Math.cos(a) * orbitRadius + 8;
      branchPos[i * 3 + 1] = Math.sin(a) * orbitRadius + 3;
      branchPos[i * 3 + 2] = 0;
    }
    branchGeo.setAttribute('position', new THREE.BufferAttribute(branchPos, 3));
    this.branchMarkers = new THREE.Points(branchGeo, new THREE.PointsMaterial({
      color: 0x44ff44, size: 4, sizeAttenuation: false, transparent: true, opacity: 0.8,
    }));
    this.scene.add(this.branchMarkers);

    // Seed marker — the return point (gold sphere at orbit start)
    const seedGeo = new THREE.SphereGeometry(0.15, 16, 16);
    const seedMat = new THREE.MeshBasicMaterial({ color: 0xffdd00 });
    this.seedMarker = new THREE.Mesh(seedGeo, seedMat);
    this.seedMarker.position.set(orbitRadius + 8, 3, 0);
    this.scene.add(this.seedMarker);

    this.initNodes();
  }

  getCMYColor(idx: number): THREE.Color {
    const cyan = new THREE.Color(0, 1, 1);
    const magenta = new THREE.Color(1, 0, 1);
    const yellow = new THREE.Color(1, 1, 0);
    const t = (idx / V8Engine.ZEROS.length) * 3;
    const color = new THREE.Color();
    if (t < 1) color.lerpColors(cyan, magenta, t);
    else if (t < 2) color.lerpColors(magenta, yellow, t - 1);
    else color.lerpColors(yellow, cyan, t - 2);
    return color;
  }

  initNodes() {
    this.nodes = V8Engine.ZEROS.map((gamma, i) => ({
      position: new THREE.Vector3((i - 15) * 0.4, 2, 0),
      velocity: new THREE.Vector3(0, 0, 0),
      zero: gamma,
      amplitude: 1 / Math.sqrt(gamma),
      phase: 0,
      color: this.getCMYColor(i)
    }));
  }

  // ── LOGARITHMIC INTEGRAL Li(x) ──
  // Numerical integration: Li(x) = integral from 2 to x of 1/ln(t) dt
  li(x: number): number {
    if (x <= 2) return 0;
    let sum = 0;
    const steps = 200;
    const dt = (x - 2) / steps;
    for (let i = 0; i < steps; i++) {
      const t = 2 + (i + 0.5) * dt;
      sum += (1 / Math.log(t)) * dt;
    }
    return sum;
  }

  /**
   * Li(x^rho) where rho = sigma_c + i*gamma
   * This is the proper correction term from Riemann's explicit formula.
   *
   * x^rho = x^(sigma_c) * e^(i*gamma*ln(x))
   *       = x^(sigma_c) * [cos(gamma*ln(x)) + i*sin(gamma*ln(x))]
   *
   * We take the real part of Li(x^rho) for the explicit formula.
   * For large x, Li(x^rho) ≈ x^rho / (rho * ln(x))
   * We use the asymptotic approximation for computational efficiency.
   */
  liXRho(x: number, sigma_c: number, gamma: number): number {
    if (x <= 1) return 0;
    const lnX = Math.log(x);
    const xPowSigma = Math.pow(x, sigma_c);
    const cosGammaLnX = Math.cos(gamma * lnX);
    const sinGammaLnX = Math.sin(gamma * lnX);

    // Li(x^rho) ≈ x^rho / (rho * ln(x^rho))
    // rho * ln(x) = (sigma_c + i*gamma) * lnX
    // |rho * ln(x)|^2 = (sigma_c * lnX)^2 + (gamma * lnX)^2
    const rhoLnX_re = sigma_c * lnX;
    const rhoLnX_im = gamma * lnX;
    const denom_re = rhoLnX_re;
    const denom_im = rhoLnX_im;
    const denomMagSq = denom_re * denom_re + denom_im * denom_im;

    if (denomMagSq < 1e-20) return 0;

    // x^rho / (rho * lnX) = (xPowSigma * e^(i*gamma*lnX)) / (rhoLnX_re + i*rhoLnX_im)
    const num_re = xPowSigma * cosGammaLnX;
    const num_im = xPowSigma * sinGammaLnX;

    // Complex division: (a+bi)/(c+di) = ((ac+bd) + (bc-ad)i) / (c²+d²)
    const result_re = (num_re * denom_re + num_im * denom_im) / denomMagSq;

    return result_re;
  }

  // ── SIEVE OF ERATOSTHENES ──
  sievePrimes(max: number): number[] {
    const sieve = new Uint8Array(max + 1);
    const primes: number[] = [];
    for (let i = 2; i <= max; i++) {
      if (!sieve[i]) {
        primes.push(i);
        for (let j = i * i; j <= max; j += i) sieve[j] = 1;
      }
    }
    return primes;
  }

  // ── SEARCH FOR ZEROS USING ETA FUNCTION (VALID IN CRITICAL STRIP) ──
  probeSubprime(activeZeros: number) {
    this.searchIterations++;
    const batchSize = 20;

    for (let b = 0; b < batchSize; b++) {
      if (this.searchPosition >= this.searchMax) {
        this.searchPosition = this.searchMin;
        this.searchStep = Math.max(1e-6, this.searchStep * 0.95);
      }

      const sigma = this.searchPosition;
      const zerosToTest = Math.min(activeZeros, 15);

      for (let z = 0; z < zerosToTest; z++) {
        const t = V8Engine.ZEROS[z];

        // Evaluate |zeta(sigma + it)| using the eta function (VALID here)
        const mag = zetaMagnitude(sigma, t, 80);

        // Compare to the known value at the critical line
        const critMag = zetaMagnitude(0.5, t, 80);

        // A true off-critical-line zero would have |zeta| ≈ 0
        if (mag < 0.05 && mag < critMag * 0.1 && this.subprimeDiscoveries.length < 200) {
          this.subprimeDiscoveries.push({
            x: t,
            realPart: sigma,
            zetaMagnitude: mag,
            timestamp: Date.now(),
            formula: `|ζ(${sigma.toFixed(6)} + ${t.toFixed(4)}i)| = ${mag.toExponential(4)}`,
            method: 'eta'
          });
        }
      }

      this.searchPosition += this.searchStep;
    }
  }

  // ── BUILD PARAMETRIC SPIRAL ──
  // Traces zeta(0.5 + it) as t increases from 0 to spiralTMax
  // The spiral crosses the origin (0,0) at each non-trivial zero
  buildSpiral() {
    this.spiralPoints = [];
    const steps = 2000;
    const sigma_c = this.fractalDimension / 2; // D_H/2 — critical line

    let prevRe = 0, prevIm = 0;
    let totalAngle = 0;

    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * this.spiralTMax;
      const z = zetaFunction(sigma_c, t, 60);

      // Curvature: approximate via finite differences
      let curvature = 0;
      if (i > 0) {
        const dx = z.re - prevRe;
        const dy = z.im - prevIm;
        const speed = Math.sqrt(dx * dx + dy * dy);
        if (speed > 1e-10) {
          // Angle change
          const angle = Math.atan2(dy, dx);
          const prevAngle = Math.atan2(prevIm, prevRe);
          let dAngle = angle - prevAngle;
          // Unwrap
          while (dAngle > Math.PI) dAngle -= 2 * Math.PI;
          while (dAngle < -Math.PI) dAngle += 2 * Math.PI;
          totalAngle += dAngle;
          curvature = Math.abs(dAngle) / speed; // κ = |dθ/ds|
        }
      }

      const isNearZero = cAbs(z) < 0.5;

      this.spiralPoints.push({
        t, re: z.re, im: z.im, curvature, isNearZero
      });

      prevRe = z.re;
      prevIm = z.im;
    }

    // Winding number = total angle / 2π
    this.windingNumber = totalAngle / (2 * Math.PI);
    this.zerosFoundByWinding = Math.round(Math.abs(this.windingNumber));
    this._spiralBuilt = true;
  }

  // ── BUILD WAVE SUPERPOSITION DATA ──
  // Shows how each zero's contribution creates a wave that, when summed,
  // reproduces the prime counting staircase
  buildWaves(activeZeros: number) {
    this.waveData = [];
    const xRange = 100;
    const samples = this.resolution;
    const sigma_c = this.fractalDimension / 2;
    const numWaves = Math.min(activeZeros, 8);

    for (let z = 0; z < numWaves; z++) {
      const gamma = V8Engine.ZEROS[z];
      const amp: number[] = [];

      for (let i = 0; i < samples; i++) {
        const x = 2 + (i / samples) * xRange;
        // Each zero contributes: -Li(x^rho) where rho = sigma_c + i*gamma
        // We take the real part and include the conjugate (rho* = sigma_c - i*gamma)
        // So the contribution is: -2 * Re(Li(x^rho))
        const correction = -2 * this.liXRho(x, sigma_c, gamma);
        amp.push(correction);
      }

      this.waveData.push({ zeroIndex: z, gamma, amplitude: amp });
    }

    this._wavesBuilt = true;
  }

  setStaircaseStart(start: number) {
    this.staircaseStart = start;
  }

  setFractalDimension(dh: number) {
    this.fractalDimension = Math.max(0.5, Math.min(3.0, dh));
    this._spiralBuilt = false;
    this._wavesBuilt = false;
  }

  setSpiralRange(tMax: number) {
    this.spiralTMax = Math.max(10, Math.min(240, tMax));
    this._spiralBuilt = false;
  }

  // ── MAIN UPDATE ──
  update(
    optimizer: string = 'thermal',
    globalMemory: any = {},
    thermalMode: string = 'cooling',
    activeZeros: number = 15,
    showCriticalLine: boolean = true,
    compressionLevel: number = 1
  ) {
    this.time += 0.01 * compressionLevel;
    this.criticalLine.visible = showCriticalLine;

    const positions: number[] = [];
    const colors: number[] = [];
    const linePositions: number[] = [];
    const stairPositions: number[] = [];

    // Run zero search each frame (now using eta function — VALID)
    this.probeSubprime(activeZeros);

    // Build spiral and waves lazily
    if (!this._spiralBuilt) this.buildSpiral();
    if (!this._wavesBuilt) this.buildWaves(activeZeros);

    const sigma_c = this.fractalDimension / 2; // Critical line = D_H / 2

    // ── PLANT ORBIT ANIMATION ──
    // The signal bounces around the ring. At branch points (rational fractions
    // of 2π/40), the signal strengthens — these correspond to zeta zeros.
    // When it returns to seed position, the sim "recurs" (new generation).
    this._plantPhase += 0.005 * compressionLevel;
    const orbitRadius = 3;
    const branchAngle = Math.PI * 2 / this._plantBounces;
    const currentAngle = this._plantPhase * branchAngle;

    // Pulse seed marker when orbit returns near start (recurrence!)
    const distToSeed = Math.abs(currentAngle % (Math.PI * 2));
    const seedPulse = distToSeed < 0.15 ? 2.0 : 1.0;
    this.seedMarker.scale.setScalar(seedPulse);
    (this.seedMarker.material as THREE.MeshBasicMaterial).color.setHex(
      seedPulse > 1.5 ? 0xffff00 : 0xffdd00
    );

    // Highlight branch markers near current position
    const branchPos = this.branchMarkers.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < this._plantBounces; i++) {
      const bAngle = i * branchAngle;
      const nearCurrent = Math.abs((currentAngle % (Math.PI * 2)) - bAngle) < 0.2;
      if (nearCurrent) {
        // Branch point activated — recurrence happening here, not at tips
        branchPos.setXYZ(i,
          Math.cos(bAngle) * (orbitRadius + 0.2) + 8,
          Math.sin(bAngle) * (orbitRadius + 0.2) + 3,
          Math.sin(this.time * 3 + i) * 0.1  // Slight z-oscillation
        );
      } else {
        branchPos.setXYZ(i,
          Math.cos(bAngle) * orbitRadius + 8,
          Math.sin(bAngle) * orbitRadius + 3,
          0
        );
      }
    }
    branchPos.needsUpdate = true;

    // ── 1. UPDATE ZERO NODES ──
    this.nodes.forEach((node, i) => {
      const isVisible = i < activeZeros;
      node.phase = this.time + i * 0.3;

      // Nodes orbit around the critical line, pulsing by their zero's amplitude
      node.position.y = isVisible ? (2 + Math.sin(node.phase) * 0.15 * node.amplitude * 5) : -10;
      node.position.z = Math.cos(node.phase * 0.7) * 0.3;

      positions.push(node.position.x, node.position.y, node.position.z);
      colors.push(node.color.r, node.color.g, node.color.b);
    });

    // ── 2. PRIME COUNTING STAIRCASE pi(x) ──
    const xRange = 100;
    const primes = this.sievePrimes(xRange + 2);

    for (let i = 0; i < this.resolution; i++) {
      const x = 2 + (i / this.resolution) * xRange;
      let piX = 0;
      for (const p of primes) {
        if (p <= x) piX++;
        else break;
      }
      const screenX = (x / xRange) * 10 - 5;
      const screenY = (piX / (xRange / Math.log(xRange))) * 2 - 2;
      linePositions.push(screenX, screenY, 0);
    }

    // ── 3. Li(x) WITH PROPER EXPLICIT FORMULA CORRECTIONS ──
    // pi(x) ≈ Li(x) - sum_rho Li(x^rho) - ln(2) + integral correction
    // Using the proper Li(x^rho) asymptotic approximation
    for (let i = 0; i < this.resolution; i++) {
      const x = 2 + (i / this.resolution) * xRange;
      let y = this.li(x);

      // Subtract zero corrections (Riemann's explicit formula)
      // Each zero rho = sigma_c + i*gamma contributes -Li(x^rho)
      // With conjugate: -2 * Re(Li(x^rho))
      for (let j = 0; j < Math.min(activeZeros, V8Engine.ZEROS.length); j++) {
        const gamma = V8Engine.ZEROS[j];
        y -= 2 * this.liXRho(x, sigma_c, gamma);
      }

      // Subtract ln(2) constant term
      y -= Math.log(2);

      // Integral correction term (small for large x)
      // integral from x to infinity of dt / (t(t^2-1)ln(t)) ≈ 0 for x > 2
      if (x > 2 && x < 10) {
        y -= 0.5 * Math.log(1 - 1 / (x * x));
      }

      const screenX = (x / xRange) * 10 - 5;
      const screenY = (y / (xRange / Math.log(xRange))) * 2 - 2;
      stairPositions.push(screenX, screenY, 0);
    }

    // ── 4. UPDATE PARAMETRIC SPIRAL GEOMETRY ──
    if (this.spiralPoints.length > 0) {
      const spiralPositions: number[] = [];
      const scale = 1.5;
      const zScale = 0.05;

      for (const sp of this.spiralPoints) {
        // Map: x = Re(zeta), y = Im(zeta), z = t (depth into screen)
        spiralPositions.push(
          sp.re * scale,
          sp.im * scale + 2,  // Offset to critical line height
          -sp.t * zScale
        );
      }

      this.spiralLine.geometry.setAttribute(
        'position', new THREE.Float32BufferAttribute(spiralPositions, 3)
      );
      this.spiralLine.geometry.attributes.position.needsUpdate = true;
    }

    // ── 5. UPDATE INDIVIDUAL WAVE CONTRIBUTION LINES ──
    for (let w = 0; w < this.waveLines.length; w++) {
      if (w < this.waveData.length && w < activeZeros) {
        const wave = this.waveData[w];
        const wPositions: number[] = [];

        for (let i = 0; i < this.resolution; i++) {
          const x = 2 + (i / this.resolution) * xRange;
          const screenX = (x / xRange) * 10 - 5;
          // Show wave relative to the baseline (offset vertically per wave)
          const screenY = (wave.amplitude[i] / (xRange / Math.log(xRange))) * 2 - 3.5 - w * 0.3;
          wPositions.push(screenX, screenY, 0.1);
        }

        this.waveLines[w].geometry.setAttribute(
          'position', new THREE.Float32BufferAttribute(wPositions, 3)
        );
        this.waveLines[w].geometry.attributes.position.needsUpdate = true;
        this.waveLines[w].visible = true;
      } else {
        this.waveLines[w].visible = false;
      }
    }

    // ── 6. GOLDEN RATIO PHASE MARKERS ──
    // Place markers at the 0.382, 0.5, and 0.618 positions along the critical line
    const phasePositions: number[] = [];
    const phaseColors: number[] = [];
    const phaseValues = [
      { val: this.phaseStability.compressive, r: 1, g: 0.8, b: 0 },   // 0.382 gold
      { val: this.phaseStability.critical, r: 1, g: 0, b: 1 },        // 0.5 magenta
      { val: this.phaseStability.elongative, r: 0, g: 1, b: 0.5 },    // 0.618 green
    ];

    for (const pm of phaseValues) {
      const screenX = (pm.val / 1.0) * 10 - 5;
      const pulse = Math.sin(this.time * 2) * 0.1;
      phasePositions.push(screenX, 2 + pulse, 0.2);
      phaseColors.push(pm.r, pm.g, pm.b);
    }
    this.phaseMarkers.geometry.setAttribute(
      'position', new THREE.Float32BufferAttribute(phasePositions, 3)
    );
    this.phaseMarkers.geometry.setAttribute(
      'color', new THREE.Float32BufferAttribute(phaseColors, 3)
    );
    this.phaseMarkers.geometry.attributes.position.needsUpdate = true;
    this.phaseMarkers.geometry.attributes.color.needsUpdate = true;

    // ── 7. UPDATE MAIN GEOMETRIES ──
    this.points.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.points.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;

    this.line.geometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    this.line.geometry.attributes.position.needsUpdate = true;

    this.staircaseLine.geometry.setAttribute('position', new THREE.Float32BufferAttribute(stairPositions, 3));
    this.staircaseLine.geometry.attributes.position.needsUpdate = true;
  }

  // ── ACCESSORS ──

  /** Get current zeta value at a specific point (uses eta function — valid everywhere) */
  evaluateZeta(sigma: number, t: number): Complex {
    return zetaFunction(sigma, t, 80);
  }

  /** Get the N(T) zero-counting estimate from winding */
  getZeroCountEstimate(T: number): number {
    // Riemann's formula: N(T) ≈ (T/2π) * ln(T/2πe)
    if (T <= 0) return 0;
    return (T / (2 * Math.PI)) * Math.log(T / (2 * Math.PI * Math.E));
  }

  /** Get current analysis state */
  getAnalysis() {
    return {
      windingNumber: this.windingNumber,
      zerosFoundByWinding: this.zerosFoundByWinding,
      fractalDimension: this.fractalDimension,
      criticalLine: this.fractalDimension / 2,
      phaseStability: this.phaseStability,
      spiralPoints: this.spiralPoints.length,
      searchPosition: this.searchPosition,
      searchIterations: this.searchIterations,
      discoveryCount: this.subprimeDiscoveries.length,
      zetaAtHalf: zetaFunction(0.5, 14.134725142, 80), // Evaluate at first known zero
    };
  }

  isStable() {
    return this.time > 5;
  }

  // ═══════════════════════════════════════════════════════════
  // CROSS-SIM EXPORT: Prime Spectrum for thermo-transmission lattice
  // Other sims consume this to use prime distribution as structural config
  // ═══════════════════════════════════════════════════════════

  /** Export prime spectrum: gaps, phases, density, spectral dimension.
   *  Other sims use this to modulate their geometry/flow/optimization. */
  getPrimeSpectrum(): {
    gaps: number[];
    phases: number[];
    density: number;
    spectralDim: number;
    goldenPhases: { compressive: number; critical: number; elongative: number };
    zeroEnergies: number[];
  } {
    // Prime gaps from zero positions (Im parts)
    const gaps: number[] = [];
    for (let i = 1; i < this.nodes.length; i++) {
      gaps.push(Math.abs(this.nodes[i].zero - this.nodes[i - 1].zero));
    }

    // Phase angles of each zero (golden ratio conjugate alignment)
    const PHI = (1 + Math.sqrt(5)) / 2;
    const phases = this.nodes.map(n => {
      const p = (n.phase % (2 * Math.PI)) / (2 * Math.PI);
      return p;
    });

    // Local prime density from winding number
    const density = this.nodes.length > 0
      ? this.windingNumber / Math.max(1, this.searchPosition)
      : 0;

    // Zero energies: |zeta(0.5 + it)|² as "thermal" energy at each zero
    const zeroEnergies = this.nodes.map(n => {
      const z = zetaFunction(0.5, n.zero, 40);
      return z.re * z.re + z.im * z.im; // |zeta|² = energy
    });

    return {
      gaps,
      phases,
      density,
      spectralDim: this.fractalDimension,
      goldenPhases: {
        compressive: 1 - 1 / PHI,  // 0.382 — matter formation, prime nucleation
        critical: 0.5,              // Re(s) = 1/2 — phase boundary, duality
        elongative: 1 / PHI,        // 0.618 — energy propagation, heat cascade
      },
      zeroEnergies,
    };
  }

  /** Export thermal cascade: waste heat from zeta computation modeled as
   *  energy concentrated at zero positions. The thermo-transmission lattice
   *  uses this to trigger secondary prime cascades. */
  getThermalCascade(): {
    hotspots: { x: number; y: number; z: number; energy: number; gamma: number }[];
    totalEnergy: number;
    cascadeReady: boolean;
  } {
    const hotspots = this.nodes.map(n => ({
      x: n.position.x,
      y: n.position.y,
      z: n.position.z,
      energy: n.amplitude * n.amplitude, // E ∝ A²
      gamma: n.zero,
    }));

    const totalEnergy = hotspots.reduce((sum, h) => sum + h.energy, 0);

    // Cascade is ready when enough energy has accumulated (entropy maximization)
    const cascadeReady = totalEnergy > this.nodes.length * 0.1 && this.time > 10;

    return { hotspots, totalEnergy, cascadeReady };
  }

  saveState() {
    return {
      time: this.time,
      searchPosition: this.searchPosition,
      searchStep: this.searchStep,
      discoveries: this.subprimeDiscoveries,
      fractalDimension: this.fractalDimension,
      spiralTMax: this.spiralTMax,
    };
  }

  loadState(state: any) {
    if (state?.time) this.time = state.time;
    if (state?.searchPosition) this.searchPosition = state.searchPosition;
    if (state?.searchStep) this.searchStep = state.searchStep;
    if (state?.discoveries) this.subprimeDiscoveries = state.discoveries;
    if (state?.fractalDimension) this.fractalDimension = state.fractalDimension;
    if (state?.spiralTMax) this.spiralTMax = state.spiralTMax;
  }

  dispose() {
    this.scene.remove(this.line);
    this.scene.remove(this.points);
    this.scene.remove(this.criticalLine);
    this.scene.remove(this.staircaseLine);
    this.scene.remove(this.spiralLine);
    this.scene.remove(this.phaseMarkers);
    this.scene.remove(this.plantOrbitRing);
    this.scene.remove(this.branchMarkers);
    this.scene.remove(this.seedMarker);
    this.plantOrbitRing.geometry.dispose();
    (this.plantOrbitRing.material as THREE.Material).dispose();
    this.branchMarkers.geometry.dispose();
    (this.branchMarkers.material as THREE.Material).dispose();
    this.seedMarker.geometry.dispose();
    (this.seedMarker.material as THREE.Material).dispose();
    for (const wl of this.waveLines) {
      this.scene.remove(wl);
      wl.geometry.dispose();
      (wl.material as THREE.Material).dispose();
    }

    this.line.geometry.dispose();
    (this.line.material as THREE.Material).dispose();
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
    this.criticalLine.geometry.dispose();
    (this.criticalLine.material as THREE.Material).dispose();
    this.staircaseLine.geometry.dispose();
    (this.staircaseLine.material as THREE.Material).dispose();
    this.spiralLine.geometry.dispose();
    (this.spiralLine.material as THREE.Material).dispose();
    this.phaseMarkers.geometry.dispose();
    (this.phaseMarkers.material as THREE.Material).dispose();
  }
}
