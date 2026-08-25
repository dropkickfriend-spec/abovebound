import assert from 'node:assert/strict';
import { inferHouseAirflowNetwork, type AirflowNetworkRoom } from '../src/lib/house_airflow_network';

const rooms: AirflowNetworkRoom[] = [
  {
    id: 'living', name: 'Living', x: 0, y: 0, width: 6, height: 5, ceilingHeight: 2.7,
    vents: [
      { id: 'living-in', type: 'intake', x: 0.2, y: 2, z: 0.2 },
      { id: 'living-out', type: 'exhaust', x: 5.5, y: 2.5, z: 2.5 },
    ],
  },
  {
    id: 'kitchen', name: 'Kitchen', x: 6, y: 0, width: 4, height: 5, ceilingHeight: 3,
    vents: [{ id: 'kitchen-out', type: 'exhaust', x: 9, y: 2.5, z: 2.8 }],
  },
  {
    id: 'bed', name: 'Bedroom', x: 0, y: 5, width: 6, height: 4, ceilingHeight: 2.4,
    vents: [{ id: 'bed-transfer', type: 'transfer', x: 3, y: 5.1, z: 1.2 }],
  },
];

const network = inferHouseAirflowNetwork(rooms);
assert.equal(network.bounds.width, 10);
assert.equal(network.bounds.height, 9);
assert.equal(network.bounds.maxCeilingHeight, 3);
assert.equal(network.cavities.length, 2, 'touching room edges should become shared wall cavity candidates');

const livingBedroom = network.cavities.find(cavity => cavity.roomAId === 'living' && cavity.roomBId === 'bed');
assert.ok(livingBedroom, 'living/bedroom shared wall should be detected');
assert.equal(livingBedroom.openTransfer, true, 'a transfer vent on the shared wall should mark the connection open');
assert.equal(livingBedroom.lengthM, 6);

const livingKitchen = network.cavities.find(cavity => cavity.roomAId === 'living' && cavity.roomBId === 'kitchen');
assert.ok(livingKitchen);
assert.equal(livingKitchen.openTransfer, false, 'touching walls are not assumed open without a transfer vent');
assert.ok(Math.abs(livingKitchen.heightDifferenceM - 0.3) < 1e-9);

const roofRoutes = network.ventRoutes.filter(route => route.routeKind === 'roof-discharge');
assert.equal(roofRoutes.length, 2, 'high exhausts should receive explicit proposed roof discharge routes');
assert.ok(roofRoutes.every(route => route.requiresDuct), 'the visual must not imply that a simulated vent proves a real duct exists');
assert.ok(network.ventRoutes.some(route => route.routeKind === 'room-supply'));

console.log(`House airflow network smoke passed: ${network.cavities.length} cavities, ${roofRoutes.length} proposed roof routes.`);
