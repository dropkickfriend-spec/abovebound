import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { AdaptiveWallOptimizationResult } from '../lib/adaptive_wall_optimizer';
import type { HeightAirflowProfile } from '../lib/height_airflow';
import type { BuildingPhysicsValidationReport } from '../lib/building_physics_validation';
import { inferHouseAirflowNetwork } from '../lib/house_airflow_network';
import type { AutomaticSiteContextResult } from '../lib/site_context';
import {
  DWELLING_ARCHETYPES,
  type WholeHouseOptimizationResult,
} from '../lib/whole_house_optimizer';
import {
  calculateSolarPosition,
  type SiteGeometryOptimizationResult,
  type SiteLocationProfile,
} from '../lib/site_geometry_optimizer';

type WallInputs = {
  indoorTempC: number;
  outdoorLowTempC: number;
  outdoorHighTempC: number;
  fixedSinkTempC: number;
  useFixedSink: boolean;
  wasteSourceTempC: number;
  computeOrCompressorWasteHeatW: number;
  inflatedRValue: number;
  deflatedRValue: number;
};

type Room3D = {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  ceilingHeight: number;
  vents?: Array<{ id?: string; type: string; x: number; y: number; z: number; flowRate?: number; powered?: boolean }>;
};

const disposeScene = (scene: THREE.Scene) => {
  scene.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    materials.forEach(material => material.dispose());
  });
};

const heatColor = (tempC: number) => {
  const normalized = Math.max(0, Math.min(1, (tempC - 10) / 32));
  return new THREE.Color().setHSL((0.66 - normalized * 0.66), 0.9, 0.55);
};

const addGridAndLights = (scene: THREE.Scene) => {
  scene.add(new THREE.HemisphereLight(0xbfe8ff, 0x171018, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(4, 6, 5);
  scene.add(key);
  const grid = new THREE.GridHelper(10, 20, 0x334155, 0x172033);
  grid.position.y = -1.45;
  scene.add(grid);
};

type SoftwarePoint3 = [number, number, number];
type SoftwareView = { yaw: number; pitch: number; zoom: number };
type SoftwareDraw = (ctx: CanvasRenderingContext2D, width: number, height: number, view: SoftwareView, time: number) => void;

const projectSoftwarePoint = (point: SoftwarePoint3, width: number, height: number, view: SoftwareView) => {
  const [x, y, z] = point;
  const cosYaw = Math.cos(view.yaw);
  const sinYaw = Math.sin(view.yaw);
  const rotatedX = x * cosYaw - z * sinYaw;
  const yawDepth = x * sinYaw + z * cosYaw;
  const cosPitch = Math.cos(view.pitch);
  const sinPitch = Math.sin(view.pitch);
  const rotatedY = y * cosPitch - yawDepth * sinPitch;
  const depth = y * sinPitch + yawDepth * cosPitch;
  const perspective = 1 / Math.max(0.5, 1 + depth * 0.045);
  const scale = Math.min(width, height) * 0.13 * view.zoom * perspective;
  return { x: width / 2 + rotatedX * scale, y: height / 2 - rotatedY * scale, depth };
};

const softwareHeatColor = (tempC: number, alpha = 1) => {
  const color = heatColor(tempC);
  return `rgba(${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)},${alpha})`;
};

const drawSoftwareLine = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  view: SoftwareView,
  from: SoftwarePoint3,
  to: SoftwarePoint3,
  color: string,
  lineWidth = 1,
) => {
  const a = projectSoftwarePoint(from, width, height, view);
  const b = projectSoftwarePoint(to, width, height, view);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
};

const drawSoftwareArrow = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  view: SoftwareView,
  from: SoftwarePoint3,
  to: SoftwarePoint3,
  color: string,
  lineWidth = 1.5,
) => {
  const a = projectSoftwarePoint(from, width, height, view);
  const b = projectSoftwarePoint(to, width, height, view);
  drawSoftwareLine(ctx, width, height, view, from, to, color, lineWidth);
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  const arrowSize = 5 + lineWidth;
  ctx.beginPath();
  ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - Math.cos(angle - Math.PI / 6) * arrowSize, b.y - Math.sin(angle - Math.PI / 6) * arrowSize);
  ctx.lineTo(b.x - Math.cos(angle + Math.PI / 6) * arrowSize, b.y - Math.sin(angle + Math.PI / 6) * arrowSize);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
};

const drawSoftwarePolygon = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  view: SoftwareView,
  points: SoftwarePoint3[],
  fill: string,
  stroke = fill,
) => {
  const projected = points.map(point => projectSoftwarePoint(point, width, height, view));
  ctx.beginPath();
  projected.forEach((point, index) => index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.stroke();
};

const boxCorners = (center: SoftwarePoint3, size: SoftwarePoint3) => {
  const [cx, cy, cz] = center;
  const [sx, sy, sz] = size.map(value => value / 2) as SoftwarePoint3;
  return [
    [cx - sx, cy - sy, cz - sz], [cx + sx, cy - sy, cz - sz],
    [cx + sx, cy + sy, cz - sz], [cx - sx, cy + sy, cz - sz],
    [cx - sx, cy - sy, cz + sz], [cx + sx, cy - sy, cz + sz],
    [cx + sx, cy + sy, cz + sz], [cx - sx, cy + sy, cz + sz],
  ] as SoftwarePoint3[];
};

const drawSoftwareBox = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  view: SoftwareView,
  center: SoftwarePoint3,
  size: SoftwarePoint3,
  color: string,
  fill = 'rgba(0,0,0,0)',
) => {
  const corners = boxCorners(center, size);
  drawSoftwarePolygon(ctx, width, height, view, [corners[0], corners[1], corners[2], corners[3]], fill, color);
  drawSoftwarePolygon(ctx, width, height, view, [corners[4], corners[5], corners[6], corners[7]], fill, color);
  [[0, 4], [1, 5], [2, 6], [3, 7]].forEach(([a, b]) => drawSoftwareLine(ctx, width, height, view, corners[a], corners[b], color));
};

function SoftwareCanvas3D({ draw, label }: { draw: SoftwareDraw; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<SoftwareView>({ yaw: -0.62, pitch: -0.28, zoom: 1 });
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const drawRef = useRef(draw);

  useEffect(() => {
    drawRef.current = draw;
  }, [draw]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, canvas.clientWidth);
      const height = Math.max(1, canvas.clientHeight);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    let animation = 0;
    const render = (time: number) => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      context.clearRect(0, 0, width, height);
      const gradient = context.createRadialGradient(width * 0.5, height * 0.45, 10, width * 0.5, height * 0.5, Math.max(width, height) * 0.7);
      gradient.addColorStop(0, '#0b1720');
      gradient.addColorStop(1, '#020407');
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
      try {
        drawRef.current(context, width, height, viewRef.current, time);
      } catch (error) {
        context.fillStyle = 'rgba(127,29,29,0.92)';
        context.fillRect(12, height / 2 - 30, Math.max(180, width - 24), 60);
        context.fillStyle = '#fecaca';
        context.font = '600 11px ui-monospace, monospace';
        context.textAlign = 'center';
        context.fillText('3D DRAW ERROR', width / 2, height / 2 - 8);
        context.font = '9px ui-monospace, monospace';
        context.fillText(error instanceof Error ? error.message.slice(0, 90) : 'Unknown canvas error', width / 2, height / 2 + 12);
      }
      animation = requestAnimationFrame(render);
    };
    animation = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animation);
      observer.disconnect();
    };
  }, []);

  return <canvas
    ref={canvasRef}
    aria-label={label}
    className="w-full h-full cursor-grab active:cursor-grabbing touch-none"
    onPointerDown={event => {
      dragRef.current = { x: event.clientX, y: event.clientY };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      if (!dragRef.current) return;
      const deltaX = event.clientX - dragRef.current.x;
      const deltaY = event.clientY - dragRef.current.y;
      viewRef.current.yaw += deltaX * 0.009;
      viewRef.current.pitch = Math.max(-1.15, Math.min(1.15, viewRef.current.pitch + deltaY * 0.007));
      dragRef.current = { x: event.clientX, y: event.clientY };
    }}
    onPointerUp={() => { dragRef.current = null; }}
    onPointerCancel={() => { dragRef.current = null; }}
    onWheel={event => {
      event.preventDefault();
      viewRef.current.zoom = Math.max(0.55, Math.min(2.5, viewRef.current.zoom * Math.exp(-event.deltaY * 0.0012)));
    }}
  />;
}

