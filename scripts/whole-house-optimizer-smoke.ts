import { optimizeWholeHouseSystem } from '../src/lib/whole_house_optimizer';

const rooms = [
  { id: 'living', name: 'Living Area', x: 0, y: 0, width: 5.5, height: 4.5, ceilingHeight: 2.7, internalLoad: 720 },
  { id: 'kitchen', name: 'Kitchen', x: 5.5, y: 0, width: 3.2, height: 4.5, ceilingHeight: 2.7, internalLoad: 1100 },
  { id: 'bed', name: 'Bedroom', x: 0, y: 4.5, width: 4.2, height: 3.8, ceilingHeight: 2.9, internalLoad: 260 },
  { id: 'bath', name: 'Bathroom', x: 4.2, y: 4.5, width: 2.4, height: 3.8, ceilingHeight: 2.7, internalLoad: 430 },
  { id: 'study', name: 'Study', x: 6.6, y: 4.5, width: 2.1, height: 3.8, ceilingHeight: 2.7, internalLoad: 390 },
];

const input = {
  rooms,
  location: {
    name: 'Bendigo test', latitudeDeg: -36.76, longitudeDeg: 144.28,
    averageDailySolarMJm2: 17.2, summerDesignTempC: 40, winterDesignTempC: 1,
    heatingDegreeDays: 1700, coolingDegreeDays: 360,
  },
  maximumCandidates: 576,
};
const first = optimizeWholeHouseSystem(input);
const second = optimizeWholeHouseSystem(input);

if (first.candidatesEvaluated < 400) throw new Error('Expected a broad automatic configuration sweep.');
if (first.archetypeComparisons.length !== 4) throw new Error('Expected detached, terrace and apartment comparisons.');
if (!first.best.rooms.every(room => Math.abs(room.massBalanceResidualLs) < 0.1)) throw new Error('Pressure network is not mass balanced.');
if (JSON.stringify(first.best) !== JSON.stringify(second.best)) throw new Error('Optimizer must be deterministic for remembered computations.');
if (!Number.isFinite(first.best.totalLifecycleEnergyKWh) || first.best.totalLifecycleEnergyKWh <= 0) throw new Error('Lifecycle energy is invalid.');

console.log(JSON.stringify({
  candidates: first.candidatesEvaluated,
  winner: first.best.configuration,
  lifecycleSavedPercent: first.improvement.lifecycleEnergySavedPercent,
  apartments: first.archetypeComparisons,
}, null, 2));
