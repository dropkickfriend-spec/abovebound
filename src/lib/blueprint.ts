/**
 * blueprint.ts — Spec Sheet, Cost, Weight & Blueprint Generator
 */

import { MATERIAL_CODEX } from "./codex";

export const MFG_COSTS = {
  cnc_machining:    { perHour: 75,  setupCost: 150, name: "CNC Machining" },
  injection_mold:   { perHour: 40,  setupCost: 5000, name: "Injection Molding" },
  sheet_metal:      { perHour: 50,  setupCost: 100, name: "Sheet Metal Fab" },
  welding:          { perHour: 60,  setupCost: 50,  name: "Welding" },
  "3d_print_metal": { perHour: 120, setupCost: 200, name: "Metal 3D Print (DMLS)" },
  "3d_print_poly":  { perHour: 30,  setupCost: 20,  name: "Polymer 3D Print (FDM)" },
  casting:          { perHour: 45,  setupCost: 2000, name: "Investment Casting" },
  assembly:         { perHour: 35,  setupCost: 0,   name: "Manual Assembly" },
};

export const PRODUCT_TEMPLATES: Record<string, any> = {
  stubby: {
    name: "Stubby Cooler / Koozie",
    category: "beverage",
    typicalDims: { outerDia: 80, height: 120, wallThick: 8 },
    unit: "mm",
    components: ["outer_shell", "insulation", "inner_liner", "cooling_channels", "magnetocaloric_ring", "battery_pack"],
    mfgProcess: "injection_mold",
    batchSize: 1000,
  },
  esky: {
    name: "Esky / Cooler Box",
    category: "portable_cooling",
    typicalDims: { length: 500, width: 350, height: 400, wallThick: 40 },
    unit: "mm",
    components: ["outer_shell", "insulation_core", "inner_liner", "lid", "cooling_channels", "drain", "handles", "magnetocaloric_array", "battery_bank", "recirculation_pump"],
    mfgProcess: "injection_mold",
    batchSize: 500,
  },
  house_cooling: {
    name: "House Cooling System",
    category: "hvac",
    typicalDims: { unitWidth: 600, unitHeight: 800, unitDepth: 300 },
    unit: "mm",
    components: ["heat_exchanger", "compressor_unit", "fan_assembly", "ductwork", "control_board", "refrigerant_loop", "insulation"],
    mfgProcess: "sheet_metal",
    batchSize: 100,
  },
  spaceship: {
    name: "Spaceship Thermal Membrane",
    category: "aerospace",
    typicalDims: { panelWidth: 2000, panelHeight: 3000, thickness: 50 },
    unit: "mm",
    components: ["radiator_panel", "heat_pipes", "cold_plates", "mlp_insulation", "fluid_loop", "control_system", "mounting_structure", "magnetocaloric_core"],
    mfgProcess: "3d_print_metal",
    batchSize: 1,
  },
  blockchain_5bit: {
    name: "5-Bit Frequency Protocol",
    category: "network",
    typicalDims: { w: 100, h: 100, d: 10 },
    unit: "mm",
    components: ["oscillator", "phase_shifter", "entropy_injector", "bit_decoder"],
    mfgProcess: "photolithography",
    batchSize: 1000,
  },
  electrical_opt: {
    name: "Impedance Matching Lattice",
    category: "electrical",
    typicalDims: { width: 200, height: 200, thickness: 5 },
    unit: "mm",
    components: ["source_node", "regulation_module", "storage_bank", "load_interface"],
    mfgProcess: "3d_print_metal",
    batchSize: 100,
  },
  chemistry_sim: {
    name: "Molecular Reaction Lattice",
    category: "experimental",
    typicalDims: { w: 50, h: 50, d: 50 },
    unit: "nm",
    components: ["catalyst_site", "reagent_flow", "product_collector"],
    mfgProcess: "molecular_assembly",
    batchSize: 1,
  }
};