function SoftwareAdaptiveWallFallback({ inputs, state }: { inputs: WallInputs; state: { wallCoreTempC: number; wallRValue: number; latticeOpen: boolean; wasteHeatExportW: number; netRoomHeatW: number; sinkTempC: number } }) {
  const draw = useMemo<SoftwareDraw>(() => (ctx, width, height, view, time) => {
    drawSoftwareBox(ctx, width, height, view, [-1.7, 0, 0], [2.6, 2.7, 4.4], 'rgba(80,170,220,0.55)', 'rgba(20,70,100,0.09)');
    drawSoftwareBox(ctx, width, height, view, [-0.28, 0, 0], [0.12, 2.65, 4.05], 'rgba(220,230,240,0.8)', 'rgba(210,220,230,0.16)');
    drawSoftwareBox(ctx, width, height, view, [-0.08, 0, 0], [0.3, 2.55, 3.92], 'rgba(245,158,11,0.65)', 'rgba(245,158,11,0.1)');
    drawSoftwareBox(ctx, width, height, view, [0.18, 0, 0], [0.16, 2.65, 4.05], 'rgba(150,165,185,0.75)', 'rgba(150,165,185,0.15)');
    const bladderWidth = 0.15 + Math.max(0.1, Math.min(1, state.wallRValue / Math.max(1, inputs.inflatedRValue))) * 0.18;
    drawSoftwareBox(ctx, width, height, view, [-0.03, 0, 0], [bladderWidth, 2.25, 3.65], 'rgba(168,85,247,0.9)', 'rgba(168,85,247,0.19)');
    for (let row = 0; row < 6; row += 1) {
      for (let column = 0; column < 8; column += 1) {
        drawSoftwareLine(ctx, width, height, view, [-0.5, -1.02 + row * 0.4, -1.6 + column * 0.45], [0.45, -1.02 + row * 0.4, -1.6 + column * 0.45], state.latticeOpen ? '#ff9d3b' : '#475569', state.latticeOpen ? 2 : 1);
      }
    }
    drawSoftwareBox(ctx, width, height, view, [-1.65, -0.92, 0], [0.72, 0.62, 0.82], '#ff5b46', 'rgba(255,70,45,0.32)');
    drawSoftwareBox(ctx, width, height, view, [1.55, -0.92, 0], [0.8, 0.72, 0.95], softwareHeatColor(state.sinkTempC, 0.95), softwareHeatColor(state.sinkTempC, 0.2));
    const exporting = state.wasteHeatExportW > 0.01;
    for (let index = 0; index < 34; index += 1) {
      const t = (time * 0.00016 + index / 34) % 1;
      const destination = exporting ? 1.55 : -0.45;
      const point: SoftwarePoint3 = [
        THREE.MathUtils.lerp(-1.5, destination, t),
        -0.78 + Math.sin(Math.PI * t) * 1.2,
        Math.sin(t * Math.PI * 4 + index) * 0.22,
      ];
      const projected = projectSoftwarePoint(point, width, height, view);
      ctx.beginPath();
      ctx.arc(projected.x, projected.y, 2.8, 0, Math.PI * 2);
      ctx.fillStyle = exporting ? '#ffb24d' : '#ff4d3d';
      ctx.fill();
    }
  }, [inputs.inflatedRValue, state]);
  return <SoftwareCanvas3D draw={draw} label="Interactive software-rendered 3D adaptive wall cutaway" />;
}

function SoftwareAirflowFallback({ room, profile }: { room: Room3D; profile: HeightAirflowProfile }) {
  const draw = useMemo<SoftwareDraw>(() => (ctx, width, height, view, time) => {
    const roomWidth = Math.min(4.8, Math.max(2.8, room.width * 0.72));
    const roomDepth = Math.min(4.3, Math.max(2.4, room.height * 0.66));
    const roomHeight = Math.min(4.2, Math.max(2.4, profile.ceilingHeightM));
    const verticalScale = roomHeight / profile.ceilingHeightM;
    profile.layers.filter((_, index) => index % 2 === 0).forEach(layer => {
      const y = -1.35 + layer.zCenterM * verticalScale;
      drawSoftwarePolygon(ctx, width, height, view, [
        [-roomWidth / 2, y, -roomDepth / 2], [roomWidth / 2, y, -roomDepth / 2],
        [roomWidth / 2, y, roomDepth / 2], [-roomWidth / 2, y, roomDepth / 2],
      ], softwareHeatColor(layer.temperatureC, 0.09), softwareHeatColor(layer.temperatureC, 0.32));
    });
    drawSoftwareBox(ctx, width, height, view, [0, -1.35 + roomHeight / 2, 0], [roomWidth, roomHeight, roomDepth], 'rgba(180,210,230,0.75)', 'rgba(60,120,150,0.035)');
    const intakeY = -1.35 + profile.intakeHeightM * verticalScale;
    const exhaustY = -1.35 + profile.exhaustHeightM * verticalScale;
    const intake = projectSoftwarePoint([-roomWidth / 2, intakeY, 0], width, height, view);
    const exhaust = projectSoftwarePoint([roomWidth / 2, exhaustY, 0], width, height, view);
    [[intake, '#3b82f6'], [exhaust, '#ef4444']].forEach(([point, color]) => {
      const p = point as { x: number; y: number };
      ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI * 2); ctx.fillStyle = color as string; ctx.fill();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1; ctx.stroke();
    });
    const direction = profile.reverseStackRisk ? -1 : 1;
    for (let index = 0; index < 58; index += 1) {
      let t = (time * Math.max(0.00004, Math.min(0.00025, profile.effectiveFlowM3s * 0.002)) + index / 58) % 1;
      if (direction < 0) t = 1 - t;
      const point: SoftwarePoint3 = [
        THREE.MathUtils.lerp(-roomWidth / 2, roomWidth / 2, t),
        THREE.MathUtils.lerp(intakeY, exhaustY, t * t * (3 - 2 * t)) + Math.sin(Math.PI * t) * roomHeight * 0.1,
        Math.sin((t + index / 58) * Math.PI * 4) * roomDepth * 0.22,
      ];
      const projected = projectSoftwarePoint(point, width, height, view);
      const layerTemp = profile.layers[Math.min(profile.layers.length - 1, Math.floor(t * profile.layers.length))]?.temperatureC ?? 22;
      ctx.beginPath(); ctx.arc(projected.x, projected.y, 2.4, 0, Math.PI * 2); ctx.fillStyle = softwareHeatColor(layerTemp); ctx.fill();
    }
  }, [profile, room.height, room.width]);
  return <SoftwareCanvas3D draw={draw} label="Interactive software-rendered 3D height-aware room airflow cutaway" />;
}

export function SoftwareSimulationFallback() {
  const draw = useMemo<SoftwareDraw>(() => (ctx, width, height, view, time) => {
    const size = 3.4;
    drawSoftwareBox(ctx, width, height, view, [0, 0, 0], [size, size, size], 'rgba(34,211,238,0.55)', 'rgba(20,80,100,0.035)');
    for (let axis = -3; axis <= 3; axis += 1) {
      const offset = axis * 0.48;
      drawSoftwareLine(ctx, width, height, view, [-1.7, offset, -1.7], [1.7, offset, 1.7], 'rgba(139,92,246,0.28)');
      drawSoftwareLine(ctx, width, height, view, [offset, -1.7, 1.7], [offset, 1.7, -1.7], 'rgba(34,211,238,0.25)');
    }
    for (let index = 0; index < 44; index += 1) {
      const phase = time * 0.0003 + index * 0.73;
      const point: SoftwarePoint3 = [Math.cos(phase) * 1.5, Math.sin(phase * 0.71) * 1.45, Math.sin(phase) * 1.5];
      const projected = projectSoftwarePoint(point, width, height, view);
      ctx.beginPath(); ctx.arc(projected.x, projected.y, 2.5, 0, Math.PI * 2); ctx.fillStyle = index % 2 ? '#22d3ee' : '#a855f7'; ctx.fill();
    }
  }, []);
  return <SoftwareCanvas3D draw={draw} label="Interactive software-rendered 3D simulation field" />;
}

