import { memoryFetch } from './anonymous_memory';

export interface Ball {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  winding: number;
  faceIdx?: number;
  groupId?: number;
  r?: number;
}

export const SimState = {
  _saveTimers: {} as Record<string, any>,
  
  save: function(namespace: string, balls: Ball[]) {
    clearTimeout(this._saveTimers[namespace]);
    this._saveTimers[namespace] = setTimeout(async () => {
      try {
        const payload = balls.map(b => ({
          x: parseFloat(b.x.toFixed(3)),
          y: parseFloat(b.y.toFixed(3)),
          z: parseFloat((b.z || 0).toFixed(3)),
          vx: parseFloat(b.vx.toFixed(4)),
          vy: parseFloat(b.vy.toFixed(4)),
          vz: parseFloat((b.vz || 0).toFixed(4)),
          winding: parseFloat((b.winding || 0).toFixed(4)),
          faceIdx: b.faceIdx || 0,
          groupId: b.groupId || 0,
          r: b.r || 0
        }));
        
        await memoryFetch(`/api/sim-state/${namespace}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: { balls: payload, _ts: Date.now() } })
        });
      } catch (e) {
        console.warn('[SimState] Save failed:', namespace, e);
      }
    }, 5000);
  },
  
  load: async function(namespace: string): Promise<Ball[] | null> {
    try {
      const res = await memoryFetch(`/api/sim-state/${namespace}`);
      const data = await res.json();
        
      if (data && data.balls?.length > 0) {
        console.log('[SimState] Loaded ' + data.balls.length + ' balls for ' + namespace);
        return data.balls;
      }
    } catch (e) {
      console.warn('[SimState] Load failed:', namespace, e);
    }
    return null;
  }
};

export const GenesisBrain = {
  ws: null as WebSocket | null,
  padNodes: [] as any[],
  serverBalls: [] as any[],
  telemetry: {
    isConnected: false,
    readCount: 0,
    writeCount: 0,
    lastReadAt: null as number | null,
    lastWriteAt: null as number | null,
    lastError: null as string | null
  },
  telemetryHistory: [] as any[],
  discoveryLog: [] as string[],
  serverNodes: [
    { id: 'abovebound.org', status: 'synced', latency: '2ms', load: 0.12 },
    { id: 'node-alpha.xyz', status: 'synced', latency: '5ms', load: 0.08 },
    { id: 'node-beta.xyz', status: 'connecting', latency: '--', load: 0.00 }
  ],
  baseSystem: 10,
  
  callbacks: {} as Record<string, (payload: any) => void>,
  _sim3WriteTimer: null as any,
  _bandStateCache: null as any,
  _reconnectTimer: null as ReturnType<typeof setTimeout> | null,
  _shouldReconnect: false,

  generateComplexInsight: function() {
    const insights = [
      `Detected 5-bit phase shift in FM carrier. Re-routing through ${this.serverNodes[0].id} for optimal temporal sync.`,
      "Novelty-Entropy injection successful across 3 server nodes. Entropy levels at 0.82.",
      "Gyroid Lattice topology optimized for thermal dissipation in extreme spaceship gradients.",
      "Magnetocaloric flux lines aligned with structural membrane. Zero-power cooling active.",
      "CO2 expansion chamber pressure stabilized. Cooling gain: 4.2kW.",
      "Stubby Cooler battery discharge rate optimized for 5-bit quinary sync.",
      "Esky recirculation pump achieving 3.5 COP via nested material flow channels.",
      "Surface safety limit verified: 45°C max threshold maintained under full battery load.",
      `Base-${this.baseSystem} optimization task converged. Brute-forcing flow randomness.`,
      "Fractal node placement completed. Signal reflection minimized in 5-bit blockchain.",
      "Temporal frequency shift detected in throttled environment. Distributed ledger validated.",
      "1-bit novelty brute force algorithm upgraded to 5-bit quinary logic.",
      "Structural thermodynamics eliminating active battery dependency for spaceship membrane."
    ];
    const insight = insights[Math.floor(Math.random() * insights.length)];
    this.discoveryLog.push(`[${new Date().toLocaleTimeString()}] ${insight}`);
    if (this.discoveryLog.length > 20) this.discoveryLog.shift();
  },

  _insightInterval: null as any,
  
  connect: function() {
    this._shouldReconnect = true;
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (!this._insightInterval) {
      this._insightInterval = setInterval(() => this.generateComplexInsight(), 8000);
    }
    
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      console.log('[GenesisBrain] Connecting to:', wsUrl);
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        this.telemetry.isConnected = true;
        console.log('[GenesisBrain] ONLINE (Custom WebSocket)');
        this.logTelemetry('connection', { status: 'connected' });
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          const { event: ev, payload } = message;
          
          this.logTelemetry(ev, payload);
          
          if (ev === 'sim_draw') {
            if (!payload?.node) return;
            if (payload.source === 'gen_bot') {
              this.serverBalls.push(payload.node);
              if (this.serverBalls.length > 250) this.serverBalls.shift();
            } else {
              this.padNodes.push(payload.node);
              if (this.padNodes.length > 500) this.padNodes.shift();
            }
          } else if (ev === 'band_state') {
            this._bandStateCache = payload;
            if (this.callbacks.onBandState) this.callbacks.onBandState(payload);
          } else if (ev === 'sim3_state') {
            if (this.callbacks.onSim3State) this.callbacks.onSim3State(payload);
          }
          
          this.telemetry.readCount++;
          this.telemetry.lastReadAt = Date.now();
        } catch (e) {
          console.error('[GenesisBrain] WS Parse Error:', e);
        }
      };

      this.ws.onclose = () => {
        this.telemetry.isConnected = false;
        console.log('[GenesisBrain] OFFLINE');
        this.logTelemetry('connection', { status: 'disconnected' });
        this.ws = null;
        if (this._shouldReconnect) {
          this._reconnectTimer = setTimeout(() => this.connect(), 3000);
        }
      };

      this.ws.onerror = (e) => {
        this.telemetry.lastError = 'WS Error';
        if (this._shouldReconnect) console.error('[GenesisBrain] WS Error:', e);
      };
        
      this.loadInitialData();
      
    } catch (e) {
      this.telemetry.lastError = String(e);
      console.error('[GenesisBrain] Error:', e);
    }
  },

  disconnect: function() {
    this._shouldReconnect = false;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._insightInterval) {
      clearInterval(this._insightInterval);
      this._insightInterval = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.close();
      this.ws = null;
    }
  },

  broadcast: function(event: string, payload: any) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ event, payload }));
    this.logTelemetry('broadcast:' + event, payload);
    this.telemetry.writeCount++;
    this.telemetry.lastWriteAt = Date.now();
  },

  logTelemetry: function(event: string, payload: any) {
    this.telemetryHistory.push({
      timestamp: Date.now(),
      event,
      payload
    });
    if (this.telemetryHistory.length > 50) this.telemetryHistory.shift();
  },
  
  loadInitialData: async function() {
    // Load server_brain
    const serverData = await SimState.load('server_brain');
    if (serverData) {
      this.serverBalls = serverData;
      console.log('[GenesisBrain] Initialized ' + this.serverBalls.length + ' server balls');
    }
    
    // Load band state
    const bandData = await SimState.load('band');
    if (bandData) {
      this._bandStateCache = bandData;
      if (this.callbacks.onBandState) this.callbacks.onBandState(bandData);
    }
  },

  writeDraw: function(nodeData: any) {
    this.broadcast('sim_draw', { node: nodeData, source: 'client' });
  },

  on: function(event: string, callback: (payload: any) => void) {
    this.callbacks[event] = callback;
    return this;
  }
};