export class BlueprintGenerator {
  generate(productType: string, optimizerResult: any = {}, simData: any = null) {
    const template = PRODUCT_TEMPLATES[productType];
    if (!template) return { ok: false, error: "Unknown product" };

    const isEsky = productType === 'esky';
    const config = optimizerResult.config || optimizerResult;
    const thermal = optimizerResult.thermal || optimizerResult.result || {};

    const targetT = config?.targetTemp || thermal?.finalT || 4;
    const ambientT = config?.ambientTemp || 25;
    
    const coldColor = targetT < 0 ? "#00ffff" : targetT < 10 ? "#0088ff" : "#00ff88";
    const hotColor = ambientT > 30 ? "#ff0000" : "#ff8800";

    const dims = template.typicalDims;
    const w = 800, h = 600;
    const cx = w / 2, cy = h / 2;

    const shapes: any[] = [];
    const defs: any[] = [];

    // Add Lattice Background
    const lattice = this.generateLattice(w, h, config?.latticeDensity || 0.82, config?.discovery);
    shapes.push(...lattice.map(s => ({ ...s, category: 'lattice' })));

    // If we have live sim data, use it for the schematic/topology
    if (simData?.particles && simData.particles.length > 0) {
      const pScale = 120;
      const points = simData.particles.slice(0, 300);
      
      points.forEach((p: any, i: number) => {
        const sx = cx + p.x * pScale;
        const sy = cy + p.y * pScale;
        
        // Draw nodes
        shapes.push({ 
          type: "circle", 
          cx: sx, cy: sy, 
          r: 1.2, 
          fill: i % 10 === 0 ? "#0ff" : "rgba(0,255,255,0.2)", 
          category: 'schematic' 
        });

        // Dynamic connections based on proximity (simulated)
        if (i > 0 && i < points.length - 1) {
          const next = points[i+1];
          const dist = Math.sqrt(Math.pow(p.x - next.x, 2) + Math.pow(p.y - next.y, 2));
          if (dist < 0.5) {
            shapes.push({
              type: "line",
              x1: sx, y1: sy,
              x2: cx + next.x * pScale,
              y2: cy + next.y * pScale,
              stroke: "rgba(0,255,255,0.15)",
              strokeWidth: 0.5,
              category: 'schematic'
            });
          }
        }
      });
      
      shapes.push({ 
        type: "text", 
        x: cx - 120, y: cy + 260, 
        fill: "#0ff", 
        fontSize: 10, 
        text: `LIVE_TOPOLOGY_STREAM // NODES: ${points.length} // ENTROPY: ${(Math.random() * 100).toFixed(2)}%`, 
        fontWeight: "bold", 
        category: 'schematic' 
      });
    }

    if (productType === 'house_cooling') {
      // Generate Floor Plan (Topology Birds-eye)
      const rooms = [
        { x: 150, y: 150, w: 250, h: 200, label: "Living Area" },
        { x: 400, y: 150, w: 250, h: 200, label: "Kitchen" },
        { x: 150, y: 350, w: 200, h: 150, label: "Bedroom 1" },
        { x: 350, y: 350, w: 300, h: 150, label: "Master Suite" },
      ];

      rooms.forEach(r => {
        // Schematic view
        shapes.push({ type: "rect", x: r.x, y: r.y, width: r.w, height: r.h, stroke: "#555", strokeWidth: 2, fill: "rgba(255,255,255,0.02)", category: 'schematic' });
        shapes.push({ type: "text", x: r.x + 10, y: r.y + 20, fill: "#888", fontSize: 10, text: r.label, category: 'schematic' });
        
        // Topology view (Floor Plan)
        shapes.push({ type: "rect", x: r.x, y: r.y, width: r.w, height: r.h, stroke: "#0ff", strokeWidth: 1, fill: "rgba(0,255,255,0.05)", category: 'topology' });
        shapes.push({ type: "text", x: r.x + 10, y: r.y + 20, fill: "#0ff", fontSize: 10, text: r.label, category: 'topology' });
      });

      // Generate Flow Plan (Airflow/Thermal Flow)
      const flowPoints = [
        { x1: 200, y1: 200, x2: 600, y2: 200 },
        { x1: 600, y1: 200, x2: 600, y2: 450 },
        { x1: 600, y1: 450, x2: 200, y2: 450 },
        { x1: 200, y1: 450, x2: 200, y2: 200 },
      ];

      flowPoints.forEach(p => {
        shapes.push({ type: "line", x1: p.x1, y1: p.y1, x2: p.x2, y2: p.y2, stroke: "#0ff", strokeWidth: 3, opacity: 0.6, strokeDasharray: "10 5", category: 'thermal' });
      });
      shapes.push({ type: "text", x: 300, y: 140, fill: "#0ff", fontSize: 12, text: "THERMAL RECIRCULATION LOOP", fontWeight: "bold", category: 'thermal' });
    } else if (productType === 'blockchain_5bit') {
      // Generate 5-Bit Protocol Schematic (Distributed Network)
      const nodes = [];
      for (let i = 0; i < 12; i++) {
        nodes.push({
          x: 100 + Math.random() * 600,
          y: 150 + Math.random() * 300,
          id: `NODE_${i}`
        });
      }

      nodes.forEach(n => {
        shapes.push({ type: "circle", cx: n.x, cy: n.y, r: 15, fill: "rgba(0,255,255,0.1)", stroke: "#0ff", strokeWidth: 1, category: 'schematic' });
        shapes.push({ type: "text", x: n.x - 15, y: n.y + 25, fill: "#0ff", fontSize: 8, text: n.id, category: 'schematic' });
        
        // Connect to 2 random other nodes
        for (let k = 0; k < 2; k++) {
          const other = nodes[Math.floor(Math.random() * nodes.length)];
          if (other !== n) {
            shapes.push({ type: "line", x1: n.x, y1: n.y, x2: other.x, y2: other.y, stroke: "#0ff", strokeWidth: 0.5, opacity: 0.3, category: 'schematic' });
          }
        }
      });

      // Central Ledger
      shapes.push({ type: "rect", x: cx - 60, y: cy - 40, width: 120, height: 80, rx: 10, fill: "rgba(255,0,255,0.1)", stroke: "#f0f", strokeWidth: 2, category: 'schematic' });
      shapes.push({ type: "text", x: cx - 45, y: cy + 5, fill: "#f0f", fontSize: 10, text: "QUINARY LEDGER", fontWeight: "bold", category: 'schematic' });

      shapes.push({ type: "text", x: cx - 100, y: 80, fill: "#f0f", fontSize: 14, text: "5-BIT QUINARY SYNC PROTOCOL", fontWeight: "black", category: 'schematic' });
    } else if (productType === 'spaceship') {
      // Generate Spaceship Thermal Membrane
      const sunSide = { x: 50, y: 100, w: 20, h: 400, label: "SUN_SIDE (+120C)" };
      const darkSide = { x: 730, y: 100, w: 20, h: 400, label: "DARK_SIDE (-150C)" };
      
      shapes.push({ type: "rect", x: sunSide.x, y: sunSide.y, width: sunSide.w, height: sunSide.h, fill: "#f80", stroke: "none", category: 'thermal' });
      shapes.push({ type: "text", x: sunSide.x - 10, y: sunSide.y - 10, fill: "#f80", fontSize: 10, text: sunSide.label, fontWeight: "bold", category: 'thermal' });
      
      shapes.push({ type: "rect", x: darkSide.x, y: darkSide.y, width: darkSide.w, height: darkSide.h, fill: "#08f", stroke: "none", category: 'thermal' });
      shapes.push({ type: "text", x: darkSide.x - 50, y: darkSide.y - 10, fill: "#08f", fontSize: 10, text: darkSide.label, fontWeight: "bold", category: 'thermal' });

      // Optimal Isotope Lattice Core (Boron-10)
      const isoDensity = 0.95;
      for (let i = 0; i < 15; i++) {
        const x = 80 + i * 45;
        for (let j = 0; j < 8; j++) {
          const y = 120 + j * 50;
          shapes.push({ 
            type: "circle", 
            cx: x, cy: y, 
            r: 4, 
            fill: "rgba(0,255,255,0.4)", 
            stroke: "#0ff", 
            strokeWidth: 0.5, 
            category: 'lattice',
            label: "B-10 Isotope Node"
          });
          if (i < 14) shapes.push({ type: "line", x1: x, y1: y, x2: x + 45, y2: y, stroke: "rgba(0,255,255,0.1)", strokeWidth: 1, category: 'lattice' });
          if (j < 7) shapes.push({ type: "line", x1: x, y1: y, x2: x, y2: y + 50, stroke: "rgba(0,255,255,0.1)", strokeWidth: 1, category: 'lattice' });
        }
      }

      // Magnetocaloric Flux Lines
      for (let i = 0; i < 8; i++) {
        const y = 140 + i * 50;
        shapes.push({ type: "line", x1: 70, y1: y, x2: 730, y2: y, stroke: "#f0f", strokeWidth: 1, opacity: 0.3, strokeDasharray: "15 5", category: 'thermal' });
      }
      shapes.push({ type: "text", x: cx - 120, y: 80, fill: "#fff", fontSize: 16, text: "AEROSPACE THERMAL MEMBRANE (V.7)", fontWeight: "black", category: 'schematic' });
    } else if (productType === 'electrical_opt') {
      // Generate Electrical Schematic with Silver-Graphene Weave
      const nodes = [
        { x: 200, y: 300, label: "SOURCE_V" },
        { x: 400, y: 200, label: "REG_MOD" },
        { x: 400, y: 400, label: "STORAGE_B" },
        { x: 600, y: 300, label: "LOAD_OUT" },
      ];

      // Weave Pattern Background
      for (let i = 0; i < 20; i++) {
        const x = 150 + i * 25;
        shapes.push({ type: "line", x1: x, y1: 150, x2: x, y2: 450, stroke: "rgba(255,255,255,0.05)", strokeWidth: 0.5, category: 'lattice' });
        const y = 150 + i * 15;
        shapes.push({ type: "line", x1: 150, y1: y, x2: 650, y2: y, stroke: "rgba(255,255,255,0.05)", strokeWidth: 0.5, category: 'lattice' });
      }

      nodes.forEach(n => {
        shapes.push({ type: "circle", cx: n.x, cy: n.y, r: 25, fill: "rgba(255,0,255,0.1)", stroke: "#f0f", strokeWidth: 2, category: 'schematic' });
        shapes.push({ type: "text", x: n.x - 25, y: n.y + 45, fill: "#f0f", fontSize: 10, text: n.label, fontWeight: "bold", category: 'schematic' });
      });

      const connections = [
        { x1: 200, y1: 300, x2: 400, y2: 200 },
        { x1: 200, y1: 300, x2: 400, y2: 400 },
        { x1: 400, y1: 200, x2: 600, y2: 300 },
        { x1: 400, y1: 400, x2: 600, y2: 300 },
      ];

      connections.forEach(c => {
        shapes.push({ type: "line", x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2, stroke: "#f0f", strokeWidth: 2, opacity: 0.4, category: 'schematic' });
      });
      shapes.push({ type: "text", x: cx - 150, y: 80, fill: "#f0f", fontSize: 16, text: "IMPEDANCE MATCHING WEAVE (E.1)", fontWeight: "black", category: 'schematic' });
      shapes.push({ type: "text", x: cx - 100, y: 110, fill: "#888", fontSize: 10, text: "OPTIMAL WAVELENGTH POINT: 248nm", category: 'schematic' });
    } else if (productType === 'stubby' || productType === 'esky') {
      const rOuter = isEsky ? 220 : 150;
      const rInner = rOuter - (isEsky ? 60 : 30);

      defs.push({
        id: "thermalGradientRadial",
        type: "radialGradient",
        stops: [
          { offset: "0%", color: coldColor, opacity: 0.8 },
          { offset: "100%", color: hotColor, opacity: 0.2 }
        ]
      });

      // Nested Material Flows (Materials within Materials)
      for (let i = 0; i < (isEsky ? 5 : 3); i++) {
        const r = rInner + (i * (isEsky ? 12 : 8));
        shapes.push({ 
          type: "circle", 
          cx, cy, r, 
          stroke: i % 2 === 0 ? "rgba(0,255,255,0.2)" : "rgba(255,0,255,0.1)", 
          strokeWidth: 1, 
          fill: "none",
          label: `Lattice Layer ${i+1}`,
          category: 'lattice'
        });
      }

      shapes.push({ type: "circle", cx, cy, r: rInner, fill: "url(#thermalGradientRadial)", label: "Magnetocaloric Core", category: 'thermal' });
      
      if (isEsky) {
        // Box shape for Esky
        shapes.push({ type: "rect", x: cx - rOuter, y: cy - rOuter * 0.7, width: rOuter * 2, height: rOuter * 1.4, rx: 20, stroke: "#333", strokeWidth: 3, fill: "none", label: "Outer Membrane", category: 'schematic' });
        shapes.push({ type: "line", x1: cx - rOuter, y1: cy - rOuter * 0.3, x2: cx + rOuter, y2: cy - rOuter * 0.3, stroke: "#333", strokeWidth: 1, category: 'schematic' }); // Lid line
      } else {
        // Cylindrical shape for Stubby
        shapes.push({ type: "rect", x: cx - rOuter * 0.6, y: cy - rOuter, width: rOuter * 1.2, height: rOuter * 2, rx: 40, stroke: "#333", strokeWidth: 3, fill: "none", label: "Outer Membrane", category: 'schematic' });
      }

      // Recirculation & Flow Channels
      const nSpiral = isEsky ? 12 : 8;
      const turns = isEsky ? 4 : 3;
      for (let i = 0; i < nSpiral; i++) {
        let d = "";
        const angleOffset = (Math.PI * 2 / nSpiral) * i;
        for (let theta = 0; theta <= Math.PI * 2 * turns; theta += 0.2) {
          const r = rInner + 2 + ((rOuter - rInner - 5) * (theta / (Math.PI * 2 * turns))); 
          const x = cx + Math.cos(theta + angleOffset) * r;
          const y = cy + Math.sin(theta + angleOffset) * r;
          d += (theta === 0 ? "M " : "L ") + `${x},${y} `;
        }
        shapes.push({ type: "path", d: d.trim(), stroke: "#4af", strokeWidth: isEsky ? 2 : 1.5, fill: "none", opacity: 0.8, label: "Recirculation Channel", category: 'thermal' });
      }

      // Magnetocaloric Flux Lines (Safe Surface Check)
      for (let i = 0; i < (isEsky ? 24 : 12); i++) {
        const angle = (Math.PI * 2 / (isEsky ? 24 : 12)) * i;
        shapes.push({
          type: "line",
          x1: cx + Math.cos(angle) * (rInner - 20),
          y1: cy + Math.sin(angle) * (rInner - 20),
          x2: cx + Math.cos(angle) * (rOuter + 5),
          y2: cy + Math.sin(angle) * (rOuter + 5),
          stroke: "#f80",
          strokeWidth: 1,
          opacity: 0.3,
          label: "Magnetic Flux Line",
          category: 'thermal'
        });
      }

      // Battery Pack Visualization
      shapes.push({
        type: "rect",
        x: cx + rOuter + 20,
        y: cy - 40,
        width: 40,
        height: 80,
        stroke: "#0f0",
        strokeWidth: 2,
        fill: "rgba(0,255,0,0.1)",
        label: isEsky ? "100Ah Battery Bank" : "5Ah Stubby Battery",
        category: 'schematic'
      });

      // Safety Limit Indicators
      shapes.push({
        type: "text",
        x: cx - rOuter,
        y: cy + rOuter + 40,
        fill: "#aaa",
        fontSize: 10,
        text: "SURFACE SAFETY LIMIT: 45°C (MAX) / 5°C (MIN)"
      });
    } else if (dims.outerDia) {
      const rOuter = 150;
      const rInner = rOuter - 30;

      defs.push({
        id: "thermalGradientRadial",
        type: "radialGradient",
        stops: [
          { offset: "0%", color: coldColor, opacity: 0.8 },
          { offset: "100%", color: hotColor, opacity: 0.2 }
        ]
      });

      shapes.push({ type: "circle", cx, cy, r: rInner, fill: "url(#thermalGradientRadial)", label: "Thermodynamic Zone" });
      shapes.push({ type: "circle", cx, cy, r: rOuter, stroke: "#333", strokeWidth: 3, fill: "none", label: "Outer Shell" });

      const nSpiral = config?.nSpiral || 6;
      const turns = 2.5;
      for (let i = 0; i < nSpiral; i++) {
        let d = "";
        const angleOffset = (Math.PI * 2 / nSpiral) * i;
        for (let theta = 0; theta <= Math.PI * 2 * turns; theta += 0.2) {
          const r = rInner + 2 + (13 * (theta / (Math.PI * 2 * turns))); 
          const x = cx + Math.cos(theta + angleOffset) * r;
          const y = cy + Math.sin(theta + angleOffset) * r;
          d += (theta === 0 ? "M " : "L ") + `${x},${y} `;
        }
        shapes.push({ type: "path", d: d.trim(), stroke: "#4af", strokeWidth: 2, fill: "none" });
      }
    }

    const energyMath = this.calculateEnergyMath(productType, targetT, ambientT, isEsky);

    // Invented Composite Logic
    const inventedComposite = this.inventComposite(productType, optimizerResult);
    
    const bom = this.generateBOM(productType, isEsky, inventedComposite);
    const totalCost = bom.reduce((sum, item) => sum + item.cost, 0);

    const layers = this.generateLayers(productType, isEsky, inventedComposite);
    const flowData = this.generateFlowData(productType, isEsky);

    // Add Topological Render (3D-like projection)
    this.addTopologicalRender(shapes, productType, isEsky);

    return {
      ok: true,
      product: template.name,
      version: "BB-" + productType.toUpperCase() + "-" + Date.now().toString(36).toUpperCase(),
      svg: { viewBox: `0 0 ${w} ${h}`, defs, shapes },
      energyMath,
      inventedComposite,
      bom,
      layers,
      flowData,
      totalCost,
      specs: {
        latticeDensity: (config?.latticeDensity || 0.82).toFixed(2),
        thermalResistance: inventedComposite ? `R-${(inventedComposite.thermalConductivity * 10).toFixed(1)} (Deep Learning Optimized)` : (productType === 'spaceship' ? "R-45.0 (Isotope)" : isEsky ? "R-12.5" : productType === 'house_cooling' ? "R-8.4 (Composite)" : "R-4.2"),
        structuralIntegrity: "99.8%",
        buildCost: `$${totalCost.toFixed(2)}`,
        weight: productType === 'spaceship' ? "450 kg" : isEsky ? "12.4 kg" : "0.45 kg",
        optimizationFocus: productType === 'electrical_opt' ? "THz Weave Transmission" : productType === 'blockchain_5bit' ? "Entropy-Sync" : "Thermal Isolation"
      }
    };
  }