export function AdaptiveWallCutaway3D({
  result,
  inputs,
}: {
  result: AdaptiveWallOptimizationResult | null;
  inputs: WallInputs;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [webGlError, setWebGlError] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [frameIndex, setFrameIndex] = useState(0);
  const trace = result?.best.trace || [];

  useEffect(() => {
    if (!playing || trace.length < 2) return;
    const timer = window.setInterval(() => setFrameIndex(index => (index + 1) % trace.length), 650);
    return () => window.clearInterval(timer);
  }, [playing, trace.length]);

  useEffect(() => {
    if (frameIndex >= trace.length && trace.length > 0) setFrameIndex(0);
  }, [frameIndex, trace.length]);

  const frame = trace[frameIndex];
  const sceneState = useMemo(() => ({
    outsideTempC: frame?.outdoorTempC ?? (inputs.outdoorLowTempC + inputs.outdoorHighTempC) / 2,
    wallCoreTempC: frame?.wallCoreTempC ?? (inputs.indoorTempC + (inputs.outdoorLowTempC + inputs.outdoorHighTempC) / 2) / 2,
    wallRValue: frame?.wallRValue ?? result?.best.trace[0]?.wallRValue ?? inputs.inflatedRValue,
    latticeOpen: frame?.latticeOpen ?? false,
    wasteHeatExportW: frame?.wasteHeatExportW ?? 0,
    netRoomHeatW: frame?.netRoomHeatW ?? inputs.computeOrCompressorWasteHeatW,
    sinkTempC: inputs.useFixedSink ? inputs.fixedSinkTempC : frame?.outdoorTempC ?? inputs.outdoorHighTempC,
  }), [frame, inputs, result]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || webGlError) return;
    for (const child of Array.from(container.children)) if (child instanceof HTMLCanvasElement) child.remove();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070b);
    const camera = new THREE.PerspectiveCamera(48, Math.max(container.clientWidth, 1) / Math.max(container.clientHeight, 1), 0.05, 100);
    camera.position.set(5.4, 3.1, 5.8);
    camera.lookAt(0, 0, 0);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setWebGlError(true);
      return;
    }
    setWebGlError(false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.domElement.setAttribute('aria-label', 'Interactive 3D adaptive wall cutaway');
    container.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 3.5;
    controls.maxDistance = 12;
    controls.target.set(0, 0, 0);
    addGridAndLights(scene);

    const roomSide = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, 2.7, 4.7),
      new THREE.MeshPhysicalMaterial({ color: 0x172033, transparent: true, opacity: 0.13, side: THREE.DoubleSide }),
    );
    roomSide.position.x = -1.75;
    scene.add(roomSide);

    const layerSpecs = [
      { x: -0.28, thickness: 0.12, color: 0xcbd5e1, opacity: 0.45 },
      { x: -0.08, thickness: 0.28, color: 0xf59e0b, opacity: 0.2 },
      { x: 0.18, thickness: 0.18, color: 0x94a3b8, opacity: 0.42 },
    ];
    layerSpecs.forEach(layer => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(layer.thickness, 2.65, 4.1),
        new THREE.MeshPhysicalMaterial({ color: layer.color, transparent: true, opacity: layer.opacity, roughness: 0.55 }),
      );
      mesh.position.x = layer.x;
      scene.add(mesh);
    });

    const bladderScale = Math.max(0.25, Math.min(1, (sceneState.wallRValue - inputs.deflatedRValue) / Math.max(0.1, inputs.inflatedRValue - inputs.deflatedRValue)));
    const bladder = new THREE.Mesh(
      new THREE.BoxGeometry(0.16 + bladderScale * 0.18, 2.35, 3.75),
      new THREE.MeshPhysicalMaterial({ color: 0x8b5cf6, emissive: 0x351070, transparent: true, opacity: 0.3, roughness: 0.15 }),
    );
    bladder.position.x = -0.06;
    scene.add(bladder);

    const latticeGroup = new THREE.Group();
    const latticeColor = sceneState.latticeOpen ? 0xff9d3b : 0x475569;
    for (let row = 0; row < 6; row += 1) {
      for (let column = 0; column < 8; column += 1) {
        const rod = new THREE.Mesh(
          new THREE.CylinderGeometry(0.018, 0.018, 0.7, 6),
          new THREE.MeshStandardMaterial({ color: latticeColor, emissive: sceneState.latticeOpen ? 0x6f2600 : 0x0f172a }),
        );
        rod.rotation.z = Math.PI / 2;
        rod.position.set(-0.03, -1.05 + row * 0.42, -1.65 + column * 0.47);
        latticeGroup.add(rod);
      }
    }
    scene.add(latticeGroup);

    const source = new THREE.Mesh(
      new THREE.BoxGeometry(0.75, 0.65, 0.85),
      new THREE.MeshStandardMaterial({ color: 0xff513f, emissive: 0x7f150d }),
    );
    source.position.set(-1.65, -0.86, 0);
    scene.add(source);
    const sink = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.75, 1),
      new THREE.MeshStandardMaterial({ color: heatColor(sceneState.sinkTempC), emissive: heatColor(sceneState.sinkTempC).multiplyScalar(0.35) }),
    );
    sink.position.set(1.55, -0.82, 0);
    scene.add(sink);

    const coreGlow = new THREE.PointLight(heatColor(sceneState.wallCoreTempC), 2.4, 4);
    coreGlow.position.set(0, 0.3, 0);
    scene.add(coreGlow);

    const exporting = sceneState.wasteHeatExportW > 0.01;
    const particles: Array<{ mesh: THREE.Mesh; offset: number; roomLoop: boolean }> = [];
    for (let index = 0; index < 56; index += 1) {
      const roomLoop = !exporting && index >= 20;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(roomLoop ? 0.035 : 0.045, 8, 8),
        new THREE.MeshBasicMaterial({ color: roomLoop ? 0xff473d : 0xffb24d }),
      );
      scene.add(mesh);
      particles.push({ mesh, offset: index / 56, roomLoop });
    }

    const resize = () => {
      if (!container.clientWidth || !container.clientHeight) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    let animation = 0;
    const animate = (now: number) => {
      const time = now * 0.00018;
      particles.forEach(particle => {
        const t = (time + particle.offset) % 1;
        if (particle.roomLoop) {
          particle.mesh.position.set(-1.6 + Math.cos(t * Math.PI * 2) * 0.55, -0.15 + Math.sin(t * Math.PI * 2) * 0.75, Math.sin(t * Math.PI * 4) * 0.5);
        } else {
          const destinationX = exporting ? 1.55 : -0.45;
          particle.mesh.position.set(
            THREE.MathUtils.lerp(-1.45, destinationX, t),
            -0.78 + Math.sin(Math.PI * t) * 1.25,
            Math.sin(t * Math.PI * 4 + particle.offset * 7) * 0.24,
          );
        }
      });
      controls.update();
      renderer.render(scene, camera);
      animation = requestAnimationFrame(animate);
    };
    animation = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(animation);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      disposeScene(scene);
      if (renderer.domElement.parentElement === container) container.removeChild(renderer.domElement);
    };
  }, [inputs.deflatedRValue, inputs.inflatedRValue, sceneState, webGlError]);

  return <div className="space-y-2">
    <div className="relative h-[360px] md:h-[430px] rounded-xl overflow-hidden border border-orange-500/20 bg-[#05070b]">
      {webGlError
        ? <div className="absolute inset-0"><SoftwareAdaptiveWallFallback inputs={inputs} state={sceneState} /></div>
        : <div ref={containerRef} className="absolute inset-0" />}
      <div className="absolute left-3 top-3 pointer-events-none rounded-lg bg-black/70 border border-white/10 px-3 py-2 text-[8px] font-mono space-y-1">
        <div className="text-cyan-300">ROOM {inputs.indoorTempC.toFixed(1)}°C</div>
        <div className="text-orange-300">CORE {sceneState.wallCoreTempC.toFixed(1)}°C · R{sceneState.wallRValue.toFixed(1)}</div>
        <div className="text-blue-300">SINK {sceneState.sinkTempC.toFixed(1)}°C</div>
        <div className={sceneState.latticeOpen ? 'text-emerald-300' : 'text-gray-500'}>LATTICE {sceneState.latticeOpen ? 'OPEN' : 'ISOLATED'}</div>
      </div>
      <div className="absolute right-3 top-3 pointer-events-none rounded-lg bg-black/70 border border-white/10 px-3 py-2 text-right text-[8px] font-mono">
        <div className="text-red-300">WASTE SOURCE {inputs.wasteSourceTempC.toFixed(0)}°C</div>
        <div className="text-orange-200">EXPORTED {sceneState.wasteHeatExportW.toFixed(0)} W</div>
        <div className={sceneState.netRoomHeatW > 0 ? 'text-red-300' : 'text-cyan-300'}>ROOM LOAD {sceneState.netRoomHeatW.toFixed(0)} W</div>
      </div>
      <div className="absolute bottom-3 left-3 pointer-events-none text-[8px] text-gray-500 bg-black/60 px-2 py-1 rounded">Drag to orbit · wheel/pinch to zoom</div>
      {webGlError && <div className="absolute bottom-3 right-3 pointer-events-none text-[8px] text-cyan-300 bg-black/70 border border-cyan-500/20 px-2 py-1 rounded">Software 3D · WebGL-free</div>}
    </div>
    {trace.length > 0 && <div className="flex items-center gap-3">
      <button onClick={() => setPlaying(value => !value)} className="px-3 py-1 rounded bg-orange-500/10 border border-orange-500/20 text-[8px] text-orange-300 uppercase">{playing ? 'Pause time' : 'Play time'}</button>
      <input aria-label="Wall simulation time" type="range" min="0" max={Math.max(0, trace.length - 1)} value={frameIndex} onChange={event => { setFrameIndex(Number(event.target.value)); setPlaying(false); }} className="flex-1 accent-orange-500" />
      <span className="text-[8px] font-mono text-gray-500 w-12 text-right">{frame?.hour.toFixed(1)} h</span>
    </div>}
    <div className="flex flex-wrap gap-3 text-[8px] text-gray-500">
      <span><i className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1"/>heat retained indoors</span>
      <span><i className="inline-block w-2 h-2 rounded-full bg-orange-400 mr-1"/>heat exported through lattice</span>
      <span><i className="inline-block w-2 h-2 rounded-sm bg-purple-500 mr-1"/>expandable insulation bladder</span>
    </div>
  </div>;
}

