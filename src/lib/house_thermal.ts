/**
 * house_thermal.ts — Real House Thermal Model
 */

export const WALL_ASSEMBLIES: Record<string, any> = {
  timber_frame: {
    name: "Timber Frame",
    layers: [
      { name: "Plasterboard", thickness: 0.013, k: 0.17 },
      { name: "Insulation", thickness: 0.09, k: 0.044 },
      { name: "Cladding", thickness: 0.02, k: 0.14 },
    ],
  },
  brick_veneer: {
    name: "Brick Veneer",
    layers: [
      { name: "Plasterboard", thickness: 0.013, k: 0.17 },
      { name: "Insulation", thickness: 0.09, k: 0.044 },
      { name: "Brick", thickness: 0.11, k: 0.72 },
    ],
  }
};

export const CLIMATE_ZONES: Record<string, any> = {
  tropical: { name: "Tropical", designCoolT: 34, designHeatT: 18 },
  temperate: { name: "Temperate", designCoolT: 35, designHeatT: 4 },
  cool_temperate: { name: "Cool Temperate", designCoolT: 38, designHeatT: 2 },
};

export function calcHouseHeatLoss(params: any = {}) {
  const {
    floorArea = 150,
    ceilingHeight = 2.7,
    wallType = "brick_veneer",
    climate = "temperate",
    indoorTemp = 22,
  } = params;

  const climateData = CLIMATE_ZONES[climate] || CLIMATE_ZONES.temperate;
  const wallAssembly = WALL_ASSEMBLIES[wallType] || WALL_ASSEMBLIES.brick_veneer;

  // Simplified R-value calculation
  let Rtotal = 0.16; // surface resistances
  wallAssembly.layers.forEach((l: any) => {
    Rtotal += l.thickness / l.k;
  });

  const Uvalue = 1 / Rtotal;
  const perimeter = Math.sqrt(floorArea) * 4;
  const wallArea = perimeter * ceilingHeight;
  
  const dTCool = climateData.designCoolT - indoorTemp;
  const qWallCool = (wallArea * Uvalue) * dTCool;

  // CO2 Expansion Cooling Logic
  const co2ExpansionCooling = params.useCo2Expansion ? (params.co2Volume || 1) * 500 : 0; // 500W per unit volume expansion
  
  // Magnetocaloric Cooling Logic
  const magnetocaloricCooling = params.useMagnetocaloric ? (params.magneticFieldStrength || 1) * 200 : 0; // 200W per Tesla

  // 3D Venting & Recirculation Logic
  const ventingStrategy = params.ventingStrategy || 'ceiling'; // floor, ceiling, topological
  let recirculationEfficiency = 0.6; // Default
  
  if (ventingStrategy === 'ceiling') {
    recirculationEfficiency = 0.75; // Hot air rises, easier to vent from top
  } else if (ventingStrategy === 'floor') {
    recirculationEfficiency = 0.55; // Harder to push hot air down
  } else if (ventingStrategy === 'topological') {
    recirculationEfficiency = 0.92; // Natural convection / stack effect optimization
  }

  let netCoolingLoad = (qWallCool - co2ExpansionCooling - magnetocaloricCooling) * (1 - (recirculationEfficiency - 0.5));

  // Spaceship Thermal Logic (Extreme Gradients)
  if (params.isSpaceship) {
    const sunSideTemp = 120; // Celsius
    const darkSideTemp = -150; // Celsius
    const gradient = sunSideTemp - darkSideTemp;
    const membraneEfficiency = params.membraneType === 'gyroid' ? 0.95 : 0.7;
    const radiationLoss = (gradient * 5.67e-8 * 0.9) * floorArea; // Stefan-Boltzmann approx
    netCoolingLoad += radiationLoss * (1 - membraneEfficiency);
  }

  return {
    ok: true,
    building: { floorArea, wallType, Rvalue: Rtotal.toFixed(2) },
    coolingLoad: { totalW: Math.round(netCoolingLoad), passiveGain: Math.round(qWallCool) },
    hvac: { coolingKw: (netCoolingLoad / 1000).toFixed(1) },
    advanced: {
      co2Cooling: co2ExpansionCooling,
      magnetocaloricCooling: magnetocaloricCooling,
      spaceshipGradient: params.isSpaceship ? 270 : 0
    }
  };
}