  /**
   * Generate material properties for the simulation engine.
   * Returns props ready for V1Engine.setMaterial().
   * The sim explores optimal topology within this material.
   */
  generateMaterial(
    optimizerType: string,
    v7Score?: number,
    v7Recommendations?: { target: string; key: string; newValue: number }[]
  ): {
    conductivity: number;
    dielectricConstant: number;
    density: number;
    geometry: string;
    resolution: number;
  } {
    // Base material properties per optimizer type
    const profiles: Record<string, { k: number; er: number; rho: number; geo: string }> = {
      thermal: { k: 0.025, er: 4.5, rho: 1200, geo: 'gyroid' },       // Aerogel-like insulator
      electrical: { k: 385, er: 4.4, rho: 8960, geo: 'diamond' },      // FR-4 / copper PCB
      blockchain: { k: 150, er: 11.7, rho: 2330, geo: 'schwarz_p' },   // Silicon-like substrate
      math: { k: 1.0, er: 1.0, rho: 1000, geo: 'gyroid' },            // Abstract medium
    };

    const base = profiles[optimizerType] || profiles.thermal;
    let { k, er, rho, geo } = base;

    // V7 meta-optimizer feedback: refine material properties based on sim performance
    if (v7Score !== undefined && v7Score > 0) {
      // If V7 score is improving, sharpen the material (higher resolution exploration)
      // If V7 score is low, soften it to help PSO escape local minima
      const sharpness = Math.min(1.0, v7Score / 100);
      k *= (1.0 + (sharpness - 0.5) * 0.2);    // ±10% conductivity shift
      er *= (1.0 + (sharpness - 0.5) * 0.3);    // ±15% dielectric shift
    }

    // V7 recommendations can override geometry if topology change needed
    if (v7Recommendations) {
      for (const rec of v7Recommendations) {
        if (rec.key === 'material_geometry') {
          const geos = ['gyroid', 'diamond', 'schwarz_p'];
          geo = geos[Math.floor(rec.newValue * geos.length) % geos.length];
        }
        if (rec.key === 'material_conductivity') k = rec.newValue;
        if (rec.key === 'material_dielectric') er = rec.newValue;
      }
    }

    // Resolution scales with optimizer complexity
    const resolution = optimizerType === 'math' ? 20 : 16;

    return {
      conductivity: k,
      dielectricConstant: er,
      density: rho,
      geometry: geo,
      resolution,
    };
  }

