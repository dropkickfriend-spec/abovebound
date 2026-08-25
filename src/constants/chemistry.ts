/**
 * COMPLETE PERIODIC TABLE — All 118 Elements
 *
 * Each element has:
 *   - Physical/chemical properties (valence electrons, electronegativity, max bonds)
 *   - Root prime: smallest prime factor of atomic number
 *   - Bonding rules: what can connect, what repels
 *   - Category: metal / nonmetal / metalloid / noble gas
 *   - Compression field position: 3x3 grid mapping for valence electrons
 *
 * This is the "Lego" system: valence electrons are the pegs that allow atoms
 * to connect. Noble gases have full pegs (can't connect). Hydrogen has 1 peg.
 * The compression field maps these onto a 3x3 grid inside our node array.
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type ElementCategory =
  | 'alkali_metal' | 'alkaline_earth' | 'transition_metal'
  | 'post_transition' | 'metalloid' | 'nonmetal'
  | 'halogen' | 'noble_gas' | 'lanthanide' | 'actinide';

export type BondType = 'ionic' | 'covalent_nonpolar' | 'covalent_polar' | 'metallic' | 'none';

export interface ChemElement {
  z: number;              // Atomic number
  sym: string;            // Symbol
  name: string;           // Full name
  mass: number;           // Atomic mass (u)
  valence: number;        // Valence electrons (bonding capacity pegs)
  maxBonds: number;       // Maximum bonds this element can form
  electronegativity: number; // Pauling scale (0 = unknown)
  category: ElementCategory;
  rootPrime: number;      // Smallest prime factor of Z (Z=1→1)
  oxidationStates: number[]; // Common oxidation states
  canBond: boolean;       // false for He, Ne, Ar
  period: number;         // 1-7
  group: number;          // 1-18 (0 for lanthanides/actinides)
  // Compression field: 3x3 grid (9 slots: 8 valence + 1 nucleus)
  // 1 = filled electron, 0 = empty (bonding site)
  grid3x3: number[];      // [TL, TC, TR, ML, NUCLEUS, MR, BL, BC, BR]
}

// ═══════════════════════════════════════════════════════════════
// ROOT PRIME CALCULATOR
// ═══════════════════════════════════════════════════════════════

function rootPrime(n: number): number {
  if (n <= 1) return 1;
  if (n % 2 === 0) return 2;
  for (let i = 3; i * i <= n; i += 2) {
    if (n % i === 0) return i;
  }
  return n; // n itself is prime
}

// ═══════════════════════════════════════════════════════════════
// 3x3 COMPRESSION GRID GENERATOR
// ═══════════════════════════════════════════════════════════════
// Maps valence electrons to a 3x3 grid around nucleus
// Empty slots = bonding capacity (where another atom can dock)
// Filling order: cardinal directions first (N,E,S,W) then corners (NE,SE,SW,NW)
// This mirrors VSEPR electron pair geometry

function makeGrid(valence: number): number[] {
  // Grid positions: [TL, TC, TR, ML, NUCLEUS, MR, BL, BC, BR]
  // Fill order: TC(N), MR(E), BC(S), ML(W), TR(NE), BR(SE), BL(SW), TL(NW)
  const fillOrder = [1, 5, 7, 3, 2, 8, 6, 0]; // indices into 3x3 grid
  const grid = [0, 0, 0, 0, 1, 0, 0, 0, 0]; // nucleus always filled (center)
  const v = Math.min(valence, 8);
  for (let i = 0; i < v; i++) {
    grid[fillOrder[i]] = 1;
  }
  return grid;
}

// ═══════════════════════════════════════════════════════════════
// FULL PERIODIC TABLE — ALL 118 ELEMENTS
// ═══════════════════════════════════════════════════════════════

function el(z: number, sym: string, name: string, mass: number, valence: number, maxBonds: number,
  en: number, cat: ElementCategory, oxStates: number[], canBond: boolean, period: number, group: number): ChemElement {
  return { z, sym, name, mass, valence, maxBonds, electronegativity: en, category: cat,
    rootPrime: rootPrime(z), oxidationStates: oxStates, canBond, period, group, grid3x3: makeGrid(valence) };
}

export const ELEMENTS: ChemElement[] = [
  // Period 1
  el(1,  'H',  'Hydrogen',      1.008,   1, 1, 2.20, 'nonmetal',       [1,-1],     true,  1, 1),
  el(2,  'He', 'Helium',        4.003,   2, 0, 0,    'noble_gas',      [0],        false, 1, 18),
  // Period 2
  el(3,  'Li', 'Lithium',       6.941,   1, 1, 0.98, 'alkali_metal',   [1],        true,  2, 1),
  el(4,  'Be', 'Beryllium',     9.012,   2, 2, 1.57, 'alkaline_earth', [2],        true,  2, 2),
  el(5,  'B',  'Boron',        10.81,    3, 4, 2.04, 'metalloid',      [3],        true,  2, 13),
  el(6,  'C',  'Carbon',       12.011,   4, 4, 2.55, 'nonmetal',       [-4,4],     true,  2, 14),
  el(7,  'N',  'Nitrogen',     14.007,   5, 4, 3.04, 'nonmetal',       [-3,3,5],   true,  2, 15),
  el(8,  'O',  'Oxygen',       15.999,   6, 2, 3.44, 'nonmetal',       [-2],       true,  2, 16),
  el(9,  'F',  'Fluorine',     18.998,   7, 1, 3.98, 'halogen',        [-1],       true,  2, 17),
  el(10, 'Ne', 'Neon',         20.180,   8, 0, 0,    'noble_gas',      [0],        false, 2, 18),
  // Period 3
  el(11, 'Na', 'Sodium',       22.990,   1, 1, 0.93, 'alkali_metal',   [1],        true,  3, 1),
  el(12, 'Mg', 'Magnesium',    24.305,   2, 2, 1.31, 'alkaline_earth', [2],        true,  3, 2),
  el(13, 'Al', 'Aluminum',     26.982,   3, 6, 1.61, 'post_transition',[3],        true,  3, 13),
  el(14, 'Si', 'Silicon',      28.085,   4, 4, 1.90, 'metalloid',      [-4,4],     true,  3, 14),
  el(15, 'P',  'Phosphorus',   30.974,   5, 5, 2.19, 'nonmetal',       [-3,3,5],   true,  3, 15),
  el(16, 'S',  'Sulfur',       32.06,    6, 6, 2.58, 'nonmetal',       [-2,4,6],   true,  3, 16),
  el(17, 'Cl', 'Chlorine',     35.45,    7, 7, 3.16, 'halogen',        [-1,1,3,5,7],true, 3, 17),
  el(18, 'Ar', 'Argon',        39.948,   8, 0, 0,    'noble_gas',      [0],        false, 3, 18),
  // Period 4
  el(19, 'K',  'Potassium',    39.098,   1, 1, 0.82, 'alkali_metal',   [1],        true,  4, 1),
  el(20, 'Ca', 'Calcium',      40.078,   2, 2, 1.00, 'alkaline_earth', [2],        true,  4, 2),
  el(21, 'Sc', 'Scandium',     44.956,   3, 6, 1.36, 'transition_metal',[3],       true,  4, 3),
  el(22, 'Ti', 'Titanium',     47.867,   4, 6, 1.54, 'transition_metal',[2,3,4],   true,  4, 4),
  el(23, 'V',  'Vanadium',     50.942,   5, 6, 1.63, 'transition_metal',[2,3,4,5], true,  4, 5),
  el(24, 'Cr', 'Chromium',     51.996,   6, 6, 1.66, 'transition_metal',[2,3,6],   true,  4, 6),
  el(25, 'Mn', 'Manganese',    54.938,   7, 6, 1.55, 'transition_metal',[2,3,4,7], true,  4, 7),
  el(26, 'Fe', 'Iron',         55.845,   8, 6, 1.83, 'transition_metal',[2,3],     true,  4, 8),
  el(27, 'Co', 'Cobalt',       58.933,   9, 6, 1.88, 'transition_metal',[2,3],     true,  4, 9),
  el(28, 'Ni', 'Nickel',       58.693,  10, 6, 1.91, 'transition_metal',[2,3],     true,  4, 10),
  el(29, 'Cu', 'Copper',       63.546,  11, 6, 1.90, 'transition_metal',[1,2],     true,  4, 11),
  el(30, 'Zn', 'Zinc',         65.38,    2, 4, 1.65, 'transition_metal',[2],       true,  4, 12),
  el(31, 'Ga', 'Gallium',      69.723,   3, 3, 1.81, 'post_transition',[3],        true,  4, 13),
  el(32, 'Ge', 'Germanium',    72.630,   4, 4, 2.01, 'metalloid',      [2,4],      true,  4, 14),
  el(33, 'As', 'Arsenic',      74.922,   5, 5, 2.18, 'metalloid',      [-3,3,5],   true,  4, 15),
  el(34, 'Se', 'Selenium',     78.971,   6, 6, 2.55, 'nonmetal',       [-2,4,6],   true,  4, 16),
  el(35, 'Br', 'Bromine',      79.904,   7, 5, 2.96, 'halogen',        [-1,1,3,5], true,  4, 17),
  el(36, 'Kr', 'Krypton',      83.798,   8, 2, 3.00, 'noble_gas',      [0,2],      true,  4, 18), // KrF2 exists
  // Period 5
  el(37, 'Rb', 'Rubidium',     85.468,   1, 1, 0.82, 'alkali_metal',   [1],        true,  5, 1),
  el(38, 'Sr', 'Strontium',    87.62,    2, 2, 0.95, 'alkaline_earth', [2],        true,  5, 2),
  el(39, 'Y',  'Yttrium',      88.906,   3, 6, 1.22, 'transition_metal',[3],       true,  5, 3),
  el(40, 'Zr', 'Zirconium',    91.224,   4, 6, 1.33, 'transition_metal',[4],       true,  5, 4),
  el(41, 'Nb', 'Niobium',      92.906,   5, 6, 1.60, 'transition_metal',[3,5],     true,  5, 5),
  el(42, 'Mo', 'Molybdenum',   95.95,    6, 6, 2.16, 'transition_metal',[2,4,6],   true,  5, 6),
  el(43, 'Tc', 'Technetium',   98,       7, 6, 1.90, 'transition_metal',[4,7],     true,  5, 7),
  el(44, 'Ru', 'Ruthenium',   101.07,    8, 6, 2.20, 'transition_metal',[2,3,4],   true,  5, 8),
  el(45, 'Rh', 'Rhodium',     102.91,    9, 6, 2.28, 'transition_metal',[3],       true,  5, 9),
  el(46, 'Pd', 'Palladium',   106.42,   10, 6, 2.20, 'transition_metal',[2,4],     true,  5, 10),
  el(47, 'Ag', 'Silver',      107.87,   11, 6, 1.93, 'transition_metal',[1],       true,  5, 11),
  el(48, 'Cd', 'Cadmium',     112.41,    2, 4, 1.69, 'transition_metal',[2],       true,  5, 12),
  el(49, 'In', 'Indium',      114.82,    3, 3, 1.78, 'post_transition',[3],        true,  5, 13),
  el(50, 'Sn', 'Tin',         118.71,    4, 4, 1.96, 'post_transition',[2,4],      true,  5, 14),
  el(51, 'Sb', 'Antimony',    121.76,    5, 5, 2.05, 'metalloid',      [-3,3,5],   true,  5, 15),
  el(52, 'Te', 'Tellurium',   127.60,    6, 6, 2.10, 'metalloid',      [-2,4,6],   true,  5, 16),
  el(53, 'I',  'Iodine',      126.90,    7, 7, 2.66, 'halogen',        [-1,1,3,5,7],true, 5, 17),
  el(54, 'Xe', 'Xenon',       131.29,    8, 6, 2.60, 'noble_gas',      [0,2,4,6],  true,  5, 18), // XeF2,XeF4,XeF6
  // Period 6
  el(55, 'Cs', 'Cesium',      132.91,    1, 1, 0.79, 'alkali_metal',   [1],        true,  6, 1),
  el(56, 'Ba', 'Barium',      137.33,    2, 2, 0.89, 'alkaline_earth', [2],        true,  6, 2),
  // Lanthanides (57-71)
  el(57, 'La', 'Lanthanum',   138.91,    3, 6, 1.10, 'lanthanide',     [3],        true,  6, 0),
  el(58, 'Ce', 'Cerium',      140.12,    3, 6, 1.12, 'lanthanide',     [3,4],      true,  6, 0),
  el(59, 'Pr', 'Praseodymium',140.91,    3, 6, 1.13, 'lanthanide',     [3],        true,  6, 0),
  el(60, 'Nd', 'Neodymium',   144.24,    3, 6, 1.14, 'lanthanide',     [3],        true,  6, 0),
  el(61, 'Pm', 'Promethium',  145,       3, 6, 1.13, 'lanthanide',     [3],        true,  6, 0),
  el(62, 'Sm', 'Samarium',    150.36,    3, 6, 1.17, 'lanthanide',     [2,3],      true,  6, 0),
  el(63, 'Eu', 'Europium',    151.96,    3, 6, 1.20, 'lanthanide',     [2,3],      true,  6, 0),
  el(64, 'Gd', 'Gadolinium',  157.25,    3, 6, 1.20, 'lanthanide',     [3],        true,  6, 0), // MAGNETOCALORIC
  el(65, 'Tb', 'Terbium',     158.93,    3, 6, 1.20, 'lanthanide',     [3,4],      true,  6, 0),
  el(66, 'Dy', 'Dysprosium',  162.50,    3, 6, 1.22, 'lanthanide',     [3],        true,  6, 0),
  el(67, 'Ho', 'Holmium',     164.93,    3, 6, 1.23, 'lanthanide',     [3],        true,  6, 0),
  el(68, 'Er', 'Erbium',      167.26,    3, 6, 1.24, 'lanthanide',     [3],        true,  6, 0),
  el(69, 'Tm', 'Thulium',     168.93,    3, 6, 1.25, 'lanthanide',     [3],        true,  6, 0),
  el(70, 'Yb', 'Ytterbium',   173.05,    3, 6, 1.10, 'lanthanide',     [2,3],      true,  6, 0),
  el(71, 'Lu', 'Lutetium',    174.97,    3, 6, 1.27, 'lanthanide',     [3],        true,  6, 0),
  // Back to Period 6 main
  el(72, 'Hf', 'Hafnium',     178.49,    4, 6, 1.30, 'transition_metal',[4],       true,  6, 4),
  el(73, 'Ta', 'Tantalum',    180.95,    5, 6, 1.50, 'transition_metal',[5],       true,  6, 5),
  el(74, 'W',  'Tungsten',    183.84,    6, 6, 2.36, 'transition_metal',[2,4,6],   true,  6, 6),
  el(75, 'Re', 'Rhenium',     186.21,    7, 6, 1.90, 'transition_metal',[4,7],     true,  6, 7),
  el(76, 'Os', 'Osmium',      190.23,    8, 6, 2.20, 'transition_metal',[2,3,4,8], true,  6, 8),
  el(77, 'Ir', 'Iridium',     192.22,    9, 6, 2.20, 'transition_metal',[3,4],     true,  6, 9),
  el(78, 'Pt', 'Platinum',    195.08,   10, 6, 2.28, 'transition_metal',[2,4],     true,  6, 10),
  el(79, 'Au', 'Gold',        196.97,   11, 6, 2.54, 'transition_metal',[1,3],     true,  6, 11),
  el(80, 'Hg', 'Mercury',     200.59,    2, 4, 2.00, 'transition_metal',[1,2],     true,  6, 12),
  el(81, 'Tl', 'Thallium',    204.38,    3, 3, 1.62, 'post_transition',[1,3],      true,  6, 13),
  el(82, 'Pb', 'Lead',        207.2,     4, 4, 1.87, 'post_transition',[2,4],      true,  6, 14),
  el(83, 'Bi', 'Bismuth',     208.98,    5, 5, 2.02, 'post_transition',[-3,3,5],   true,  6, 15),
  el(84, 'Po', 'Polonium',    209,       6, 6, 2.00, 'post_transition',[-2,2,4,6], true,  6, 16),
  el(85, 'At', 'Astatine',    210,       7, 5, 2.20, 'halogen',        [-1,1,3,5], true,  6, 17),
  el(86, 'Rn', 'Radon',       222,       8, 2, 2.20, 'noble_gas',      [0,2],      true,  6, 18),
  // Period 7
  el(87, 'Fr', 'Francium',    223,       1, 1, 0.79, 'alkali_metal',   [1],        true,  7, 1),
  el(88, 'Ra', 'Radium',      226,       2, 2, 0.90, 'alkaline_earth', [2],        true,  7, 2),
  // Actinides (89-103)
  el(89, 'Ac', 'Actinium',    227,       3, 6, 1.10, 'actinide',       [3],        true,  7, 0),
  el(90, 'Th', 'Thorium',     232.04,    4, 6, 1.30, 'actinide',       [4],        true,  7, 0),
  el(91, 'Pa', 'Protactinium', 231.04,   5, 6, 1.50, 'actinide',       [4,5],      true,  7, 0),
  el(92, 'U',  'Uranium',     238.03,    6, 6, 1.38, 'actinide',       [3,4,5,6],  true,  7, 0),
  el(93, 'Np', 'Neptunium',   237,       7, 6, 1.36, 'actinide',       [3,4,5,6],  true,  7, 0),
  el(94, 'Pu', 'Plutonium',   244,       6, 6, 1.28, 'actinide',       [3,4,5,6],  true,  7, 0),
  el(95, 'Am', 'Americium',   243,       3, 6, 1.13, 'actinide',       [3,4,5,6],  true,  7, 0),
  el(96, 'Cm', 'Curium',      247,       3, 6, 1.28, 'actinide',       [3],        true,  7, 0),
  el(97, 'Bk', 'Berkelium',   247,       3, 6, 1.30, 'actinide',       [3,4],      true,  7, 0),
  el(98, 'Cf', 'Californium', 251,       3, 6, 1.30, 'actinide',       [3],        true,  7, 0),
  el(99, 'Es', 'Einsteinium', 252,       3, 6, 1.30, 'actinide',       [3],        true,  7, 0),
  el(100,'Fm', 'Fermium',     257,       3, 6, 1.30, 'actinide',       [3],        true,  7, 0),
  el(101,'Md', 'Mendelevium', 258,       3, 6, 1.30, 'actinide',       [2,3],      true,  7, 0),
  el(102,'No', 'Nobelium',    259,       2, 6, 1.30, 'actinide',       [2,3],      true,  7, 0),
  el(103,'Lr', 'Lawrencium',  266,       3, 6, 1.30, 'actinide',       [3],        true,  7, 0),
  // Back to Period 7 main (superheavy)
  el(104,'Rf', 'Rutherfordium',267,      4, 6, 0,    'transition_metal',[4],       true,  7, 4),
  el(105,'Db', 'Dubnium',     268,       5, 6, 0,    'transition_metal',[5],       true,  7, 5),
  el(106,'Sg', 'Seaborgium',  269,       6, 6, 0,    'transition_metal',[6],       true,  7, 6),
  el(107,'Bh', 'Bohrium',     270,       7, 6, 0,    'transition_metal',[7],       true,  7, 7),
  el(108,'Hs', 'Hassium',     277,       8, 6, 0,    'transition_metal',[8],       true,  7, 8),
  el(109,'Mt', 'Meitnerium',  278,       9, 6, 0,    'transition_metal',[3],       true,  7, 9),
  el(110,'Ds', 'Darmstadtium',281,      10, 6, 0,    'transition_metal',[2],       true,  7, 10),
  el(111,'Rg', 'Roentgenium', 282,      11, 6, 0,    'transition_metal',[1],       true,  7, 11),
  el(112,'Cn', 'Copernicium', 285,       2, 4, 0,    'transition_metal',[2],       true,  7, 12),
  el(113,'Nh', 'Nihonium',    286,       3, 3, 0,    'post_transition',[1,3],      true,  7, 13),
  el(114,'Fl', 'Flerovium',   289,       4, 4, 0,    'post_transition',[2,4],      true,  7, 14),
  el(115,'Mc', 'Moscovium',   290,       5, 5, 0,    'post_transition',[1,3],      true,  7, 15),
  el(116,'Lv', 'Livermorium', 293,       6, 6, 0,    'post_transition',[-2,2,4],   true,  7, 16),
  el(117,'Ts', 'Tennessine',  294,       7, 5, 0,    'halogen',        [-1,1,3],   true,  7, 17),
  el(118,'Og', 'Oganesson',   294,       8, 0, 0,    'noble_gas',      [0],        false, 7, 18),
];

// Quick lookup by atomic number and symbol
export const BY_Z: Record<number, ChemElement> = {};
export const BY_SYM: Record<string, ChemElement> = {};
ELEMENTS.forEach(e => { BY_Z[e.z] = e; BY_SYM[e.sym] = e; });

// ═══════════════════════════════════════════════════════════════
// BONDING ENGINE — Determines if two elements CAN bond and HOW
// ═══════════════════════════════════════════════════════════════

export function getBondType(a: ChemElement, b: ChemElement): BondType {
  // Rule 1: Noble gases that can't bond → none
  if (!a.canBond || !b.canBond) return 'none';

  // Rule 2: Both noble gases → none (Xe-Kr compounds don't exist)
  if (a.category === 'noble_gas' && b.category === 'noble_gas') return 'none';

  // Rule 3: Noble gas + non-halogen (except O) → none
  // Xe only bonds with F and O; Kr only bonds with F
  if (a.category === 'noble_gas' || b.category === 'noble_gas') {
    const noble = a.category === 'noble_gas' ? a : b;
    const other = a.category === 'noble_gas' ? b : a;
    if (noble.sym === 'He' || noble.sym === 'Ne' || noble.sym === 'Ar') return 'none';
    if (noble.sym === 'Kr' && other.sym !== 'F') return 'none';
    if (noble.sym === 'Xe' && other.sym !== 'F' && other.sym !== 'O') return 'none';
    if (noble.sym === 'Rn' && other.sym !== 'F') return 'none';
  }

  // Rule 4: Two alkali metals → metallic (not covalent)
  if (a.category === 'alkali_metal' && b.category === 'alkali_metal') return 'metallic';

  // Rule 5: Both transition metals → metallic
  if (a.category === 'transition_metal' && b.category === 'transition_metal') return 'metallic';

  // Rule 6: Electronegativity difference determines bond type
  const enA = a.electronegativity || 1.5; // Default for unknowns
  const enB = b.electronegativity || 1.5;
  const delta = Math.abs(enA - enB);

  if (delta >= 1.7) return 'ionic';
  if (delta >= 0.5) return 'covalent_polar';
  return 'covalent_nonpolar';
}

/**
 * Can two elements bond at all?
 */