export function HouseAirflowNetwork3D({
  rooms,
  profiles,
  selectedRoomId,
}: {
  rooms: Room3D[];
  profiles: HeightAirflowProfile[];
  selectedRoomId?: string;
}) {
  const [showCavities, setShowCavities] = useState(true);
  const [showCeilings, setShowCeilings] = useState(true);
  const network = useMemo(() => inferHouseAirflowNetwork(rooms), [rooms]);
  const selectedRoom = rooms.find(room => room.id === selectedRoomId) || rooms[0];
  const profileMap = useMemo(() => new Map(profiles.map(profile => [profile.roomId, profile])), [profiles]);
  const roofRoutes = network.ventRoutes.filter(route => route.routeKind === 'roof-discharge');
  const openCavities = network.cavities.filter(cavity => cavity.openTransfer);
  const heightRange = rooms.length
    ? `${Math.min(...rooms.map(room => room.ceilingHeight)).toFixed(1)}–${Math.max(...rooms.map(room => room.ceilingHeight)).toFixed(1)} m`
    : '—';

  const draw = useMemo<SoftwareDraw>(() => (ctx, width, height, view, time) => {
    if (!rooms.length) return;
    const bounds = network.bounds;
    const planScale = 5 / Math.max(bounds.width, bounds.height, 1);
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    const floorY = -1.28;
    const toWorld = (x: number, y: number, elevationM: number): SoftwarePoint3 => [
      (x - centerX) * planScale,
      floorY + elevationM * planScale,
      (y - centerY) * planScale,
    ];
    const drawLabel = (text: string, point: SoftwarePoint3, color: string, font = '600 9px ui-monospace, monospace') => {
      const projected = projectSoftwarePoint(point, width, height, view);
      ctx.font = font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const measured = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(2,6,10,0.82)';
      ctx.fillRect(projected.x - measured / 2 - 4, projected.y - 7, measured + 8, 14);
      ctx.fillStyle = color;
      ctx.fillText(text, projected.x, projected.y);
    };

    // Floors and true-height room shells recreate the same geometry used by
    // the horizontal plan field, without inventing a roof form.
    rooms.forEach(room => {
      const selected = room.id === selectedRoomId;
      const x0 = room.x;
      const x1 = room.x + room.width;
      const y0 = room.y;
      const y1 = room.y + room.height;
      const wallHeight = room.ceilingHeight * planScale;
      const floorCorners: SoftwarePoint3[] = [
        toWorld(x0, y0, 0), toWorld(x1, y0, 0), toWorld(x1, y1, 0), toWorld(x0, y1, 0),
      ];
      drawSoftwarePolygon(
        ctx, width, height, view, floorCorners,
        selected ? 'rgba(6,182,212,0.16)' : 'rgba(71,85,105,0.10)',
        selected ? 'rgba(34,211,238,0.82)' : 'rgba(148,163,184,0.36)',
      );
      drawSoftwareBox(
        ctx, width, height, view,
        toWorld(room.x + room.width / 2, room.y + room.height / 2, room.ceilingHeight / 2),
        [room.width * planScale, wallHeight, room.height * planScale],
        selected ? 'rgba(34,211,238,0.95)' : 'rgba(148,163,184,0.48)',
        'rgba(0,0,0,0)',
      );
      if (showCeilings) {
        drawSoftwarePolygon(ctx, width, height, view, [
          toWorld(x0, y0, room.ceilingHeight), toWorld(x1, y0, room.ceilingHeight),
          toWorld(x1, y1, room.ceilingHeight), toWorld(x0, y1, room.ceilingHeight),
        ], selected ? 'rgba(34,211,238,0.045)' : 'rgba(148,163,184,0.025)', selected ? 'rgba(34,211,238,0.48)' : 'rgba(148,163,184,0.22)');
      }
    });

    if (showCavities) network.cavities.forEach(cavity => {
      const selected = cavity.roomAId === selectedRoomId || cavity.roomBId === selectedRoomId;
      const color = cavity.openTransfer
        ? (selected ? 'rgba(192,132,252,1)' : 'rgba(168,85,247,0.78)')
        : (selected ? 'rgba(251,191,36,0.95)' : 'rgba(245,158,11,0.48)');
      const fill = cavity.openTransfer ? 'rgba(168,85,247,0.16)' : 'rgba(245,158,11,0.075)';
      const center = toWorld(cavity.centerX, cavity.centerY, cavity.heightM / 2);
      const size: SoftwarePoint3 = cavity.orientation === 'x-wall'
        ? [Math.max(0.08, planScale * 0.18), cavity.heightM * planScale, cavity.lengthM * planScale]
        : [cavity.lengthM * planScale, cavity.heightM * planScale, Math.max(0.08, planScale * 0.18)];
      drawSoftwareBox(ctx, width, height, view, center, size, color, fill);
      if (cavity.openTransfer) {
        const top = toWorld(cavity.centerX, cavity.centerY, cavity.heightM * 0.62);
        const pulse = (Math.sin(time * 0.004) + 1) / 2;
        const projected = projectSoftwarePoint(top, width, height, view);
        ctx.beginPath();
        ctx.arc(projected.x, projected.y, 4 + pulse * 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(192,132,252,${0.4 + pulse * 0.45})`;
        ctx.fill();
      }
    });

    // Animate the selected-room displacement path more strongly while keeping
    // every other room visible as part of the whole-house airflow network.
    rooms.forEach(room => {
      const profile = profileMap.get(room.id);
      const intake = room.vents?.find(vent => vent.type === 'intake');
      const exhaust = room.vents?.find(vent => vent.type === 'exhaust');
      if (!profile || !intake || !exhaust) return;
      const selected = room.id === selectedRoomId;
      const particleCount = selected ? 20 : 8;
      const speed = Math.max(0.045, Math.min(0.22, profile.effectiveFlowM3s * 1.8));
      for (let index = 0; index < particleCount; index += 1) {
        let progress = (time * 0.001 * speed + index / particleCount) % 1;
        if (profile.reverseStackRisk) progress = 1 - progress;
        const smooth = progress * progress * (3 - 2 * progress);
        const x = THREE.MathUtils.lerp(intake.x, exhaust.x, progress);
        const planY = THREE.MathUtils.lerp(intake.y, exhaust.y, progress)
          + Math.sin(progress * Math.PI * 2 + index) * room.height * 0.045;
        const elevation = THREE.MathUtils.lerp(profile.intakeHeightM, profile.exhaustHeightM, smooth)
          + Math.sin(Math.PI * progress) * room.ceilingHeight * 0.08;
        const point = toWorld(x, planY, elevation);
        const projected = projectSoftwarePoint(point, width, height, view);
        const layerIndex = Math.min(profile.layers.length - 1, Math.max(0, Math.floor((elevation / room.ceilingHeight) * profile.layers.length)));
        ctx.beginPath();
        ctx.arc(projected.x, projected.y, selected ? 3 : 1.8, 0, Math.PI * 2);
        ctx.fillStyle = softwareHeatColor(profile.layers[layerIndex]?.temperatureC ?? 22, selected ? 1 : 0.66);
        ctx.fill();
      }
    });

    // Vent markers are placed at their actual stored x/y/z coordinates.
    rooms.forEach(room => room.vents?.forEach(vent => {
      const color = vent.type === 'intake' ? '#3b82f6' : vent.type === 'exhaust' ? '#ef4444' : '#a855f7';
      const projected = projectSoftwarePoint(toWorld(vent.x, vent.y, vent.z), width, height, view);
      ctx.beginPath();
      ctx.arc(projected.x, projected.y, room.id === selectedRoomId ? 5 : 3.4, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = room.id === selectedRoomId ? '#ffffff' : 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }));

    // Red routes make the containment boundary explicit. They are proposed
    // ducts, not evidence that a real duct or roof penetration exists.
    roofRoutes.forEach(route => {
      const from = toWorld(route.start.x, route.start.y, route.start.z);
      const to = toWorld(route.end.x, route.end.y, route.end.z);
      drawSoftwareArrow(ctx, width, height, view, from, to, 'rgba(248,113,113,0.8)', route.roomId === selectedRoomId ? 2.4 : 1.2);
      const count = route.roomId === selectedRoomId ? 8 : 4;
      for (let index = 0; index < count; index += 1) {
        const progress = (time * 0.00028 + index / count) % 1;
        const point: SoftwarePoint3 = [
          THREE.MathUtils.lerp(from[0], to[0], progress) + Math.sin(progress * 12 + index) * 0.04,
          THREE.MathUtils.lerp(from[1], to[1], progress),
          THREE.MathUtils.lerp(from[2], to[2], progress) + Math.cos(progress * 10 + index) * 0.04,
        ];
        const projected = projectSoftwarePoint(point, width, height, view);
        ctx.beginPath();
        ctx.arc(projected.x, projected.y, route.roomId === selectedRoomId ? 2.5 : 1.6, 0, Math.PI * 2);
        ctx.fillStyle = '#f87171';
        ctx.fill();
      }
    });

    // Labels are drawn last so they remain readable as the model is orbited.
    rooms.forEach(room => drawLabel(
      `${room.name} · ${room.ceilingHeight.toFixed(1)}m`,
      toWorld(room.x + room.width / 2, room.y + room.height / 2, room.ceilingHeight + 0.18),
      room.id === selectedRoomId ? '#67e8f9' : '#cbd5e1',
      room.id === selectedRoomId ? '700 10px ui-monospace, monospace' : '600 8px ui-monospace, monospace',
    ));
    roofRoutes.filter(route => route.roomId === selectedRoomId).forEach(route => drawLabel(
      'PROPOSED OUTDOOR DISCHARGE',
      toWorld(route.end.x, route.end.y, route.end.z + 0.12),
      '#fca5a5',
      '700 8px ui-monospace, monospace',
    ));
  }, [network, profileMap, roofRoutes, rooms, selectedRoomId, showCavities, showCeilings]);

  if (!rooms.length) return <div className="h-[440px] rounded-xl border border-white/10 bg-black/40 grid place-items-center text-[10px] text-gray-600">Waiting for house geometry…</div>;

  return <div className="space-y-3">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h4 className="text-[10px] font-black text-cyan-300 uppercase">Whole-house 3D airflow cutaway</h4>
        <p className="text-[8px] text-gray-500 mt-1 max-w-2xl">The horizontal solver's floor plan is lifted to true room heights. Air paths use the stored vent coordinates; shared cavities are inferred only where room boundaries touch.</p>
      </div>
      <div className="flex gap-2">
        <button onClick={() => setShowCavities(value => !value)} className={`px-3 py-1.5 rounded-lg border text-[8px] font-bold uppercase ${showCavities ? 'bg-purple-500/15 border-purple-500/35 text-purple-200' : 'bg-black/40 border-white/10 text-gray-500'}`}>{showCavities ? 'Cavities on' : 'Cavities off'}</button>
        <button onClick={() => setShowCeilings(value => !value)} className={`px-3 py-1.5 rounded-lg border text-[8px] font-bold uppercase ${showCeilings ? 'bg-cyan-500/15 border-cyan-500/35 text-cyan-200' : 'bg-black/40 border-white/10 text-gray-500'}`}>{showCeilings ? 'Ceilings on' : 'Ceilings off'}</button>
      </div>
    </div>
    <div className="relative h-[470px] md:h-[560px] rounded-xl overflow-hidden border border-cyan-500/25 bg-[#020407]">
      <SoftwareCanvas3D draw={draw} label="Interactive 3D whole-house airflow, shared cavity and outdoor discharge cutaway" />
      <div className="absolute left-3 top-3 pointer-events-none rounded-lg bg-black/80 border border-white/10 px-3 py-2 text-[8px] font-mono space-y-1">
        <div className="text-white font-bold">TRUE HEIGHT · {rooms.length} ROOMS</div>
        <div className="text-cyan-300">SELECTED {selectedRoom?.name.toUpperCase()}</div>
        <div className="text-gray-300">CEILINGS {heightRange}</div>
        <div className="text-purple-300">{network.cavities.length} SHARED WALLS · {openCavities.length} OPEN TRANSFER</div>
        <div className="text-red-300">{roofRoutes.length} PROPOSED ROOF DISCHARGES</div>
      </div>
      <div className="absolute bottom-3 left-3 pointer-events-none text-[8px] text-gray-400 bg-black/75 border border-white/10 px-2 py-1 rounded">Drag to orbit · wheel/pinch to zoom · same geometry as plan view</div>
      <div className="absolute bottom-3 right-3 pointer-events-none text-[8px] text-cyan-300 bg-black/75 border border-cyan-500/20 px-2 py-1 rounded">Software 3D · WebGL-free</div>
    </div>
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-[8px] text-gray-400">
      <span><i className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1"/>supply/intake</span>
      <span><i className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1"/>exhaust + proposed outdoor route</span>
      <span><i className="inline-block w-2 h-2 rounded-sm bg-purple-500 mr-1"/>open transfer cavity</span>
      <span><i className="inline-block w-2 h-2 rounded-sm bg-amber-500 mr-1"/>touching wall · cavity unverified</span>
      <span><i className="inline-block w-2 h-2 rounded-sm border border-cyan-400 mr-1"/>selected room</span>
    </div>
    <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-[8px] text-amber-100/75 leading-relaxed">
      Geometry truth: touching rooms prove a shared wall, not an open air path. Purple means a transfer vent is present in the model; amber needs a grille, duct or plenum to be specified. Red roof lines are required discharge routes to test and manufacture—not confirmed construction.
    </div>
  </div>;
}

const monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function EarthSiteHouse3D({
  rooms,
  location,
  siteOptimization,
  wholeHouse,
  siteContext,
  physicsValidation,
}: {
  rooms: Room3D[];
  location: SiteLocationProfile;
  siteOptimization: SiteGeometryOptimizationResult | null;
  wholeHouse: WholeHouseOptimizationResult | null;
  siteContext: AutomaticSiteContextResult | null;
  physicsValidation: BuildingPhysicsValidationReport | null;
}) {
  const [playing, setPlaying] = useState(true);
  const [annualFrame, setAnnualFrame] = useState(0);
  const frame = annualFrame % 288;
  const monthIndex = Math.floor(frame / 24);
  const solarHour = frame % 24;
  const dayOfYear = Math.round(15 + monthIndex * 30.44);
  const sun = calculateSolarPosition(location.latitudeDeg, dayOfYear, solarHour);
  const altitudeDeg = sun.altitudeRad * 180 / Math.PI;
  const azimuthDeg = sun.azimuthRad * 180 / Math.PI;
  const winner = wholeHouse?.best;
  const archetype = winner ? DWELLING_ARCHETYPES[winner.configuration.archetype] : DWELLING_ARCHETYPES.detached;
  const winningComparison = wholeHouse?.archetypeComparisons.find(item => item.archetype === winner?.configuration.archetype);
  const topArchetypes = useMemo(() => wholeHouse
    ? [...wholeHouse.archetypeComparisons].sort((a, b) => a.lifecycleEnergyKWh - b.lifecycleEnergyKWh).slice(0, 3)
    : [], [wholeHouse]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setAnnualFrame(value => (value + 1) % 288), 180);
    return () => window.clearInterval(timer);
  }, [playing]);

  const footprint = useMemo(() => {
    const optimized = siteOptimization?.best.footprintPolygons;
    if (optimized?.length) return optimized;
    if (rooms.length) return rooms.map(room => [
      { x: room.x, y: room.y }, { x: room.x + room.width, y: room.y },
      { x: room.x + room.width, y: room.y + room.height }, { x: room.x, y: room.y + room.height },
    ]);
    return [[{ x: 0, y: 0 }, { x: 8.6, y: 0 }, { x: 8.6, y: 8.3 }, { x: 0, y: 8.3 }]];
  }, [rooms, siteOptimization]);

  const draw = useMemo<SoftwareDraw>(() => (ctx, width, height, view, time) => {
    const allPoints = footprint.flat();
    const minX = Math.min(...allPoints.map(point => point.x));
    const maxX = Math.max(...allPoints.map(point => point.x));
    const minY = Math.min(...allPoints.map(point => point.y));
    const maxY = Math.max(...allPoints.map(point => point.y));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const planScale = 5.7 / Math.max(1, maxX - minX, maxY - minY);
    const floorY = -1.28;
    const houseHeightM = siteOptimization?.best.design.ceilingHeightM
      || Math.max(2.7, ...rooms.map(room => room.ceilingHeight));
    const floorCount = winner?.configuration.archetype === 'tower_apartment_mid' ? 8
      : winner?.configuration.archetype === 'lowrise_apartment_mid' ? 3 : 1;
    const displayHouseHeightM = houseHeightM * floorCount;
    const toWorld = (x: number, y: number, elevationM: number): SoftwarePoint3 => [
      (x - centerX) * planScale,
      floorY + elevationM * planScale,
      (y - centerY) * planScale,
    ];
    const drawLabel = (label: string, point: SoftwarePoint3, color = '#e2e8f0') => {
      const projected = projectSoftwarePoint(point, width, height, view);
      ctx.font = '700 8px ui-monospace, monospace';
      ctx.textAlign = 'center';
      const labelWidth = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(2,6,10,0.8)';
      ctx.fillRect(projected.x - labelWidth / 2 - 3, projected.y - 6, labelWidth + 6, 12);
      ctx.fillStyle = color;
      ctx.fillText(label, projected.x, projected.y + 3);
    };

    // Local ground is the tangent plane at the selected Earth location.
    drawSoftwarePolygon(ctx, width, height, view, [
      [-6.8, floorY, -6.4], [6.8, floorY, -6.4], [6.8, floorY, 6.4], [-6.8, floorY, 6.4],
    ], 'rgba(10,43,38,0.38)', 'rgba(45,212,191,0.18)');
    for (let grid = -6; grid <= 6; grid += 1) {
      drawSoftwareLine(ctx, width, height, view, [grid, floorY + 0.005, -6], [grid, floorY + 0.005, 6], 'rgba(45,212,191,0.08)');
      drawSoftwareLine(ctx, width, height, view, [-6, floorY + 0.005, grid], [6, floorY + 0.005, grid], 'rgba(45,212,191,0.08)');
    }

    // Prefer cached open footprints around the selected anchor. When those are
    // absent, archetype blocks remain visible but are explicitly labelled as
    // estimates rather than surveyed buildings.
    const contextBlocks: Array<{ center: SoftwarePoint3; size: SoftwarePoint3; evidence: 'cached' | 'archetype' }> = [];
    if (siteContext?.neighbours.length) {
      siteContext.neighbours.slice(0, 40).forEach(building => {
        const minLocalX = Math.min(...building.polygon.map(point => point.x));
        const maxLocalX = Math.max(...building.polygon.map(point => point.x));
        const minLocalY = Math.min(...building.polygon.map(point => point.y));
        const maxLocalY = Math.max(...building.polygon.map(point => point.y));
        const blockHeight = Math.min(18, Math.max(2.7, building.heightM) * planScale);
        contextBlocks.push({
          center: [(minLocalX + maxLocalX) / 2 * planScale, floorY + blockHeight / 2, (minLocalY + maxLocalY) / 2 * planScale],
          size: [Math.max(0.4, (maxLocalX - minLocalX) * planScale), blockHeight, Math.max(0.4, (maxLocalY - minLocalY) * planScale)],
          evidence: 'cached',
        });
      });
    } else if (winner?.configuration.archetype === 'terrace_mid') {
      contextBlocks.push(
        { center: [-5.1, floorY + houseHeightM * planScale / 2, 0], size: [3.8, houseHeightM * planScale, 5.2], evidence: 'archetype' },
        { center: [5.1, floorY + houseHeightM * planScale / 2, 0], size: [3.8, houseHeightM * planScale, 5.2], evidence: 'archetype' },
      );
    } else if (winner?.configuration.archetype.includes('apartment')) {
      const neighbourHeight = (winner.configuration.archetype === 'tower_apartment_mid' ? 10 : 4) * houseHeightM * planScale;
      contextBlocks.push(
        { center: [-7.4, floorY + neighbourHeight / 2, 1.8], size: [3.4, neighbourHeight, 4.5], evidence: 'archetype' },
        { center: [7.2, floorY + neighbourHeight * 0.38, -2.2], size: [3.8, neighbourHeight * 0.76, 5], evidence: 'archetype' },
      );
    }

    const sunUp = sun.altitudeRad > 0.035;
    const shadowLengthM = sunUp ? Math.min(80, displayHouseHeightM / Math.tan(sun.altitudeRad)) : 0;
    if (sunUp) footprint.forEach(polygon => {
      const displaced = polygon.map(point => ({
        x: point.x - Math.sin(sun.azimuthRad) * shadowLengthM,
        y: point.y - Math.cos(sun.azimuthRad) * shadowLengthM,
      }));
      drawSoftwarePolygon(ctx, width, height, view, displaced.map(point => toWorld(point.x, point.y, 0.015)), 'rgba(3,7,18,0.58)', 'rgba(96,165,250,0.18)');
    });

    contextBlocks.forEach(block => {
      drawSoftwareBox(ctx, width, height, view, block.center, block.size,
        block.evidence === 'cached' ? 'rgba(52,211,153,0.42)' : 'rgba(148,163,184,0.30)',
        block.evidence === 'cached' ? 'rgba(6,78,59,0.14)' : 'rgba(30,41,59,0.13)');
      if (sunUp) {
        const shadowWorldLength = Math.min(13, block.size[1] / Math.tan(sun.altitudeRad));
        const dx = -Math.sin(sun.azimuthRad) * shadowWorldLength;
        const dz = -Math.cos(sun.azimuthRad) * shadowWorldLength;
        drawSoftwarePolygon(ctx, width, height, view, [
          [block.center[0] - block.size[0] / 2, floorY + 0.01, block.center[2] - block.size[2] / 2],
          [block.center[0] + block.size[0] / 2, floorY + 0.01, block.center[2] - block.size[2] / 2],
          [block.center[0] + block.size[0] / 2 + dx, floorY + 0.01, block.center[2] - block.size[2] / 2 + dz],
          [block.center[0] - block.size[0] / 2 + dx, floorY + 0.01, block.center[2] - block.size[2] / 2 + dz],
        ], 'rgba(3,7,18,0.42)', 'rgba(99,102,241,0.12)');
      }
    });

    footprint.forEach(polygon => {
      const base = polygon.map(point => toWorld(point.x, point.y, 0));
      const roof = polygon.map(point => toWorld(point.x, point.y, displayHouseHeightM));
      drawSoftwarePolygon(ctx, width, height, view, base, 'rgba(6,182,212,0.09)', 'rgba(34,211,238,0.5)');
      drawSoftwarePolygon(ctx, width, height, view, roof, 'rgba(34,211,238,0.10)', 'rgba(103,232,249,0.82)');
      polygon.forEach((_, index) => {
        const next = (index + 1) % polygon.length;
        drawSoftwarePolygon(ctx, width, height, view, [base[index], base[next], roof[next], roof[index]], 'rgba(8,47,73,0.10)', 'rgba(34,211,238,0.34)');
      });
      if (floorCount > 1) for (let floor = 1; floor < floorCount; floor += 1) {
        const elevation = houseHeightM * floor;
        drawSoftwarePolygon(ctx, width, height, view, polygon.map(point => toWorld(point.x, point.y, elevation)), 'rgba(0,0,0,0)', 'rgba(192,132,252,0.28)');
      }
    });

    // Winning pressure-network paths are animated through the same room
    // geometry. Only inferred shared boundaries are shown as connections.
    if (winner && rooms.length) {
      const roomMap = new Map(rooms.map(room => [room.id, room]));
      winner.flows.filter(flow => flow.kind === 'shared-cavity' && flow.flowLs > 0.05).forEach((flow, index) => {
        const from = roomMap.get(flow.fromRoomId);
        const to = flow.toRoomId === 'outdoor' ? null : roomMap.get(flow.toRoomId);
        if (!from || !to) return;
        const start = toWorld(from.x + from.width / 2, from.y + from.height / 2, from.ceilingHeight * 0.56);
        const end = toWorld(to.x + to.width / 2, to.y + to.height / 2, to.ceilingHeight * 0.56);
        drawSoftwareArrow(ctx, width, height, view, start, end, 'rgba(192,132,252,0.76)', 1.4);
        const progress = (time * 0.00022 + index * 0.17) % 1;
        const point: SoftwarePoint3 = [
          start[0] + (end[0] - start[0]) * progress,
          start[1] + (end[1] - start[1]) * progress + Math.sin(progress * Math.PI) * 0.18,
          start[2] + (end[2] - start[2]) * progress,
        ];
        const projected = projectSoftwarePoint(point, width, height, view);
        ctx.beginPath(); ctx.arc(projected.x, projected.y, 2.4, 0, Math.PI * 2);
        ctx.fillStyle = '#d8b4fe'; ctx.fill();
      });
    }

    const sunRadius = 6.3;
    const sunPosition: SoftwarePoint3 = [
      Math.sin(sun.azimuthRad) * Math.cos(sun.altitudeRad) * sunRadius,
      floorY + Math.max(0.1, Math.sin(sun.altitudeRad) * sunRadius),
      Math.cos(sun.azimuthRad) * Math.cos(sun.altitudeRad) * sunRadius,
    ];
    if (sunUp) {
      const sunProjected = projectSoftwarePoint(sunPosition, width, height, view);
      const glow = ctx.createRadialGradient(sunProjected.x, sunProjected.y, 2, sunProjected.x, sunProjected.y, 24);
      glow.addColorStop(0, 'rgba(254,240,138,1)'); glow.addColorStop(0.28, 'rgba(250,204,21,0.8)'); glow.addColorStop(1, 'rgba(250,204,21,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(sunProjected.x, sunProjected.y, 24, 0, Math.PI * 2); ctx.fill();
      drawSoftwareArrow(ctx, width, height, view, sunPosition, [0, floorY + 0.2, 0], 'rgba(253,224,71,0.56)', 1.2);
      drawLabel(`SUN ${altitudeDeg.toFixed(0)}°`, sunPosition, '#fef08a');
    }

    drawLabel(`${archetype.label.toUpperCase()} · ${archetype.sharedConditionedBoundaryPercent}% SHARED`, [0, floorY + displayHouseHeightM * planScale + 0.4, 0], '#67e8f9');

    // A small orbital inset connects the annual Earth position to the local
    // tangent-plane solar vector used for the shadow above.
    const orbitCenter = { x: width - 74, y: 70 };
    ctx.save();
    ctx.strokeStyle = 'rgba(125,211,252,0.28)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(orbitCenter.x, orbitCenter.y, 47, 25, -0.2, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(orbitCenter.x, orbitCenter.y, 8, 0, Math.PI * 2); ctx.fill();
    const orbitAngle = dayOfYear / 365 * Math.PI * 2 - Math.PI / 2;
    const earthX = orbitCenter.x + Math.cos(orbitAngle) * 47;
    const earthY = orbitCenter.y + Math.sin(orbitAngle) * 25;
    ctx.fillStyle = '#0ea5e9'; ctx.beginPath(); ctx.arc(earthX, earthY, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#22c55e'; ctx.beginPath(); ctx.arc(earthX + 2, earthY - 1, 2.5, 0, Math.PI * 2); ctx.fill();
    const siteLatitudeY = earthY - Math.sin(location.latitudeDeg * Math.PI / 180) * 5;
    ctx.fillStyle = '#f8fafc'; ctx.beginPath(); ctx.arc(earthX, siteLatitudeY, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.font = '700 7px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.fillStyle = '#bae6fd';
    ctx.fillText('EARTH ORBIT → LOCAL SUN', orbitCenter.x, 108);
    ctx.restore();
  }, [archetype, dayOfYear, footprint, location.latitudeDeg, rooms, siteContext, siteOptimization, sun, winner]);

  return <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="text-xs font-black text-cyan-300 uppercase tracking-widest">Earth → local sun → building system</h3>
        <p className="text-[9px] text-gray-500 mt-1 max-w-2xl">The annual orbit sets solar declination; latitude and local solar hour set the ray used to cast the building and apartment-block shadows. Airflow uses the automatically selected whole-house pressure network.</p>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => setPlaying(value => !value)} className="px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-[8px] font-bold text-cyan-200 uppercase">{playing ? 'Pause year' : 'Play year'}</button>
        <span className="px-3 py-1.5 rounded-lg bg-black/50 border border-white/10 text-[8px] font-mono text-gray-300">{monthLabels[monthIndex]} · {String(solarHour).padStart(2, '0')}:00</span>
      </div>
    </div>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
      <div className="p-3 rounded-xl bg-cyan-500/5 border border-cyan-500/20"><div className="text-[7px] text-gray-500 uppercase">Auto sweep</div><div className="text-lg font-black text-cyan-300">{wholeHouse?.candidatesEvaluated || '…'}</div><div className="text-[7px] text-gray-600">whole-system configs</div></div>
      <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20"><div className="text-[7px] text-gray-500 uppercase">Annual energy</div><div className="text-lg font-black text-emerald-300">{winner ? `${winner.annual.totalOperationalKWh.toFixed(0)}` : '…'}<span className="text-[8px] ml-1">kWh</span></div><div className="text-[7px] text-gray-600">screened HVAC + fans</div></div>
      <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/20"><div className="text-[7px] text-gray-500 uppercase">Shared envelope</div><div className="text-lg font-black text-purple-300">{archetype.sharedConditionedBoundaryPercent}%</div><div className="text-[7px] text-gray-600">conditioned boundaries</div></div>
      <div className="p-3 rounded-xl bg-yellow-500/5 border border-yellow-500/20"><div className="text-[7px] text-gray-500 uppercase">Local sun now</div><div className="text-lg font-black text-yellow-200">{altitudeDeg > 0 ? `${altitudeDeg.toFixed(0)}°` : 'night'}</div><div className="text-[7px] text-gray-600">azimuth {azimuthDeg.toFixed(0)}°</div></div>
    </div>
    <div className="relative h-[520px] md:h-[610px] rounded-xl overflow-hidden border border-cyan-500/25 bg-[#020407]">
      <SoftwareCanvas3D draw={draw} label="Interactive annual Earth, sun, building shadow, apartment context and whole-house airflow simulation" />
      <div className="absolute left-3 top-3 pointer-events-none rounded-lg bg-black/80 border border-white/10 px-3 py-2 text-[8px] font-mono space-y-1">
        <div className="text-white font-bold">{location.name.toUpperCase()}</div>
        <div className="text-cyan-300">LAT {location.latitudeDeg.toFixed(2)}° · LON {location.longitudeDeg.toFixed(2)}°</div>
        <div className="text-purple-300">{archetype.label.toUpperCase()}</div>
        <div className="text-emerald-300">{siteContext?.neighbours.length ? `${siteContext.neighbours.length} CACHED NEIGHBOUR MASSES` : `ARCHETYPE SHADE ESTIMATE ${archetype.summerNeighbourShadePercent}%`}</div>
        <div className="text-amber-200">WINTER SOLAR ACCESS {(winningComparison?.winterSolarAccessPercent ?? archetype.winterSolarAccessPercent).toFixed(0)}%</div>
      </div>
      <div className="absolute bottom-3 left-3 pointer-events-none text-[8px] text-gray-300 bg-black/75 border border-white/10 px-2 py-1 rounded">Drag to orbit · wheel/pinch to zoom · year and configurations run automatically</div>
      <div className="absolute bottom-3 right-3 pointer-events-none text-[8px] text-cyan-300 bg-black/75 border border-cyan-500/20 px-2 py-1 rounded">Software 3D · WebGL-free</div>
    </div>
    {wholeHouse && <div>
      <div className="text-[8px] text-gray-500 uppercase tracking-widest mb-2">Top three lifecycle designs</div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
      {topArchetypes.map((comparison, index) => <div key={comparison.archetype} className={`p-3 rounded-xl border ${comparison.archetype === winner?.configuration.archetype ? 'bg-emerald-500/10 border-emerald-500/35' : 'bg-black/30 border-white/10'}`}>
        <div className="flex justify-between gap-2"><span className="text-[9px] font-black text-white uppercase">#{index + 1} {comparison.label}</span>{comparison.archetype === winner?.configuration.archetype && <span className="text-[7px] text-emerald-300 uppercase">winner</span>}</div>
        <div className="mt-2 text-lg font-black text-cyan-300">{comparison.annualOperationalKWh.toFixed(0)} <span className="text-[7px] text-gray-500">kWh/y</span></div>
        <div className={`text-[8px] ${comparison.annualEnergyVsDetachedPercent >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{comparison.archetype === 'detached' ? 'reference' : `${comparison.annualEnergyVsDetachedPercent >= 0 ? '−' : '+'}${Math.abs(comparison.annualEnergyVsDetachedPercent).toFixed(1)}% vs detached`}</div>
        <div className="text-[7px] text-gray-500 mt-2 leading-relaxed">{comparison.sharedConditionedBoundaryPercent}% shared · {comparison.summerNeighbourShadePercent}% summer shade · {comparison.winterSolarAccessPercent}% winter sun</div>
      </div>)}
      </div>
    </div>}
    {wholeHouse && <details className="rounded-xl border border-white/10 bg-black/25 p-3">
      <summary className="cursor-pointer text-[9px] font-bold text-gray-300 uppercase tracking-widest">Winning configuration, balance and model limits</summary>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3 text-[8px] text-gray-400">
        <div className="p-3 rounded-lg bg-white/[0.03]"><div className="text-cyan-300 font-bold mb-2">AUTOMATIC WINNER</div><div>{winner?.configuration.control.replaceAll('_', ' ')}</div><div>{winner?.configuration.mainDuctDiameterMm} mm main duct · {winner?.configuration.transferOpeningAreaCm2} cm² transfers</div><div>{Math.round((winner?.configuration.heatRecoveryEfficiency || 0) * 100)}% heat recovery · {winner?.configuration.fanStaticPressurePa} Pa</div></div>
        <div className="p-3 rounded-lg bg-white/[0.03]"><div className="text-emerald-300 font-bold mb-2">LIFECYCLE GATE</div><div>{wholeHouse.improvement.lifecycleEnergySavedPercent.toFixed(1)}% saved vs detached baseline</div><div>{wholeHouse.improvement.manufacturingEnergyDifferenceKWh >= 0 ? '+' : ''}{wholeHouse.improvement.manufacturingEnergyDifferenceKWh.toFixed(0)} kWh manufacture difference</div><div>{winner?.performance.meanComfortDeviationC.toFixed(2)}°C mean deviation · {winner?.performance.estimatedNoiseDbA.toFixed(1)} dBA</div></div>
        <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/15"><div className="text-amber-200 font-bold mb-2">EVIDENCE + LIMITS</div><div>{physicsValidation ? `${physicsValidation.passed}/${physicsValidation.cases.length} numerical invariants pass; this is not ASHRAE 140 certification.` : 'Numerical validation is loading.'}</div><div className="mt-1">{siteContext ? `${siteContext.completenessPercent}% site completeness · ${siteContext.uncertainty.band} uncertainty · ${siteContext.source.replaceAll('_', ' ')}.` : 'Site evidence is loading.'}</div><div className="mt-1">{siteContext?.neighbours.length ? 'Green context masses come from cached open footprints; unknown heights remain assumed.' : 'Grey apartment shadows are archetype estimates until open or surveyed massing is cached.'}</div></div>
      </div>
    </details>}
  </div>;
}

export function HeightAirflowCutaway3D({ room, profile }: { room: Room3D | null; profile: HeightAirflowProfile | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [webGlError, setWebGlError] = useState(false);
  const sceneKey = room && profile ? [
    room.id,
    room.width.toFixed(2),
    room.height.toFixed(2),
    profile.ceilingHeightM.toFixed(2),
    profile.intakeHeightM.toFixed(2),
    profile.exhaustHeightM.toFixed(2),
    profile.effectiveFlowM3s.toFixed(3),
    profile.stratificationC.toFixed(1),
    profile.reverseStackRisk ? 'reverse' : 'forward',
  ].join(':') : 'empty';

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !room || !profile || webGlError) return;
    for (const child of Array.from(container.children)) if (child instanceof HTMLCanvasElement) child.remove();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x03070a);
    const camera = new THREE.PerspectiveCamera(48, Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight), 0.05, 100);
    camera.position.set(5.5, 4.4, 6.2);
    const rendererOptions = { antialias: true };
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer(rendererOptions);
    } catch {
      setWebGlError(true);
      return;
    }
    setWebGlError(false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.domElement.setAttribute('aria-label', 'Interactive 3D height-aware room airflow cutaway');
    container.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 3.5;
    controls.maxDistance = 13;
    addGridAndLights(scene);

    const width = Math.min(4.8, Math.max(2.8, room.width * 0.72));
    const depth = Math.min(4.3, Math.max(2.4, room.height * 0.66));
    const height = Math.min(4.2, Math.max(2.4, profile.ceilingHeightM));
    const heightScale = height / profile.ceilingHeightM;
    camera.lookAt(0, height * 0.15, 0);
    controls.target.set(0, height * 0.15, 0);

    const shell = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(width, height, depth)),
      new THREE.LineBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.7 }),
    );
    shell.position.y = -1.45 + height / 2;
    scene.add(shell);

    profile.layers.forEach(layer => {
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(width * 0.94, depth * 0.94),
        new THREE.MeshBasicMaterial({ color: heatColor(layer.temperatureC), transparent: true, opacity: 0.075, side: THREE.DoubleSide, depthWrite: false }),
      );
      plane.rotation.x = -Math.PI / 2;
      plane.position.y = -1.45 + layer.zCenterM * heightScale;
      scene.add(plane);
    });

    const intakeY = -1.45 + profile.intakeHeightM * heightScale;
    const exhaustY = -1.45 + profile.exhaustHeightM * heightScale;
    const makeVent = (color: number, x: number, y: number) => {
      const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 24), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35 }));
      vent.rotation.z = Math.PI / 2;
      vent.position.set(x, y, 0);
      scene.add(vent);
    };
    makeVent(0x3b82f6, -width / 2, intakeY);
    makeVent(0xef4444, width / 2, exhaustY);

    const flowDirection = profile.reverseStackRisk ? -1 : 1;
    const particles: Array<{ mesh: THREE.Mesh; offset: number }> = [];
    for (let index = 0; index < 72; index += 1) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.035, 7, 7),
        new THREE.MeshBasicMaterial({ color: heatColor(profile.layers[index % profile.layers.length]?.temperatureC ?? 22) }),
      );
      scene.add(mesh);
      particles.push({ mesh, offset: index / 72 });
    }
    const verticalArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, flowDirection, 0),
      new THREE.Vector3(0, flowDirection > 0 ? intakeY : exhaustY, 0),
      Math.max(0.5, Math.abs(exhaustY - intakeY)),
      profile.reverseStackRisk ? 0xf97316 : 0x22d3ee,
      0.22,
      0.13,
    );
    scene.add(verticalArrow);

    const observer = new ResizeObserver(() => {
      if (!container.clientWidth || !container.clientHeight) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    });
    observer.observe(container);
    let animation = 0;
    const animate = (now: number) => {
      const speed = Math.max(0.06, Math.min(0.4, profile.effectiveFlowM3s * 3));
      particles.forEach(particle => {
        let t = (now * 0.001 * speed + particle.offset) % 1;
        if (flowDirection < 0) t = 1 - t;
        const smooth = t * t * (3 - 2 * t);
        particle.mesh.position.set(
          THREE.MathUtils.lerp(-width / 2 + 0.12, width / 2 - 0.12, t),
          THREE.MathUtils.lerp(intakeY, exhaustY, smooth) + Math.sin(Math.PI * t) * height * 0.12,
          Math.sin((t + particle.offset) * Math.PI * 4) * depth * 0.22,
        );
      });
      controls.update();
      renderer.render(scene, camera);
      animation = requestAnimationFrame(animate);
    };
    animation = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(animation);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      disposeScene(scene);
      if (renderer.domElement.parentElement === container) container.removeChild(renderer.domElement);
    };
  }, [sceneKey, webGlError]);

  if (!room || !profile) return <div className="h-[360px] rounded-xl border border-white/10 bg-black/40 grid place-items-center text-[10px] text-gray-600">Waiting for vertical airflow layers…</div>;
  return <div className="relative h-[400px] md:h-[470px] rounded-xl overflow-hidden border border-cyan-500/20 bg-[#03070a]">
    {webGlError
      ? <div className="absolute inset-0"><SoftwareAirflowFallback room={room} profile={profile} /></div>
      : <div ref={containerRef} className="absolute inset-0" />}
    <div className="absolute left-3 top-3 pointer-events-none rounded-lg bg-black/75 border border-white/10 px-3 py-2 text-[8px] font-mono space-y-1">
      <div className="text-white font-bold">{room.name.toUpperCase()} · {profile.ceilingHeightM.toFixed(2)} m HIGH</div>
      <div className="text-blue-300">INTAKE {profile.intakeHeightM.toFixed(2)} m</div>
      <div className="text-red-300">EXHAUST {profile.exhaustHeightM.toFixed(2)} m</div>
      <div className="text-cyan-300">SEPARATION {profile.heightSeparationM.toFixed(2)} m</div>
    </div>
    <div className="absolute right-3 top-3 pointer-events-none rounded-lg bg-black/75 border border-white/10 px-3 py-2 text-right text-[8px] font-mono space-y-1">
      <div className="text-purple-300">STACK ΔP {profile.stackPressurePa.toFixed(3)} Pa</div>
      <div className="text-emerald-300">FLOW {(profile.effectiveFlowM3s * 1000).toFixed(1)} L/s · {profile.airChangesPerHour.toFixed(2)} ACH</div>
      <div className="text-orange-300">TOP–BOTTOM ΔT {profile.stratificationC.toFixed(2)}°C</div>
      <div className={profile.shortCircuitRisk || profile.reverseStackRisk ? 'text-red-300' : 'text-emerald-300'}>{profile.reverseStackRisk ? 'REVERSE STACK RISK' : profile.shortCircuitRisk ? 'SHORT-CIRCUIT RISK' : 'HEIGHT PATH EFFECTIVE'}</div>
    </div>
    <div className="absolute bottom-3 left-3 pointer-events-none text-[8px] text-gray-500 bg-black/60 px-2 py-1 rounded">Drag to orbit · wheel/pinch to zoom · translucent planes are vertical temperature layers</div>
    {webGlError && <div className="absolute bottom-3 right-3 pointer-events-none text-[8px] text-cyan-300 bg-black/70 border border-cyan-500/20 px-2 py-1 rounded">Software 3D · WebGL-free</div>}
  </div>;
}
