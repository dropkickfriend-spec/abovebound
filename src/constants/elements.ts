export interface ElementData {
  symbol: string;
  name: string;
  atomicNumber: number;
  atomicMass: number;
  density: number; // kg/m3
  thermalConductivity: number; // W/mK
  specificHeat: number; // J/kgK
  viscosity?: number; // Pa.s (for liquids)
}

export const PERIODIC_TABLE: Record<string, ElementData> = {
  H: { symbol: 'H', name: 'Hydrogen', atomicNumber: 1, atomicMass: 1.008, density: 0.08988, thermalConductivity: 0.1805, specificHeat: 14300 },
  He: { symbol: 'He', name: 'Helium', atomicNumber: 2, atomicMass: 4.0026, density: 0.1785, thermalConductivity: 0.1513, specificHeat: 5193 },
  Li: { symbol: 'Li', name: 'Lithium', atomicNumber: 3, atomicMass: 6.94, density: 534, thermalConductivity: 84.8, specificHeat: 3582 },
  Be: { symbol: 'Be', name: 'Beryllium', atomicNumber: 4, atomicMass: 9.0122, density: 1850, thermalConductivity: 190, specificHeat: 1820 },
  B: { symbol: 'B', name: 'Boron', atomicNumber: 5, atomicMass: 10.81, density: 2340, thermalConductivity: 27, specificHeat: 1026 },
  C: { symbol: 'C', name: 'Carbon', atomicNumber: 6, atomicMass: 12.011, density: 2267, thermalConductivity: 140, specificHeat: 710 },
  N: { symbol: 'N', name: 'Nitrogen', atomicNumber: 7, atomicMass: 14.007, density: 1.2506, thermalConductivity: 0.02583, specificHeat: 1040 },
  O: { symbol: 'O', name: 'Oxygen', atomicNumber: 8, atomicMass: 15.999, density: 1.429, thermalConductivity: 0.02658, specificHeat: 918 },
  F: { symbol: 'F', name: 'Fluorine', atomicNumber: 9, atomicMass: 18.998, density: 1.696, thermalConductivity: 0.0277, specificHeat: 824 },
  Ne: { symbol: 'Ne', name: 'Neon', atomicNumber: 10, atomicMass: 20.180, density: 0.9002, thermalConductivity: 0.0491, specificHeat: 1030 },
  Al: { symbol: 'Al', name: 'Aluminum', atomicNumber: 13, atomicMass: 26.982, density: 2700, thermalConductivity: 235, specificHeat: 897 },
  Si: { symbol: 'Si', name: 'Silicon', atomicNumber: 14, atomicMass: 28.085, density: 2329, thermalConductivity: 149, specificHeat: 705 },
  Fe: { symbol: 'Fe', name: 'Iron', atomicNumber: 26, atomicMass: 55.845, density: 7874, thermalConductivity: 80.4, specificHeat: 449 },
  Cu: { symbol: 'Cu', name: 'Copper', atomicNumber: 29, atomicMass: 63.546, density: 8960, thermalConductivity: 401, specificHeat: 385 },
  Ag: { symbol: 'Ag', name: 'Silver', atomicNumber: 47, atomicMass: 107.87, density: 10490, thermalConductivity: 429, specificHeat: 235 },
  Au: { symbol: 'Au', name: 'Gold', atomicNumber: 79, atomicMass: 196.97, density: 19300, thermalConductivity: 318, specificHeat: 129 },
  Gd: { symbol: 'Gd', name: 'Gadolinium', atomicNumber: 64, atomicMass: 157.25, density: 7900, thermalConductivity: 10.6, specificHeat: 236 }, // Magnetocaloric reference
};

export const FLUID_MEDIUMS = {
  AIR: { name: 'Air', density: 1.225, viscosity: 1.81e-5, thermalConductivity: 0.026 },
  WATER: { name: 'Water', density: 997, viscosity: 8.9e-4, thermalConductivity: 0.606 },
  OIL: { name: 'Liquid Medium (Oil)', density: 850, viscosity: 0.03, thermalConductivity: 0.145 },
  MAGNETOCALORIC: { name: 'Magnetocaloric Fluid', density: 1100, viscosity: 0.005, thermalConductivity: 0.5 },
};