  private inventComposite(productType: string, result: any) {
    const stability = result.globalMemory?.v7_consensus_stability || 0.5;
    const cooling = result.globalMemory?.v7_cooling_efficiency || 0.5;

    // Map product types to optimizer types for material generation
    const optMap: Record<string, string> = {
      stubby: 'thermal', esky: 'thermal', house_cooling: 'thermal',
      spaceship: 'thermal', electrical_opt: 'electrical',
      blockchain_5bit: 'blockchain', chemistry_sim: 'math',
    };
    const optType = optMap[productType] || 'thermal';
    const simMat = this.generateMaterial(optType, stability * 100);

    const name = `BB-COMP-${(stability * 100).toFixed(0)}-${(cooling * 100).toFixed(0)}`;
    return {
      name,
      baseMaterials: stability > 0.7 ? ["Graphene", "Boron-10"] : ["Silica", "Copper"],
      thermalConductivity: simMat.conductivity,
      dielectricConstant: simMat.dielectricConstant,
      density: simMat.density,
      geometry: simMat.geometry,
      description: `AI-optimized composite with ${stability > 0.7 ? 'high-order lattice' : 'amorphous flow'} structure. Geometry: ${simMat.geometry}.`,
      noveltyIndex: 0.9 + (stability * 0.1)
    };
  }

