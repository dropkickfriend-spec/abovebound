import express, { type NextFunction, type Request, type Response } from "express";
import "dotenv/config";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import fs from "fs";
import { BlueprintGenerator } from "./src/lib/blueprint";
import { calcHouseHeatLoss } from "./src/lib/house_thermal";
import { runExistingHomeAutopilot } from "./src/lib/existing_home_autopilot";
import { optimizeHvacCycle, type HvacCycleStrategy } from "./src/lib/hvac_cycle_optimizer";
import { discoverAdaptiveWall, type AdaptiveWallStrategy } from "./src/lib/adaptive_wall_optimizer";
import { optimizeRoomLifecycle } from "./src/lib/room_lifecycle_optimizer";
import { optimizeSiteGeometry, type SiteHouseDesign } from "./src/lib/site_geometry_optimizer";
import { optimizeWholeHouseSystem } from "./src/lib/whole_house_optimizer";
import { runBuildingPhysicsValidation, type BuildingPhysicsValidationReport } from "./src/lib/building_physics_validation";
import { buildAutomaticSiteContext, makeSiteContextCacheKey, type GeoJsonFeatureCollection } from "./src/lib/site_context";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(process.env.DATA_DIR || __dirname);
const MEMORY_FILE = path.join(DATA_DIR, "discovery_memory.json");
const SITE_CONTEXT_DIR = path.join(DATA_DIR, "site-context");
const BUNDLED_SITE_CONTEXT_DIR = path.join(__dirname, "site-context-cache");
const MAX_MEMORY_NODES = 2048;
const MAX_DISCOVERY_LOG = 500;
const MAX_ANONYMOUS_WORKSPACES = 5000;
const MAX_WORKSPACE_RECORDS = 250;
const MAX_SITE_LEARNING_RECORDS = 5000;
const MAX_RETROFIT_LEARNING_RECORDS = 5000;
const MAX_HVAC_CYCLE_LEARNING_RECORDS = 5000;
const MAX_ADAPTIVE_WALL_LEARNING_RECORDS = 5000;

interface WorkspaceRecord {
  id: string;
  type: string;
  category?: string;
  version?: string;
  summary?: string;
  stats?: unknown;
  state?: unknown;
  timestamp: number;
}

interface AnonymousWorkspace {
  createdAt: number;
  updatedAt: number;
  simStates: Record<string, unknown>;
  records: WorkspaceRecord[];
}

interface SiteLearningRecord {
  latitudeBand: number;
  heatingDegreeDays: number;
  coolingDegreeDays: number;
  floorAreaM2: number;
  design: SiteHouseDesign;
  lifecycleEnergySavedPercent: number;
  timestamp: number;
}

interface RetrofitLearningRecord {
  latitudeBand: number;
  heatingDegreeDays: number;
  coolingDegreeDays: number;
  winningMeasures: string[];
  robustPassPercent: number;
  lifecycleEnergySavedPercent: number;
  timestamp: number;
}

interface HvacCycleLearningRecord {
  mode: 'heating' | 'cooling';
  volumeBandM3: number;
  envelopeBandWPerK: number;
  strategy: HvacCycleStrategy;
  electricalSavedPercent: number;
  timestamp: number;
}

interface AdaptiveWallLearningRecord {
  mode: 'heating' | 'cooling';
  wallAreaBandM2: number;
  climateDeltaBandC: number;
  strategy: AdaptiveWallStrategy;
  electricalSavedPercent: number;
  timestamp: number;
}

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(SITE_CONTEXT_DIR, { recursive: true });

