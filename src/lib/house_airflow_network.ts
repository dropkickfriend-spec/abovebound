export type AirflowNetworkVent = {
  id?: string;
  type: string;
  x: number;
  y: number;
  z: number;
  flowRate?: number;
  powered?: boolean;
};

export type AirflowNetworkRoom = {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  ceilingHeight: number;
  vents?: AirflowNetworkVent[];
};

export type SharedAirflowCavity = {
  id: string;
  roomAId: string;
  roomAName: string;
  roomBId: string;
  roomBName: string;
  orientation: 'x-wall' | 'y-wall';
  centerX: number;
  centerY: number;
  lengthM: number;
  heightM: number;
  heightDifferenceM: number;
  openTransfer: boolean;
  transferVentIds: string[];
};

export type AirflowVentRoute = {
  id: string;
  ventId: string;
  roomId: string;
  roomName: string;
  ventType: string;
  start: { x: number; y: number; z: number };
  end: { x: number; y: number; z: number };
  routeKind: 'roof-discharge' | 'exterior-wall' | 'shared-boundary' | 'room-supply';
  connectedRoomId?: string;
  requiresDuct: boolean;
};

export type HouseAirflowNetwork = {
  cavities: SharedAirflowCavity[];
  ventRoutes: AirflowVentRoute[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number; maxCeilingHeight: number };
};

const TOUCH_TOLERANCE_M = 0.04;
const MIN_SHARED_LENGTH_M = 0.2;

const overlap = (a0: number, a1: number, b0: number, b1: number) => {
  const start = Math.max(Math.min(a0, a1), Math.min(b0, b1));
  const end = Math.min(Math.max(a0, a1), Math.max(b0, b1));
  return { start, end, length: Math.max(0, end - start) };
};

const ventId = (roomId: string, vent: AirflowNetworkVent, index: number) => vent.id || `${roomId}-${vent.type}-${index}`;

const ventTouchesCavity = (vent: AirflowNetworkVent, cavity: SharedAirflowCavity) => {
  if (vent.type !== 'transfer') return false;
  if (cavity.orientation === 'x-wall') {
    return Math.abs(vent.x - cavity.centerX) <= 0.55
      && Math.abs(vent.y - cavity.centerY) <= cavity.lengthM / 2 + 0.1;
  }
  return Math.abs(vent.y - cavity.centerY) <= 0.55
    && Math.abs(vent.x - cavity.centerX) <= cavity.lengthM / 2 + 0.1;
};

export function inferSharedAirflowCavities(rooms: AirflowNetworkRoom[]): SharedAirflowCavity[] {
  const cavities: SharedAirflowCavity[] = [];
  for (let first = 0; first < rooms.length; first += 1) {
    for (let second = first + 1; second < rooms.length; second += 1) {
      const roomA = rooms[first];
      const roomB = rooms[second];
      const verticalOverlap = overlap(roomA.y, roomA.y + roomA.height, roomB.y, roomB.y + roomB.height);
      const horizontalOverlap = overlap(roomA.x, roomA.x + roomA.width, roomB.x, roomB.x + roomB.width);
      let cavity: SharedAirflowCavity | null = null;

      if (verticalOverlap.length >= MIN_SHARED_LENGTH_M) {
        const aRightBLeft = Math.abs(roomA.x + roomA.width - roomB.x) <= TOUCH_TOLERANCE_M;
        const bRightALeft = Math.abs(roomB.x + roomB.width - roomA.x) <= TOUCH_TOLERANCE_M;
        if (aRightBLeft || bRightALeft) {
          cavity = {
            id: [roomA.id, roomB.id].sort().join('--'),
            roomAId: roomA.id,
            roomAName: roomA.name,
            roomBId: roomB.id,
            roomBName: roomB.name,
            orientation: 'x-wall',
            centerX: aRightBLeft ? roomA.x + roomA.width : roomB.x + roomB.width,
            centerY: (verticalOverlap.start + verticalOverlap.end) / 2,
            lengthM: verticalOverlap.length,
            heightM: Math.min(roomA.ceilingHeight, roomB.ceilingHeight),
            heightDifferenceM: Math.abs(roomA.ceilingHeight - roomB.ceilingHeight),
            openTransfer: false,
            transferVentIds: [],
          };
        }
      }

      if (!cavity && horizontalOverlap.length >= MIN_SHARED_LENGTH_M) {
        const aBottomBTop = Math.abs(roomA.y + roomA.height - roomB.y) <= TOUCH_TOLERANCE_M;
        const bBottomATop = Math.abs(roomB.y + roomB.height - roomA.y) <= TOUCH_TOLERANCE_M;
        if (aBottomBTop || bBottomATop) {
          cavity = {
            id: [roomA.id, roomB.id].sort().join('--'),
            roomAId: roomA.id,
            roomAName: roomA.name,
            roomBId: roomB.id,
            roomBName: roomB.name,
            orientation: 'y-wall',
            centerX: (horizontalOverlap.start + horizontalOverlap.end) / 2,
            centerY: aBottomBTop ? roomA.y + roomA.height : roomB.y + roomB.height,
            lengthM: horizontalOverlap.length,
            heightM: Math.min(roomA.ceilingHeight, roomB.ceilingHeight),
            heightDifferenceM: Math.abs(roomA.ceilingHeight - roomB.ceilingHeight),
            openTransfer: false,
            transferVentIds: [],
          };
        }
      }

      if (cavity) {
        const transferVentIds = [roomA, roomB].flatMap(room => (room.vents || [])
          .map((vent, index) => ({ vent, id: ventId(room.id, vent, index) }))
          .filter(item => ventTouchesCavity(item.vent, cavity as SharedAirflowCavity))
          .map(item => item.id));
        cavity.transferVentIds = transferVentIds;
        cavity.openTransfer = transferVentIds.length > 0;
        cavities.push(cavity);
      }
    }
  }
  return cavities;
}