  private generateLayers(productType: string, isEsky: boolean, composite?: any) {
    const layers = [];
    if (composite) {
      layers.push({ name: "AI Composite Layer", material: composite.name, thickness: "12mm", description: composite.description });
    }
    
    if (productType === 'esky') {
      layers.push(
        { name: "Outer Shell", material: "High-Density Polyethylene", thickness: "4mm", description: "Impact-resistant structural layer." },
        { name: "Vacuum Gap", material: "Vacuum Insulation Panel", thickness: "20mm", description: "Primary thermal barrier." },
        { name: "Lattice Core", material: "Silica Aerogel", thickness: "15mm", description: "Structural lattice for vacuum support." },
        { name: "Inner Liner", material: "Food-Grade Polymer", thickness: "2mm", description: "Hygienic contact surface." }
      );
    } else if (productType === 'spaceship') {
      layers.push(
        { name: "Ablative Shield", material: "Carbon-Carbon Composite", thickness: "10mm", description: "Re-entry thermal protection." },
        { name: "Isotope Barrier", material: "Boron-10 Lattice", thickness: "25mm", description: "Radiation and thermal isolation." },
        { name: "Fluid Loop", material: "Titanium Alloy", thickness: "5mm", description: "Active heat transport layer." },
        { name: "MLI Blanket", material: "Mylar Stack", thickness: "10mm", description: "Radiative heat shielding." }
      );
    } else if (productType === 'house_cooling') {
      layers.push(
        { name: "Structural Board", material: "Composite Gypsum", thickness: "15mm", description: "Phase-change thermal mass." },
        { name: "Air Gap", material: "Argon Fill", thickness: "10mm", description: "Convective isolation." },
        { name: "Fractal Mesh", material: "Copper Fractal", thickness: "2mm", description: "High-efficiency heat exchange surface." }
      );
    } else {
      layers.push(
        { name: "Primary Layer", material: "Standard Polymer", thickness: "5mm", description: "Base structural component." },
        { name: "Interface Layer", material: "Adhesive Matrix", thickness: "1mm", description: "Bonding and sealing." }
      );
    }
    return layers;
  }