const readGeoJsonIfPresent = (filePath: string): GeoJsonFeatureCollection | null => {
  try {
    if (!fs.existsSync(filePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return parsed && Array.isArray(parsed.features) ? parsed as GeoJsonFeatureCollection : null;
  } catch (error) {
    console.warn(`Ignoring invalid site-context cache ${filePath}:`, error instanceof Error ? error.message : error);
    return null;
  }
};

const cachedGeoJsonForLocation = (latitudeDeg: number, longitudeDeg: number) => {
  const cacheKey = makeSiteContextCacheKey(latitudeDeg, longitudeDeg);
  return readGeoJsonIfPresent(path.join(SITE_CONTEXT_DIR, `${cacheKey}.geojson`))
    || readGeoJsonIfPresent(path.join(BUNDLED_SITE_CONTEXT_DIR, `${cacheKey}.geojson`));
};

let physicsValidationCache: BuildingPhysicsValidationReport | null = null;

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const PORT = Number(process.env.PORT) || 3000;

  app.disable("x-powered-by");
  if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
  }
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(self)");
    next();
  });

  const createRateLimiter = (limit: number, windowMs: number) => {
    const buckets = new Map<string, { count: number; resetAt: number }>();
    return (req: Request, res: Response, next: NextFunction) => {
      const now = Date.now();
      const key = req.ip || req.socket.remoteAddress || "unknown";
      let bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= now) {
        bucket = { count: 0, resetAt: now + windowMs };
        buckets.set(key, bucket);
      }

      bucket.count += 1;
      res.setHeader("RateLimit-Limit", String(limit));
      res.setHeader("RateLimit-Remaining", String(Math.max(0, limit - bucket.count)));
      res.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

      if (bucket.count > limit) {
        return res.status(429).json({ error: "Too many requests. Please try again shortly." });
      }

      if (buckets.size > 10000) {
        for (const [bucketKey, value] of buckets) {
          if (value.resetAt <= now) buckets.delete(bucketKey);
        }
      }
      next();
    };
  };

  const mutationRateLimit = createRateLimiter(
    Number(process.env.API_MUTATION_RATE_LIMIT) || 120,
    60_000,
  );

  const blueprintGen = new BlueprintGenerator();

  // --- Deep Learning Memory & Discovery (Persistent) ---
  let simMemory: Map<string, { complexity: number; timestamp: number; config: any }> = new Map();
  let discoveryLog: { event: string; payload: any; timestamp: number }[] = [];
  let complexityCounter = 0;
  const simStates: Record<string, any> = {};
  const anonymousWorkspaces: Record<string, AnonymousWorkspace> = {};
  let siteLearningRecords: SiteLearningRecord[] = [];
  let retrofitLearningRecords: RetrofitLearningRecord[] = [];
  let hvacCycleLearningRecords: HvacCycleLearningRecord[] = [];
  let adaptiveWallLearningRecords: AdaptiveWallLearningRecord[] = [];

  // Load from disk if exists
  if (fs.existsSync(MEMORY_FILE)) {
    try {
      const content = fs.readFileSync(MEMORY_FILE, "utf-8").trim();
      if (content) {
        const saved = JSON.parse(content);
        const memoryEntries = Object.entries(saved.memory || {}) as [string, { timestamp?: number }][];
        memoryEntries.sort((a, b) => (a[1]?.timestamp || 0) - (b[1]?.timestamp || 0));
        simMemory = new Map(memoryEntries.slice(-MAX_MEMORY_NODES) as any);
        discoveryLog = (saved.log || []).slice(-MAX_DISCOVERY_LOG);
        complexityCounter = saved.counter || 0;
        Object.assign(simStates, saved.simStates || {});
        Object.assign(anonymousWorkspaces, saved.anonymousWorkspaces || {});
        siteLearningRecords = (saved.siteLearningRecords || []).slice(-MAX_SITE_LEARNING_RECORDS);
        retrofitLearningRecords = (saved.retrofitLearningRecords || []).slice(-MAX_RETROFIT_LEARNING_RECORDS);
        hvacCycleLearningRecords = (saved.hvacCycleLearningRecords || []).slice(-MAX_HVAC_CYCLE_LEARNING_RECORDS);
        adaptiveWallLearningRecords = (saved.adaptiveWallLearningRecords || []).slice(-MAX_ADAPTIVE_WALL_LEARNING_RECORDS);
        console.log(`[Discovery] Loaded ${simMemory.size} memory nodes from disk.`);
      }
    } catch (e) {
      console.error("[Discovery] Failed to load memory:", e);
    }
  }

  const rememberState = (
    stateHash: string,
    value: { complexity: number; timestamp: number; config: any },
  ) => {
    if (!simMemory.has(stateHash)) {
      while (simMemory.size >= MAX_MEMORY_NODES) {
        const oldestKey = simMemory.keys().next().value;
        if (oldestKey === undefined) break;
        simMemory.delete(oldestKey);
      }
    }
    simMemory.set(stateHash, value);
  };

  const appendDiscovery = (entry: { event: string; payload: any; timestamp: number }) => {
    discoveryLog.push(entry);
    if (discoveryLog.length > MAX_DISCOVERY_LOG) {
      discoveryLog.splice(0, discoveryLog.length - MAX_DISCOVERY_LOG);
    }
  };

  const workspaceIdFor = (req: Request) => {
    const value = req.header("X-AboveBound-Workspace") || "";
    return /^ab_[a-zA-Z0-9_-]{12,80}$/.test(value) ? value : "legacy_shared";
  };

  const workspaceFor = (req: Request) => {
    const id = workspaceIdFor(req);
    const now = Date.now();
    if (!anonymousWorkspaces[id]) {
      if (Object.keys(anonymousWorkspaces).length >= MAX_ANONYMOUS_WORKSPACES) {
        const oldest = Object.entries(anonymousWorkspaces)
          .sort((a, b) => a[1].updatedAt - b[1].updatedAt)[0]?.[0];
        if (oldest) delete anonymousWorkspaces[oldest];
      }
      anonymousWorkspaces[id] = { createdAt: now, updatedAt: now, simStates: {}, records: [] };
    }
    anonymousWorkspaces[id].updatedAt = now;
    return anonymousWorkspaces[id];
  };

  const boundedJsonValue = (value: unknown, maxBytes = 96_000) => {
    if (value === undefined) return undefined;
    const encoded = JSON.stringify(value);
    if (Buffer.byteLength(encoded, "utf8") > maxBytes) {
      return { truncated: true, sizeBytes: Buffer.byteLength(encoded, "utf8") };
    }
    return JSON.parse(encoded);
  };

  const appendWorkspaceRecord = (
    workspace: AnonymousWorkspace,
    record: Omit<WorkspaceRecord, "id" | "timestamp">,
  ) => {
    const timestamp = Date.now();
    workspace.records.push({
      id: `cmp_${timestamp.toString(36)}_${Math.random().toString(36).slice(2, 9)}`,
      type: String(record.type || "computation").slice(0, 64),
      category: record.category ? String(record.category).slice(0, 64) : undefined,
      version: record.version ? String(record.version).slice(0, 32) : undefined,
      summary: record.summary ? String(record.summary).slice(0, 500) : undefined,
      stats: boundedJsonValue(record.stats),
      state: boundedJsonValue(record.state),
      timestamp,
    });
    if (workspace.records.length > MAX_WORKSPACE_RECORDS) {
      workspace.records.splice(0, workspace.records.length - MAX_WORKSPACE_RECORDS);
    }
    workspace.updatedAt = timestamp;
  };

  let saveTimeout: NodeJS.Timeout | null = null;
  const persistToDisk = () => {
    while (simMemory.size > MAX_MEMORY_NODES) {
      const oldestKey = simMemory.keys().next().value;
      if (oldestKey === undefined) break;
      simMemory.delete(oldestKey);
    }
    if (discoveryLog.length > MAX_DISCOVERY_LOG) {
      discoveryLog.splice(0, discoveryLog.length - MAX_DISCOVERY_LOG);
    }
    siteLearningRecords = siteLearningRecords.slice(-MAX_SITE_LEARNING_RECORDS);
    retrofitLearningRecords = retrofitLearningRecords.slice(-MAX_RETROFIT_LEARNING_RECORDS);
    hvacCycleLearningRecords = hvacCycleLearningRecords.slice(-MAX_HVAC_CYCLE_LEARNING_RECORDS);
    adaptiveWallLearningRecords = adaptiveWallLearningRecords.slice(-MAX_ADAPTIVE_WALL_LEARNING_RECORDS);

    const data = {
      memory: Object.fromEntries(simMemory),
      log: discoveryLog,
      counter: complexityCounter,
      simStates,
      anonymousWorkspaces,
      siteLearningRecords,
      retrofitLearningRecords,
      hvacCycleLearningRecords,
      adaptiveWallLearningRecords,
    };
    const temporaryFile = `${MEMORY_FILE}.tmp`;
    fs.writeFileSync(temporaryFile, JSON.stringify(data));
    fs.renameSync(temporaryFile, MEMORY_FILE);
  };

  const saveToDisk = () => {
    if (saveTimeout) return;
    saveTimeout = setTimeout(() => {
      saveTimeout = null;
      try {
        persistToDisk();
      } catch (e) {
        console.error("[Discovery] Failed to save memory:", e);
      }
    }, 2000); // Debounce saves to every 2 seconds
  };

  app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "2mb" }));
  app.use("/api", (req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
      return next();
    }
    return mutationRateLimit(req, res, next);
  });

  // --- WebSocket Server for Real-time Sync ---
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: Number(process.env.WS_MAX_PAYLOAD_BYTES) || 1_048_576,
  });
  const clients = new Set<WebSocket>();

  wss.on("connection", (ws) => {
    clients.add(ws);
    (ws as any).isAlive = true;
    console.log("[GenesisBrain] Client connected. Total:", clients.size);

    ws.on("pong", () => {
      (ws as any).isAlive = true;
    });

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        // Broadcast to all other clients
        clients.forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
          }
        });

        // Log discovery events
        if (message.event === "sim_draw" || message.event === "discovery") {
          appendDiscovery({ 
            event: message.event, 
            payload: message.payload, 
            timestamp: Date.now() 
          });
          saveToDisk();
        }
      } catch (e) {
        console.error("WS Message Error:", e);
      }
    });

    ws.on("close", () => {
      clients.delete(ws);
      console.log("[GenesisBrain] Client disconnected. Total:", clients.size);
    });
  });

  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach((ws: any) => {
      if (ws.isAlive === false) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  httpServer.on("close", () => {
    clearInterval(heartbeatInterval);
  });

  // API: Save Simulation State
  app.post("/api/sim-state/:version", (req, res) => {
    const { version } = req.params;
    const { state } = req.body;
    if (state === undefined || state === null) {
      return res.status(400).json({ error: "A simulation state is required." });
    }
    const workspace = workspaceFor(req);
    workspace.simStates[version] = boundedJsonValue(state, 1_500_000);
    appendWorkspaceRecord(workspace, {
      type: "simulation_checkpoint",
      category: "simulation",
      version,
      summary: `Automatic ${version.toUpperCase()} simulation checkpoint`,
    });
    saveToDisk();
    res.json({ status: "saved", version, mode: "anonymous_first_party" });
  });

  // API: Load Simulation State
  app.get("/api/sim-state/:version", (req, res) => {
    const { version } = req.params;
    const workspace = workspaceFor(req);
    res.json(workspace.simStates[version] ?? null);
  });

  app.get("/api/workspace", (req, res) => {
    const workspace = workspaceFor(req);
    res.json({
      mode: "anonymous_first_party",
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
      recordCount: workspace.records.length,
      records: workspace.records.slice(-100).reverse(),
      savedVersions: Object.keys(workspace.simStates),
      sharedLearningRecords: siteLearningRecords.length + retrofitLearningRecords.length + hvacCycleLearningRecords.length + adaptiveWallLearningRecords.length,
    });
  });

  app.post("/api/workspace/events", (req, res) => {
    const workspace = workspaceFor(req);
    appendWorkspaceRecord(workspace, {
      type: req.body?.type,
      category: req.body?.category,
      version: req.body?.version,
      summary: req.body?.summary,
      stats: req.body?.stats,
      state: req.body?.state,
    });
    saveToDisk();
    res.json({ status: "remembered", recordCount: workspace.records.length });
  });

  // API: Novelty Check & Discovery
  app.post("/api/novelty-check", (req, res) => {
    const { stateHash, config } = req.body;
    const workspace = workspaceFor(req);
    if (typeof stateHash !== 'string' || stateHash.length === 0) {
      return res.status(400).json({ error: "stateHash must be a non-empty string." });
    }
    if (simMemory.has(stateHash)) {
      res.json({
        unique: false,
        complexity: simMemory.get(stateHash)?.complexity || complexityCounter,
        memorySize: simMemory.size,
        message: "State already explored. Iterating...",
      });
    } else {
      complexityCounter = Math.floor(simMemory.size * 1.5) + 1;
      const noveltyRatio = simMemory.size > 0 ? 1 / (1 + Math.log(simMemory.size)) : 1;
      rememberState(stateHash, {
        complexity: complexityCounter,
        timestamp: Date.now(),
        config: config || {}
      });
      appendDiscovery({
        event: 'novelty_discovery',
        payload: { complexity: complexityCounter, novelty: noveltyRatio, memorySize: simMemory.size, message: `New unique state #${simMemory.size} — C=${complexityCounter}` },
        timestamp: Date.now()
      });
      appendWorkspaceRecord(workspace, {
        type: "simulation_discovery",
        category: String(config?.activeOptimizer || "simulation"),
        version: String(config?.activeVersion || ""),
        summary: `Unique simulation state ${simMemory.size} discovered`,
        stats: { complexity: complexityCounter, novelty: noveltyRatio },
        state: config || {},
      });
      saveToDisk();

      res.json({
        unique: true,
        complexity: complexityCounter,
        memorySize: simMemory.size
      });
    }
  });

  // API: Discovery Query
  app.get("/api/discovery/best", (req, res) => {
    let best = null;
    let maxComplexity = -1;
    
    simMemory.forEach((val, key) => {
      if (val.complexity > maxComplexity) {
        maxComplexity = val.complexity;
        best = { hash: key, ...val };
      }
    });
    
    res.json(best || { message: "No discovery yet" });
  });

  // API: Blueprint Generation
  app.post("/api/blueprint/generate", (req, res) => {
    const { product, config } = req.body;
    const result = blueprintGen.generate(product, config);
    res.json(result);
  });

  // API: House Thermal Analysis
  app.post("/api/house/analyze", (req, res) => {
    const result = calcHouseHeatLoss(req.body);
    res.json(result);
  });

  // API: deterministic room geometry + airflow lifecycle optimization.
  // No external model or API is used; this runs entirely on the server.
  app.post("/api/house/optimize-room", (req, res) => {
    try {
      const result = optimizeRoomLifecycle(req.body || {});
      const workspace = workspaceFor(req);
      appendWorkspaceRecord(workspace, {
        type: "room_optimization",
        category: "house",
        version: "v12",
        summary: result.improvement.reason,
        stats: result.improvement,
        state: { input: req.body || {}, best: result.best },
      });
      saveToDisk();
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Room optimization failed.";
      res.status(400).json({ error: message });
    }
  });

  // API: transient room + HVAC duty-cycle optimization with optional free-air,
  // recovered-stream and pressure-recovery sources. The solver is deterministic
  // and first-party; it does not call an AI, weather or equipment-vendor API.
  app.post("/api/house/optimize-hvac-cycle", (req, res) => {
    try {
      const requestedMode = req.body?.mode === 'heating' ? 'heating' : 'cooling';
      const requestedArea = Math.max(5, Number(req.body?.floorAreaM2 ?? 18));
      const requestedVolume = Math.max(12, Number(req.body?.roomVolumeM3 ?? requestedArea * 2.7));
      const requestedEnvelope = Math.max(5, Number(req.body?.envelopeConductanceWPerK ?? requestedArea * 4.2));
      const relevantLearning = hvacCycleLearningRecords
        .filter(record => record.mode === requestedMode)
        .filter(record => Math.abs(record.volumeBandM3 - requestedVolume) <= Math.max(20, requestedVolume * 0.65))
        .filter(record => Math.abs(record.envelopeBandWPerK - requestedEnvelope) <= Math.max(35, requestedEnvelope * 0.8))
        .sort((a, b) => b.electricalSavedPercent - a.electricalSavedPercent)
        .slice(0, 24);
      const result = optimizeHvacCycle({
        ...(req.body || {}),
        learnedStrategies: relevantLearning.map(record => record.strategy),
      });
      const workspace = workspaceFor(req);
      appendWorkspaceRecord(workspace, {
        type: "hvac_cycle_optimization",
        category: "house",
        version: "v12",
        summary: result.improvement.reason,
        stats: {
          candidatesEvaluated: result.candidatesEvaluated,
          priorStrategiesUsed: relevantLearning.length,
          improvement: result.improvement,
          strategy: result.best.strategy,
          comfort: result.best.comfort,
        },
        state: { input: req.body || {}, result },
      });
      if (result.improvement.qualifiesAsImprovement) {
        hvacCycleLearningRecords.push({
          mode: result.mode,
          volumeBandM3: Math.round(requestedVolume / 10) * 10,
          envelopeBandWPerK: Math.round(requestedEnvelope / 10) * 10,
          strategy: result.best.strategy,
          electricalSavedPercent: result.improvement.electricalSavedPercent,
          timestamp: Date.now(),
        });
        hvacCycleLearningRecords = hvacCycleLearningRecords.slice(-MAX_HVAC_CYCLE_LEARNING_RECORDS);
      }
      saveToDisk();
      res.json({
        ...result,
        learning: {
          mode: 'anonymous_aggregate',
          priorStrategiesUsed: relevantLearning.length,
          sharedStrategiesAvailable: hvacCycleLearningRecords.length,
          exactRoomInputsShared: false,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "HVAC cycle optimization failed.";
      res.status(400).json({ error: message });
    }
  });

  // API: adaptive wall-cavity feasibility search. It explicitly balances wall
  // conduction, microlattice bridging/heat export, bladder actuation heat,
  // moisture risk and embodied energy rather than assuming heat disappears.
  app.post("/api/house/optimize-adaptive-wall", (req, res) => {
    try {
      const result = discoverAdaptiveWall(req.body || {});
      const requestedArea = Math.max(1, Number(req.body?.wallAreaM2 ?? 25));
      const requestedIndoor = Number(req.body?.indoorTempC ?? 22);
      const requestedOutdoorMean = (
        Number(req.body?.outdoorLowTempC ?? (result.mode === 'cooling' ? 18 : 1))
        + Number(req.body?.outdoorHighTempC ?? (result.mode === 'cooling' ? 36 : 13))
      ) / 2;
      const climateDelta = Math.abs(requestedOutdoorMean - requestedIndoor);
      const similarStudies = adaptiveWallLearningRecords
        .filter(record => record.mode === result.mode)
        .filter(record => Math.abs(record.wallAreaBandM2 - requestedArea) <= Math.max(10, requestedArea * 0.6))
        .filter(record => Math.abs(record.climateDeltaBandC - climateDelta) <= 8)
        .sort((a, b) => b.electricalSavedPercent - a.electricalSavedPercent)
        .slice(0, 32);
      const workspace = workspaceFor(req);
      appendWorkspaceRecord(workspace, {
        type: "adaptive_wall_optimization",
        category: "house",
        version: "v12",
        summary: result.improvement.reason,
        stats: {
          verdict: result.verdict,
          candidatesEvaluated: result.candidatesEvaluated,
          similarStudiesAvailable: similarStudies.length,
          improvement: result.improvement,
          strategy: result.best.strategy,
          condensationRisk: result.best.condensationRisk,
        },
        state: { input: req.body || {}, result },
      });
      if (result.improvement.qualifiesAsImprovement) {
        adaptiveWallLearningRecords.push({
          mode: result.mode,
          wallAreaBandM2: Math.round(requestedArea / 5) * 5,
          climateDeltaBandC: Math.round(climateDelta / 2) * 2,
          strategy: result.best.strategy,
          electricalSavedPercent: result.improvement.electricalSavedPercent,
          timestamp: Date.now(),
        });
        adaptiveWallLearningRecords = adaptiveWallLearningRecords.slice(-MAX_ADAPTIVE_WALL_LEARNING_RECORDS);
      }
      saveToDisk();
      res.json({
        ...result,
        learning: {
          mode: 'anonymous_aggregate',
          similarStudiesAvailable: similarStudies.length,
          exactWallInputsShared: false,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Adaptive wall optimization failed.";
      res.status(400).json({ error: message });
    }
  });

  // API: latitude-driven building form, orientation, shadow and resilience search.
  // Site/hazard inputs are explicit so the calculation remains reproducible and local.
  app.post("/api/house/optimize-site", (req, res) => {
    try {
      const requestedLatitude = Number(req.body?.location?.latitudeDeg ?? -36.76);
      const requestedHeatingDays = Number(req.body?.location?.heatingDegreeDays ?? 1700);
      const requestedCoolingDays = Number(req.body?.location?.coolingDegreeDays ?? 360);
      const requestedArea = Number(req.body?.targetFloorAreaM2 ?? 130);
      const relevantLearning = siteLearningRecords
        .filter(record => Math.abs(record.latitudeBand - requestedLatitude) <= 12)
        .filter(record => record.floorAreaM2 >= requestedArea * 0.55 && record.floorAreaM2 <= requestedArea * 1.8)
        .sort((a, b) => {
          const aClimateDistance = Math.abs(a.heatingDegreeDays - requestedHeatingDays) + Math.abs(a.coolingDegreeDays - requestedCoolingDays);
          const bClimateDistance = Math.abs(b.heatingDegreeDays - requestedHeatingDays) + Math.abs(b.coolingDegreeDays - requestedCoolingDays);
          return aClimateDistance - bClimateDistance || b.lifecycleEnergySavedPercent - a.lifecycleEnergySavedPercent;
        })
        .slice(0, 16);
      const result = optimizeSiteGeometry({
        ...(req.body || {}),
        learnedDesigns: relevantLearning.map(record => record.design),
      });
      const workspace = workspaceFor(req);
      appendWorkspaceRecord(workspace, {
        type: "site_geometry_optimization",
        category: "house",
        version: "v12",
        summary: result.improvement.reason,
        stats: {
          candidatesEvaluated: result.candidatesEvaluated,
          priorDesignsUsed: relevantLearning.length,
          improvement: result.improvement,
        },
        state: { input: req.body || {}, best: result.best },
      });

      if (result.best.feasible && result.improvement.qualifiesAsImprovement) {
        siteLearningRecords.push({
          latitudeBand: Math.round(result.location.latitudeDeg / 2) * 2,
          heatingDegreeDays: result.location.heatingDegreeDays,
          coolingDegreeDays: result.location.coolingDegreeDays,
          floorAreaM2: result.best.design.floorAreaM2,
          design: result.best.design,
          lifecycleEnergySavedPercent: result.improvement.lifecycleEnergySavedPercent,
          timestamp: Date.now(),
        });
        siteLearningRecords = siteLearningRecords.slice(-MAX_SITE_LEARNING_RECORDS);
      }
      saveToDisk();
      res.json({
        ...result,
        learning: {
          mode: "anonymous_aggregate",
          priorDesignsUsed: relevantLearning.length,
          sharedDesignsAvailable: siteLearningRecords.length,
          exactLocationShared: false,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Site geometry optimization failed.";
      res.status(400).json({ error: message });
    }
  });

  // API: automatically sweep dwelling archetypes, shared airflow paths,
  // pressure balance, heat recovery, fan pressure and lifecycle manufacture.
  app.post("/api/house/optimize-whole-system", (req, res) => {
    try {
      const location = {
        name: String(req.body?.location?.name || "Selected site"),
        latitudeDeg: Number(req.body?.location?.latitudeDeg ?? -36.76),
        longitudeDeg: Number(req.body?.location?.longitudeDeg ?? 144.28),
        averageDailySolarMJm2: Number(req.body?.location?.averageDailySolarMJm2 ?? 17.2),
        summerDesignTempC: Number(req.body?.location?.summerDesignTempC ?? 40),
        winterDesignTempC: Number(req.body?.location?.winterDesignTempC ?? 1),
        heatingDegreeDays: Number(req.body?.location?.heatingDegreeDays ?? 1700),
        coolingDegreeDays: Number(req.body?.location?.coolingDegreeDays ?? 360),
      };
      const siteContext = buildAutomaticSiteContext({
        location,
        rooms: Array.isArray(req.body?.rooms) ? req.body.rooms : [],
        cachedGeoJson: cachedGeoJsonForLocation(location.latitudeDeg, location.longitudeDeg),
        searchRadiusM: 120,
      });
      const result = optimizeWholeHouseSystem({
        ...(req.body || {}),
        location,
        siteObstruction: siteContext.neighbours.length ? {
          summerShadePotentialPercent: siteContext.solarObstruction.summerShadePotentialPercent,
          winterSolarAccessPercent: siteContext.solarObstruction.winterSolarAccessPercent,
          confidencePercent: siteContext.solarObstruction.confidencePercent,
          source: siteContext.source,
        } : undefined,
      });
      const workspace = workspaceFor(req);
      appendWorkspaceRecord(workspace, {
        type: "whole_house_system_optimization",
        category: "house",
        version: "v12",
        summary: result.improvement.reason,
        stats: {
          candidatesEvaluated: result.candidatesEvaluated,
          winningArchetype: result.best.configuration.archetype,
          winningControl: result.best.configuration.control,
          lifecycleEnergySavedPercent: result.improvement.lifecycleEnergySavedPercent,
          annualOperationalEnergySavedKWh: result.improvement.annualOperationalEnergySavedKWh,
        },
        state: { input: req.body || {}, result },
      });
      saveToDisk();
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Whole-house optimization failed.";
      res.status(400).json({ error: message });
    }
  });

  // Deterministic level-1 checks expose whether the screening engine still
  // conserves mass and obeys its documented solar, heat-flow and accounting
  // identities. This is deliberately separate from certification benchmarks.
  app.get("/api/house/validation-report", (_req, res) => {
    physicsValidationCache ||= runBuildingPhysicsValidation();
    res.json(physicsValidationCache);
  });

  // Build a local metric site model from cached open footprints. There is no
  // runtime map, AI or geocoding dependency: deployment can refresh GeoJSON
  // snapshots in DATA_DIR/site-context without changing the simulator.
  app.post("/api/house/site-context", (req, res) => {
    try {
      const location = {
        name: String(req.body?.location?.name || "Selected site"),
        latitudeDeg: Number(req.body?.location?.latitudeDeg ?? -36.76),
        longitudeDeg: Number(req.body?.location?.longitudeDeg ?? 144.28),
        averageDailySolarMJm2: Number(req.body?.location?.averageDailySolarMJm2 ?? 17.2),
        summerDesignTempC: Number(req.body?.location?.summerDesignTempC ?? 40),
        winterDesignTempC: Number(req.body?.location?.winterDesignTempC ?? 1),
        heatingDegreeDays: Number(req.body?.location?.heatingDegreeDays ?? 1700),
        coolingDegreeDays: Number(req.body?.location?.coolingDegreeDays ?? 360),
      };
      if (!Number.isFinite(location.latitudeDeg) || !Number.isFinite(location.longitudeDeg)) {
        throw new Error("A finite latitude and longitude are required.");
      }
      const cachedGeoJson = cachedGeoJsonForLocation(location.latitudeDeg, location.longitudeDeg);
      const result = buildAutomaticSiteContext({
        location,
        rooms: Array.isArray(req.body?.rooms) ? req.body.rooms : [],
        cachedGeoJson,
        searchRadiusM: Number(req.body?.searchRadiusM || 120),
      });
      const workspace = workspaceFor(req);
      appendWorkspaceRecord(workspace, {
        type: "automatic_site_context",
        category: "house",
        version: "v12",
        summary: `${result.source}: ${result.neighbours.length} neighbours, ${result.uncertainty.band} uncertainty.`,
        stats: {
          source: result.source,
          completenessPercent: result.completenessPercent,
          neighbourCount: result.neighbours.length,
          uncertainty: result.uncertainty,
        },
        state: result,
      });
      saveToDisk();
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Automatic site context failed.";
      res.status(400).json({ error: message });
    }
  });

  app.post("/api/house/existing-home-autopilot", (req, res) => {
    try {
      const result = runExistingHomeAutopilot(req.body || {});
      const workspace = workspaceFor(req);
      const latitudeBand = Math.round(result.location.latitudeDeg / 2) * 2;
      const similarStudies = retrofitLearningRecords.filter(record =>
        Math.abs(record.latitudeBand - latitudeBand) <= 8
        && Math.abs(record.heatingDegreeDays - result.location.heatingDegreeDays) <= 1200
        && Math.abs(record.coolingDegreeDays - result.location.coolingDegreeDays) <= 1200
      );
      appendWorkspaceRecord(workspace, {
        type: "existing_home_autopilot",
        category: "house",
        version: "v12",
        summary: result.best
          ? `${result.best.label}: ${result.best.lifecycleEnergySavedPercent}% median lifecycle saving across ${result.modelCount} plausible homes.`
          : `No robust lifecycle-positive retrofit found across ${result.modelCount} plausible homes.`,
        stats: {
          confidence: result.confidence,
          best: result.best,
          similarStudiesAvailable: similarStudies.length,
        },
        state: { input: req.body || {}, result },
      });
      if (result.best) {
        retrofitLearningRecords.push({
          latitudeBand,
          heatingDegreeDays: result.location.heatingDegreeDays,
          coolingDegreeDays: result.location.coolingDegreeDays,
          winningMeasures: result.best.measures.map(measure => measure.id),
          robustPassPercent: result.best.robustPassPercent,
          lifecycleEnergySavedPercent: result.best.lifecycleEnergySavedPercent,
          timestamp: Date.now(),
        });
        retrofitLearningRecords = retrofitLearningRecords.slice(-MAX_RETROFIT_LEARNING_RECORDS);
      }
      saveToDisk();
      res.json({
        ...result,
        learning: {
          mode: "anonymous_aggregate",
          similarStudiesAvailable: similarStudies.length,
          exactLocationShared: false,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Existing-home autopilot failed.";
      res.status(400).json({ error: message });
    }
  });

  app.get("/api/discovery/log", (req, res) => {
    res.json(discoveryLog);
  });

  // NOTE: The catch-all for /api routes is placed AFTER all route registrations
  // (see below, after the optimizer and autonomous state-full endpoints)

  // --- Autonomous Core State ---
  let autonomousState = {
    currentGoal: "Establish 3-bit Quantum-Resistant Blockchain Supercomputer",
    buildStatus: {
      version: "4.2.0-alpha",
      integrity: 0.998,
      lastBuildAt: Date.now(),
      isCompiling: false
    },
    blockchain: {
      messageToTransmit: "HELLO",
      transmittedBits: "",
      currentBitIndex: 0,
      isThrottled: true,
      transmissionLog: [] as string[]
    },
    tasks: [
      { id: 1, title: "Optimize 3-bit Parity Algorithm", status: "completed", progress: 100, algorithm: "XOR-Summation-v2" },
      { id: 2, title: "Transmit 5-bit Message via Throttled Environment", status: "active", progress: 0, algorithm: "Bit-By-Bit-Consensus" },
      { id: 3, title: "Deep-Learn Optimal Reader Material", status: "pending", progress: 0, algorithm: "None" }
    ],
    logs: [
      "[SYSTEM] Genesis Brain initialized.",
      "[BUILDER] Verifying structural integrity of App.tsx...",
      "[BUILDER] Patching latency-sensitive nodes in blockchain.ts..."
    ],
    lastUpdate: Date.now(),
    startTime: Date.now()
  };

  // Background loop to simulate autonomous evolution
  setInterval(() => {
    const activeTask = autonomousState.tasks.find(t => t.status === 'active');
    if (activeTask) {
      if (activeTask.title.includes("Transmit 5-bit Message")) {
        const msg = autonomousState.blockchain.messageToTransmit;
        const totalBits = msg.length * 5;
        activeTask.progress = (autonomousState.blockchain.currentBitIndex / totalBits) * 100;
      } else {
        activeTask.progress += Math.random() * 8; 
      }

      if (activeTask.progress >= 100) {
        activeTask.progress = 100;
        activeTask.status = 'completed';
        autonomousState.logs.push(`[SYSTEM] Task finalized: ${activeTask.title}`);
        autonomousState.logs.push(`[GENESIS] Novelty injection successful via ${activeTask.algorithm}`);
        
        // Generate new task
        const newTaskTitles = [
          "Refactor UI for Additive Color Theory",
          "Sacrifice Material Density for Latency",
          "Search for Optimal Base Code System",
          "Encrypt Shared Ledger with Novelty Entropy",
          "Simulate Cross-Road Traffic Patterns",
          "Brute-Force Optimal Reader Geometry",
          "Optimize Latent Space for Thermal Gradients",
          "Evolve Membrane Topology for 5-bit Sync",
          "Deep-Learn Material Exclusion Rules"
        ];
        const newAlgs = ["Recursive-Descent", "Monte-Carlo-Search", "Heuristic-Pruning", "Genetic-Algorithm-v4", "A*-Pathfinding", "Neural-Evolution"];
        
        const nextTask = {
          id: autonomousState.tasks.length + 1,
          title: newTaskTitles[Math.floor(Math.random() * newTaskTitles.length)],
          status: 'pending',
          progress: 0,
          algorithm: newAlgs[Math.floor(Math.random() * newAlgs.length)]
        };
        autonomousState.tasks.push(nextTask);
      }
    } else {
      const pendingTask = autonomousState.tasks.find(t => t.status === 'pending');
      if (pendingTask) {
        pendingTask.status = 'active';
        autonomousState.logs.push(`[CORE] Initiating autonomous task: ${pendingTask.title}`);
      }
    }

    // Occasional goal update and "Self-Building" events
    const rand = Math.random();
    if (rand > 0.95) {
      const goals = [
        "Achieve Supercomputer Status via Distributed Nodes",
        "Minimize Entropy in 3-bit Transmissions",
        "Optimize CMY Additive Light Blending",
        "Evolve Reader Type to Quantum-Thermal Hybrid",
        "Self-Replicate Logic Across Peer Nodes",
        "Establish 5-bit Quinary Blockchain Consensus"
      ];
      const newGoal = goals[Math.floor(Math.random() * goals.length)];
      if (newGoal !== autonomousState.currentGoal) {
        autonomousState.currentGoal = newGoal;
        autonomousState.logs.push(`[EVOLUTION] Goal self-edited: ${autonomousState.currentGoal}`);
      }
    }

    if (rand > 0.90) {
      const buildLogs = [
        "[BUILDER] Optimizing React render cycles for SimulationView...",
        "[BUILDER] Injecting quinary logic into blockchain consensus...",
        "[BUILDER] Refactoring thermal gradients in house_thermal.ts...",
        "[BUILDER] Compiling novelty-entropy patches...",
        "[BUILDER] Verifying checksums for distributed nodes..."
      ];
      autonomousState.logs.push(buildLogs[Math.floor(Math.random() * buildLogs.length)]);
      autonomousState.buildStatus.integrity = Math.min(1, autonomousState.buildStatus.integrity + 0.0001);
      autonomousState.buildStatus.lastBuildAt = Date.now();
    }

    if (autonomousState.logs.length > 25) autonomousState.logs.shift();
    autonomousState.lastUpdate = Date.now();
  }, 2000); // Faster updates for more "active" feel

  app.get("/api/autonomous/state", (req, res) => {
    res.json(autonomousState);
  });

  app.post("/api/autonomous/edit-goal", express.json(), (req, res) => {
    const { goal } = req.body;
    if (goal) {
      autonomousState.currentGoal = goal;
      autonomousState.logs.push(`Manual override: Goal edited to "${goal}"`);
      res.json({ success: true });
    } else {
      res.status(400).json({ error: "Goal required" });
    }
  });

  // --- WebSocket Upgrade Handling ---
  httpServer.on("upgrade", (request, socket, head) => {
    try {
      const url = new URL(request.url || "", "http://localhost");
      const pathname = url.pathname;
      
      if (pathname === "/ws") {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit("connection", ws, request);
        });
      }
    } catch (e) {
      console.error("[WS Upgrade] Error:", e);
    }
  });

  const NODE_ID = process.env.NODE_ID || `node-${Math.random().toString(36).substring(7)}`;
  const PEER_NODES = (process.env.PEER_NODES || "")
    .split(",")
    .map((peer) => peer.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const sharedLedger: any[] = [];

  console.log(`[Genesis] Initialized as ${NODE_ID}`);
  if (PEER_NODES.length > 0) {
    console.log(`[Genesis] Peer nodes detected: ${PEER_NODES.join(", ")}`);
  } else {
    console.log(`[Genesis] Running in standalone mode (no peers configured).`);
  }

  // --- Live network node list (local node plus configured peers) ---
  const nodes = [
    { id: NODE_ID, name: NODE_ID, ip: "local", status: "active", load: 0.05, tasks: 0, url: null as string | null },
    ...PEER_NODES.map((peerUrl, index) => {
      let host = peerUrl;
      try {
        host = new URL(peerUrl).host;
      } catch {
        // The health check below will mark malformed peer URLs offline.
      }
      return {
        id: `peer-${index + 1}`,
        name: host,
        ip: host,
        status: "unknown",
        load: 0,
        tasks: 0,
        url: peerUrl,
      };
    }),
  ];

  // API: Get Network Nodes
  app.get("/api/blockchain/nodes", async (req, res) => {
    const dynamicNodes = await Promise.all(nodes.map(async (n) => {
      const peerUrl = n.url;
      let latency = "--";
      let status = n.status;

      if (peerUrl) {
        const start = Date.now();
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 1000);
          const pingRes = await fetch(`${peerUrl}/api/health`, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (pingRes.ok) {
            latency = `${Date.now() - start}ms`;
            status = "active";
          } else {
            status = "error";
          }
        } catch (e) {
          status = "offline";
        }
      }

      const newLoad = Math.max(0, Math.min(1, n.load + (Math.random() - 0.5) * 0.05));
      return { ...n, load: newLoad, latency, status };
    }));
    res.json(dynamicNodes);
  });

  // API: Health Check
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      nodeId: NODE_ID,
      memorySize: simMemory.size,
      memoryLimit: MAX_MEMORY_NODES,
    });
  });

  // API: Receive Bit/Entry from Peer
  app.post("/api/blockchain/receive", (req, res) => {
    const entry = req.body;
    sharedLedger.push(entry);
    if (sharedLedger.length > 50) sharedLedger.shift();
    console.log(`[Blockchain] Received bit from ${entry.nodeId}: ${entry.bit}`);
    res.json({ status: "received" });
  });

  // API: 3-bit Blockchain Transmitter (Optimized P2P Experiment)
  app.get("/api/transmit", async (req, res) => {
    // Message Transmission Logic
    const msg = autonomousState.blockchain.messageToTransmit;
    const charIndex = Math.floor(autonomousState.blockchain.currentBitIndex / 5);
    const bitInChar = autonomousState.blockchain.currentBitIndex % 5;
    
    let currentBit = 0;
    if (charIndex < msg.length) {
      const charCode = msg.charCodeAt(charIndex) - 65; // A=0, B=1...
      currentBit = (charCode >> (4 - bitInChar)) & 1;
      autonomousState.blockchain.transmittedBits += currentBit;
      autonomousState.blockchain.currentBitIndex++;
      
      const logMsg = `[BLOCKCHAIN] Transmitted bit ${currentBit} of '${msg[charIndex]}' (Index: ${autonomousState.blockchain.currentBitIndex})`;
      autonomousState.blockchain.transmissionLog.push(logMsg);
      if (autonomousState.blockchain.transmissionLog.length > 10) autonomousState.blockchain.transmissionLog.shift();
    }

    // Generate 3-bit word (The "Split 3-bit Comp")
    const bits = [currentBit, Math.random() > 0.5 ? 1 : 0, Math.random() > 0.5 ? 1 : 0];
    const word = bits.join("");
    const decimalValue = parseInt(word, 2);

    // Predictive Window Logic (Future availability based on current load)
    const currentLoad = nodes.reduce((acc, n) => acc + n.load, 0) / nodes.length;
    const futureWindows = Array.from({ length: 5 }, (_, i) => ({
      timeOffset: (i + 1) * 2000,
      availability: Math.max(0, 1 - (currentLoad + (Math.random() - 0.5) * 0.2)).toFixed(2),
      status: Math.random() > currentLoad ? 'OPEN' : 'CONGESTED'
    }));

    // Reader Type Optimization (Deep Learning Simulation)
    const readerTypes = ['Optical', 'Magnetic', 'Quantum', 'Thermal'];
    const readerEfficiencies = readerTypes.map(type => ({
      type,
      efficiency: (Math.random() * 0.5 + (type === 'Quantum' ? 0.4 : 0.2)).toFixed(3),
      errorRate: (Math.random() * 0.1).toFixed(4)
    }));
    const optimalReader = readerEfficiencies.reduce((prev, curr) => 
      parseFloat(curr.efficiency) > parseFloat(prev.efficiency) ? curr : prev
    );

    // Sacrifice Analysis (Trade-offs for Supercomputer Optimization)
    const sacrifices = [
      { area: 'Material Density', gain: 'Processing Speed', cost: 'Thermal Stability', value: 0.85 },
      { area: 'Code Complexity', gain: 'Error Correction', cost: 'Latency', value: 0.72 },
      { area: 'Bit Depth', gain: 'Energy Efficiency', cost: 'Data Precision', value: 0.94 }
    ];
    const recommendedSacrifice = sacrifices.sort((a, b) => b.value - a.value)[0];

    // Modulation Logic (Piggybacking on Internet Carrier)
    const carrierFreq = 2400; // 2.4GHz base simulation
    const modulation = Math.random() > 0.5 ? 'AM' : 'FM';
    
    const frequency = modulation === 'FM' ? carrierFreq + (decimalValue * 10) : carrierFreq;
    const amplitude = modulation === 'AM' ? 0.5 + (decimalValue / 7) * 0.5 : 0.8;
    
    // System Entropy
    const entropy = Math.random().toString(2).substring(2, 12);
    
    const entry = { 
      timestamp: Date.now(), 
      nodeId: NODE_ID, 
      action: 'TRANSMIT_3BIT', 
      bits, 
      word,
      decimalValue,
      modulation,
      carrierFreq,
      frequency,
      amplitude,
      entropy,
      futureWindows,
      optimalReader,
      recommendedSacrifice,
      encryptionKey: `0x${Math.random().toString(16).substring(2, 10).toUpperCase()}`,
      code: `MOV R0, ${decimalValue}; ENCRYPT R0, KEY; MOD ${modulation}, R0; PUSH NET;`,
      transmittedBits: autonomousState.blockchain.transmittedBits,
      messageProgress: (autonomousState.blockchain.currentBitIndex / (msg.length * 5)) * 100
    };
    
    sharedLedger.push(entry);
    if (sharedLedger.length > 50) sharedLedger.shift();

    // Try to broadcast to a random peer
    let broadcastStatus = "local-only";
    if (PEER_NODES.length > 0) {
      const targetPeer = PEER_NODES[Math.floor(Math.random() * PEER_NODES.length)];
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500);
        const peerRes = await fetch(`${targetPeer}/api/blockchain/receive`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (peerRes.ok) broadcastStatus = `broadcasted to ${targetPeer}`;
      } catch (e) {
        broadcastStatus = `failed to reach ${targetPeer}`;
      }
    }
    
    res.json({ 
      ...entry,
      status: `Node ${NODE_ID} ${broadcastStatus}`, 
      activeNodes: nodes.filter(n => n.status === 'active').length, 
      ledger: sharedLedger.slice(-5),
      supercomputerState: bits,
      efficiency: (Math.random() * 0.2 + 0.75).toFixed(3) // Simulated efficiency
    });
  });

  // API: Optimizer Blueprints
  app.get("/api/blueprints/:type", (req, res) => {
    const { type } = req.params;
    
    // Map categories to product templates
    const templateMap: Record<string, string[]> = {
      thermal: ["stubby", "esky", "spaceship"],
      electrical: ["house_cooling"], // Using house_cooling as a proxy for electrical/hvac
      blockchain: [],
      house: ["house_cooling"]
    };

    const productTypes = templateMap[type] || [];
    const results = productTypes.map(pt => blueprintGen.generate(pt, { config: { targetTemp: 4, ambientTemp: 25 } }));
    
    // If no dynamic blueprints, return the static ones as fallback
    if (results.length === 0) {
      const staticBlueprints: Record<string, any[]> = {
        thermal: [
          { material: "Aerogel-Infused Lattice", k: 0.015, meshDensity: "High", geometry: "Gyroid Membrane", bom: [{ item: "Aerogel Matrix", cost: 45 }, { item: "Polymer Binder", cost: 12 }] },
          { material: "Carbon Nanotube Foam", k: 0.025, meshDensity: "Medium", geometry: "Schwarz P Surface", bom: [{ item: "CNT Foam", cost: 85 }, { item: "Resin Base", cost: 15 }] }
        ],
        electrical: [
          { material: "Silver-Polymer Composite", impedance: "50Ω Matching", topology: "Fractal Lattice", bom: [{ item: "Silver Flakes", cost: 85 }, { item: "Resin Base", cost: 15 }] },
          { material: "Graphene-Coated Copper", impedance: "Low Noise", topology: "Hilbert Curve", bom: [{ item: "Graphene Sheets", cost: 120 }, { item: "Copper Core", cost: 25 }] }
        ],
        blockchain: [
          { protocol: "1-bit Temporal Sync", throughput: "1 bps", security: "Novelty-Entropy Brute Force", bom: [{ item: "Sync Module", cost: 250 }] }
        ],
        house: [
          { material: "Bio-Composite Panel", k: 0.035, geometry: "Honeycomb Core", application: "Wall Assembly", bom: [{ item: "Bio-Resin", cost: 35 }, { item: "Fiber Core", cost: 15 }] },
          { material: "Phase Change Glazing", k: 0.045, geometry: "Micro-Encapsulated", application: "Window Unit", bom: [{ item: "PCM Gel", cost: 65 }, { item: "Glass Pane", cost: 45 }] }
        ]
      };
      return res.json(staticBlueprints[type] || [{ error: "Unknown type" }]);
    }

    res.json(results);
  });

  // ============================================================
  // REAL GENETIC ALGORITHM OPTIMIZER + P2P SHARING
  // ============================================================

  // NODE_ID is already declared above (line 353) — reuse it here
  const PEER_URLS = PEER_NODES;

  // Optimizer state
  let optGeneration = 0;
  let optBestFitness = 0;
  let optBestConfig: any = null;
  let optAppliedConfig: any = null;
  let optLogs: string[] = [`[INIT] Optimizer started on ${NODE_ID}`];
  let optHistory: { gen: number; fitness: number; source: string }[] = [];
  let optPopulation: any[] = [];

  const OPT_KEYS = ['colorSpeed', 'colorSpread', 'waveFrequency', 'barThickness', 'cellActivity', 'noveltyStrength', 'decay', 'brightness', 'lineStrength3D', 'ballCount'];
  const OPT_RANGES: Record<string, [number, number]> = {
    colorSpeed: [0.1, 5], colorSpread: [0.1, 3], waveFrequency: [0.5, 8],
    barThickness: [1, 6], cellActivity: [0.1, 1], noveltyStrength: [0, 2],
    decay: [0.8, 1], brightness: [0.5, 2], lineStrength3D: [0, 1], ballCount: [3, 20],
  };

  function randomConfig() {
    const cfg: any = {};
    for (const k of OPT_KEYS) { const [lo, hi] = OPT_RANGES[k]; cfg[k] = lo + Math.random() * (hi - lo); }
    cfg.ballCount = Math.round(cfg.ballCount);
    return cfg;
  }

  function mutateConfig(cfg: any) {
    const c = { ...cfg };
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const k = OPT_KEYS[Math.floor(Math.random() * OPT_KEYS.length)];
      const [lo, hi] = OPT_RANGES[k];
      c[k] = Math.max(lo, Math.min(hi, c[k] + (Math.random() - 0.5) * (hi - lo) * 0.3));
      if (k === 'ballCount') c[k] = Math.round(c[k]);
    }
    return c;
  }

  function crossover(a: any, b: any) {
    const child: any = {};
    for (const k of OPT_KEYS) child[k] = Math.random() > 0.5 ? a[k] : b[k];
    child.ballCount = Math.round(child.ballCount);
    return child;
  }

  function evaluateTrial(cfg: any): number {
    const W = 20, H = 20;
    const grid = Array.from({ length: W * H }, () => Math.random());
    let noveltySum = 0;
    const seen = new Set<string>();
    for (let step = 0; step < 60; step++) {
      const newGrid = [...grid];
      for (let i = 0; i < W * H; i++) {
        const x = i % W, y = Math.floor(i / W);
        let sum = 0, count = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = (x + dx + W) % W, ny = (y + dy + H) % H;
          sum += grid[ny * W + nx]; count++;
        }
        const avg = sum / count;
        newGrid[i] = grid[i] * (cfg.decay || 0.95) + (avg - grid[i]) * (cfg.cellActivity || 0.5) +
          Math.sin(step * (cfg.waveFrequency || 1) + i * (cfg.colorSpread || 1)) * (cfg.noveltyStrength || 0.5) * 0.1;
        newGrid[i] = Math.max(0, Math.min(1, newGrid[i]));
      }
      grid.splice(0, grid.length, ...newGrid);
      const hash = grid.map(v => (v * 10 | 0).toString(36)).join('').slice(0, 40);
      if (!seen.has(hash)) { seen.add(hash); noveltySum++; }
    }
    return noveltySum * (cfg.brightness || 1) * (1 + (cfg.colorSpeed || 1) * 0.1);
  }

  // Initialize population
  for (let i = 0; i < 12; i++) optPopulation.push(randomConfig());

  // ============================================================
  // LIVING CONFIG — Runtime behavior driven by evolving config objects
  // The local GA proposes, scores, and applies configuration mutations.
  // Nothing here depends on an external AI service.
  // ============================================================

  // Band evolution population (parallel to sim optimizer)
  const BAND_GENRES = ['jazz', 'hiphop', 'edm', 'country', 'rock'] as const;
  const BAND_MODES = ['major', 'minor', 'dorian', 'mixolydian', 'blues', 'phrygian'] as const;
  let bandPopulation: any[] = [];
  let bandBestConfig: any = null;
  let bandBestFitness = 0;

  function randomBandConfig() {
    return {
      genre: BAND_GENRES[Math.floor(Math.random() * BAND_GENRES.length)],
      bpm: 60 + Math.floor(Math.random() * 140),
      key: Math.floor(Math.random() * 12),
      harmonyMode: BAND_MODES[Math.floor(Math.random() * BAND_MODES.length)],
      swing: Math.random(),
      chaos: Math.random(),
      reharmonisation: ['none', 'tritone_sub', 'secondary_dominant', 'modal_interchange', 'chromatic_mediant'][Math.floor(Math.random() * 5)],
      useInversions: Math.random() > 0.3,
      effects: {
        distortion: { enabled: Math.random() > 0.7, amount: 1 + Math.random() * 9, tone: 500 + Math.random() * 7500 },
        delay: { enabled: Math.random() > 0.6, time: 0.05 + Math.random() * 0.95, feedback: Math.random() * 0.85, mix: Math.random() },
        chorus: { enabled: Math.random() > 0.5, rate: 0.1 + Math.random() * 4.9, mix: Math.random() },
        halfspeed: { enabled: Math.random() > 0.85, mix: Math.random() },
      }
    };
  }

  function mutateBandConfig(cfg: any) {
    const c = JSON.parse(JSON.stringify(cfg));
    const mutations = 1 + Math.floor(Math.random() * 4);
    for (let i = 0; i < mutations; i++) {
      const roll = Math.random();
      if (roll < 0.15) c.genre = BAND_GENRES[Math.floor(Math.random() * BAND_GENRES.length)];
      else if (roll < 0.3) c.bpm = Math.max(60, Math.min(200, c.bpm + Math.floor((Math.random() - 0.5) * 40)));
      else if (roll < 0.4) c.key = Math.floor(Math.random() * 12);
      else if (roll < 0.5) c.harmonyMode = BAND_MODES[Math.floor(Math.random() * BAND_MODES.length)];
      else if (roll < 0.6) c.swing = Math.max(0, Math.min(1, c.swing + (Math.random() - 0.5) * 0.4));
      else if (roll < 0.7) c.chaos = Math.max(0, Math.min(1, c.chaos + (Math.random() - 0.5) * 0.4));
      else if (roll < 0.8) {
        const fx = ['distortion', 'delay', 'chorus', 'halfspeed'][Math.floor(Math.random() * 4)];
        c.effects[fx].enabled = !c.effects[fx].enabled;
      }
      else c.useInversions = !c.useInversions;
    }
    return c;
  }

  // Simple heuristic fitness for band configs (musical "interestingness")
  function evaluateBandConfig(cfg: any): number {
    let score = 50;
    // BPM variety bonus
    if (cfg.bpm >= 90 && cfg.bpm <= 150) score += 10;
    // Genre-appropriate BPM
    if (cfg.genre === 'edm' && cfg.bpm >= 120) score += 15;
    if (cfg.genre === 'hiphop' && cfg.bpm >= 80 && cfg.bpm <= 110) score += 15;
    if (cfg.genre === 'jazz' && cfg.bpm >= 90 && cfg.bpm <= 140) score += 15;
    // Chaos/swing balance
    score += (1 - Math.abs(cfg.chaos - 0.4)) * 10;
    score += cfg.swing * 8;
    // Effects diversity
    const fxCount = Object.values(cfg.effects).filter((f: any) => f.enabled).length;
    score += fxCount * 5;
    // Non-default harmony bonus
    if (cfg.harmonyMode !== 'major') score += 8;
    if (cfg.reharmonisation !== 'none') score += 12;
    if (cfg.useInversions) score += 5;
    // Randomness for exploration
    score += Math.random() * 10;
    return score;
  }

  // Initialize band population
  for (let i = 0; i < 8; i++) bandPopulation.push(randomBandConfig());

  // ── THE MAIN EVOLUTION LOOP ──
  // GA runs every 5s for sim configs (fast, local)
  // Every 3rd generation, also evolves band configs
  // Every 10th generation, injects a high-mutation local exploration candidate
  const OPT_INTERVAL = 5000;
  setInterval(() => {
    try {
      // ── PHASE 1: Standard sim optimizer (unchanged) ──
      const scored = optPopulation.map(cfg => ({ cfg, fitness: evaluateTrial(cfg) }));
      scored.sort((a, b) => b.fitness - a.fitness);
      const best = scored[0];
      optGeneration++;

      if (best.fitness > optBestFitness) {
        optBestFitness = best.fitness;
        optBestConfig = { ...best.cfg };
        optAppliedConfig = { ...best.cfg };
        optLogs.push(`[GEN ${optGeneration}] New best: ${best.fitness.toFixed(1)}`);

        complexityCounter++;
        const hash = `opt-gen${optGeneration}-${best.fitness.toFixed(0)}`;
        rememberState(hash, { complexity: complexityCounter, timestamp: Date.now(), config: best.cfg });
        appendDiscovery({ event: 'optimizer', payload: { gen: optGeneration, fitness: best.fitness, complexity: complexityCounter, novelty: best.fitness / 60, config: best.cfg }, timestamp: Date.now() });
        saveToDisk();
      }

      optHistory.push({ gen: optGeneration, fitness: best.fitness, source: NODE_ID });
      if (optHistory.length > 100) optHistory.shift();
      if (optLogs.length > 50) optLogs.shift();

      // Evolve sim population: elitism(2) + crossover + mutation
      const elite = scored.slice(0, 2).map(s => s.cfg);
      const newPop = [...elite];
      while (newPop.length < 12) {
        const a = scored[Math.floor(Math.random() * 6)].cfg;
        const b = scored[Math.floor(Math.random() * 6)].cfg;
        newPop.push(mutateConfig(crossover(a, b)));
      }
      optPopulation = newPop;

      // ── PHASE 2: Band config evolution (every 3rd gen) ──
      if (optGeneration % 3 === 0 && bandPopulation.length > 0) {
        const bandScored = bandPopulation.map(cfg => ({ cfg, fitness: evaluateBandConfig(cfg) }));
        bandScored.sort((a, b) => b.fitness - a.fitness);
        const bandBest = bandScored[0];
        if (bandBest.fitness > bandBestFitness) {
          bandBestFitness = bandBest.fitness;
          bandBestConfig = JSON.parse(JSON.stringify(bandBest.cfg));
          optLogs.push(`[BAND GEN ${optGeneration}] New best band config: ${bandBest.cfg.genre} ${bandBest.cfg.bpm}bpm F:${bandBest.fitness.toFixed(1)}`);
          appendDiscovery({ event: 'band-evolution', payload: { gen: optGeneration, fitness: bandBest.fitness, config: bandBest.cfg }, timestamp: Date.now() });
          saveToDisk();
        }
        // Evolve band population
        const bandElite = bandScored.slice(0, 2).map(s => s.cfg);
        const newBandPop = [...bandElite];
        while (newBandPop.length < 8) {
          const parent = bandScored[Math.floor(Math.random() * 4)].cfg;
          newBandPop.push(mutateBandConfig(parent));
        }
        bandPopulation = newBandPop;
      }

      // ── PHASE 3: high-mutation local exploration ──
      if (optGeneration % 10 === 0) {
        const explorationSim = mutateConfig(mutateConfig(mutateConfig(best.cfg)));
        const explorationBand = mutateBandConfig(mutateBandConfig(randomBandConfig()));
        const explorationFitness = evaluateTrial(explorationSim);
        const explorationBandFitness = evaluateBandConfig(explorationBand);

        optPopulation[optPopulation.length - 1] = explorationSim;
        bandPopulation[bandPopulation.length - 1] = explorationBand;
        optLogs.push(
          `[LOCAL] Exploration injected: sim ${explorationFitness.toFixed(1)}, band ${explorationBandFitness.toFixed(1)}`,
        );
        appendDiscovery({
          event: 'local-exploration',
          payload: {
            gen: optGeneration,
            simFitness: explorationFitness,
            bandFitness: explorationBandFitness,
          },
          timestamp: Date.now(),
        });
        saveToDisk();
      }

    } catch (e) {
      console.error('[Optimizer] Error:', e);
    }
  }, OPT_INTERVAL);

  // P2P sharing — share best config with peers every 15s
  setInterval(async () => {
    if (!optBestConfig || PEER_URLS.length === 0) return;
    const peer = PEER_URLS[Math.floor(Math.random() * PEER_URLS.length)];
    try {
      const res = await fetch(`${peer}/api/optimizer/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: optBestConfig, fitness: optBestFitness, source: NODE_ID }),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) optLogs.push(`[P2P] Shared with ${peer.split('//')[1]?.split(':')[0] || peer}`);
    } catch {}
  }, 15000);

  // Optimizer API endpoints
  app.get('/api/optimizer/state', (req, res) => {
    res.json({
      generation: optGeneration, bestFitness: optBestFitness,
      bestConfig: optBestConfig, appliedConfig: optAppliedConfig,
      logs: optLogs.slice(-20), history: optHistory.slice(-30),
      populationSize: optPopulation.length,
    });
  });

  app.get('/api/optimizer/best', (req, res) => {
    res.json({ config: optBestConfig, fitness: optBestFitness, generation: optGeneration });
  });

  app.post('/api/optimizer/receive', express.json(), (req, res) => {
    const { config, fitness, source } = req.body;
    if (config && typeof fitness === 'number') {
      const localFitness = evaluateTrial(config);
      if (localFitness > optBestFitness * 0.95) {
        optPopulation[optPopulation.length - 1] = config;
        if (localFitness > optBestFitness) {
          optBestFitness = localFitness;
          optBestConfig = { ...config };
          optLogs.push(`[P2P] Adopted config from ${source || 'peer'}: ${localFitness.toFixed(1)}`);
        }
        res.json({ accepted: true, localFitness });
      } else {
        res.json({ accepted: false, localFitness });
      }
    } else {
      res.status(400).json({ error: 'Invalid config' });
    }
  });

  // Override autonomous state to include optimizer data for backward compat
  const origAutonomousHandler = app._router.stack.find((layer: any) =>
    layer.route && layer.route.path === '/api/autonomous/state' && layer.route.methods.get
  );
  // Add a new handler that wraps with optimizer data
  app.get('/api/autonomous/state-full', (req, res) => {
    const tasks = [
      ...optHistory.slice(-3).map((h, i) => ({
        id: i + 1, title: `Gen ${h.gen}: Fitness ${h.fitness.toFixed(1)}`,
        status: 'completed', progress: 100, algorithm: 'Genetic-Algorithm-v4'
      })),
      { id: 99, title: `Gen ${optGeneration}: Evolving...`, status: 'active', progress: 50, algorithm: 'GA-Optimizer' },
      { id: 100, title: 'Next generation evaluation', status: 'pending', progress: 0, algorithm: 'GA-Crossover' },
    ];
    res.json({
      ...autonomousState,
      tasks,
      optimizer: {
        generation: optGeneration, bestFitness: optBestFitness,
        populationSize: optPopulation.length,
      }
    });
  });

  // ============================================================
  // BAND EVOLUTION ENDPOINTS
  // ============================================================

  // Get best evolved band config
  app.get('/api/band/evolved', (req, res) => {
    res.json({
      bestConfig: bandBestConfig,
      bestFitness: bandBestFitness,
      populationSize: bandPopulation.length,
      generation: optGeneration,
    });
  });

  // Get full band population (for UI to browse)
  app.get('/api/band/population', (req, res) => {
    const scored = bandPopulation.map(cfg => ({
      config: cfg,
      fitness: evaluateBandConfig(cfg),
    }));
    scored.sort((a, b) => b.fitness - a.fitness);
    res.json(scored);
  });

  // Log a band session (from client when user plays)
  app.post('/api/band/session', express.json(), (req, res) => {
    const { sessionId, genre, bpm, key, harmonyMode, difficulty, barsPlayed, userNotes, aiNotes, effects, duration, config } = req.body;
    // Store the technical session summary in the first-party discovery memory.
    appendDiscovery({
      event: 'band-session',
      payload: { sessionId, genre, bpm, key, harmonyMode, difficulty, barsPlayed, userNotes, aiNotes, effects, duration, config },
      timestamp: Date.now()
    });
    saveToDisk();
    res.json({ success: true });
  });

  // ============================================================
  // CATCH-ALL for /api routes — MUST be after ALL route registrations
  // ============================================================
  app.all("/api/*", (req, res) => {
    console.warn(`[API] 404 Not Found: ${req.method} ${req.url}`);
    res.status(404).json({ error: "API route not found", method: req.method, url: req.url });
  });

  // Global error handler for /api routes
  app.use("/api/*", (err: any, req: any, res: any, next: any) => {
    console.error("[API Error] Uncaught Exception:", err);
    res.status(500).json({
      error: "Internal Server Error",
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  });

  // Vite middleware for development (MUST be after all /api routes)
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // --- Background Deep Learning (replaces fake random hash) ---
  // Real background evolution: even with no clients, keep evolving
  setInterval(() => {
    // Background learning continues via the optimizer loop above
    // Here we just do periodic extra explorations
    if (clients.size === 0) {
      const exploreCfg = randomConfig();
      const fitness = evaluateTrial(exploreCfg);
      if (fitness > optBestFitness * 0.8) {
        optPopulation[optPopulation.length - 1] = exploreCfg;
        optLogs.push(`[BG] Background exploration: ${fitness.toFixed(1)}`);
      }
      complexityCounter++;
      const hash = `bg-deep-${optGeneration}-${Date.now().toString(36)}`;
      rememberState(hash, { complexity: complexityCounter, timestamp: Date.now(), config: exploreCfg });
      saveToDisk();
    }
  }, 8000);

  httpServer.on("error", (e: any) => {
    if (e.code === 'EADDRINUSE') {
      console.error(`[Fatal] Port ${PORT} is already in use. Please stop the other process or use a different PORT.`);
      process.exit(1);
    } else {
      console.error("[Fatal] Server error:", e);
    }
  });

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`BeyondBound Server running on http://localhost:${PORT}`);
    console.log(`Novelty Engine Initialized. Memory: ${simMemory.size} nodes.`);
    console.log(`Persistent data directory: ${DATA_DIR}`);
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[Shutdown] ${signal} received; saving simulation state.`);

    if (saveTimeout) {
      clearTimeout(saveTimeout);
      saveTimeout = null;
    }
    try {
      persistToDisk();
    } catch (error) {
      console.error("[Shutdown] Failed to persist simulation state:", error);
    }

    clients.forEach((client) => client.terminate());
    wss.close();
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}

startServer();