const nearestRoomEdge = (room: AirflowNetworkRoom, vent: AirflowNetworkVent) => {
  const candidates = [
    { edge: 'left' as const, distance: Math.abs(vent.x - room.x), x: room.x, y: vent.y, dx: -1, dy: 0 },
    { edge: 'right' as const, distance: Math.abs(vent.x - (room.x + room.width)), x: room.x + room.width, y: vent.y, dx: 1, dy: 0 },
    { edge: 'top' as const, distance: Math.abs(vent.y - room.y), x: vent.x, y: room.y, dx: 0, dy: -1 },
    { edge: 'bottom' as const, distance: Math.abs(vent.y - (room.y + room.height)), x: vent.x, y: room.y + room.height, dx: 0, dy: 1 },
  ];
  return candidates.sort((a, b) => a.distance - b.distance)[0];
};

const cavityAtEdge = (roomId: string, x: number, y: number, cavities: SharedAirflowCavity[]) => cavities.find(cavity => {
  if (cavity.roomAId !== roomId && cavity.roomBId !== roomId) return false;
  if (cavity.orientation === 'x-wall') {
    return Math.abs(x - cavity.centerX) <= 0.08 && Math.abs(y - cavity.centerY) <= cavity.lengthM / 2 + 0.08;
  }
  return Math.abs(y - cavity.centerY) <= 0.08 && Math.abs(x - cavity.centerX) <= cavity.lengthM / 2 + 0.08;
});

export function inferHouseAirflowNetwork(rooms: AirflowNetworkRoom[]): HouseAirflowNetwork {
  const safeRooms = rooms.filter(room => Number.isFinite(room.x) && Number.isFinite(room.y)
    && room.width > 0 && room.height > 0 && room.ceilingHeight > 0);
  const cavities = inferSharedAirflowCavities(safeRooms);
  const minX = safeRooms.length ? Math.min(...safeRooms.map(room => room.x)) : 0;
  const minY = safeRooms.length ? Math.min(...safeRooms.map(room => room.y)) : 0;
  const maxX = safeRooms.length ? Math.max(...safeRooms.map(room => room.x + room.width)) : 1;
  const maxY = safeRooms.length ? Math.max(...safeRooms.map(room => room.y + room.height)) : 1;
  const maxCeilingHeight = safeRooms.length ? Math.max(...safeRooms.map(room => room.ceilingHeight)) : 2.7;
  const ventRoutes: AirflowVentRoute[] = [];

  safeRooms.forEach(room => (room.vents || []).forEach((vent, index) => {
    const id = ventId(room.id, vent, index);
    const start = { x: vent.x, y: vent.y, z: Math.max(0.05, Math.min(room.ceilingHeight, vent.z || 0.05)) };
    if (vent.type === 'exhaust' && start.z >= room.ceilingHeight * 0.66) {
      ventRoutes.push({
        id: `${room.id}-${id}-roof`, ventId: id, roomId: room.id, roomName: room.name, ventType: vent.type,
        start,
        end: { x: start.x, y: start.y, z: maxCeilingHeight + 1.15 },
        routeKind: 'roof-discharge', requiresDuct: true,
      });
      return;
    }

    const edge = nearestRoomEdge(room, vent);
    const cavity = cavityAtEdge(room.id, edge.x, edge.y, cavities);
    const connectedRoomId = cavity
      ? (cavity.roomAId === room.id ? cavity.roomBId : cavity.roomAId)
      : undefined;
    const isSupply = vent.type === 'intake' || vent.type === 'heat_recovery';
    const routeKind: AirflowVentRoute['routeKind'] = isSupply
      ? 'room-supply'
      : cavity ? 'shared-boundary' : 'exterior-wall';
    ventRoutes.push({
      id: `${room.id}-${id}-route`, ventId: id, roomId: room.id, roomName: room.name, ventType: vent.type,
      start,
      end: isSupply
        ? { ...start }
        : { x: edge.x + edge.dx * 0.9, y: edge.y + edge.dy * 0.9, z: start.z },
      routeKind,
      connectedRoomId,
      requiresDuct: vent.type === 'exhaust' && routeKind !== 'exterior-wall',
    });
  }));

  return {
    cavities,
    ventRoutes,
    bounds: { minX, minY, maxX, maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY), maxCeilingHeight },
  };
}
