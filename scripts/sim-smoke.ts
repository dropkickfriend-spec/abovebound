import assert from 'node:assert/strict';
import * as THREE from 'three';

import { FundamentalEngine } from '../src/simulations/fundamental';
import { V0CompressionEngine } from '../src/simulations/v0_compression';
import { V1Engine } from '../src/simulations/v1';
import { V2Engine } from '../src/simulations/v2';
import { V3Engine } from '../src/simulations/v3';
import { V4Engine } from '../src/simulations/v4';
import { V5Engine } from '../src/simulations/v5';
import { V6Engine } from '../src/simulations/v6';
import { V7Engine } from '../src/simulations/v7';
import { V8Engine } from '../src/simulations/v8_riemann';
import { V9LatticeEngine } from '../src/simulations/v9_lattice';
import { V10MeshEngine } from '../src/simulations/v10_mesh';
import { V11HardwareEngine } from '../src/simulations/v11_hardware';
import { V12HouseEngine } from '../src/simulations/v12_house';
import { V13MaterialEngine } from '../src/simulations/v13_material';

const scene = new THREE.Scene();
const disposables: { dispose?: () => void }[] = [];
const check = (condition: unknown, message: string) => assert.ok(condition, message);
const finite = (value: number, message: string) => check(Number.isFinite(value), message);