export function canBond(a: ChemElement, b: ChemElement): boolean {
  return getBondType(a, b) !== 'none';
}

/**
 * How many bonds can form between these two elements?
 * Returns 0 if they can't bond.
 */
export function maxBondsBetween(a: ChemElement, b: ChemElement): number {
  if (!canBond(a, b)) return 0;
  // Minimum of each element's remaining bond capacity
  return Math.min(a.maxBonds, b.maxBonds);
}

/**
 * Bond strength estimate (0-1) based on electronegativity compatibility
 */
export function bondStrength(a: ChemElement, b: ChemElement): number {
  if (!canBond(a, b)) return 0;
  const enA = a.electronegativity || 1.5;
  const enB = b.electronegativity || 1.5;
  const delta = Math.abs(enA - enB);
  // Ionic bonds (high delta) are strong; covalent (low delta) varies
  if (delta >= 1.7) return 0.85 + Math.min(delta - 1.7, 1) * 0.15;
  // Covalent: strength peaks around delta=0.5 (balanced sharing)
  return 0.3 + (1 - Math.abs(delta - 0.5) / 2) * 0.5;
}

// ═══════════════════════════════════════════════════════════════
// COMPRESSION FIELD — Maps elements onto node array grid
// ═══════════════════════════════════════════════════════════════