  private generateFlowData(productType: string, isEsky: boolean) {
    if (productType === 'house_cooling') {
      return [
        { type: "Airflow", path: "Central Atrium -> Vents", velocity: "2.4 m/s", direction: "Cyclonic" },
        { type: "Thermal", path: "Wall Surface -> PCM Core", velocity: "0.05 m/s", direction: "Conductive" }
      ];
    } else if (productType === 'spaceship') {
      return [
        { type: "Coolant", path: "Cold Plate -> Radiator", velocity: "1.2 L/min", direction: "Closed Loop" },
        { type: "Flux", path: "Sun Side -> Dark Side", velocity: "N/A", direction: "Radiative Gradient" }
      ];
    }
    return [
      { type: "Thermal", path: "Internal -> External", velocity: "0.01 m/s", direction: "Radial" }
    ];
  }

  private addTopologicalRender(shapes: any[], productType: string, isEsky: boolean) {
    const cx = 400, cy = 300;
    
    // Generate a 3D-like wireframe topology
    const points: {x: number, y: number, z: number}[] = [];
    const size = 150;
    const steps = 8;
    
    for (let i = 0; i <= steps; i++) {
      for (let j = 0; j <= steps; j++) {
        const x = (i / steps - 0.5) * size * 2;
        const y = (j / steps - 0.5) * size * 2;
        // Create a wave-like topology (Gyroid-ish)
        const z = Math.sin(i * 0.8) * Math.cos(j * 0.8) * 40;
        points.push({ x, y, z });
      }
    }

    const project = (p: {x: number, y: number, z: number}) => {
      const scale = 1;
      const isoX = (p.x - p.y) * 0.8;
      const isoY = (p.x + p.y) * 0.4 - p.z;
      return { x: cx + isoX * scale, y: cy + isoY * scale };
    };

    // Draw grid lines
    for (let i = 0; i <= steps; i++) {
      for (let j = 0; j <= steps; j++) {
        const p1 = project(points[i * (steps + 1) + j]);
        
        if (i < steps) {
          const p2 = project(points[(i + 1) * (steps + 1) + j]);
          shapes.push({ type: "line", x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, stroke: "rgba(0,255,255,0.3)", strokeWidth: 0.5, category: 'topology' });
        }
        if (j < steps) {
          const p2 = project(points[i * (steps + 1) + (j + 1)]);
          shapes.push({ type: "line", x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, stroke: "rgba(0,255,255,0.3)", strokeWidth: 0.5, category: 'topology' });
        }
      }
    }

    shapes.push({ type: "text", x: cx - 80, y: cy + 180, fill: "#0ff", fontSize: 12, text: "3D TOPOLOGICAL MANIFOLD RENDER", fontWeight: "bold", category: 'topology' });
    shapes.push({ type: "text", x: cx - 60, y: cy + 200, fill: "rgba(0,255,255,0.5)", fontSize: 8, text: "ISO-PROJECTION // LATTICE_DENSITY: 0.82", category: 'topology' });
  }