try {
  const v0 = new V0CompressionEngine(scene);
  disposables.push(v0);
  v0.setCompressionLevel(4);
  for (let i = 0; i < 5; i++) v0.update('thermal', {});
  finite(v0.saveState().phase, 'V0 did not advance its compression field');

  const fundamental = new FundamentalEngine(scene, new THREE.Euler(), new THREE.Color(0x00ffff));
  disposables.push(fundamental);
  for (let i = 0; i < 5; i++) fundamental.update(i * 0.01, 2);
  check(fundamental.saveState().nodes.length > 0, 'Fundamental sim has no nodes');

  const v1 = new V1Engine(scene);
  const v2 = new V2Engine(scene);
  disposables.push(v1, v2);
  v2.setMaterialRef(v1);
  for (let i = 0; i < 3; i++) {
    v1.update('thermal', {}, 'cooling', 1);
    v2.update('thermal', {}, 'cooling', 1);
  }
  finite(v1.getKineticEnergy(), 'V1 kinetic energy is invalid');
  finite(v2.getKineticEnergy(), 'V2 kinetic energy is invalid');

  const routeNodes = Array.from({ length: 12 }, (_, i) => {
    const angle = (i / 12) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(angle) * 2, Math.sin(angle) * 2, (i % 3) * 0.2);
  });
  const rotatedNodes = routeNodes.map(point => new THREE.Vector3(-point.y, point.x, point.z + 0.3));

  const v3 = new V3Engine(scene);
  const v4 = new V4Engine(scene);
  disposables.push(v3, v4);
  v3.captureFromV1(routeNodes);
  v4.captureFromV2(rotatedNodes);
  for (let i = 0; i < 12; i++) {
    v3.update();
    v4.update();
  }
  check(v3.isStable() && v4.isStable(), 'V3/V4 routing never stabilised');
  check(v3.getMSTEdges().length > 0 && v4.getMSTEdges().length > 0, 'V3/V4 did not build routes');

  const v5 = new V5Engine(scene);
  disposables.push(v5);
  v5.captureFromV3V4(v3.getNodes(), v3.getEdges(), v4.getNodes(), v4.getEdges(), 'thermal');
  for (let i = 0; i < 8; i++) v5.update();
  check(v5.isStable(), 'V5 membrane architecture never stabilised');
  check(v5.getBoundaryPlanes().length > 0, 'V5 did not generate boundary planes');

  const v6 = new V6Engine(scene);
  disposables.push(v6);
  v6.captureChain([], v3.getMSTEdges(), v3.getNodes(), v4.getMSTEdges(), v4.getNodes(), v5.getLoops(), 'thermal', 'cooling');
  v6.captureBoundaryPlanes(v5.getBoundaryPlanes());
  for (let i = 0; i < 14; i++) v6.update('thermal', 'cooling', 1);
  check(v6.isStable(), 'V6 flow solver never stabilised');
  finite(v6.getMetrics().efficiency, 'V6 flow efficiency is invalid');
  check(typeof (v6 as any).captureRiemannSpectrum === 'undefined', 'V6 must not let prime data alter physical flow resistance');
  check(typeof (v6 as any).captureRiemannThermalCascade === 'undefined', 'V6 must not turn prime matches into unaccounted cooling');

  const v7 = new V7Engine(scene);
  disposables.push(v7);
  for (let i = 0; i < 16; i++) {
    v7.captureFromV6(v6.getMetrics(), v6.getFlowPaths(), v5.getLoops(), v6.getThermalField(), v6.getGridSize());
    v7.update(1);
  }
  check(v7.isStable(), 'V7 optimizer never stabilised');
  finite(v7.getScore(), 'V7 score is invalid');

  const v8 = new V8Engine(scene);
  disposables.push(v8);
  for (let i = 0; i < 3; i++) v8.update('math', {}, 'cooling', 5, true, 1);
  const zeta = v8.evaluateZeta(0.5, 14.134725142);
  finite(zeta.re, 'V8 zeta real component is invalid');
  finite(zeta.im, 'V8 zeta imaginary component is invalid');
  check(v8.getPrimeSpectrum().gaps.length > 0, 'V8 prime spectrum is empty');

  const v9 = new V9LatticeEngine(scene);
  disposables.push(v9);
  v9.configure('thermal');
  v9.buildLattice();
  v9.update();
  check(v9.isStable(), 'V9 lattice was not built');
  check(v9.getLatticeBounds().length > 0, 'V9 lattice has no boundary nodes');

  const v10 = new V10MeshEngine(scene);
  disposables.push(v10);
  v10.configure('thermal');
  v10.buildMesh();
  v10.update();
  check(v10.isStable(), 'V10 mesh was not built');
  finite(v10.getMetrics().porosity, 'V10 porosity is invalid');

  const v11 = new V11HardwareEngine(scene);
  disposables.push(v11);
  v11.configure('thermal');
  v11.build();
  v11.update();
  check(v11.isStable(), 'V11 hardware envelope was not built');
  check(v11.getBoundaryNodes().length > 0, 'V11 hardware has no boundary nodes');

  const v12 = new V12HouseEngine(scene);
  disposables.push(v12);
  for (let i = 0; i < 3; i++) v12.update('thermal', {}, 'cooling');
  check(v12.getRooms().length > 0, 'V12 house has no rooms');
  finite(v12.getMetrics().hvacLoadW, 'V12 HVAC load is invalid');
  check(v12.getThermalGrid().data.every(Number.isFinite), 'V12 thermal grid contains invalid values');
  check(typeof (v12 as any).captureRiemannSpectrum === 'undefined', 'V12 building physics must not accept prime-spectrum modulation');
  const electricalState = v12.getElectricalState() as Record<string, unknown>;
  check(!('primeResonanceScore' in electricalState), 'V12 electrical state must not report prime resonance as physics');
  check(!('peakShavingReduction' in electricalState), 'V12 must not claim prime-derived peak shaving');

  const v13 = new V13MaterialEngine();
  v13.activateElement(6);
  v13.buildComposite([{ z: 6, fraction: 0.7 }, { z: 14, fraction: 0.3 }]);
  v13.update(1 / 60);
  check(v13.getActiveElement()?.element.z === 6, 'V13 did not activate carbon');
  check(v13.getMetrics().topologyVertices > 0, 'V13 composite topology is empty');

  console.log('Simulation smoke test passed: V0, Fundamental, V1-V13.');
} finally {
  for (const disposable of disposables.reverse()) disposable.dispose?.();
  scene.clear();
}
