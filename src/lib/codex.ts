/**
 * codex.ts — The Material & Frequency Knowledge Base
 */

export const MATERIAL_CODEX: Record<string, any> = {
  silica: {
    name: "Fused Silica",
    dielectricConstant: 3.8,
    thermalConductivity: 1.3,
    optimalFrequency: "2.4 GHz",
    noveltyIndex: 0.85,
    description: "High purity glass, excellent for low-loss signal propagation."
  },
  graphene: {
    name: "Graphene Lattice",
    dielectricConstant: 2.4,
    thermalConductivity: 5000,
    optimalFrequency: "300 GHz",
    noveltyIndex: 0.98,
    description: "Atomic-scale carbon lattice. Extreme thermal conductivity for high-power Fitz-Hugh-Nagumo oscillators."
  },
  aerogel: {
    name: "Silica Aerogel",
    dielectricConstant: 1.1,
    thermalConductivity: 0.015,
    optimalFrequency: "1.2 GHz",
    noveltyIndex: 0.92,
    description: "Ultra-low density solid. Perfect for thermal isolation and low-interference 1-bit signaling."
  },
  copper_mesh: {
    name: "Copper Fractal Mesh",
    dielectricConstant: 1.0, // Air-filled
    thermalConductivity: 401,
    optimalFrequency: "10 GHz",
    noveltyIndex: 0.75,
    description: "High conductivity fractal structure for impedance matching and Faraday shielding.",
    costPerKg: 12.50,
    density: 8960
  },
  gadolinium: {
    name: "Gadolinium (Gd)",
    dielectricConstant: 1.0,
    thermalConductivity: 10.6,
    optimalFrequency: "N/A",
    noveltyIndex: 0.99,
    description: "Rare earth metal with high magnetocaloric effect. Ideal for magnetic refrigeration systems.",
    costPerKg: 450.00,
    density: 7900,
    entropyChange: 20 // J/kgK
  },
  titanium: {
    name: "Titanium (Ti-6Al-4V)",
    dielectricConstant: 1.0,
    thermalConductivity: 6.7,
    optimalFrequency: "N/A",
    noveltyIndex: 0.88,
    description: "High-strength aerospace alloy with excellent thermal stability and corrosion resistance.",
    costPerKg: 150.00,
    density: 4430
  },
  vacuum_insulation: {
    name: "Vacuum Insulation Panel",
    dielectricConstant: 1.0,
    thermalConductivity: 0.004,
    optimalFrequency: "N/A",
    noveltyIndex: 0.95,
    description: "Ultra-high performance insulation using vacuum-sealed nanoporous cores.",
    costPerKg: 85.00,
    density: 200
  },
  composite_plasterboard: {
    name: "Phase-Change Composite Plasterboard",
    dielectricConstant: 2.1,
    thermalConductivity: 0.045,
    optimalFrequency: "N/A",
    noveltyIndex: 0.94,
    description: "Gypsum-based composite with paraffin microcapsules for high thermal mass and latent heat storage.",
    costPerKg: 4.50,
    density: 950
  },
  isotope_insulation: {
    name: "Boron-10 Isotope Lattice",
    dielectricConstant: 1.0,
    thermalConductivity: 0.002,
    optimalFrequency: "N/A",
    noveltyIndex: 0.99,
    description: "Isotopically pure Boron-10 lattice for radiation shielding and ultra-low thermal leakage in deep space.",
    costPerKg: 2500.00,
    density: 2300
  },
  weave_transmission: {
    name: "Silver-Graphene Hybrid Weave",
    dielectricConstant: 1.05,
    thermalConductivity: 5200,
    optimalFrequency: "1.2 THz",
    noveltyIndex: 0.97,
    description: "Woven silver-graphene fibers for zero-loss transmission at optimal wavelength points.",
    costPerKg: 1800.00,
    density: 10500
  }
};

export const BLOCKCHAIN_CODEX: Record<string, any> = {
  "1bit_fit": {
    name: "1-bit Frequency-in-Time",
    baseProtocol: "Novelty-Entropy",
    carrierOptimization: (material: any) => {
      // Logic to find optimal carrier based on material properties
      const freq = parseFloat(material.optimalFrequency);
      const shift = material.dielectricConstant * 0.1;
      return {
        carrier: `${(freq + shift).toFixed(2)} GHz`,
        bandwidth: `${(material.thermalConductivity / 100).toFixed(2)} MHz`,
        entropySource: material.thermalConductivity > 100 ? "Thermal Noise" : "Quantum Tunneling"
      };
    }
  },
  "5bit_fit": {
    name: "5-bit Split Frequency Protocol",
    baseProtocol: "Carrier-Piggyback AM/FM",
    carrierOptimization: (material: any) => {
      const baseFreq = parseFloat(material.optimalFrequency) || 2.4;
      const dielectricShift = material.dielectricConstant * 0.05;
      const entropyDepth = material.noveltyIndex * 31; // 5-bit depth
      return {
        carrier: `${(baseFreq + dielectricShift).toFixed(3)} GHz`,
        bandwidth: `${(material.thermalConductivity / 50).toFixed(2)} MHz`,
        entropySource: `System Binary + ${material.name} Lattice`,
        modulationDepth: `${(entropyDepth / 31 * 100).toFixed(1)}%`
      };
    }
  }
};