  private generateBOM(productType: string, isEsky: boolean, composite?: any) {
    const bom = [];
    if (composite) {
      bom.push({ item: `AI Composite (${composite.name})`, cost: 45.00, source: "Deep Learning Synthesis" });
    }

    const getCost = (key: string, qty: number) => {
      const mat = MATERIAL_CODEX[key];
      return mat ? (mat.costPerKg || 100) * qty : 100;
    };

    if (productType === 'esky') {
      bom.push(
        { item: "Core Material (Aerogel)", cost: getCost('aerogel', 1.5), source: "Silica-Vapor Deposition" },
        { item: "Insulation Layer (Vacuum)", cost: getCost('vacuum_insulation', 0.5), source: "Nanoporous Core Seal" },
        { item: "Magnetocaloric Array (Gd)", cost: getCost('gadolinium', 0.8), source: "Rare Earth Separation" },
        { item: "Battery System (100Ah)", cost: 250.00, source: "Solid State Lithium" },
        { item: "Recirculation Pump", cost: 85.00, source: "Brushless DC" }
      );
    } else if (productType === 'stubby') {
      bom.push(
        { item: "Core Material (Polymer)", cost: 15.00, source: "Recycled PET" },
        { item: "Insulation Layer (Foam)", cost: 5.50, source: "Closed-Cell PU" },
        { item: "CO2 Expansion Chamber", cost: 25.00, source: "Micro-Canister System" },
        { item: "Magnetocaloric Ring (Gd)", cost: getCost('gadolinium', 0.15), source: "Rare Earth Separation" },
        { item: "Battery System (5Ah)", cost: 30.00, source: "Lipo-Cell" }
      );
    } else if (productType === 'spaceship') {
      bom.push(
        { item: "Radiator Panel (Ti-6Al-4V)", cost: getCost('titanium', 30), source: "Vacuum Arc Remelting" },
        { item: "Isotope Insulation (Boron-10)", cost: getCost('isotope_insulation', 5), source: "Isotopic Enrichment Lab" },
        { item: "Magnetocaloric Core (Gd)", cost: getCost('gadolinium', 15), source: "Rare Earth Separation" },
        { item: "MLI Insulation", cost: 2500.00, source: "Mylar-Vapor Deposition" }
      );
    } else if (productType === 'house_cooling') {
      bom.push(
        { item: "Composite Plasterboard", cost: getCost('composite_plasterboard', 40), source: "Paraffin-Gypsum Mix" },
        { item: "Heat Exchanger (Cu)", cost: getCost('copper_mesh', 15), source: "Fractal Mesh Fab" },
        { item: "Compressor Unit", cost: 1200.00, source: "Inverter Drive" },
        { item: "Control Board", cost: 250.00, source: "BB-OS Embedded" }
      );
    } else if (productType === 'electrical_opt') {
      bom.push(
        { item: "Silver-Graphene Weave", cost: getCost('weave_transmission', 2), source: "Hybrid Fiber Loom" },
        { item: "Regulation Module", cost: 450.00, source: "Novelty-Entropy Controller" },
        { item: "Storage Bank", cost: 800.00, source: "Supercapacitor Array" },
        { item: "Load Interface", cost: 150.00, source: "Impedance Matcher" }
      );
    } else if (productType === 'blockchain_5bit') {
      bom.push(
        { item: "Novelty-Entropy Chip", cost: 120.00, source: "5-Bit Quinary Fab" },
        { item: "Distributed Node Array", cost: 300.00, source: "Mesh Network" }
      );
    } else {
      bom.push(
        { item: "Base Material", cost: 100.00, source: "Generic" },
        { item: "Processing", cost: 50.00, source: "Generic" }
      );
    }
    return bom;
  }

