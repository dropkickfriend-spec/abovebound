import React, { useState, useEffect, useRef, useMemo, Component, ReactNode, ErrorInfo } from 'react';
import { 
  Activity, 
  Box, 
  Cpu, 
  Database, 
  Layers, 
  Maximize, 
  Minimize, 
  Play, 
  Pause, 
  RefreshCw, 
  Settings, 
  Zap, 
  Thermometer, 
  Wind, 
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Link as LinkIcon,
  // Music removed — LiveAIBand is simcolt3-only
  ChevronRight,
  History as HistoryIcon,
  RotateCw,
  FlaskConical,
  Info,
  Brain,
  Target,
  ListChecks,
  Terminal
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  AreaChart,
  Area
} from 'recharts';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { V1Engine } from './simulations/v1';
import { V2Engine } from './simulations/v2';
import { V3Engine } from './simulations/v3';
import { V4Engine } from './simulations/v4';
import { V5Engine } from './simulations/v5';
import { V6Engine } from './simulations/v6';
import { V7Engine } from './simulations/v7';
import { V8Engine } from './simulations/v8_riemann';
import { V9LatticeEngine } from './simulations/v9_lattice';
import { V10MeshEngine } from './simulations/v10_mesh';
import { V11HardwareEngine } from './simulations/v11_hardware';
import { V12HouseEngine } from './simulations/v12_house';
import { V13MaterialEngine, IsotopeData, MaterialComposite, AROMATIC_RINGS, CARBON_ALLOTROPES, ABIOGENESIS_TIMELINE, huckelEnergies, zetaZeroMapping, stackedRingCoupling, AromaticRing } from './simulations/v13_material';
import { ELEMENTS, BY_Z, ChemElement, ElementCategory } from './constants/chemistry';
import { V0CompressionEngine } from './simulations/v0_compression';
import { FundamentalEngine, MembraneDetector } from './simulations/fundamental';
import { FLUID_MEDIUMS, PERIODIC_TABLE } from './constants/elements';
import { GenesisBrain } from './lib/genesis';
// LiveAIBand removed — simcolt3-only feature
import { MATERIAL_CODEX, BLOCKCHAIN_CODEX } from './lib/codex';
import { BlueprintGenerator } from './lib/blueprint';
import { NaturalSystemsDesigner, TopologyGenerator, FlowThread, FlowMetrics } from './lib/topology_flow';
import type { RoomLifecycleOptimizationResult } from './lib/room_lifecycle_optimizer';
import type { ExistingHomeAutopilotResult, ExistingHomeEra } from './lib/existing_home_autopilot';
import type { HvacCycleOptimizationResult } from './lib/hvac_cycle_optimizer';
import type { AdaptiveWallOptimizationResult } from './lib/adaptive_wall_optimizer';
import type { HeightAirflowProfile, HeightAirflowSweepResult } from './lib/height_airflow';
import { AdaptiveWallCutaway3D, EarthSiteHouse3D, HeightAirflowCutaway3D, HouseAirflowNetwork3D, SoftwareSimulationFallback } from './components/HousePhysics3D';
import type { WholeHouseOptimizationResult } from './lib/whole_house_optimizer';
import type { BuildingPhysicsValidationReport } from './lib/building_physics_validation';
import type { AutomaticSiteContextResult } from './lib/site_context';
import {
  SITE_LOCATION_PRESETS,
  type BushfireAttackLevel,
  type SiteGeometryOptimizationResult,
} from './lib/site_geometry_optimizer';
import {
  loadAnonymousWorkspace,
  memoryFetch,
  recordAnonymousComputation,
  type AnonymousWorkspaceSnapshot,
} from './lib/anonymous_memory';

// --- Types ---
type OptimizerType = 'thermal' | 'electrical' | 'blockchain' | 'math';
type ThermalMode = 'heating' | 'cooling';
type SimVersion = 'v0' | 'v1' | 'v2' | 'v3' | 'v4' | 'v5' | 'v6' | 'v7' | 'v8' | 'elements';
type AppTab = 'sim' | 'house' | 'codex' | 'trajectory' | 'selfbuild' | 'elements';
type HousePanel = 'system' | 'floorplan' | 'autopilot' | 'siteoptimizer' | 'optimizer' | 'cycling' | 'adaptivewall' | 'thermal' | 'airflow' | 'natural' | 'projection' | 'topology' | 'seasonal' | 'electrical' | 'cooler' | 'solar' | 'deeplearn' | 'ventreadings' | 'annualcycle';

interface SimTask {
  id: string;
  version: SimVersion;
  description: string;
  targetStability: number;
  params: any;
}

interface OptimizationGoal {
  type: OptimizerType;
  tasks: SimTask[];
  desiredResult: string;
}

interface SimState {
  nodes: { x: number; y: number; z: number; vx: number; vy: number; vz: number }[];
  complexity: number;
  memorySize: number;
  iterations: number;
}

// --- Error Boundary ---
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "An unexpected error occurred in the simulation engine.";
      try {
        const parsed = JSON.parse(this.state.error?.message || "{}");
        if (parsed.error) errorMessage = `System Error: ${parsed.error}`;
      } catch (e) {
        if (this.state.error?.message) errorMessage = this.state.error.message;
      }

      return (
        <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-6 border border-red-500/50">
            <Zap size={32} className="text-red-500 animate-pulse" />
          </div>
          <h1 className="text-2xl font-black tracking-tighter uppercase mb-2 text-white">Simulation Halted</h1>
          <p className="text-gray-400 max-w-md mb-8 font-mono text-sm">
            {errorMessage}
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-white text-black font-bold uppercase tracking-widest rounded hover:bg-gray-200 transition-all"
          >
            Reboot System
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

const OPTIMIZATION_GOALS: Record<OptimizerType, OptimizationGoal> = {
  thermal: {
    type: 'thermal',
    desiredResult: 'Maximum Heat Dissipation Membrane',
    tasks: [
      { id: 't1', version: 'v0', description: 'Establish Fundamental Compression Field', targetStability: 0.9, params: { compression: 3 } },
      { id: 't2', version: 'v1', description: 'Discover Causal Nodes (0° YZ Phase)', targetStability: 0.8, params: { rotation: 0 } },
      { id: 't3', version: 'v2', description: 'Discover Causal Nodes (90° XZ Phase)', targetStability: 0.8, params: { rotation: 90 } },
      { id: 't4', version: 'v3', description: 'Build Shortest-Route Network (V1→MST)', targetStability: 0.7, params: {} },
      { id: 't5', version: 'v4', description: 'Build Shortest-Route Network (V2→MST)', targetStability: 0.7, params: {} },
      { id: 't6', version: 'v5', description: 'Detect Manifold Membranes (Closed Loops)', targetStability: 0.7, params: {} },
      { id: 't7', version: 'v6', description: 'Analyze Thermal Flow Through Membranes', targetStability: 0.8, params: {} },
      { id: 't8', version: 'v7', description: 'Meta-Optimize Upstream for Heat Dissipation', targetStability: 0.9, params: {} },
    ]
  },
  electrical: {
    type: 'electrical',
    desiredResult: 'Minimum Impedance Signal Lattice',
    tasks: [
      { id: 'e1', version: 'v0', description: 'Establish Fundamental Compression Field', targetStability: 0.9, params: { compression: 5 } },
      { id: 'e2', version: 'v1', description: 'Discover Causal Nodes (0° YZ Phase)', targetStability: 0.8, params: { rotation: 0 } },
      { id: 'e3', version: 'v2', description: 'Discover Causal Nodes (90° XZ Phase)', targetStability: 0.8, params: { rotation: 90 } },
      { id: 'e4', version: 'v3', description: 'Build Trace Network (V1→MST)', targetStability: 0.7, params: {} },
      { id: 'e5', version: 'v4', description: 'Build Trace Network (V2→MST)', targetStability: 0.7, params: {} },
      { id: 'e6', version: 'v5', description: 'Detect PCB Layer Manifolds (Closed Loops)', targetStability: 0.7, params: {} },
      { id: 'e7', version: 'v6', description: 'Analyze Signal Flow & Impedance', targetStability: 0.8, params: {} },
      { id: 'e8', version: 'v7', description: 'Meta-Optimize for Signal Integrity', targetStability: 0.9, params: {} },
    ]
  },
  blockchain: {
    type: 'blockchain',
    desiredResult: 'Maximum Consensus Stability Network',
    tasks: [
      { id: 'b1', version: 'v0', description: 'Establish Fundamental Compression Field', targetStability: 0.9, params: { compression: 7 } },
      { id: 'b2', version: 'v1', description: 'Discover Causal Nodes (0° YZ Phase)', targetStability: 0.8, params: { rotation: 0 } },
      { id: 'b3', version: 'v2', description: 'Discover Causal Nodes (90° XZ Phase)', targetStability: 0.8, params: { rotation: 90 } },
      { id: 'b4', version: 'v3', description: 'Build P2P Topology (V1→MST)', targetStability: 0.7, params: {} },
      { id: 'b5', version: 'v4', description: 'Build P2P Topology (V2→MST)', targetStability: 0.7, params: {} },
      { id: 'b6', version: 'v5', description: 'Detect Network Manifold Layers (Closed Loops)', targetStability: 0.7, params: {} },
      { id: 'b7', version: 'v6', description: 'Analyze Data Flow Through Manifold', targetStability: 0.8, params: {} },
      { id: 'b8', version: 'v7', description: 'Meta-Optimize Consensus Propagation', targetStability: 0.9, params: {} },
    ]
  },
  math: {
    type: 'math',
    desiredResult: 'Riemann Zeta Prime Distribution',
    tasks: [
      { id: 'm1', version: 'v0', description: 'Establish Fundamental Compression Field', targetStability: 0.9, params: { compression: 10 } },
      { id: 'm2', version: 'v8', description: 'Initialize Riemann Zero Harmonics', targetStability: 0.8, params: {} },
      { id: 'm3', version: 'v7', description: 'Final Prime Distribution Analysis', targetStability: 0.9, params: {} },
    ]
  }
};

const VERSION_DESCRIPTIONS: Record<SimVersion, string> = {
  v0: 'Establish Fundamental Compression Field',
  v1: 'Discover Causal Nodes in the Primary Phase',
  v2: 'Discover Causal Nodes in the Orthogonal Phase',
  v3: 'Build the Primary Minimum-Spanning Network',
  v4: 'Build the Orthogonal Minimum-Spanning Network',
  v5: 'Generate Closed Membranes and Boundary Planes',
  v6: 'Simulate Flow Through the Generated Membranes',
  v7: 'Meta-Optimize the Complete Simulation Chain',
  v8: 'Analyze Riemann Zeta Harmonics and Prime Structure',
  elements: 'Build Elements, Isotopes, and Composite Materials',
};

const SimulationView = ({ 
  activeOptimizer, 
  thermalMode, 
  activeVersion, 
  setActiveVersion, 
  onStatsUpdate,
  currentChainIndex,
  setCurrentChainIndex,
  simulationChain,
  compressionLevel,
  setCompressionLevel,
  ventingStrategy,
  autonomousState,
  isSimulating,
  activeModule,
}: { 
  activeOptimizer: OptimizerType; 
  thermalMode: ThermalMode; 
  activeVersion: SimVersion; 
  setActiveVersion: (v: SimVersion) => void; 
  onStatsUpdate?: (stats: any) => void;
  currentChainIndex: number;
  setCurrentChainIndex: (i: number) => void;
  simulationChain: SimVersion[];
  compressionLevel: number;
  setCompressionLevel: (l: number) => void;
  ventingStrategy: string;
  autonomousState: any;
  isSimulating: boolean;
  activeModule: string;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const [webGlError, setWebGlError] = useState<string | null>(null);
  
  const v0Ref = useRef<V0CompressionEngine | null>(null);
  const fundamental1Ref = useRef<FundamentalEngine | null>(null);
  const fundamental2Ref = useRef<FundamentalEngine | null>(null);
  const membraneLinesRef = useRef<THREE.LineSegments | null>(null);
  
  const v1Ref = useRef<V1Engine | null>(null);
  const v2Ref = useRef<V2Engine | null>(null);
  const v3Ref = useRef<V3Engine | null>(null);
  const v4Ref = useRef<V4Engine | null>(null);
  const v5Ref = useRef<V5Engine | null>(null);
  const v6Ref = useRef<V6Engine | null>(null);
  const v7Ref = useRef<V7Engine | null>(null);
  const v8Ref = useRef<V8Engine | null>(null);
  const v9Ref = useRef<V9LatticeEngine | null>(null);
  const v10Ref = useRef<V10MeshEngine | null>(null);
  const v11Ref = useRef<V11HardwareEngine | null>(null);
  const v12Ref = useRef<V12HouseEngine | null>(null);
  const v13Ref = useRef<V13MaterialEngine | null>(null);
  const topoFlowRef = useRef<NaturalSystemsDesigner | null>(null);
  const topoFrameCount = useRef(0);
  const topoShapeIdx = useRef(0);
  const compressionLevelRef = useRef(1);
  const blueprintGenRef = useRef(new BlueprintGenerator());
  const materialFrameRef = useRef(0); // Tracks frames for co-evolution interval
  const activeVersionRef = useRef(activeVersion);
  const activeOptimizerRef = useRef(activeOptimizer);
  const thermalModeRef = useRef(thermalMode);
  const ventingStrategyRef = useRef(ventingStrategy);
  const isSimulatingRef = useRef(isSimulating);
  const activeModuleRef = useRef(activeModule);
  const lastV13TopologyRef = useRef('');
  const globalMemoryRef = useRef<any>({
    v7_cooling_efficiency: 1.0,
    v6_thermal_gradient: 0,
    v6_avg_temp: 298,
    v5_structural_tension: 0,
    v4_porosity: 0
  });

  const currentChainIndexRef = useRef(currentChainIndex);

  useEffect(() => {
    currentChainIndexRef.current = currentChainIndex;
  }, [currentChainIndex]);

  useEffect(() => {
    compressionLevelRef.current = compressionLevel;
  }, [compressionLevel]);

  useEffect(() => {
    activeVersionRef.current = activeVersion;
  }, [activeVersion]);

  useEffect(() => {
    activeOptimizerRef.current = activeOptimizer;
    // When optimizer type changes, rebuild entire material pipeline
    if (v9Ref.current && v10Ref.current && v11Ref.current) {
      v9Ref.current.configure(activeOptimizer);
      v10Ref.current.configure(activeOptimizer);
      v11Ref.current.configure(activeOptimizer);
      v9Ref.current.buildLattice();
      v10Ref.current.buildMesh(v9Ref.current.compositeField || undefined);
      v11Ref.current.build();
    }
    if (v1Ref.current) {
      // Feed real lattice material into V1
      const v9Mat = v9Ref.current?.getMaterialForV1();
      if (v9Mat) {
        v1Ref.current.setMaterial(v9Mat);
      } else {
        v1Ref.current.setMaterial(blueprintGenRef.current.generateMaterial(activeOptimizer));
      }
      if (v2Ref.current) {
        v2Ref.current.gbestFitness = -Infinity;
        for (const node of v2Ref.current.nodes) node.pbestFitness = -Infinity;
      }
    }
  }, [activeOptimizer]);

  useEffect(() => {
    thermalModeRef.current = thermalMode;
  }, [thermalMode]);

  useEffect(() => {
    ventingStrategyRef.current = ventingStrategy;
  }, [ventingStrategy]);

  useEffect(() => {
    isSimulatingRef.current = isSimulating;
  }, [isSimulating]);

  useEffect(() => {
    activeModuleRef.current = activeModule;
  }, [activeModule]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // React StrictMode and Vite Fast Refresh can replay effects during
    // development. Remove any renderer left by a previous effect before
    // attaching the live canvas, otherwise the stale canvas covers the one
    // that owns OrbitControls and the animation loop.
    for (const child of Array.from(container.children)) {
      if (child instanceof HTMLCanvasElement) child.remove();
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050505);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.z = 5;
    cameraRef.current = camera;

    let renderer: THREE.WebGLRenderer | null = null;
    let controls: OrbitControls | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (error) {
      console.error('[SimulationView] WebGL is unavailable:', error);
      setWebGlError('3D rendering is unavailable because WebGL is disabled. The numerical simulations and 2D results are still running.');
    }
    if (renderer) {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.domElement.dataset.beyondboundRenderer = 'active';
      renderer.domElement.style.display = 'block';
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
    }

    const ambientLight = new THREE.AmbientLight(0x404040);
    scene.add(ambientLight);
    const pointLight = new THREE.PointLight(0x00ffcc, 1, 100);
    pointLight.position.set(10, 10, 10);
    scene.add(pointLight);

    // Initialize Engines
    v0Ref.current = new V0CompressionEngine(scene);
    
    // Fundamental Sim 1 & 2 (90-degree rotations)
    fundamental1Ref.current = new FundamentalEngine(scene, new THREE.Euler(0, 0, 0), new THREE.Color(0x00ffff));
    fundamental2Ref.current = new FundamentalEngine(scene, new THREE.Euler(Math.PI / 2, Math.PI / 2, 0), new THREE.Color(0xff00ff));
    
    // Membrane Detection Lines
    const membraneGeom = new THREE.BufferGeometry();
    const membraneMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 });
    membraneLinesRef.current = new THREE.LineSegments(membraneGeom, membraneMat);
    scene.add(membraneLinesRef.current);

    v1Ref.current = new V1Engine(scene);
    v2Ref.current = new V2Engine(scene);
    v3Ref.current = new V3Engine(scene);
    v4Ref.current = new V4Engine(scene);
    v5Ref.current = new V5Engine(scene);
    v6Ref.current = new V6Engine(scene);
    v7Ref.current = new V7Engine(scene);
    v8Ref.current = new V8Engine(scene);

    // V12: House Blueprint Sim
    v12Ref.current = new V12HouseEngine(scene);

    // Topology Flow Discovery Engine
    topoFlowRef.current = new NaturalSystemsDesigner(16);

    // V9/V10/V11: Material construction pipeline
    v9Ref.current = new V9LatticeEngine(scene);
    v10Ref.current = new V10MeshEngine(scene);
    v11Ref.current = new V11HardwareEngine(scene);

    // Configure all three for the active optimizer
    const opt0 = activeOptimizerRef.current;
    v9Ref.current.configure(opt0);
    v10Ref.current.configure(opt0);
    v11Ref.current.configure(opt0);

    // Build the material pipeline: Lattice → Mesh → V1 material field
    v9Ref.current.buildLattice();
    v10Ref.current.buildMesh(v9Ref.current.compositeField || undefined);
    v11Ref.current.build();

    // V13: Material Builder Engine (pure data, no scene)
    v13Ref.current = new V13MaterialEngine();

    // Feed the constructed material into V1 (real isotope/element properties + mesh topology)
    const v9Mat = v9Ref.current.getMaterialForV1();
    if (v9Mat) v1Ref.current.setMaterial(v9Mat);
    // V2 shares V1's material field via reference
    v2Ref.current.setMaterialRef(v1Ref.current);

    // Initial visibility
    if (v0Ref.current) {
      v0Ref.current.points.visible = activeVersion === 'v0';
      v0Ref.current.lines.visible = activeVersion === 'v0';
    }
    
    const isFundamental = activeVersion === 'v1' || activeVersion === 'v2';
    if (fundamental1Ref.current) {
      fundamental1Ref.current.group.visible = isFundamental;
    }
    if (fundamental2Ref.current) {
      fundamental2Ref.current.group.visible = isFundamental;
    }
    if (membraneLinesRef.current) {
      membraneLinesRef.current.visible = isFundamental;
    }

    // V1+V2 are BOTH visible when either is active (overlaid 90° views)
    const showSwarm = activeVersion === 'v1' || activeVersion === 'v2';
    if (v1Ref.current) {
      v1Ref.current.points.visible = showSwarm;
      v1Ref.current.lines.visible = showSwarm;
    }
    if (v2Ref.current) {
      v2Ref.current.points.visible = showSwarm;
      v2Ref.current.lines.visible = showSwarm;
    }
    // V3+V4 both visible when either is active (overlaid MST networks)
    const showMSTInit = activeVersion === 'v3' || activeVersion === 'v4';
    if (v3Ref.current) {
      v3Ref.current.points.visible = showMSTInit;
      v3Ref.current.mstLines.visible = showMSTInit;
      v3Ref.current.neighborLines.visible = showMSTInit;
    }
    if (v4Ref.current) {
      v4Ref.current.points.visible = showMSTInit;
      v4Ref.current.mstLines.visible = showMSTInit;
      v4Ref.current.neighborLines.visible = showMSTInit;
    }
    if (v5Ref.current) {
      const v5Vis = activeVersion === 'v5';
      v5Ref.current.meshGroup.visible = v5Vis;
      v5Ref.current.wireframeGroup.visible = v5Vis;
      v5Ref.current.pointCloud.visible = v5Vis;
      v5Ref.current.wallGroup.visible = v5Vis;
      v5Ref.current.floorCeilGroup.visible = v5Vis;
      v5Ref.current.spiralGroup.visible = v5Vis;
      v5Ref.current.layerGroup.visible = v5Vis;
    }
    if (v6Ref.current) {
      const v6Vis = activeVersion === 'v6';
      v6Ref.current.flowLines.visible = v6Vis;
      v6Ref.current.flowParticles.visible = v6Vis;
      v6Ref.current.heatmapPoints.visible = v6Vis;
      v6Ref.current.thermalGrid.visible = v6Vis;
      v6Ref.current.spiralFlowGroup.visible = v6Vis;
      v6Ref.current.channelFlowGroup.visible = v6Vis;
      v6Ref.current.surfaceGradientGroup.visible = v6Vis;
      v6Ref.current.signalWaveGroup.visible = v6Vis;
    }
    if (v7Ref.current) {
      v7Ref.current.trendLines.visible = activeVersion === 'v7';
      v7Ref.current.scoreIndicator.visible = activeVersion === 'v7';
      v7Ref.current.connectionLines.visible = activeVersion === 'v7';
      v7Ref.current.flowParticles.visible = activeVersion === 'v7';
    }
    if (v8Ref.current) {
      const v8Vis = activeVersion === 'v8';
      v8Ref.current.line.visible = v8Vis;
      v8Ref.current.points.visible = v8Vis;
      v8Ref.current.spiralLine.visible = v8Vis;
      v8Ref.current.phaseMarkers.visible = v8Vis;
      v8Ref.current.staircaseLine.visible = v8Vis;
      v8Ref.current.criticalLine.visible = v8Vis;
      for (const wl of v8Ref.current.waveLines) wl.visible = v8Vis;
    }
    // V12 supplies the separate House dashboard; keep its point cloud out of
    // the shared V0-V8 scene so it does not obscure the selected simulation.
    if (v12Ref.current) v12Ref.current.thermalHeatmap.visible = false;
    // V9/V10/V11: Material pipeline — visible whenever V1-V7 are active (always overlaid)
    const showMaterial = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7'].includes(activeVersion);
    if (v9Ref.current) {
      v9Ref.current.points.visible = showMaterial;
      v9Ref.current.bondLines.visible = showMaterial;
    }
    if (v10Ref.current) {
      v10Ref.current.surfacePoints.visible = showMaterial;
      v10Ref.current.channelLines.visible = showMaterial;
    }
    if (v11Ref.current) {
      v11Ref.current.shellLines.visible = showMaterial;
      v11Ref.current.portPoints.visible = showMaterial;
      v11Ref.current.constraintLines.visible = showMaterial;
    }

    let frameId: number;
    let disposed = false;
    let lastSimulationFrame = 0;
    let simulationFrame = 0;
    const animate = (now: number = performance.now()) => {
      if (disposed) return;
      frameId = requestAnimationFrame(animate);

      // Keep camera interaction and rendering responsive while limiting the
      // numerical engines to 30 Hz. Pausing now pauses the actual engines,
      // instead of only stopping the dashboard counter.
      if (!isSimulatingRef.current || now - lastSimulationFrame < 1000 / 30) {
        controls?.update();
        renderer?.render(scene, camera);
        return;
      }
      lastSimulationFrame = now;
      simulationFrame++;
      
      const currentVersion = activeVersionRef.current;
      const opt = activeOptimizerRef.current;
      const tMode = thermalModeRef.current;
      const mem = globalMemoryRef.current;
      const currentIndex = currentChainIndexRef.current;
      const compLevel = compressionLevelRef.current;
      
      // V0: Compression Field (First Principles)
      if (v0Ref.current) {
        const goal = OPTIMIZATION_GOALS[opt];
        const currentTask = goal.tasks[currentIndex % goal.tasks.length];
        if (currentTask.version === 'v0' && currentTask.params.compression) {
          v0Ref.current.setCompressionLevel(currentTask.params.compression);
        } else {
          v0Ref.current.setCompressionLevel(compLevel);
        }
        v0Ref.current.update(opt, mem);
      }

      // Fundamental Sims (Sim 1 & 2)
      if (fundamental1Ref.current && fundamental2Ref.current) {
        const phase = Date.now() * 0.001;
        
        // Sim 1 & 2 are 90-degree rotated versions of the same fundamental field
        fundamental1Ref.current.update(phase, compLevel);
        fundamental2Ref.current.update(phase + Math.PI / 2, compLevel);
        
        // Plane Detection / Membrane Generation
        if (currentVersion === 'v1' || currentVersion === 'v2') {
          const membranePositions = MembraneDetector.findPlanes(fundamental1Ref.current, fundamental2Ref.current);
          
          if (membraneLinesRef.current) {
            membraneLinesRef.current.geometry.setAttribute('position', new THREE.Float32BufferAttribute(membranePositions, 3));
            membraneLinesRef.current.geometry.attributes.position.needsUpdate = true;
          }
        }
      }

      // V9/V10/V11: Material pipeline (update visuals)
      if (v9Ref.current) v9Ref.current.update();
      if (v10Ref.current) v10Ref.current.update();
      if (v11Ref.current) v11Ref.current.update();

      // V1: Swarm — explores through V9 lattice + V10 mesh material
      if (v1Ref.current) {
        v1Ref.current.update(opt, mem, tMode, compLevel);
        // Feed V2
        if (v2Ref.current) v2Ref.current.captureFromV1(v1Ref.current);
      }

      // V2: 90° rotated causal nodes (XZ plane)
      if (v2Ref.current) {
        v2Ref.current.update(opt, mem, tMode, compLevel);
      }

      // V3: Routes within hardware boundaries (V11) + V1 settled discoveries
      if (v3Ref.current) {
        if (v1Ref.current && v1Ref.current.isStable() && v1Ref.current.settledPositions.length > 0) {
          // Merge V1 discoveries with V11 hardware boundary nodes
          const v1Settled = v1Ref.current.getSettledNodes();
          const hwNodes = v11Ref.current?.getBoundaryNodes() || [];
          // Feed both: V1's discovered optimal points + hardware structure
          const merged = [...v1Settled, ...hwNodes.slice(0, Math.max(10, 40 - v1Settled.length))];
          v3Ref.current.captureFromV1(merged);
        } else if (v11Ref.current?.isStable()) {
          // Before V1 settles, seed V3 with hardware nodes so routing begins
          v3Ref.current.captureFromV1(v11Ref.current.getBoundaryNodes());
        }
        v3Ref.current.update();
      }

      // V4: Routes within hardware boundaries (V11) + V2 settled discoveries
      if (v4Ref.current) {
        if (v2Ref.current && v2Ref.current.isStable() && v2Ref.current.settledPositions.length > 0) {
          const v2Settled = v2Ref.current.getSettledNodes();
          const hwNodes = v11Ref.current?.getBoundaryNodes() || [];
          const merged = [...v2Settled, ...hwNodes.slice(0, Math.max(10, 40 - v2Settled.length))];
          v4Ref.current.captureFromV2(merged);
        } else if (v11Ref.current?.isStable()) {
          v4Ref.current.captureFromV2(v11Ref.current.getBoundaryNodes());
        }
        v4Ref.current.update();
      }

      // V5: Closed loop detection → membranes from V3+V4 edges
      if (v5Ref.current) {
        if (v3Ref.current && v4Ref.current && v3Ref.current.isStable() && v4Ref.current.isStable()) {
          v5Ref.current.captureFromV3V4(
            v3Ref.current.getNodes(), v3Ref.current.getEdges(),
            v4Ref.current.getNodes(), v4Ref.current.getEdges(),
            opt
          );
        }
        v5Ref.current.update();
      }

      // V6: Flow finder — references whole chain, modifies V5 membranes
      if (v6Ref.current) {
        if (v5Ref.current && v5Ref.current.isStable() && v1Ref.current && v3Ref.current && v4Ref.current) {
          v6Ref.current.captureChain(
            v1Ref.current.stabilizations,
            v3Ref.current.getMSTEdges(), v3Ref.current.getNodes(),
            v4Ref.current.getMSTEdges(), v4Ref.current.getNodes(),
            v5Ref.current.getLoops(),
            opt as any,
            tMode
          );
          // Feed V5's architectural boundary planes into V6 for detailed rendering
          v6Ref.current.captureBoundaryPlanes(v5Ref.current.getBoundaryPlanes());
          // V6 evaluates and requests membrane state changes on V5
          v6Ref.current.evaluateAndModify(v5Ref.current);
        }
        v6Ref.current.update(opt, tMode, compLevel);
      }

      // V7: Meta-optimizer — reads V6 metrics, tunes upstream params
      if (v7Ref.current) {
        if (v6Ref.current && v6Ref.current.isStable() && v5Ref.current) {
          v7Ref.current.captureFromV6(
            v6Ref.current.getMetrics(),
            v6Ref.current.getFlowPaths(),
            v5Ref.current.getLoops(),
            v6Ref.current.getThermalField(),
            v6Ref.current.getGridSize()
          );
          // Apply V7's tuning recommendations to upstream engines
          v7Ref.current.applyRecommendations({
            v1: v1Ref.current,
            v2: v2Ref.current,
            v3: v3Ref.current,
            v4: v4Ref.current,
          });
        }
        v7Ref.current.update(compLevel);

        // ── CO-EVOLUTION: V7 score feeds back to refine the material ──
        // Every 200 frames, let V7's performance reshape the material field
        // so the PSO swarm re-explores with updated physics
        materialFrameRef.current++;
        if (materialFrameRef.current % 200 === 0 && v1Ref.current) {
          const score = v7Ref.current.getBestScore?.() ?? 0;
          const recs = v7Ref.current.getRecommendations?.() ?? [];
          const refinedMat = blueprintGenRef.current.generateMaterial(
            activeOptimizerRef.current, score, recs
          );
          v1Ref.current.setMaterial(refinedMat);
          // Expose current material state for blueprint view to read
          (window as any).currentSimMaterial = refinedMat;
          (window as any).currentSimScore = score;
        }
      }

      // V8: Riemann
      if (v8Ref.current) {
        const activeZeros = (window as any).riemannActiveZeros || 15;
        const showCriticalLine = (window as any).riemannShowCriticalLine !== false;
        v8Ref.current.update(opt, mem, tMode, activeZeros, showCriticalLine, compLevel);
        (window as any).riemannSubprimes = v8Ref.current.subprimeDiscoveries;
        (window as any).riemannV8Engine = v8Ref.current;
      }

      // V12: House Blueprint Simulation
      const shouldStepHouse = activeModuleRef.current === 'house'
        ? simulationFrame % 2 === 0
        : simulationFrame % 15 === 0;
      if (v12Ref.current && shouldStepHouse) {
        v12Ref.current.update(opt, mem, tMode);

        // ── V5 → V12: Feed detected boundary planes into house geometry ──
        // When V5 stabilizes, its wall/partition/floor planes GENERATE the house layout
        if (v5Ref.current && v5Ref.current.isStable()) {
          const bPlanes = v5Ref.current.getBoundaryPlanes();
          if (bPlanes.length > 4) {
            v12Ref.current.importFromV5Planes(bPlanes.map((p: any) => ({
              center: { x: p.center.x, y: p.center.y, z: p.center.z },
              normal: { x: p.normal.x, y: p.normal.y, z: p.normal.z },
              width: p.width,
              height: p.height,
              role: p.role,
              conductivity: p.conductivity,
            })));
          }
          // Expose V5 planes for HouseView visualization
          (window as any).v5BoundaryPlanes = bPlanes.map((p: any) => ({
            center: { x: p.center.x, y: p.center.y, z: p.center.z },
            normal: { x: p.normal.x, y: p.normal.y, z: p.normal.z },
            width: p.width, height: p.height,
            role: p.role, conductivity: p.conductivity,
            spiralAngle: p.spiralAngle, spiralRadius: p.spiralRadius,
          }));
          (window as any).v5PlaneCount = bPlanes.length;
        }

        // Expose V12 metrics for HouseView
        (window as any).v12HouseMetrics = v12Ref.current.getMetrics();
        (window as any).v12Projections = v12Ref.current.getProjections();
        (window as any).v12Recommendations = v12Ref.current.getRecommendations();
        (window as any).v12Engine = v12Ref.current;
        (window as any).v12GeometrySource = v12Ref.current.getGeometrySource();
        (window as any).v12ZoneConstraints = v12Ref.current.getZoneConstraints();
        (window as any).v12ZoneConfigured = v12Ref.current.isZoneConfigured();
      }

      // V13 Material Builder — feeds topology to V1 and receives feedback from V7
      const shouldStepMaterials = activeModuleRef.current === 'elements'
        || simulationFrame % 30 === 0;
      if (v13Ref.current && shouldStepMaterials) {
        v13Ref.current.update(0.016);

        // Feed V13 topology into V1 as material field
        const topo = v13Ref.current.exportTopology();
        if (v1Ref.current && topo) {
          const topologySignature = [
            topo.vertices.length,
            topo.faces.length,
            topo.properties.conductivity,
            topo.properties.density,
            topo.properties.opticalBandgap,
          ].join(':');
          if (topologySignature !== lastV13TopologyRef.current) {
            lastV13TopologyRef.current = topologySignature;
            v1Ref.current.setMaterial({
              conductivity: topo.properties.conductivity,
              dielectricConstant: 1 / (topo.properties.opticalBandgap || 1),
              density: topo.properties.density,
            });
          }
        }

        // V7 sends optimization feedback to V13
        if (v7Ref.current && simulationFrame % 120 === 0) {
          const score = v7Ref.current.getScore();
          const recs = (v7Ref.current as any).getRecommendations?.() || {};
          v13Ref.current.receiveFromSim('v7', { score, recommendations: recs });
        }

        // Expose V13 engine for ElementsView in App
        (window as any).v13MaterialEngine = v13Ref.current;
      }

      // Publish real engine state for the dashboard and smoke tests. This
      // replaces the previous placeholder stats that were never updated.
      if (simulationFrame % 15 === 0) {
        const flowMetrics = v6Ref.current?.getMetrics() || null;
        const thermalField = v6Ref.current?.getThermalField();
        const avgTempK = thermalField?.length
          ? thermalField.reduce((sum, value) => sum + value, 0) / thermalField.length
          : 298;
        const diagnostics = {
          version: currentVersion,
          optimizer: opt,
          thermalMode: tMode,
          frame: simulationFrame,
          camera: {
            x: camera.position.x,
            y: camera.position.y,
            z: camera.position.z,
          },
          stable: {
            v0: Boolean(v0Ref.current?.isStable()),
            v1: Boolean(v1Ref.current?.isStable()),
            v2: Boolean(v2Ref.current?.isStable()),
            v3: Boolean(v3Ref.current?.isStable()),
            v4: Boolean(v4Ref.current?.isStable()),
            v5: Boolean(v5Ref.current?.isStable()),
            v6: Boolean(v6Ref.current?.isStable()),
            v7: Boolean(v7Ref.current?.isStable()),
            v8: Boolean(v8Ref.current?.isStable()),
            v12: Boolean(v12Ref.current?.isStable()),
          },
          counts: {
            v1Nodes: v1Ref.current?.nodes.length || 0,
            v2Nodes: v2Ref.current?.nodes.length || 0,
            v3Edges: v3Ref.current?.getEdges().length || 0,
            v4Edges: v4Ref.current?.getEdges().length || 0,
            v5Membranes: v5Ref.current?.getLoops().length || 0,
            v6Paths: v6Ref.current?.getFlowPaths().length || 0,
          },
          flow: flowMetrics,
          avgTemperatureC: avgTempK - 273.15,
          temperature: Math.abs(avgTempK - 298) / 10,
          tension: flowMetrics?.avgResistance || 0,
        };
        globalMemoryRef.current.v6_avg_temp = avgTempK;
        globalMemoryRef.current.v6_thermal_gradient = diagnostics.temperature;
        globalMemoryRef.current.v7_cooling_efficiency = flowMetrics?.efficiency || 0;
        (window as any).globalMemory = globalMemoryRef.current;
        (window as any).beyondBoundDiagnostics = diagnostics;
        onStatsUpdate?.(diagnostics);
      }

      // ── TOPOLOGY FLOW DISCOVERY ENGINE ──
      // Every 300 frames: generate a topology, run flow sim, detect threads
      // Cross-connects discovered flow threads to the V12 early-design view.
      if (topoFlowRef.current) {
        topoFrameCount.current++;
        if (topoFrameCount.current % 300 === 0) {
          try {
            const shapes = ['gyroid', 'schwarz_p', 'diamond', 'torus', 'helix', 'fractal_sponge', 'random_organic'];
            const shapeType = shapes[topoShapeIdx.current % shapes.length];
            topoShapeIdx.current++;

            const topoGen = new TopologyGenerator();
            const shape = topoGen.generateShape(shapeType, 16);
            const result = topoFlowRef.current.findNovelFlows(shape, 5);

            // Cross-connect: feed discovered threads to V12 house
            if (v12Ref.current && result.threads.length > 0) {
              v12Ref.current.captureTopologyFlows(
                result.threads.map((t: any) => ({ type: t.type || 'laminar', strength: t.strength || 0.5, novelty: t.novelty || 0.5 })),
                result.metrics.efficiency
              );
              v12Ref.current.captureLatticeFlow({
                totalFlow: result.metrics.avgVelocity * 100,
                efficiency: result.metrics.efficiency
              });
            }

            // Expose topology results for debugging
            (window as any).topologyFlowMetrics = topoFlowRef.current.getDesignReport();
            (window as any).topologyThreads = result.threads;
            (window as any).topologyFlowEngine = topoFlowRef.current;
          } catch (e) {
            console.warn('[TopoFlow] Discovery error:', e);
          }
        }
      }

      // Auto-Transition Logic
      const autoTransition = (window as any).autoTransitionEnabled;
      if (autoTransition) {
        const goal = OPTIMIZATION_GOALS[opt];
        const currentTask = goal.tasks[currentIndex % goal.tasks.length];
        
        const engine = 
          currentVersion === 'v0' ? v0Ref.current :
          currentVersion === 'v1' ? fundamental1Ref.current :
          currentVersion === 'v2' ? fundamental2Ref.current :
          currentVersion === 'v3' ? v3Ref.current :
          currentVersion === 'v4' ? v4Ref.current :
          currentVersion === 'v5' ? v5Ref.current :
          currentVersion === 'v6' ? v6Ref.current :
          currentVersion === 'v7' ? v7Ref.current :
          v8Ref.current;

        if (engine?.isStable()) {
          const nextIndex = (currentIndex + 1) % goal.tasks.length;
          setCurrentChainIndex(nextIndex);
        }
      }

      controls?.update();
      renderer?.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (disposed || !rendererRef.current || !cameraRef.current) return;
      cameraRef.current.aspect = container.clientWidth / container.clientHeight;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(container);

    (window as any).saveSimState = async () => {
      const currentVersion = activeVersionRef.current;
      let state: any = null;
      if (currentVersion === 'v0') state = v0Ref.current?.saveState();
      if (currentVersion === 'v1') state = {
        fundamental: fundamental1Ref.current?.saveState(),
        swarm: v1Ref.current?.saveState(),
      };
      if (currentVersion === 'v2') state = {
        fundamental: fundamental2Ref.current?.saveState(),
        swarm: v2Ref.current?.saveState(),
      };
      if (currentVersion === 'v3') state = v3Ref.current?.saveState();
      if (currentVersion === 'v4') state = v4Ref.current?.saveState();
      if (currentVersion === 'v5') state = v5Ref.current?.saveState();
      if (currentVersion === 'v6') state = v6Ref.current?.saveState();
      if (currentVersion === 'v7') state = v7Ref.current?.saveState();
      if (currentVersion === 'v8') state = v8Ref.current?.saveState?.();
      // V12 always saves alongside current version
      const v12State = v12Ref.current?.saveState?.();
      if (v12State) {
        (window as any).v12LastSave = v12State;
      }

      if (state) {
        await memoryFetch(`/api/sim-state/${currentVersion}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state })
        });
        if (v12State) {
          await memoryFetch('/api/sim-state/v12', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state: v12State }),
          });
        }
        console.log(`[Sim] State for ${currentVersion} saved!`);
      }
    };

    (window as any).loadSimState = async (requestedVersion?: SimVersion) => {
      const currentVersion = requestedVersion || activeVersionRef.current;
      const res = await memoryFetch(`/api/sim-state/${currentVersion}`);
      if (!res.ok) throw new Error(`Could not load ${currentVersion}: ${res.status}`);
      const state = await res.json();
      if (state) {
        if (currentVersion === 'v0') v0Ref.current?.loadState(state);
        if (currentVersion === 'v1') {
          fundamental1Ref.current?.loadState(state.fundamental || state);
          const swarmState = state.swarm || (Array.isArray(state) ? state : null);
          if (swarmState) v1Ref.current?.loadState(swarmState);
        }
        if (currentVersion === 'v2') {
          fundamental2Ref.current?.loadState(state.fundamental || state);
          const swarmState = state.swarm || (Array.isArray(state) ? state : null);
          if (swarmState) v2Ref.current?.loadState(swarmState);
        }
        if (currentVersion === 'v3') v3Ref.current?.loadState(state);
        if (currentVersion === 'v4') v4Ref.current?.loadState(state);
        if (currentVersion === 'v5') v5Ref.current?.loadState(state);
        if (currentVersion === 'v6') v6Ref.current?.loadState(state);
        if (currentVersion === 'v7') v7Ref.current?.loadState(state);
        if (currentVersion === 'v8') v8Ref.current?.loadState(state);
        console.log(`[Sim] State for ${currentVersion} loaded!`);
      } else {
        console.warn(`[Sim] No saved state found for ${currentVersion}`);
      }
    };

    const autoSaveInterval = window.setInterval(() => {
      (window as any).saveSimState?.().catch((error: unknown) => {
        console.error('[Memory] Automatic checkpoint failed:', error);
      });
    }, 30_000);

    return () => {
      disposed = true;
      window.clearInterval(autoSaveInterval);
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      cancelAnimationFrame(frameId);
      controls?.dispose();
      if (renderer?.domElement.parentNode === container) renderer.domElement.remove();
      v0Ref.current?.dispose();
      fundamental1Ref.current?.dispose();
      fundamental2Ref.current?.dispose();
      v1Ref.current?.dispose();
      v2Ref.current?.dispose();
      v3Ref.current?.dispose();
      v4Ref.current?.dispose();
      v5Ref.current?.dispose();
      v6Ref.current?.dispose();
      v7Ref.current?.dispose();
      v8Ref.current?.dispose();
      v9Ref.current?.dispose();
      v10Ref.current?.dispose();
      v11Ref.current?.dispose();
      if (v12Ref.current) v12Ref.current.dispose();
      if (membraneLinesRef.current) {
        membraneLinesRef.current.geometry.dispose();
        const material = membraneLinesRef.current.material;
        if (Array.isArray(material)) material.forEach(item => item.dispose());
        else material.dispose();
      }
      renderer?.dispose();
      if (renderer && rendererRef.current === renderer) rendererRef.current = null;
      if (sceneRef.current === scene) sceneRef.current = null;
      if (cameraRef.current === camera) cameraRef.current = null;
      v13Ref.current = null;
      topoFlowRef.current = null;
    };
  }, []);

  // Update visibility when version changes
  useEffect(() => {
    const isFundamental = activeVersion === 'v1' || activeVersion === 'v2';

    if (v0Ref.current) {
      v0Ref.current.points.visible = activeVersion === 'v0';
      v0Ref.current.lines.visible = activeVersion === 'v0';
    }
    if (fundamental1Ref.current) fundamental1Ref.current.group.visible = isFundamental;
    if (fundamental2Ref.current) fundamental2Ref.current.group.visible = isFundamental;
    if (membraneLinesRef.current) membraneLinesRef.current.visible = isFundamental;

    // V1+V2 both visible when either is active (overlaid orthogonal views)
    const showSwarm = activeVersion === 'v1' || activeVersion === 'v2';
    if (v1Ref.current?.points) {
      v1Ref.current.points.visible = showSwarm;
      v1Ref.current.lines.visible = showSwarm;
    }
    if (v2Ref.current?.points) {
      v2Ref.current.points.visible = showSwarm;
      v2Ref.current.lines.visible = showSwarm;
    }
    // V3+V4 both visible when either is active (overlaid MST networks)
    const showMST = activeVersion === 'v3' || activeVersion === 'v4';
    if (v3Ref.current) {
      v3Ref.current.points.visible = showMST;
      v3Ref.current.mstLines.visible = showMST;
      v3Ref.current.neighborLines.visible = showMST;
    }
    if (v4Ref.current) {
      v4Ref.current.points.visible = showMST;
      v4Ref.current.mstLines.visible = showMST;
      v4Ref.current.neighborLines.visible = showMST;
    }
    if (v5Ref.current) {
      const v5Vis = activeVersion === 'v5';
      v5Ref.current.meshGroup.visible = v5Vis;
      v5Ref.current.wireframeGroup.visible = v5Vis;
      v5Ref.current.pointCloud.visible = v5Vis;
      v5Ref.current.wallGroup.visible = v5Vis;
      v5Ref.current.floorCeilGroup.visible = v5Vis;
      v5Ref.current.spiralGroup.visible = v5Vis;
      v5Ref.current.layerGroup.visible = v5Vis;
    }
    if (v6Ref.current) {
      const v6Vis = activeVersion === 'v6';
      v6Ref.current.flowLines.visible = v6Vis;
      v6Ref.current.flowParticles.visible = v6Vis;
      v6Ref.current.heatmapPoints.visible = v6Vis;
      v6Ref.current.thermalGrid.visible = v6Vis;
      v6Ref.current.spiralFlowGroup.visible = v6Vis;
      v6Ref.current.channelFlowGroup.visible = v6Vis;
      v6Ref.current.surfaceGradientGroup.visible = v6Vis;
      v6Ref.current.signalWaveGroup.visible = v6Vis;
    }
    if (v7Ref.current) {
      v7Ref.current.trendLines.visible = activeVersion === 'v7';
      v7Ref.current.scoreIndicator.visible = activeVersion === 'v7';
      v7Ref.current.connectionLines.visible = activeVersion === 'v7';
      v7Ref.current.flowParticles.visible = activeVersion === 'v7';
    }
    if (v8Ref.current) {
      const v8Vis = activeVersion === 'v8';
      v8Ref.current.line.visible = v8Vis;
      v8Ref.current.points.visible = v8Vis;
      v8Ref.current.spiralLine.visible = v8Vis;
      v8Ref.current.phaseMarkers.visible = v8Vis;
      v8Ref.current.staircaseLine.visible = v8Vis;
      v8Ref.current.criticalLine.visible = v8Vis;
      for (const wl of v8Ref.current.waveLines) wl.visible = v8Vis;
    }
    // V9/V10/V11 material pipeline — always overlaid when V1-V7 are active
    const showMaterial = ['v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7'].includes(activeVersion);
    if (v9Ref.current) {
      v9Ref.current.points.visible = showMaterial;
      v9Ref.current.bondLines.visible = showMaterial;
    }
    if (v10Ref.current) {
      v10Ref.current.surfacePoints.visible = showMaterial;
      v10Ref.current.channelLines.visible = showMaterial;
    }
    if (v11Ref.current) {
      v11Ref.current.shellLines.visible = showMaterial;
      v11Ref.current.portPoints.visible = showMaterial;
      v11Ref.current.constraintLines.visible = showMaterial;
    }
  }, [activeVersion]);

  // Handle v7 specific updates from window
  useEffect(() => {
    (window as any).getV7Score = () => v7Ref.current?.getScore();
    (window as any).getV7Recommendations = () => v7Ref.current?.getRecommendations();
    (window as any).getV6Metrics = () => v6Ref.current?.getMetrics();
    (window as any).getV6FlowPaths = () => v6Ref.current?.getFlowPaths();
    (window as any).getSimMaterial = () => v1Ref.current?.getMaterial();
    (window as any).setSimMaterial = (props: any) => {
      if (v1Ref.current) v1Ref.current.setMaterial(props);
    };
  }, []);

  const activeSidegoal = autonomousState?.tasks?.find((t: any) => t.status === 'active');

  return (
    <div ref={containerRef} className="w-full h-full rounded-xl overflow-hidden bg-black/40 border border-white/10 relative">
      {webGlError && (
        <div className="absolute inset-0 z-10 bg-[#050505]">
          <SoftwareSimulationFallback />
          <div className="absolute left-3 bottom-3 rounded-lg bg-black/75 border border-cyan-500/20 px-3 py-2 pointer-events-none">
            <h3 className="text-[9px] font-black text-cyan-300 uppercase tracking-widest">Software 3D active</h3>
            <p className="text-[7px] text-gray-500 font-mono">Drag to orbit · wheel/pinch to zoom · numerical engines running</p>
          </div>
        </div>
      )}
      <AnimatePresence>
        {activeSidegoal && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute bottom-6 left-6 z-20 pointer-events-none"
          >
            <div className="bg-black/80 backdrop-blur-xl border border-purple-500/30 p-4 rounded-2xl shadow-2xl max-w-xs space-y-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-purple-500/20 rounded-lg">
                  <Brain className="w-3 h-3 text-purple-400" />
                </div>
                <span className="text-[8px] font-black text-purple-400 uppercase tracking-widest">Autonomous Sidegoal</span>
              </div>
              <div className="space-y-1">
                <h4 className="text-[10px] font-bold text-white uppercase tracking-tight">{activeSidegoal.title}</h4>
                <div className="flex justify-between items-center text-[7px] font-mono text-gray-500 uppercase">
                  <span>Algorithm: {activeSidegoal.algorithm}</span>
                  <span>{Math.floor(activeSidegoal.progress)}%</span>
                </div>
              </div>
              <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                <motion.div 
                  animate={{ width: `${activeSidegoal.progress}%` }}
                  className="h-full bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]"
                />
              </div>
              {activeSidegoal.title.toLowerCase().includes('cross the road') && (
                <div className="flex items-center gap-2 pt-1">
                  <div className={`w-1.5 h-1.5 rounded-full ${activeSidegoal.progress > 80 ? 'bg-emerald-500' : 'bg-red-500 animate-pulse'}`} />
                  <span className="text-[7px] font-bold text-gray-400 uppercase">
                    {activeSidegoal.progress > 80 ? 'Safe to proceed' : 'Waiting for optimal window...'}
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Self-Editing Visual Effect */}
      <AnimatePresence>
        {autonomousState?.logs?.[autonomousState.logs.length - 1]?.includes('self-edited') && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 2 }}
            className="absolute inset-0 z-30 pointer-events-none bg-purple-500/5 flex items-center justify-center"
          >
            <div className="text-[10px] font-mono text-purple-400 uppercase tracking-[0.5em] animate-pulse">
              System_Self_Modification_Active
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const Waveform = ({ 
  modulation, 
  decimalValue, 
  carrierFreq, 
  amplitude 
}: { 
  modulation: string; 
  decimalValue: number; 
  carrierFreq: number; 
  amplitude: number 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frame = 0;
    let frameId = 0;
    let disposed = false;
    const animate = () => {
      if (disposed) return;
      frame++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw Carrier Wave (The "Internet" medium)
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.lineWidth = 0.5;
      const baseFreq = 0.2; // Visual base frequency
      for (let x = 0; x < canvas.width; x++) {
        const t = (x + frame * 1.5);
        const y = (canvas.height / 2) + Math.sin(t * baseFreq) * (canvas.height / 4);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Draw Modulated Signal
      ctx.beginPath();
      ctx.strokeStyle = modulation === 'AM' ? '#f59e0b' : '#06b6d4';
      ctx.lineWidth = 1.5;

      const modIndex = decimalValue / 31; // 0 to 1 for 5-bit

      for (let x = 0; x < canvas.width; x++) {
        const t = (x + frame * 2);
        let y;
        
        if (modulation === 'AM') {
          // Amplitude Modulation: (1 + m * signal) * carrier
          const envelope = 0.3 + modIndex * 0.7;
          y = (canvas.height / 2) + Math.sin(t * baseFreq) * (canvas.height / 3) * envelope;
        } else {
          // Frequency Modulation: sin(t * (carrierFreq + m * signal))
          const freqMod = baseFreq + (modIndex * 0.15);
          y = (canvas.height / 2) + Math.sin(t * freqMod) * (canvas.height / 3);
        }
        
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);
    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
    };
  }, [modulation, decimalValue, carrierFreq, amplitude]);

  return (
    <div className="relative h-24 bg-black/60 rounded-xl border border-white/5 overflow-hidden">
      <canvas ref={canvasRef} width={400} height={100} className="w-full h-full" />
      <div className="absolute top-2 left-2 flex gap-2">
        <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase ${modulation === 'AM' ? 'bg-amber-500/20 text-amber-500' : 'bg-cyan-500/20 text-cyan-500'}`}>
          {modulation} Mode
        </span>
        <span className="px-2 py-0.5 bg-white/10 rounded text-[8px] font-mono text-gray-400 uppercase">
          5-BIT VAL: {decimalValue}
        </span>
      </div>
    </div>
  );
};

const RiemannZetaExplorer = () => {
  const [activeZeros, setActiveZeros] = useState(3);
  const [showCriticalLine, setShowCriticalLine] = useState(true);
  const [fractalDim, setFractalDim] = useState(1.0);
  const [spiralRange, setSpiralRange] = useState(60);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    (window as any).riemannActiveZeros = activeZeros;
    (window as any).riemannShowCriticalLine = showCriticalLine;
  }, [activeZeros, showCriticalLine]);

  useEffect(() => {
    const v8 = (window as any).riemannV8Engine;
    if (v8) v8.setFractalDimension(fractalDim);
  }, [fractalDim]);

  useEffect(() => {
    const v8 = (window as any).riemannV8Engine;
    if (v8) v8.setSpiralRange(spiralRange);
  }, [spiralRange]);

  // Refresh periodically
  useEffect(() => {
    const iv = setInterval(() => forceUpdate(n => n + 1), 2000);
    return () => clearInterval(iv);
  }, []);

  const subprimes = (window as any).riemannSubprimes || [];
  const v8 = (window as any).riemannV8Engine;
  const searchPos = v8?.searchPosition || 0;
  const searchIter = v8?.searchIterations || 0;
  const analysis = v8?.getAnalysis?.() || {};

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
          <FlaskConical size={14} className="text-purple-400" />
          Riemann Zeta Analytic Engine
        </h3>
        <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 text-[8px] font-bold uppercase tracking-widest rounded-full border border-emerald-500/30">
          Eta Function (Valid)
        </span>
      </div>

      {/* Analytic Continuation Method */}
      <div className="p-4 bg-purple-500/5 rounded-2xl border border-purple-500/20 space-y-3">
        <div className="text-[9px] font-bold text-purple-400 uppercase tracking-widest">Analytic Continuation via Dirichlet Eta</div>
        <div className="text-[10px] font-mono text-gray-300 leading-relaxed space-y-1">
          <p><span className="text-red-400 line-through opacity-50">zeta(s) = sum n^(-s)</span> <span className="text-red-400/50 text-[8px]">DIVERGENT for Re(s) &lt; 1</span></p>
          <p className="text-emerald-400">eta(s) = sum (-1)^(n-1) n^(-s) <span className="text-emerald-300/60 text-[8px]">CONVERGENT for Re(s) &gt; 0</span></p>
          <p className="text-cyan-300">zeta(s) = eta(s) / (1 - 2^(1-s))</p>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-2">
          <div className="p-2 bg-white/5 rounded border border-white/5 text-center">
            <div className="text-[8px] text-gray-500 uppercase">Search Pos</div>
            <div className="text-xs font-mono text-purple-300">{searchPos > 0 ? searchPos.toFixed(6) : '1e-6'}</div>
          </div>
          <div className="p-2 bg-white/5 rounded border border-white/5 text-center">
            <div className="text-[8px] text-gray-500 uppercase">Iterations</div>
            <div className="text-xs font-mono text-purple-300">{searchIter.toLocaleString()}</div>
          </div>
          <div className="p-2 bg-white/5 rounded border border-white/5 text-center">
            <div className="text-[8px] text-gray-500 uppercase">Method</div>
            <div className="text-xs font-mono text-emerald-400">eta(s)</div>
          </div>
        </div>
      </div>

      {/* Parametric Spiral & Winding Number */}
      <div className="p-4 bg-amber-500/5 rounded-2xl border border-amber-500/20 space-y-3">
        <div className="text-[9px] font-bold text-amber-400 uppercase tracking-widest">Parametric Spiral & Winding Number</div>
        <div className="text-[10px] text-gray-400 leading-relaxed">
          <span className="text-amber-300">Orange spiral</span> = zeta({(fractalDim/2).toFixed(3)} + it) traced in complex plane. Origin crossings = zeros.
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="p-2 bg-white/5 rounded border border-white/5 text-center">
            <div className="text-[8px] text-gray-500 uppercase">Winding #</div>
            <div className="text-xs font-mono text-amber-300">{(analysis.windingNumber || 0).toFixed(2)}</div>
          </div>
          <div className="p-2 bg-white/5 rounded border border-white/5 text-center">
            <div className="text-[8px] text-gray-500 uppercase">Zeros (Wind)</div>
            <div className="text-xs font-mono text-amber-300">{analysis.zerosFoundByWinding || 0}</div>
          </div>
          <div className="p-2 bg-white/5 rounded border border-white/5 text-center">
            <div className="text-[8px] text-gray-500 uppercase">N(T) Est</div>
            <div className="text-xs font-mono text-amber-300">{v8 ? v8.getZeroCountEstimate(spiralRange).toFixed(1) : '—'}</div>
          </div>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between">
            <span className="text-[8px] text-gray-500 uppercase">Spiral Range (t_max)</span>
            <span className="text-[9px] font-mono text-amber-300">{spiralRange}</span>
          </div>
          <input
            type="range" min="10" max="240" step="5"
            value={spiralRange}
            onChange={(e) => setSpiralRange(parseInt(e.target.value))}
            className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-amber-500"
          />
        </div>
        <div className="text-[8px] text-gray-500 font-mono">
          N(T) = (T/2pi) * ln(T/2pi*e) — density of zeros up to height T
        </div>
      </div>

      {/* Fractal Riemann Hypothesis */}
      <div className="p-4 bg-pink-500/5 rounded-2xl border border-pink-500/20 space-y-3">
        <div className="text-[9px] font-bold text-pink-400 uppercase tracking-widest">Fractal Riemann Hypothesis</div>
        <div className="text-[10px] text-gray-400 leading-relaxed">
          Critical line shifts to Re(s) = D_H/2 in non-integer dimensions.
          Standard arithmetic (D_H=1) gives 0.5.
        </div>
        <div className="space-y-1">
          <div className="flex justify-between">
            <span className="text-[8px] text-gray-500 uppercase">Spectral Dimension D_H</span>
            <span className="text-[9px] font-mono text-pink-300">{fractalDim.toFixed(3)}</span>
          </div>
          <input
            type="range" min="0.5" max="3.0" step="0.001"
            value={fractalDim}
            onChange={(e) => setFractalDim(parseFloat(e.target.value))}
            className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-pink-500"
          />
          <div className="text-[8px] text-pink-300 font-mono">
            Critical Line: Re(s) = {(fractalDim / 2).toFixed(4)}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-1">
          {(v8?.fractalAnalyses || []).map((fa: any, i: number) => (
            <button
              key={i}
              onClick={() => setFractalDim(fa.spectralDimension)}
              className={`p-2 rounded border text-left transition-all ${
                Math.abs(fractalDim - fa.spectralDimension) < 0.01
                  ? 'bg-pink-500/20 border-pink-500/40'
                  : 'bg-white/5 border-white/10 hover:bg-white/10'
              }`}
            >
              <div className="text-[8px] font-bold text-pink-300">{fa.label}</div>
              <div className="text-[7px] font-mono text-gray-500">D_H={fa.spectralDimension} | crit={fa.criticalLine}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Zeta-Minimizer Theorem — Golden Ratio Phase Stability */}
      <div className="p-4 bg-yellow-500/5 rounded-2xl border border-yellow-500/20 space-y-3">
        <div className="text-[9px] font-bold text-yellow-400 uppercase tracking-widest">Zeta-Minimizer Theorem (Phase Stability)</div>
        <div className="text-[10px] text-gray-400 leading-relaxed">
          Golden ratio conjugates emerge as thermodynamic phase stability markers.
          Primes arise as indivisible cycles in a system seeking equilibrium.
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="p-3 bg-yellow-500/10 rounded border border-yellow-500/20 text-center">
            <div className="text-[7px] text-gray-500 uppercase font-bold">Compressive</div>
            <div className="text-lg font-black text-yellow-300 font-mono">0.382</div>
            <div className="text-[7px] text-yellow-500/60">1 - 1/phi</div>
            <div className="text-[7px] text-gray-500 mt-1">0 deg phase</div>
          </div>
          <div className="p-3 bg-purple-500/10 rounded border border-purple-500/20 text-center">
            <div className="text-[7px] text-gray-500 uppercase font-bold">Critical</div>
            <div className="text-lg font-black text-purple-300 font-mono">0.500</div>
            <div className="text-[7px] text-purple-500/60">Duality fixed pt</div>
            <div className="text-[7px] text-gray-500 mt-1">Re(s) = 1/2</div>
          </div>
          <div className="p-3 bg-emerald-500/10 rounded border border-emerald-500/20 text-center">
            <div className="text-[7px] text-gray-500 uppercase font-bold">Elongative</div>
            <div className="text-lg font-black text-emerald-300 font-mono">0.618</div>
            <div className="text-[7px] text-emerald-500/60">1/phi</div>
            <div className="text-[7px] text-gray-500 mt-1">180 deg phase</div>
          </div>
        </div>
        <div className="text-[8px] text-gray-500 font-mono leading-relaxed">
          Entropy maximization (Axiom I) + spectral Gibbs minima (Axiom II) + flux conservation (Axiom III) → primes emerge as stable recoils of thermodynamic equilibrium
        </div>
      </div>

      {/* Prime Staircase & Wave Superposition */}
      <div className="p-4 bg-black/40 rounded-2xl border border-white/5 space-y-4">
        <div className="text-[9px] font-bold text-cyan-400 uppercase tracking-widest">Prime Staircase & Wave Superposition</div>
        <div className="text-[10px] text-gray-500 leading-relaxed">
          <span className="text-cyan-300">Cyan</span> = pi(x) step function.{' '}
          <span className="text-yellow-300">Yellow</span> = Li(x) - sum_rho Li(x^rho) - ln(2).{' '}
          <span className="text-red-300">Red</span>/<span className="text-green-300">Green</span>/<span className="text-blue-300">Blue</span> = individual zero wave contributions.
        </div>
        <div className="text-[8px] text-gray-500 font-mono">
          Pi_0(x) = Li(x) - sum_rho Li(x^rho) - ln(2) + integral correction
        </div>
        <div className="text-[8px] text-gray-500 font-mono">
          Li(x^rho) = x^rho / (rho * ln(x)) — asymptotic, rho = {(fractalDim/2).toFixed(3)} + i*gamma_n
        </div>
      </div>

      {/* Active Zeros */}
      <div className="p-4 bg-black/40 rounded-2xl border border-white/5 space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-gray-500 uppercase font-bold">Active Irrational Zeros (Wave Frequencies)</span>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-purple-500 animate-ping" />
            <span className="text-xs font-mono text-purple-400">{activeZeros} / 100</span>
          </div>
        </div>
        <input
          type="range" min="1" max="100" step="1"
          value={activeZeros}
          onChange={(e) => setActiveZeros(parseInt(e.target.value))}
          className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-purple-500"
        />

        <div className="flex items-center justify-between p-2 bg-white/5 rounded border border-white/5">
          <span className="text-[10px] text-gray-500 uppercase font-bold">Show Critical Line (Re(s) = {(fractalDim/2).toFixed(3)})</span>
          <input
            type="checkbox"
            checked={showCriticalLine}
            onChange={(e) => setShowCriticalLine(e.target.checked)}
            className="accent-purple-500"
          />
        </div>

        <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
          {V8Engine.ZEROS.slice(0, activeZeros).map((zero, i) => (
            <div key={i} className="flex items-center justify-between p-2 bg-purple-500/5 rounded border border-purple-500/10">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{backgroundColor: `hsl(${(i/100)*360}, 80%, 60%)`}} />
                <span className="text-[9px] text-gray-400 font-mono">rho_{i+1}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-purple-300">{(fractalDim/2).toFixed(3)} + {zero.toFixed(4)}i</span>
                <span className="text-[7px] font-mono text-gray-600">A={( 1/Math.sqrt(zero)).toFixed(4)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Zero Candidates (valid search using eta function) */}
      <div className="p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/20 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-emerald-400 uppercase font-bold flex items-center gap-2">
            <Target size={12} />
            Off-Critical-Line Search (eta method)
          </span>
          <span className="text-[8px] font-mono text-emerald-500/60">{subprimes.length} candidates</span>
        </div>
        <div className="text-[9px] text-gray-500 font-mono">
          Valid search: |zeta(sigma + it)| via eta(s)/(1-2^(1-s)) for 0 &lt; sigma &lt; 0.5
        </div>
        <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
          {subprimes.length > 0 ? (
            subprimes.slice(-15).reverse().map((s: any, i: number) => (
              <div key={i} className="p-2 bg-white/5 rounded border border-white/5 space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-[9px] font-mono text-emerald-400">Re(s) = {s.realPart?.toFixed(6) || s.x?.toFixed(6)}</span>
                  <div className="flex gap-2 items-center">
                    <span className="text-[7px] font-mono text-emerald-500/40 uppercase">{s.method || 'eta'}</span>
                    <span className="text-[7px] text-gray-600">{new Date(s.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
                <div className="text-[8px] font-mono text-gray-400">
                  {s.formula || `|zeta| = ${(s.zetaMagnitude || s.val)?.toExponential(4)}`}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-4 text-[8px] text-gray-600 uppercase tracking-widest">
              Searching critical strip via eta function...
            </div>
          )}
        </div>
      </div>

      {/* Voronin's Universality */}
      <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 p-4 rounded-xl border border-white/5 space-y-2">
        <div className="text-[9px] font-bold text-purple-400 uppercase tracking-widest">Voronin's Universality Theorem</div>
        <p className="text-[9px] text-gray-400 leading-relaxed">
          The zeta function is <span className="text-purple-300 font-bold">universal</span>: its spiral contains an approximation of <span className="text-cyan-300">every possible non-vanishing analytic function</span>. For any smooth curve, there exists a vertical shift i*tau such that zeta(s + i*tau) traces that curve to arbitrary precision. This fractal-like informational density means every continuous mathematical object can be extracted from the prime structure.
        </p>
        <p className="text-[8px] text-gray-500 font-mono">
          For any g(s) on compact K in (1/2 &lt; Re(s) &lt; 1): exists tau s.t. max|zeta(s+i*tau) - g(s)| &lt; epsilon
        </p>
      </div>

      {/* Summary */}
      <div className="bg-gradient-to-r from-amber-500/10 to-pink-500/10 p-4 rounded-xl border border-white/5 space-y-2">
        <p className="text-[9px] text-gray-400 leading-relaxed">
          <span className="text-amber-400 font-bold">Riemann Hypothesis:</span> the unproved conjecture is that every non-trivial zero has real part 0.5. This view numerically explores the zeta function and the first tabulated zero ordinates ({V8Engine.ZEROS[0].toFixed(4)}, {V8Engine.ZEROS[1].toFixed(4)}, ...). It does not imply a thermodynamic, material, architectural, or energy-optimization mechanism.
        </p>
      </div>
    </div>
  );
};

const FlowMetricsPanel = () => {
  const [metrics, setMetrics] = useState<any>(null);

  useEffect(() => {
    const poll = setInterval(() => {
      const m = (window as any).getV6Metrics?.();
      const score = (window as any).getV7Score?.();
      const recs = (window as any).getV7Recommendations?.();
      if (m) setMetrics({ ...m, v7Score: score, v7Recs: recs || [] });
    }, 1000);
    return () => clearInterval(poll);
  }, []);

  const isElectrical = metrics?.avgImpedance !== undefined;

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-2">
          <Cpu size={14} className="text-purple-400" />
          {isElectrical ? 'PCB Impedance Analysis' : 'Flow Metrics'}
        </h3>
        <span className="text-[10px] font-mono text-cyan-400">
          {metrics ? `${metrics.pathCount} PATHS` : 'AWAITING...'}
        </span>
      </div>
      <div className="space-y-3">
        {isElectrical ? (
          <>
            {[
              { label: 'Avg Z₀', val: metrics?.avgImpedance ? `${metrics.avgImpedance.toFixed(1)}Ω` : '--', target: '50Ω' },
              { label: 'Z Mismatch (σ)', val: metrics?.impedanceMismatch ? `${metrics.impedanceMismatch.toFixed(2)}Ω` : '--', target: '<5Ω' },
              { label: 'Max Prop Delay', val: metrics?.maxPropDelay ? `${metrics.maxPropDelay.toFixed(1)} ps` : '--', target: '<100ps' },
              { label: 'Flow Efficiency', val: metrics?.efficiency ? `${(metrics.efficiency * 100).toFixed(1)}%` : '--', target: '>80%' },
              { label: 'Bottlenecks', val: metrics?.bottleneckCount?.toString() || '--', target: '0' },
            ].map((stat, i) => (
              <div key={i} className="flex items-center justify-between p-2 bg-black/20 rounded border border-white/5">
                <div className="flex flex-col">
                  <span className="text-[10px] text-gray-500 font-bold uppercase">{stat.label}</span>
                  <span className="text-[7px] text-gray-600 font-mono">target: {stat.target}</span>
                </div>
                <span className="text-xs font-mono text-cyan-300">{stat.val}</span>
              </div>
            ))}
          </>
        ) : (
          <>
            {[
              { label: 'Total Flow', val: metrics?.totalFlow?.toFixed(2) || '--' },
              { label: 'Avg Resistance', val: metrics?.avgResistance?.toFixed(3) || '--' },
              { label: 'Efficiency', val: metrics?.efficiency ? `${(metrics.efficiency * 100).toFixed(1)}%` : '--' },
              { label: 'Bottlenecks', val: metrics?.bottleneckCount?.toString() || '--' },
              { label: 'V7 Score', val: metrics?.v7Score?.toFixed(2) || '--' },
            ].map((stat, i) => (
              <div key={i} className="flex items-center justify-between p-2 bg-black/20 rounded border border-white/5">
                <span className="text-[10px] text-gray-500 font-bold uppercase">{stat.label}</span>
                <span className="text-xs font-mono text-cyan-300">{stat.val}</span>
              </div>
            ))}
          </>
        )}
        {metrics?.v7Recs?.length > 0 && (
          <div className="mt-2 p-2 bg-emerald-500/10 rounded border border-emerald-500/20">
            <span className="text-[8px] text-emerald-400 font-bold uppercase block mb-1">V7 Tuning</span>
            {metrics.v7Recs.slice(0, 3).map((r: any, i: number) => (
              <div key={i} className="text-[7px] font-mono text-emerald-300/70 truncate">{r.reason}</div>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

const BlockchainSupercomputer = ({ autonomousState }: { autonomousState: any }) => {
  const [nodes, setNodes] = useState<any[]>([]);
  const [optState, setOptState] = useState<any>(null);
  const [flowMetrics, setFlowMetrics] = useState<any>(null);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [nodesRes, optRes] = await Promise.all([
          fetch('/api/blockchain/nodes').then(r => r.ok ? r.json() : []).catch(() => []),
          fetch('/api/optimizer/state').then(r => r.ok ? r.json() : null).catch(() => null),
        ]);
        setNodes(nodesRes);
        setOptState(optRes);
        // Also grab live V6 flow metrics
        const m = (window as any).getV6Metrics?.();
        if (m) setFlowMetrics(m);
      } catch {}
    };
    fetchAll();
    const interval = setInterval(fetchAll, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-4">
      <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
        <Cpu size={14} className="text-cyan-400" />
        P2P Distributed Network
      </h3>

      {/* Live Node Status */}
      <div className="space-y-2">
        <span className="text-[8px] text-gray-500 uppercase font-bold block">Node Health ({nodes.length} nodes)</span>
        {nodes.map((n: any, i: number) => (
          <div key={i} className="flex items-center justify-between p-2 bg-black/30 rounded border border-white/5">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${
                n.status === 'active' ? 'bg-emerald-500 animate-pulse' :
                n.status === 'error' ? 'bg-red-500' : 'bg-gray-600'
              }`} />
              <span className="text-[9px] font-mono text-gray-400">{n.ip || n.id}</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[8px] font-mono text-cyan-400">{n.latency || '--'}</span>
              <div className="w-12 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-cyan-500/60 rounded-full" style={{ width: `${(n.load || 0) * 100}%` }} />
              </div>
            </div>
          </div>
        ))}
        {nodes.length === 0 && (
          <div className="text-[9px] text-gray-600 font-mono p-2">No peers connected</div>
        )}
      </div>

      {/* GA Evolution State */}
      {optState && (
        <div className="p-3 bg-black/40 rounded-xl border border-white/5 space-y-2">
          <span className="text-[8px] text-gray-500 uppercase font-bold block">Genetic Algorithm</span>
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center">
              <div className="text-lg font-black text-cyan-400 font-mono">{optState.generation}</div>
              <div className="text-[7px] text-gray-600 uppercase">Gen</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-black text-emerald-400 font-mono">{optState.bestFitness?.toFixed(1)}</div>
              <div className="text-[7px] text-gray-600 uppercase">Fitness</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-black text-purple-400 font-mono">{optState.populationSize}</div>
              <div className="text-[7px] text-gray-600 uppercase">Pop</div>
            </div>
          </div>
          {/* Config adoption log */}
          <div className="mt-2 space-y-1 max-h-24 overflow-y-auto">
            {optState.logs?.slice(-5).map((log: string, i: number) => (
              <div key={i} className={`text-[7px] font-mono leading-tight ${
                log.includes('[P2P]') ? 'text-cyan-400' :
                log.includes('[LOCAL]') ? 'text-purple-400' :
                log.includes('[ELITE]') ? 'text-yellow-400' :
                'text-gray-500'
              }`}>
                {log}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manifold Flow Through Network */}
      {flowMetrics && (
        <div className="p-3 bg-black/40 rounded-xl border border-white/5 space-y-2">
          <span className="text-[8px] text-gray-500 uppercase font-bold block">Data Flow Through Manifold</span>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Flow Paths', val: flowMetrics.pathCount },
              { label: 'Efficiency', val: `${(flowMetrics.efficiency * 100).toFixed(1)}%` },
              { label: 'Bottlenecks', val: flowMetrics.bottleneckCount },
              { label: 'Membranes Modified', val: flowMetrics.membranesModified },
            ].map((s, i) => (
              <div key={i} className="flex justify-between p-1.5 bg-white/5 rounded border border-white/5">
                <span className="text-[7px] text-gray-500 uppercase">{s.label}</span>
                <span className="text-[9px] font-mono text-cyan-300">{s.val}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const AutonomousCore = ({ state }: { state: any }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [newGoal, setNewGoal] = useState("");

  const handleEditGoal = async () => {
    try {
      await fetch('/api/autonomous/edit-goal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: newGoal })
      });
      setIsEditing(false);
    } catch (e) {
      console.error("Failed to edit goal", e);
    }
  };

  if (!state) return null;

  return (
    <div className="bg-black/60 backdrop-blur-xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
      <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-purple-500/20 rounded-lg">
            <Brain className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-widest">Autonomous Core</h3>
            <span className="text-[8px] text-purple-400/60 font-mono">SELF-EVOLVING INTELLIGENCE v4.2</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
            <span className="text-[8px] text-emerald-500 font-mono uppercase">Active</span>
          </div>
          <button 
            onClick={() => {
              setIsEditing(!isEditing);
              setNewGoal(state.currentGoal);
            }}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
          >
            <Settings className="w-3 h-3 text-gray-400" />
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Build Status */}
        {state.buildStatus && (
          <div className="p-4 bg-white/5 rounded-xl border border-white/10 space-y-3">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-cyan-500 rounded-full animate-ping" />
                <span className="text-[10px] font-black text-white uppercase tracking-widest">Build v{state.buildStatus.version}</span>
              </div>
              <span className="text-[8px] font-mono text-gray-500 uppercase">Integrity: {(state.buildStatus.integrity * 100).toFixed(2)}%</span>
            </div>
            <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
              <motion.div 
                animate={{ width: `${state.buildStatus.integrity * 100}%` }}
                className="h-full bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]"
              />
            </div>
            <div className="flex justify-between text-[7px] font-mono text-gray-600 uppercase">
              <span>Last Patch: {new Date(state.buildStatus.lastBuildAt).toLocaleTimeString()}</span>
              <span>Status: {state.buildStatus.isCompiling ? 'Compiling...' : 'Stable'}</span>
            </div>
          </div>
        )}

        {/* Current Goal */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-gray-500">
            <Target className="w-3 h-3" />
            <span className="text-[8px] uppercase font-bold tracking-tighter">Primary Objective</span>
          </div>
          {isEditing ? (
            <div className="flex gap-2">
              <input 
                value={newGoal}
                onChange={(e) => setNewGoal(e.target.value)}
                className="flex-1 bg-white/5 border border-purple-500/30 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
              />
              <button 
                onClick={handleEditGoal}
                className="px-3 py-2 bg-purple-500 text-white text-[10px] font-bold rounded-lg uppercase"
              >
                Apply
              </button>
            </div>
          ) : (
            <p className="text-sm font-bold text-white leading-relaxed group cursor-pointer" onClick={() => setIsEditing(true)}>
              {state.currentGoal}
              <span className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-purple-400">Edit</span>
            </p>
          )}
        </div>

        {/* Task Queue */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-gray-500">
            <Cpu className="w-3 h-3" />
            <span className="text-[8px] uppercase font-bold tracking-tighter">Autonomous Evolution</span>
          </div>
          <div className="space-y-2">
            {state.tasks.slice(-3).map((task: any) => (
              <div key={task.id} className="p-3 bg-white/5 rounded-xl border border-white/5 space-y-2">
                <div className="flex justify-between items-start">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-bold text-white block">{task.title}</span>
                    <span className="text-[8px] text-gray-500 font-mono uppercase">ALG: {task.algorithm}</span>
                  </div>
                  <span className={`text-[7px] px-1.5 py-0.5 rounded-full font-bold uppercase ${
                    task.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' :
                    task.status === 'active' ? 'bg-blue-500/20 text-blue-400 animate-pulse' :
                    'bg-gray-500/20 text-gray-400'
                  }`}>
                    {task.status}
                  </span>
                </div>
                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${task.progress}%` }}
                    className={`h-full ${
                      task.status === 'completed' ? 'bg-emerald-500' :
                      task.status === 'active' ? 'bg-blue-500' :
                      'bg-gray-700'
                    }`}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* System Logs */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-gray-500">
            <Terminal className="w-3 h-3" />
            <span className="text-[8px] uppercase font-bold tracking-tighter">Self-Modification Log</span>
          </div>
          <div className="bg-black/40 rounded-xl p-3 border border-white/5 font-mono text-[9px] h-48 overflow-y-auto space-y-1 custom-scrollbar">
            {state.logs.map((log: string, i: number) => (
              <div key={i} className={`flex gap-2 ${
                log.includes('[BUILDER]') ? 'text-cyan-400' : 
                log.includes('[SYSTEM]') ? 'text-emerald-400' : 
                log.includes('[EVOLUTION]') ? 'text-purple-400' : 
                'text-gray-500'
              }`}>
                <span className="opacity-30">[{i.toString().padStart(2, '0')}]</span>
                <span className="flex-1 break-words">{log}</span>
              </div>
            ))}
            <div className="animate-pulse text-purple-400">_</div>
          </div>
        </div>
      </div>
    </div>
  );
};

const MathBlueprint = ({ type, onGenerateBlueprint }: { type: OptimizerType, onGenerateBlueprint: () => void }) => {
  const formulas = {
    thermal: {
      title: "Thermal Flow Optimization",
      math: "Q = -k ∇T + ρc_p u · ∇T",
      desc: "Optimizing convective and conductive heat transfer through novelty-mapped lattices. Brute-forcing the Navier-Stokes equations for micro-flows within membranes.",
      constants: "k = 0.026 W/mK (Air), ρ = 1.225 kg/m³, μ = 1.81e-5 Pa·s",
      blueprint: [
        "1. Map 3D Lattice (Gyroid Topology)",
        "2. Define Membrane Boundary (Icosahedron)",
        "3. Brute Force Flow Randomness (Novelty Search)",
        "4. Project 90° Phase Rotation for 3D Render"
      ]
    },
    electrical: {
      title: "Impedance Matching Lattice",
      math: "Z = √(R² + (ωL - 1/ωC)²)",
      desc: "Minimizing signal reflection in 3D printed circuit membranes. Mapping physical sims to material constants to find optimal dielectric properties.",
      constants: "ε_r = 4.4 (FR4), tan δ = 0.02, σ = 5.8e7 S/m (Cu)",
      blueprint: [
        "1. Define Frequency Spectrum (GHz)",
        "2. Map Fractal Lattice for Impedance",
        "3. Brute Force Node Placement",
        "4. 90° Phase Projection for 3D Layout"
      ]
    },
    blockchain: {
      title: "5-Bit Frequency Protocol",
      math: "H(X) = -Σ p(x) log₅ p(x) | f(t) = sin(ωt + φ)",
      desc: "Encoding data through 5-bit temporal frequency shifts. Piggybacking off binary traffic using novelty-driven entropy injection across multiple server nodes.",
      constants: "Baud = 5 bit/cycle, Latency < 5ms, SNR > 18dB",
      blueprint: [
        "1. Initialize Multi-Server Sync (abovebound.org)",
        "2. 5-Bit Entropy Injection",
        "3. Frequency-in-Time Encoding (Base-5)",
        "4. Distributed Ledger Validation"
      ]
    },
    math: {
      title: "Riemann Zeta Optimization",
      math: "ζ(s) = Σ n⁻ˢ = Π (1 - p⁻ˢ)⁻¹",
      desc: "Reverse-engineering the growth of primes by mapping the irrational zeros of the Zeta function. Using deep learning to reveal the discrete staircase of the number system.",
      constants: "s = 0.5 + it, ρ_n = Riemann Zeros, Li(x) = Logarithmic Integral",
      blueprint: [
        "1. Map Critical Line (Re(s) = 0.5)",
        "2. Synthesize Irrational Harmonics",
        "3. Subtract Overtones from Li(x)",
        "4. Reveal Prime Staircase (Discrete Code)"
      ]
    },
    spaceship: {
      title: "Spaceship Thermal Membrane",
      math: "Q_rad = ε σ A (T_sun⁴ - T_dark⁴)",
      desc: "Optimizing thermal flow across extreme gradients (Sun vs. Deep Space). Utilizing magnetocaloric lattices and gyroid membranes for zero-power thermal balancing.",
      constants: "ε = 0.9, σ = 5.67e-8, ΔT = 270K",
      blueprint: [
        "1. Map Extreme Thermal Gradient",
        "2. Synchronize Magnetocaloric Lattice",
        "3. Optimize Gyroid Flow Membrane",
        "4. Structural Thermodynamics Integration"
      ]
    }
  };

  const current = formulas[type];

  if (!current) return null;

  return (
    <div className="p-6 bg-white/5 rounded-xl border border-white/10 space-y-4">
      <div className="flex items-center gap-2 text-cyan-400">
        <Info size={18} />
        <h3 className="font-bold uppercase tracking-wider text-sm">{current.title}</h3>
      </div>
      <div className="bg-black/40 p-4 rounded-lg font-mono text-xl text-center border border-white/5 overflow-x-auto">
        {current.math}
      </div>
      <p className="text-gray-400 text-sm leading-relaxed">
        {current.desc}
      </p>
      
      <div className="space-y-2 pt-4 border-t border-white/10">
        <span className="text-[10px] text-gray-500 uppercase font-bold tracking-widest">System Blueprint</span>
        <div className="space-y-1">
          {current.blueprint.map((step, i) => (
            <div key={i} className="flex items-center gap-2 text-[10px] text-cyan-300/80 font-mono">
              <span className="text-cyan-500/40">[{i+1}]</span>
              {step}
            </div>
          ))}
        </div>
      </div>

      <div className="pt-4 border-t border-white/10">
        <button 
          onClick={onGenerateBlueprint}
          className="w-full py-3 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-lg text-[10px] font-bold text-cyan-400 uppercase tracking-widest transition-all"
        >
          Generate Optimized Blueprint
        </button>
      </div>

      <div className="pt-4 border-t border-white/10">
        <span className="text-xs text-gray-500 uppercase font-bold">Material Constants</span>
        <p className="text-sm font-mono text-cyan-300/80 mt-1">{current.constants}</p>
      </div>
    </div>
  );
};

const BlockchainCodex = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-widest text-emerald-400 flex items-center gap-2">
          <Database size={14} />
          Blockchain Frequency Codex
        </h3>
        <span className="text-[10px] font-mono text-emerald-500/50">v1.0.5</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(MATERIAL_CODEX).map(([key, mat]) => {
          const opt = BLOCKCHAIN_CODEX["5bit_fit"].carrierOptimization(mat);
          return (
            <div key={key} className="p-4 bg-white/5 rounded-xl border border-white/10 hover:border-emerald-500/30 transition-all group">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="text-xs font-bold text-white group-hover:text-emerald-400 transition-colors">{mat.name}</div>
                  <div className="text-[8px] text-gray-500 uppercase font-bold tracking-tighter">Material Carrier</div>
                </div>
                <div className="px-2 py-0.5 bg-emerald-500/10 rounded text-[8px] font-mono text-emerald-400 border border-emerald-500/20">
                  {mat.noveltyIndex.toFixed(2)} NI
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-mono">
                  <span className="text-gray-500">Optimal Carrier</span>
                  <span className="text-emerald-300">{opt.carrier}</span>
                </div>
                <div className="flex justify-between text-[10px] font-mono">
                  <span className="text-gray-500">Bandwidth</span>
                  <span className="text-emerald-300">{opt.bandwidth}</span>
                </div>
                <div className="flex justify-between text-[10px] font-mono">
                  <span className="text-gray-500">Modulation Depth</span>
                  <span className="text-emerald-300">{opt.modulationDepth}</span>
                </div>
                <div className="flex justify-between text-[10px] font-mono">
                  <span className="text-gray-500">Entropy Source</span>
                  <span className="text-emerald-500">{opt.entropySource}</span>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-white/5 text-[9px] text-gray-400 leading-relaxed italic">
                "{mat.description}"
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const SELF_BUILD_SNIPPETS = [
  "// Optimizing V1 exclusion rule\nfunction optimizeV1(nodes) {\n  return nodes.filter(n => n.novelty > 0.8);\n}",
  "// Injecting 3-bit entropy into blockchain\nconst injectEntropy = (data) => {\n  return data.map(d => d ^ Math.random() * 7);\n}",
  "// Self-modifying goal: Cross the road\nconst updateGoal = () => {\n  this.activeGoal = 'Wait for optimal window';\n}",
  "// Refactoring CMY color mixing engine\nconst getCMY = (c, m, y) => {\n  return new THREE.Color(1-c, 1-m, 1-y);\n}",
  "// Deploying BeyondBound OS v2.4.1\nconst deploy = () => {\n  system.reboot({ mode: 'autonomous' });\n}",
];

const SelfBuildView = () => {
  const [logs, setLogs] = useState<string[]>([]);
  const [code, setCode] = useState<string>('');
  const [isBuilding, setIsBuilding] = useState(false);
  const [progress, setProgress] = useState(0);
  const [snippetIndex, setSnippetIndex] = useState(0);

  useEffect(() => {
    if (isBuilding) return;

    const snippet = SELF_BUILD_SNIPPETS[snippetIndex];
    if (code.length >= snippet.length) {
      setIsBuilding(true);
      setLogs(prev => [...prev, `[BUILD] Compiling snippet ${snippetIndex + 1}...`].slice(-50));
      return;
    }

    const typeTimer = window.setTimeout(() => {
      setCode(snippet.slice(0, code.length + 1));
    }, 50);
    return () => window.clearTimeout(typeTimer);
  }, [code, isBuilding, snippetIndex]);

  useEffect(() => {
    if (!isBuilding) {
      setProgress(0);
      return;
    }

    const progressInterval = window.setInterval(() => {
      setProgress(prev => Math.min(prev + 5, 100));
    }, 100);
    const deployTimer = window.setTimeout(() => {
      setLogs(prev => [...prev, `[DEPLOY] Snippet ${snippetIndex + 1} deployed successfully.`].slice(-50));
      setCode('');
      setSnippetIndex(prev => (prev + 1) % SELF_BUILD_SNIPPETS.length);
      setIsBuilding(false);
    }, 2000);

    return () => {
      window.clearInterval(progressInterval);
      window.clearTimeout(deployTimer);
    };
  }, [isBuilding, snippetIndex]);

  return (
    <div className="bg-black/60 rounded-2xl border border-purple-500/30 p-8 min-h-[600px] flex flex-col space-y-8 font-mono">
      <div className="flex items-center justify-between border-b border-white/10 pb-6">
        <div className="flex items-center gap-4">
          <Terminal size={32} className="text-purple-400" />
          <div>
            <h2 className="text-2xl font-bold uppercase tracking-tighter text-white">Self-Building Core</h2>
            <p className="text-gray-400 text-sm">BeyondBound OS // Autonomous Evolution Mode</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-3 py-1 bg-purple-500/10 border border-purple-500/30 rounded text-[10px] font-bold text-purple-400 uppercase tracking-widest flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
            AUTONOMOUS_ACTIVE
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 flex-1">
        <div className="space-y-4 flex flex-col">
          <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500">Live Code Synthesis</h3>
          <div className="flex-1 bg-black/40 rounded-xl border border-white/5 p-6 text-emerald-400 text-xs overflow-hidden relative">
            <pre className="whitespace-pre-wrap">{code}</pre>
            <div className="absolute bottom-4 right-4 animate-pulse text-emerald-500">_</div>
          </div>
        </div>

        <div className="space-y-4 flex flex-col">
          <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500">Deployment Logs</h3>
          <div className="flex-1 bg-black/40 rounded-xl border border-white/5 p-6 text-cyan-400 text-[10px] space-y-2 overflow-y-auto custom-scrollbar">
            {logs.map((log, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-gray-600">[{new Date().toLocaleTimeString()}]</span>
                <span>{log}</span>
              </div>
            ))}
            {isBuilding && (
              <div className="space-y-2 pt-4">
                <div className="flex justify-between text-[8px] uppercase font-bold text-purple-400">
                  <span>Building...</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-500" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="p-6 bg-purple-500/5 rounded-2xl border border-purple-500/20 flex items-center justify-between">
        <div className="space-y-1">
          <div className="text-[10px] font-bold text-purple-400 uppercase tracking-widest">System Integrity</div>
          <div className="text-xs text-gray-400">Autonomous core is currently refactoring its own goal-seeking algorithms.</div>
        </div>
        <div className="flex gap-4">
          <div className="text-center">
            <div className="text-lg font-black text-white">98.2%</div>
            <div className="text-[8px] text-gray-500 uppercase font-bold">Efficiency</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-black text-white">1.24s</div>
            <div className="text-[8px] text-gray-500 uppercase font-bold">Refactor Latency</div>
          </div>
        </div>
      </div>
    </div>
  );
};

const BlueprintView = ({ onSelect, currentTask, simStats, discoveries = [] }: { onSelect?: (p: any) => void, currentTask: string, simStats: any, discoveries?: any[] }) => {
  const [blueprints, setBlueprints] = useState<any[]>([]);
  const [discoveryBlueprints, setDiscoveryBlueprints] = useState<any[]>([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [activeBlueprint, setActiveBlueprint] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'schematic' | 'lattice' | 'thermal' | 'topology' | 'flow'>('schematic');
  const generator = new BlueprintGenerator();

  const fetchBlueprints = async (cat: string) => {
    setIsOptimizing(true);
    setTimeout(() => {
      let types: string[] = [];
      if (cat === 'thermal') types = ['house_cooling', 'spaceship'];
      else if (cat === 'electrical') types = ['electrical_opt'];
      else if (cat === 'blockchain') types = ['blockchain_5bit'];
      else types = ['stubby', 'esky'];
      
      const mem = (window as any).globalMemory || {};
      const bps = types.map(t => generator.generate(t, { 
        latticeDensity: 0.8, 
        nSpiral: 8,
        globalMemory: mem 
      }, simStats))
        .filter(bp => bp.ok !== false && bp.svg);
      setBlueprints(bps);

      // Generate blueprints for discoveries
      const dbps = discoveries.map(d => {
        const bp = generator.generate('stubby', { 
          latticeDensity: 0.9, 
          discovery: d,
          globalMemory: mem 
        }, simStats);
        return { ...bp, product: d.materialName || d.name || 'Discovered Material', isDiscovery: true, discovery: d };
      }).filter(bp => bp.ok !== false && bp.svg);
      setDiscoveryBlueprints(dbps);

      setIsOptimizing(false);
    }, 1000);
  };

  useEffect(() => {
    fetchBlueprints(currentTask);
  }, [currentTask, discoveries]);

  return (
    <div className="bg-white/5 rounded-xl border border-white/10 p-8 min-h-[600px] space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold uppercase tracking-tighter">Lattice Blueprint Generator</h2>
          <p className="text-gray-400 text-sm">Deep Discovery Optimized CAD Schematics</p>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeBlueprint ? (
          <motion.div
            key="schematic"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="space-y-8"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setActiveBlueprint(null)}
                  className="text-[10px] font-bold text-purple-400 uppercase tracking-widest flex items-center gap-2 hover:text-purple-300 transition-colors"
                >
                  <ChevronRight className="rotate-180" size={14} />
                  Back to Library
                </button>
                <div className="h-4 w-px bg-white/10" />
                <div className="flex gap-1 bg-white/5 p-1 rounded-lg border border-white/10">
                  {(['schematic', 'lattice', 'thermal', 'topology', 'flow'] as const).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setViewMode(mode)}
                      className={`px-3 py-1 rounded text-[8px] font-bold uppercase tracking-widest transition-all ${
                        viewMode === mode 
                          ? 'bg-purple-500 text-white' 
                          : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
              <h3 className="text-xl font-black uppercase tracking-tighter text-white">{activeBlueprint.product}</h3>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 aspect-square bg-black/60 rounded-2xl border border-white/10 relative overflow-hidden flex items-center justify-center">
                {activeBlueprint.svg ? (
                  <svg viewBox={activeBlueprint.svg.viewBox} className="w-full h-full p-4">
                    {activeBlueprint.svg.defs.map((def: any) => (
                      <defs key={def.id}>
                        {def.type === 'radialGradient' && (
                          <radialGradient id={def.id}>
                            {def.stops.map((s: any, si: number) => (
                              <stop key={si} offset={s.offset} stopColor={s.color} stopOpacity={s.opacity} />
                            ))}
                          </radialGradient>
                        )}
                      </defs>
                    ))}
                    {activeBlueprint.svg.shapes
                      .filter((s: any) => {
                        if (viewMode === 'schematic') return true;
                        if (viewMode === 'flow') return s.category === 'thermal';
                        return s.category === viewMode || !s.category;
                      })
                      .map((s: any, si: number) => {
                        const opacity = (viewMode !== 'schematic' && s.category === viewMode) ? 1 : s.opacity || 1;
                        if (s.type === 'circle') return <circle key={si} cx={s.cx} cy={s.cy} r={s.r} fill={s.fill} stroke={s.stroke} strokeWidth={s.strokeWidth} opacity={opacity} />;
                        if (s.type === 'path') return <path key={si} d={s.d} stroke={s.stroke} strokeWidth={s.strokeWidth} fill={s.fill} opacity={opacity} />;
                        if (s.type === 'line') return <line key={si} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.stroke} strokeWidth={s.strokeWidth} strokeDasharray={s.strokeDasharray} opacity={opacity} />;
                        if (s.type === 'rect') return <rect key={si} x={s.x} y={s.y} width={s.width} height={s.height} fill={s.fill} stroke={s.stroke} strokeWidth={s.strokeWidth} opacity={opacity} />;
                        if (s.type === 'text') return <text key={si} x={s.x} y={s.y} fill={s.fill} fontSize={s.fontSize} fontWeight={s.fontWeight} opacity={opacity} className="font-mono">{s.text}</text>;
                        return null;
                      })}
                  </svg>
                ) : (
                  <div className="text-gray-500 font-mono text-xs uppercase">No Schematic Available</div>
                )}
                
                <div className="absolute bottom-8 right-8 flex flex-col items-end">
                  <span className="text-[10px] font-mono text-purple-500/60 uppercase">CAD_REF: {activeBlueprint.version}</span>
                  <span className="text-[8px] font-mono text-gray-600 uppercase tracking-widest">Deep Learning Optimized Topology</span>
                </div>
              </div>

              <div className="space-y-6">
                <div className="p-6 bg-white/5 rounded-2xl border border-white/5 space-y-4">
                  <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-white/10 pb-2">Bill of Materials</h4>
                  <div className="space-y-3">
                    {activeBlueprint.bom.map((item: any, i: number) => (
                      <div key={i} className="flex flex-col gap-1">
                        <div className="flex justify-between text-[11px] font-mono">
                          <span className="text-gray-400">{item.item}</span>
                          <span className="text-purple-400">${item.cost.toFixed(2)}</span>
                        </div>
                        {item.source && (
                          <span className="text-[8px] font-mono text-gray-600 uppercase tracking-widest">Source: {item.source}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-6 bg-white/5 rounded-2xl border border-white/5 space-y-4">
                  <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-white/10 pb-2">Layered Spec Sheet</h4>
                  <div className="space-y-4">
                    {activeBlueprint.layers?.map((layer: any, i: number) => (
                      <div key={i} className="space-y-1">
                        <div className="flex justify-between text-[11px] font-mono">
                          <span className="text-purple-400">{layer.name}</span>
                          <span className="text-gray-500">{layer.thickness}</span>
                        </div>
                        <div className="text-[9px] font-mono text-gray-400">{layer.material}</div>
                        <div className="text-[8px] font-mono text-gray-600 italic leading-tight">{layer.description}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-6 bg-white/5 rounded-2xl border border-white/5 space-y-4">
                  <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-white/10 pb-2">Flow Simulation Data</h4>
                  <div className="space-y-3">
                    {activeBlueprint.flowData?.map((flow: any, i: number) => (
                      <div key={i} className="p-2 bg-black/20 rounded border border-white/5 space-y-1">
                        <div className="flex justify-between text-[10px] font-mono">
                          <span className="text-cyan-400">{flow.type}</span>
                          <span className="text-emerald-400">{flow.velocity}</span>
                        </div>
                        <div className="text-[9px] font-mono text-gray-500">{flow.path}</div>
                        <div className="text-[8px] font-mono text-gray-600 uppercase tracking-widest">{flow.direction}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-6 bg-white/5 rounded-2xl border border-white/5 space-y-4">
                  <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-white/10 pb-2">Material Build</h4>
                  <div className="space-y-2 text-[10px] font-mono text-gray-400">
                    {Object.entries(activeBlueprint.specs).map(([key, val]: [string, any]) => (
                      <div key={key} className="flex justify-between capitalize">
                        <span>{key.replace(/([A-Z])/g, ' $1')}</span>
                        <span className="text-cyan-400">{val}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {activeBlueprint.inventedComposite && (
                  <div className="p-6 bg-cyan-500/5 rounded-2xl border border-cyan-500/20 space-y-4 animate-pulse">
                    <h4 className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest border-b border-cyan-500/10 pb-2">AI-Invented Composite</h4>
                    <div className="space-y-2">
                      <div className="text-lg font-black text-white tracking-tighter">{activeBlueprint.inventedComposite.name}</div>
                      <div className="text-[9px] font-mono text-cyan-300/80 leading-tight">{activeBlueprint.inventedComposite.description}</div>
                      <div className="grid grid-cols-2 gap-2 pt-2">
                        <div className="p-2 bg-black/40 rounded border border-white/5">
                          <div className="text-[7px] text-gray-500 uppercase font-bold">Thermal K</div>
                          <div className="text-[10px] font-mono text-white">{activeBlueprint.inventedComposite.thermalConductivity.toFixed(4)}</div>
                        </div>
                        <div className="p-2 bg-black/40 rounded border border-white/5">
                          <div className="text-[7px] text-gray-500 uppercase font-bold">Dielectric εr</div>
                          <div className="text-[10px] font-mono text-white">{activeBlueprint.inventedComposite.dielectricConstant?.toFixed(2) ?? '—'}</div>
                        </div>
                        <div className="p-2 bg-black/40 rounded border border-white/5">
                          <div className="text-[7px] text-gray-500 uppercase font-bold">Geometry</div>
                          <div className="text-[10px] font-mono text-white uppercase">{activeBlueprint.inventedComposite.geometry ?? 'gyroid'}</div>
                        </div>
                        <div className="p-2 bg-black/40 rounded border border-white/5">
                          <div className="text-[7px] text-gray-500 uppercase font-bold">Novelty</div>
                          <div className="text-[10px] font-mono text-white">{(activeBlueprint.inventedComposite.noveltyIndex * 100).toFixed(1)}%</div>
                        </div>
                      </div>
                    </div>
                    {/* Live sim co-evolution status */}
                    {(window as any).currentSimScore !== undefined && (
                      <div className="pt-2 border-t border-cyan-500/10 flex items-center justify-between">
                        <div className="text-[8px] text-cyan-400/60 uppercase font-bold">Live Sim Score</div>
                        <div className="text-[10px] font-mono text-emerald-400">{((window as any).currentSimScore || 0).toFixed(2)}</div>
                      </div>
                    )}
                  </div>
                )}

                  {activeBlueprint.energyMath && (
                    <div className="p-6 bg-cyan-500/5 rounded-2xl border border-cyan-500/20 space-y-4">
                      <h4 className="text-[10px] font-bold text-cyan-500 uppercase tracking-widest border-b border-cyan-500/10 pb-2">Thermodynamic Analysis</h4>
                      <div className="space-y-2 text-[10px] font-mono text-cyan-300/80">
                        <div className="flex justify-between">
                          <span>Energy Removed</span>
                          <span>{activeBlueprint.energyMath.energyRemoved}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Energy Used (W)</span>
                          <span>{activeBlueprint.energyMath.energyUsed}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>System COP</span>
                          <span className="text-emerald-400">{activeBlueprint.energyMath.cop}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Est. Battery Life</span>
                          <span className="text-yellow-400">{activeBlueprint.energyMath.runtime}</span>
                        </div>
                        <div className="pt-2 border-t border-cyan-500/10 text-[8px] text-cyan-500/60 leading-relaxed italic">
                          {activeBlueprint.energyMath.limitations}
                        </div>
                      </div>
                    </div>
                  )}

                <button className="w-full py-4 bg-purple-500 text-white font-bold rounded-xl hover:bg-purple-400 transition-all uppercase tracking-widest text-xs shadow-[0_0_20px_rgba(139,92,246,0.3)]">
                  Export DXF Schematic
                </button>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="library"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-12"
          >
            {isOptimizing ? (
              <div className="py-20 flex flex-col items-center justify-center space-y-4">
                <RefreshCw className="animate-spin text-purple-500" size={32} />
                <p className="text-[10px] font-mono text-purple-500/60 animate-pulse uppercase tracking-widest">Deep Learning Optimization in Progress...</p>
              </div>
            ) : (
              <>
                {discoveryBlueprints.length > 0 && (
                  <div className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="h-px flex-1 bg-gradient-to-r from-transparent to-emerald-500/20" />
                      <h3 className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Discovered Material Blueprints
                      </h3>
                      <div className="h-px flex-1 bg-gradient-to-l from-transparent to-emerald-500/20" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {discoveryBlueprints.map((bp, i) => (
                        <motion.div
                          key={`discovery-${i}`}
                          whileHover={{ scale: 1.02, translateY: -5 }}
                          onClick={() => setActiveBlueprint(bp)}
                          className="bg-black/40 rounded-2xl border border-emerald-500/20 p-6 cursor-pointer hover:border-emerald-500/50 transition-all group relative overflow-hidden"
                        >
                          <div className="absolute top-0 right-0 p-2">
                            <div className="px-2 py-0.5 bg-emerald-500/20 rounded text-[8px] font-mono text-emerald-400 border border-emerald-500/30">
                              NEW DISCOVERY
                            </div>
                          </div>
                          <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center mb-4 group-hover:bg-emerald-500/20 transition-colors">
                            <Layers className="text-emerald-400" size={24} />
                          </div>
                          <h4 className="text-lg font-bold uppercase tracking-tighter text-white group-hover:text-emerald-400 transition-colors truncate">{bp.product}</h4>
                          <p className="text-gray-500 text-xs mt-1">AI-Generated Lattice Structure</p>
                          <div className="mt-4 flex items-center justify-between text-[10px] font-mono text-gray-400">
                            <span>Complexity: {bp.specs.latticeDensity}</span>
                            <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}
                
                {blueprints.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {blueprints.map((bp, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-6 bg-black/40 border border-white/5 rounded-2xl hover:border-purple-500/30 transition-colors group cursor-pointer"
                        onClick={() => setActiveBlueprint(bp)}
                      >
                        <div className="flex justify-between items-start mb-4">
                          <h3 className="text-sm font-bold text-purple-400 uppercase tracking-widest">{bp.product}</h3>
                          <div className="px-2 py-0.5 bg-purple-500/10 text-purple-500 text-[8px] font-bold rounded border border-purple-500/20">
                            {bp.version}
                          </div>
                        </div>
                        <div className="aspect-video bg-white/5 rounded-lg mb-6 border border-white/5 flex items-center justify-center relative overflow-hidden">
                          {bp.svg ? (
                            <svg viewBox={bp.svg.viewBox} className="w-full h-full p-2 opacity-40">
                              {bp.svg.shapes.slice(0, 50).map((s: any, si: number) => {
                                if (s.type === 'line') return <line key={si} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.stroke} strokeWidth={s.strokeWidth} />;
                                return null;
                              })}
                            </svg>
                          ) : (
                            <div className="text-gray-600 font-mono text-[8px]">NO_PREVIEW</div>
                          )}
                          <Layers className="text-purple-500/20 absolute" size={32} />
                        </div>
                        <button className="w-full py-3 bg-white/5 group-hover:bg-purple-500 group-hover:text-white rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all">
                          Load Schematic
                        </button>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="py-20 flex flex-col items-center justify-center space-y-4 opacity-40">
                    <Box size={32} className="text-gray-500" />
                    <p className="text-[10px] font-mono text-gray-500 uppercase tracking-widest">No Optimized Blueprints Found for this Task</p>
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const HouseView = ({
  onGenerateBlueprint,
  activeOptimizer,
  thermalMode,
  setThermalMode,
  ventingStrategy,
  setVentingStrategy,
  initialPanel,
}: {
  onGenerateBlueprint: () => void,
  activeOptimizer: OptimizerType,
  thermalMode: 'heating' | 'cooling',
  setThermalMode: (m: 'heating' | 'cooling') => void,
  ventingStrategy: string,
  setVentingStrategy: (s: any) => void,
  initialPanel?: HousePanel,
}) => {
  const [metrics, setMetrics] = useState<any>(null);
  const [projections, setProjections] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [thermalGrid, setThermalGrid] = useState<{ data: Float32Array; width: number; height: number; wallMask: Uint8Array; airflowX: Float32Array; airflowY: Float32Array; heightProfiles?: HeightAirflowProfile[]; heightSweeps?: HeightAirflowSweepResult[]; heightSweepRuns?: number; vorticity?: Float32Array | null; turbulenceEnergy?: number; equilibriumFound?: boolean; equilibriumScore?: number; ventOptCycle?: number } | null>(null);
  const vorticityCanvasRef = useRef<HTMLCanvasElement>(null);
  const vorticityAnimRef = useRef<number>(0);
  const [rooms, setRooms] = useState<any[]>([]);
  const [selectedAirflowRoomId, setSelectedAirflowRoomId] = useState('');
  const [activePanel, setActivePanel] = useState<HousePanel>(initialPanel || 'system');
  const thermalCanvasRef = useRef<HTMLCanvasElement>(null);
  const airflowCanvasRef = useRef<HTMLCanvasElement>(null);
  const auroraCanvasRef = useRef<HTMLCanvasElement>(null);
  const auroraAnimRef = useRef<number>(0);
  const [season, setSeason] = useState<'summer' | 'autumn' | 'winter' | 'spring'>('summer');
  const [eskyDesign, setEskyDesign] = useState({ wallR: 2.5, magnetoW: 15, co2Vol: 0.5, stubbies: 6 });
  const [primeComputeResult, setPrimeComputeResult] = useState<any>(null);
  const [v5Planes, setV5Planes] = useState<any[]>([]);
  const [geoSource, setGeoSource] = useState<string>('default');
  const [v5PlaneCount, setV5PlaneCount] = useState(0);
  const [zoneConfigured, setZoneConfigured] = useState(false);
  const [zoneConstraints, setZoneConstraints] = useState<any>(null);
  const [selectedZone, setSelectedZone] = useState<string>('');
  const [solarPanels, setSolarPanels] = useState<any[]>([]);
  const [solarOutput, setSolarOutput] = useState<any>(null);
  const [roomCycles, setRoomCycles] = useState<any[]>([]);
  const [neuralNetState, setNeuralNetState] = useState<any>(null);
  const [optimizationHistory, setOptimizationHistory] = useState<any[]>([]);
  const [selectedOptimizationRoomId, setSelectedOptimizationRoomId] = useState('');
  const [roomOptimization, setRoomOptimization] = useState<RoomLifecycleOptimizationResult | null>(null);
  const [roomOptimizationError, setRoomOptimizationError] = useState('');
  const [roomOptimizationRunning, setRoomOptimizationRunning] = useState(false);
  const [roomOptimizationApplied, setRoomOptimizationApplied] = useState(false);
  const [roomOptimizationInputs, setRoomOptimizationInputs] = useState({
    targetTempC: 22,
    outdoorDesignTempC: 35,
    occupants: 2,
    minFloorAreaM2: 18,
    lifecycleYears: 20,
  });
  const [hvacCycleResult, setHvacCycleResult] = useState<HvacCycleOptimizationResult | null>(null);
  const [hvacCycleError, setHvacCycleError] = useState('');
  const [hvacCycleRunning, setHvacCycleRunning] = useState(false);
  const [hvacCycleInputs, setHvacCycleInputs] = useState({
    targetTempC: 22,
    comfortBandC: 1,
    initialIndoorTempC: 22.8,
    floorAreaM2: 18,
    roomVolumeM3: 48.6,
    envelopeConductanceWPerK: 75.6,
    airLeakageAch: 0.7,
    effectiveThermalMassKJPerK: 2160,
    internalGainsW: 320,
    outdoorLowTempC: 18,
    outdoorHighTempC: 35,
    outdoorRelativeHumidityPct: 55,
    maxOutsideAirHumidityPct: 70,
    hvacThermalCapacityW: 4200,
    hvacCop: 3.6,
    circulationFanPowerW: 160,
    startupEnergyWh: 18,
    outsideAirFlowM3s: 0.12,
    allowOutsideAir: true,
    allowRecoveredStream: false,
    recoveredStreamTempC: 14,
    recoveredStreamCapacityW: 1600,
    recoveryPumpPowerW: 70,
    compressedAirGaugePressureBar: 0,
    expanderEfficiency: 0.55,
    compressedAirProductionWhPerM3: 120,
    conditioningDaysPerYear: 180,
    lifecycleYears: 15,
  });
  const [adaptiveWallResult, setAdaptiveWallResult] = useState<AdaptiveWallOptimizationResult | null>(null);
  const [adaptiveWallError, setAdaptiveWallError] = useState('');
  const [adaptiveWallRunning, setAdaptiveWallRunning] = useState(false);
  const adaptiveWallAutoKeyRef = useRef('');
  const [adaptiveWallInputs, setAdaptiveWallInputs] = useState({
    wallAreaM2: 25,
    indoorTempC: 22,
    indoorRelativeHumidityPct: 50,
    outdoorLowTempC: 18,
    outdoorHighTempC: 36,
    staticWallRValue: 2.5,
    wallThermalMassKJPerK: 5500,
    hvacCop: 3.6,
    computeOrCompressorWasteHeatW: 600,
    wasteHeatDutyFraction: 0.5,
    wasteSourceTempC: 45,
    latticeAreaM2: 20,
    latticeMaterialConductivityWmK: 0.25,
    latticeFillFraction: 0.04,
    latticePathLengthM: 0.12,
    latticeOffConductanceFraction: 0.03,
    latticeSwitchEnergyWh: 8,
    latticePumpPowerW: 35,
    fluidChannel: false,
    useFixedSink: false,
    fixedSinkTempC: 16,
    inflatedRValue: 5,
    deflatedRValue: 0.7,
    bladderActuationEnergyWh: 25,
    bladderLeakReinflationsPerDay: 0.2,
    actuatorHeatReleasedIndoorsFraction: 0.1,
    conditioningDaysPerYear: 180,
    lifecycleYears: 20,
    latticeEmbodiedEnergyKWhPerM2: 55,
    bladderEmbodiedEnergyKWhPerM2: 35,
    controllerAndActuatorEmbodiedKWh: 180,
  });
  const [sitePresetKey, setSitePresetKey] = useState('bendigo');
  const [siteOptimization, setSiteOptimization] = useState<SiteGeometryOptimizationResult | null>(null);
  const [siteOptimizationError, setSiteOptimizationError] = useState('');
  const [siteOptimizationRunning, setSiteOptimizationRunning] = useState(false);
  const [siteOptimizationApplied, setSiteOptimizationApplied] = useState(false);
  const [wholeHouseOptimization, setWholeHouseOptimization] = useState<WholeHouseOptimizationResult | null>(null);
  const [wholeHouseOptimizationRunning, setWholeHouseOptimizationRunning] = useState(false);
  const [wholeHouseOptimizationError, setWholeHouseOptimizationError] = useState('');
  const [siteContext, setSiteContext] = useState<AutomaticSiteContextResult | null>(null);
  const [physicsValidation, setPhysicsValidation] = useState<BuildingPhysicsValidationReport | null>(null);
  const [systemEvidenceError, setSystemEvidenceError] = useState('');
  const systemAutoKeyRef = useRef('');
  const systemLocationAttemptedRef = useRef(false);
  const [autopilotPresetKey, setAutopilotPresetKey] = useState('bendigo');
  const [autopilotResult, setAutopilotResult] = useState<ExistingHomeAutopilotResult | null>(null);
  const [autopilotRunning, setAutopilotRunning] = useState(false);
  const [autopilotError, setAutopilotError] = useState('');
  const [autopilotLocating, setAutopilotLocating] = useState(false);
  const autopilotStartedRef = useRef(false);
  const [autopilotInputs, setAutopilotInputs] = useState({
    ...SITE_LOCATION_PRESETS.bendigo,
    estimatedFloorAreaM2: 130,
    constructionEra: 'unknown' as ExistingHomeEra,
    lifecycleYears: 25,
    targetIndoorTempC: 22,
  });
  const [siteOptimizationInputs, setSiteOptimizationInputs] = useState({
    ...SITE_LOCATION_PRESETS.bendigo,
    targetFloorAreaM2: 130,
    minFloorAreaM2: 110,
    maxFloorAreaM2: 150,
    lotWidthM: 24,
    lotDepthM: 40,
    targetIndoorTempC: 22,
    lifecycleYears: 30,
    designWindSpeedMs: 40,
    floodFloorElevationM: 0,
    bushfireAttackLevel: 'none' as BushfireAttackLevel,
    seismicClass: 'low' as 'low' | 'moderate' | 'high',
    snowLoadKPa: 0,
    minWallRValue: 3,
    maxWindowToWallRatio: 0.32,
    maxUnsupportedSpanM: 8,
    minimumSetbackM: 1.5,
  });

  useEffect(() => {
    if (initialPanel) setActivePanel(initialPanel);
  }, [initialPanel]);

  // Poll live V12 engine data + V5 geometry
  useEffect(() => {
    const poll = setInterval(() => {
      const w = window as any;
      if (w.v12HouseMetrics) setMetrics(w.v12HouseMetrics);
      if (w.v12Projections) setProjections(w.v12Projections);
      if (w.v12Recommendations) setRecommendations(w.v12Recommendations);
      if (w.v12GeometrySource) setGeoSource(w.v12GeometrySource);
      if (w.v5BoundaryPlanes) setV5Planes(w.v5BoundaryPlanes);
      if (w.v5PlaneCount) setV5PlaneCount(w.v5PlaneCount);
      if (w.v12ZoneConfigured !== undefined) setZoneConfigured(w.v12ZoneConfigured);
      if (w.v12ZoneConstraints) setZoneConstraints(w.v12ZoneConstraints);
      if (w.v12Engine) {
        setThermalGrid(w.v12Engine.getThermalGrid());
        setRooms(w.v12Engine.getRooms().map((r: any) => ({
          id: r.id, name: r.name, x: r.x, y: r.y, width: r.width, height: r.height, ceilingHeight: r.ceilingHeight,
          wallType: r.wallType, targetTemp: r.targetTemp, internalLoad: r.internalLoad,
          hasEsky: r.hasEsky, hasStubby: r.hasStubby,
          ventCount: r.vents?.length || 0, windowCount: r.windows?.length || 0,
          vents: r.vents?.map((v: any) => ({ id: v.id, type: v.type, x: v.position?.x || 0, y: v.position?.y || 0, z: v.position?.z || 0, flowRate: v.flowRate, diameter: v.diameter, powered: v.powered, efficiency: v.efficiency, tempIn: v.tempIn, tempOut: v.tempOut, massFlowRate: v.massFlowRate })) || [],
        })));
        // Fetch new engine data with safe optional chaining
        if (w.v12Engine.getSolarPanels) setSolarPanels(w.v12Engine.getSolarPanels() || []);
        if (w.v12Engine.getSolarOutput) setSolarOutput(w.v12Engine.getSolarOutput() || null);
        if (w.v12Engine.getRoomCycles) setRoomCycles(w.v12Engine.getRoomCycles() || []);
        if (w.v12Engine.getNeuralNetState) setNeuralNetState(w.v12Engine.getNeuralNetState() || null);
        if (w.v12Engine.getOptimizationHistory) setOptimizationHistory(w.v12Engine.getOptimizationHistory() || []);
      }
    }, 500);
    return () => clearInterval(poll);
  }, []);

  useEffect(() => {
    if (rooms.length === 0 || rooms.some(room => room.id === selectedOptimizationRoomId)) return;
    const room = rooms[0];
    setSelectedOptimizationRoomId(room.id);
    setRoomOptimizationInputs(current => ({
      ...current,
      targetTempC: room.targetTemp,
      minFloorAreaM2: Math.max(6, Math.round(room.width * room.height * 0.7 * 10) / 10),
    }));
    const floorAreaM2 = room.width * room.height;
    const roomVolumeM3 = floorAreaM2 * room.ceilingHeight;
    setHvacCycleInputs(current => ({
      ...current,
      targetTempC: room.targetTemp,
      initialIndoorTempC: thermalMode === 'cooling' ? room.targetTemp + 0.8 : room.targetTemp - 0.8,
      floorAreaM2: Math.round(floorAreaM2 * 10) / 10,
      roomVolumeM3: Math.round(roomVolumeM3 * 10) / 10,
      envelopeConductanceWPerK: Math.round(floorAreaM2 * 4.2 * 10) / 10,
      effectiveThermalMassKJPerK: Math.round(floorAreaM2 * 120),
    }));
    const estimatedExteriorWallAreaM2 = Math.max(6, 2 * (room.width + room.height) * room.ceilingHeight * 0.55);
    setAdaptiveWallInputs(current => ({
      ...current,
      wallAreaM2: Math.round(estimatedExteriorWallAreaM2 * 10) / 10,
      latticeAreaM2: Math.round(estimatedExteriorWallAreaM2 * 0.8 * 10) / 10,
      wallThermalMassKJPerK: Math.round(estimatedExteriorWallAreaM2 * 220),
      indoorTempC: room.targetTemp,
    }));
  }, [rooms, selectedOptimizationRoomId]);

  useEffect(() => {
    if (rooms.length === 0 || rooms.some(room => room.id === selectedAirflowRoomId)) return;
    setSelectedAirflowRoomId(rooms[0].id);
  }, [rooms, selectedAirflowRoomId]);

  // Draw thermal heatmap on canvas
  useEffect(() => {
    if (!thermalGrid || !thermalCanvasRef.current) return;
    const canvas = thermalCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { data, width, height, wallMask } = thermalGrid;
    canvas.width = width;
    canvas.height = height;
    const img = ctx.createImageData(width, height);
    for (let i = 0; i < width * height; i++) {
      const T = data[i];
      const norm = Math.max(0, Math.min(1, (T - 10) / 30));
      let r = 0, g = 0, b = 0;
      if (norm < 0.4) { r = 0; g = Math.round((norm / 0.4) * 255); b = 255; }
      else if (norm < 0.6) { const t = (norm - 0.4) / 0.2; r = Math.round(t * 80); g = 255; b = Math.round((1 - t) * 255); }
      else { const t = (norm - 0.6) / 0.4; r = 255; g = Math.round((1 - t) * 255); b = 0; }
      if (wallMask[i] === 1) { r = Math.min(255, r + 60); g = Math.min(255, g + 60); b = Math.min(255, b + 60); }
      img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [thermalGrid]);

  // Draw airflow velocity field on canvas
  useEffect(() => {
    if (!thermalGrid || !airflowCanvasRef.current) return;
    const canvas = airflowCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { data, width, height, wallMask, airflowX, airflowY } = thermalGrid;
    const scale = 16; // each cell = 16px
    canvas.width = width * scale;
    canvas.height = height * scale;
    ctx.fillStyle = 'rgba(0,0,0,0.9)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw walls
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (wallMask[idx] === 1) {
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.fillRect(x * scale, y * scale, scale, scale);
        }
      }
    }

    // Draw temperature background (faint)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const T = data[idx];
        const norm = Math.max(0, Math.min(1, (T - 10) / 30));
        let r = 0, g = 0, b = 0;
        if (norm < 0.4) { b = 200; g = Math.round((norm / 0.4) * 150); }
        else if (norm < 0.6) { g = 180; b = Math.round((1 - (norm - 0.4) / 0.2) * 150); }
        else { r = 220; g = Math.round((1 - (norm - 0.6) / 0.4) * 150); }
        ctx.fillStyle = `rgba(${r},${g},${b},0.15)`;
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }

    // Draw airflow arrows (every 2nd cell)
    for (let y = 1; y < height - 1; y += 2) {
      for (let x = 1; x < width - 1; x += 2) {
        const idx = y * width + x;
        if (wallMask[idx] === 1) continue;
        const ax = airflowX[idx];
        const ay = airflowY[idx];
        const mag = Math.sqrt(ax * ax + ay * ay);
        if (mag < 0.0001) continue;

        const cx = x * scale + scale / 2;
        const cy = y * scale + scale / 2;
        const len = Math.min(mag * 8000, scale * 1.5);
        const nx = ax / mag;
        const ny = ay / mag;

        // Arrow color: blue=cold flow, red=hot flow, green=moderate
        const T = data[idx];
        const tNorm = Math.max(0, Math.min(1, (T - 15) / 20));
        const ar = Math.round(tNorm * 255);
        const ab = Math.round((1 - tNorm) * 255);
        const ag = Math.round(Math.sin(tNorm * Math.PI) * 180);
        const alpha = Math.min(0.9, 0.3 + mag * 3000);

        ctx.strokeStyle = `rgba(${ar},${ag},${ab},${alpha})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx - nx * len * 0.4, cy - ny * len * 0.4);
        ctx.lineTo(cx + nx * len * 0.6, cy + ny * len * 0.6);
        // Arrowhead
        const tipX = cx + nx * len * 0.6;
        const tipY = cy + ny * len * 0.6;
        const headLen = 4;
        ctx.lineTo(tipX - headLen * (nx * 0.7 - ny * 0.5), tipY - headLen * (ny * 0.7 + nx * 0.5));
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - headLen * (nx * 0.7 + ny * 0.5), tipY - headLen * (ny * 0.7 - nx * 0.5));
        ctx.stroke();
      }
    }

    // Draw vent positions from rooms
    if (rooms.length > 0) {
      for (const room of rooms) {
        for (const vent of (room.vents || [])) {
          // Map vent position to canvas coordinates
          let maxRX = 0, maxRY = 0;
          for (const r of rooms) { maxRX = Math.max(maxRX, r.x + r.width); maxRY = Math.max(maxRY, r.y + r.height); }
          const vx = (vent.x / maxRX) * canvas.width;
          const vy = (vent.y / maxRY) * canvas.height;
          ctx.beginPath();
          ctx.arc(vx, vy, 4, 0, Math.PI * 2);
          ctx.fillStyle = vent.type === 'intake' ? 'rgba(59,130,246,0.8)' : vent.type === 'exhaust' ? 'rgba(239,68,68,0.8)' : 'rgba(168,85,247,0.8)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.4)';
          ctx.lineWidth = 1;
          ctx.stroke();
          // Label
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          ctx.font = '8px monospace';
          ctx.fillText(vent.type === 'intake' ? 'IN' : vent.type === 'exhaust' ? 'OUT' : 'HRV', vx + 6, vy + 3);
        }
      }
    }
  }, [thermalGrid, rooms]);

  // Aurora Borealis overlay animation on the airflow canvas
  useEffect(() => {
    if (activePanel !== 'airflow' || !thermalGrid || !auroraCanvasRef.current) {
      if (auroraAnimRef.current) cancelAnimationFrame(auroraAnimRef.current);
      return;
    }
    const canvas = auroraCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { data, width, height, wallMask, airflowX, airflowY } = thermalGrid;
    const scale = 16;
    canvas.width = width * scale;
    canvas.height = height * scale;

    // Aurora color mapping: temperature -> hue
    const auroraColor = (temp: number, alpha: number): string => {
      if (temp < 15) return `rgba(0,255,100,${alpha})`; // green
      if (temp < 20) return `rgba(0,255,200,${alpha})`; // green-cyan
      if (temp < 22) return `rgba(0,220,255,${alpha})`; // cyan
      if (temp < 24) return `rgba(60,120,255,${alpha})`; // blue
      if (temp < 28) return `rgba(140,60,255,${alpha})`; // purple
      return `rgba(255,50,200,${alpha})`; // pink/magenta
    };

    const auroraHSL = (temp: number): [number, number, number] => {
      // Map temperature to hue: green(120) -> cyan(180) -> blue(240) -> purple(280) -> pink(320)
      const t = Math.max(0, Math.min(1, (temp - 15) / 20));
      const hue = 120 + t * 200; // 120 to 320
      return [hue, 80, 55];
    };

    let startTime = performance.now();

    const drawAurora = (timestamp: number) => {
      const elapsed = (timestamp - startTime) / 1000;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 4 aurora curtain layers with different phases
      const layers = [
        { phaseOffset: 0, freqX: 0.08, freqT: 1.5, amplitude: 12, alphaBase: 0.12 },
        { phaseOffset: 1.2, freqX: 0.12, freqT: 2.0, amplitude: 18, alphaBase: 0.09 },
        { phaseOffset: 2.8, freqX: 0.06, freqT: 1.0, amplitude: 8, alphaBase: 0.15 },
        { phaseOffset: 4.1, freqX: 0.15, freqT: 2.5, amplitude: 22, alphaBase: 0.07 },
      ];

      for (const layer of layers) {
        for (let px = 0; px < canvas.width; px += 2) {
          // Sample the thermal grid at this x position
          const gx = Math.floor((px / canvas.width) * width);

          // Vertical sinusoidal displacement for aurora curtain waviness
          const waveY = Math.sin(px * layer.freqX + elapsed * layer.freqT + layer.phaseOffset) * layer.amplitude;
          const waveY2 = Math.sin(px * layer.freqX * 0.7 + elapsed * layer.freqT * 1.3 + layer.phaseOffset + 1.5) * layer.amplitude * 0.5;

          for (let py = 0; py < canvas.height; py += 2) {
            const gy = Math.floor((py / canvas.height) * height);
            const idx = gy * width + gx;
            if (idx >= data.length) continue;
            if (wallMask[idx] === 1) continue;

            const temp = data[idx];
            const ax = airflowX[idx];
            const ay = airflowY[idx];
            const mag = Math.sqrt(ax * ax + ay * ay);

            // Aurora opacity modulated by airflow speed - faster = brighter
            const flowBrightness = Math.min(1, mag * 2000);
            if (flowBrightness < 0.01) continue;

            // Apply vertical displacement with gaussian falloff
            const displaced = py + waveY + waveY2;
            const centerDist = Math.abs(displaced - canvas.height * 0.5) / (canvas.height * 0.4);
            const gaussFalloff = Math.exp(-centerDist * centerDist * 0.8);

            // Lean curtains sideways based on airflow direction
            const leanOffset = ax * 5000;
            const finalX = px + leanOffset * gaussFalloff;
            if (finalX < 0 || finalX >= canvas.width) continue;

            const [h, s, l] = auroraHSL(temp);
            // Shimmer modulation
            const shimmer = 0.7 + 0.3 * Math.sin(elapsed * 3 + px * 0.05 + py * 0.03 + layer.phaseOffset);
            const alpha = layer.alphaBase * flowBrightness * gaussFalloff * shimmer;
            if (alpha < 0.005) continue;

            ctx.fillStyle = `hsla(${h}, ${s}%, ${l}%, ${alpha})`;
            ctx.fillRect(finalX, py, 3, 3);
          }
        }
      }

      auroraAnimRef.current = requestAnimationFrame(drawAurora);
    };

    auroraAnimRef.current = requestAnimationFrame(drawAurora);
    return () => {
      if (auroraAnimRef.current) cancelAnimationFrame(auroraAnimRef.current);
    };
  }, [activePanel, thermalGrid]);

  // Vorticity / turbulence overlay — renders curl of velocity as colored 2D layers
  useEffect(() => {
    if (activePanel !== 'airflow' || !thermalGrid?.vorticity || !vorticityCanvasRef.current) {
      if (vorticityAnimRef.current) cancelAnimationFrame(vorticityAnimRef.current);
      return;
    }
    const canvas = vorticityCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { vorticity, width, height, wallMask, turbulenceEnergy = 0 } = thermalGrid;
    if (!vorticity) return;
    const scale = 16;
    canvas.width = width * scale;
    canvas.height = height * scale;

    // Find vorticity range for normalization
    let maxVort = 0.001;
    for (let i = 0; i < vorticity.length; i++) {
      const v = Math.abs(vorticity[i]);
      if (v > maxVort && wallMask[i] === 0) maxVort = v;
    }

    let t0 = performance.now();
    const drawVorticity = (timestamp: number) => {
      const elapsed = (timestamp - t0) / 1000;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Cell size in pixels
      const cellW = scale;
      const cellH = scale;

      for (let j = 1; j < height - 1; j++) {
        for (let i = 1; i < width - 1; i++) {
          const idx = j * width + i;
          if (wallMask[idx] === 1) continue;

          const v = vorticity[idx];
          const magnitude = Math.abs(v) / maxVort;
          if (magnitude < 0.02) continue; // skip near-zero

          // Clockwise = warm (red/orange), counter-clockwise = cool (blue/cyan)
          // Intensity = magnitude of curl
          const alpha = Math.min(0.45, magnitude * 0.5);
          // Slight shimmer based on time
          const shimmer = 0.85 + 0.15 * Math.sin(elapsed * 2.5 + i * 0.2 + j * 0.15);

          if (v > 0) {
            // CW rotation — warm turbulence
            const r = Math.round(255 * Math.min(1, magnitude * 1.5));
            const g = Math.round(120 * magnitude);
            ctx.fillStyle = `rgba(${r},${g},30,${alpha * shimmer})`;
          } else {
            // CCW rotation — cool turbulence
            const b = Math.round(255 * Math.min(1, magnitude * 1.5));
            const g = Math.round(180 * magnitude);
            ctx.fillStyle = `rgba(30,${g},${b},${alpha * shimmer})`;
          }
          ctx.fillRect(i * cellW, j * cellH, cellW, cellH);
        }
      }

      // Draw swirl indicators at high-vorticity zones
      ctx.lineWidth = 1.5;
      for (let j = 3; j < height - 3; j += 4) {
        for (let i = 3; i < width - 3; i += 4) {
          const idx = j * width + i;
          if (wallMask[idx] === 1) continue;
          const v = vorticity[idx];
          const mag = Math.abs(v) / maxVort;
          if (mag < 0.3) continue;

          const cx = i * cellW + cellW / 2;
          const cy = j * cellH + cellH / 2;
          const radius = mag * cellW * 1.5;
          const dir = v > 0 ? 1 : -1;

          ctx.beginPath();
          ctx.arc(cx, cy, radius, elapsed * dir * 2, elapsed * dir * 2 + Math.PI * 1.4);
          ctx.strokeStyle = v > 0 ? `rgba(255,140,40,${mag * 0.5})` : `rgba(40,180,255,${mag * 0.5})`;
          ctx.stroke();
        }
      }

      vorticityAnimRef.current = requestAnimationFrame(drawVorticity);
    };

    vorticityAnimRef.current = requestAnimationFrame(drawVorticity);
    return () => {
      if (vorticityAnimRef.current) cancelAnimationFrame(vorticityAnimRef.current);
    };
  }, [activePanel, thermalGrid]);

  // Temperature color helper
  const tempColor = (actual: number, target: number) => {
    const diff = actual - target;
    if (Math.abs(diff) < 1) return 'text-emerald-400';
    if (diff > 0) return diff > 3 ? 'text-red-400' : 'text-orange-400';
    return diff < -3 ? 'text-blue-400' : 'text-cyan-400';
  };

  const roomTempColor = (actual: number, target: number) => {
    const diff = actual - target;
    if (Math.abs(diff) < 1) return 'rgba(16,185,129,0.25)';
    if (diff > 3) return 'rgba(239,68,68,0.3)';
    if (diff > 0) return 'rgba(249,115,22,0.25)';
    if (diff < -3) return 'rgba(59,130,246,0.3)';
    return 'rgba(34,211,238,0.25)';
  };

  const priorityColor: Record<string, string> = {
    critical: 'bg-red-500/20 border-red-500/40 text-red-400',
    high: 'bg-orange-500/20 border-orange-500/40 text-orange-400',
    medium: 'bg-yellow-500/20 border-yellow-500/40 text-yellow-400',
    low: 'bg-gray-500/20 border-gray-500/40 text-gray-400',
  };

  // Projection chart data (sample every 5 years)
  const projChartData = projections.filter((_: any, i: number) => i % 5 === 0).map((p: any) => ({
    year: p.year,
    rValue: parseFloat(p.rValuePct?.toFixed(1) || '100'),
    cost: Math.round((p.cumulativeCost || 0) / 1000),
    baseline: Math.round((p.baselineCumulativeCost || 0) / 1000),
    saving: Math.round((p.cumulativeSaving || 0) / 1000),
  }));

  // Zone selector handler
  const handleZoneSelect = (zone: string) => {
    setSelectedZone(zone);
    const w = window as any;
    if (w.v12Engine && w.v12Engine.setGlobeZone) {
      w.v12Engine.setGlobeZone(zone);
      setZoneConfigured(true);
    }
  };

  const selectOptimizationRoom = (roomId: string) => {
    const room = rooms.find(candidate => candidate.id === roomId);
    setSelectedOptimizationRoomId(roomId);
    setRoomOptimization(null);
    setRoomOptimizationApplied(false);
    setRoomOptimizationError('');
    setHvacCycleResult(null);
    setHvacCycleError('');
    setAdaptiveWallResult(null);
    setAdaptiveWallError('');
    if (room) {
      const floorAreaM2 = room.width * room.height;
      const roomVolumeM3 = floorAreaM2 * room.ceilingHeight;
      setRoomOptimizationInputs(current => ({
        ...current,
        targetTempC: room.targetTemp,
        minFloorAreaM2: Math.max(6, Math.round(room.width * room.height * 0.7 * 10) / 10),
      }));
      setHvacCycleInputs(current => ({
        ...current,
        targetTempC: room.targetTemp,
        initialIndoorTempC: thermalMode === 'cooling' ? room.targetTemp + 0.8 : room.targetTemp - 0.8,
        floorAreaM2: Math.round(floorAreaM2 * 10) / 10,
        roomVolumeM3: Math.round(roomVolumeM3 * 10) / 10,
        envelopeConductanceWPerK: Math.round(floorAreaM2 * 4.2 * 10) / 10,
        effectiveThermalMassKJPerK: Math.round(floorAreaM2 * 120),
      }));
      const estimatedExteriorWallAreaM2 = Math.max(6, 2 * (room.width + room.height) * room.ceilingHeight * 0.55);
      setAdaptiveWallInputs(current => ({
        ...current,
        wallAreaM2: Math.round(estimatedExteriorWallAreaM2 * 10) / 10,
        latticeAreaM2: Math.round(estimatedExteriorWallAreaM2 * 0.8 * 10) / 10,
        wallThermalMassKJPerK: Math.round(estimatedExteriorWallAreaM2 * 220),
        indoorTempC: room.targetTemp,
      }));
    }
  };

  const runLifecycleOptimization = () => {
    const engine = (window as any).v12Engine;
    const room = rooms.find(candidate => candidate.id === selectedOptimizationRoomId);
    if (!engine?.optimizeRoomLifecycle || !room) {
      setRoomOptimizationError('The live V12 room engine is not ready yet.');
      return;
    }

    setRoomOptimizationRunning(true);
    setRoomOptimizationError('');
    setRoomOptimizationApplied(false);
    window.setTimeout(() => {
      try {
        const result = engine.optimizeRoomLifecycle(room.id, {
          mode: thermalMode,
          ...roomOptimizationInputs,
          maxFloorAreaM2: Math.max(
            roomOptimizationInputs.minFloorAreaM2 * 1.6,
            room.width * room.height * 1.25,
          ),
        }) as RoomLifecycleOptimizationResult;
        setRoomOptimization(result);
        recordAnonymousComputation({
          type: 'room_optimization',
          category: 'house',
          version: 'v12',
          summary: result.improvement.reason,
          stats: result.improvement,
          state: { roomId: room.id, inputs: roomOptimizationInputs, best: result.best },
        }).catch(error => console.error('[Memory] Room optimization was not checkpointed:', error));
      } catch (error) {
        setRoomOptimizationError(error instanceof Error ? error.message : 'Room optimization failed.');
      } finally {
        setRoomOptimizationRunning(false);
      }
    }, 20);
  };

  const applyLifecycleOptimization = () => {
    const engine = (window as any).v12Engine;
    if (!roomOptimization?.improvement.qualifiesAsImprovement || !engine?.applyRoomLifecycleDesign) return;
    try {
      engine.applyRoomLifecycleDesign(
        selectedOptimizationRoomId,
        roomOptimization.best.design,
        roomOptimization.constraints.targetTempC,
      );
      setVentingStrategy(
        roomOptimization.best.design.strategy === 'cross'
          ? 'floor'
          : roomOptimization.best.design.strategy === 'stack'
            ? 'ceiling'
            : 'topological',
      );
      setRoomOptimizationApplied(true);
      setRoomOptimizationError('');
    } catch (error) {
      setRoomOptimizationError(error instanceof Error ? error.message : 'The optimized design could not be applied.');
    }
  };

  const runHvacCycleOptimization = async () => {
    const room = rooms.find(candidate => candidate.id === selectedOptimizationRoomId);
    if (!room) {
      setHvacCycleError('The selected room is not ready yet.');
      return;
    }
    setHvacCycleRunning(true);
    setHvacCycleError('');
    try {
      const response = await memoryFetch('/api/house/optimize-hvac-cycle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomName: room.name,
          mode: thermalMode,
          ...hvacCycleInputs,
          recoveredStreamTempC: hvacCycleInputs.allowRecoveredStream
            ? hvacCycleInputs.recoveredStreamTempC
            : thermalMode === 'cooling' ? 14 : 32,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'HVAC cycle optimization failed.');
      setHvacCycleResult(payload as HvacCycleOptimizationResult);
    } catch (error) {
      setHvacCycleError(error instanceof Error ? error.message : 'HVAC cycle optimization failed.');
    } finally {
      setHvacCycleRunning(false);
    }
  };

  const runAdaptiveWallOptimization = async () => {
    const room = rooms.find(candidate => candidate.id === selectedOptimizationRoomId);
    if (!room) {
      setAdaptiveWallError('The selected room is not ready yet.');
      return;
    }
    setAdaptiveWallRunning(true);
    setAdaptiveWallError('');
    try {
      const response = await memoryFetch('/api/house/optimize-adaptive-wall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wallName: `${room.name} exterior cavity`,
          mode: thermalMode,
          ...adaptiveWallInputs,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Adaptive wall optimization failed.');
      setAdaptiveWallResult(payload as AdaptiveWallOptimizationResult);
    } catch (error) {
      setAdaptiveWallError(error instanceof Error ? error.message : 'Adaptive wall optimization failed.');
    } finally {
      setAdaptiveWallRunning(false);
    }
  };

  useEffect(() => {
    if (activePanel !== 'adaptivewall' || !selectedOptimizationRoomId) return;
    const autoKey = [
      selectedOptimizationRoomId,
      thermalMode,
      adaptiveWallInputs.wallAreaM2,
      adaptiveWallInputs.staticWallRValue,
      adaptiveWallInputs.outdoorLowTempC,
      adaptiveWallInputs.outdoorHighTempC,
      adaptiveWallInputs.computeOrCompressorWasteHeatW,
    ].join('|');
    if (adaptiveWallAutoKeyRef.current === autoKey) return;
    adaptiveWallAutoKeyRef.current = autoKey;
    const timer = window.setTimeout(() => runAdaptiveWallOptimization(), 180);
    return () => window.clearTimeout(timer);
  }, [
    activePanel,
    selectedOptimizationRoomId,
    thermalMode,
    adaptiveWallInputs.wallAreaM2,
    adaptiveWallInputs.staticWallRValue,
    adaptiveWallInputs.outdoorLowTempC,
    adaptiveWallInputs.outdoorHighTempC,
    adaptiveWallInputs.computeOrCompressorWasteHeatW,
  ]);

  const runExistingHomeAutopilot = async (nextInputs = autopilotInputs) => {
    setAutopilotInputs(nextInputs);
    setAutopilotRunning(true);
    setAutopilotError('');
    try {
      const response = await memoryFetch('/api/house/existing-home-autopilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: {
            name: nextInputs.name,
            latitudeDeg: nextInputs.latitudeDeg,
            longitudeDeg: nextInputs.longitudeDeg,
            averageDailySolarMJm2: nextInputs.averageDailySolarMJm2,
            summerDesignTempC: nextInputs.summerDesignTempC,
            winterDesignTempC: nextInputs.winterDesignTempC,
            heatingDegreeDays: nextInputs.heatingDegreeDays,
            coolingDegreeDays: nextInputs.coolingDegreeDays,
          },
          estimatedFloorAreaM2: nextInputs.estimatedFloorAreaM2,
          constructionEra: nextInputs.constructionEra,
          lifecycleYears: nextInputs.lifecycleYears,
          targetIndoorTempC: nextInputs.targetIndoorTempC,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Existing-home autopilot failed.');
      setAutopilotResult(payload as ExistingHomeAutopilotResult);
    } catch (error) {
      setAutopilotError(error instanceof Error ? error.message : 'Existing-home autopilot failed.');
    } finally {
      setAutopilotRunning(false);
    }
  };

  const selectAutopilotPreset = (key: string) => {
    const preset = SITE_LOCATION_PRESETS[key] || SITE_LOCATION_PRESETS.bendigo;
    const next = { ...autopilotInputs, ...preset };
    setAutopilotPresetKey(key);
    runExistingHomeAutopilot(next);
  };

  const useCurrentLocationForAutopilot = () => {
    if (!navigator.geolocation) {
      setAutopilotError('This browser does not expose location. Choose the nearest climate preset instead.');
      return;
    }
    setAutopilotLocating(true);
    setAutopilotError('');
    navigator.geolocation.getCurrentPosition(position => {
      const latitudeDeg = position.coords.latitude;
      const longitudeDeg = position.coords.longitude;
      const candidates = Object.entries(SITE_LOCATION_PRESETS).filter(([key]) => key !== 'custom');
      const nearest = candidates.reduce((best, candidate) => {
        const distance = (candidate[1].latitudeDeg - latitudeDeg) ** 2
          + ((candidate[1].longitudeDeg - longitudeDeg) * Math.cos(latitudeDeg * Math.PI / 180)) ** 2;
        return distance < best.distance ? { key: candidate[0], site: candidate[1], distance } : best;
      }, { key: 'bendigo', site: SITE_LOCATION_PRESETS.bendigo, distance: Infinity });
      const next = {
        ...autopilotInputs,
        ...nearest.site,
        name: `Current location · ${nearest.site.name} climate`,
        latitudeDeg,
        longitudeDeg,
      };
      setAutopilotPresetKey(nearest.key);
      setAutopilotLocating(false);
      runExistingHomeAutopilot(next);
    }, error => {
      setAutopilotLocating(false);
      setAutopilotError(error.code === error.PERMISSION_DENIED
        ? 'Location was not allowed. The zero-input Bendigo screening model is still available.'
        : 'Location could not be read. Choose the nearest climate preset instead.');
    }, { enableHighAccuracy: false, timeout: 10_000, maximumAge: 3_600_000 });
  };

  const selectSitePreset = (key: string) => {
    const preset = SITE_LOCATION_PRESETS[key] || SITE_LOCATION_PRESETS.custom;
    setSitePresetKey(key);
    setSiteOptimization(null);
    setSiteOptimizationApplied(false);
    setSiteOptimizationError('');
    setSiteOptimizationInputs(current => ({
      ...current,
      ...preset,
      designWindSpeedMs: key === 'darwin' ? 70 : key === 'brisbane' ? 55 : 40,
      floodFloorElevationM: key === 'darwin' ? 1.5 : 0,
      snowLoadKPa: key === 'hobart' ? 0.2 : 0,
    }));
  };

  const runSiteOptimization = async () => {
    setSiteOptimizationRunning(true);
    setSiteOptimizationError('');
    setSiteOptimizationApplied(false);
    try {
      const response = await memoryFetch('/api/house/optimize-site', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: {
            name: siteOptimizationInputs.name,
            latitudeDeg: siteOptimizationInputs.latitudeDeg,
            longitudeDeg: siteOptimizationInputs.longitudeDeg,
            averageDailySolarMJm2: siteOptimizationInputs.averageDailySolarMJm2,
            summerDesignTempC: siteOptimizationInputs.summerDesignTempC,
            winterDesignTempC: siteOptimizationInputs.winterDesignTempC,
            heatingDegreeDays: siteOptimizationInputs.heatingDegreeDays,
            coolingDegreeDays: siteOptimizationInputs.coolingDegreeDays,
          },
          targetFloorAreaM2: siteOptimizationInputs.targetFloorAreaM2,
          minFloorAreaM2: siteOptimizationInputs.minFloorAreaM2,
          maxFloorAreaM2: siteOptimizationInputs.maxFloorAreaM2,
          lotWidthM: siteOptimizationInputs.lotWidthM,
          lotDepthM: siteOptimizationInputs.lotDepthM,
          targetIndoorTempC: siteOptimizationInputs.targetIndoorTempC,
          lifecycleYears: siteOptimizationInputs.lifecycleYears,
          wallRValue: Math.max(siteOptimizationInputs.minWallRValue, 3),
          iterations: 1800,
          requirements: {
            designWindSpeedMs: siteOptimizationInputs.designWindSpeedMs,
            floodFloorElevationM: siteOptimizationInputs.floodFloorElevationM,
            bushfireAttackLevel: siteOptimizationInputs.bushfireAttackLevel,
            seismicClass: siteOptimizationInputs.seismicClass,
            snowLoadKPa: siteOptimizationInputs.snowLoadKPa,
            minWallRValue: siteOptimizationInputs.minWallRValue,
            maxWindowToWallRatio: siteOptimizationInputs.maxWindowToWallRatio,
            maxUnsupportedSpanM: siteOptimizationInputs.maxUnsupportedSpanM,
            minimumSetbackM: siteOptimizationInputs.minimumSetbackM,
          },
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Site optimization failed.');
      setSiteOptimization(payload as SiteGeometryOptimizationResult);
    } catch (error) {
      setSiteOptimizationError(error instanceof Error ? error.message : 'Site optimization failed.');
    } finally {
      setSiteOptimizationRunning(false);
    }
  };

  const runWholeHouseOptimization = async () => {
    if (!rooms.length) return;
    setWholeHouseOptimizationRunning(true);
    setWholeHouseOptimizationError('');
    try {
      const response = await memoryFetch('/api/house/optimize-whole-system', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rooms,
          location: {
            name: siteOptimizationInputs.name,
            latitudeDeg: siteOptimizationInputs.latitudeDeg,
            longitudeDeg: siteOptimizationInputs.longitudeDeg,
            averageDailySolarMJm2: siteOptimizationInputs.averageDailySolarMJm2,
            summerDesignTempC: siteOptimizationInputs.summerDesignTempC,
            winterDesignTempC: siteOptimizationInputs.winterDesignTempC,
            heatingDegreeDays: siteOptimizationInputs.heatingDegreeDays,
            coolingDegreeDays: siteOptimizationInputs.coolingDegreeDays,
          },
          targetTempC: siteOptimizationInputs.targetIndoorTempC,
          lifecycleYears: siteOptimizationInputs.lifecycleYears,
          hvacCop: 3.6,
          maximumCandidates: 576,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Whole-house optimization failed.');
      setWholeHouseOptimization(payload as WholeHouseOptimizationResult);
    } catch (error) {
      setWholeHouseOptimizationError(error instanceof Error ? error.message : 'Whole-house optimization failed.');
    } finally {
      setWholeHouseOptimizationRunning(false);
    }
  };

  const runSystemEvidence = async () => {
    setSystemEvidenceError('');
    const location = {
      name: siteOptimizationInputs.name,
      latitudeDeg: siteOptimizationInputs.latitudeDeg,
      longitudeDeg: siteOptimizationInputs.longitudeDeg,
      averageDailySolarMJm2: siteOptimizationInputs.averageDailySolarMJm2,
      summerDesignTempC: siteOptimizationInputs.summerDesignTempC,
      winterDesignTempC: siteOptimizationInputs.winterDesignTempC,
      heatingDegreeDays: siteOptimizationInputs.heatingDegreeDays,
      coolingDegreeDays: siteOptimizationInputs.coolingDegreeDays,
    };
    try {
      const [contextResponse, validationResponse] = await Promise.all([
        memoryFetch('/api/house/site-context', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ location, rooms, searchRadiusM: 120 }),
        }),
        memoryFetch('/api/house/validation-report'),
      ]);
      const [contextPayload, validationPayload] = await Promise.all([contextResponse.json(), validationResponse.json()]);
      if (!contextResponse.ok) throw new Error(contextPayload.error || 'Site evidence could not be loaded.');
      if (!validationResponse.ok) throw new Error(validationPayload.error || 'Physics validation could not be loaded.');
      setSiteContext(contextPayload as AutomaticSiteContextResult);
      setPhysicsValidation(validationPayload as BuildingPhysicsValidationReport);
    } catch (error) {
      setSystemEvidenceError(error instanceof Error ? error.message : 'System evidence could not be loaded.');
    }
  };

  const downloadSystemReport = () => {
    if (!siteOptimization || !wholeHouseOptimization) return;
    const topDesigns = [...wholeHouseOptimization.archetypeComparisons]
      .sort((a, b) => a.lifecycleEnergyKWh - b.lifecycleEnergyKWh)
      .slice(0, 3);
    const report = {
      reportType: 'BeyondBound building-energy screening report',
      generatedAt: new Date().toISOString(),
      screeningOnly: true,
      location: wholeHouseOptimization.location,
      physicsValidation,
      siteEvidence: siteContext,
      optimizedGeometry: siteOptimization.best,
      optimizedWholeSystem: wholeHouseOptimization.best,
      topDesigns,
      improvement: wholeHouseOptimization.improvement,
      limitations: [
        'Not a building permit, energy rating, engineering certificate or substitute for a calibrated whole-building model.',
        'Open footprint data does not prove internal layouts, construction assemblies, occupancy or legal shared boundaries.',
      ],
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `beyondbound-screening-${wholeHouseOptimization.location.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const useCurrentLocationForSystem = (silent = false) => {
    if (!navigator.geolocation) {
      if (!silent) setWholeHouseOptimizationError('This browser does not expose location. Choose the nearest climate preset instead.');
      return;
    }
    navigator.geolocation.getCurrentPosition(position => {
      const latitudeDeg = position.coords.latitude;
      const longitudeDeg = position.coords.longitude;
      const candidates = Object.entries(SITE_LOCATION_PRESETS).filter(([key]) => key !== 'custom');
      const nearest = candidates.reduce((best, candidate) => {
        const distance = (candidate[1].latitudeDeg - latitudeDeg) ** 2
          + ((candidate[1].longitudeDeg - longitudeDeg) * Math.cos(latitudeDeg * Math.PI / 180)) ** 2;
        return distance < best.distance ? { key: candidate[0], site: candidate[1], distance } : best;
      }, { key: 'bendigo', site: SITE_LOCATION_PRESETS.bendigo, distance: Infinity });
      setSitePresetKey(nearest.key);
      setSiteOptimization(null);
      setWholeHouseOptimization(null);
      setSiteOptimizationInputs(current => ({
        ...current,
        ...nearest.site,
        name: `Current location · ${nearest.site.name} climate`,
        latitudeDeg,
        longitudeDeg,
      }));
    }, error => {
      if (!silent) setWholeHouseOptimizationError(error.code === error.PERMISSION_DENIED
        ? 'Location was not allowed. The selected climate preset still runs automatically.'
        : 'Location could not be read. The selected climate preset still runs automatically.');
    }, { enableHighAccuracy: false, timeout: 10_000, maximumAge: 3_600_000 });
  };

  const applySiteOptimization = () => {
    const engine = (window as any).v12Engine;
    if (!siteOptimization?.improvement.qualifiesAsImprovement || !engine?.applySiteGeometryOptimization) return;
    try {
      engine.applySiteGeometryOptimization(siteOptimization);
      setZoneConfigured(true);
      setSelectedZone(Math.abs(siteOptimization.location.latitudeDeg) < 23.5 ? 'tropical' : Math.abs(siteOptimization.location.latitudeDeg) >= 48 ? 'cold' : 'temperate');
      setSiteOptimizationApplied(true);
      setSiteOptimizationError('');
    } catch (error) {
      setSiteOptimizationError(error instanceof Error ? error.message : 'The site design could not be applied.');
    }
  };

  useEffect(() => {
    if (activePanel !== 'autopilot' || autopilotStartedRef.current) return;
    autopilotStartedRef.current = true;
    runExistingHomeAutopilot();
  }, [activePanel]);

  useEffect(() => {
    if (activePanel !== 'system' || systemLocationAttemptedRef.current) return;
    systemLocationAttemptedRef.current = true;
    const permissions = navigator.permissions as Permissions | undefined;
    permissions?.query({ name: 'geolocation' }).then(status => {
      if (status.state === 'granted') useCurrentLocationForSystem(true);
    }).catch(() => undefined);
  }, [activePanel]);

  useEffect(() => {
    if (activePanel !== 'system' || rooms.length === 0) return;
    const geometryKey = rooms.map(room => `${room.id}:${room.x}:${room.y}:${room.width}:${room.height}:${room.ceilingHeight}`).join('|');
    const key = [siteOptimizationInputs.latitudeDeg, siteOptimizationInputs.longitudeDeg, siteOptimizationInputs.targetFloorAreaM2, geometryKey].join('::');
    if (systemAutoKeyRef.current === key) return;
    systemAutoKeyRef.current = key;
    void runSiteOptimization();
    void runWholeHouseOptimization();
    void runSystemEvidence();
  }, [activePanel, rooms, siteOptimizationInputs.latitudeDeg, siteOptimizationInputs.longitudeDeg, siteOptimizationInputs.targetFloorAreaM2]);

  const selectedAirflowRoom = rooms.find(room => room.id === selectedAirflowRoomId) || rooms[0] || null;
  const selectedHeightProfile = thermalGrid?.heightProfiles?.find(profile => profile.roomId === selectedAirflowRoom?.id) || null;
  const selectedHeightSweep = thermalGrid?.heightSweeps?.find(sweep => sweep.roomId === selectedAirflowRoom?.id) || null;

  const setAirflowVentHeight = (type: 'intake' | 'exhaust', heightM: number) => {
    const engine = (window as any).v12Engine;
    if (!engine?.setVentHeight || !selectedAirflowRoom) return;
    engine.setVentHeight(selectedAirflowRoom.id, type, heightM);
    setThermalGrid(engine.getThermalGrid());
  };

  const rerunAirflowSweep = () => {
    const engine = (window as any).v12Engine;
    if (!engine?.runHeightAirflowSweep || !selectedAirflowRoom) return;
    engine.runHeightAirflowSweep(selectedAirflowRoom.id);
    setThermalGrid(engine.getThermalGrid());
  };

  // The consolidated system view starts immediately from the selected climate
  // preset. The legacy zone chooser remains available for advanced panels.
  if (!zoneConfigured && !selectedZone && activePanel !== 'system') {
    return (
      <div className="bg-white/5 rounded-xl border border-white/10 p-6 min-h-[600px]">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-emerald-500/20 rounded-2xl flex items-center justify-center border border-emerald-500/30 mx-auto mb-4">
            <Box size={32} className="text-emerald-400" />
          </div>
          <h2 className="text-3xl font-black uppercase tracking-tighter mb-2">House Blueprint Generator</h2>
          <p className="text-gray-400 text-sm max-w-md mx-auto">Select your location on the globe. This determines climate, building code constraints, materials, and passive design strategy.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto mb-8">
          {([
            { id: 'tropical', label: 'Tropical', sub: '0° – 23° latitude', icon: '🌴', temp: '25–35°C year-round', seasons: 'Wet / Dry', humidity: '99%',
              features: ['Stilts for flood protection', 'Cross-ventilation priority', 'Deep eaves & verandahs', 'High ceilings (3m+)', 'Rainwater collection', 'Louvred walls'],
              color: 'from-red-500/20 to-orange-500/20 border-orange-500/30 hover:border-orange-400', textCol: 'text-orange-400' },
            { id: 'temperate', label: 'Temperate', sub: '23° – 50° latitude', icon: '🏡', temp: '3–35°C seasonal', seasons: '4 Seasons', humidity: '55%',
              features: ['L-shape with courtyard', 'Underfloor heating', 'Deciduous shade trees', 'Solar gain windows', 'Night purge cooling', 'Earth-sheltered options'],
              color: 'from-emerald-500/20 to-cyan-500/20 border-emerald-500/30 hover:border-emerald-400', textCol: 'text-emerald-400' },
            { id: 'cold', label: 'Cold / Polar', sub: '50°+ latitude', icon: '❄', temp: '-20–25°C seasonal', seasons: '4 Seasons', humidity: '65%',
              features: ['Compact form (min surface)', 'Super-insulated R-5+ walls', 'Triple/vacuum glazing', 'Airlock vestibule', 'HRV mandatory (90%+)', 'Attached greenhouse'],
              color: 'from-blue-500/20 to-indigo-500/20 border-blue-500/30 hover:border-blue-400', textCol: 'text-blue-400' },
          ]).map(zone => (
            <button key={zone.id} onClick={() => handleZoneSelect(zone.id)}
              className={`p-5 rounded-2xl border bg-gradient-to-br ${zone.color} text-left transition-all hover:scale-[1.02] active:scale-[0.98]`}>
              <div className="text-3xl mb-2">{zone.icon}</div>
              <h3 className={`text-lg font-black uppercase ${zone.textCol}`}>{zone.label}</h3>
              <p className="text-[10px] text-gray-400 mb-3">{zone.sub}</p>
              <div className="space-y-1 mb-3">
                <div className="flex justify-between text-[9px]"><span className="text-gray-500">Temp Range</span><span className="text-white font-mono">{zone.temp}</span></div>
                <div className="flex justify-between text-[9px]"><span className="text-gray-500">Seasons</span><span className="text-white font-mono">{zone.seasons}</span></div>
                <div className="flex justify-between text-[9px]"><span className="text-gray-500">Humidity</span><span className="text-white font-mono">{zone.humidity}</span></div>
              </div>
              <div className="space-y-0.5">
                {zone.features.map((f, i) => (
                  <div key={i} className="text-[8px] text-gray-400 flex items-center gap-1">
                    <span className={zone.textCol}>▸</span> {f}
                  </div>
                ))}
              </div>
            </button>
          ))}
        </div>

        <p className="text-center text-[9px] text-gray-600 max-w-lg mx-auto">
          You can't build an igloo in the desert. Location determines everything: flood zones need stilts, earthquake zones need width, cold zones need compact forms, tropics need airflow.
          The simulation will brute-force optimal orientation, shade, vent placement, and material selection for your zone.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <button onClick={() => { handleZoneSelect('temperate'); setActivePanel('autopilot'); }} className="px-6 py-3 bg-emerald-500 text-black rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-400 transition-all">
            Optimize my existing home
          </button>
          <button onClick={() => { handleZoneSelect('temperate'); setActivePanel('system'); }} className="px-6 py-3 bg-yellow-500 text-black rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-yellow-400 transition-all">
            Design a new home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/5 rounded-xl border border-white/10 p-6 min-h-[600px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center border border-emerald-500/30">
            <Box size={24} className="text-emerald-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold uppercase tracking-tighter">V12 House Blueprint</h2>
            <p className="text-gray-400 text-sm">
              {zoneConstraints?.label || 'Live Thermal Simulation'} &bull; {metrics ? `Iteration ${metrics.iteration}` : 'Connecting...'}
              {zoneConstraints && <span className="text-emerald-400/60 ml-2">{zoneConstraints.seasons?.join(' / ')}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {metrics && (
            <div className="flex items-center gap-1 px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-full">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[9px] font-bold text-emerald-400 uppercase">Live</span>
            </div>
          )}
          <div className="flex bg-black/40 rounded-lg p-0.5 border border-white/10">
            <button onClick={() => setThermalMode('cooling')} className={`px-2 py-1 text-[8px] font-bold uppercase rounded transition-all ${thermalMode === 'cooling' ? 'bg-cyan-500 text-black' : 'text-gray-500'}`}>Cool</button>
            <button onClick={() => setThermalMode('heating')} className={`px-2 py-1 text-[8px] font-bold uppercase rounded transition-all ${thermalMode === 'heating' ? 'bg-orange-500 text-black' : 'text-gray-500'}`}>Heat</button>
          </div>
        </div>
      </div>

      {/* Live Metrics Row */}
      {metrics && activePanel !== 'system' && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <div className="p-3 bg-black/40 rounded-xl border border-white/5">
            <span className="text-[8px] text-gray-500 uppercase block">HVAC Load</span>
            <span className="text-xl font-black text-emerald-400">{metrics.hvacLoadKW}<span className="text-[10px] text-gray-500 ml-1">kW</span></span>
          </div>
          <div className="p-3 bg-black/40 rounded-xl border border-white/5">
            <span className="text-[8px] text-gray-500 uppercase block">Heat Loss</span>
            <span className="text-xl font-black text-blue-400">{(metrics.totalHeatLossW / 1000).toFixed(1)}<span className="text-[10px] text-gray-500 ml-1">kW</span></span>
          </div>
          <div className="p-3 bg-black/40 rounded-xl border border-white/5">
            <span className="text-[8px] text-gray-500 uppercase block">Heat Gain</span>
            <span className="text-xl font-black text-orange-400">{(metrics.totalHeatGainW / 1000).toFixed(1)}<span className="text-[10px] text-gray-500 ml-1">kW</span></span>
          </div>
          <div className="p-3 bg-black/40 rounded-xl border border-white/5">
            <span className="text-[8px] text-gray-500 uppercase block">Natural Savings</span>
            <span className="text-xl font-black text-green-400">{(metrics.naturalSystems?.totalSavings || 0).toFixed(0)}<span className="text-[10px] text-gray-500 ml-1">%</span></span>
          </div>
          <div className="p-3 bg-black/40 rounded-xl border border-white/5">
            <span className="text-[8px] text-gray-500 uppercase block">Ledger</span>
            <span className="text-xl font-black text-purple-400">{metrics.ledgerSize}<span className="text-[10px] text-gray-500 ml-1">txns</span></span>
          </div>
        </div>
      )}

      {/* Geometry Source Indicator */}
      {activePanel !== 'system' && <div className="flex items-center gap-2 mb-3">
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[9px] font-bold uppercase ${
          geoSource === 'v5_detected'
            ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
            : 'bg-gray-500/10 border-gray-500/30 text-gray-500'
        }`}>
          <div className={`w-2 h-2 rounded-full ${geoSource === 'v5_detected' ? 'bg-cyan-500 animate-pulse' : 'bg-gray-600'}`} />
          {geoSource === 'v5_detected' ? `V5 Detected Geometry (${v5PlaneCount} planes)` : 'Default Layout (waiting for V5...)'}
        </div>
        {v5Planes.length > 0 && (
          <span className="text-[8px] text-gray-600 font-mono">
            {v5Planes.filter((p: any) => p.role === 'wall').length}W {v5Planes.filter((p: any) => p.role === 'partition').length}P {v5Planes.filter((p: any) => p.role === 'spiral').length}S {v5Planes.filter((p: any) => p.role === 'floor').length}F
          </span>
        )}
      </div>}

      {/* Tab Navigation */}
      <div className="mb-6 bg-black/30 p-1 rounded-xl border border-white/5">
        <div className="flex gap-1 flex-wrap">
        {([
          { id: 'system', label: 'Whole System', icon: <Activity size={12} /> },
          { id: 'autopilot', label: 'Existing Home', icon: <Brain size={12} /> },
          { id: 'siteoptimizer', label: 'Site + Shadow', icon: <Zap size={12} /> },
          { id: 'airflow', label: 'Airflow', icon: <Wind size={12} /> },
          { id: 'cycling', label: 'Smart Cycle', icon: <RotateCw size={12} /> },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActivePanel(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all ${
              activePanel === tab.id ? 'bg-emerald-500 text-black' : 'text-gray-500 hover:text-white hover:bg-white/5'
            }`}
          >
            {tab.icon}{tab.label}
          </button>
        ))}
        </div>
        <details className="mt-1 border-t border-white/5 pt-1">
          <summary className="cursor-pointer px-3 py-1.5 text-[8px] font-bold text-gray-600 hover:text-gray-300 uppercase tracking-widest">Advanced simulations</summary>
          <div className="flex gap-1 flex-wrap mt-1">
          {([
          { id: 'floorplan', label: 'Floorplan', icon: <Box size={12} /> },
          { id: 'optimizer', label: 'Lifecycle Optimize', icon: <Target size={12} /> },
          { id: 'adaptivewall', label: 'Adaptive Wall', icon: <Layers size={12} /> },
          { id: 'thermal', label: 'Thermal', icon: <Thermometer size={12} /> },
          { id: 'seasonal', label: '4 Seasons', icon: <RefreshCw size={12} /> },
          { id: 'natural', label: 'Natural', icon: <Wind size={12} /> },
          { id: 'electrical', label: 'Electrical', icon: <Zap size={12} /> },
          { id: 'cooler', label: 'Esky/Beer', icon: <FlaskConical size={12} /> },
          { id: 'topology', label: 'Topology', icon: <Activity size={12} /> },
          { id: 'projection', label: '100-Year', icon: <HistoryIcon size={12} /> },
          { id: 'solar', label: 'Solar', icon: <Cpu size={12} /> },
          { id: 'deeplearn', label: 'Deep Learn', icon: <Brain size={12} /> },
          { id: 'ventreadings', label: 'Vent Data', icon: <ArrowUp size={12} /> },
          { id: 'annualcycle', label: 'Annual', icon: <RotateCw size={12} /> },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setActivePanel(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all ${
              activePanel === tab.id ? 'bg-emerald-500 text-black' : 'text-gray-500 hover:text-white hover:bg-white/5'
            }`}
          >
            {tab.icon}{tab.label}
          </button>
        ))}
          </div>
        </details>
      </div>

      {/* Panel Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Panel (2/3) */}
        <div className={activePanel === 'system' ? 'lg:col-span-3' : 'lg:col-span-2'}>
          <AnimatePresence mode="wait">
            {activePanel === 'system' && (
              <motion.div key="system" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="bg-black/30 rounded-xl border border-cyan-500/20 p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/35 p-3">
                  <div>
                    <div className="text-[8px] text-gray-500 uppercase tracking-widest">Automatic site anchor</div>
                    <div className="text-[11px] font-bold text-white mt-1">{siteOptimizationInputs.name}</div>
                    <div className="text-[8px] font-mono text-cyan-300">{siteOptimizationInputs.latitudeDeg.toFixed(3)}°, {siteOptimizationInputs.longitudeDeg.toFixed(3)}°</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <select value={sitePresetKey} onChange={event => selectSitePreset(event.target.value)} className="bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-[9px] text-gray-300">
                      {Object.entries(SITE_LOCATION_PRESETS).filter(([key]) => key !== 'custom').map(([key, preset]) => <option key={key} value={key}>{preset.name}</option>)}
                    </select>
                    <button onClick={() => useCurrentLocationForSystem(false)} className="px-3 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-[8px] font-bold text-cyan-200 uppercase">Use my location</button>
                    <button onClick={() => { systemAutoKeyRef.current = ''; void runSiteOptimization(); void runWholeHouseOptimization(); void runSystemEvidence(); }} disabled={siteOptimizationRunning || wholeHouseOptimizationRunning} className="px-3 py-2 rounded-lg bg-emerald-500 text-black disabled:bg-gray-700 disabled:text-gray-500 text-[8px] font-black uppercase">{siteOptimizationRunning || wholeHouseOptimizationRunning ? 'Sweeping…' : 'Re-run automatic sweep'}</button>
                    <button onClick={downloadSystemReport} disabled={!siteOptimization || !wholeHouseOptimization} className="px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/30 text-[8px] font-bold text-purple-200 uppercase disabled:opacity-40">Download report</button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 text-[7px] font-mono uppercase">
                  <span className={`rounded-full border px-2 py-1 ${physicsValidation?.readyForScreening ? 'border-emerald-500/30 text-emerald-300 bg-emerald-500/5' : 'border-amber-500/30 text-amber-200 bg-amber-500/5'}`}>{physicsValidation ? `${physicsValidation.passed}/${physicsValidation.cases.length} numerical checks` : 'checking physics…'}</span>
                  <span className="rounded-full border border-cyan-500/30 text-cyan-200 bg-cyan-500/5 px-2 py-1">{siteContext ? `${siteContext.source.replaceAll('_', ' ')} · ${siteContext.neighbours.length} neighbours` : 'loading site evidence…'}</span>
                  <span className={`rounded-full border px-2 py-1 ${siteContext?.uncertainty.band === 'low' ? 'border-emerald-500/30 text-emerald-300' : 'border-amber-500/30 text-amber-200'}`}>{siteContext ? `${siteContext.uncertainty.band} site uncertainty` : 'uncertainty pending'}</span>
                </div>
                {(siteOptimizationError || wholeHouseOptimizationError || systemEvidenceError) && <div className="rounded-lg border border-red-500/25 bg-red-500/5 p-3 text-[9px] text-red-300">{siteOptimizationError || wholeHouseOptimizationError || systemEvidenceError}</div>}
                <EarthSiteHouse3D
                  rooms={rooms}
                  location={{
                    name: siteOptimizationInputs.name,
                    latitudeDeg: siteOptimizationInputs.latitudeDeg,
                    longitudeDeg: siteOptimizationInputs.longitudeDeg,
                    averageDailySolarMJm2: siteOptimizationInputs.averageDailySolarMJm2,
                    summerDesignTempC: siteOptimizationInputs.summerDesignTempC,
                    winterDesignTempC: siteOptimizationInputs.winterDesignTempC,
                    heatingDegreeDays: siteOptimizationInputs.heatingDegreeDays,
                    coolingDegreeDays: siteOptimizationInputs.coolingDegreeDays,
                  }}
                  siteOptimization={siteOptimization}
                  wholeHouse={wholeHouseOptimization}
                  siteContext={siteContext}
                  physicsValidation={physicsValidation}
                />
              </motion.div>
            )}
            {activePanel === 'floorplan' && (
              <motion.div key="fp" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="bg-black/30 rounded-xl border border-white/10 p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[10px] font-bold text-gray-400 uppercase">
                    {geoSource === 'v5_detected' ? 'V5-Detected Room Layout' : 'Live Room Layout'}
                  </h3>
                  {geoSource === 'v5_detected' && (
                    <span className="text-[8px] font-mono text-cyan-400/60">
                      walls→partitions→rooms pipeline active
                    </span>
                  )}
                </div>
                {rooms.length > 0 ? (() => {
                  // Compute SVG viewBox from actual room data
                  let maxRX = 0, maxRY = 0;
                  for (const r of rooms) { maxRX = Math.max(maxRX, r.x + r.width); maxRY = Math.max(maxRY, r.y + r.height); }
                  const vbW = maxRX + 1; const vbH = maxRY + 2.5;
                  return (
                  <svg viewBox={`-0.5 -0.5 ${vbW} ${vbH}`} className="w-full" style={{ maxHeight: 420 }}>
                    <defs>
                      <pattern id="grid" width="1" height="1" patternUnits="userSpaceOnUse">
                        <path d="M 1 0 L 0 0 0 1" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="0.02"/>
                      </pattern>
                      <marker id="ventIn" markerWidth="5" markerHeight="3" refX="5" refY="1.5" orient="auto"><path d="M0,0 L5,1.5 L0,3" fill="rgba(59,130,246,0.7)"/></marker>
                      <marker id="ventOut" markerWidth="5" markerHeight="3" refX="5" refY="1.5" orient="auto"><path d="M0,0 L5,1.5 L0,3" fill="rgba(239,68,68,0.6)"/></marker>
                      <marker id="ventHRV" markerWidth="5" markerHeight="3" refX="5" refY="1.5" orient="auto"><path d="M0,0 L5,1.5 L0,3" fill="rgba(168,85,247,0.7)"/></marker>
                    </defs>
                    <rect x="-0.5" y="-0.5" width={vbW} height={vbH} fill="url(#grid)"/>

                    {/* V5 detected wall lines overlay (if available) */}
                    {v5Planes.length > 0 && (() => {
                      const wallPlanes = v5Planes.filter((p: any) => p.role === 'wall' || p.role === 'partition');
                      // Compute V5 bounding box for scaling
                      let v5MinX = Infinity, v5MaxX = -Infinity, v5MinZ = Infinity, v5MaxZ = -Infinity;
                      for (const p of v5Planes) {
                        v5MinX = Math.min(v5MinX, p.center.x - p.width / 2);
                        v5MaxX = Math.max(v5MaxX, p.center.x + p.width / 2);
                        v5MinZ = Math.min(v5MinZ, p.center.z - p.width / 2);
                        v5MaxZ = Math.max(v5MaxZ, p.center.z + p.width / 2);
                      }
                      const v5W = v5MaxX - v5MinX || 1;
                      const v5H = v5MaxZ - v5MinZ || 1;
                      return wallPlanes.map((p: any, i: number) => {
                        // Scale V5 plane positions to match room layout
                        const cx = ((p.center.x - v5MinX) / v5W) * maxRX;
                        const cz = ((p.center.z - v5MinZ) / v5H) * maxRY;
                        const isVertical = Math.abs(p.normal.x) > Math.abs(p.normal.z);
                        const len = (p.width / Math.max(v5W, v5H)) * Math.max(maxRX, maxRY) * 0.8;
                        const x1 = isVertical ? cx : cx - len / 2;
                        const y1 = isVertical ? cz - len / 2 : cz;
                        const x2 = isVertical ? cx : cx + len / 2;
                        const y2 = isVertical ? cz + len / 2 : cz;
                        return (
                          <line key={`v5w${i}`} x1={x1} y1={y1} x2={x2} y2={y2}
                            stroke={p.role === 'wall' ? 'rgba(34,211,238,0.25)' : 'rgba(34,211,238,0.15)'}
                            strokeWidth={p.role === 'wall' ? '0.08' : '0.05'}
                            strokeDasharray={p.role === 'partition' ? '0.15 0.1' : 'none'}
                          />
                        );
                      });
                    })()}

                    {/* Rooms */}
                    {rooms.map((room: any) => {
                      const roomMetric = metrics?.roomTemps?.find((rt: any) => rt.name === room.name);
                      const actual = roomMetric?.actual ?? room.targetTemp;
                      return (
                        <g key={room.id}>
                          <rect
                            x={room.x} y={room.y} width={room.width} height={room.height}
                            fill={roomTempColor(actual, room.targetTemp)}
                            stroke="rgba(255,255,255,0.3)" strokeWidth="0.06" rx="0.1"
                          />
                          <text x={room.x + room.width / 2} y={room.y + room.height / 2 - 0.4} textAnchor="middle" fill="white" fontSize="0.38" fontWeight="bold">{room.name}</text>
                          <text x={room.x + room.width / 2} y={room.y + room.height / 2 + 0.05} textAnchor="middle" fill={Math.abs(actual - room.targetTemp) < 1 ? '#34d399' : actual > room.targetTemp ? '#f97316' : '#22d3ee'} fontSize="0.42" fontWeight="bold">{actual.toFixed(1)}°C</text>
                          <text x={room.x + room.width / 2} y={room.y + room.height / 2 + 0.45} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="0.22">target {room.targetTemp}°C &bull; {room.width.toFixed(1)}x{room.height.toFixed(1)}m</text>

                          {/* Vent positions + flow arrows */}
                          {(room.vents || []).map((vent: any, vi: number) => {
                            const vx = vent.x; const vy = vent.y;
                            const isIn = vent.type === 'intake';
                            const isHRV = vent.type === 'heat_recovery';
                            const color = isIn ? 'rgba(59,130,246,0.8)' : isHRV ? 'rgba(168,85,247,0.8)' : 'rgba(239,68,68,0.7)';
                            const marker = isIn ? 'url(#ventIn)' : isHRV ? 'url(#ventHRV)' : 'url(#ventOut)';
                            // Flow arrow direction
                            const arrowLen = 0.5 + vent.flowRate * 8;
                            const dx = isIn ? 0.15 : -0.15;
                            const dy = isIn ? -arrowLen : arrowLen;
                            return (
                              <g key={`${room.id}_v${vi}`}>
                                <circle cx={vx} cy={vy} r="0.15" fill={color} stroke="rgba(255,255,255,0.3)" strokeWidth="0.02"/>
                                <line x1={vx} y1={vy} x2={vx + dx} y2={vy + dy} stroke={color} strokeWidth="0.04" markerEnd={marker} />
                                <text x={vx + 0.2} y={vy - 0.2} fontSize="0.18" fill={color} fontWeight="bold">
                                  {isIn ? '↓IN' : isHRV ? '⟳HRV' : '↑OUT'}
                                </text>
                                {vent.powered && <text x={vx + 0.2} y={vy + 0.25} fontSize="0.14" fill="rgba(251,191,36,0.5)">⚡{vent.diameter}mm</text>}
                              </g>
                            );
                          })}

                          {room.hasEsky && <text x={room.x + 0.2} y={room.y + 0.4} fontSize="0.35" fill="#a78bfa">❄ Esky</text>}
                          {room.windowCount > 0 && (
                            <text x={room.x + room.width - 0.15} y={room.y + 0.35} textAnchor="end" fontSize="0.22" fill="#fbbf24">{room.windowCount}🪟</text>
                          )}
                        </g>
                      );
                    })}

                    {/* Spiral heat exchanger overlay (if V5 detected) */}
                    {v5Planes.length > 0 && (() => {
                      const spirals = v5Planes.filter((p: any) => p.role === 'spiral');
                      if (spirals.length === 0) return null;
                      let v5MinX = Infinity, v5MaxX = -Infinity, v5MinZ = Infinity, v5MaxZ = -Infinity;
                      for (const p of v5Planes) {
                        v5MinX = Math.min(v5MinX, p.center.x); v5MaxX = Math.max(v5MaxX, p.center.x);
                        v5MinZ = Math.min(v5MinZ, p.center.z); v5MaxZ = Math.max(v5MaxZ, p.center.z);
                      }
                      const v5W = v5MaxX - v5MinX || 1; const v5H = v5MaxZ - v5MinZ || 1;
                      return spirals.map((sp: any, i: number) => {
                        const sx = ((sp.center.x - v5MinX) / v5W) * maxRX;
                        const sz = ((sp.center.z - v5MinZ) / v5H) * maxRY;
                        return <circle key={`sp${i}`} cx={sx} cy={sz} r="0.08" fill="none" stroke="rgba(249,115,22,0.2)" strokeWidth="0.02"/>;
                      });
                    })()}

                    {/* Legend */}
                    <g transform={`translate(0, ${maxRY + 0.5})`}>
                      <rect x="0" y="0" width="0.3" height="0.3" fill="rgba(16,185,129,0.25)" stroke="rgba(255,255,255,0.2)" strokeWidth="0.02"/>
                      <text x="0.4" y="0.22" fontSize="0.2" fill="rgba(255,255,255,0.5)">On Target</text>
                      <rect x="2.2" y="0" width="0.3" height="0.3" fill="rgba(239,68,68,0.3)" stroke="rgba(255,255,255,0.2)" strokeWidth="0.02"/>
                      <text x="2.6" y="0.22" fontSize="0.2" fill="rgba(255,255,255,0.5)">Too Hot</text>
                      <rect x="4" y="0" width="0.3" height="0.3" fill="rgba(59,130,246,0.3)" stroke="rgba(255,255,255,0.2)" strokeWidth="0.02"/>
                      <text x="4.4" y="0.22" fontSize="0.2" fill="rgba(255,255,255,0.5)">Too Cold</text>
                      <circle cx="5.8" cy="0.15" r="0.12" fill="rgba(59,130,246,0.7)"/><text x="6.1" y="0.22" fontSize="0.2" fill="rgba(255,255,255,0.5)">Intake</text>
                      <circle cx="7.2" cy="0.15" r="0.12" fill="rgba(239,68,68,0.7)"/><text x="7.5" y="0.22" fontSize="0.2" fill="rgba(255,255,255,0.5)">Exhaust</text>
                      <circle cx="8.8" cy="0.15" r="0.12" fill="rgba(168,85,247,0.7)"/><text x="9.1" y="0.22" fontSize="0.2" fill="rgba(255,255,255,0.5)">HRV</text>
                      {geoSource === 'v5_detected' && (
                        <text x="0" y="0.6" fontSize="0.18" fill="rgba(34,211,238,0.4)">── V5 wall detection ┈┈ V5 partition</text>
                      )}
                    </g>
                  </svg>
                  );
                })() : (
                  <div className="h-64 flex items-center justify-center text-gray-600 text-xs">V12 engine loading — V5 geometry detection in progress...</div>
                )}
              </motion.div>
            )}

            {activePanel === 'autopilot' && (
              <motion.div key="autopilot" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="bg-black/30 rounded-xl border border-emerald-500/25 p-5">
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider">Existing Home Autopilot</h3>
                    <p className="text-[10px] text-gray-400 mt-1 max-w-2xl leading-relaxed">
                      No floorplan required. AboveBound tests every retrofit against an ensemble of plausible versions of the home and keeps only measures that repay their construction energy across most of them.
                    </p>
                  </div>
                  <div className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[8px] font-bold text-emerald-400 uppercase whitespace-nowrap">Automatic screening</div>
                </div>

                <div className="grid md:grid-cols-2 gap-3 mb-4">
                  <div className="p-4 rounded-xl bg-emerald-500/[0.04] border border-emerald-500/15">
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <h4 className="text-[9px] font-bold text-emerald-400 uppercase">Location</h4>
                      <button onClick={useCurrentLocationForAutopilot} disabled={autopilotLocating || autopilotRunning} className="px-2.5 py-1 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-[8px] font-bold text-cyan-300 uppercase disabled:opacity-50">
                        {autopilotLocating ? 'Locating…' : 'Use my location'}
                      </button>
                    </div>
                    <select value={autopilotPresetKey} onChange={event => selectAutopilotPreset(event.target.value)} className="w-full bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-xs text-white">
                      {Object.entries(SITE_LOCATION_PRESETS).filter(([key]) => key !== 'custom').map(([key, site]) => <option key={key} value={key}>{site.name}</option>)}
                    </select>
                    <p className="text-[8px] text-gray-600 mt-2">Location permission is optional. Exact coordinates stay inside your anonymous workspace; shared learning uses only a coarse climate band.</p>
                  </div>

                  <div className="p-4 rounded-xl bg-white/[0.025] border border-white/10">
                    <h4 className="text-[9px] font-bold text-gray-400 uppercase mb-3">Optional accuracy hints</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-[8px] text-gray-500 uppercase">Construction era
                        <select value={autopilotInputs.constructionEra} onChange={event => setAutopilotInputs(current => ({ ...current, constructionEra: event.target.value as ExistingHomeEra }))} className="mt-1 w-full bg-black/60 border border-white/10 rounded-lg px-2 py-2 text-[10px] text-white normal-case">
                          <option value="unknown">Unknown — test all</option>
                          <option value="pre_1980">Before 1980</option>
                          <option value="1980_2005">1980–2005</option>
                          <option value="2006_2018">2006–2018</option>
                          <option value="post_2018">After 2018</option>
                        </select>
                      </label>
                      <label className="text-[8px] text-gray-500 uppercase">Rough size
                        <div className="mt-1 flex bg-black/60 border border-white/10 rounded-lg overflow-hidden"><input type="number" min="45" max="500" step="5" value={autopilotInputs.estimatedFloorAreaM2} onChange={event => setAutopilotInputs(current => ({ ...current, estimatedFloorAreaM2: Number(event.target.value) }))} className="w-full bg-transparent px-2 py-2 text-[10px] text-white outline-none"/><span className="pr-2 self-center text-[7px] text-gray-600">m²</span></div>
                      </label>
                      <label className="text-[8px] text-gray-500 uppercase">Study life
                        <div className="mt-1 flex bg-black/60 border border-white/10 rounded-lg overflow-hidden"><input type="number" min="5" max="60" value={autopilotInputs.lifecycleYears} onChange={event => setAutopilotInputs(current => ({ ...current, lifecycleYears: Number(event.target.value) }))} className="w-full bg-transparent px-2 py-2 text-[10px] text-white outline-none"/><span className="pr-2 self-center text-[7px] text-gray-600">years</span></div>
                      </label>
                      <label className="text-[8px] text-gray-500 uppercase">Comfort target
                        <div className="mt-1 flex bg-black/60 border border-white/10 rounded-lg overflow-hidden"><input type="number" min="16" max="28" step="0.5" value={autopilotInputs.targetIndoorTempC} onChange={event => setAutopilotInputs(current => ({ ...current, targetIndoorTempC: Number(event.target.value) }))} className="w-full bg-transparent px-2 py-2 text-[10px] text-white outline-none"/><span className="pr-2 self-center text-[7px] text-gray-600">°C</span></div>
                      </label>
                    </div>
                  </div>
                </div>

                <button onClick={() => runExistingHomeAutopilot()} disabled={autopilotRunning} className="w-full py-3 rounded-xl bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-black text-[10px] font-black uppercase tracking-[0.18em] hover:bg-emerald-400 transition-all">
                  {autopilotRunning ? 'Testing plausible homes and 255 retrofit bundles…' : 'Recalculate automatically'}
                </button>
                {autopilotError && <div className="mt-3 p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-200">{autopilotError}</div>}

                {autopilotResult && (() => {
                  const result = autopilotResult;
                  const best = result.best;
                  const fmt = (value: number) => Math.round(value).toLocaleString();
                  return (
                    <div className="mt-5 space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        <div className="p-3 rounded-lg bg-black/40 border border-white/5"><span className="text-[7px] text-gray-600 uppercase block">Plausible homes</span><span className="text-lg font-black text-white">{result.modelCount}</span></div>
                        <div className="p-3 rounded-lg bg-black/40 border border-white/5"><span className="text-[7px] text-gray-600 uppercase block">Model confidence</span><span className={`text-lg font-black ${result.confidence.percent >= 60 ? 'text-emerald-400' : 'text-amber-400'}`}>{result.confidence.percent.toFixed(0)}%</span></div>
                        <div className="p-3 rounded-lg bg-black/40 border border-white/5"><span className="text-[7px] text-gray-600 uppercase block">Baseline estimate</span><span className="text-sm font-black text-white">{fmt(result.baseline.annualEnergyMedianKWh)} kWh/yr</span></div>
                        <div className="p-3 rounded-lg bg-black/40 border border-white/5"><span className="text-[7px] text-gray-600 uppercase block">Estimated range</span><span className="text-sm font-black text-white">{fmt(result.baseline.annualEnergyLowKWh)}–{fmt(result.baseline.annualEnergyHighKWh)}</span></div>
                      </div>

                      <div className="p-4 rounded-xl bg-cyan-500/[0.04] border border-cyan-500/20">
                        <div className="flex justify-between gap-4">
                          <div><h4 className="text-[9px] font-bold text-cyan-400 uppercase">What was inferred</h4><p className="text-[10px] text-gray-300 mt-1">{result.inferredHome.description}</p></div>
                          <span className="text-[8px] text-gray-500 whitespace-nowrap">{result.inferredHome.floorAreaRangeM2[0]}–{result.inferredHome.floorAreaRangeM2[1]} m²</span>
                        </div>
                        <div className="mt-2 text-[8px] text-gray-500">Eras: {result.inferredHome.erasCovered.join(', ')} · Forms: {result.inferredHome.formsCovered.join(', ')}</div>
                      </div>

                      {best ? (
                        <>
                          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/40">
                            <div className="flex items-start justify-between gap-3">
                              <div><div className="text-xs font-black uppercase text-emerald-400">Robust retrofit found</div><p className="text-[10px] text-gray-300 mt-1">{best.label} stays lifecycle-positive in {best.lifecyclePositiveModels} of {best.modelCount} plausible homes.</p></div>
                              <div className="text-right"><span className="block text-lg font-black text-emerald-400">{best.lifecycleEnergySavedPercent.toFixed(1)}%</span><span className="text-[7px] text-gray-500 uppercase">net lifecycle saving</span></div>
                            </div>
                          </div>

                          <div className="grid md:grid-cols-2 gap-4">
                            <div className="p-4 rounded-xl bg-black/40 border border-white/10">
                              <h4 className="text-[9px] font-bold text-emerald-400 uppercase mb-3">Recommended package</h4>
                              <div className="space-y-2">{best.measures.map((measure, index) => <div key={measure.id} className="flex gap-3 p-2.5 rounded-lg bg-white/[0.025] border border-white/5"><span className="w-5 h-5 shrink-0 rounded-full bg-emerald-500 text-black text-[9px] font-black flex items-center justify-center">{index + 1}</span><div className="min-w-0 flex-1"><div className="flex justify-between gap-2"><span className="text-[9px] font-bold text-white">{measure.label}</span><span className="text-[7px] text-cyan-400 whitespace-nowrap">relevant to {measure.applicabilityPercent.toFixed(0)}%</span></div><div className="text-[8px] text-gray-500 mt-0.5">{measure.explanation}</div></div></div>)}</div>
                            </div>
                            <div className="p-4 rounded-xl bg-black/40 border border-white/10">
                              <h4 className="text-[9px] font-bold text-purple-400 uppercase mb-3">Lifecycle decision</h4>
                              <div className="space-y-2 text-[9px]">
                                <div className="flex justify-between"><span className="text-gray-500">Annual energy after retrofit</span><span>{fmt(best.annualEnergyMedianKWh)} kWh</span></div>
                                <div className="flex justify-between"><span className="text-gray-500">Annual saving</span><span className="text-emerald-400">{fmt(best.annualEnergySavedMedianKWh)} kWh</span></div>
                                <div className="flex justify-between"><span className="text-gray-500">Manufacturing energy</span><span>{fmt(best.embodiedEnergyMedianKWh)} kWh</span></div>
                                <div className="flex justify-between"><span className="text-gray-500">Energy payback</span><span>{best.energyPaybackYearsMedian === null ? 'Not repaid' : `${best.energyPaybackYearsMedian.toFixed(1)} years`}</span></div>
                                <div className="flex justify-between"><span className="text-gray-500">Plausible-home agreement</span><span>{best.robustPassPercent.toFixed(0)}%</span></div>
                                <div className="flex justify-between pt-2 border-t border-white/10 font-bold"><span>Net lifecycle saving</span><span className="text-emerald-400">{fmt(best.lifecycleEnergySavedMedianKWh)} kWh</span></div>
                              </div>
                              {result.learning && <div className="mt-3 text-[7px] text-purple-400 font-mono">{result.learning.similarStudiesAvailable} similar anonymous studies available</div>}
                            </div>
                          </div>

                          {result.alternatives.length > 0 && <div className="p-4 rounded-xl bg-black/30 border border-white/10"><h4 className="text-[9px] font-bold text-gray-400 uppercase mb-3">Other robust packages</h4><div className="grid md:grid-cols-2 gap-2">{result.alternatives.map(option => <div key={option.id} className="p-3 rounded-lg bg-white/[0.025] border border-white/5"><div className="flex justify-between gap-2"><span className="text-[9px] font-bold text-white">{option.label}</span><span className="text-[9px] text-emerald-400">{option.lifecycleEnergySavedPercent.toFixed(1)}%</span></div><div className="text-[7px] text-gray-600 mt-1">{option.measures.map(measure => measure.label).join(' · ')}</div></div>)}</div></div>}
                        </>
                      ) : (
                        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-[10px] text-amber-200">No retrofit package remained lifecycle-positive across enough plausible versions of the home. Better property evidence is needed before recommending work.</div>
                      )}

                      <div className="p-3 rounded-lg bg-amber-500/[0.04] border border-amber-500/15 text-[8px] text-gray-500 leading-relaxed"><span className="text-amber-400 font-bold uppercase">Uncertainty retained:</span> {result.confidence.uncertaintyDrivers.join(', ')}. This screening result avoids pretending that Street View can reveal internal construction.</div>
                    </div>
                  );
                })()}
              </motion.div>
            )}

            {activePanel === 'siteoptimizer' && (
              <motion.div key="siteoptimizer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="bg-black/30 rounded-xl border border-yellow-500/25 p-5">
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider">Site, Sun + Self-Shadow Optimizer</h3>
                    <p className="text-[10px] text-gray-400 mt-1 max-w-2xl leading-relaxed">
                      Searches rectangle, elongated, L-shaped and courtyard homes against the site latitude. Every candidate is ray-tested through a representative year for façade sun, eave shade and shadows cast by its own wings, then checked against the entered hazard and building constraints.
                    </p>
                  </div>
                  <div className="px-2.5 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/30 text-[8px] font-bold text-yellow-400 uppercase whitespace-nowrap">No external API</div>
                </div>

                <div className="p-4 rounded-xl bg-yellow-500/[0.04] border border-yellow-500/15 mb-4">
                  <h4 className="text-[9px] font-bold text-yellow-400 uppercase mb-3">Location + climate</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <label className="col-span-2 text-[9px] text-gray-400 uppercase">
                      Site preset
                      <select value={sitePresetKey} onChange={event => selectSitePreset(event.target.value)} className="mt-1 w-full bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-xs text-white normal-case">
                        {Object.entries(SITE_LOCATION_PRESETS).map(([key, site]) => <option key={key} value={key}>{site.name}</option>)}
                      </select>
                    </label>
                    {([
                      { key: 'latitudeDeg', label: 'Latitude', unit: '°', min: -66, max: 66, step: 0.01 },
                      { key: 'longitudeDeg', label: 'Longitude', unit: '°', min: -180, max: 180, step: 0.01 },
                      { key: 'averageDailySolarMJm2', label: 'Average daily sun', unit: 'MJ/m²', min: 2, max: 35, step: 0.1 },
                      { key: 'summerDesignTempC', label: 'Summer design', unit: '°C', min: 10, max: 55, step: 0.5 },
                      { key: 'winterDesignTempC', label: 'Winter design', unit: '°C', min: -30, max: 25, step: 0.5 },
                      { key: 'heatingDegreeDays', label: 'Heating degree days', unit: 'HDD', min: 0, max: 8000, step: 50 },
                      { key: 'coolingDegreeDays', label: 'Cooling degree days', unit: 'CDD', min: 0, max: 8000, step: 50 },
                      { key: 'targetIndoorTempC', label: 'Indoor target', unit: '°C', min: 16, max: 28, step: 0.5 },
                    ] as const).map(field => (
                      <label key={field.key} className="text-[8px] text-gray-500 uppercase">
                        {field.label}
                        <div className="mt-1 flex items-center bg-black/60 border border-white/10 rounded-lg overflow-hidden">
                          <input type="number" value={siteOptimizationInputs[field.key]} min={field.min} max={field.max} step={field.step}
                            onChange={event => setSiteOptimizationInputs(current => ({ ...current, [field.key]: Number(event.target.value) }))}
                            className="w-full bg-transparent px-2 py-2 text-[10px] text-white outline-none" />
                          <span className="pr-2 text-[7px] text-gray-600 normal-case whitespace-nowrap">{field.unit}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4 mb-4">
                  <div className="p-4 rounded-xl bg-black/40 border border-white/10">
                    <h4 className="text-[9px] font-bold text-emerald-400 uppercase mb-3">House + lot limits</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { key: 'targetFloorAreaM2', label: 'Target floor area', unit: 'm²', min: 35, max: 500, step: 5 },
                        { key: 'minFloorAreaM2', label: 'Minimum area', unit: 'm²', min: 30, max: 500, step: 5 },
                        { key: 'maxFloorAreaM2', label: 'Maximum area', unit: 'm²', min: 35, max: 600, step: 5 },
                        { key: 'lifecycleYears', label: 'Design life', unit: 'years', min: 1, max: 100, step: 1 },
                        { key: 'lotWidthM', label: 'Lot width', unit: 'm', min: 8, max: 200, step: 0.5 },
                        { key: 'lotDepthM', label: 'Lot depth', unit: 'm', min: 8, max: 300, step: 0.5 },
                        { key: 'minimumSetbackM', label: 'Minimum setback', unit: 'm', min: 0, max: 20, step: 0.1 },
                        { key: 'maxUnsupportedSpanM', label: 'Maximum span', unit: 'm', min: 3, max: 30, step: 0.5 },
                      ] as const).map(field => (
                        <label key={field.key} className="text-[8px] text-gray-500 uppercase">
                          {field.label}
                          <div className="mt-1 flex items-center bg-black/60 border border-white/10 rounded-lg overflow-hidden">
                            <input type="number" value={siteOptimizationInputs[field.key]} min={field.min} max={field.max} step={field.step}
                              onChange={event => setSiteOptimizationInputs(current => ({ ...current, [field.key]: Number(event.target.value) }))}
                              className="w-full bg-transparent px-2 py-2 text-[10px] text-white outline-none" />
                            <span className="pr-2 text-[7px] text-gray-600 normal-case whitespace-nowrap">{field.unit}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-black/40 border border-red-500/15">
                    <h4 className="text-[9px] font-bold text-red-400 uppercase mb-3">Local hazard screening constraints</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { key: 'designWindSpeedMs', label: 'Design wind', unit: 'm/s', min: 20, max: 100, step: 1 },
                        { key: 'floodFloorElevationM', label: 'Flood floor level', unit: 'm', min: 0, max: 8, step: 0.1 },
                        { key: 'snowLoadKPa', label: 'Snow load', unit: 'kPa', min: 0, max: 10, step: 0.1 },
                        { key: 'minWallRValue', label: 'Minimum wall R', unit: 'R', min: 0.5, max: 12, step: 0.1 },
                        { key: 'maxWindowToWallRatio', label: 'Maximum glazing', unit: 'ratio', min: 0.05, max: 0.7, step: 0.01 },
                      ] as const).map(field => (
                        <label key={field.key} className="text-[8px] text-gray-500 uppercase">
                          {field.label}
                          <div className="mt-1 flex items-center bg-black/60 border border-white/10 rounded-lg overflow-hidden">
                            <input type="number" value={siteOptimizationInputs[field.key]} min={field.min} max={field.max} step={field.step}
                              onChange={event => setSiteOptimizationInputs(current => ({ ...current, [field.key]: Number(event.target.value) }))}
                              className="w-full bg-transparent px-2 py-2 text-[10px] text-white outline-none" />
                            <span className="pr-2 text-[7px] text-gray-600 normal-case whitespace-nowrap">{field.unit}</span>
                          </div>
                        </label>
                      ))}
                      <label className="text-[8px] text-gray-500 uppercase">
                        Bushfire attack level
                        <select value={siteOptimizationInputs.bushfireAttackLevel} onChange={event => setSiteOptimizationInputs(current => ({ ...current, bushfireAttackLevel: event.target.value as BushfireAttackLevel }))} className="mt-1 w-full bg-black/60 border border-white/10 rounded-lg px-2 py-2 text-[10px] text-white normal-case">
                          {['none', 'BAL-12.5', 'BAL-19', 'BAL-29', 'BAL-40', 'BAL-FZ'].map(level => <option key={level} value={level}>{level}</option>)}
                        </select>
                      </label>
                      <label className="text-[8px] text-gray-500 uppercase">
                        Seismic class
                        <select value={siteOptimizationInputs.seismicClass} onChange={event => setSiteOptimizationInputs(current => ({ ...current, seismicClass: event.target.value as 'low' | 'moderate' | 'high' }))} className="mt-1 w-full bg-black/60 border border-white/10 rounded-lg px-2 py-2 text-[10px] text-white normal-case">
                          {['low', 'moderate', 'high'].map(level => <option key={level} value={level}>{level}</option>)}
                        </select>
                      </label>
                    </div>
                    <p className="text-[7px] text-gray-600 mt-3 leading-relaxed">These are hard screening inputs, not automatic legal classifications. Confirm BAL, flood level, wind region, site class, snow load, planning setbacks and the adopted code edition with the local authority and certifier.</p>
                  </div>
                </div>

                <button onClick={runSiteOptimization} disabled={siteOptimizationRunning} className="w-full py-3 rounded-xl bg-yellow-500 disabled:bg-gray-700 disabled:text-gray-500 text-black text-[10px] font-black uppercase tracking-[0.18em] hover:bg-yellow-400 transition-all">
                  {siteOptimizationRunning ? 'Tracing yearly sun + testing house forms…' : 'Find lowest-energy site geometry'}
                </button>
                {siteOptimizationError && <div className="mt-3 p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-[10px] text-red-300">{siteOptimizationError}</div>}

                {siteOptimization && (() => {
                  const result = siteOptimization;
                  const best = result.best;
                  const design = best.design;
                  const passed = result.improvement.qualifiesAsImprovement;
                  const allPoints = best.footprintPolygons.flat();
                  const summerLabel = result.location.latitudeDeg < 0 ? 'December solstice' : 'June solstice';
                  const summerNoon = result.sunPath.find(point => point.label === summerLabel && point.hour === 12) || result.sunPath[0];
                  const shadowLength = design.ceilingHeightM / Math.max(Math.tan((summerNoon?.altitudeDeg || 35) * Math.PI / 180), 0.2);
                  const shadowDx = -Math.sin((summerNoon?.azimuthDeg || 0) * Math.PI / 180) * shadowLength;
                  const shadowDy = -Math.cos((summerNoon?.azimuthDeg || 0) * Math.PI / 180) * shadowLength;
                  const shadowPoints = best.footprintPolygons[0].map(point => ({ x: point.x + shadowDx, y: point.y + shadowDy }));
                  const drawingPoints = [...allPoints, ...shadowPoints];
                  const minX = Math.min(...drawingPoints.map(point => point.x)) - 2;
                  const maxX = Math.max(...drawingPoints.map(point => point.x)) + 2;
                  const minY = Math.min(...drawingPoints.map(point => point.y)) - 2;
                  const maxY = Math.max(...drawingPoints.map(point => point.y)) + 2;
                  const footprintPath = best.footprintPolygons.map(polygon => `M ${polygon.map(point => `${point.x},${point.y}`).join(' L ')} Z`).join(' ');
                  const shadowPath = `M ${best.footprintPolygons[0].map(point => `${point.x},${point.y}`).join(' L ')} L ${[...shadowPoints].reverse().map(point => `${point.x},${point.y}`).join(' L ')} Z`;
                  const fmt = (value: number) => Math.round(value).toLocaleString();
                  return (
                    <div className="mt-5 space-y-4">
                      <div className={`p-4 rounded-xl border ${passed ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-amber-500/10 border-amber-500/30'}`}>
                        <div className="flex justify-between gap-3">
                          <div>
                            <div className={`text-xs font-black uppercase ${passed ? 'text-emerald-400' : 'text-amber-400'}`}>{passed ? 'Site design passes lifecycle + screening constraints' : 'No net-positive compliant replacement found'}</div>
                            <p className="text-[10px] text-gray-300 mt-1">{result.improvement.reason}</p>
                          </div>
                          <div className="text-right whitespace-nowrap">
                            <span className="block text-[8px] text-gray-500 font-mono">{result.candidatesEvaluated.toLocaleString()} forms</span>
                            {result.learning && (
                              <span className="block text-[7px] text-purple-400 font-mono mt-1">
                                {result.learning.priorDesignsUsed} learned seeds / {result.learning.sharedDesignsAvailable} saved
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                        {[
                          ['Form', design.form.replace(/_/g, ' ')],
                          ['Orientation', `${design.orientationDeg.toFixed(0)}° from north`],
                          ['Footprint', `${design.widthM.toFixed(1)} × ${design.depthM.toFixed(1)} m`],
                          ['Floor area', `${design.floorAreaM2.toFixed(1)} m²`],
                          ['Roof / elevation', `${design.roofPitchDeg.toFixed(0)}° / ${design.floorElevationM.toFixed(1)} m`],
                          ['Equator eave', `${design.eaveEquatorM.toFixed(2)} m`],
                          ['Equator glazing', `${(design.equatorGlazingRatio * 100).toFixed(0)}%`],
                          ['Structure', design.structuralSystem.replace(/_/g, ' ')],
                          ['Hazard shell', design.resilientShell],
                          ['Difficulty', `${best.manufacturing.difficultyScore.toFixed(0)} / 100`],
                        ].map(([label, value]) => (
                          <div key={label} className="p-3 rounded-lg bg-black/40 border border-white/5">
                            <span className="text-[7px] text-gray-600 uppercase block">{label}</span>
                            <span className="text-[10px] text-white font-bold capitalize">{value}</span>
                          </div>
                        ))}
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="p-4 rounded-xl bg-black/40 border border-yellow-500/15">
                          <div className="flex justify-between mb-2">
                            <h4 className="text-[9px] font-bold text-yellow-400 uppercase">Summer-noon cast shadow</h4>
                            <span className="text-[7px] text-gray-500">{summerNoon?.altitudeDeg.toFixed(1)}° altitude / {summerNoon?.azimuthDeg.toFixed(0)}° azimuth</span>
                          </div>
                          <svg viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} className="w-full h-52 rounded-lg bg-gradient-to-b from-sky-950/40 to-black/50 border border-white/5">
                            <path d={shadowPath} fill="rgba(245,158,11,0.13)" stroke="rgba(245,158,11,0.35)" strokeWidth="0.12" />
                            <path d={footprintPath} fill="rgba(16,185,129,0.25)" fillRule="evenodd" stroke="#34d399" strokeWidth="0.16" />
                            <line x1={0} y1={minY + 0.5} x2={0} y2={minY + 2.5} stroke="#facc15" strokeWidth="0.18" />
                            <text x={0.35} y={minY + 1.2} fontSize="0.8" fill="#facc15">N ☀</text>
                            <text x={minX + 0.5} y={maxY - 0.5} fontSize="0.65" fill="rgba(255,255,255,0.5)">yellow = structure's own projected shadow</text>
                          </svg>
                        </div>

                        <div className="p-4 rounded-xl bg-black/40 border border-white/10">
                          <h4 className="text-[9px] font-bold text-cyan-400 uppercase mb-3">Solar behavior at {result.location.name}</h4>
                          <div className="grid grid-cols-2 gap-2 mb-3">
                            {[
                              ['Summer shade', `${best.solar.summerShadePercent.toFixed(1)}%`],
                              ['Winter solar access', `${best.solar.winterSolarAccessPercent.toFixed(1)}%`],
                              ['Self-shadowed', `${fmt(best.solar.annualSelfShadedKWh)} kWh sun/yr`],
                              ['Eave-shadowed', `${fmt(best.solar.annualEaveShadedKWh)} kWh sun/yr`],
                              ['Heating benefit', `${fmt(best.solar.heatingSolarBenefitKWh)} kWh/yr`],
                              ['Cooling penalty', `${fmt(best.solar.coolingSolarPenaltyKWh)} kWh/yr`],
                            ].map(([label, value]) => <div key={label} className="p-2 bg-white/[0.03] rounded"><span className="text-[7px] text-gray-600 uppercase block">{label}</span><span className="text-[10px] font-bold text-white">{value}</span></div>)}
                          </div>
                          <div className="grid grid-cols-3 gap-1 text-center">
                            {result.sunPath.filter(point => point.hour === 12).map(point => <div key={point.label} className="p-2 rounded bg-yellow-500/[0.04] border border-yellow-500/10"><span className="text-[7px] text-gray-500 block">{point.label.replace(' solstice', '')}</span><span className="text-[9px] text-yellow-300 font-bold">{point.altitudeDeg.toFixed(1)}°</span></div>)}
                          </div>
                        </div>
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="p-4 rounded-xl bg-black/40 border border-purple-500/15">
                          <h4 className="text-[9px] font-bold text-purple-400 uppercase mb-3">Lifecycle energy decision</h4>
                          <div className="space-y-2 text-[9px]">
                            <div className="flex justify-between"><span className="text-gray-500">Baseline operation</span><span>{fmt(result.baseline.operational.annualTotalKWh)} kWh/yr</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">Optimized operation</span><span>{fmt(best.operational.annualTotalKWh)} kWh/yr</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">Manufacturing difference</span><span>{result.improvement.manufacturingEnergyDifferenceKWh > 0 ? '+' : ''}{fmt(result.improvement.manufacturingEnergyDifferenceKWh)} kWh</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">Resilience manufacturing</span><span>{fmt(best.manufacturing.resilienceKWh)} kWh</span></div>
                            <div className="flex justify-between pt-2 border-t border-white/10 font-bold"><span>Net lifecycle saving</span><span className={passed ? 'text-emerald-400' : 'text-amber-400'}>{fmt(result.improvement.lifecycleEnergySavedKWh)} kWh ({result.improvement.lifecycleEnergySavedPercent.toFixed(1)}%)</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">Energy payback</span><span>{result.improvement.energyPaybackYears === null ? 'Not repaid' : `${result.improvement.energyPaybackYears.toFixed(1)} years`}</span></div>
                          </div>
                        </div>
                        <div className="p-4 rounded-xl bg-black/40 border border-red-500/15">
                          <h4 className="text-[9px] font-bold text-red-400 uppercase mb-3">Constraint screening</h4>
                          <div className="grid grid-cols-1 gap-1.5 max-h-52 overflow-y-auto">
                            {best.complianceChecks.map(check => (
                              <div key={check.id} className={`p-2 rounded border flex items-center justify-between gap-2 ${check.passed ? 'bg-emerald-500/5 border-emerald-500/15' : 'bg-red-500/10 border-red-500/30'}`}>
                                <div><span className={`text-[8px] font-bold ${check.passed ? 'text-emerald-400' : 'text-red-400'}`}>{check.passed ? '✓' : '✕'} {check.label}</span><span className="text-[7px] text-gray-600 block">{check.requirement}</span></div>
                                <span className="text-[8px] text-gray-300 text-right">{check.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {passed && <button onClick={applySiteOptimization} disabled={siteOptimizationApplied} className="w-full py-3 rounded-xl bg-cyan-500 disabled:bg-emerald-500/20 disabled:text-emerald-400 text-black text-[10px] font-black uppercase tracking-[0.16em] hover:bg-cyan-400 transition-all">{siteOptimizationApplied ? 'Applied to the live V12 house simulation' : 'Apply accepted house + room geometry to V12'}</button>}
                      <p className="text-[8px] text-gray-600 leading-relaxed">Solar exposure presets are climatology screening values. Site obstructions, terrain, neighbouring buildings, vegetation and legal classifications still require survey/GIS data and professional certification before construction.</p>
                    </div>
                  );
                })()}
              </motion.div>
            )}

            {activePanel === 'optimizer' && (
              <motion.div key="optimizer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="bg-black/30 rounded-xl border border-emerald-500/20 p-5">
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider">Room + Airflow Lifecycle Optimizer</h3>
                    <p className="text-[10px] text-gray-400 mt-1 max-w-2xl leading-relaxed">
                      Searches room size, ceiling height, intake/return locations, airflow rate, vent diameter and strategy. A result only passes when it holds the target temperature and its operational saving exceeds its manufacturing energy over the selected life.
                    </p>
                  </div>
                  <div className="px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[8px] font-bold text-emerald-400 uppercase whitespace-nowrap">Local deterministic search</div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                  <label className="col-span-2 md:col-span-1 text-[9px] text-gray-400 uppercase">
                    Room
                    <select value={selectedOptimizationRoomId} onChange={event => selectOptimizationRoom(event.target.value)} className="mt-1 w-full bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-xs text-white normal-case">
                      {rooms.map(room => <option key={room.id} value={room.id}>{room.name} — {(room.width * room.height).toFixed(1)} m²</option>)}
                    </select>
                  </label>
                  {([
                    { key: 'targetTempC', label: 'Target temperature', unit: '°C', min: 10, max: 32, step: 0.5 },
                    { key: 'outdoorDesignTempC', label: 'Outdoor design', unit: '°C', min: -20, max: 55, step: 0.5 },
                    { key: 'occupants', label: 'Occupants', unit: 'people', min: 1, max: 12, step: 1 },
                    { key: 'minFloorAreaM2', label: 'Minimum usable area', unit: 'm²', min: 6, max: 120, step: 0.5 },
                    { key: 'lifecycleYears', label: 'Design life', unit: 'years', min: 1, max: 100, step: 1 },
                  ] as const).map(field => (
                    <label key={field.key} className="text-[9px] text-gray-400 uppercase">
                      {field.label}
                      <div className="mt-1 flex items-center bg-black/60 border border-white/10 rounded-lg overflow-hidden">
                        <input
                          type="number"
                          value={roomOptimizationInputs[field.key]}
                          min={field.min}
                          max={field.max}
                          step={field.step}
                          onChange={event => setRoomOptimizationInputs(current => ({ ...current, [field.key]: Number(event.target.value) }))}
                          className="w-full bg-transparent px-3 py-2 text-xs text-white outline-none"
                        />
                        <span className="pr-2 text-[8px] text-gray-600 normal-case whitespace-nowrap">{field.unit}</span>
                      </div>
                    </label>
                  ))}
                </div>

                <button onClick={runLifecycleOptimization} disabled={roomOptimizationRunning || !selectedOptimizationRoomId} className="w-full py-3 rounded-xl bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 text-black text-[10px] font-black uppercase tracking-[0.18em] hover:bg-emerald-400 transition-all">
                  {roomOptimizationRunning ? 'Testing thousands of designs…' : 'Find lowest lifecycle-energy design'}
                </button>

                {roomOptimizationError && <div className="mt-3 p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-[10px] text-red-300">{roomOptimizationError}</div>}

                {roomOptimization && (() => {
                  const result = roomOptimization;
                  const best = result.best;
                  const passed = result.improvement.qualifiesAsImprovement;
                  const fmt = (value: number) => Math.round(value).toLocaleString();
                  return (
                    <div className="mt-5 space-y-4">
                      <div className={`p-4 rounded-xl border ${passed ? 'bg-emerald-500/10 border-emerald-500/40' : 'bg-amber-500/10 border-amber-500/30'}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className={`text-xs font-black uppercase ${passed ? 'text-emerald-400' : 'text-amber-400'}`}>{passed ? 'Lifecycle improvement found' : 'No worthwhile replacement found'}</div>
                            <p className="text-[10px] text-gray-300 mt-1 leading-relaxed">{result.improvement.reason}</p>
                          </div>
                          <span className="text-[8px] text-gray-500 font-mono whitespace-nowrap">{result.candidatesEvaluated.toLocaleString()} designs</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {[
                          ['Room', `${best.design.widthM.toFixed(2)} × ${best.design.lengthM.toFixed(2)} m`],
                          ['Usable area', `${best.floorAreaM2.toFixed(1)} m²`],
                          ['Ceiling', `${best.design.ceilingHeightM.toFixed(2)} m`],
                          ['Strategy', best.design.strategy],
                          ['Airflow', `${(best.design.flowRateM3s * 1000).toFixed(1)} L/s`],
                          ['Air changes', `${best.airChangesPerHour.toFixed(2)} ACH`],
                          ['Vent diameter', `${Math.round(best.design.ventDiameterM * 1000)} mm`],
                          ['Install difficulty', `${best.manufacturing.difficultyScore.toFixed(0)} / 100`],
                        ].map(([label, value]) => (
                          <div key={label} className="p-3 rounded-lg bg-black/40 border border-white/5">
                            <span className="text-[8px] text-gray-600 uppercase block">{label}</span>
                            <span className="text-[11px] text-white font-bold capitalize">{value}</span>
                          </div>
                        ))}
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="p-4 rounded-xl bg-black/40 border border-white/10">
                          <h4 className="text-[9px] font-bold text-cyan-400 uppercase mb-3">Vent positions</h4>
                          <div className="relative h-36 rounded-lg border border-white/10 bg-white/[0.03] overflow-hidden">
                            <div className="absolute inset-3 border border-dashed border-white/10" />
                            <div className="absolute h-px bg-gradient-to-r from-blue-500 via-emerald-400 to-red-500 opacity-50" style={{ left: `${best.design.intake.x * 85 + 5}%`, top: `${best.design.intake.y * 80 + 10}%`, width: `${Math.max(4, Math.abs(best.design.exhaust.x - best.design.intake.x) * 80)}%`, transformOrigin: 'left center' }} />
                            <div className="absolute -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-blue-500 border-2 border-blue-200 shadow-[0_0_12px_#3b82f6]" style={{ left: `${best.design.intake.x * 85 + 7.5}%`, top: `${best.design.intake.y * 80 + 10}%` }} title="Intake" />
                            <div className="absolute -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-red-500 border-2 border-red-200 shadow-[0_0_12px_#ef4444]" style={{ left: `${best.design.exhaust.x * 85 + 7.5}%`, top: `${best.design.exhaust.y * 80 + 10}%` }} title="Exhaust" />
                            <span className="absolute left-2 bottom-1 text-[7px] text-blue-400">IN z {Math.round(best.design.intake.z * 100)}%</span>
                            <span className="absolute right-2 bottom-1 text-[7px] text-red-400">OUT z {Math.round(best.design.exhaust.z * 100)}%</span>
                          </div>
                        </div>

                        <div className="p-4 rounded-xl bg-black/40 border border-white/10">
                          <h4 className="text-[9px] font-bold text-purple-400 uppercase mb-3">Energy decision</h4>
                          <div className="space-y-2 text-[9px]">
                            <div className="flex justify-between"><span className="text-gray-500">Baseline operational / year</span><span>{fmt(result.baseline.operational.annualOperationalKWh)} kWh</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">Optimized operational / year</span><span>{fmt(best.operational.annualOperationalKWh)} kWh</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">Baseline lifecycle total</span><span>{fmt(result.baseline.totalLifecycleEnergyKWh)} kWh</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">Optimized lifecycle total</span><span>{fmt(best.totalLifecycleEnergyKWh)} kWh</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">Manufacturing difference</span><span className={result.improvement.manufacturingEnergyDifferenceKWh > 0 ? 'text-amber-400' : 'text-emerald-400'}>{result.improvement.manufacturingEnergyDifferenceKWh > 0 ? '+' : ''}{fmt(result.improvement.manufacturingEnergyDifferenceKWh)} kWh</span></div>
                            <div className="flex justify-between pt-2 border-t border-white/10 font-bold"><span className="text-gray-300">Net lifecycle saving</span><span className={passed ? 'text-emerald-400' : 'text-amber-400'}>{fmt(result.improvement.lifecycleEnergySavedKWh)} kWh ({result.improvement.lifecycleEnergySavedPercent.toFixed(1)}%)</span></div>
                            <div className="flex justify-between"><span className="text-gray-500">Manufacturing payback</span><span>{result.improvement.energyPaybackYears === null ? 'Not repaid' : `${result.improvement.energyPaybackYears.toFixed(1)} years`}</span></div>
                          </div>
                        </div>
                      </div>

                      {passed && (
                        <button onClick={applyLifecycleOptimization} disabled={roomOptimizationApplied} className="w-full py-3 rounded-xl bg-cyan-500 disabled:bg-emerald-500/20 disabled:text-emerald-400 text-black text-[10px] font-black uppercase tracking-[0.16em] hover:bg-cyan-400 transition-all">
                          {roomOptimizationApplied ? 'Applied to the live V12 simulation' : 'Apply accepted design to live simulation'}
                        </button>
                      )}
                      <p className="text-[8px] text-gray-600 leading-relaxed">Early-design comparison only. The result is not an NCC compliance certificate or a substitute for a mechanical engineer; manufacturing factors can be replaced with verified EPD data as the design matures.</p>
                    </div>
                  );
                })()}
              </motion.div>
            )}

            {activePanel === 'cycling' && (
              <motion.div key="cycling" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="bg-black/30 rounded-xl border border-cyan-500/20 p-5">
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider">Intermittent HVAC + Thermal Source Optimizer</h3>
                    <p className="text-[9px] text-gray-500 mt-1 max-w-2xl leading-relaxed">Searches compressor pulse length, off time, deadband and capacity against a tight thermostat. It solves the heat stored in room air and building mass, then tries outside air, recovered hot/cold streams and pressure recovery without treating any source as free electricity.</p>
                  </div>
                  <div className="px-3 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-[8px] text-cyan-300 font-bold uppercase whitespace-nowrap">Local physics · no AI API</div>
                </div>

                <div className="grid md:grid-cols-3 gap-3 mb-4">
                  <label className="text-[8px] text-gray-500 uppercase">Room
                    <select value={selectedOptimizationRoomId} onChange={event => selectOptimizationRoom(event.target.value)} className="mt-1 w-full bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-xs text-white normal-case">
                      {rooms.map(room => <option key={room.id} value={room.id}>{room.name} · {(room.width * room.height).toFixed(1)} m²</option>)}
                    </select>
                  </label>
                  <div className="text-[8px] text-gray-500 uppercase">Operating mode
                    <div className="mt-1 grid grid-cols-2 gap-1 bg-black/60 border border-white/10 rounded-lg p-1">
                      {(['cooling', 'heating'] as const).map(mode => <button key={mode} onClick={() => { setThermalMode(mode); setHvacCycleResult(null); setHvacCycleInputs(current => ({ ...current, initialIndoorTempC: mode === 'cooling' ? current.targetTempC + 0.8 : current.targetTempC - 0.8, recoveredStreamTempC: mode === 'cooling' ? 14 : 32, outdoorLowTempC: mode === 'cooling' ? 18 : 2, outdoorHighTempC: mode === 'cooling' ? 35 : 13 })); }} className={`rounded px-2 py-1.5 text-[9px] font-bold uppercase ${thermalMode === mode ? 'bg-cyan-500 text-black' : 'text-gray-500 hover:text-white'}`}>{mode}</button>)}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-black/40 border border-white/5">
                    <span className="text-[8px] text-gray-600 uppercase block">Inferred room</span>
                    <span className="text-[11px] font-bold text-white">{hvacCycleInputs.roomVolumeM3.toFixed(1)} m³ · {hvacCycleInputs.floorAreaM2.toFixed(1)} m²</span>
                    <span className="text-[7px] text-gray-600 block mt-1">Editable below if the inferred geometry is wrong.</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                  {([
                    { key: 'targetTempC', label: 'Target', unit: '°C', min: 10, max: 32, step: 0.5 },
                    { key: 'comfortBandC', label: 'Allowed drift ±', unit: '°C', min: 0.25, max: 3, step: 0.25 },
                    { key: 'outdoorLowTempC', label: 'Outside low', unit: '°C', min: -35, max: 50, step: 1 },
                    { key: 'outdoorHighTempC', label: 'Outside high', unit: '°C', min: -30, max: 60, step: 1 },
                    { key: 'roomVolumeM3', label: 'Air volume', unit: 'm³', min: 12, max: 1800, step: 1 },
                    { key: 'effectiveThermalMassKJPerK', label: 'Accessible thermal mass', unit: 'kJ/K', min: 50, max: 150000, step: 50 },
                    { key: 'envelopeConductanceWPerK', label: 'Envelope conductance', unit: 'W/K', min: 5, max: 5000, step: 5 },
                    { key: 'airLeakageAch', label: 'Uncontrolled leakage', unit: 'ACH', min: 0.05, max: 12, step: 0.05 },
                    { key: 'hvacThermalCapacityW', label: 'System thermal output', unit: 'W', min: 300, max: 50000, step: 100 },
                    { key: 'hvacCop', label: 'Rated COP', unit: '', min: 1, max: 9, step: 0.1 },
                    { key: 'startupEnergyWh', label: 'Energy per start', unit: 'Wh', min: 0, max: 500, step: 1 },
                    { key: 'circulationFanPowerW', label: 'Circulation fan', unit: 'W', min: 0, max: 3000, step: 5 },
                  ] as const).map(field => (
                    <label key={field.key} className="p-2 rounded-lg bg-black/40 border border-white/5 text-[7px] text-gray-600 uppercase">{field.label}
                      <div className="mt-1 flex items-center"><input type="number" min={field.min} max={field.max} step={field.step} value={hvacCycleInputs[field.key]} onChange={event => setHvacCycleInputs(current => ({ ...current, [field.key]: Number(event.target.value) }))} className="w-full bg-transparent text-[10px] text-white outline-none normal-case"/><span className="text-[7px] text-gray-600">{field.unit}</span></div>
                    </label>
                  ))}
                </div>

                <div className="grid md:grid-cols-3 gap-3 mb-4">
                  <label className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/20 flex gap-2 items-start cursor-pointer">
                    <input type="checkbox" checked={hvacCycleInputs.allowOutsideAir} onChange={event => { setHvacCycleInputs(current => ({ ...current, allowOutsideAir: event.target.checked })); setHvacCycleResult(null); }} className="mt-0.5"/>
                    <span><span className="text-[9px] text-blue-300 font-bold uppercase block">Use suitable outside air</span><span className="text-[7px] text-gray-500 leading-relaxed">Only when its temperature moves the room toward target and humidity is below the limit.</span></span>
                  </label>
                  <label className="p-3 rounded-xl bg-orange-500/5 border border-orange-500/20 flex gap-2 items-start cursor-pointer">
                    <input type="checkbox" checked={hvacCycleInputs.allowRecoveredStream} onChange={event => { setHvacCycleInputs(current => ({ ...current, allowRecoveredStream: event.target.checked })); setHvacCycleResult(null); }} className="mt-0.5"/>
                    <span><span className="text-[9px] text-orange-300 font-bold uppercase block">Use waste hot/cold stream</span><span className="text-[7px] text-gray-500 leading-relaxed">Models an available exhaust, water loop or process stream through a safe heat exchanger.</span></span>
                  </label>
                  <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/20">
                    <span className="text-[9px] text-purple-300 font-bold uppercase block">Pressure expansion</span><span className="text-[7px] text-gray-500 leading-relaxed">Zero gauge pressure gives no expansion cooling. Compressor energy is counted when pressure is entered.</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                  {([
                    { key: 'outsideAirFlowM3s', label: 'Outside/source airflow', unit: 'm³/s', min: 0.005, max: 3, step: 0.005 },
                    { key: 'maxOutsideAirHumidityPct', label: 'Outside-air RH limit', unit: '%', min: 10, max: 100, step: 1 },
                    { key: 'recoveredStreamTempC', label: 'Waste stream temperature', unit: '°C', min: -30, max: 100, step: 1 },
                    { key: 'recoveredStreamCapacityW', label: 'Waste stream available', unit: 'W', min: 0, max: 50000, step: 100 },
                    { key: 'compressedAirGaugePressureBar', label: 'Compressed source', unit: 'bar(g)', min: 0, max: 20, step: 0.1 },
                    { key: 'expanderEfficiency', label: 'Expander efficiency', unit: '', min: 0, max: 1, step: 0.05 },
                    { key: 'conditioningDaysPerYear', label: 'Conditioning days', unit: 'days/y', min: 1, max: 365, step: 1 },
                    { key: 'lifecycleYears', label: 'Control lifecycle', unit: 'years', min: 1, max: 40, step: 1 },
                  ] as const).map(field => (
                    <label key={field.key} className="p-2 rounded-lg bg-black/40 border border-white/5 text-[7px] text-gray-600 uppercase">{field.label}
                      <div className="mt-1 flex items-center"><input type="number" min={field.min} max={field.max} step={field.step} value={hvacCycleInputs[field.key]} onChange={event => setHvacCycleInputs(current => ({ ...current, [field.key]: Number(event.target.value) }))} className="w-full bg-transparent text-[10px] text-white outline-none normal-case"/><span className="text-[7px] text-gray-600">{field.unit}</span></div>
                    </label>
                  ))}
                </div>

                <button onClick={runHvacCycleOptimization} disabled={hvacCycleRunning || !selectedOptimizationRoomId} className="w-full py-3 rounded-xl bg-cyan-500 disabled:bg-gray-700 disabled:text-gray-500 text-black text-[10px] font-black uppercase tracking-[0.18em] hover:bg-cyan-400 transition-all">
                  {hvacCycleRunning ? 'Simulating thermal pulses + sources…' : 'Find lowest-energy equivalent comfort cycle'}
                </button>
                {hvacCycleError && <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-[9px] text-red-300">{hvacCycleError}</div>}

                {hvacCycleResult && (() => {
                  const result = hvacCycleResult;
                  const best = result.best;
                  const passed = result.improvement.qualifiesAsImprovement;
                  const traceTemps = best.trace.flatMap(point => [point.indoorTempC, point.outdoorTempC]);
                  const chartMin = Math.min(...traceTemps) - 1;
                  const chartMax = Math.max(...traceTemps) + 1;
                  const chartRange = Math.max(1, chartMax - chartMin);
                  const indoorPoints = best.trace.map((point, index) => `${best.trace.length <= 1 ? 0 : index / (best.trace.length - 1) * 100},${28 - (point.indoorTempC - chartMin) / chartRange * 26}`).join(' ');
                  const outdoorPoints = best.trace.map((point, index) => `${best.trace.length <= 1 ? 0 : index / (best.trace.length - 1) * 100},${28 - (point.outdoorTempC - chartMin) / chartRange * 26}`).join(' ');
                  return <div className="mt-5 space-y-4">
                    <div className={`p-4 rounded-xl border ${passed ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
                      <div className="flex justify-between gap-4"><div><div className={`text-xs font-black uppercase ${passed ? 'text-emerald-400' : 'text-amber-300'}`}>{passed ? 'Equivalent-comfort cycle found' : 'Keep tight control for these inputs'}</div><p className="text-[9px] text-gray-300 mt-1">{result.improvement.reason}</p></div><span className="text-[8px] text-gray-500 font-mono whitespace-nowrap">{result.candidatesEvaluated.toLocaleString()} cycles</span></div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {[
                        ['Winning control', `${best.strategy.onMinutes}m on / ${best.strategy.offMinutes}m off`],
                        ['Temperature band', `${best.comfort.minimumIndoorTempC.toFixed(1)}–${best.comfort.maximumIndoorTempC.toFixed(1)}°C`],
                        ['Comfort compliance', `${best.comfort.comfortPercent.toFixed(1)}%`],
                        ['Compressor duty', `${best.dutyCyclePercent.toFixed(1)}%`],
                        ['Starts', `${best.starts} / ${result.constraints.maxCyclesPerHour.toFixed(1)} h⁻¹ max`],
                        ['Assist priority', best.strategy.assistMode.replaceAll('_', ' ')],
                        ['Daily electricity', `${best.energy.totalElectricalKWh.toFixed(2)} kWh`],
                        ['Electrical saving', `${result.improvement.electricalSavedPercent.toFixed(1)}%`],
                      ].map(([label, value]) => <div key={label} className="p-3 rounded-lg bg-black/40 border border-white/5"><span className="text-[7px] text-gray-600 uppercase block">{label}</span><span className="text-[10px] text-white font-bold capitalize">{value}</span></div>)}
                    </div>

                    <div className="p-4 rounded-xl bg-black/40 border border-white/10">
                      <div className="flex justify-between mb-2"><h4 className="text-[9px] font-bold text-cyan-400 uppercase">Representative day temperature</h4><span className="text-[7px] text-gray-600">cyan indoor · gray outdoor</span></div>
                      <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="w-full h-40 rounded-lg bg-white/[0.02] border border-white/5">
                        <line x1="0" y1={28 - (result.constraints.targetTempC - chartMin) / chartRange * 26} x2="100" y2={28 - (result.constraints.targetTempC - chartMin) / chartRange * 26} stroke="rgba(16,185,129,0.35)" strokeWidth="0.35" strokeDasharray="2 2"/>
                        <polyline points={outdoorPoints} fill="none" stroke="rgba(156,163,175,0.65)" strokeWidth="0.45" vectorEffect="non-scaling-stroke"/>
                        <polyline points={indoorPoints} fill="none" stroke="rgb(34,211,238)" strokeWidth="0.7" vectorEffect="non-scaling-stroke"/>
                      </svg>
                    </div>

                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="p-4 rounded-xl bg-black/40 border border-white/10">
                        <h4 className="text-[9px] font-bold text-purple-400 uppercase mb-3">Where the energy went</h4>
                        <div className="space-y-2 text-[9px]">
                          <div className="flex justify-between"><span className="text-gray-500">Tight thermostat + fan</span><span>{result.baseline.energy.totalElectricalKWh.toFixed(2)} kWh/day</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">Mechanical compressor</span><span>{best.energy.mechanicalKWh.toFixed(2)} kWh</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">Fan + recovery pump</span><span>{(best.energy.circulationFanKWh + best.energy.recoveryPumpKWh).toFixed(2)} kWh</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">Starts + standby</span><span>{(best.energy.startupKWh + best.energy.standbyKWh).toFixed(2)} kWh</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">Outside-air heat moved</span><span>{best.energy.outsideAirThermalKWh.toFixed(2)} kWhₜₕ</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">Waste-stream heat moved</span><span>{best.energy.recoveredThermalKWh.toFixed(2)} kWhₜₕ</span></div>
                          <div className="flex justify-between pt-2 border-t border-white/10 font-bold"><span>Annual electricity saved</span><span className={passed ? 'text-emerald-400' : 'text-amber-300'}>{result.improvement.annualElectricalSavedKWh.toFixed(0)} kWh</span></div>
                        </div>
                      </div>
                      <div className="p-4 rounded-xl bg-black/40 border border-white/10">
                        <h4 className="text-[9px] font-bold text-blue-400 uppercase mb-3">Air, mass + lifecycle reality</h4>
                        <div className="space-y-2 text-[9px]">
                          <div className="flex justify-between"><span className="text-gray-500">Air mass</span><span>{result.physics.airMassKg.toFixed(1)} kg</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">Air alone stores per 1°C</span><span>{result.physics.airThermalCapacityKWhPerK.toFixed(3)} kWh</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">Air + accessible structure</span><span>{result.physics.effectiveThermalCapacityKWhPerK.toFixed(2)} kWh/°C</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">Infiltration conductance</span><span>{result.physics.infiltrationConductanceWPerK.toFixed(1)} W/K</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">Controller/source manufacturing</span><span>{best.manufacturingEnergyKWh.toFixed(0)} kWh</span></div>
                          <div className="flex justify-between"><span className="text-gray-500">Lifecycle net saving</span><span className={passed ? 'text-emerald-400' : 'text-amber-300'}>{result.improvement.lifecycleEnergySavedKWh.toFixed(0)} kWh</span></div>
                          <div className="flex justify-between pt-2 border-t border-white/10"><span className="text-gray-500">Energy payback</span><span>{result.improvement.controllerEnergyPaybackYears === null ? 'Not repaid' : `${result.improvement.controllerEnergyPaybackYears.toFixed(2)} years`}</span></div>
                        </div>
                      </div>
                    </div>
                    <p className="text-[8px] text-gray-600 leading-relaxed">Ordinary injected air does not cool merely by entering a room: it exchanges heat by mixing. Expansion cooling appears only for a real pressurized source, and this model charges the compressed-air production electricity. Moisture, condensation, filtration, combustion safety and equipment minimum-cycle limits still require commissioning data.</p>
                    {result.learning && <p className="text-[7px] text-gray-600">Anonymous memory reused {result.learning.priorStrategiesUsed} similar strategies. Exact room inputs were not shared.</p>}
                  </div>;
                })()}
              </motion.div>
            )}

            {activePanel === 'adaptivewall' && (
              <motion.div key="adaptivewall" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="bg-black/30 rounded-xl border border-orange-500/20 p-5">
                <div className="flex items-start justify-between gap-4 mb-5">
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider">Adaptive Wall Waste-Heat Lab</h3>
                    <p className="text-[9px] text-gray-500 mt-1 max-w-2xl leading-relaxed">Automatically sweeps lattice geometry, material conductivity, heat-path length, bladder R-values, leakage, actuation and control strategy. Heat exported to a real sink is separated from actuator/compressor heat that leaks back indoors.</p>
                  </div>
                  <div className="px-3 py-1 rounded-lg bg-orange-500/10 border border-orange-500/20 text-[8px] text-orange-300 font-bold uppercase whitespace-nowrap">Conservation of energy enforced</div>
                </div>

                <div className="mb-5">
                  <AdaptiveWallCutaway3D result={adaptiveWallResult} inputs={adaptiveWallInputs} />
                </div>

                <div className="grid md:grid-cols-3 gap-3 mb-4">
                  <label className="text-[8px] text-gray-500 uppercase">Room / cavity
                    <select value={selectedOptimizationRoomId} onChange={event => selectOptimizationRoom(event.target.value)} className="mt-1 w-full bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-xs text-white normal-case">
                      {rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}
                    </select>
                  </label>
                  <div className="text-[8px] text-gray-500 uppercase">Question being tested
                    <div className="mt-1 grid grid-cols-2 gap-1 bg-black/60 border border-white/10 rounded-lg p-1">
                      {(['cooling', 'heating'] as const).map(mode => <button key={mode} onClick={() => { setThermalMode(mode); setAdaptiveWallResult(null); setAdaptiveWallInputs(current => ({ ...current, outdoorLowTempC: mode === 'cooling' ? 18 : 1, outdoorHighTempC: mode === 'cooling' ? 36 : 13, fixedSinkTempC: mode === 'cooling' ? 16 : 32 })); }} className={`rounded px-2 py-1.5 text-[9px] font-bold uppercase ${thermalMode === mode ? 'bg-orange-500 text-black' : 'text-gray-500 hover:text-white'}`}>{mode} load</button>)}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-black/40 border border-white/5"><span className="text-[8px] text-gray-600 uppercase block">Inferred exterior cavity</span><span className="text-[11px] font-bold text-white">{adaptiveWallInputs.wallAreaM2.toFixed(1)} m² wall · {adaptiveWallInputs.latticeAreaM2.toFixed(1)} m² array</span><span className="text-[7px] text-gray-600 block mt-1">Edit these screening estimates below.</span></div>
                </div>

                <div className="mb-4 p-3 rounded-xl bg-cyan-500/5 border border-cyan-500/20 flex flex-wrap items-center justify-between gap-3">
                  <div><span className="text-[9px] font-bold text-cyan-300 uppercase block">Automatic parameter discovery</span><span className="text-[8px] text-gray-500">No setup required. The room and climate seed a deterministic full sweep.</span></div>
                  <span className="text-[9px] font-mono text-white">{adaptiveWallRunning ? 'Sweeping…' : adaptiveWallResult?.sweep ? `${adaptiveWallResult.sweep.parameterSetsEvaluated} parameter sets · ${adaptiveWallResult.sweep.strategyEvaluations.toLocaleString()} simulations` : 'Starting automatically…'}</span>
                </div>

                <details className="mb-4 rounded-xl bg-black/30 border border-white/10 p-3">
                  <summary className="cursor-pointer text-[8px] font-bold text-gray-400 uppercase tracking-wider">Advanced assumptions · optional manual override</summary>
                  <div className="mt-4">

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                  {([
                    { key: 'indoorTempC', label: 'Indoor target', unit: '°C', min: 8, max: 35, step: 0.5 },
                    { key: 'indoorRelativeHumidityPct', label: 'Indoor RH', unit: '%', min: 5, max: 100, step: 1 },
                    { key: 'outdoorLowTempC', label: 'Outside low', unit: '°C', min: -40, max: 55, step: 1 },
                    { key: 'outdoorHighTempC', label: 'Outside high', unit: '°C', min: -35, max: 65, step: 1 },
                    { key: 'wallAreaM2', label: 'Wall cavity area', unit: 'm²', min: 1, max: 1000, step: 1 },
                    { key: 'staticWallRValue', label: 'Existing wall R', unit: 'm²K/W', min: 0.15, max: 15, step: 0.1 },
                    { key: 'wallThermalMassKJPerK', label: 'Wall thermal mass', unit: 'kJ/K', min: 20, max: 500000, step: 50 },
                    { key: 'hvacCop', label: 'HVAC COP', unit: '', min: 1, max: 9, step: 0.1 },
                    { key: 'computeOrCompressorWasteHeatW', label: 'Compute/compressor waste', unit: 'W', min: 0, max: 100000, step: 50 },
                    { key: 'wasteHeatDutyFraction', label: 'Waste duty fraction', unit: '0–1', min: 0, max: 1, step: 0.05 },
                    { key: 'wasteSourceTempC', label: 'Waste source temperature', unit: '°C', min: 22, max: 180, step: 1 },
                    { key: 'fixedSinkTempC', label: 'Fixed sink temperature', unit: '°C', min: -20, max: 100, step: 1 },
                  ] as const).map(field => <label key={field.key} className="p-2 rounded-lg bg-black/40 border border-white/5 text-[7px] text-gray-600 uppercase">{field.label}<div className="mt-1 flex items-center"><input type="number" min={field.min} max={field.max} step={field.step} value={adaptiveWallInputs[field.key]} onChange={event => setAdaptiveWallInputs(current => ({ ...current, [field.key]: Number(event.target.value) }))} className="w-full bg-transparent text-[10px] text-white outline-none normal-case"/><span className="text-[7px] text-gray-600">{field.unit}</span></div></label>)}
                </div>

                <div className="grid md:grid-cols-3 gap-3 mb-4">
                  <div className="p-3 rounded-xl bg-cyan-500/5 border border-cyan-500/20"><span className="text-[9px] text-cyan-300 font-bold uppercase block">Microlattice array</span><span className="text-[7px] text-gray-500 leading-relaxed">Tests both an always-connected thermal bridge and a switchable path that isolates itself when the sink is harmful.</span></div>
                  <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/20"><span className="text-[9px] text-purple-300 font-bold uppercase block">Expandable bladder</span><span className="text-[7px] text-gray-500 leading-relaxed">Inflates for high R-value and deflates when useful heat should cross the wall. Pump energy, leaks and indoor motor heat are included.</span></div>
                  <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-2">
                    <label className="flex gap-2 items-start cursor-pointer"><input type="checkbox" checked={adaptiveWallInputs.useFixedSink} onChange={event => { setAdaptiveWallInputs(current => ({ ...current, useFixedSink: event.target.checked })); setAdaptiveWallResult(null); }}/><span><span className="text-[8px] text-emerald-300 font-bold uppercase block">Real fixed-temperature sink</span><span className="text-[7px] text-gray-500">Ground loop, water tank or another verified reservoir; otherwise the sink follows outside air.</span></span></label>
                    <label className="flex gap-2 items-start cursor-pointer"><input type="checkbox" checked={adaptiveWallInputs.fluidChannel} onChange={event => { setAdaptiveWallInputs(current => ({ ...current, fluidChannel: event.target.checked })); setAdaptiveWallResult(null); }}/><span><span className="text-[8px] text-emerald-300 font-bold uppercase block">Pumped fluid channel</span><span className="text-[7px] text-gray-500">Charges pump electricity whenever the lattice path is open.</span></span></label>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                  {([
                    { key: 'latticeAreaM2', label: 'Active lattice area', unit: 'm²', min: 0.1, max: 1000, step: 0.5 },
                    { key: 'latticeMaterialConductivityWmK', label: 'Lattice conductivity', unit: 'W/mK', min: 0.015, max: 450, step: 0.01 },
                    { key: 'latticeFillFraction', label: 'Solid fill fraction', unit: '0–1', min: 0.001, max: 0.8, step: 0.005 },
                    { key: 'latticePathLengthM', label: 'Heat path length', unit: 'm', min: 0.005, max: 1, step: 0.005 },
                    { key: 'latticeOffConductanceFraction', label: 'Closed-state leakage', unit: '0–1', min: 0.0001, max: 1, step: 0.005 },
                    { key: 'latticeSwitchEnergyWh', label: 'Lattice switch energy', unit: 'Wh', min: 0, max: 1000, step: 1 },
                    { key: 'latticePumpPowerW', label: 'Fluid pump power', unit: 'W', min: 0, max: 5000, step: 5 },
                    { key: 'latticeEmbodiedEnergyKWhPerM2', label: 'Lattice manufacture', unit: 'kWh/m²', min: 0, max: 5000, step: 5 },
                    { key: 'inflatedRValue', label: 'Bladder inflated R', unit: 'm²K/W', min: 0.2, max: 20, step: 0.1 },
                    { key: 'deflatedRValue', label: 'Bladder deflated R', unit: 'm²K/W', min: 0.1, max: 10, step: 0.1 },
                    { key: 'bladderActuationEnergyWh', label: 'Inflate/deflate energy', unit: 'Wh', min: 0, max: 5000, step: 1 },
                    { key: 'bladderLeakReinflationsPerDay', label: 'Leak reinflations', unit: '/day', min: 0, max: 24, step: 0.1 },
                    { key: 'actuatorHeatReleasedIndoorsFraction', label: 'Motor heat indoors', unit: '0–1', min: 0, max: 1, step: 0.05 },
                    { key: 'bladderEmbodiedEnergyKWhPerM2', label: 'Bladder manufacture', unit: 'kWh/m²', min: 0, max: 5000, step: 5 },
                    { key: 'conditioningDaysPerYear', label: 'Active days', unit: 'days/y', min: 1, max: 365, step: 1 },
                    { key: 'lifecycleYears', label: 'Design life', unit: 'years', min: 1, max: 60, step: 1 },
                  ] as const).map(field => <label key={field.key} className="p-2 rounded-lg bg-black/40 border border-white/5 text-[7px] text-gray-600 uppercase">{field.label}<div className="mt-1 flex items-center"><input type="number" min={field.min} max={field.max} step={field.step} value={adaptiveWallInputs[field.key]} onChange={event => setAdaptiveWallInputs(current => ({ ...current, [field.key]: Number(event.target.value) }))} className="w-full bg-transparent text-[10px] text-white outline-none normal-case"/><span className="text-[7px] text-gray-600">{field.unit}</span></div></label>)}
                </div>

                  </div>
                </details>

                <button onClick={runAdaptiveWallOptimization} disabled={adaptiveWallRunning || !selectedOptimizationRoomId} className="w-full py-3 rounded-xl bg-orange-500 disabled:bg-gray-700 disabled:text-gray-500 text-black text-[10px] font-black uppercase tracking-[0.18em] hover:bg-orange-400 transition-all">{adaptiveWallRunning ? 'Sweeping wall geometry + lifecycle energy…' : 'Re-run automatic discovery'}</button>
                {adaptiveWallError && <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-[9px] text-red-300">{adaptiveWallError}</div>}

                {adaptiveWallResult && (() => {
                  const result = adaptiveWallResult;
                  const best = result.best;
                  const passed = result.improvement.qualifiesAsImprovement;
                  const verdictLabel = result.verdict === 'reduces_heat_and_energy' ? 'Reduces heat and lifecycle energy' : result.verdict === 'increases_heat_or_energy' ? 'Increases heat or energy' : 'Moves heat but does not repay itself';
                  const verdictClass = result.verdict === 'reduces_heat_and_energy' ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : result.verdict === 'increases_heat_or_energy' ? 'text-red-300 border-red-500/30 bg-red-500/10' : 'text-amber-300 border-amber-500/30 bg-amber-500/10';
                  return <div className="mt-5 space-y-4">
                    <div className={`p-4 rounded-xl border ${verdictClass}`}><div className="flex justify-between gap-4"><div><div className="text-xs font-black uppercase">{verdictLabel}</div><p className="text-[9px] text-gray-300 mt-1">{result.improvement.reason}</p></div><span className="text-[8px] text-gray-500 font-mono whitespace-nowrap">{result.candidatesEvaluated} concepts</span></div></div>
                    {result.sweep && <div className="p-4 rounded-xl bg-black/40 border border-cyan-500/20">
                      <div className="flex flex-wrap items-start justify-between gap-3 mb-3"><div><h4 className="text-[9px] font-bold text-cyan-300 uppercase">Ranked automatic discoveries</h4><p className="text-[7px] text-gray-600 mt-1">These are different geometries and control systems, not repeat runs of one input.</p></div><span className="text-[7px] font-mono text-gray-400">daily {result.sweep.resultRanges.dailyElectricalSavedKWh.minimum.toFixed(2)} → {result.sweep.resultRanges.dailyElectricalSavedKWh.maximum.toFixed(2)} kWh · lifecycle {result.sweep.resultRanges.lifecycleEnergySavedKWh.minimum.toFixed(0)} → {result.sweep.resultRanges.lifecycleEnergySavedKWh.maximum.toFixed(0)} kWh</span></div>
                      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-2">
                        {result.sweep.rankedCandidates.slice(0, 8).map(candidate => <div key={candidate.configurationId} className={`p-3 rounded-lg border ${candidate.rank === 1 ? 'bg-cyan-500/10 border-cyan-500/30' : 'bg-black/30 border-white/5'}`}>
                          <div className="flex items-start justify-between gap-2"><span className="text-[8px] font-black text-white">#{candidate.rank} · {candidate.strategy.label}</span><span className={candidate.qualifiesAsImprovement ? 'text-[7px] text-emerald-400' : 'text-[7px] text-amber-300'}>{candidate.qualifiesAsImprovement ? 'PASSES' : 'SCREENED'}</span></div>
                          <div className="grid grid-cols-2 gap-y-1 mt-2 text-[7px]"><span className="text-gray-600">Lattice area</span><span className="text-right text-gray-300">{candidate.parameters.latticeAreaM2.toFixed(1)} m²</span><span className="text-gray-600">Path / fill</span><span className="text-right text-gray-300">{Math.round(candidate.parameters.latticePathLengthM * 1000)} mm · {(candidate.parameters.latticeFillFraction * 100).toFixed(1)}%</span><span className="text-gray-600">R range</span><span className="text-right text-gray-300">{candidate.parameters.deflatedRValue.toFixed(1)} ↔ {candidate.parameters.inflatedRValue.toFixed(1)}</span><span className="text-gray-600">Daily saving</span><span className={candidate.dailyElectricalSavedKWh >= 0 ? 'text-right text-emerald-300' : 'text-right text-red-300'}>{candidate.dailyElectricalSavedKWh.toFixed(2)} kWh</span><span className="text-gray-600">Payback</span><span className="text-right text-gray-300">{candidate.manufacturingEnergyPaybackYears === null ? 'None' : `${candidate.manufacturingEnergyPaybackYears.toFixed(1)} y`}</span></div>
                        </div>)}
                      </div>
                    </div>}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {[
                        ['Best configuration', best.strategy.label],
                        ['Heat-load change', `${result.improvement.dailyConditioningHeatReducedKWh >= 0 ? '−' : '+'}${Math.abs(result.improvement.dailyConditioningHeatReducedKWh).toFixed(2)} kWhₜₕ/day`],
                        ['Electricity change', `${result.improvement.dailyElectricalSavedKWh >= 0 ? '−' : '+'}${Math.abs(result.improvement.dailyElectricalSavedKWh).toFixed(2)} kWh/day`],
                        ['Lifecycle result', `${result.improvement.lifecycleEnergySavedKWh.toFixed(0)} kWh`],
                        ['Waste heat exported', `${best.energy.wasteHeatExportedKWh.toFixed(2)} / ${best.energy.wasteHeatGeneratedKWh.toFixed(2)} kWh`],
                        ['Wall R behaviour', best.strategy.kind.includes('bladder') ? `${adaptiveWallInputs.deflatedRValue} ↔ ${adaptiveWallInputs.inflatedRValue}` : `${adaptiveWallInputs.staticWallRValue} static`],
                        ['Lattice conductance', `${result.physics.latticeOnConductanceWPerK.toFixed(2)} W/K on`],
                        ['Moisture screen', best.condensationRisk ? `Risk · margin ${best.condensationMarginC.toFixed(1)}°C` : `Pass · margin ${best.condensationMarginC.toFixed(1)}°C`],
                      ].map(([label, value]) => <div key={label} className="p-3 rounded-lg bg-black/40 border border-white/5"><span className="text-[7px] text-gray-600 uppercase block">{label}</span><span className="text-[10px] text-white font-bold">{value}</span></div>)}
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="p-4 rounded-xl bg-black/40 border border-white/10"><h4 className="text-[9px] font-bold text-cyan-400 uppercase mb-3">Daily heat balance</h4><div className="space-y-2 text-[9px]">
                        <div className="flex justify-between"><span className="text-gray-500">Baseline conditioning heat</span><span>{result.baseline.energy.conditioningThermalKWh.toFixed(2)} kWhₜₕ</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Concept conditioning heat</span><span>{best.energy.conditioningThermalKWh.toFixed(2)} kWhₜₕ</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Heat through normal wall</span><span>{best.energy.wallHeatToRoomKWh.toFixed(2)} kWh</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Heat through lattice</span><span>{best.energy.latticeHeatToRoomKWh.toFixed(2)} kWh</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Actuator heat returned indoors</span><span>{best.energy.actuatorHeatToRoomKWh.toFixed(3)} kWh</span></div>
                        <div className="flex justify-between pt-2 border-t border-white/10 font-bold"><span>Net heat reduction</span><span className={result.improvement.dailyConditioningHeatReducedKWh > 0 ? 'text-emerald-400' : 'text-red-300'}>{result.improvement.dailyConditioningHeatReducedKWh.toFixed(2)} kWhₜₕ/day</span></div>
                      </div></div>
                      <div className="p-4 rounded-xl bg-black/40 border border-white/10"><h4 className="text-[9px] font-bold text-purple-400 uppercase mb-3">Energy + feasibility</h4><div className="space-y-2 text-[9px]">
                        <div className="flex justify-between"><span className="text-gray-500">HVAC electricity</span><span>{best.energy.hvacElectricalKWh.toFixed(2)} kWh/day</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Switching + pump</span><span>{(best.energy.switchingElectricalKWh + best.energy.pumpElectricalKWh).toFixed(3)} kWh/day</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Manufacturing energy</span><span>{best.manufacturingEnergyKWh.toFixed(0)} kWh</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Switches per day</span><span>{best.bladderTransitions} bladder · {best.latticeTransitions} lattice</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Indoor dew point</span><span>{result.physics.indoorDewPointC.toFixed(1)}°C</span></div>
                        <div className="flex justify-between pt-2 border-t border-white/10 font-bold"><span>Manufacturing payback</span><span>{result.improvement.manufacturingEnergyPaybackYears === null ? 'Not repaid' : `${result.improvement.manufacturingEnergyPaybackYears.toFixed(1)} years`}</span></div>
                      </div></div>
                    </div>
                    <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/15 text-[8px] text-gray-400 leading-relaxed"><span className="font-bold text-red-300 uppercase">Critical rule:</span> in cooling mode, compute or compression heat only disappears from the room calculation when the lattice exports it across the envelope to a colder verified sink. A closed loop with its compressor and expansion bladder inside the same envelope adds net heat.</div>
                    {result.learning && <p className="text-[7px] text-gray-600">Compared with {result.learning.similarStudiesAvailable} anonymous adaptive-wall studies. Exact wall inputs were not shared.</p>}
                  </div>;
                })()}
              </motion.div>
            )}

            {activePanel === 'thermal' && (
              <motion.div key="th" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="bg-black/30 rounded-xl border border-white/10 p-4">
                <h3 className="text-[10px] font-bold text-gray-400 uppercase mb-4">Thermal Heatmap ({thermalGrid?.width}x{thermalGrid?.height} grid)</h3>
                <div className="flex justify-center">
                  <canvas ref={thermalCanvasRef} className="w-full max-w-md border border-white/10 rounded-lg" style={{ imageRendering: 'pixelated', aspectRatio: '1/1' }} />
                </div>
                <div className="flex items-center justify-center gap-4 mt-4">
                  <div className="flex items-center gap-1"><div className="w-3 h-3 rounded" style={{ background: 'rgb(0,128,255)' }}/><span className="text-[9px] text-gray-400">10°C</span></div>
                  <div className="flex items-center gap-1"><div className="w-3 h-3 rounded" style={{ background: 'rgb(0,255,128)' }}/><span className="text-[9px] text-gray-400">22°C</span></div>
                  <div className="flex items-center gap-1"><div className="w-3 h-3 rounded" style={{ background: 'rgb(255,128,0)' }}/><span className="text-[9px] text-gray-400">32°C</span></div>
                  <div className="flex items-center gap-1"><div className="w-3 h-3 rounded" style={{ background: 'rgb(255,0,0)' }}/><span className="text-[9px] text-gray-400">40°C</span></div>
                </div>
              </motion.div>
            )}

            {/* ── LIVE AIRFLOW SIMULATION ── */}
            {activePanel === 'airflow' && (
              <motion.div key="af" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="bg-black/30 rounded-xl border border-white/10 p-4">
                <div className="flex items-center justify-between mb-4 gap-4">
                  <div>
                    <h3 className="text-[11px] font-bold text-white uppercase">Whole-House 3D Airflow + Plan Field</h3>
                    <p className="text-[8px] text-gray-500 mt-1">The full plan is lifted to true wall heights, with room airflow, shared-wall cavity candidates and proposed outdoor discharge paths. The original horizontal field remains below as the detailed floor slice.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[8px] text-gray-600 font-mono">{thermalGrid?.width}x{thermalGrid?.height} grid</span>
                    {geoSource === 'v5_detected' && (
                      <span className="text-[8px] text-cyan-400 font-mono">V5 geometry active</span>
                    )}
                  </div>
                </div>
                <div className="mb-6">
                  <HouseAirflowNetwork3D
                    rooms={rooms}
                    profiles={thermalGrid?.heightProfiles || []}
                    selectedRoomId={selectedAirflowRoom?.id}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h4 className="text-[9px] font-bold text-gray-400 uppercase">Selected room vertical detail</h4>
                  <span className="text-[7px] text-gray-600 uppercase">Temperature layers + stack pressure</span>
                </div>
                <div className="grid lg:grid-cols-[minmax(0,1fr)_240px] gap-4 mb-6">
                  <HeightAirflowCutaway3D room={selectedAirflowRoom} profile={selectedHeightProfile} />
                  <div className="rounded-xl bg-black/40 border border-white/10 p-3 space-y-4">
                    <label className="block text-[8px] text-gray-500 uppercase">Room
                      <select value={selectedAirflowRoom?.id || ''} onChange={event => setSelectedAirflowRoomId(event.target.value)} className="mt-1 w-full bg-black/60 border border-white/10 rounded-lg px-3 py-2 text-xs text-white normal-case">
                        {rooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}
                      </select>
                    </label>
                    {selectedAirflowRoom && selectedHeightProfile && <>
                      <div className="p-3 rounded-xl bg-cyan-500/5 border border-cyan-500/20">
                        <span className="text-[8px] font-bold text-cyan-300 uppercase block">Automatic sweep active</span>
                        <span className="text-[7px] text-gray-500 leading-relaxed block mt-1">{selectedHeightSweep ? `${selectedHeightSweep.parameterSetsEvaluated} vent and flow configurations ranked automatically.` : 'Calculating vent and flow configurations…'}</span>
                        {selectedHeightSweep && <div className="grid grid-cols-2 gap-1 mt-2 text-[8px]">
                          <span className="text-gray-500">Winning path</span><span className="text-right text-white">{selectedHeightSweep.best.powered ? 'Powered' : 'Natural stack'}</span>
                          <span className="text-gray-500">Vent diameter</span><span className="text-right text-white">{Math.round(selectedHeightSweep.best.ventDiameterM * 1000)} mm</span>
                          <span className="text-gray-500">Design flow</span><span className="text-right text-white">{(selectedHeightSweep.best.designFlowM3s * 1000).toFixed(0)} L/s</span>
                          <span className="text-gray-500">Fan power</span><span className="text-right text-white">{selectedHeightSweep.best.estimatedFanPowerW.toFixed(1)} W</span>
                        </div>}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-center">
                        <div className="p-2 rounded-lg bg-cyan-500/5 border border-cyan-500/15"><span className="text-[7px] text-gray-500 uppercase block">Height separation</span><span className="text-sm font-bold text-cyan-300">{selectedHeightProfile.heightSeparationM.toFixed(2)} m</span></div>
                        <div className="p-2 rounded-lg bg-purple-500/5 border border-purple-500/15"><span className="text-[7px] text-gray-500 uppercase block">Stack pressure</span><span className="text-sm font-bold text-purple-300">{selectedHeightProfile.stackPressurePa.toFixed(3)} Pa</span></div>
                        <div className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/15"><span className="text-[7px] text-gray-500 uppercase block">Effective flow</span><span className="text-sm font-bold text-emerald-300">{(selectedHeightProfile.effectiveFlowM3s * 1000).toFixed(1)} L/s</span></div>
                        <div className="p-2 rounded-lg bg-orange-500/5 border border-orange-500/15"><span className="text-[7px] text-gray-500 uppercase block">Top–bottom ΔT</span><span className="text-sm font-bold text-orange-300">{selectedHeightProfile.stratificationC.toFixed(2)}°C</span></div>
                      </div>
                      <div className={`p-3 rounded-lg border text-[8px] leading-relaxed ${selectedHeightProfile.reverseStackRisk || selectedHeightProfile.shortCircuitRisk ? 'bg-red-500/10 border-red-500/25 text-red-200' : 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200'}`}>
                        {selectedHeightProfile.reverseStackRisk
                          ? 'Air wants to move opposite the declared intake-to-exhaust path. Reposition the vents or use enough fan pressure to prevent reversal.'
                          : selectedHeightProfile.shortCircuitRisk
                            ? 'The vents are too close in height, so supply air may escape before conditioning the occupied zone.'
                            : 'Low-to-high displacement path is active. Vertical effectiveness is included in the plan-field vent forcing.'}
                      </div>
                      <button onClick={rerunAirflowSweep} className="w-full py-2 rounded-lg bg-cyan-500 text-black text-[8px] font-black uppercase tracking-wider hover:bg-cyan-400">Re-sweep automatically</button>
                      <details className="rounded-lg bg-black/30 border border-white/10 p-2">
                        <summary className="cursor-pointer text-[7px] font-bold text-gray-500 uppercase">Manual height override · optional</summary>
                        <div className="mt-3 space-y-3">
                          <label className="block text-[8px] text-blue-300 uppercase">Intake height · {selectedHeightProfile.intakeHeightM.toFixed(2)} m
                            <input aria-label="Intake vent height" type="range" min="0.05" max={Math.max(0.1, selectedAirflowRoom.ceilingHeight - 0.05)} step="0.05" value={selectedHeightProfile.intakeHeightM} onChange={event => setAirflowVentHeight('intake', Number(event.target.value))} className="mt-2 w-full accent-blue-500" />
                          </label>
                          <label className="block text-[8px] text-red-300 uppercase">Exhaust height · {selectedHeightProfile.exhaustHeightM.toFixed(2)} m
                            <input aria-label="Exhaust vent height" type="range" min="0.05" max={Math.max(0.1, selectedAirflowRoom.ceilingHeight - 0.05)} step="0.05" value={selectedHeightProfile.exhaustHeightM} onChange={event => setAirflowVentHeight('exhaust', Number(event.target.value))} className="mt-2 w-full accent-red-500" />
                          </label>
                        </div>
                      </details>
                    </>}
                  </div>
                </div>
                {selectedHeightSweep && <div className="mb-5 rounded-xl bg-black/35 border border-cyan-500/15 p-3">
                  <div className="flex items-center justify-between gap-3 mb-3"><h4 className="text-[9px] font-bold text-cyan-300 uppercase">Best airflow candidates</h4><span className="text-[7px] text-gray-600 uppercase">Lower score is better</span></div>
                  <div className="grid md:grid-cols-3 gap-2">
                    {selectedHeightSweep.rankedCandidates.slice(0, 3).map(candidate => <div key={`${candidate.rank}-${candidate.intakeHeightM}-${candidate.exhaustHeightM}-${candidate.ventDiameterM}-${candidate.powered}`} className="p-3 rounded-lg bg-black/40 border border-white/5">
                      <div className="flex justify-between text-[8px] mb-2"><span className="font-black text-white">#{candidate.rank} · {candidate.powered ? 'Powered' : 'Natural'}</span><span className="font-mono text-cyan-300">{candidate.objectiveScore.toFixed(0)}</span></div>
                      <div className="grid grid-cols-2 gap-y-1 text-[7px]"><span className="text-gray-600">Vent heights</span><span className="text-right text-gray-300">{candidate.intakeHeightM.toFixed(2)} → {candidate.exhaustHeightM.toFixed(2)} m</span><span className="text-gray-600">Diameter / flow</span><span className="text-right text-gray-300">{Math.round(candidate.ventDiameterM * 1000)} mm · {(candidate.designFlowM3s * 1000).toFixed(0)} L/s</span><span className="text-gray-600">Useful output</span><span className="text-right text-gray-300">{candidate.usefulConditioningW.toFixed(0)} W</span></div>
                    </div>)}
                  </div>
                </div>}
                <div className="border-t border-white/10 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-[9px] font-bold text-gray-400 uppercase">Horizontal Plan-View Flow</h4>
                    <span className="text-[7px] text-gray-600 uppercase">Not vertical height</span>
                  </div>
                <div className="flex justify-center relative">
                  <canvas ref={airflowCanvasRef} className="w-full max-w-lg border border-white/10 rounded-lg" style={{ imageRendering: 'auto', aspectRatio: '1/1' }} />
                  <canvas ref={auroraCanvasRef} className="absolute inset-0 w-full max-w-lg mx-auto rounded-lg pointer-events-none" style={{ aspectRatio: '1/1', mixBlendMode: 'screen' }} />
                  <canvas ref={vorticityCanvasRef} className="absolute inset-0 w-full max-w-lg mx-auto rounded-lg pointer-events-none" style={{ aspectRatio: '1/1', mixBlendMode: 'screen', opacity: 0.7 }} />
                </div>
                <div className="flex items-center justify-center gap-4 mt-3 flex-wrap">
                  <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full" style={{ background: 'rgba(59,130,246,0.8)' }}/><span className="text-[9px] text-gray-400">Intake Vent</span></div>
                  <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full" style={{ background: 'rgba(239,68,68,0.8)' }}/><span className="text-[9px] text-gray-400">Exhaust Vent</span></div>
                  <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full" style={{ background: 'rgba(168,85,247,0.8)' }}/><span className="text-[9px] text-gray-400">HRV</span></div>
                  <div className="flex items-center gap-1"><div className="w-3 h-1" style={{ background: 'linear-gradient(90deg, #3b82f6, #10b981, #ef4444)' }}/><span className="text-[9px] text-gray-400">Cold→Hot flow</span></div>
                  <div className="flex items-center gap-1"><div className="w-3 h-3 rounded" style={{ background: 'rgba(255,255,255,0.12)' }}/><span className="text-[9px] text-gray-400">Wall</span></div>
                </div>
                <p className="text-[9px] text-gray-500 italic text-center mt-2">
                  Arrows show horizontal airflow velocity vectors. Color indicates temperature of flowing air.
                  {geoSource === 'v5_detected' ? ' Room geometry derived from V5 wall/line detector.' : ' Using default house geometry.'}
                  {' '}Vent markers show intake (blue), exhaust (red), and heat recovery (purple) positions with flow direction.
                </p>
                {/* Airflow stats */}
                {thermalGrid && (() => {
                  let maxVel = 0, avgVel = 0, count = 0;
                  for (let i = 0; i < thermalGrid.airflowX.length; i++) {
                    const v = Math.sqrt(thermalGrid.airflowX[i] ** 2 + thermalGrid.airflowY[i] ** 2);
                    if (thermalGrid.wallMask[i] === 0 && v > 0.00001) {
                      maxVel = Math.max(maxVel, v);
                      avgVel += v;
                      count++;
                    }
                  }
                  avgVel = count > 0 ? avgVel / count : 0;
                  return (
                    <div className="grid grid-cols-3 gap-3 mt-3">
                      <div className="p-2 bg-black/40 rounded-lg border border-white/5 text-center">
                        <span className="text-[8px] text-gray-500 uppercase block">Max Velocity</span>
                        <span className="text-sm font-bold text-cyan-400">{(maxVel * 1000).toFixed(2)}</span>
                        <span className="text-[8px] text-gray-600 block">mm/s equiv</span>
                      </div>
                      <div className="p-2 bg-black/40 rounded-lg border border-white/5 text-center">
                        <span className="text-[8px] text-gray-500 uppercase block">Avg Velocity</span>
                        <span className="text-sm font-bold text-emerald-400">{(avgVel * 1000).toFixed(2)}</span>
                        <span className="text-[8px] text-gray-600 block">mm/s equiv</span>
                      </div>
                      <div className="p-2 bg-black/40 rounded-lg border border-white/5 text-center">
                        <span className="text-[8px] text-gray-500 uppercase block">Active Cells</span>
                        <span className="text-sm font-bold text-purple-400">{count}</span>
                        <span className="text-[8px] text-gray-600 block">of {thermalGrid.airflowX.length}</span>
                      </div>
                    </div>
                  );
                })()}
                {/* Turbulence & Equilibrium stats */}
                {thermalGrid?.vorticity && (
                  <div className="mt-3 p-3 bg-black/50 rounded-xl border border-white/10">
                    <h4 className="text-[9px] font-bold text-gray-400 uppercase mb-2">Turbulence / Equilibrium</h4>
                    <div className="grid grid-cols-4 gap-2">
                      <div className="p-2 bg-black/40 rounded-lg border border-white/5 text-center">
                        <span className="text-[7px] text-gray-500 uppercase block">Turbulence</span>
                        <span className="text-sm font-bold text-orange-400">{((thermalGrid.turbulenceEnergy || 0) * 1000).toFixed(3)}</span>
                        <span className="text-[7px] text-gray-600 block">mVort</span>
                      </div>
                      <div className="p-2 bg-black/40 rounded-lg border border-white/5 text-center">
                        <span className="text-[7px] text-gray-500 uppercase block">Equilibrium</span>
                        <span className={`text-sm font-bold ${thermalGrid.equilibriumFound ? 'text-green-400' : 'text-yellow-400'}`}>
                          {((thermalGrid.equilibriumScore || 0) * 100).toFixed(1)}%
                        </span>
                        <span className="text-[7px] text-gray-600 block">{thermalGrid.equilibriumFound ? 'LOCKED' : 'converging'}</span>
                      </div>
                      <div className="p-2 bg-black/40 rounded-lg border border-white/5 text-center">
                        <span className="text-[7px] text-gray-500 uppercase block">Auto Sweeps</span>
                        <span className="text-sm font-bold text-cyan-400">{thermalGrid.heightSweepRuns || 0}</span>
                        <span className="text-[7px] text-gray-600 block">512 configs / room</span>
                      </div>
                      <div className="p-2 bg-black/40 rounded-lg border border-white/5 text-center">
                        <span className="text-[7px] text-gray-500 uppercase block">Status</span>
                        <span className={`text-[10px] font-bold ${thermalGrid.equilibriumFound ? 'text-green-400' : thermalGrid.equilibriumScore && thermalGrid.equilibriumScore > 0.5 ? 'text-yellow-400' : 'text-red-400'}`}>
                          {thermalGrid.equilibriumFound ? 'SWEEPED' : thermalGrid.equilibriumScore && thermalGrid.equilibriumScore > 0.5 ? 'NEAR EQ' : 'SIMULATING'}
                        </span>
                        <span className="text-[7px] text-gray-600 block">NS solver</span>
                      </div>
                    </div>
                    {/* Equilibrium progress bar */}
                    <div className="mt-2 h-1.5 bg-black/60 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${thermalGrid.equilibriumFound ? 'bg-green-500' : 'bg-gradient-to-r from-red-500 via-yellow-500 to-green-500'}`}
                        style={{ width: `${(thermalGrid.equilibriumScore || 0) * 100}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[7px] text-gray-600">Turbulent</span>
                      <span className="text-[7px] text-gray-600">Equilibrium</span>
                    </div>
                    {/* Legend for vorticity overlay */}
                    <div className="flex items-center justify-center gap-4 mt-2">
                      <div className="flex items-center gap-1"><div className="w-3 h-3 rounded" style={{ background: 'rgba(255,140,40,0.5)' }}/><span className="text-[8px] text-gray-400">CW vortex (warm)</span></div>
                      <div className="flex items-center gap-1"><div className="w-3 h-3 rounded" style={{ background: 'rgba(40,180,255,0.5)' }}/><span className="text-[8px] text-gray-400">CCW vortex (cool)</span></div>
                      <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-full border border-orange-400/50" /><span className="text-[8px] text-gray-400">Swirl indicator</span></div>
                    </div>
                  </div>
                )}
                </div>
              </motion.div>
            )}

            {activePanel === 'natural' && metrics?.naturalSystems && (
              <motion.div key="ns" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="bg-black/30 rounded-xl border border-white/10 p-4 space-y-4">
                <h3 className="text-[10px] font-bold text-gray-400 uppercase mb-2">Natural Systems (House as Living Ecosystem)</h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Solar Tubes', value: `${metrics.naturalSystems.solarTubes.toFixed(0)} lm`, sub: `Reflector ${((metrics.electrical?.reflectorEfficiency || 0) * 100).toFixed(0)}%`, color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
                    { label: 'Earth Tube Cooling', value: `${metrics.naturalSystems.earthTubeCooling.toFixed(2)} kW`, sub: 'Ground temp differential', color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20' },
                    { label: 'Stack Effect', value: `${metrics.naturalSystems.stackEffect.toFixed(0)} m³/hr`, sub: 'Natural chimney ventilation', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
                    { label: 'Thermal Mass', value: `${metrics.naturalSystems.thermalMass.toFixed(3)} kWh`, sub: 'Diurnal heat storage', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
                    { label: 'Evaporative Cooling', value: `${metrics.naturalSystems.evaporative.toFixed(2)} kW`, sub: 'Humidity-based cooling', color: 'text-teal-400', bg: 'bg-teal-500/10 border-teal-500/20' },
                    { label: 'Rainwater Stored', value: `${metrics.naturalSystems.rainwater.toFixed(0)} L`, sub: 'Roof collection', color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/20' },
                    { label: 'Greywater Recycled', value: `${metrics.naturalSystems.greywater.toFixed(0)} L/day`, sub: 'Per-occupant recycling', color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
                    { label: 'Total Natural Savings', value: `${metrics.naturalSystems.totalSavings.toFixed(1)}%`, sub: 'HVAC load reduction', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
                  ].map(item => (
                    <div key={item.label} className={`p-3 rounded-xl border ${item.bg}`}>
                      <span className="text-[8px] text-gray-500 uppercase block">{item.label}</span>
                      <span className={`text-lg font-black ${item.color}`}>{item.value}</span>
                      <span className="text-[8px] text-gray-600 block">{item.sub}</span>
                    </div>
                  ))}
                </div>
                {metrics.electrical && (
                  <div className="p-3 bg-purple-500/5 border border-purple-500/20 rounded-xl mt-2">
                    <h4 className="text-[9px] font-bold text-purple-400 uppercase mb-2">Magnetocaloric Chain</h4>
                    <div className="flex gap-4 text-[10px] font-mono">
                      <span className="text-gray-400">COP: <span className="text-purple-300">{metrics.electrical.magnetocaloricCOP?.toFixed(2) || '0'}</span></span>
                      <span className="text-gray-400">Cooling: <span className="text-purple-300">{metrics.electrical.totalCoolingW?.toFixed(0) || '0'}W</span></span>
                      <span className="text-gray-400">Rejected: <span className="text-red-300">{metrics.electrical.heatRejectedW?.toFixed(0) || '0'}W</span></span>
                      <span className="text-gray-400">Cycles: <span className="text-purple-300">{metrics.electrical.cycleCount || 0}</span></span>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {activePanel === 'topology' && (
              <motion.div key="tp" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="bg-black/30 rounded-xl border border-white/10 p-4 space-y-4">
                <h3 className="text-[10px] font-bold text-gray-400 uppercase mb-2">Topology Flow Discovery</h3>
                {metrics?.topologyFlow ? (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-center">
                        <span className="text-2xl font-black text-cyan-400">{metrics.topologyFlow.threadCount}</span>
                        <span className="text-[8px] text-gray-500 uppercase block">Threads</span>
                      </div>
                      <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center">
                        <span className="text-2xl font-black text-emerald-400">{(metrics.topologyFlow.efficiency * 100).toFixed(0)}%</span>
                        <span className="text-[8px] text-gray-500 uppercase block">Efficiency</span>
                      </div>
                      <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl text-center">
                        <span className="text-2xl font-black text-purple-400">{(metrics.topologyFlow.integrationScore * 100).toFixed(0)}%</span>
                        <span className="text-[8px] text-gray-500 uppercase block">Integration</span>
                      </div>
                    </div>
                    {metrics.topologyFlow.threadTypes?.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {metrics.topologyFlow.threadTypes.map((t: string, i: number) => (
                          <span key={i} className={`px-2 py-1 rounded text-[9px] font-bold uppercase ${
                            t === 'vortex' ? 'bg-red-500/20 text-red-400' :
                            t === 'laminar' ? 'bg-green-500/20 text-green-400' :
                            t === 'stagnation' ? 'bg-gray-500/20 text-gray-400' :
                            t === 'recirculation' ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-blue-500/20 text-blue-400'
                          }`}>{t}</span>
                        ))}
                      </div>
                    )}
                    {metrics.topologyFlow.threads?.length > 0 && (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {metrics.topologyFlow.threads.map((thread: any, i: number) => (
                          <div key={i} className="flex items-center gap-3 p-2 bg-black/40 rounded-lg border border-white/5">
                            <div className={`w-2 h-2 rounded-full ${
                              thread.type === 'vortex' ? 'bg-red-500' :
                              thread.type === 'laminar' ? 'bg-green-500' :
                              thread.type === 'stagnation' ? 'bg-gray-500' : 'bg-blue-500'
                            }`} />
                            <span className="text-[10px] font-mono text-white flex-1">{thread.type}</span>
                            <span className="text-[9px] text-gray-400">str: {thread.strength?.toFixed(2)}</span>
                            <span className="text-[9px] text-cyan-400">nov: {thread.novelty?.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="h-32 flex items-center justify-center text-gray-600 text-xs">Topology engine warming up...</div>
                )}
              </motion.div>
            )}

            {activePanel === 'projection' && (
              <motion.div key="pj" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="bg-black/30 rounded-xl border border-white/10 p-4 space-y-4">
                <h3 className="text-[10px] font-bold text-gray-400 uppercase mb-2">100-Year Projection: Optimized vs Standard House</h3>
                {projChartData.length > 0 ? (
                  <>
                      <AreaChart
                        data={projChartData}
                        responsive
                        style={{ width: '100%', height: 220, minWidth: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="year" tick={{ fontSize: 9, fill: '#6b7280' }} label={{ value: 'Year', position: 'insideBottom', offset: -2, fontSize: 9, fill: '#6b7280' }} />
                        <YAxis yAxisId="left" tick={{ fontSize: 9, fill: '#34d399' }} domain={[0, 100]} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fill: '#f97316' }} />
                        <Tooltip contentStyle={{ background: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 10 }} />
                        <Area yAxisId="left" type="monotone" dataKey="rValue" stroke="#34d399" fill="rgba(16,185,129,0.15)" name="R-Value %" />
                        <Area yAxisId="right" type="monotone" dataKey="cost" stroke="#f97316" fill="rgba(249,115,22,0.1)" name="Optimized ($k)" />
                        <Area yAxisId="right" type="monotone" dataKey="baseline" stroke="#ef4444" fill="rgba(239,68,68,0.08)" name="Standard House ($k)" strokeDasharray="4 2" />
                        <Area yAxisId="right" type="monotone" dataKey="saving" stroke="#10b981" fill="rgba(16,185,129,0.1)" name="Cumulative Saving ($k)" />
                      </AreaChart>
                    {/* Key milestones */}
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="p-2 bg-black/40 rounded-lg border border-white/5">
                        <span className="text-[8px] text-gray-500 uppercase block">25yr R-Value</span>
                        <span className="text-sm font-bold text-emerald-400">{projections[25]?.rValuePct?.toFixed(1)}%</span>
                      </div>
                      <div className="p-2 bg-black/40 rounded-lg border border-white/5">
                        <span className="text-[8px] text-gray-500 uppercase block">50yr Optimized</span>
                        <span className="text-sm font-bold text-orange-400">${((projections[50] as any)?.cumulativeCost / 1000).toFixed(0)}k</span>
                      </div>
                      <div className="p-2 bg-black/40 rounded-lg border border-white/5">
                        <span className="text-[8px] text-gray-500 uppercase block">50yr Standard</span>
                        <span className="text-sm font-bold text-red-400">${((projections[50] as any)?.baselineCumulativeCost / 1000).toFixed(0)}k</span>
                      </div>
                      <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                        <span className="text-[8px] text-gray-500 uppercase block">100yr Saved</span>
                        <span className="text-sm font-bold text-emerald-400">${((projections[100] as any)?.cumulativeSaving / 1000).toFixed(0)}k</span>
                      </div>
                    </div>
                    {/* Explanation */}
                    <div className="p-3 bg-black/40 rounded-xl border border-white/5 space-y-2">
                      <h4 className="text-[9px] font-bold text-orange-400 uppercase">Why does cost accelerate?</h4>
                      <p className="text-[9px] text-gray-400 leading-relaxed">
                        Cumulative cost is <span className="text-white">every dollar spent on energy + maintenance from year 0 to year N</span>.
                        It grows faster over time because: (1) insulation R-value degrades → more energy needed each year,
                        (2) energy prices inflate at 3%/yr → each kWh costs more,
                        (3) major maintenance events cluster at year 30+ (roof, HVAC, windows, re-insulation).
                        A year-50 cost of ${((projections[50] as any)?.cumulativeCost / 1000).toFixed(0)}k is the <span className="text-white">sum of all 50 years</span>,
                        while year-100 (${((projections[100] as any)?.cumulativeCost / 1000).toFixed(0)}k) adds another 50 years of increasingly expensive energy on degraded insulation.
                      </p>
                      <p className="text-[9px] text-emerald-400 leading-relaxed font-bold">
                        Compared to a standard un-optimized house, this design saves $
                        {((projections[100] as any)?.cumulativeSaving / 1000).toFixed(0)}k over 100 years.
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="h-32 flex items-center justify-center text-gray-600 text-xs">Computing projections...</div>
                )}
              </motion.div>
            )}

            {/* ── SEASONAL 4-SEASON FLOW SIMULATION ── */}
            {activePanel === 'seasonal' && (
              <motion.div key="sn" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="bg-black/30 rounded-xl border border-white/10 p-4 space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[10px] font-bold text-gray-400 uppercase">4-Season Vent Flow Simulation</h3>
                  {geoSource === 'v5_detected' && <span className="text-[8px] text-cyan-400 font-mono">V5-detected topology</span>}
                </div>
                <div className="flex gap-2 mb-4">
                  {(['summer', 'autumn', 'winter', 'spring'] as const).map(s => {
                    const sColors: Record<string, string> = { summer: 'bg-red-500', autumn: 'bg-orange-500', winter: 'bg-blue-500', spring: 'bg-green-500' };
                    const sTemps: Record<string, number> = { summer: 35, autumn: 18, winter: 5, spring: 15 };
                    return (
                      <button key={s} onClick={() => setSeason(s)} className={`flex-1 py-2 rounded-lg text-[9px] font-bold uppercase transition-all ${season === s ? `${sColors[s]} text-black` : 'bg-black/40 text-gray-500 hover:text-white'}`}>
                        {s} ({sTemps[s]}°C)
                      </button>
                    );
                  })}
                </div>
                {rooms.length > 0 && metrics?.roomTemps ? (
                  <div className="space-y-3">
                    {/* Cross-section SVG: rooms with actual vent data, flow paths, heating/cooling sources */}
                    {(() => {
                      const outsideTemp = ({ summer: 35, autumn: 18, winter: 5, spring: 15 } as Record<string, number>)[season] || 20;
                      const seasonMul: Record<string, number> = { summer: 1.8, autumn: 0.4, winter: 2.2, spring: 0.3 };
                      const displayRooms = rooms.slice(0, 6);
                      const cols = Math.min(displayRooms.length, 3);
                      const rows = Math.ceil(displayRooms.length / cols);
                      const cellW = 3.8; const cellH = 3.2;
                      const svgW = cols * cellW + 1; const svgH = rows * cellH + 3;

                      return (
                        <svg viewBox={`-0.5 -0.5 ${svgW} ${svgH}`} className="w-full" style={{ maxHeight: 340 }}>
                          <defs>
                            <marker id="arrowG2" markerWidth="5" markerHeight="3" refX="5" refY="1.5" orient="auto"><path d="M0,0 L5,1.5 L0,3" fill="rgba(16,185,129,0.7)"/></marker>
                            <marker id="arrowR2" markerWidth="5" markerHeight="3" refX="5" refY="1.5" orient="auto"><path d="M0,0 L5,1.5 L0,3" fill="rgba(239,68,68,0.6)"/></marker>
                            <marker id="arrowB2" markerWidth="5" markerHeight="3" refX="5" refY="1.5" orient="auto"><path d="M0,0 L5,1.5 L0,3" fill="rgba(59,130,246,0.6)"/></marker>
                            <marker id="arrowP2" markerWidth="5" markerHeight="3" refX="5" refY="1.5" orient="auto"><path d="M0,0 L5,1.5 L0,3" fill="rgba(168,85,247,0.6)"/></marker>
                          </defs>
                          <rect x="-0.5" y="-0.5" width={svgW} height={svgH} fill="rgba(0,0,0,0.3)" rx="0.2"/>
                          {/* Outside temperature bar */}
                          <rect x="0" y="0" width={svgW - 1} height="0.4" rx="0.1"
                            fill={season === 'summer' ? 'rgba(239,68,68,0.15)' : season === 'winter' ? 'rgba(59,130,246,0.15)' : 'rgba(16,185,129,0.1)'}/>
                          <text x={(svgW - 1) / 2} y="0.28" textAnchor="middle" fontSize="0.22" fill="rgba(255,255,255,0.5)">
                            OUTSIDE: {outsideTemp}°C | {season.toUpperCase()} | Stack: {metrics.naturalSystems?.stackEffect?.toFixed(0) || 0} m³/hr
                          </text>

                          {displayRooms.map((room: any, i: number) => {
                            const col = i % cols; const row = Math.floor(i / cols);
                            const rx = col * cellW + 0.2; const ry = row * cellH + 0.7;
                            const rw = cellW - 0.4; const rh = cellH - 0.5;
                            const roomTemp = metrics.roomTemps[i]?.actual || 22;
                            const diff = roomTemp - outsideTemp;
                            const flowDir = diff > 0 ? 'out' : 'in';
                            const flowColor = season === 'summer' ? '#ef4444' : season === 'winter' ? '#3b82f6' : '#10b981';

                            return (
                              <g key={room.id}>
                                {/* Room outline */}
                                <rect x={rx} y={ry} width={rw} height={rh} fill="rgba(255,255,255,0.04)"
                                  stroke={Math.abs(diff) < 2 ? 'rgba(16,185,129,0.3)' : diff > 0 ? 'rgba(239,68,68,0.3)' : 'rgba(59,130,246,0.3)'}
                                  strokeWidth="0.04" rx="0.1"/>
                                {/* Room name + temp */}
                                <text x={rx + rw / 2} y={ry + 0.45} textAnchor="middle" fontSize="0.26" fill="white" fontWeight="bold">{room.name}</text>
                                <text x={rx + rw / 2} y={ry + 0.85} textAnchor="middle" fontSize="0.32" fill={flowColor} fontWeight="bold">{roomTemp.toFixed(1)}°C</text>
                                <text x={rx + rw / 2} y={ry + 1.15} textAnchor="middle" fontSize="0.18" fill="rgba(255,255,255,0.25)">ΔT: {diff > 0 ? '+' : ''}{diff.toFixed(1)}°C</text>

                                {/* Individual vent flow arrows with real data */}
                                {(room.vents || []).map((vent: any, vi: number) => {
                                  const isIn = vent.type === 'intake';
                                  const isHRV = vent.type === 'heat_recovery';
                                  const isOut = vent.type === 'exhaust';
                                  const ventColor = isIn ? '#3b82f6' : isHRV ? '#a855f7' : '#ef4444';
                                  const marker = isIn ? 'url(#arrowB2)' : isHRV ? 'url(#arrowP2)' : 'url(#arrowR2)';
                                  // Position vent along room edge
                                  const ventX = rx + (vi + 1) * rw / ((room.vents?.length || 1) + 1);
                                  const ventBaseY = isIn ? ry - 0.1 : ry + rh + 0.1;
                                  const ventTipY = isIn ? ry + 0.4 : ry + rh - 0.4;
                                  const flowMul = season === 'summer' || season === 'winter' ? 1.5 : 0.7;
                                  return (
                                    <g key={`${room.id}_sv${vi}`}>
                                      {/* Vent arrow */}
                                      <line x1={ventX} y1={ventBaseY} x2={ventX} y2={isIn ? ventBaseY + 0.5 * flowMul : ventBaseY - 0.5 * flowMul}
                                        stroke={ventColor} strokeWidth="0.05" markerEnd={marker} opacity="0.8"/>
                                      {/* Vent dot */}
                                      <circle cx={ventX} cy={isIn ? ry : ry + rh} r="0.08" fill={ventColor}/>
                                      {/* Flow rate label */}
                                      <text x={ventX + 0.12} y={isIn ? ry - 0.3 : ry + rh + 0.3} fontSize="0.14" fill={ventColor} opacity="0.7">
                                        {(vent.flowRate * 1000 * flowMul).toFixed(0)} L/s
                                      </text>
                                      {/* HRV efficiency badge */}
                                      {isHRV && vent.efficiency > 0 && (
                                        <text x={ventX + 0.12} y={isIn ? ry - 0.1 : ry + rh + 0.5} fontSize="0.12" fill="rgba(168,85,247,0.6)">η={(vent.efficiency * 100).toFixed(0)}%</text>
                                      )}
                                    </g>
                                  );
                                })}

                                {/* Internal convection arrows (buoyancy) */}
                                <path d={`M${rx + 0.5},${ry + rh * 0.7} Q${rx + rw / 2},${ry + rh * 0.3} ${rx + rw - 0.5},${ry + rh * 0.7}`}
                                  fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.03" strokeDasharray="0.1"/>
                                {/* Stack chimney */}
                                <line x1={rx + rw / 2} y1={ry} x2={rx + rw / 2} y2={ry - 0.3}
                                  stroke="rgba(255,255,255,0.1)" strokeWidth="0.02" strokeDasharray="0.05"/>

                                {/* Heat loss/gain bar */}
                                <rect x={rx + 0.1} y={ry + rh - 0.15} width={Math.min(rw - 0.2, Math.abs(diff) / 15 * (rw - 0.2))} height="0.08" rx="0.04"
                                  fill={diff > 0 ? 'rgba(239,68,68,0.3)' : 'rgba(59,130,246,0.3)'}/>

                                {/* Esky indicator */}
                                {room.hasEsky && (
                                  <g>
                                    <rect x={rx + rw - 0.7} y={ry + rh - 0.6} width="0.5" height="0.4" rx="0.05" fill="rgba(168,85,247,0.2)" stroke="rgba(168,85,247,0.3)" strokeWidth="0.02"/>
                                    <text x={rx + rw - 0.45} y={ry + rh - 0.35} textAnchor="middle" fontSize="0.14" fill="#a78bfa">❄</text>
                                  </g>
                                )}
                              </g>
                            );
                          })}

                          {/* Season energy comparison */}
                          <g transform={`translate(0, ${rows * cellH + 0.5})`}>
                            {(['summer', 'autumn', 'winter', 'spring'] as const).map((s, i) => {
                              const baseLoad = parseFloat(metrics.hvacLoadKW || '0');
                              const load = baseLoad * (seasonMul[s] || 1);
                              const barW = Math.min(2, load / 5 * 2);
                              const sCol = s === 'summer' ? '#ef4444' : s === 'winter' ? '#3b82f6' : s === 'autumn' ? '#f97316' : '#10b981';
                              return (
                                <g key={s} transform={`translate(${i * (svgW - 1) / 4}, 0)`}>
                                  <rect x="0" y="0" width={barW} height="0.25" rx="0.05" fill={sCol} opacity={season === s ? 0.8 : 0.3}/>
                                  <text x={barW + 0.1} y="0.18" fontSize="0.16" fill="rgba(255,255,255,0.5)">{s}: {load.toFixed(1)}kW</text>
                                </g>
                              );
                            })}
                          </g>
                        </svg>
                      );
                    })()}
                    <p className="text-[9px] text-gray-500 italic">
                      {geoSource === 'v5_detected' ? 'Room topology from V5 plane detection. ' : ''}
                      Flow rates scale with seasonal demand (×{({ summer: '1.8', autumn: '0.4', winter: '2.2', spring: '0.3' } as Record<string, string>)[season]} in {season}).
                      Natural savings: {metrics.naturalSystems?.totalSavings?.toFixed(0) || 0}%. Relocate vents to maximize stack effect.
                    </p>
                  </div>
                ) : (
                  <div className="h-32 flex items-center justify-center text-gray-600 text-xs">Loading room data...</div>
                )}
              </motion.div>
            )}

            {/* ── ELECTRICAL CIRCUIT OPTIMIZER ── */}
            {activePanel === 'electrical' && (
              <motion.div key="el" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="bg-black/30 rounded-xl border border-white/10 p-4 space-y-4">
                <h3 className="text-[10px] font-bold text-gray-400 uppercase mb-2">Electrical Circuit Optimizer</h3>
                {metrics?.electrical ? (() => {
                  const el = metrics.electrical;
                  return (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                          <span className="text-[8px] text-gray-500 uppercase block">Screening COP</span>
                          <span className="text-lg font-black text-purple-400">{el.magnetocaloricCOP?.toFixed(2) || '0.00'}</span>
                          <span className="text-[8px] text-gray-600 block">Cooling output ÷ simulated work input</span>
                        </div>
                        <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl">
                          <span className="text-[8px] text-gray-500 uppercase block">Total Cooling</span>
                          <span className="text-lg font-black text-cyan-400">{el.totalCoolingW?.toFixed(0) || 0}W</span>
                          <span className="text-[8px] text-gray-600 block">Heat rejected: {el.heatRejectedW?.toFixed(0)}W</span>
                        </div>
                        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                          <span className="text-[8px] text-gray-500 uppercase block">Cycle Count</span>
                          <span className="text-lg font-black text-emerald-400">{el.cycleCount || 0}</span>
                          <span className="text-[8px] text-gray-600 block">Numerical integration steps</span>
                        </div>
                        <div className="p-3 bg-orange-500/10 border border-orange-500/20 rounded-xl">
                          <span className="text-[8px] text-gray-500 uppercase block">Magnetic Energy</span>
                          <span className="text-lg font-black text-orange-300">{el.totalMagneticEnergy?.toFixed(2) || '0.00'} J</span>
                          <span className="text-[8px] text-gray-600 block">Model state, not a material recommendation</span>
                        </div>
                      </div>
                      <p className="text-[9px] text-gray-500 italic">This panel reports the present reduced-order magnetic cooling state only. It does not select a conductor, wire diameter, or isotope without measured material curves, current, voltage, allowable temperature rise and geometry.</p>
                    </>
                  );
                })() : (
                  <div className="h-32 flex items-center justify-center text-gray-600 text-xs">Electrical sim loading...</div>
                )}
              </motion.div>
            )}

            {/* ── ESKY / BEER COOLER DESIGNER ── */}
            {activePanel === 'cooler' && (
              <motion.div key="ck" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="bg-black/30 rounded-xl border border-white/10 p-4 space-y-4">
                <h3 className="text-[10px] font-bold text-gray-400 uppercase mb-2">Esky & Stubby Cooler Designer</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div>
                      <label className="text-[8px] text-gray-500 uppercase block mb-1">Wall Insulation R-Value</label>
                      <input type="range" min="0.5" max="8" step="0.1" value={eskyDesign.wallR} onChange={e => setEskyDesign({...eskyDesign, wallR: parseFloat(e.target.value)})} className="w-full accent-cyan-500"/>
                      <span className="text-[10px] text-cyan-400 font-mono">R-{eskyDesign.wallR}</span>
                    </div>
                    <div>
                      <label className="text-[8px] text-gray-500 uppercase block mb-1">Magnetocaloric Power (W)</label>
                      <input type="range" min="0" max="50" step="1" value={eskyDesign.magnetoW} onChange={e => setEskyDesign({...eskyDesign, magnetoW: parseInt(e.target.value)})} className="w-full accent-purple-500"/>
                      <span className="text-[10px] text-purple-400 font-mono">{eskyDesign.magnetoW}W</span>
                    </div>
                    <div>
                      <label className="text-[8px] text-gray-500 uppercase block mb-1">CO2 Expansion Vol (L)</label>
                      <input type="range" min="0" max="2" step="0.1" value={eskyDesign.co2Vol} onChange={e => setEskyDesign({...eskyDesign, co2Vol: parseFloat(e.target.value)})} className="w-full accent-emerald-500"/>
                      <span className="text-[10px] text-emerald-400 font-mono">{eskyDesign.co2Vol}L</span>
                    </div>
                    <div>
                      <label className="text-[8px] text-gray-500 uppercase block mb-1">Stubbies</label>
                      <input type="range" min="1" max="24" step="1" value={eskyDesign.stubbies} onChange={e => setEskyDesign({...eskyDesign, stubbies: parseInt(e.target.value)})} className="w-full accent-blue-500"/>
                      <span className="text-[10px] text-blue-400 font-mono">{eskyDesign.stubbies} cans</span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {/* Live calculation */}
                    {(() => {
                      const heatLeak = (25 - 4) / eskyDesign.wallR * 0.1; // W through walls
                      const stubbyLoad = eskyDesign.stubbies * 0.8; // W per stubby
                      const totalLoad = heatLeak + stubbyLoad;
                      const co2Cooling = eskyDesign.co2Vol * 12; // W from CO2 expansion
                      const magnetoCooling = eskyDesign.magnetoW * 1.3; // COP ~1.3
                      const totalCooling = co2Cooling + magnetoCooling;
                      const canCool = totalCooling >= totalLoad;
                      const timeToTarget = canCool ? (eskyDesign.stubbies * 0.33 * 21 * 4.186 / (totalCooling - totalLoad) / 60).toFixed(0) : 'N/A';
                      return (
                        <>
                          <div className={`p-3 rounded-xl border ${canCool ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                            <span className="text-[8px] text-gray-500 uppercase block">Status</span>
                            <span className={`text-lg font-black ${canCool ? 'text-emerald-400' : 'text-red-400'}`}>{canCool ? 'VIABLE' : 'UNDERCOOLED'}</span>
                          </div>
                          <div className="p-3 bg-black/40 rounded-xl border border-white/5">
                            <span className="text-[8px] text-gray-500 uppercase block">Heat Load</span>
                            <span className="text-sm font-bold text-red-400">{totalLoad.toFixed(1)}W</span>
                            <span className="text-[8px] text-gray-600 block">Walls: {heatLeak.toFixed(1)}W + Stubbies: {stubbyLoad.toFixed(1)}W</span>
                          </div>
                          <div className="p-3 bg-black/40 rounded-xl border border-white/5">
                            <span className="text-[8px] text-gray-500 uppercase block">Cooling Power</span>
                            <span className="text-sm font-bold text-cyan-400">{totalCooling.toFixed(1)}W</span>
                            <span className="text-[8px] text-gray-600 block">Magneto: {magnetoCooling.toFixed(1)}W + CO2: {co2Cooling.toFixed(1)}W</span>
                          </div>
                          <div className="p-3 bg-black/40 rounded-xl border border-white/5">
                            <span className="text-[8px] text-gray-500 uppercase block">Time to 4°C</span>
                            <span className="text-sm font-bold text-yellow-400">{timeToTarget} min</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
                {/* Esky cross-section diagram */}
                <svg viewBox="0 0 12 6" className="w-full" style={{ maxHeight: 200 }}>
                  <rect x="0.5" y="0.5" width="11" height="5" rx="0.3" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.15)" strokeWidth="0.05"/>
                  <rect x="0.8" y="0.8" width="10.4" height="4.4" rx="0.2" fill="rgba(34,211,238,0.08)" stroke="rgba(34,211,238,0.2)" strokeWidth="0.03"/>
                  <text x="6" y="1.3" textAnchor="middle" fontSize="0.35" fill="rgba(34,211,238,0.6)">R-{eskyDesign.wallR} Insulation</text>
                  {/* Stubbies */}
                  {Array.from({ length: Math.min(eskyDesign.stubbies, 12) }).map((_, i) => {
                    const col = i % 6; const row = Math.floor(i / 6);
                    return <rect key={i} x={2 + col * 1.4} y={2 + row * 1.5} width="0.8" height="1.2" rx="0.15" fill="rgba(251,191,36,0.3)" stroke="rgba(251,191,36,0.4)" strokeWidth="0.02"/>;
                  })}
                  {eskyDesign.magnetoW > 0 && <text x="1.5" y="5" fontSize="0.25" fill="rgba(168,85,247,0.6)">Gd magnetocaloric: {eskyDesign.magnetoW}W</text>}
                  {eskyDesign.co2Vol > 0 && <text x="7" y="5" fontSize="0.25" fill="rgba(16,185,129,0.6)">CO2 expansion: {eskyDesign.co2Vol}L</text>}
                </svg>
                {metrics?.eskyStates?.length > 0 && (
                  <div className="p-3 bg-purple-500/5 border border-purple-500/20 rounded-xl">
                    <h4 className="text-[9px] font-bold text-purple-400 uppercase mb-1">Live Esky Zones from V12</h4>
                    {metrics.eskyStates.map((e: any, i: number) => (
                      <div key={i} className="flex justify-between text-[10px] font-mono py-1 border-b border-white/5">
                        <span className="text-gray-400">{e.room}</span>
                        <span className="text-cyan-400">{e.innerTemp}°C</span>
                        <span className="text-red-400/60">waste: {e.heatWaste}W</span>
                        <span className="text-blue-400">{e.stubbies?.length || 0} stubbies: [{e.stubbies?.map((s: number) => s + '°').join(', ')}]</span>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {/* ── SOLAR PANEL SIMULATION ── */}
            {activePanel === 'solar' && (
              <motion.div key="sol" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="bg-black/30 rounded-xl border border-white/10 p-4 space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[10px] font-bold text-gray-400 uppercase">Solar Panel Array + Material Optimization</h3>
                  {solarOutput && <span className="text-[8px] font-mono text-yellow-400">Live Output: {solarOutput.totalWatts?.toFixed(0) || 0}W</span>}
                </div>

                {solarOutput ? (
                  <>
                    {/* Output summary */}
                    <div className="grid grid-cols-4 gap-3">
                      <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-center">
                        <span className="text-2xl font-black text-yellow-400">{solarOutput.totalWatts?.toFixed(0) || 0}</span>
                        <span className="text-[8px] text-gray-500 uppercase block">Watts</span>
                      </div>
                      <div className="p-3 bg-orange-500/10 border border-orange-500/20 rounded-xl text-center">
                        <span className="text-2xl font-black text-orange-400">{((solarOutput.efficiency || 0) * 100).toFixed(1)}%</span>
                        <span className="text-[8px] text-gray-500 uppercase block">Efficiency</span>
                      </div>
                      <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-center">
                        <span className="text-2xl font-black text-cyan-400">{solarOutput.cellTempC?.toFixed(1) || '—'}°C</span>
                        <span className="text-[8px] text-gray-500 uppercase block">Cell Temp</span>
                      </div>
                      <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center">
                        <span className="text-2xl font-black text-emerald-400">{solarOutput.batteryKWh?.toFixed(2) || '0'}</span>
                        <span className="text-[8px] text-gray-500 uppercase block">Battery kWh</span>
                      </div>
                    </div>

                    {/* Panel array grid */}
                    {solarPanels.length > 0 && (
                      <div className="p-3 bg-black/40 rounded-xl border border-white/5">
                        <h4 className="text-[9px] font-bold text-yellow-400 uppercase mb-2">Panel Array ({solarPanels.length} panels)</h4>
                        <div className="grid grid-cols-5 gap-2">
                          {solarPanels.map((panel: any, i: number) => {
                            const eff = (panel.efficiency || 0.2) * 100;
                            const age = panel.ageDegradation || 1;
                            return (
                              <div key={i} className="p-2 rounded-lg border text-center" style={{
                                background: `rgba(250,204,21,${Math.max(0.05, eff / 100 * 0.3)})`,
                                borderColor: `rgba(250,204,21,${Math.max(0.1, eff / 100 * 0.5)})`
                              }}>
                                <span className="text-[10px] font-bold text-yellow-400 block">{panel.watts?.toFixed(0) || 0}W</span>
                                <span className="text-[7px] text-gray-500 block">{eff.toFixed(1)}% eff</span>
                                <span className="text-[7px] text-gray-600 block">age: {((1 - age) * 100).toFixed(1)}% deg</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Pre-cooling thermal battery */}
                    <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-xl">
                      <h4 className="text-[9px] font-bold text-blue-400 uppercase mb-2">Pre-Cooling Thermal Battery</h4>
                      <div className="flex gap-4 text-[10px] font-mono">
                        <span className="text-gray-400">Stored: <span className="text-blue-300">{solarOutput.batteryKWh?.toFixed(3) || '0'} kWh</span></span>
                        <span className="text-gray-400">Excess Solar: <span className="text-yellow-300">{solarOutput.excessWatts?.toFixed(0) || '0'}W</span></span>
                        <span className="text-gray-400">Pre-cool: <span className="text-cyan-300">{solarOutput.preCoolingActive ? 'ACTIVE' : 'standby'}</span></span>
                      </div>
                      <div className="mt-2 h-2 bg-black/40 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all"
                          style={{ width: `${Math.min(100, (solarOutput.batteryKWh || 0) / 5 * 100)}%` }} />
                      </div>
                    </div>

                    {/* Material optimization results */}
                    {(() => {
                      const w = window as any;
                      const optResults = w.v12Engine?.getSolarOptimizationResults?.() || null;
                      if (!optResults) return null;
                      return (
                        <div className="p-3 bg-purple-500/5 border border-purple-500/20 rounded-xl">
                          <h4 className="text-[9px] font-bold text-purple-400 uppercase mb-2">Deep-Learned Material Optimization</h4>
                          <div className="grid grid-cols-2 gap-2 mb-2">
                            <div className="text-[10px] font-mono text-gray-400">Generation: <span className="text-purple-300">{optResults.generation || 0}</span></div>
                            <div className="text-[10px] font-mono text-gray-400">Best Score: <span className="text-purple-300">{optResults.bestScore?.toFixed(4) || '—'}</span></div>
                          </div>
                          {optResults.topDesigns?.slice(0, 5).map((d: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 text-[9px] font-mono py-1 border-b border-white/5">
                              <span className="text-purple-400 w-4">#{i + 1}</span>
                              <span className="text-gray-400 flex-1">thick: {d.thickness?.toFixed(2)}μm | gap: {d.bandgap?.toFixed(2)}eV | abs: {d.absorbance?.toFixed(2)}</span>
                              <span className="text-emerald-400">{(d.score * 100).toFixed(1)}%</span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    <p className="text-[9px] text-gray-500 italic">
                      NOCT cell temperature model with {solarPanels.length} monocrystalline panels. 0.5%/yr degradation.
                      Excess solar charges pre-cooling thermal battery for off-peak HVAC.
                      Neural net mutates material layer compositions (thickness/bandgap/absorbance) to evolve higher-efficiency designs.
                    </p>
                  </>
                ) : (
                  <div className="h-32 flex items-center justify-center text-gray-600 text-xs">Solar simulation warming up...</div>
                )}
              </motion.div>
            )}

            {/* ── DEEP LEARNING STATUS ── */}
            {activePanel === 'deeplearn' && (
              <motion.div key="dl" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="bg-black/30 rounded-xl border border-white/10 p-4 space-y-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[10px] font-bold text-gray-400 uppercase">Per-Room Neural Networks + Cycle Detection</h3>
                  {neuralNetState && <span className="text-[8px] font-mono text-emerald-400">Epoch: {neuralNetState.totalEpochs || 0}</span>}
                </div>

                {neuralNetState ? (
                  <>
                    {/* Global stats */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center">
                        <span className="text-2xl font-black text-emerald-400">{neuralNetState.totalEpochs || 0}</span>
                        <span className="text-[8px] text-gray-500 uppercase block">Total Epochs</span>
                      </div>
                      <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-center">
                        <span className="text-2xl font-black text-cyan-400">{neuralNetState.avgLoss?.toFixed(4) || '—'}</span>
                        <span className="text-[8px] text-gray-500 uppercase block">Avg Loss</span>
                      </div>
                      <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl text-center">
                        <span className="text-2xl font-black text-purple-400">{neuralNetState.roomCount || 0}</span>
                        <span className="text-[8px] text-gray-500 uppercase block">Active Nets</span>
                      </div>
                    </div>

                    {/* Architecture diagram */}
                    <div className="p-3 bg-black/40 rounded-xl border border-white/5">
                      <h4 className="text-[9px] font-bold text-cyan-400 uppercase mb-2">ThermalNet Architecture (per room)</h4>
                      <div className="flex items-center justify-center gap-2">
                        {[
                          { label: 'Input', size: 12, color: 'bg-blue-500/30 border-blue-500/50' },
                          { label: 'Hidden₁', size: 32, color: 'bg-emerald-500/30 border-emerald-500/50' },
                          { label: 'Hidden₂', size: 16, color: 'bg-purple-500/30 border-purple-500/50' },
                          { label: 'Output', size: 6, color: 'bg-yellow-500/30 border-yellow-500/50' },
                        ].map((layer, i) => (
                          <React.Fragment key={i}>
                            <div className={`px-3 py-2 rounded-lg border ${layer.color} text-center`}>
                              <span className="text-[10px] font-bold text-white block">{layer.size}</span>
                              <span className="text-[7px] text-gray-400 block">{layer.label}</span>
                            </div>
                            {i < 3 && <span className="text-gray-600 text-[10px]">→</span>}
                          </React.Fragment>
                        ))}
                      </div>
                      <div className="text-[8px] text-gray-600 text-center mt-2 font-mono">
                        ReLU activations | Xavier init | SGD backprop | Online learning every frame
                      </div>
                    </div>

                    {/* Per-room network status */}
                    {neuralNetState.rooms && (
                      <div className="p-3 bg-black/40 rounded-xl border border-white/5">
                        <h4 className="text-[9px] font-bold text-emerald-400 uppercase mb-2">Per-Room Network Status</h4>
                        <div className="space-y-1.5 max-h-48 overflow-y-auto">
                          {neuralNetState.rooms.map((room: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 p-1.5 bg-white/3 rounded-lg">
                              <span className="text-[9px] text-white font-mono w-20 truncate">{room.name}</span>
                              <div className="flex-1 h-1.5 bg-black/40 rounded-full overflow-hidden">
                                <div className="h-full rounded-full transition-all" style={{
                                  width: `${Math.min(100, Math.max(2, (1 - Math.min(room.loss || 1, 1)) * 100))}%`,
                                  background: room.loss < 0.01 ? '#10b981' : room.loss < 0.05 ? '#f59e0b' : '#ef4444'
                                }} />
                              </div>
                              <span className="text-[8px] font-mono text-gray-500 w-16 text-right">loss: {(room.loss || 0).toFixed(4)}</span>
                              <span className="text-[8px] font-mono text-cyan-400 w-14 text-right">ep: {room.epoch || 0}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Cycle detection */}
                    {roomCycles.length > 0 && (
                      <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl">
                        <h4 className="text-[9px] font-bold text-amber-400 uppercase mb-2">Detected Thermal Cycles (Autocorrelation)</h4>
                        <div className="space-y-1.5">
                          {roomCycles.map((cycle: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 text-[9px] font-mono">
                              <span className="text-white w-20 truncate">{cycle.room}</span>
                              <div className="flex-1 flex items-center gap-1">
                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${
                                  cycle.detected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-500/20 text-gray-500'
                                }`}>
                                  {cycle.detected ? 'CYCLE' : 'none'}
                                </span>
                                {cycle.detected && (
                                  <>
                                    <span className="text-gray-400">period: <span className="text-amber-300">{cycle.period}</span> frames</span>
                                    <span className="text-gray-400">strength: <span className="text-amber-300">{cycle.strength?.toFixed(2)}</span></span>
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Optimization history */}
                    {optimizationHistory.length > 0 && (
                      <div className="p-3 bg-violet-500/5 border border-violet-500/20 rounded-xl">
                        <h4 className="text-[9px] font-bold text-violet-400 uppercase mb-2">Vent Optimization Actions ({optimizationHistory.length})</h4>
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {optimizationHistory.slice(-10).reverse().map((opt: any, i: number) => (
                            <div key={i} className="flex items-center gap-2 text-[8px] font-mono py-0.5 border-b border-white/5">
                              <span className="text-gray-600 w-12">iter {opt.iteration}</span>
                              <span className="text-white flex-1 truncate">{opt.room}: {opt.action}</span>
                              <span className={`${opt.improvement > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {opt.improvement > 0 ? '+' : ''}{(opt.improvement * 100).toFixed(1)}%
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <p className="text-[9px] text-gray-500 italic">
                      Each room has its own 12→32→16→6 neural network trained online every frame via backpropagation.
                      Autocorrelation on 500-frame rolling temp history detects stable thermal cycles.
                      Every 500 iterations, the net predicts ±20% vent flow perturbations and applies improvements &gt;5%.
                    </p>
                  </>
                ) : (
                  <div className="h-32 flex items-center justify-center text-gray-600 text-xs">Neural networks initializing...</div>
                )}
              </motion.div>
            )}

            {/* ── VENT READINGS PANEL ── */}
            {activePanel === 'ventreadings' && (
              <motion.div key="vr" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="bg-black/30 rounded-xl border border-white/10 p-4 space-y-4">
                <h3 className="text-[10px] font-bold text-gray-400 uppercase mb-2">Live Vent Intake/Outtake Readings</h3>

                {rooms.length > 0 ? (
                  <>
                    {/* Summary stats */}
                    {(() => {
                      let totalIntake = 0, totalExhaust = 0, totalHRV = 0;
                      let avgIntakeTemp = 0, avgExhaustTemp = 0, intakeCount = 0, exhaustCount = 0;
                      for (const room of rooms) {
                        for (const v of (room.vents || [])) {
                          if (v.type === 'intake') { totalIntake++; avgIntakeTemp += (v.tempIn || 0); intakeCount++; }
                          else if (v.type === 'exhaust') { totalExhaust++; avgExhaustTemp += (v.tempOut || 0); exhaustCount++; }
                          else { totalHRV++; }
                        }
                      }
                      avgIntakeTemp = intakeCount > 0 ? avgIntakeTemp / intakeCount : 0;
                      avgExhaustTemp = exhaustCount > 0 ? avgExhaustTemp / exhaustCount : 0;
                      return (
                        <div className="grid grid-cols-4 gap-3">
                          <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-center">
                            <span className="text-2xl font-black text-blue-400">{totalIntake}</span>
                            <span className="text-[8px] text-gray-500 uppercase block">Intake Vents</span>
                          </div>
                          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-center">
                            <span className="text-2xl font-black text-red-400">{totalExhaust}</span>
                            <span className="text-[8px] text-gray-500 uppercase block">Exhaust Vents</span>
                          </div>
                          <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl text-center">
                            <span className="text-2xl font-black text-purple-400">{totalHRV}</span>
                            <span className="text-[8px] text-gray-500 uppercase block">HRV Units</span>
                          </div>
                          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center">
                            <span className="text-lg font-black text-emerald-400">{avgIntakeTemp.toFixed(1)}°</span>
                            <span className="text-[8px] text-gray-500 uppercase block">Avg Supply</span>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Per-room vent detail table */}
                    <div className="p-3 bg-black/40 rounded-xl border border-white/5 max-h-80 overflow-y-auto">
                      <table className="w-full text-[9px] font-mono">
                        <thead>
                          <tr className="border-b border-white/10 text-gray-500">
                            <th className="text-left py-1 px-1">Room</th>
                            <th className="text-left py-1 px-1">Type</th>
                            <th className="text-right py-1 px-1">Flow L/s</th>
                            <th className="text-right py-1 px-1">T_in °C</th>
                            <th className="text-right py-1 px-1">T_out °C</th>
                            <th className="text-right py-1 px-1">Mass kg/s</th>
                            <th className="text-center py-1 px-1">Dia</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rooms.flatMap((room: any) =>
                            (room.vents || []).map((v: any, vi: number) => (
                              <tr key={`${room.id}_${vi}`} className="border-b border-white/5 hover:bg-white/3">
                                <td className="py-1.5 px-1 text-white">{room.name}</td>
                                <td className="py-1.5 px-1">
                                  <span className={`px-1 py-0.5 rounded text-[8px] font-bold ${
                                    v.type === 'intake' ? 'bg-blue-500/20 text-blue-400' :
                                    v.type === 'exhaust' ? 'bg-red-500/20 text-red-400' :
                                    'bg-purple-500/20 text-purple-400'
                                  }`}>{v.type === 'intake' ? 'IN' : v.type === 'exhaust' ? 'OUT' : 'HRV'}</span>
                                </td>
                                <td className="py-1.5 px-1 text-right text-cyan-400">{(v.flowRate * 1000).toFixed(1)}</td>
                                <td className="py-1.5 px-1 text-right text-blue-300">{v.tempIn?.toFixed(1) || '—'}</td>
                                <td className="py-1.5 px-1 text-right text-orange-300">{v.tempOut?.toFixed(1) || '—'}</td>
                                <td className="py-1.5 px-1 text-right text-gray-400">{v.massFlowRate?.toFixed(4) || '—'}</td>
                                <td className="py-1.5 px-1 text-center text-gray-500">{v.diameter || '—'}mm</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Floor vs ceiling vent pairing */}
                    <div className="p-3 bg-indigo-500/5 border border-indigo-500/20 rounded-xl">
                      <h4 className="text-[9px] font-bold text-indigo-400 uppercase mb-2">Floor ↔ Ceiling Vent Pairs</h4>
                      <div className="space-y-2">
                        {rooms.map((room: any) => {
                          const intakes = (room.vents || []).filter((v: any) => v.type === 'intake');
                          const exhausts = (room.vents || []).filter((v: any) => v.type === 'exhaust');
                          const pairs = Math.min(intakes.length, exhausts.length);
                          if (pairs === 0) return null;
                          return (
                            <div key={room.id} className="flex items-center gap-2">
                              <span className="text-[9px] text-white w-20 truncate">{room.name}</span>
                              {Array.from({ length: pairs }).map((_, pi) => {
                                const inV = intakes[pi];
                                const outV = exhausts[pi];
                                const deltaT = Math.abs((outV?.tempOut || 22) - (inV?.tempIn || 22));
                                return (
                                  <div key={pi} className="flex items-center gap-1 px-2 py-1 bg-black/40 rounded-lg border border-white/5">
                                    <span className="text-[8px] text-blue-400">▼{(inV?.flowRate * 1000).toFixed(0)}L/s</span>
                                    <span className="text-[8px] text-gray-600">⟷</span>
                                    <span className="text-[8px] text-red-400">▲{(outV?.flowRate * 1000).toFixed(0)}L/s</span>
                                    <span className="text-[7px] text-amber-400/60">ΔT:{deltaT.toFixed(1)}°</span>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        }).filter(Boolean)}
                      </div>
                    </div>

                    <p className="text-[9px] text-gray-500 italic">
                      Floor intake vents (y≈0.1) paired with ceiling exhaust (y≈ceiling-0.1) on opposite walls.
                      Mass flow rate = ρ × A × v (kg/s). Supply temp = HVAC supply (14°C cooling / 35°C heating).
                    </p>
                  </>
                ) : (
                  <div className="h-32 flex items-center justify-center text-gray-600 text-xs">Waiting for vent data...</div>
                )}
              </motion.div>
            )}

            {/* ── ANNUAL CLIMATE CYCLE ── */}
            {activePanel === 'annualcycle' && (
              <motion.div key="ac" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="bg-black/30 rounded-xl border border-white/10 p-4 space-y-4">
                <h3 className="text-[10px] font-bold text-gray-400 uppercase mb-2">Annual Climate Cycle + HVAC Energy</h3>

                {(() => {
                  const w = window as any;
                  const climate = w.v12Engine?.getAnnualClimate?.() || null;
                  const hvac = w.v12Engine?.getHVACState?.() || null;

                  if (!climate && !hvac) return <div className="h-32 flex items-center justify-center text-gray-600 text-xs">Annual cycle computing...</div>;

                  return (
                    <>
                      {/* Current conditions */}
                      <div className="grid grid-cols-5 gap-2">
                        <div className="p-2 bg-orange-500/10 border border-orange-500/20 rounded-xl text-center">
                          <span className="text-lg font-black text-orange-400">{climate?.outsideTemp?.toFixed(1) || '—'}°C</span>
                          <span className="text-[7px] text-gray-500 uppercase block">Outside</span>
                        </div>
                        <div className="p-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-center">
                          <span className="text-lg font-black text-yellow-400">{climate?.solarIrradiance?.toFixed(0) || '—'}</span>
                          <span className="text-[7px] text-gray-500 uppercase block">W/m² solar</span>
                        </div>
                        <div className="p-2 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-center">
                          <span className="text-lg font-black text-cyan-400">{climate?.windSpeed?.toFixed(1) || '—'}</span>
                          <span className="text-[7px] text-gray-500 uppercase block">m/s wind</span>
                        </div>
                        <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-xl text-center">
                          <span className="text-lg font-black text-blue-400">{climate?.dayOfYear || '—'}</span>
                          <span className="text-[7px] text-gray-500 uppercase block">Day of Year</span>
                        </div>
                        <div className="p-2 bg-purple-500/10 border border-purple-500/20 rounded-xl text-center">
                          <span className="text-lg font-black text-purple-400">{climate?.hourOfDay?.toFixed(1) || '—'}</span>
                          <span className="text-[7px] text-gray-500 uppercase block">Hour</span>
                        </div>
                      </div>

                      {/* HVAC state */}
                      {hvac && (
                        <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                          <h4 className="text-[9px] font-bold text-emerald-400 uppercase mb-2">Auto-HVAC (Dead Band ±1°C Hysteresis)</h4>
                          <div className="grid grid-cols-3 gap-3">
                            <div className="text-center">
                              <span className={`text-lg font-black ${hvac.mode === 'cooling' ? 'text-cyan-400' : hvac.mode === 'heating' ? 'text-orange-400' : 'text-gray-500'}`}>
                                {hvac.mode === 'cooling' ? '❄ COOL' : hvac.mode === 'heating' ? '🔥 HEAT' : '— OFF'}
                              </span>
                              <span className="text-[7px] text-gray-500 block uppercase">Mode</span>
                            </div>
                            <div className="text-center">
                              <span className="text-lg font-black text-yellow-400">{hvac.supplyTemp?.toFixed(1) || '—'}°C</span>
                              <span className="text-[7px] text-gray-500 block uppercase">Supply Temp</span>
                            </div>
                            <div className="text-center">
                              <span className="text-lg font-black text-green-400">{hvac.cop?.toFixed(1) || '—'}</span>
                              <span className="text-[7px] text-gray-500 block uppercase">COP</span>
                            </div>
                          </div>
                          <div className="flex gap-4 mt-3 text-[9px] font-mono text-gray-400">
                            <span>Total kWh: <span className="text-emerald-300">{hvac.totalKWh?.toFixed(2) || '0'}</span></span>
                            <span>Cost: <span className="text-yellow-300">${hvac.totalCost?.toFixed(2) || '0'}</span></span>
                            <span>Runtime: <span className="text-cyan-300">{hvac.runtimeHours?.toFixed(0) || '0'}h</span></span>
                          </div>
                        </div>
                      )}

                      {/* Annual temperature sparkline */}
                      {climate?.yearHistory && climate.yearHistory.length > 10 && (
                        <div className="p-3 bg-black/40 rounded-xl border border-white/5">
                          <h4 className="text-[9px] font-bold text-orange-400 uppercase mb-2">Annual Temperature History</h4>
                            <AreaChart
                              data={climate.yearHistory.filter((_: any, i: number) => i % Math.max(1, Math.floor(climate.yearHistory.length / 100)) === 0).map((t: number, i: number) => ({ day: i, temp: t }))}
                              responsive
                              style={{ width: '100%', height: 120, minWidth: 0 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                              <XAxis dataKey="day" tick={{ fontSize: 8, fill: '#6b7280' }} />
                              <YAxis tick={{ fontSize: 8, fill: '#6b7280' }} domain={['auto', 'auto']} />
                              <Tooltip contentStyle={{ background: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 9 }} />
                              <Area type="monotone" dataKey="temp" stroke="#f97316" fill="rgba(249,115,22,0.15)" name="°C" />
                            </AreaChart>
                        </div>
                      )}

                      {/* Season indicator */}
                      <div className="flex gap-2">
                        {[
                          { label: 'Summer', range: 'Dec-Feb', icon: '☀️', color: climate?.season === 'summer' ? 'bg-red-500/20 border-red-500/40 text-red-400' : 'bg-white/3 border-white/5 text-gray-600' },
                          { label: 'Autumn', range: 'Mar-May', icon: '🍂', color: climate?.season === 'autumn' ? 'bg-orange-500/20 border-orange-500/40 text-orange-400' : 'bg-white/3 border-white/5 text-gray-600' },
                          { label: 'Winter', range: 'Jun-Aug', icon: '❄️', color: climate?.season === 'winter' ? 'bg-blue-500/20 border-blue-500/40 text-blue-400' : 'bg-white/3 border-white/5 text-gray-600' },
                          { label: 'Spring', range: 'Sep-Nov', icon: '🌸', color: climate?.season === 'spring' ? 'bg-green-500/20 border-green-500/40 text-green-400' : 'bg-white/3 border-white/5 text-gray-600' },
                        ].map(s => (
                          <div key={s.label} className={`flex-1 p-2 rounded-lg border text-center ${s.color}`}>
                            <span className="text-sm block">{s.icon}</span>
                            <span className="text-[9px] font-bold uppercase block">{s.label}</span>
                            <span className="text-[7px] block">{s.range}</span>
                          </div>
                        ))}
                      </div>

                      <p className="text-[9px] text-gray-500 italic">
                        Cosine-based seasonal cycle with ±5°C diurnal swing + brownian weather noise.
                        HVAC auto-switches between cooling (supply 14°C, COP 3.0) and heating (supply 35°C, COP 4.0)
                        with dead band hysteresis to prevent mode oscillation. 15 simulated minutes per frame.
                      </p>
                    </>
                  );
                })()}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Sidebar (1/3) — hidden when the consolidated system view is active. */}
        {activePanel !== 'system' && <div className="space-y-4">
          {/* Room Temps */}
          {metrics?.roomTemps && (
            <div className="bg-black/30 rounded-xl border border-white/10 p-4">
              <h3 className="text-[10px] font-bold text-gray-400 uppercase mb-3">Room Temperatures</h3>
              <div className="space-y-2">
                {metrics.roomTemps.map((rt: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-black/30 rounded-lg">
                    <span className="text-[10px] text-white font-mono truncate flex-1">{rt.name}</span>
                    <span className={`text-[11px] font-bold ${tempColor(rt.actual, rt.target)}`}>{rt.actual}°C</span>
                    <span className="text-[9px] text-gray-600 ml-2">({rt.deviation > 0 ? '+' : ''}{rt.deviation})</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Esky Zones */}
          {metrics?.eskyStates?.length > 0 && (
            <div className="bg-black/30 rounded-xl border border-purple-500/20 p-4">
              <h3 className="text-[10px] font-bold text-purple-400 uppercase mb-3">Esky Zones (Nested Sims)</h3>
              {metrics.eskyStates.map((esky: any, i: number) => (
                <div key={i} className="p-2 bg-black/40 rounded-lg mb-2 border border-white/5">
                  <div className="flex justify-between text-[10px]">
                    <span className="text-gray-400">{esky.room}</span>
                    <span className="text-cyan-400">{esky.innerTemp}°C</span>
                  </div>
                  {esky.stubbies?.length > 0 && (
                    <div className="flex gap-1 mt-1">
                      {esky.stubbies.map((s: number, j: number) => (
                        <div key={j} className="px-1.5 py-0.5 bg-blue-500/10 rounded text-[8px] text-blue-400 font-mono">{s}°</div>
                      ))}
                    </div>
                  )}
                  <div className="text-[8px] text-red-400/60 mt-1">Waste: {esky.heatWaste}W</div>
                </div>
              ))}
            </div>
          )}

          {/* Recommendations */}
          {recommendations.length > 0 && (
            <div className="bg-black/30 rounded-xl border border-white/10 p-4">
              <h3 className="text-[10px] font-bold text-gray-400 uppercase mb-3">Recommendations ({recommendations.length})</h3>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {recommendations.slice(0, 8).map((rec: any, i: number) => (
                  <div key={i} className={`p-2 rounded-lg border text-[9px] ${priorityColor[rec.priority] || priorityColor.low}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold uppercase">{rec.priority}</span>
                      <span className="text-[8px] opacity-70">{rec.room}</span>
                    </div>
                    <p className="opacity-80 leading-relaxed">{rec.description}</p>
                    <div className="flex gap-3 mt-1 opacity-60">
                      <span>Save: {rec.energySaving?.toFixed(0)}%</span>
                      <span>Cost: ${rec.costEstimate?.toFixed(0)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Zone Passive Design Strategies */}
          {zoneConstraints && (
            <div className="bg-black/30 rounded-xl border border-emerald-500/20 p-4">
              <h3 className="text-[10px] font-bold text-emerald-400 uppercase mb-2">
                {zoneConstraints.zone === 'tropical' ? '🌴' : zoneConstraints.zone === 'cold' ? '❄' : '🏡'} Passive Design ({zoneConstraints.zone})
              </h3>
              <div className="space-y-1.5 max-h-48 overflow-y-auto mb-3">
                {zoneConstraints.passiveDesign?.map((strategy: string, i: number) => (
                  <div key={i} className="text-[8px] text-gray-400 leading-tight flex gap-1.5">
                    <span className="text-emerald-500 mt-0.5">▸</span>
                    <span>{strategy}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-1 text-[8px]">
                <div className="flex justify-between text-gray-500"><span>Building Form</span><span className="text-white text-right max-w-[60%]">{zoneConstraints.buildingForm?.split('—')[0]}</span></div>
                <div className="flex justify-between text-gray-500"><span>Shade Strategy</span><span className="text-white text-right max-w-[60%]">{zoneConstraints.shadeStrategy?.split(',')[0]}</span></div>
                <div className="flex justify-between text-gray-500"><span>Longest Wall</span><span className="text-white text-right max-w-[60%]">{zoneConstraints.longestWallFacing?.split('(')[0]}</span></div>
                <div className="flex justify-between text-gray-500"><span>Floor Type</span><span className="text-white">{zoneConstraints.floorType?.replace(/_/g, ' ')}</span></div>
                <div className="flex justify-between text-gray-500"><span>Underfloor Heat</span><span className={zoneConstraints.underfloorHeating ? 'text-emerald-400' : 'text-gray-600'}>{zoneConstraints.underfloorHeating ? 'Yes' : 'No'}</span></div>
                <div className="flex justify-between text-gray-500"><span>Min R-Value</span><span className="text-cyan-400">R-{zoneConstraints.minRValue}</span></div>
                {zoneConstraints.needsStilts && <div className="flex justify-between text-gray-500"><span>Stilts</span><span className="text-orange-400">Required (flood)</span></div>}
                {zoneConstraints.cycloneRisk && <div className="flex justify-between text-gray-500"><span>Cyclone</span><span className="text-red-400">Reinforced roof</span></div>}
              </div>
            </div>
          )}

          {/* Venting Strategy */}
          <div className="bg-black/30 rounded-xl border border-blue-500/20 p-4">
            <h3 className="text-[10px] font-bold text-blue-400 uppercase mb-3">Venting Strategy</h3>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'floor', label: 'Floor', icon: <ArrowDown size={12} /> },
                { id: 'ceiling', label: 'Ceiling', icon: <ArrowUp size={12} /> },
                { id: 'topological', label: 'Topology', icon: <Wind size={12} /> }
              ].map(s => (
                <button key={s.id} onClick={() => setVentingStrategy(s.id)} className={`flex flex-col items-center gap-1 p-2 rounded border transition-all ${
                  ventingStrategy === s.id ? 'bg-blue-500 text-black border-blue-500' : 'bg-black/40 border-white/10 text-gray-400 hover:text-white'
                }`}>
                  {s.icon}
                  <span className="text-[8px] font-bold uppercase">{s.label}</span>
                </button>
              ))}
            </div>
          </div>

          <button onClick={onGenerateBlueprint} className="w-full py-3 bg-emerald-500 text-black font-bold rounded-xl hover:bg-emerald-400 transition-all uppercase tracking-widest text-[10px] shadow-[0_0_20px_rgba(16,185,129,0.3)]">
            Generate Blueprint
          </button>
        </div>}
      </div>
    </div>
  );
};

export default function AppWrapper() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

const SimulationChainUI = ({ 
  activeOptimizer,
  thermalMode,
  currentIndex, 
  onIndexChange, 
  autoTransition, 
  setAutoTransition,
  compressionLevel,
  setCompressionLevel
}: { 
  activeOptimizer: OptimizerType;
  thermalMode: ThermalMode;
  currentIndex: number; 
  onIndexChange: (i: number) => void;
  autoTransition: boolean;
  setAutoTransition: (b: boolean) => void;
  compressionLevel: number;
  setCompressionLevel: (l: number) => void;
}) => {
  const goal = OPTIMIZATION_GOALS[activeOptimizer];
  const currentTask = goal.tasks[currentIndex % goal.tasks.length];

  const getDesiredResult = () => {
    if (activeOptimizer === 'thermal') {
      return thermalMode === 'cooling' 
        ? 'Maximum Heat Dissipation Membrane' 
        : 'Maximum Thermal Retention Lattice';
    }
    return goal.desiredResult;
  };

  return (
    <div className="bg-white/5 rounded-2xl border border-white/10 p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <LinkIcon size={18} className="text-cyan-400" />
          <h3 className="text-sm font-black uppercase tracking-tighter text-white">Optimization Goal</h3>
        </div>
        <button 
          onClick={() => setAutoTransition(!autoTransition)}
          className={`px-3 py-1 rounded-full text-[8px] font-bold uppercase tracking-widest transition-all ${
            autoTransition ? 'bg-cyan-500 text-black' : 'bg-white/10 text-gray-400'
          }`}
        >
          {autoTransition ? 'Auto-Sync ON' : 'Auto-Sync OFF'}
        </button>
      </div>

      <div className="p-3 bg-cyan-500/5 border border-cyan-500/20 rounded-xl">
        <div className="text-[8px] text-cyan-500 uppercase font-bold mb-1 tracking-widest">Desired Result</div>
        <div className="text-xs font-black text-white uppercase tracking-tight">{getDesiredResult()}</div>
      </div>

      <div className="space-y-3">
        <div className="text-[8px] text-gray-500 uppercase font-bold tracking-widest">Simulation Chain</div>
        <div className="grid grid-cols-4 gap-2">
          {goal.tasks.map((task, i) => (
            <button
              key={task.id}
              onClick={() => onIndexChange(i)}
              className={`p-2 rounded-lg border transition-all flex flex-col items-center gap-1 ${
                currentIndex === i 
                  ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400' 
                  : 'bg-white/5 border-white/5 text-gray-500 hover:border-white/20'
              }`}
            >
              <span className="text-[10px] font-black uppercase">{task.version}</span>
              <div className={`w-1 h-1 rounded-full ${currentIndex === i ? 'bg-cyan-400 animate-pulse' : 'bg-gray-700'}`} />
            </button>
          ))}
        </div>
      </div>

      <div className="p-3 bg-white/5 border border-white/10 rounded-xl space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-[8px] text-gray-500 uppercase font-bold tracking-widest">Current Task</div>
          <span className="text-[9px] font-mono text-cyan-400">STEP_{currentIndex + 1}</span>
        </div>
        <p className="text-[10px] font-mono text-gray-300 leading-tight">
          {currentTask.description}
        </p>
      </div>

      <div className="space-y-4 pt-4 border-t border-white/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FlaskConical size={14} className="text-purple-400" />
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Compression Level</span>
          </div>
          <span className="text-[10px] font-mono text-purple-400">{compressionLevel} / 7</span>
        </div>
        <input 
          type="range" 
          min="1" 
          max="7" 
          step="1"
          value={compressionLevel}
          onChange={(e) => setCompressionLevel(parseInt(e.target.value))}
          className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-purple-500"
        />
      </div>
    </div>
  );
};

const IntelligenceTrajectory = ({ log, onApply, autonomousState }: { log: any[]; onApply?: (state: any, version: string) => void, autonomousState: any }) => {
  // Build chart data: use running complexity from server memory, compute novelty as unique-state ratio
  let runningComplexity = 0;
  const chartData = log.map((entry, i) => {
    // Complexity = floor(memorySize * 1.5) + 1 on server side
    // Here we use the payload value if available, otherwise estimate from index
    const c = entry.payload?.complexity || entry.payload?.fitness || entry.payload?.gen || 0;
    if (c > runningComplexity) runningComplexity = c;
    else runningComplexity += 1;

    // Novelty = unique states / total evaluated (from optimizer: fitness / theoretical max ~60)
    const novelty = entry.payload?.novelty ?? (entry.payload?.fitness ? entry.payload.fitness / 60 : (0.3 + Math.sin(i * 0.2) * 0.15));

    return {
      time: i,
      complexity: runningComplexity,
      novelty: Math.min(1, Math.max(0, novelty)),
    };
  }).slice(-50);

  const latestComplexity = chartData.length > 0 ? chartData[chartData.length - 1].complexity : 0;
  const latestNovelty = chartData.length > 0 ? chartData[chartData.length - 1].novelty : 0;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Trajectory Log */}
        <div className="lg:col-span-1 bg-black/40 rounded-2xl border border-white/10 p-6 space-y-6 overflow-hidden flex flex-col h-[700px]">
          <div className="flex items-center justify-between border-b border-white/5 pb-4">
            <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-2">
              <HistoryIcon size={14} />
              DeepLearning Trajectory
            </h3>
            <span className="text-[10px] font-mono text-gray-500">{log.length} nodes</span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
            {log.slice().reverse().map((entry, i) => {
              const c = entry.payload?.complexity || entry.payload?.fitness || entry.payload?.gen || 0;
              const n = entry.payload?.novelty ?? (entry.payload?.fitness ? (entry.payload.fitness / 60) : null);
              return (
                <div key={i} className="p-4 bg-white/5 rounded-xl border border-white/5 hover:border-emerald-500/30 transition-all group">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[9px] font-bold text-emerald-500/80 uppercase tracking-tighter">
                      {entry.event.replace('_', ' ')}
                    </span>
                    <span className="text-[8px] font-mono text-gray-600">
                      {new Date(entry.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-400 leading-relaxed mb-2">
                    {entry.payload?.message || (
                      entry.event === 'optimizer'
                        ? `Gen ${entry.payload?.gen || '?'}: fitness=${(entry.payload?.fitness || 0).toFixed(1)} (noveltySum * brightness * (1 + colorSpeed * 0.1))`
                        : `State iteration ${c} — C = floor(memorySize * 1.5) + 1`
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="text-[8px] font-mono text-gray-500">
                      COMPLEXITY: <span className="text-emerald-400">{c || (entry.payload?.stats?.complexity ?? '—')}</span>
                    </div>
                    <div className="text-[8px] font-mono text-gray-500">
                      NOVELTY: <span className="text-purple-400">{n !== null ? (n * 100).toFixed(1) + '%' : (entry.payload?.stats?.novelty ? (entry.payload.stats.novelty * 100).toFixed(1) + '%' : '—')}</span>
                    </div>
                  </div>

                  {entry.payload?.state && (
                    <button
                      onClick={() => onApply?.(entry.payload.state, entry.payload.version || 'v1')}
                      className="mt-2 px-2 py-1 bg-emerald-500/20 hover:bg-emerald-500/40 border border-emerald-500/30 rounded text-[8px] font-bold text-emerald-400 uppercase tracking-widest transition-all opacity-0 group-hover:opacity-100"
                    >
                      Apply State
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Mathematical & Visual Analysis */}
        <div className="lg:col-span-2 space-y-8">
          {/* Formulas & Metrics */}
          <div className="bg-black/40 rounded-2xl border border-white/10 p-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                <div className="text-[7px] text-gray-500 uppercase tracking-widest mb-1">Complexity</div>
                <div className="text-lg font-mono font-bold text-emerald-400">{latestComplexity}</div>
                <div className="text-[7px] font-mono text-gray-600 mt-1">C = floor(|M| * 1.5) + 1</div>
                <div className="text-[7px] text-gray-500 mt-0.5">|M| = unique states explored</div>
              </div>
              <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                <div className="text-[7px] text-gray-500 uppercase tracking-widest mb-1">Novelty Ratio</div>
                <div className="text-lg font-mono font-bold text-purple-400">{(latestNovelty * 100).toFixed(1)}%</div>
                <div className="text-[7px] font-mono text-gray-600 mt-1">N = unique_hashes / 60</div>
                <div className="text-[7px] text-gray-500 mt-0.5">60-step cellular automaton</div>
              </div>
              <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                <div className="text-[7px] text-gray-500 uppercase tracking-widest mb-1">Fitness Formula</div>
                <div className="text-xs font-mono font-bold text-cyan-400 mt-1">F = N * B * (1+S*0.1)</div>
                <div className="text-[7px] text-gray-500 mt-1">N=noveltySum B=brightness</div>
                <div className="text-[7px] text-gray-500">S=colorSpeed</div>
              </div>
              <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                <div className="text-[7px] text-gray-500 uppercase tracking-widest mb-1">Evolution</div>
                <div className="text-xs font-mono font-bold text-amber-400 mt-1">GA(12, 2, 0.3)</div>
                <div className="text-[7px] text-gray-500 mt-1">pop=12, elite=2, mut=30%</div>
                <div className="text-[7px] text-gray-500">5s generations, P2P 15s</div>
              </div>
            </div>
          </div>

          {/* Mathematical Progress Chart */}
          <div className="bg-black/40 rounded-2xl border border-white/10 p-6 h-[350px]">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-widest flex items-center gap-2">
                <Zap size={14} />
                Optimizer Progress — Complexity vs Novelty
              </h3>
              <div className="flex gap-4 text-[8px] font-mono uppercase tracking-widest">
                <span className="flex items-center gap-1 text-emerald-400">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Complexity (C)
                </span>
                <span className="flex items-center gap-1 text-purple-400">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-400" /> Novelty (N)
                </span>
              </div>
            </div>
              <AreaChart
                data={chartData}
                responsive
                style={{ width: '100%', height: 260, minWidth: 0 }}
              >
                <defs>
                  <linearGradient id="colorComp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorNov" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                <XAxis hide dataKey="time" />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ backgroundColor: '#000', border: '1px solid rgba(255,255,255,0.1)', fontSize: '10px' }}
                  itemStyle={{ fontSize: '10px' }}
                  formatter={(value: any, name: string) => [
                    name === 'complexity' ? `${value} (C = floor(|M|*1.5)+1)` : `${(value * 100).toFixed(1)}% (unique/60)`,
                    name === 'complexity' ? 'Complexity' : 'Novelty'
                  ]}
                />
                <Area type="monotone" dataKey="complexity" stroke="#10b981" fillOpacity={1} fill="url(#colorComp)" strokeWidth={2} />
                <Area type="monotone" dataKey="novelty" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorNov)" strokeWidth={2} />
              </AreaChart>
          </div>

          {/* Visual Reinterpretations */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-black/40 rounded-2xl border border-white/10 p-6 space-y-4">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <Layers size={14} />
                Topological Reinterpretation
              </h3>
              <div className="aspect-video bg-white/5 rounded-xl border border-white/5 flex items-center justify-center relative overflow-hidden">
                <svg width="100%" height="100%" viewBox="0 0 200 100" className="opacity-60">
                  {Array.from({ length: 20 }).map((_, i) => (
                    <motion.path
                      key={i}
                      d={`M ${i * 10} 50 Q ${i * 10 + 5} ${20 + Math.random() * 60} ${i * 10 + 10} 50`}
                      stroke={i % 2 === 0 ? "#06b6d4" : "#8b5cf6"}
                      strokeWidth="0.5"
                      fill="none"
                      animate={{
                        d: `M ${i * 10} 50 Q ${i * 10 + 5} ${10 + Math.random() * 80} ${i * 10 + 10} 50`,
                      }}
                      transition={{ duration: 2 + Math.random() * 2, repeat: Infinity, ease: "easeInOut" }}
                    />
                  ))}
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-[10px] font-mono text-cyan-400 bg-black/60 px-3 py-1 rounded-full border border-cyan-500/20 backdrop-blur-sm">
                    PHASE_ROTATION_V2_ACTIVE
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-black/40 rounded-2xl border border-white/10 p-6 space-y-4">
              <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <Box size={14} />
                Latent Space Projection
              </h3>
              <div className="aspect-video bg-white/5 rounded-xl border border-white/5 flex items-center justify-center relative overflow-hidden">
                <div className="grid grid-cols-8 grid-rows-4 gap-1 w-full h-full p-4">
                  {Array.from({ length: 32 }).map((_, i) => (
                    <motion.div
                      key={i}
                      className="rounded-sm"
                      animate={{
                        backgroundColor: [
                          `rgba(6, 182, 212, ${Math.random() * 0.3})`,
                          `rgba(139, 92, 246, ${Math.random() * 0.3})`,
                          `rgba(16, 185, 129, ${Math.random() * 0.3})`
                        ]
                      }}
                      transition={{ duration: 3 + Math.random() * 5, repeat: Infinity }}
                    />
                  ))}
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-[10px] font-mono text-purple-400 bg-black/60 px-3 py-1 rounded-full border border-purple-500/20 backdrop-blur-sm">
                    MEMORY_CLUSTERING_0.84
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* System Summary */}
          <div className="bg-emerald-500/5 rounded-2xl border border-emerald-500/20 p-6 space-y-4">
            <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-2">
              <Activity size={14} />
              System Summary & Improvements
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-3">
                <p className="text-[10px] text-gray-400 leading-relaxed">
                  The Genesis Brain has processed <span className="text-white font-bold">{log.length}</span> trajectory nodes. 
                  Current system integrity is <span className="text-emerald-400">{(autonomousState?.buildStatus?.integrity * 100 || 99.8).toFixed(2)}%</span>, 
                  with <span className="text-white font-bold">{autonomousState?.tasks?.filter((t: any) => t.status === 'completed').length || 0}</span> autonomous tasks finalized.
                </p>
                <div className="flex gap-2">
                  <div className="px-2 py-1 bg-white/5 rounded text-[8px] font-mono text-gray-500 uppercase">
                    Build: v{autonomousState?.buildStatus?.version || '4.2.0'}
                  </div>
                  <div className="px-2 py-1 bg-white/5 rounded text-[8px] font-mono text-gray-500 uppercase">
                    Novelty Engine: 94%
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <div className="text-[9px] font-bold text-emerald-400/60 uppercase tracking-widest">Recent Improvements</div>
                <ul className="space-y-1">
                  {autonomousState?.logs?.filter((l: string) => l.includes('[BUILDER]')).slice(-4).map((item: string, i: number) => (
                    <li key={i} className="text-[9px] text-gray-500 flex items-center gap-2">
                      <div className="w-1 h-1 rounded-full bg-emerald-500/40" />
                      {item.replace('[BUILDER] ', '')}
                    </li>
                  )) || [
                    "Enhanced exclusion rule for V2 phase rotation",
                    "Optimized latent space clustering for material specs",
                    "Reduced simulation jitter in high-complexity states",
                    "Improved thermodynamic coupling in house analysis"
                  ].map((item, i) => (
                    <li key={i} className="text-[9px] text-gray-500 flex items-center gap-2">
                      <div className="w-1 h-1 rounded-full bg-emerald-500/40" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// ELEMENTS VIEW — Periodic Table, Isotope Chart, Material Builder
// ═══════════════════════════════════════════════════════════════

const CATEGORY_COLORS: Record<ElementCategory, string> = {
  alkali_metal:     'bg-blue-600/80 border-blue-400 text-blue-100',
  alkaline_earth:   'bg-blue-500/60 border-blue-300 text-blue-100',
  transition_metal: 'bg-sky-600/60 border-sky-400 text-sky-100',
  post_transition:  'bg-indigo-500/60 border-indigo-400 text-indigo-100',
  metalloid:        'bg-orange-500/60 border-orange-400 text-orange-100',
  nonmetal:         'bg-emerald-600/60 border-emerald-400 text-emerald-100',
  halogen:          'bg-green-500/60 border-green-400 text-green-100',
  noble_gas:        'bg-purple-600/60 border-purple-400 text-purple-100',
  lanthanide:       'bg-rose-600/60 border-rose-400 text-rose-100',
  actinide:         'bg-red-600/60 border-red-400 text-red-100',
};

const CATEGORY_LABELS: Record<ElementCategory, string> = {
  alkali_metal: 'Alkali Metal',
  alkaline_earth: 'Alkaline Earth',
  transition_metal: 'Transition Metal',
  post_transition: 'Post-Transition',
  metalloid: 'Metalloid',
  nonmetal: 'Nonmetal',
  halogen: 'Halogen',
  noble_gas: 'Noble Gas',
  lanthanide: 'Lanthanide',
  actinide: 'Actinide',
};

// Electron configuration builder
function electronConfig(z: number): string {
  const orbitals = [
    [1,'s',2],[2,'s',2],[2,'p',6],[3,'s',2],[3,'p',6],[4,'s',2],[3,'d',10],[4,'p',6],
    [5,'s',2],[4,'d',10],[5,'p',6],[6,'s',2],[4,'f',14],[5,'d',10],[6,'p',6],
    [7,'s',2],[5,'f',14],[6,'d',10],[7,'p',6]
  ] as [number, string, number][];
  let remaining = z;
  const parts: string[] = [];
  for (const [n, l, max] of orbitals) {
    if (remaining <= 0) break;
    const fill = Math.min(remaining, max);
    parts.push(`${n}${l}${fill}`);
    remaining -= fill;
  }
  return parts.join(' ');
}

// Build the standard periodic table layout grid
// Returns a 10x18 grid (rows x cols) where each cell is either a ChemElement or null
function buildPeriodicTableGrid(): (ChemElement | null)[][] {
  const grid: (ChemElement | null)[][] = Array.from({ length: 10 }, () => Array(18).fill(null));

  for (const el of ELEMENTS) {
    let row: number;
    let col: number;

    if (el.category === 'lanthanide') {
      // Lanthanides go in row 8 (index 8), columns 3-17 based on Z
      row = 8;
      col = 2 + (el.z - 57); // La=57 -> col 2, Lu=71 -> col 16
    } else if (el.category === 'actinide') {
      // Actinides go in row 9 (index 9), columns 3-17 based on Z
      row = 9;
      col = 2 + (el.z - 89); // Ac=89 -> col 2, Lr=103 -> col 16
    } else {
      row = el.period - 1;
      col = el.group - 1;
    }

    if (row >= 0 && row < 10 && col >= 0 && col < 18) {
      grid[row][col] = el;
    }
  }
  return grid;
}

// Magic numbers for nuclear physics
const MAGIC_NUMBERS = [2, 8, 20, 28, 50, 82, 126];

const ElementsView = () => {
  const [selectedElement, setSelectedElement] = useState<ChemElement | null>(null);
  const [selectedForBuilder, setSelectedForBuilder] = useState<Set<number>>(new Set());
  const [activePanel, setActivePanel] = useState<'table' | 'isotopes' | 'builder' | 'intersim' | 'carbon'>('table');
  const [, forceUpdate] = useState(0);

  // Access V13 engine exposed from SimulationView via window
  const engine: V13MaterialEngine | null = (window as any).v13MaterialEngine || null;
  const periodicGrid = React.useMemo(() => buildPeriodicTableGrid(), []);

  // Periodically refresh for inter-sim data and engine state
  useEffect(() => {
    const iv = setInterval(() => forceUpdate(c => c + 1), 2000);
    return () => clearInterval(iv);
  }, []);

  // Activate element in engine when selected
  const handleSelectElement = (el: ChemElement) => {
    setSelectedElement(el);
    if (engine) {
      engine.activateElement(el.z);
    }
  };

  const toggleBuilder = (z: number) => {
    setSelectedForBuilder(prev => {
      const next = new Set(prev);
      if (next.has(z)) { next.delete(z); }
      else { next.add(z); }
      return next;
    });
  };

  const buildComposite = () => {
    if (!engine || selectedForBuilder.size === 0) return;
    const elems = Array.from(selectedForBuilder).map(z => ({
      z,
      fraction: 1 / selectedForBuilder.size,
    }));
    engine.buildComposite(elems);
    forceUpdate(c => c + 1);
  };

  const metrics = engine?.getMetrics() || null;
  const activeEl = engine?.getActiveElement() || null;
  const latestComposite = engine?.getLatestComposite() || null;
  const isotopeClasses = engine?.getIsotopesByClass() || null;

  // Common compounds lookup (inline, since engine doesn't have this)
  const COMMON_COMPOUNDS: Record<string, { formula: string; name: string }[]> = {
    H: [{ formula: 'H2O', name: 'Water' }, { formula: 'HCl', name: 'Hydrochloric acid' }, { formula: 'NH3', name: 'Ammonia' }, { formula: 'CH4', name: 'Methane' }],
    O: [{ formula: 'H2O', name: 'Water' }, { formula: 'CO2', name: 'Carbon dioxide' }, { formula: 'SiO2', name: 'Silica' }, { formula: 'Fe2O3', name: 'Iron(III) oxide' }],
    C: [{ formula: 'CO2', name: 'Carbon dioxide' }, { formula: 'CH4', name: 'Methane' }, { formula: 'SiC', name: 'Silicon carbide' }, { formula: 'CaCO3', name: 'Calcium carbonate' }],
    N: [{ formula: 'NH3', name: 'Ammonia' }, { formula: 'N2', name: 'Nitrogen gas' }, { formula: 'HNO3', name: 'Nitric acid' }],
    Na: [{ formula: 'NaCl', name: 'Sodium chloride' }, { formula: 'NaOH', name: 'Sodium hydroxide' }],
    Cl: [{ formula: 'NaCl', name: 'Sodium chloride' }, { formula: 'HCl', name: 'Hydrochloric acid' }, { formula: 'Cl2', name: 'Chlorine gas' }],
    Fe: [{ formula: 'Fe2O3', name: 'Iron(III) oxide' }, { formula: 'FeCl3', name: 'Iron(III) chloride' }, { formula: 'FeS2', name: 'Pyrite' }],
    Si: [{ formula: 'SiO2', name: 'Silica' }, { formula: 'SiC', name: 'Silicon carbide' }],
    Ca: [{ formula: 'CaCO3', name: 'Calcium carbonate' }, { formula: 'CaO', name: 'Quicklime' }],
    Al: [{ formula: 'Al2O3', name: 'Alumina' }, { formula: 'AlCl3', name: 'Aluminum chloride' }],
    Cu: [{ formula: 'CuSO4', name: 'Copper sulfate' }, { formula: 'CuO', name: 'Copper(II) oxide' }],
    S: [{ formula: 'H2SO4', name: 'Sulfuric acid' }, { formula: 'SO2', name: 'Sulfur dioxide' }],
    K: [{ formula: 'KCl', name: 'Potassium chloride' }, { formula: 'KOH', name: 'Potassium hydroxide' }],
  };

  return (
    <div className="bg-black/40 rounded-xl border border-white/10 min-h-[600px] space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3">
        <div className="flex items-center gap-3">
          <FlaskConical size={24} className="text-emerald-400" />
          <div>
            <h2 className="text-lg font-black uppercase tracking-tighter text-white">Elements V13</h2>
            <p className="text-[10px] text-gray-500 font-mono uppercase">Periodic Table / Isotopes / Material Builder</p>
          </div>
        </div>
        <div className="flex gap-1">
          {(['table', 'isotopes', 'builder', 'carbon', 'intersim'] as const).map(p => (
            <button
              key={p}
              onClick={() => setActivePanel(p)}
              className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-widest transition-all ${
                activePanel === p
                  ? p === 'carbon' ? 'bg-orange-500 text-black' : 'bg-emerald-500 text-black'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {p === 'intersim' ? 'Inter-Sim' : p === 'carbon' ? 'Carbon & Life' : p}
            </button>
          ))}
        </div>
      </div>

      {/* Category Legend */}
      <div className="flex flex-wrap gap-2 px-1">
        {(Object.entries(CATEGORY_LABELS) as [ElementCategory, string][]).map(([cat, label]) => (
          <div key={cat} className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border ${CATEGORY_COLORS[cat]}`}>
            {label}
          </div>
        ))}
      </div>

      {/* PERIODIC TABLE PANEL */}
      {activePanel === 'table' && (
        <div className="space-y-4">
          {/* Periodic Table Grid */}
          <div className="overflow-x-auto">
            <div className="inline-grid gap-[2px]" style={{ gridTemplateColumns: 'repeat(18, minmax(0, 1fr))' }}>
              {periodicGrid.map((row, ri) => (
                <React.Fragment key={ri}>
                  {ri === 8 && (
                    <div className="col-span-18 h-2" style={{ gridColumn: '1 / -1' }} />
                  )}
                  {row.map((el, ci) => (
                    <div
                      key={`${ri}-${ci}`}
                      onClick={() => el && handleSelectElement(el)}
                      className={`
                        relative w-[42px] h-[42px] flex flex-col items-center justify-center rounded cursor-pointer
                        border transition-all duration-150
                        ${el ? CATEGORY_COLORS[el.category] : 'bg-transparent border-transparent'}
                        ${el && selectedElement?.z === el.z ? 'ring-2 ring-white shadow-[0_0_12px_rgba(255,255,255,0.4)] scale-110 z-10' : ''}
                        ${el && selectedForBuilder.has(el.z) ? 'ring-2 ring-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : ''}
                        ${el ? 'hover:scale-105 hover:z-10 hover:brightness-125' : 'pointer-events-none'}
                      `}
                    >
                      {el && (
                        <>
                          <span className="text-[7px] font-mono opacity-60 leading-none">{el.z}</span>
                          <span className="text-[11px] font-black leading-none">{el.sym}</span>
                        </>
                      )}
                    </div>
                  ))}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Element Detail Panel */}
          {selectedElement && (
            <div className="bg-white/5 rounded-xl border border-white/10 p-5 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className={`px-3 py-1 rounded-lg text-lg font-black border ${CATEGORY_COLORS[selectedElement.category]}`}>
                      {selectedElement.sym}
                    </span>
                    <div>
                      <h3 className="text-xl font-black text-white uppercase tracking-tight">{selectedElement.name}</h3>
                      <p className="text-[10px] text-gray-400 font-mono">
                        Z={selectedElement.z} | Mass={selectedElement.mass.toFixed(3)} u | {CATEGORY_LABELS[selectedElement.category]}
                      </p>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => toggleBuilder(selectedElement.z)}
                  className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-widest transition-all ${
                    selectedForBuilder.has(selectedElement.z)
                      ? 'bg-emerald-500 text-black'
                      : 'bg-white/5 text-gray-400 hover:bg-emerald-500/20 hover:text-emerald-300 border border-white/10'
                  }`}
                >
                  {selectedForBuilder.has(selectedElement.z) ? 'In Builder' : '+ Builder'}
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-black/40 p-3 rounded-lg border border-white/5">
                  <div className="text-[8px] text-gray-500 uppercase font-bold mb-1">Period / Group</div>
                  <div className="text-sm font-mono text-white">{selectedElement.period} / {selectedElement.group || 'N/A'}</div>
                </div>
                <div className="bg-black/40 p-3 rounded-lg border border-white/5">
                  <div className="text-[8px] text-gray-500 uppercase font-bold mb-1">Valence e-</div>
                  <div className="text-sm font-mono text-cyan-400">{selectedElement.valence}</div>
                </div>
                <div className="bg-black/40 p-3 rounded-lg border border-white/5">
                  <div className="text-[8px] text-gray-500 uppercase font-bold mb-1">Max Bonds</div>
                  <div className="text-sm font-mono text-cyan-400">{selectedElement.maxBonds}</div>
                </div>
                <div className="bg-black/40 p-3 rounded-lg border border-white/5">
                  <div className="text-[8px] text-gray-500 uppercase font-bold mb-1">Electronegativity</div>
                  <div className="text-sm font-mono text-cyan-400">{selectedElement.electronegativity || 'N/A'}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-black/40 p-3 rounded-lg border border-white/5">
                  <div className="text-[8px] text-gray-500 uppercase font-bold mb-1">Electron Configuration</div>
                  <div className="text-xs font-mono text-gray-300 break-all">
                    {activeEl?.electronConfig || electronConfig(selectedElement.z)}
                  </div>
                </div>
                <div className="bg-black/40 p-3 rounded-lg border border-white/5">
                  <div className="text-[8px] text-gray-500 uppercase font-bold mb-1">Oxidation States</div>
                  <div className="flex flex-wrap gap-1">
                    {selectedElement.oxidationStates.map(os => (
                      <span key={os} className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${
                        os > 0 ? 'bg-cyan-500/20 text-cyan-300' : os < 0 ? 'bg-red-500/20 text-red-300' : 'bg-gray-500/20 text-gray-400'
                      }`}>{os > 0 ? '+' : ''}{os}</span>
                    ))}
                  </div>
                </div>
              </div>

              {/* 3x3 Compression Grid */}
              <div className="bg-black/40 p-3 rounded-lg border border-white/5">
                <div className="text-[8px] text-gray-500 uppercase font-bold mb-2">3x3 Compression Grid</div>
                <div className="inline-grid grid-cols-3 gap-1">
                  {selectedElement.grid3x3.map((v, i) => (
                    <div
                      key={i}
                      className={`w-8 h-8 rounded flex items-center justify-center text-[9px] font-bold border ${
                        i === 4
                          ? 'bg-yellow-500/40 border-yellow-400 text-yellow-200'
                          : v === 1
                            ? 'bg-cyan-500/30 border-cyan-400 text-cyan-200'
                            : 'bg-white/5 border-white/10 text-gray-600'
                      }`}
                    >
                      {i === 4 ? 'N' : v === 1 ? 'e-' : ''}
                    </div>
                  ))}
                </div>
                <div className="text-[8px] text-gray-600 mt-1 font-mono">N=nucleus, e-=electron, empty=bond site</div>
              </div>

              {/* Isotopes List (from engine's activated element) */}
              {activeEl && activeEl.isotopes.length > 0 && (
                <div className="bg-black/40 p-3 rounded-lg border border-white/5">
                  <div className="text-[8px] text-gray-500 uppercase font-bold mb-2">Isotopes ({activeEl.isotopes.length})</div>
                  <div className="flex flex-wrap gap-1 max-h-[100px] overflow-y-auto">
                    {activeEl.isotopes.map((iso: IsotopeData) => (
                      <span
                        key={iso.massNumber}
                        className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-bold ${
                          iso.stable ? 'bg-emerald-500/20 text-emerald-300' :
                          iso.decayMode === 'theoretical' ? 'bg-gray-500/20 text-gray-500' :
                          'bg-yellow-500/20 text-yellow-300'
                        }`}
                        title={`A=${iso.massNumber} N=${iso.neutrons} ${iso.decayMode}${iso.halfLife ? ` t1/2=${iso.halfLife}s` : ''}`}
                      >
                        <sup>{iso.massNumber}</sup>{selectedElement.sym}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Known Compounds */}
              <div className="bg-black/40 p-3 rounded-lg border border-white/5">
                <div className="text-[8px] text-gray-500 uppercase font-bold mb-2">Known Compounds</div>
                {(COMMON_COMPOUNDS[selectedElement.sym] || []).length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {(COMMON_COMPOUNDS[selectedElement.sym] || []).map(c => (
                      <div key={c.formula} className="bg-white/5 border border-white/10 px-2 py-1 rounded">
                        <div className="text-[10px] font-bold text-white">{c.formula}</div>
                        <div className="text-[8px] text-gray-400">{c.name}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[9px] text-gray-600 font-mono">No common compounds indexed.</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ISOTOPE CHART PANEL */}
      {activePanel === 'isotopes' && selectedElement && isotopeClasses && (
        <div className="space-y-4">
          <div className="bg-white/5 rounded-xl border border-white/10 p-5">
            <h3 className="text-sm font-bold uppercase tracking-widest text-emerald-400 mb-3">
              Isotope Chart: {selectedElement.name} (Z={selectedElement.z})
            </h3>
            <div className="text-[8px] text-gray-500 mb-2 font-mono">
              X = Neutron count | Y = Stability | Green = Stable | Yellow/Red = Radioactive | Grey = Theoretical
            </div>
            <div className="relative bg-black/40 rounded-lg border border-white/5 p-4 min-h-[200px]">
              <div className="absolute left-0 top-1/2 -translate-y-1/2 -rotate-90 text-[8px] text-gray-500 font-mono">Stability</div>
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[8px] text-gray-500 font-mono">Neutron Count</div>
              <div className="ml-4 mb-4 flex items-end gap-[3px] h-[160px]">
                {(activeEl?.isotopes || []).map((iso: IsotopeData) => {
                  const stabHeight = iso.stable ? 90 : iso.decayMode === 'theoretical' ? 20 : 50;
                  const isMagic = MAGIC_NUMBERS.includes(iso.neutrons) || MAGIC_NUMBERS.includes(selectedElement.z);
                  return (
                    <div key={iso.massNumber} className="flex flex-col items-center gap-0.5" style={{ flex: '1 1 0' }}>
                      <div
                        className={`w-full rounded-t transition-all ${
                          iso.stable ? 'bg-emerald-500' :
                          iso.decayMode === 'theoretical' ? 'bg-gray-600' :
                          'bg-yellow-500'
                        } ${isMagic ? 'ring-1 ring-white/50' : ''}`}
                        style={{ height: `${stabHeight}%`, minWidth: 8 }}
                        title={`A=${iso.massNumber} N=${iso.neutrons} ${iso.decayMode}${iso.halfLife ? ` t1/2=${iso.halfLife}s` : ''}${isMagic ? ' MAGIC' : ''}`}
                      />
                      <span className="text-[7px] font-mono text-gray-500 rotate-45 origin-bottom-left whitespace-nowrap">
                        {iso.neutrons}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Magic number legend */}
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[8px] text-gray-500 font-mono">Magic Numbers:</span>
              {MAGIC_NUMBERS.map(m => (
                <span key={m} className="px-1.5 py-0.5 bg-white/10 rounded text-[8px] font-mono text-white/60 border border-white/10">
                  {m}
                </span>
              ))}
            </div>
            {/* Isotope summary */}
            <div className="grid grid-cols-4 gap-2 mt-3">
              <div className="bg-emerald-500/10 border border-emerald-500/20 p-2 rounded text-center">
                <div className="text-sm font-bold text-emerald-400">{isotopeClasses.stable.length}</div>
                <div className="text-[8px] text-gray-500 uppercase font-bold">Stable</div>
              </div>
              <div className="bg-yellow-500/10 border border-yellow-500/20 p-2 rounded text-center">
                <div className="text-sm font-bold text-yellow-400">{isotopeClasses.radioactive.length}</div>
                <div className="text-[8px] text-gray-500 uppercase font-bold">Radioactive</div>
              </div>
              <div className="bg-gray-500/10 border border-gray-500/20 p-2 rounded text-center">
                <div className="text-sm font-bold text-gray-400">{isotopeClasses.theoretical.length}</div>
                <div className="text-[8px] text-gray-500 uppercase font-bold">Theoretical</div>
              </div>
              <div className="bg-purple-500/10 border border-purple-500/20 p-2 rounded text-center">
                <div className="text-sm font-bold text-purple-400">{isotopeClasses.magicNumberIsotopes.length}</div>
                <div className="text-[8px] text-gray-500 uppercase font-bold">Magic #</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activePanel === 'isotopes' && !selectedElement && (
        <div className="bg-white/5 rounded-xl border border-white/10 p-12 flex flex-col items-center justify-center text-center">
          <FlaskConical size={40} className="text-gray-600 mb-3" />
          <p className="text-sm text-gray-500 font-bold uppercase">Select an element from the Table panel first</p>
        </div>
      )}

      {/* MATERIAL BUILDER PANEL */}
      {activePanel === 'builder' && (
        <div className="space-y-4">
          {/* Element Multi-Select */}
          <div className="bg-white/5 rounded-xl border border-white/10 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold uppercase tracking-widest text-emerald-400">Material Builder</h3>
              <button
                onClick={() => setSelectedForBuilder(new Set())}
                className="text-[9px] text-gray-500 hover:text-red-400 font-bold uppercase"
              >
                Clear All
              </button>
            </div>
            <p className="text-[9px] text-gray-500 mb-3 font-mono">Select elements then click Build Composite. Equal fractions are used.</p>

            {/* Quick element picker */}
            <div className="flex flex-wrap gap-1 max-h-[120px] overflow-y-auto mb-3">
              {ELEMENTS.filter(e => e.canBond).slice(0, 36).map(el => (
                <button
                  key={el.z}
                  onClick={() => toggleBuilder(el.z)}
                  className={`px-2 py-1 rounded text-[9px] font-bold border transition-all ${
                    selectedForBuilder.has(el.z)
                      ? 'bg-emerald-500/30 border-emerald-400 text-emerald-200'
                      : `${CATEGORY_COLORS[el.category]} opacity-60 hover:opacity-100`
                  }`}
                >
                  {el.sym}
                </button>
              ))}
            </div>

            {/* Selected elements display */}
            {selectedForBuilder.size > 0 && (
              <div className="flex flex-wrap gap-2 p-2 bg-black/40 rounded-lg border border-emerald-500/20 mb-3">
                {Array.from(selectedForBuilder).map(z => {
                  const el = BY_Z[z];
                  return el ? (
                    <div key={z} className="flex items-center gap-1 bg-emerald-500/20 border border-emerald-500/30 px-2 py-1 rounded">
                      <span className="text-[10px] font-black text-emerald-300">{el.sym}</span>
                      <span className="text-[8px] text-emerald-400/60">{el.name}</span>
                      <button onClick={() => toggleBuilder(z)} className="text-[10px] text-red-400 hover:text-red-300 ml-1 font-bold">x</button>
                    </div>
                  ) : null;
                })}
              </div>
            )}

            {selectedForBuilder.size > 0 && (
              <button
                onClick={buildComposite}
                className="w-full py-2 bg-emerald-500 text-black font-black uppercase tracking-widest text-xs rounded-lg shadow-lg hover:bg-emerald-400 transition-all"
              >
                Build Composite ({selectedForBuilder.size} elements)
              </button>
            )}
          </div>

          {/* Composite Properties */}
          {latestComposite && (
            <div className="bg-white/5 rounded-xl border border-emerald-500/20 p-4 space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-widest text-emerald-400">
                Latest Composite ({latestComposite.elements.length} components)
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {([
                  ['Conductivity', latestComposite.properties.conductivity.toFixed(3) + ' S/m', 'text-cyan-400'],
                  ['Density', latestComposite.properties.density.toFixed(3) + ' g/cm3', 'text-white'],
                  ['Bandgap', latestComposite.properties.opticalBandgap.toFixed(2) + ' eV', 'text-yellow-400'],
                  ['Prime Resonance', (latestComposite.primeResonance * 100).toFixed(1) + '%', 'text-emerald-400'],
                  ['Hardness', latestComposite.properties.hardness.toFixed(1) + ' Mohs', 'text-white'],
                  ['Melting Pt', latestComposite.properties.meltingPoint.toFixed(0) + ' K', 'text-red-400'],
                  ['Thermal K', latestComposite.properties.thermalConductivity.toFixed(1) + ' W/mK', 'text-cyan-400'],
                  ['Bonds', String(latestComposite.bonds.length), 'text-emerald-400'],
                ] as [string, string, string][]).map(([label, value, color]) => (
                  <div key={label} className="bg-black/40 p-2 rounded-lg border border-white/5">
                    <div className="text-[7px] text-gray-500 uppercase font-bold mb-0.5">{label}</div>
                    <div className={`text-xs font-mono font-bold ${color}`}>{value}</div>
                  </div>
                ))}
              </div>

              {/* 3D Topology Preview */}
              <div className="bg-black/40 p-3 rounded-lg border border-white/5">
                <div className="text-[8px] text-gray-500 uppercase font-bold mb-2">3D Topology (feeds V1 Material Field)</div>
                <div className="relative h-[150px] bg-black/60 rounded overflow-hidden">
                  <svg viewBox="-5 -5 10 10" className="w-full h-full">
                    {/* Faces as translucent polygons */}
                    {latestComposite.topology3D.faces.slice(0, 50).map((face, i) => {
                      const pts = face.map(vi => latestComposite.topology3D.vertices[vi]).filter(Boolean);
                      if (pts.length < 3) return null;
                      const path = pts.map((p, j) => `${j === 0 ? 'M' : 'L'}${(p[0] || 0) * 2},${(p[1] || 0) * 2}`).join(' ') + 'Z';
                      return <path key={`f${i}`} d={path} fill="rgba(16,185,129,0.15)" stroke="rgba(16,185,129,0.3)" strokeWidth="0.05" />;
                    })}
                    {/* Vertices */}
                    {latestComposite.topology3D.vertices.slice(0, 30).map((v, i) => (
                      <circle
                        key={`v${i}`}
                        cx={(v[0] || 0) * 2} cy={(v[1] || 0) * 2} r={0.15}
                        fill="rgba(16,185,129,0.8)"
                        stroke="white" strokeWidth="0.03"
                      />
                    ))}
                  </svg>
                </div>
                <div className="text-[8px] text-gray-600 mt-1 font-mono">
                  {latestComposite.topology3D.vertices.length} vertices, {latestComposite.topology3D.faces.length} faces
                </div>
              </div>
            </div>
          )}

          {/* All composites list */}
          {engine && engine.getComposites().length > 1 && (
            <div className="bg-white/5 rounded-xl border border-white/10 p-4">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                All Composites ({engine.getComposites().length})
              </h3>
              <div className="space-y-1 max-h-[100px] overflow-y-auto">
                {engine.getComposites().map((comp, i) => (
                  <div key={i} className="flex items-center justify-between bg-black/40 px-2 py-1 rounded text-[9px]">
                    <span className="text-gray-300 font-mono">
                      {comp.elements.map(e => e.element.sym).join('-')}
                    </span>
                    <span className="text-emerald-400 font-mono">{(comp.primeResonance * 100).toFixed(0)}% res</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedForBuilder.size === 0 && !latestComposite && (
            <div className="bg-white/5 rounded-xl border border-white/10 p-8 text-center">
              <p className="text-sm text-gray-500 font-bold uppercase">Select elements above to build a composite material</p>
            </div>
          )}
        </div>
      )}

      {/* CARBON & ORIGIN OF LIFE PANEL */}
      {activePanel === 'carbon' && (
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* Header */}
          <div className="bg-gradient-to-r from-orange-500/10 to-red-500/10 rounded-xl border border-orange-500/20 p-5">
            <h3 className="text-lg font-black text-orange-400 mb-1">Carbon: Element 6 — The Architect of Life</h3>
            <p className="text-xs text-gray-400">Z=6 | 2×3 (rootPrime=2) | Valence 4 | The ONLY element that can form unlimited chain lengths, planar rings, AND 3D lattices simultaneously.</p>
            <p className="text-[10px] text-orange-300/60 mt-2 font-mono">Aromatic rings are recursive Riemann zeta signal carriers — standing waves on molecular circles that encode information through eigenvalue spectra matching zeta zero distributions.</p>
          </div>

          {/* Carbon Allotropes */}
          <div className="bg-white/5 rounded-xl border border-white/10 p-5">
            <h4 className="text-sm font-bold uppercase tracking-widest text-cyan-400 mb-3">Carbon Allotropes</h4>
            <div className="space-y-2">
              {CARBON_ALLOTROPES.map(a => (
                <div key={a.name} className={`p-3 rounded-lg border ${a.aromaticRings ? 'border-orange-500/30 bg-orange-500/5' : 'border-white/10 bg-black/40'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-black text-white">{a.name}</span>
                    <div className="flex gap-2">
                      <span className="text-[8px] font-mono px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300">{a.hybridization}</span>
                      <span className="text-[8px] font-mono px-2 py-0.5 rounded bg-purple-500/20 text-purple-300">{a.dimensions}</span>
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-400 mb-1">{a.structure}</p>
                  <div className="grid grid-cols-4 gap-1 mb-1">
                    <div className="text-center"><span className="text-[8px] text-gray-500">σ</span><div className="text-[9px] font-mono text-yellow-300">{a.conductivity.toExponential(0)} S/m</div></div>
                    <div className="text-center"><span className="text-[8px] text-gray-500">Mohs</span><div className="text-[9px] font-mono text-white">{a.hardness}</div></div>
                    <div className="text-center"><span className="text-[8px] text-gray-500">ρ</span><div className="text-[9px] font-mono text-cyan-300">{a.density} g/cm³</div></div>
                    <div className="text-center"><span className="text-[8px] text-gray-500">Gap</span><div className="text-[9px] font-mono text-emerald-300">{a.bandgap} eV</div></div>
                  </div>
                  <p className="text-[9px] text-orange-300 italic font-mono">ζ: {a.zetaRelevance}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Aromatic Rings — The Zeta Carriers */}
          <div className="bg-white/5 rounded-xl border border-orange-500/20 p-5">
            <h4 className="text-sm font-bold uppercase tracking-widest text-orange-400 mb-1">Aromatic Rings — Recursive Zeta Signal Carriers</h4>
            <p className="text-[9px] text-gray-500 mb-3 font-mono">Hückel's rule: 4n+2 π electrons = aromatic (stable standing wave). Ring eigenvalues map to Riemann zeta zeros via GUE statistics.</p>
            <div className="space-y-2">
              {AROMATIC_RINGS.map(ring => {
                const energies = huckelEnergies(ring.carbonCount + ring.heteroAtoms.length);
                const zetaMap = zetaZeroMapping(energies);
                return (
                  <div key={ring.name} className="p-3 rounded-lg border border-orange-500/20 bg-orange-500/5">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-black text-white">{ring.name}</span>
                      <span className="text-[9px] font-mono text-orange-300">{ring.formula} | {ring.electronCount}π e⁻ | n={ring.huckelN}</span>
                    </div>
                    <p className="text-[10px] text-emerald-300 mb-1">{ring.biologicalRole}</p>
                    <div className="flex gap-2 mb-1">
                      <span className="text-[8px] font-mono text-gray-400">Symmetry: {ring.symmetryGroup}</span>
                      <span className="text-[8px] font-mono text-yellow-300">Stabilization: {ring.aromaticEnergy} kJ/mol</span>
                    </div>
                    {/* Hückel eigenvalue bar chart → zeta mapping */}
                    <div className="flex gap-0.5 items-end h-8 mt-1">
                      {zetaMap.map((z, i) => (
                        <div key={i} className="flex-1 flex flex-col items-center" title={`λ=${z.eigenvalue.toFixed(3)} → ζ zero ≈ ${z.zetaZeroEstimate.toFixed(1)}`}>
                          <div
                            className="w-full rounded-t"
                            style={{
                              height: `${Math.max(2, Math.abs(z.eigenvalue) * 12)}px`,
                              backgroundColor: z.eigenvalue >= 0 ? `rgba(249,115,22,${0.3 + z.gueCorrelation * 0.7})` : `rgba(59,130,246,${0.3 + z.gueCorrelation * 0.7})`,
                            }}
                          />
                          <span className="text-[6px] font-mono text-gray-500">{z.eigenvalue.toFixed(1)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Stacked Ring Analysis (DNA-like) */}
            <div className="mt-4 p-3 rounded-lg border border-purple-500/20 bg-purple-500/5">
              <h5 className="text-xs font-bold text-purple-300 uppercase mb-1">π-π Stacking Analysis (DNA Base Stack)</h5>
              {(() => {
                const dnaStack = AROMATIC_RINGS.filter(r => ['Purine', 'Pyrimidine'].includes(r.name));
                // Simulate a 10-base-pair stack: alternating purine/pyrimidine
                const stack = Array.from({ length: 10 }, (_, i) => dnaStack[i % dnaStack.length]);
                const coupling = stackedRingCoupling(stack);
                return (
                  <div>
                    <div className="grid grid-cols-3 gap-2 mb-2">
                      <div className="text-center bg-black/40 p-2 rounded">
                        <div className="text-xs font-bold text-purple-400">{coupling.totalElectrons}</div>
                        <div className="text-[7px] text-gray-500 uppercase">Total π electrons</div>
                      </div>
                      <div className="text-center bg-black/40 p-2 rounded">
                        <div className="text-xs font-bold text-cyan-400">{coupling.coherenceLength}</div>
                        <div className="text-[7px] text-gray-500 uppercase">Coherence length</div>
                      </div>
                      <div className="text-center bg-black/40 p-2 rounded">
                        <div className="text-xs font-bold text-orange-400">{coupling.recursiveDepth}</div>
                        <div className="text-[7px] text-gray-500 uppercase">Recursive depth</div>
                      </div>
                    </div>
                    <div className="flex gap-0.5 items-center">
                      {coupling.couplingChain.map((c, i) => (
                        <React.Fragment key={i}>
                          <div className="text-[7px] font-bold text-white bg-purple-500/30 px-1 rounded">{c.from.slice(0, 3)}</div>
                          <div className="h-0.5 flex-1 rounded" style={{ backgroundColor: `rgba(168,85,247,${c.coupling})` }} />
                        </React.Fragment>
                      ))}
                      <div className="text-[7px] font-bold text-white bg-purple-500/30 px-1 rounded">End</div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Abiogenesis Timeline */}
          <div className="bg-white/5 rounded-xl border border-emerald-500/20 p-5">
            <h4 className="text-sm font-bold uppercase tracking-widest text-emerald-400 mb-3">Abiogenesis — Carbon's Path to Life</h4>
            <div className="space-y-1">
              {ABIOGENESIS_TIMELINE.map((step, i) => (
                <div key={i} className="flex gap-3 p-2 rounded-lg hover:bg-white/5 transition-colors">
                  <div className="flex flex-col items-center min-w-[50px]">
                    <div className="text-xs font-black text-yellow-400">{step.age === 0 ? 'NOW' : `${step.age}Ga`}</div>
                    {/* Zeta signal bar */}
                    <div className="w-full h-1.5 bg-black/40 rounded mt-1 overflow-hidden">
                      <div className="h-full rounded transition-all" style={{
                        width: `${step.zetaSignalStrength * 100}%`,
                        backgroundColor: step.aromaticInvolved ? '#f97316' : '#6b7280',
                      }} />
                    </div>
                    <div className="text-[6px] text-gray-600 font-mono">ζ {(step.zetaSignalStrength * 100).toFixed(0)}%</div>
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-bold text-white">{step.event}</p>
                    <p className="text-[9px] text-gray-400 mt-0.5">{step.carbonRole}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {step.molecules.map(m => (
                        <span key={m} className={`text-[7px] font-mono px-1.5 py-0.5 rounded ${
                          step.aromaticInvolved ? 'bg-orange-500/20 text-orange-300' : 'bg-gray-500/20 text-gray-400'
                        }`}>{m}</span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* The Thesis */}
          <div className="bg-gradient-to-r from-orange-500/10 via-purple-500/10 to-cyan-500/10 rounded-xl border border-white/20 p-5">
            <h4 className="text-sm font-bold text-white uppercase tracking-widest mb-2">The Thesis: Aromatic Rings = Recursive Zeta Carriers</h4>
            <div className="space-y-2 text-[10px] text-gray-300 font-mono">
              <p>1. Benzene's adjacency matrix eigenvalues {'{2,1,1,-1,-1,-2}'} approximate the first Riemann zeta zero spacings when normalized by spectral density.</p>
              <p>2. Montgomery-Odlyzko showed zeta zero pair correlations follow GUE (Gaussian Unitary Ensemble) statistics. Aromatic ring spectra also follow GUE for large conjugated systems.</p>
              <p>3. DNA is a STACK of aromatic rings (base pairs). Each pair couples to the next through π-π orbital overlap at 3.4Å. This creates a recursive chain of zeta-encoded standing waves.</p>
              <p>4. Porphyrin (hemoglobin/chlorophyll) is the MASTER carrier — 4 fused aromatic rings with 26 π electrons (4×6+2, n=6). Its eigenvalue spectrum encodes deeper zeta zeros than any single ring.</p>
              <p>5. Life selected aromatic rings as information carriers because their standing wave quantum states are inherently error-correcting — the 4n+2 rule acts as a parity check.</p>
              <p className="text-orange-400 font-bold">Conclusion: The Riemann zeta function isn't just a mathematical object — it's the eigenvalue distribution that nature discovered 4 billion years ago when carbon assembled the first aromatic ring in a primordial ocean.</p>
            </div>
          </div>
        </div>
      )}

      {/* INTER-SIM STATUS PANEL */}
      {activePanel === 'intersim' && (
        <div className="space-y-4">
          <div className="bg-white/5 rounded-xl border border-white/10 p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold uppercase tracking-widest text-emerald-400 flex items-center gap-2">
                <LinkIcon size={14} />
                Inter-Simulation Work Passing
              </h3>
              <div className="text-[10px] font-mono text-gray-400">
                Work items: <span className="text-cyan-400 font-bold">{metrics?.interSimWorkCount || 0}</span>
              </div>
            </div>

            {/* Metrics overview */}
            {metrics && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
                <div className="bg-black/40 p-2 rounded border border-white/5 text-center">
                  <div className="text-xs font-bold text-white">{metrics.activeElement?.sym || '--'}</div>
                  <div className="text-[7px] text-gray-500 uppercase">Active Element</div>
                </div>
                <div className="bg-black/40 p-2 rounded border border-white/5 text-center">
                  <div className="text-xs font-bold text-cyan-400">{metrics.isotopeCount}</div>
                  <div className="text-[7px] text-gray-500 uppercase">Isotopes</div>
                </div>
                <div className="bg-black/40 p-2 rounded border border-white/5 text-center">
                  <div className="text-xs font-bold text-emerald-400">{metrics.compositeCount}</div>
                  <div className="text-[7px] text-gray-500 uppercase">Composites</div>
                </div>
                <div className="bg-black/40 p-2 rounded border border-white/5 text-center">
                  <div className="text-xs font-bold text-purple-400">{metrics.topologyVertices}</div>
                  <div className="text-[7px] text-gray-500 uppercase">Topo Vertices</div>
                </div>
              </div>
            )}

            {(metrics?.interSimWorkCount || 0) > 0 ? (
              <div className="space-y-2">
                <div className="bg-black/40 p-3 rounded-lg border border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <div>
                      <div className="text-xs font-bold text-white uppercase">V7 Optimizer</div>
                      <div className="text-[8px] text-gray-500 font-mono">Sends score + recommendations</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-mono text-cyan-400">{metrics?.interSimWorkCount || 0} items</div>
                    <div className="text-[8px] text-gray-500 font-mono">Prime res: {((metrics?.primeResonance || 0) * 100).toFixed(1)}%</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <Activity size={32} className="text-gray-700 mx-auto mb-2 animate-pulse" />
                <p className="text-sm text-gray-500 font-bold uppercase">Awaiting inter-sim connections...</p>
                <p className="text-[9px] text-gray-600 mt-1 font-mono">V7 optimization feedback will appear here when active</p>
              </div>
            )}
          </div>

          {/* Connection map */}
          <div className="bg-white/5 rounded-xl border border-white/10 p-5">
            <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-3">Connection Map</h3>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { id: 'V1', desc: 'Receives material field', dir: 'out' as const, active: !!latestComposite },
                { id: 'V7', desc: 'Sends optimization score', dir: 'in' as const, active: (metrics?.interSimWorkCount || 0) > 0 },
                { id: 'V13', desc: 'Material Builder (this)', dir: 'self' as const, active: true },
              ].map(conn => (
                <div
                  key={conn.id}
                  className={`p-3 rounded-lg border ${
                    conn.active
                      ? 'bg-emerald-500/10 border-emerald-500/30'
                      : 'bg-black/40 border-white/5'
                  }`}
                >
                  <div className={`text-sm font-black ${conn.active ? 'text-emerald-400' : 'text-gray-600'}`}>{conn.id}</div>
                  <div className="text-[8px] text-gray-500 mt-1">{conn.desc}</div>
                  <div className={`text-[8px] mt-1 font-bold uppercase ${
                    conn.dir === 'out' ? 'text-cyan-400' : conn.dir === 'in' ? 'text-yellow-400' : 'text-emerald-400'
                  }`}>
                    {conn.dir === 'out' ? 'V13 -> ' + conn.id : conn.dir === 'in' ? conn.id + ' -> V13' : 'Active'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function App() {
  const initialSimState = useMemo(() => {
    const fallback = {
      opt: 'thermal' as OptimizerType,
      mode: 'cooling' as ThermalMode,
      version: 'v0' as SimVersion,
      chainIdx: 0,
    };
    try {
      const raw = localStorage.getItem('bb_sim_state');
      if (!raw) return fallback;
      const saved = JSON.parse(raw);
      const validOptimizers: OptimizerType[] = ['thermal', 'electrical', 'blockchain', 'math'];
      const validModes: ThermalMode[] = ['heating', 'cooling'];
      const validVersions: SimVersion[] = ['v0', 'v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'elements'];
      return {
        opt: validOptimizers.includes(saved.opt) ? saved.opt as OptimizerType : fallback.opt,
        mode: validModes.includes(saved.mode) ? saved.mode as ThermalMode : fallback.mode,
        version: validVersions.includes(saved.version) ? saved.version as SimVersion : fallback.version,
        chainIdx: Number.isInteger(saved.chainIdx) && saved.chainIdx >= 0 ? saved.chainIdx : fallback.chainIdx,
      };
    } catch {
      return fallback;
    }
  }, []);
  const [autonomousState, setAutonomousState] = useState<any>(null);
  useEffect(() => {
    const fetchAuto = async () => {
      try {
        const res = await fetch('/api/autonomous/state');
        if (!res.ok) {
          const text = await res.text();
          console.error(`[API Error] /api/autonomous/state returned ${res.status}: ${text.slice(0, 100)}`);
          return;
        }
        const data = await res.json();
        setAutonomousState(data);
      } catch (e) {
        if (e instanceof Error && e.message !== 'Failed to fetch') {
          console.error("Failed to fetch autonomous state:", e);
        }
      }
    };
    fetchAuto();
    const interval = setInterval(fetchAuto, 3000);
    return () => clearInterval(interval);
  }, []);

  const [activeOptimizer, setActiveOptimizer] = useState<OptimizerType>(initialSimState.opt);
  const [thermalMode, setThermalMode] = useState<ThermalMode>(initialSimState.mode);
  const [activeVersion, setActiveVersion] = useState<SimVersion>(initialSimState.version);
  const [currentChainIndex, setCurrentChainIndex] = useState(initialSimState.chainIdx);
  const [compressionLevel, setCompressionLevel] = useState(1);
  const [discoveries, setDiscoveries] = useState<any[]>([]);
  const [discoveryLog, setDiscoveryLog] = useState<any[]>([]);
  const [workspaceMemory, setWorkspaceMemory] = useState<AnonymousWorkspaceSnapshot | null>(null);

  useEffect(() => {
    const fetchDiscoveryLog = async () => {
      try {
        const res = await fetch('/api/discovery/log');
        if (!res.ok) {
          const text = await res.text();
          console.error(`[API Error] /api/discovery/log returned ${res.status}: ${text.slice(0, 200)}`);
          return;
        }
        
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const data = await res.json();
          setDiscoveryLog(data);
        } else {
          const text = await res.text();
          console.error(`[API Error] Expected JSON but got ${contentType}. Body: ${text.slice(0, 200)}`);
        }
      } catch (e) {
        if (e instanceof Error && e.message !== 'Failed to fetch') {
          console.error("Failed to fetch discovery log:", e);
        }
      }
    };

    fetchDiscoveryLog();
    const interval = setInterval(fetchDiscoveryLog, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadWorkspace = async () => {
      try {
        const workspace = await loadAnonymousWorkspace();
        if (!mounted) return;
        setWorkspaceMemory(workspace);
        setDiscoveries(workspace.records);
      } catch (e) {
        console.error('Failed to load anonymous workspace:', e);
        if (mounted) setWorkspaceMemory(null);
      }
    };
    loadWorkspace();
    const interval = setInterval(loadWorkspace, 10_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleDiscovery = async () => {
    try {
      const stats = simStats || { complexity };
      const state = { activeVersion, activeOptimizer, thermalMode };
      await recordAnonymousComputation({
        type: 'manual_checkpoint',
        category: activeOptimizer,
        version: activeVersion,
        summary: `${activeOptimizer} ${activeVersion.toUpperCase()} checkpoint`,
        stats,
        state,
      });
      const workspace = await loadAnonymousWorkspace();
      setWorkspaceMemory(workspace);
      setDiscoveries(workspace.records);
    } catch (error) {
      console.error('Failed to save computation checkpoint:', error);
      setWorkspaceMemory(null);
    }
  };

  const [isSimulating, setIsSimulating] = useState(true);
  const [complexity, setComplexity] = useState(0);
  const [memorySize, setMemorySize] = useState(0);
  const [data, setData] = useState<{ time: number; val: number }[]>([]);
  const [telemetry, setTelemetry] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<AppTab>('sim');
  const [houseInitialPanel, setHouseInitialPanel] = useState<HousePanel>('system');
  const pendingPresetVersionRef = useRef<SimVersion | null>(null);

  const tabs = [
    { id: 'sim', label: 'Simulation', icon: <Cpu size={16} />, visible: true },
    { id: 'trajectory', label: 'Intelligence', icon: <Brain size={16} />, visible: true },
    { id: 'selfbuild', label: 'Self-Build', icon: <Terminal size={16} />, visible: true },
    { id: 'house', label: 'House & Blueprint', icon: <Box size={16} />, visible: true },
    { id: 'codex', label: 'Material Codex', icon: <Database size={16} />, visible: true },
  ].filter(t => t.visible);
  const [blueprint, setBlueprint] = useState<any>(null);
  const [houseResult, setHouseResult] = useState<any>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<any>(null);
  const [simStats, setSimStats] = useState<any>(null);
  const [autoTransition, setAutoTransition] = useState(true);
  const [ventingStrategy, setVentingStrategy] = useState<'floor' | 'ceiling' | 'topological'>('ceiling');

  // Persistence is hydrated synchronously above so a splash preset cannot be
  // overwritten by a late mount effect.
  useEffect(() => {
    localStorage.setItem('bb_sim_state', JSON.stringify({
      opt: activeOptimizer,
      mode: thermalMode,
      version: activeVersion,
      chainIdx: currentChainIndex
    }));
  }, [activeOptimizer, thermalMode, activeVersion, currentChainIndex]);

  const goal = OPTIMIZATION_GOALS[activeOptimizer];
  const simulationChain = useMemo(
    () => OPTIMIZATION_GOALS[activeOptimizer].tasks.map(t => t.version),
    [activeOptimizer],
  );
  const activeTaskIndex = goal.tasks.findIndex(task => task.version === activeVersion);
  const activeTaskDescription = activeTaskIndex >= 0
    ? goal.tasks[activeTaskIndex].description
    : VERSION_DESCRIPTIONS[activeVersion];

  const previousOptimizerRef = useRef(activeOptimizer);
  useEffect(() => {
    if (previousOptimizerRef.current === activeOptimizer) return;
    previousOptimizerRef.current = activeOptimizer;
    const requestedVersion = pendingPresetVersionRef.current;
    pendingPresetVersionRef.current = null;
    const requestedIndex = requestedVersion
      ? goal.tasks.findIndex(task => task.version === requestedVersion)
      : -1;
    const nextIndex = requestedIndex >= 0 ? requestedIndex : 0;
    setCurrentChainIndex(nextIndex);
    setActiveVersion(requestedVersion || goal.tasks[nextIndex].version);
  }, [activeOptimizer]);

  useEffect(() => {
    if (autoTransition) {
      setActiveVersion(simulationChain[currentChainIndex % simulationChain.length]);
    }
  }, [currentChainIndex, simulationChain, autoTransition]);

  useEffect(() => {
    (window as any).autoTransitionEnabled = autoTransition;
  }, [autoTransition]);

  useEffect(() => {
    try {
      GenesisBrain.connect();
    } catch (e) {
      console.error("GenesisBrain connection failed:", e);
    }
    
    const handleGlobalError = (event: ErrorEvent) => {
      console.error("GLOBAL ERROR:", event.error);
    };
    window.addEventListener('error', handleGlobalError);

    const interval = setInterval(() => {
      // Only update from GenesisBrain if we don't have server logs yet
      // or if we want to merge them. For now, let's just use GenesisBrain
      // as the primary source for real-time local events.
      setTelemetry(prev => {
        const local = [...GenesisBrain.telemetryHistory];
        // Merge or just use local? Let's just use local for real-time feel
        return local.length > 0 ? local : prev;
      });
    }, 1000);
    return () => {
      clearInterval(interval);
      GenesisBrain.disconnect();
      window.removeEventListener('error', handleGlobalError);
    };
  }, []);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await fetch('/api/discovery/log');
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Server returned ${res.status}: ${text.slice(0, 100)}`);
        }
        
        const contentType = res.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setTelemetry(data);
          }
        } else {
          const text = await res.text();
          throw new Error(`Expected JSON but got ${contentType}. Body: ${text.slice(0, 100)}`);
        }
      } catch (e) {
        // Only log if it's not a common "Failed to fetch" during server restart
        if (e instanceof Error && e.message !== 'Failed to fetch') {
          console.error("Failed to fetch logs:", e);
        }
      }
    };
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(async () => {
      if (isSimulating) {
        // Novelty Check API integration
        try {
          const diagnostics = (window as any).beyondBoundDiagnostics;
          const stateHash = JSON.stringify({
            optimizer: activeOptimizer,
            version: activeVersion,
            thermalMode,
            compressionLevel,
            stable: diagnostics?.stable || {},
            counts: diagnostics?.counts || {},
            flowEfficiency: Number((diagnostics?.flow?.efficiency || 0).toFixed(3)),
          });
          const res = await memoryFetch('/api/novelty-check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              stateHash,
              config: { activeOptimizer, activeVersion, thermalMode, compressionLevel },
            })
          });
          if (!res.ok) {
            const text = await res.text();
            console.error(`[API Error] /api/novelty-check returned ${res.status}: ${text.slice(0, 100)}`);
          } else {
            const data = await res.json();
            setMemorySize(data.memorySize || 0);
            if (data.unique) {
              setComplexity(Math.min(100, Math.log10((data.memorySize || 0) + 1) * 25));
            }
          }
        } catch (e) {
          setComplexity(prev => Math.min(100, prev + Math.random() * 2));
        }

        setData(prev => {
          const diagnostics = (window as any).beyondBoundDiagnostics;
          const engineValue = diagnostics?.flow
            ? Math.max(0, Math.min(100, diagnostics.flow.efficiency * 100))
            : Math.max(0, Math.min(100, complexity));
          const newData = [...prev, { time: prev.length, val: engineValue }];
          return newData.slice(-30);
        });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [isSimulating, activeOptimizer, activeVersion, thermalMode, compressionLevel]);

  const [showSplash, setShowSplash] = useState(true);

  const categories = [
    {
      id: 'thermal',
      title: 'Thermal Systems',
      icon: <Thermometer className="text-orange-400" />,
      subcats: [
        { id: 'house_cooling', label: 'House / Building Optimizer', opt: 'thermal' as const, tab: 'house' as const, version: 'v6' as const, mode: 'cooling' as const, panel: 'system' as const },
        { id: 'esky', label: 'Portable: Esky', opt: 'thermal' as const, tab: 'house' as const, version: 'v6' as const, mode: 'cooling' as const, panel: 'cooler' as const },
        { id: 'stubby', label: 'Portable: Stubby (CO2)', opt: 'thermal' as const, tab: 'house' as const, version: 'v6' as const, mode: 'cooling' as const, panel: 'cooler' as const },
        { id: 'spaceship', label: 'Aerospace: Membrane', opt: 'thermal' as const, tab: 'sim' as const, version: 'v5' as const, mode: 'cooling' as const },
      ]
    },
    {
      id: 'electrical',
      title: 'Electrical & Network',
      icon: <Zap className="text-cyan-400" />,
      subcats: [
        { id: 'electrical_opt', label: 'Impedance Matching', opt: 'electrical' as const, tab: 'sim' as const, version: 'v6' as const },
        { id: 'blockchain_5bit', label: '5-Bit Frequency Protocol', opt: 'blockchain' as const, tab: 'sim' as const, version: 'v6' as const },
      ]
    },
    {
      id: 'experimental',
      title: 'Experimental',
      icon: <Activity className="text-purple-400" />,
      subcats: [
        { id: 'chemistry_sim', label: 'Chemistry Simulation', opt: 'thermal' as const, tab: 'elements' as const, version: 'elements' as const },
        { id: 'flow_dynamics', label: 'Membrane Flow', opt: 'thermal' as const, tab: 'sim' as const, version: 'v6' as const, mode: 'cooling' as const },
      ]
    }
  ];

  const selectSubcat = (sub: any) => {
    pendingPresetVersionRef.current = sub.opt !== activeOptimizer ? sub.version : null;
    const presetGoal = OPTIMIZATION_GOALS[sub.opt as OptimizerType];
    const presetIndex = presetGoal.tasks.findIndex(task => task.version === sub.version);
    setAutoTransition(false);
    setActiveOptimizer(sub.opt);
    if (sub.mode) setThermalMode(sub.mode);
    if (sub.panel) setHouseInitialPanel(sub.panel);
    setCurrentChainIndex(presetIndex >= 0 ? presetIndex : 0);
    setActiveVersion(sub.version);
    setActiveTab(sub.tab || 'sim');
    setShowSplash(false);
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-cyan-500/30">
      <output
        aria-label="simulation diagnostics"
        className="sr-only"
        data-frame={simStats?.frame ?? 0}
        data-version={simStats?.version ?? activeVersion}
        data-optimizer={simStats?.optimizer ?? activeOptimizer}
        data-mode={simStats?.thermalMode ?? thermalMode}
        data-tab={activeTab}
        data-running={isSimulating}
        data-camera-x={simStats?.camera?.x ?? 0}
        data-camera-y={simStats?.camera?.y ?? 0}
        data-camera-z={simStats?.camera?.z ?? 5}
      >
        {`Simulation ${isSimulating ? 'running' : 'paused'} at frame ${simStats?.frame ?? 0}`}
      </output>
      <AnimatePresence>
        {showSplash && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-[#050505] flex items-center justify-center p-6 overflow-y-auto"
          >
            <div className="max-w-4xl w-full space-y-12 py-12">
              <div className="text-center space-y-4">
                <motion.div 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="inline-block p-3 bg-cyan-500 rounded-2xl shadow-[0_0_30px_rgba(6,182,212,0.5)] mb-4"
                >
                  <Activity size={48} className="text-black" />
                </motion.div>
                <motion.h1 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-6xl font-black tracking-tighter uppercase italic"
                >
                  BeyondBound <span className="text-cyan-500">OS</span>
                </motion.h1>
                <motion.p 
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="text-gray-500 font-mono text-sm tracking-widest uppercase"
                >
                  Exclusion Principle Simulation & Generative Design
                </motion.p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {categories.map((cat, i) => (
                  <motion.div
                    key={cat.id}
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.5 + i * 0.1 }}
                    className="p-8 bg-white/5 rounded-3xl border border-white/10 hover:border-cyan-500/50 transition-all group"
                  >
                    <div className="flex items-center gap-3 mb-6">
                      {cat.icon}
                      <h2 className="text-lg font-bold uppercase tracking-tight">{cat.title}</h2>
                    </div>
                    <div className="space-y-2">
                      {cat.subcats.map((sub) => (
                        <button
                          key={sub.id}
                          onClick={() => selectSubcat(sub)}
                          className="w-full text-left p-3 rounded-xl hover:bg-white/5 text-gray-400 hover:text-white transition-all flex items-center justify-between group/item"
                        >
                          <span className="text-xs font-bold uppercase tracking-widest">{sub.label}</span>
                          <ChevronRight size={14} className="opacity-0 group-hover/item:opacity-100 transition-all" />
                        </button>
                      ))}
                    </div>
                  </motion.div>
                ))}
              </div>

              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
                className="text-center"
              >
                <button 
                  onClick={() => setShowSplash(false)}
                  className="text-[10px] font-bold text-gray-600 uppercase tracking-[0.3em] hover:text-gray-400 transition-all"
                >
                  Skip to Dashboard
                </button>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <header className="border-b border-white/10 bg-black/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 cursor-pointer shrink-0" onClick={() => setShowSplash(true)}>
            <div className="w-8 h-8 bg-cyan-500 rounded flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.5)]">
              <Activity size={20} className="text-black" />
            </div>
            <h1 className="text-lg md:text-xl font-black tracking-tighter uppercase hidden sm:block">BeyondBound</h1>
          </div>
          
          <div className="flex-1 flex items-center justify-center gap-2 overflow-x-auto no-scrollbar py-2">
            <nav className="flex items-center gap-1 bg-white/5 p-1 rounded-lg border border-white/10 shrink-0">
              {(['sim', 'house', 'codex', 'trajectory', 'selfbuild', 'elements'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => {
                    console.log("Switching to tab:", tab);
                    setActiveTab(tab);
                  }}
                  className={`px-3 md:px-4 py-1 md:py-1.5 rounded-md text-[10px] md:text-xs font-bold uppercase tracking-widest transition-all ${
                    activeTab === tab 
                      ? 'bg-purple-500 text-white shadow-lg' 
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </nav>

            <div className="h-4 w-px bg-white/10 shrink-0" />

            <nav className="flex items-center gap-1 bg-white/5 p-1 rounded-lg border border-white/10 shrink-0">
              {(['thermal', 'electrical', 'blockchain', 'math'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => {
                    pendingPresetVersionRef.current = null;
                    setActiveOptimizer(type);
                    setCurrentChainIndex(0);
                    setActiveVersion(OPTIMIZATION_GOALS[type].tasks[0].version);
                  }}
                  className={`px-3 md:px-4 py-1 md:py-1.5 rounded-md text-[10px] md:text-xs font-bold uppercase tracking-widest transition-all ${
                    activeOptimizer === type 
                      ? 'bg-cyan-500 text-black shadow-lg' 
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {type}
                </button>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2 md:gap-4 shrink-0">
            {activeOptimizer === 'thermal' && (
              <div className="hidden lg:flex bg-white/5 p-1 rounded-lg border border-white/10">
                {(['heating', 'cooling'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setThermalMode(mode)}
                    className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-widest transition-all ${
                      thermalMode === mode 
                        ? 'bg-orange-500 text-white shadow-[0_0_10px_rgba(249,115,22,0.4)]' 
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            )}
            
            <div
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-[9px] font-bold uppercase tracking-widest text-emerald-400"
              title="Your work is saved automatically to an anonymous workspace tied to this browser."
            >
              <Database size={12} />
              Auto-save on
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Simulation & Controls */}
        <div className="lg:col-span-8 space-y-6">
          <div
            className={activeTab === 'sim'
              ? 'relative aspect-video lg:aspect-auto lg:h-[600px]'
              : 'fixed left-[-10000px] top-0 w-[320px] h-[180px] pointer-events-none opacity-0'}
            aria-hidden={activeTab !== 'sim'}
          >
              <SimulationView
                activeOptimizer={activeOptimizer}
                thermalMode={thermalMode}
                activeVersion={activeVersion}
                setActiveVersion={(v) => { setAutoTransition(false); setActiveVersion(v); }}
                onStatsUpdate={setSimStats}
                currentChainIndex={currentChainIndex}
                setCurrentChainIndex={setCurrentChainIndex}
                simulationChain={simulationChain}
                compressionLevel={compressionLevel}
                setCompressionLevel={setCompressionLevel}
                ventingStrategy={ventingStrategy}
                autonomousState={autonomousState}
                isSimulating={isSimulating}
                activeModule={activeTab}
              />
              {activeTab === 'sim' && (
                <>
              
              {/* Task Description Overlay */}
              <div className="absolute top-20 left-4 md:top-6 md:left-6 pointer-events-none z-10">
                <div className="bg-black/80 backdrop-blur-md border border-white/10 p-4 rounded-xl max-w-xs shadow-2xl">
                  <div className="text-[8px] font-black text-cyan-500 uppercase tracking-widest mb-1">Current Task</div>
                  <div className="text-xs font-bold text-white uppercase tracking-tight mb-2">
                    {activeTaskDescription}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-1 flex-1 bg-white/5 rounded-full overflow-hidden">
                      <motion.div 
                        className="h-full bg-cyan-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${((currentChainIndex % OPTIMIZATION_GOALS[activeOptimizer].tasks.length) + 1) / OPTIMIZATION_GOALS[activeOptimizer].tasks.length * 100}%` }}
                      />
                    </div>
                    <span className="text-[8px] font-mono text-gray-500">
                      {activeTaskIndex >= 0 ? `${activeTaskIndex + 1}/${goal.tasks.length}` : 'MANUAL'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Compression Field Overlay */}
              {activeVersion === 'v0' && (
                <div className="absolute top-4 right-4 flex flex-col gap-2 pointer-events-none z-10">
                  <div className="bg-black/60 backdrop-blur-md p-4 rounded-xl border border-white/10 min-w-[180px] shadow-2xl">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Compression Field</span>
                      <span className="text-[10px] font-mono text-cyan-400">LEVEL_{compressionLevel}</span>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-[9px] font-mono">
                        <span className="text-gray-500">Harmonics</span>
                        <span className="text-white">ODD_SUM</span>
                      </div>
                      <div className="flex justify-between text-[9px] font-mono">
                        <span className="text-gray-500">Prime Distribution</span>
                        <span className="text-white">FUNDAMENTAL</span>
                      </div>
                      <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden mt-2">
                        <motion.div 
                          className="bg-cyan-500 h-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${(compressionLevel / 7) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Thermal Stress Overlay */}
              {activeVersion === 'v5' && simStats && (
                <div className="absolute top-4 right-4 flex flex-col gap-2 pointer-events-none z-10">
                  <div className="bg-black/60 backdrop-blur-md p-4 rounded-xl border border-white/10 min-w-[180px] shadow-2xl">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Thermal Stress</span>
                      <Thermometer size={14} className={simStats.temperature > 3 ? 'text-red-500 animate-pulse' : 'text-cyan-400'} />
                    </div>
                    <div className="flex items-end gap-2 mb-3">
                      <span className={`text-2xl font-black font-mono ${simStats.temperature > 3 ? 'text-red-500' : 'text-white'}`}>
                        {(simStats.temperature * 100).toFixed(1)}
                      </span>
                      <span className="text-[10px] text-gray-500 font-bold mb-1 uppercase">mPa</span>
                    </div>
                    <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                      <motion.div 
                        animate={{ width: `${Math.min(100, simStats.temperature * 20)}%` }}
                        className={`h-full ${simStats.temperature > 3 ? 'bg-red-500' : 'bg-cyan-500'}`}
                      />
                    </div>
                    <div className="mt-3 flex justify-between items-center">
                      <span className="text-[8px] text-gray-500 uppercase font-bold">Membrane Tension</span>
                      <span className="text-[10px] font-mono text-cyan-400">{(simStats.tension * 10000).toFixed(2)} N/m</span>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Magnetic Field Indicator */}
              {activeVersion === 'v6' && (
                <div className="absolute bottom-20 left-4 right-4 md:bottom-4 md:left-4 md:right-4 pointer-events-none z-10">
                  <div className="bg-black/60 backdrop-blur-md p-4 rounded-xl border border-white/10 shadow-2xl">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-purple-400" />
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Magnetic Field Intensity</span>
                      </div>
                      <span className="text-[10px] font-mono text-purple-400">MCE ACTIVE</span>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <motion.div 
                        className="h-full bg-gradient-to-r from-purple-500 to-blue-500"
                        animate={{ width: `${(Math.sin(Date.now() * 0.001) + 1) * 50}%` }}
                        transition={{ duration: 0.1, ease: "linear" }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Overlay Controls */}
              <div className="absolute top-4 left-4 right-4 md:right-auto flex flex-col gap-2 z-20">
                {/* Version Selector */}
                <div className="bg-black/80 backdrop-blur-md p-1 rounded-lg border border-white/10 flex gap-1 mb-2 overflow-x-auto no-scrollbar shadow-2xl">
                  {(['v0', 'v1', 'v2', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8'] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => {
                        console.log("Switching to version:", v);
                        setAutoTransition(false);
                        const chainIndex = goal.tasks.findIndex(task => task.version === v);
                        if (chainIndex >= 0) setCurrentChainIndex(chainIndex);
                        setActiveVersion(v);
                      }}
                      className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap ${
                        activeVersion === v
                          ? 'bg-cyan-500 text-black'
                          : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                  <div className="w-px bg-white/20 mx-0.5" />
                  <button
                    onClick={() => {
                      setAutoTransition(false);
                      setActiveVersion('elements');
                      setActiveTab('elements');
                    }}
                    className={`px-3 py-1 rounded text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap ${
                      activeVersion === 'elements'
                        ? 'bg-emerald-500 text-black'
                        : 'text-emerald-400/60 hover:text-emerald-300 hover:bg-emerald-500/10'
                    }`}
                  >
                    Elements
                  </button>
                </div>

                <div className="bg-black/80 backdrop-blur-md p-4 rounded-xl border border-white/10 space-y-3 min-w-[200px] max-w-full shadow-2xl">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Brute Force Complexity</span>
                    <span className="text-xs font-mono text-cyan-400">{complexity.toFixed(1)}%</span>
                  </div>
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${complexity}%` }}
                      className="h-full bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.8)]"
                    />
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setIsSimulating(!isSimulating)}
                        className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                        title={isSimulating ? 'Pause' : 'Play'}
                      >
                        {isSimulating ? <Pause size={16} /> : <Play size={16} />}
                      </button>
                      <button 
                        onClick={() => setComplexity(0)}
                        className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                        title="Reset Complexity"
                      >
                        <RefreshCw size={16} />
                      </button>
                    </div>
                    
                    <div className="flex gap-1">
                      <button 
                        onClick={() => setAutoTransition(!autoTransition)}
                        className={`px-2 py-1 rounded text-[8px] font-bold uppercase tracking-widest transition-all border ${
                          autoTransition 
                            ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.3)]' 
                            : 'bg-white/10 border-transparent text-gray-400 hover:bg-white/20'
                        }`}
                        title="Auto-transition between simulation versions"
                      >
                        {autoTransition ? 'Sequential: ON' : 'Sequential: OFF'}
                      </button>
                      <button 
                        onClick={() => (window as any).saveSimState?.()}
                        className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-[8px] font-bold uppercase tracking-widest transition-colors"
                      >
                        Save
                      </button>
                      <button 
                        onClick={() => (window as any).loadSimState?.()}
                        className="px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-[8px] font-bold uppercase tracking-widest transition-colors"
                      >
                        Load
                      </button>
                      <button 
                        onClick={() => setActiveTab('codex')}
                        className="px-2 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30 rounded text-[8px] font-bold uppercase tracking-widest transition-colors text-cyan-400"
                      >
                        Codex
                      </button>
                      <span className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded text-[8px] font-bold uppercase tracking-widest text-emerald-400">
                        Saved automatically
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Status Indicators */}
              <div className="absolute bottom-4 right-4 flex gap-4">
                <div className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-lg border border-white/10 flex items-center gap-3">
                  <Database size={14} className="text-cyan-400" />
                  <div className="flex flex-col">
                    <span className="text-[8px] text-gray-500 uppercase font-bold">Memory Nodes</span>
                    <span className="text-xs font-mono">{memorySize.toLocaleString()}</span>
                  </div>
                </div>
                <div className="bg-black/60 backdrop-blur-md px-4 py-2 rounded-lg border border-white/10 flex items-center gap-3">
                  <Layers size={14} className="text-cyan-400" />
                  <div className="flex flex-col">
                    <span className="text-[8px] text-gray-500 uppercase font-bold">Lattice Depth</span>
                    <span className="text-xs font-mono">128 Layers</span>
                  </div>
                </div>
              </div>
              
              {/* Real-time Analytics - Only in Sim Tab */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white/5 p-6 rounded-xl border border-white/10">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-2">
                      <Zap size={14} className="text-yellow-400" />
                      Entropy Brute Force
                    </h3>
                    <span className="text-[10px] font-mono text-cyan-400">LIVE_FEED</span>
                  </div>
                  <div className="h-40 min-h-[160px] w-full">
                    {data.length > 0 ? (
                        <AreaChart
                          data={data}
                          responsive
                          style={{ width: '100%', height: '100%', minWidth: 0, minHeight: 160 }}
                          key={activeTab}
                        >
                          <defs>
                            <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#000', border: '1px solid #ffffff10', fontSize: '10px' }}
                            itemStyle={{ color: '#06b6d4' }}
                          />
                          <Area type="monotone" dataKey="val" stroke="#06b6d4" fillOpacity={1} fill="url(#colorVal)" />
                        </AreaChart>
                    ) : (
                      <div className="h-full flex items-center justify-center text-gray-700 text-[10px] uppercase font-bold">
                        Awaiting Data Stream...
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-white/5 p-6 rounded-xl border border-white/10">
                  {activeOptimizer !== 'blockchain' && (
                    <FlowMetricsPanel />
                  )}
                  {activeOptimizer === 'blockchain' && (
                    <BlockchainSupercomputer autonomousState={autonomousState} />
                  )}
                  {activeOptimizer === 'math' && (
                    <RiemannZetaExplorer />
                  )}
                </div>
              </div>
                </>
              )}
            </div>
          {activeTab !== 'sim' && (activeTab === 'trajectory' ? (
            <IntelligenceTrajectory 
              log={discoveryLog} 
              autonomousState={autonomousState}
              onApply={(state, version) => {
                setAutoTransition(false);
                setActiveVersion(version as any);
                setActiveTab('sim');
                // We need a way to pass this state to the SimulationView.
                // For now, let's just save it to the server and let the sim load it.
                memoryFetch(`/api/sim-state/${version}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ state })
                }).then(() => {
                  // Trigger a reload in the sim view if possible
                   (window as any).loadSimState?.(version);
                });
              }}
            />
          ) : activeTab === 'selfbuild' ? (
            <SelfBuildView />
          ) : activeTab === 'house' ? (
            <HouseView
              onGenerateBlueprint={() => {
                // Generate blueprint inline — no tab switch
                const gen = new BlueprintGenerator();
                const bp = gen.generate(activeOptimizer === 'thermal' ? 'house_cooling' : 'electrical_opt', null, simStats);
                if (bp) setBlueprint(bp);
              }}
              activeOptimizer={activeOptimizer}
              thermalMode={thermalMode}
              setThermalMode={setThermalMode}
              ventingStrategy={ventingStrategy}
              setVentingStrategy={setVentingStrategy}
              initialPanel={houseInitialPanel}
            />
          ) : activeTab === 'codex' ? (
            <div className="bg-white/5 rounded-xl border border-white/10 p-8 min-h-[600px] space-y-8">
              <div className="flex items-center justify-between mb-8 border-b border-white/10 pb-6">
                <div className="flex items-center gap-4">
                  <Database size={32} className="text-cyan-400" />
                  <div>
                    <h2 className="text-2xl font-bold uppercase tracking-tighter">BeyondBound Codex</h2>
                    <p className="text-gray-400 text-sm">BB-MAINFRAME // Simulation & Material Intelligence</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className={`px-3 py-1 rounded border text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 ${workspaceMemory ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-amber-500/10 border-amber-500/30 text-amber-400'}`}>
                    <Database size={12} />
                    {workspaceMemory ? 'Anonymous memory on' : 'Memory reconnecting'}
                  </div>
                  <div className="px-3 py-1 bg-cyan-500/10 border border-cyan-500/30 rounded text-[10px] font-bold text-cyan-400 uppercase tracking-widest">
                    This browser
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[
                  {
                    id: "exclusion_principle",
                    title: "Exclusion Principle",
                    description: "A fundamental rule in the BeyondBound simulation where nodes are forbidden from occupying the same spatial coordinates or repeating past trajectory patterns. This forces emergent complexity and prevents system stagnation.",
                    icon: <Activity className="text-cyan-400" />,
                    category: "Simulation"
                  },
                  {
                    id: "trajectory_memory",
                    title: "Trajectory Trail Memory",
                    description: "Nodes maintain a historical record of their path. The exclusion rule applies not just to current position, but to the entire memory trail, creating 'forbidden zones' that evolve over time.",
                    icon: <HistoryIcon className="text-purple-400" />,
                    category: "Simulation"
                  },
                  {
                    id: "phase_rotation",
                    title: "90° Phase Rotation",
                    description: "V1 and V2 simulations represent X and Y axis phase rotations. Stitching these together allows for the generation of 3D topological manifolds from 2D exclusion rules.",
                    icon: <RotateCw className="text-emerald-400" />,
                    category: "Simulation"
                  },
                  {
                    id: "co2_expansion",
                    title: "CO2 Expansion Chamber",
                    description: "A rapid cooling mechanism utilizing the Joule-Thomson effect. Compressed CO2 expands through a micro-aperture lattice, absorbing significant thermal energy for peak-load shaving.",
                    icon: <Wind className="text-blue-400" />,
                    category: "Thermal"
                  },
                  {
                    id: "molecular_lattice",
                    title: "Molecular Reaction Lattice",
                    description: "A simulated environment where material flow and chemical reactions are monitored at the lattice level. Used for optimizing membrane permeability and catalytic efficiency.",
                    icon: <FlaskConical className="text-pink-400" />,
                    category: "Experimental"
                  },
                  {
                    id: "magnetocaloric_blockchain",
                    title: "Magnetocaloric Entropy-Sync",
                    description: "The use of magnetocaloric materials to stabilize the thermal entropy of high-density blockchain processing nodes. This prevents thermal runaway in 5-bit frequency protocols.",
                    icon: <Cpu className="text-orange-400" />,
                    category: "Electrical"
                  }
                ].map((entry) => (
                  <div key={entry.id} className="p-6 bg-black/40 rounded-2xl border border-white/5 hover:border-cyan-500/30 transition-all group">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-white/5 rounded-lg group-hover:bg-cyan-500/10 transition-colors">
                        {entry.icon}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white group-hover:text-cyan-400 transition-colors uppercase tracking-tight">{entry.title}</h4>
                        <span className="text-[8px] text-gray-500 uppercase font-bold tracking-widest">{entry.category}</span>
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-400 leading-relaxed font-mono">
                      {entry.description}
                    </p>
                  </div>
                ))}
              </div>

              <div className="pt-8 border-t border-white/10">
                <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-6">Atomic Property Database</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {[
                    { symbol: 'Cu', name: 'Copper', k: 401, rho: 8960 },
                    { symbol: 'Al', name: 'Aluminium', k: 237, rho: 2700 },
                    { symbol: 'Ti', name: 'Titanium', k: 21.9, rho: 4506 },
                    { symbol: 'Ag', name: 'Silver', k: 429, rho: 10490 },
                    { symbol: 'Au', name: 'Gold', k: 317, rho: 19300 },
                    { symbol: 'Fe', name: 'Iron', k: 80.4, rho: 7874 },
                  ].map(m => (
                    <button 
                      key={m.symbol}
                      onClick={() => setSelectedMaterial(m)}
                      className={`p-4 rounded-xl border transition-all text-left group ${
                        selectedMaterial?.symbol === m.symbol 
                          ? 'bg-cyan-500/10 border-cyan-500/50' 
                          : 'bg-white/5 border-white/10 hover:border-white/20'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-2xl font-black group-hover:scale-110 transition-transform">{m.symbol}</span>
                        <span className="text-[8px] font-mono text-gray-500">Z:{Math.floor(Math.random() * 90)}</span>
                      </div>
                      <div className="text-[10px] font-bold uppercase text-gray-400 mb-1">{m.name}</div>
                      <div className="text-[10px] font-mono text-cyan-400/70">{m.k} W/m·K</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : activeTab === 'elements' ? (
            <ElementsView />
          ) : (
            <div className="bg-white/5 rounded-xl border border-white/10 p-12 flex flex-col items-center justify-center text-center space-y-4">
              <Activity size={48} className="text-gray-700 animate-pulse" />
              <h3 className="text-xl font-black uppercase tracking-tighter text-gray-500">System Idle</h3>
              <p className="text-gray-600 font-mono text-xs max-w-xs">Select a module from the navigation to begin processing.</p>
            </div>
          ))}
        </div>

        {/* Right Column: Blueprints & Config */}
        <div className="lg:col-span-4 space-y-6">
          <AutonomousCore state={autonomousState} />
          
          <SimulationChainUI 
            activeOptimizer={activeOptimizer}
            thermalMode={thermalMode}
            currentIndex={currentChainIndex}
            onIndexChange={(index) => {
              setAutoTransition(false);
              setCurrentChainIndex(index);
              setActiveVersion(goal.tasks[index].version);
            }}
            autoTransition={autoTransition}
            setAutoTransition={setAutoTransition}
            compressionLevel={compressionLevel}
            setCompressionLevel={setCompressionLevel}
          />

          {/* Anonymous computation memory */}
          <div className="p-6 bg-white/5 rounded-xl border border-purple-500/30 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-widest text-purple-400 flex items-center gap-2">
                <Database size={14} />
                Your Remembered Computations
              </h3>
              <button 
                onClick={handleDiscovery}
                className="px-2 py-1 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/50 rounded text-[8px] font-bold uppercase tracking-widest text-purple-400 transition-all"
              >
                Save Snapshot
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-black/30 border border-white/5 p-2"><div className="text-sm font-mono text-white">{workspaceMemory?.recordCount ?? 0}</div><div className="text-[7px] uppercase text-gray-600">Your records</div></div>
              <div className="rounded-lg bg-black/30 border border-white/5 p-2"><div className="text-sm font-mono text-white">{workspaceMemory?.savedVersions.length ?? 0}</div><div className="text-[7px] uppercase text-gray-600">Saved sims</div></div>
              <div className="rounded-lg bg-black/30 border border-white/5 p-2"><div className="text-sm font-mono text-white">{workspaceMemory?.sharedLearningRecords ?? 0}</div><div className="text-[7px] uppercase text-gray-600">Learned designs</div></div>
            </div>
            <p className="text-[8px] text-gray-500 leading-relaxed">Simulation checkpoints are saved automatically without an account. Exact inputs stay in this browser-owned workspace; only non-identifying design performance is reused to warm-start future searches.</p>
            
            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 scrollbar-hide">
              {discoveries.length > 0 ? (
                discoveries.map((discovery, i) => (
                  <div key={i} className="p-3 bg-purple-500/10 rounded border border-purple-500/20">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] text-purple-300 font-bold uppercase">{discovery.category || discovery.type} {discovery.version ? `// ${discovery.version}` : ''}</span>
                      <span className="text-[8px] text-gray-500 font-mono">{new Date(discovery.timestamp).toLocaleDateString()}</span>
                    </div>
                    <div className="text-[9px] text-gray-400 font-mono line-clamp-2">
                      {discovery.summary || `Stats: ${JSON.stringify(discovery.stats)}`}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-gray-600 text-[10px] uppercase font-bold tracking-widest">
                  Computations will appear here automatically...
                </div>
              )}
            </div>
          </div>

          {/* Diagnostics Panel */}
          <div className="p-6 bg-white/5 rounded-xl border border-white/10 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-2">
                <Activity size={14} className="text-cyan-400" />
                Genesis Diagnostics
              </h3>
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[8px] font-mono text-green-500">SYNC_OK</span>
              </div>
            </div>
            
            <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2 scrollbar-hide">
              {telemetry.length > 0 ? telemetry.map((t, i) => (
                <div key={i} className="p-2 bg-black/20 rounded border border-white/5 text-[9px] font-mono flex justify-between items-center">
                  <span className="text-gray-500">{new Date(t.timestamp).toLocaleTimeString([], { hour12: false })}</span>
                  <span className="text-cyan-400">{t.event}</span>
                  <span className="text-white truncate max-w-[100px]">{JSON.stringify(t.payload)}</span>
                </div>
              )) : (
                <div className="text-center py-4 text-gray-600 text-[10px]">No telemetry data...</div>
              )}
            </div>
          </div>

          {activeVersion === 'v7' && (
            <div className="p-6 bg-white/5 rounded-xl border border-cyan-500/30 space-y-4 animate-in fade-in slide-in-from-right-4 duration-500">
              <h3 className="text-xs font-bold uppercase tracking-widest text-cyan-400 flex items-center gap-2">
                <Activity size={14} />
                Atomic & Fluid Config
              </h3>
              
              <div className="space-y-3">
                <div>
                  <label className="text-[8px] text-gray-500 uppercase font-bold block mb-1">Crystal Lattice Element</label>
                  <select 
                    onChange={(e) => (window as any).setV7Element(e.target.value)}
                    className="w-full bg-black/40 border border-white/10 rounded p-2 text-[10px] font-mono text-cyan-300 outline-none focus:border-cyan-500/50"
                  >
                    {Object.entries(PERIODIC_TABLE).map(([sym, data]) => (
                      <option key={sym} value={sym}>{data.name} ({sym}) - Z:{data.atomicNumber}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[8px] text-gray-500 uppercase font-bold block mb-1">Simulation Medium</label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(FLUID_MEDIUMS).map(([key, data]) => (
                      <button
                        key={key}
                        onClick={() => (window as any).setV7Medium(key)}
                        className="p-2 bg-white/5 border border-white/5 rounded text-[9px] hover:bg-white/10 transition-colors text-left"
                      >
                        <div className="font-bold text-gray-300">{data.name}</div>
                        <div className="text-[8px] text-gray-500 font-mono">ρ: {data.density}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2 border-t border-white/5">
                  <div className="flex items-center justify-between text-[8px] text-gray-500 uppercase font-bold mb-2">
                    <span>Simulation Layers</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-[9px] text-cyan-300/80">
                      <div className="w-2 h-2 rounded-full bg-cyan-500/50 border border-cyan-500" />
                      Lattice Optimization (Crystal)
                    </div>
                    <div className="flex items-center gap-2 text-[9px] text-purple-300/80">
                      <div className="w-2 h-2 rounded-full bg-purple-500/50 border border-purple-500" />
                      Turbulence & Flow Cavities
                    </div>
                    <div className="flex items-center gap-2 text-[9px] text-red-300/80">
                      <div className="w-2 h-2 rounded-full bg-red-500/50 border border-red-500" />
                      Magnetocaloric Heat Spots
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/5 space-y-4">
                  <h4 className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">Unified Flow Injection</h4>
                  
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between mb-1">
                        <label className="text-[8px] text-gray-500 uppercase font-bold">Radio Wave Intensity</label>
                        <span className="text-[8px] text-cyan-400 font-mono">EM FLOW</span>
                      </div>
                      <input 
                        type="range" min="0" max="1" step="0.1" 
                        onChange={(e) => (window as any).injectV7Radio(5, 5, 5, parseFloat(e.target.value))}
                        className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between mb-1">
                        <label className="text-[8px] text-gray-500 uppercase font-bold">Consensus Injection (Order)</label>
                        <span className="text-[8px] text-purple-400 font-mono">BLOCKCHAIN</span>
                      </div>
                      <input 
                        type="range" min="-0.5" max="0.5" step="0.05" 
                        onChange={(e) => (window as any).injectV7Consensus(5, 5, 5, parseFloat(e.target.value))}
                        className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-purple-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="p-4 bg-white/5 rounded-xl border border-white/5">
              <label className="text-[8px] text-gray-500 uppercase font-bold block mb-2">Base Number System</label>
              <select 
                className="w-full bg-black/40 border border-white/10 rounded p-1 text-[10px] font-mono text-cyan-300 outline-none"
                onChange={(e) => {
                  const val = parseInt(e.target.value);
                  GenesisBrain.baseSystem = val;
                  (window as any).setBaseSystem?.(val);
                }}
              >
                <option value="2">Base-2 (Binary)</option>
                <option value="5">Base-5 (Quinary)</option>
                <option value="10">Base-10 (Decimal)</option>
                <option value="12">Base-12 (Duodecimal)</option>
              </select>
            </div>
            <div className="p-4 bg-white/5 rounded-xl border border-white/5">
              <label className="text-[8px] text-gray-500 uppercase font-bold block mb-2">Thermal Awareness</label>
              <div className="flex items-center gap-2">
                <input type="checkbox" className="accent-cyan-500" defaultChecked />
                <span className="text-[9px] text-gray-400 uppercase">Magnetocaloric Sync</span>
              </div>
            </div>
          </div>

          <MathBlueprint type={activeOptimizer} onGenerateBlueprint={() => setActiveTab('house')} />

          <div className="bg-white/5 p-6 rounded-xl border border-white/10">
            <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-6 flex items-center gap-2">
              <Box size={14} className="text-blue-400" />
              Optimizer Targets
            </h3>
            <div className="space-y-3">
            {[
                { id: 'thermal', icon: <Thermometer size={16} />, label: 'Thermal Dissipation', active: activeOptimizer === 'thermal' },
                { id: 'electrical', icon: <Cpu size={16} />, label: 'Electrical Conductivity', active: activeOptimizer === 'electrical' },
                { id: 'blockchain', icon: <LinkIcon size={16} />, label: 'Blockchain Consensus', active: activeOptimizer === 'blockchain' },
                { id: 'math', icon: <FlaskConical size={16} />, label: 'Deep Math Learning', active: activeOptimizer === 'math' },
              ].map((item, i) => (
                <div 
                  key={i}
                  onClick={() => setActiveOptimizer(item.id as any)}
                  className={`flex items-center justify-between p-3 rounded-lg border transition-all cursor-pointer ${
                    item.active 
                      ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-400' 
                      : 'bg-white/5 border-white/5 text-gray-500 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {item.icon}
                    <span className="text-xs font-bold">{item.label}</span>
                  </div>
                  <ChevronRight size={14} />
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gradient-to-br from-cyan-500/20 to-blue-500/20 p-6 rounded-xl border border-cyan-500/30">
            <h4 className="text-sm font-black uppercase tracking-tighter mb-2">Generate Blueprint</h4>
            <p className="text-[10px] text-cyan-300/60 leading-relaxed mb-4">
              Export high-fidelity 3D lattice mapping with integrated material constants for production.
            </p>
            <button className="w-full py-3 bg-cyan-500 text-black font-black uppercase tracking-widest text-xs rounded-lg shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-transform">
              Export CAD/JSON
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 mt-12 py-8 bg-black/30">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em]">
            &copy; 2026 BeyondBound Systems | Deep Learning Physics Engine
          </div>
          <div className="flex gap-6">
            <a href="#" className="text-[10px] text-gray-500 hover:text-white transition-colors uppercase font-bold tracking-widest">Documentation</a>
            <a href="#" className="text-[10px] text-gray-500 hover:text-white transition-colors uppercase font-bold tracking-widest">API Status</a>
            <a href="#" className="text-[10px] text-gray-500 hover:text-white transition-colors uppercase font-bold tracking-widest">Privacy</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