export interface CompressionNode {
  element: ChemElement;
  gridX: number;          // Position in compression grid
  gridY: number;
  bondSlots: number;      // 8 - valence = available bonding sites
  connections: number[];  // Indices of connected nodes
  primeGroup: number;     // Root prime — nodes with same prime resonate
}

/**
 * Build a compression field from a set of elements.
 * Maps them onto a grid where same-rootPrime elements cluster.
 * Empty grid slots = potential bonding sites.
 */
export function buildCompressionField(elements: ChemElement[], gridSize: number = 3): CompressionNode[] {
  const nodes: CompressionNode[] = [];

  // Group elements by root prime
  const primeGroups = new Map<number, ChemElement[]>();
  for (const el of elements) {
    const group = primeGroups.get(el.rootPrime) || [];
    group.push(el);
    primeGroups.set(el.rootPrime, group);
  }

  // Layout: each prime group gets a region of the grid
  let idx = 0;
  for (const [prime, group] of primeGroups) {
    for (const elem of group) {
      const gx = idx % gridSize;
      const gy = Math.floor(idx / gridSize);
      nodes.push({
        element: elem,
        gridX: gx,
        gridY: gy,
        bondSlots: Math.max(0, 8 - elem.valence), // Empty slots in 3x3 grid
        connections: [],
        primeGroup: prime,
      });
      idx++;
    }
  }

  // Auto-connect: find valid bonds between adjacent grid nodes
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = Math.abs(nodes[i].gridX - nodes[j].gridX);
      const dy = Math.abs(nodes[i].gridY - nodes[j].gridY);
      // Adjacent = within 1 step (including diagonal)
      if (dx <= 1 && dy <= 1 && canBond(nodes[i].element, nodes[j].element)) {
        // Check bond capacity
        if (nodes[i].connections.length < nodes[i].element.maxBonds &&
            nodes[j].connections.length < nodes[j].element.maxBonds) {
          nodes[i].connections.push(j);
          nodes[j].connections.push(i);
        }
      }
    }
  }

  return nodes;
}

/**
 * Prime resonance score: how well do elements in this field resonate
 * through their root prime connections?
 * Elements sharing a root prime transfer energy more efficiently.
 */
export function primeResonance(nodes: CompressionNode[]): number {
  if (nodes.length < 2) return 0;
  let resonant = 0;
  let total = 0;
  for (let i = 0; i < nodes.length; i++) {
    for (const j of nodes[i].connections) {
      total++;
      if (nodes[i].primeGroup === nodes[j].primeGroup) {
        resonant++;
      }
    }
  }
  return total > 0 ? resonant / total : 0;
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS FOR SIMULATION
// ═══════════════════════════════════════════════════════════════

/** Get all elements that can form bonds */
export const BONDABLE_ELEMENTS = ELEMENTS.filter(e => e.canBond);

/** Get noble gases (no bonding) */
export const NOBLE_GASES = ELEMENTS.filter(e => e.category === 'noble_gas');

/** Elements grouped by root prime */
export const BY_ROOT_PRIME: Record<number, ChemElement[]> = {};
ELEMENTS.forEach(e => {
  if (!BY_ROOT_PRIME[e.rootPrime]) BY_ROOT_PRIME[e.rootPrime] = [];
  BY_ROOT_PRIME[e.rootPrime].push(e);
});