  private calculateEnergyMath(type: string, targetT: number, ambientT: number, isEsky: boolean) {
    const deltaT = Math.abs(ambientT - targetT);
    const mass = isEsky ? 25 : 0.5; // kg (water equivalent)
    const cp = 4184; // J/kgK
    const energyRemoved = mass * cp * deltaT; // Joules
    
    // Magnetocaloric Efficiency (COP)
    // Realistically limited by material properties (entropy change)
    const cop = 3.5; 
    const energyUsed = energyRemoved / cop; // Joules
    
    // Battery Drain
    const batteryCapacity = isEsky ? 3600000 : 180000; // Joules (1kWh vs 50Wh)
    const runtimeHours = batteryCapacity / (energyUsed / 3600); // Very rough estimate

    let formula = `Q = m * Cp * ΔT | W = Q / COP`;
    let limitations = "Real-world limit defined by Gadolinium entropy saturation (ΔS_mag ~ 20 J/kgK).";

    if (type === 'electrical_opt') {
      formula = "W_opt = λ / (n * d) | η = 1 - (R_weave / R_total)";
      limitations = "Wavelength matching limited by Silver-Graphene weave precision (±2nm).";
    } else if (type === 'spaceship') {
      formula = "Q_leak = (k_iso * A * ΔT) / d | σ_shield = 1 - e^(-μ * x)";
      limitations = "Insulation performance defined by Boron-10 isotopic purity and MLI layer count.";
    } else if (type === 'house_cooling') {
      formula = "Q_latent = m_pcm * L_fusion | ΔT_stable = Q / C_composite";
      limitations = "Phase-change stability limited by paraffin microcapsule cycle life (10k cycles).";
    }

    return {
      energyRemoved: (energyRemoved / 1000).toFixed(2) + " kJ",
      energyUsed: (energyUsed / 1000).toFixed(2) + " kJ",
      cop: cop.toFixed(2),
      runtime: runtimeHours.toFixed(1) + " hours",
      formula,
      limitations
    };
  }

  private generateLattice(w: number, h: number, density: number, discovery?: any) {
    const shapes: any[] = [];
    const step = 40;
    const jitter = 10 * (1 - density);
    
    // Use discovery properties if available
    const color = discovery ? (discovery.noveltyIndex > 0.95 ? "#f0f" : "#0ff") : "#0ff";
    const opacity = discovery ? 0.15 : 0.08;

    for (let x = 0; x <= w; x += step) {
      for (let y = 0; y <= h; y += step) {
        const nx = x + (Math.random() - 0.5) * jitter;
        const ny = y + (Math.random() - 0.5) * jitter;

        // Connect to neighbors
        if (x + step <= w) {
          shapes.push({
            type: "line",
            x1: nx, y1: ny,
            x2: x + step + (Math.random() - 0.5) * jitter,
            y2: y + (Math.random() - 0.5) * jitter,
            stroke: color,
            strokeWidth: 1,
            opacity: opacity
          });
        }
        if (y + step <= h) {
          shapes.push({
            type: "line",
            x1: nx, y1: ny,
            x2: x + (Math.random() - 0.5) * jitter,
            y2: y + step + (Math.random() - 0.5) * jitter,
            stroke: color,
            strokeWidth: 1,
            opacity: opacity
          });
        }
        
        if (Math.random() < density * 0.2) {
          shapes.push({
            type: "circle",
            cx: nx, cy: ny, r: discovery ? 3 : 2,
            fill: color,
            opacity: opacity * 2
          });
        }
      }
    }
    return shapes;
  }
}
