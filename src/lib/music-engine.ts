/**
 * Simcolt3 Live AI Band — Music Engine v2
 *
 * Complete rewrite: stereo field, harmonics on everything, LFO modulation,
 * real 808 synthesis, sub-bass layers, mic input with motif/key/BPM/time-sig
 * detection, 4-instrument chord voicing spread.
 */

// ============================================================
// TYPES
// ============================================================

export type Genre = 'jazz' | 'hiphop' | 'edm' | 'country' | 'rock';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type HarmonyMode = 'major' | 'minor' | 'dorian' | 'mixolydian' | 'blues' | 'phrygian';
export type ReharmonisationMode = 'none' | 'tritone_sub' | 'secondary_dominant' | 'modal_interchange' | 'chromatic_mediant';

export interface BandConfig {
  genre: Genre;
  bpm: number;
  key: number;
  harmonyMode: HarmonyMode;
  reharmonisation: ReharmonisationMode;
  difficulty: Difficulty;
  swing: number;
  chaos: number;
  volume: number;
  useInversions: boolean;
}

export interface SessionMemory {
  userNotes: { note: number; time: number; velocity: number; duration: number }[];
  aiNotes: { note: number; time: number; instrument: string; velocity: number }[];
  chordHistory: { chord: number[]; name: string; time: number }[];
  rhythmPatterns: number[][];
  improvisationSeeds: number[];
  noveltyHashes: Set<string>;
  stepCount: number;
}

export interface DrumHit {
  time: number;
  velocity: number;
  variation: number;
}

export interface DrumPattern {
  kick: DrumHit[];
  snare: DrumHit[];
  hihat: DrumHit[];
  cymbal: DrumHit[];
  perc: DrumHit[];
}

export interface MicAnalysis {
  detectedKey: number;
  detectedBPM: number;
  detectedTimeSig: number;
  phraseLength: number;   // bars
  motifNotes: number[];   // pitch classes
  motifRhythm: number[];  // onset deltas in ms
  instrument: 'voice' | 'guitar' | 'keys' | 'bass' | 'unknown';
  confidence: number;
}

// ============================================================
// MUSIC THEORY CONSTANTS
// ============================================================

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const SCALES: Record<HarmonyMode, number[]> = {
  major:       [0, 2, 4, 5, 7, 9, 11],
  minor:       [0, 2, 3, 5, 7, 8, 10],
  dorian:      [0, 2, 3, 5, 7, 9, 10],
  mixolydian:  [0, 2, 4, 5, 7, 9, 10],
  blues:       [0, 3, 5, 6, 7, 10],
  phrygian:    [0, 1, 3, 5, 7, 8, 10],
};

const CHORD_TYPES: Record<string, number[]> = {
  major:  [0, 4, 7],
  minor:  [0, 3, 7],
  dom7:   [0, 4, 7, 10],
  min7:   [0, 3, 7, 10],
  maj7:   [0, 4, 7, 11],
  dim:    [0, 3, 6],
  aug:    [0, 4, 8],
  sus4:   [0, 5, 7],
  min7b5: [0, 3, 6, 10],
  dim7:   [0, 3, 6, 9],
  add9:   [0, 4, 7, 14],
  '9':    [0, 4, 7, 10, 14],
};

const MAJOR_CHORD_QUALITIES = ['major', 'minor', 'minor', 'major', 'dom7', 'minor', 'dim'];
const MINOR_CHORD_QUALITIES = ['minor', 'dim', 'major', 'minor', 'minor', 'major', 'dom7'];

function mtof(note: number) { return 440 * Math.pow(2, (note - 69) / 12); }

// ============================================================
// SOUND ENGINE — Stereo, Harmonics, LFOs on everything
// ============================================================

export type EffectType = 'distortion' | 'delay' | 'chorus' | 'halfspeed';
export interface EffectState { enabled: boolean; params: Record<string, number>; }

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private reverb: ConvolverNode | null = null;
  private reverbGain: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private stereoMerger: ChannelMergerNode | null = null;

  // ── EFFECT CHAIN ── (inserted between master and dry/reverb split)
  private _effectSend: GainNode | null = null;   // master → effectSend
  private _effectReturn: GainNode | null = null;  // effectReturn → dry/reverb
  private _activeEffects: Map<EffectType, { input: GainNode; output: GainNode; nodes: AudioNode[] }> = new Map();
  effectStates: Map<EffectType, EffectState> = new Map([
    ['distortion', { enabled: false, params: { amount: 3, tone: 3000 } }],
    ['delay',      { enabled: false, params: { time: 0.375, feedback: 0.35, mix: 0.3 } }],
    ['chorus',     { enabled: false, params: { rate: 1.2, depth: 0.004, mix: 0.4 } }],
    ['halfspeed',  { enabled: false, params: { mix: 0.5 } }],
  ]);

  // ── CACHED BUFFERS (avoid per-hit allocation) ──
  private _noiseShort: AudioBuffer | null = null;  // 0.01s — clicks, transients
  private _noiseMed: AudioBuffer | null = null;    // 0.05s — hi-hats
  private _noiseLong: AudioBuffer | null = null;   // 0.3s — snares, cymbals
  private _noiseXLong: AudioBuffer | null = null;  // 2.5s — pads, long tails
  // Cached saturation curves
  private _satCurve2: Float32Array | null = null;
  private _satCurve3: Float32Array | null = null;
  private _satCurve4: Float32Array | null = null;
  // Reusable panner pool
  private _pannerPool: StereoPannerNode[] = [];
  private _pannerIdx = 0;

  init() {
    if (this.ctx) return;
    this.ctx = new AudioContext({ sampleRate: 44100 });

    // Master compressor — more aggressive for punch
    this.compressor = this.ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -18;
    this.compressor.knee.value = 6;
    this.compressor.ratio.value = 6;
    this.compressor.attack.value = 0.002;
    this.compressor.release.value = 0.15;

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.75;

    // Reverb send/return
    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.value = 0.18;
    this.dryGain = this.ctx.createGain();
    this.dryGain.gain.value = 0.82;

    this.reverb = this.ctx.createConvolver();
    this._buildReverbIR();

    // Effect chain send/return (insert point between master and dry/reverb)
    this._effectSend = this.ctx.createGain();
    this._effectSend.gain.value = 1;
    this._effectReturn = this.ctx.createGain();
    this._effectReturn.gain.value = 1;

    // Routing: master → effectSend → [effects] → effectReturn → dry + reverb → compressor → dest
    // Default (no effects): effectSend passes straight to effectReturn
    this.master.connect(this._effectSend);
    this._effectSend.connect(this._effectReturn);
    this._effectReturn.connect(this.dryGain);
    this.dryGain.connect(this.compressor);
    this._effectReturn.connect(this.reverbGain);
    this.reverbGain.connect(this.reverb);
    this.reverb.connect(this.compressor);
    this.compressor.connect(this.ctx.destination);

    // Pre-allocate noise buffers (avoids per-hit allocation)
    this._noiseShort = this._makeNoiseBuf(0.01);
    this._noiseMed = this._makeNoiseBuf(0.05);
    this._noiseLong = this._makeNoiseBuf(0.3);
    this._noiseXLong = this._makeNoiseBuf(2.5);

    // Pre-compute saturation curves
    this._satCurve2 = this._makeSatCurve(2);
    this._satCurve3 = this._makeSatCurve(3);
    this._satCurve4 = this._makeSatCurve(4);

    // Pre-allocate panner pool (reuse instead of creating new each note)
    for (let i = 0; i < 16; i++) {
      const p = this.ctx.createStereoPanner();
      p.connect(this.master);
      this._pannerPool.push(p);
    }
  }

  private _buildReverbIR() {
    if (!this.ctx || !this.reverb) return;
    const sr = this.ctx.sampleRate;
    const len = sr * 2.2;
    const buf = this.ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        // Early reflections + diffuse tail with stereo decorrelation
        const early = i < sr * 0.08 ? Math.sin(i * 0.01 * (ch + 1)) * 0.3 : 0;
        d[i] = ((Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.55)) + early)
             * (1 + 0.2 * Math.sin(i * 0.0003 * (ch + 1)));
      }
    }
    this.reverb.buffer = buf;
  }

  getContext() { return this.ctx; }
  getMaster() { return this.master; }
  getCurrentTime() { return this.ctx?.currentTime || 0; }
  resume() { this.ctx?.resume(); }
  suspend() { this.ctx?.suspend(); }

  setVolume(v: number) {
    if (this.master) this.master.gain.value = Math.max(0, Math.min(1, v));
  }

  setReverbMix(wet: number) {
    if (this.reverbGain) this.reverbGain.gain.value = wet;
    if (this.dryGain) this.dryGain.gain.value = 1 - wet;
  }

  // ── EFFECT PEDALS ────────────────────────────────────────
  // Each returns a node chain: input → ... → output (connect to master)

  /** Distortion/overdrive pedal */
  createDistortion(amount: number = 3, tone: number = 3000): { input: GainNode; output: GainNode } {
    if (!this.ctx) throw new Error('no ctx');
    const input = this.ctx.createGain();
    const output = this.ctx.createGain();
    const ws = this.ctx.createWaveShaper();
    ws.curve = this._makeSatCurve(amount);
    ws.oversample = '4x';
    const toneFilter = this.ctx.createBiquadFilter();
    toneFilter.type = 'lowpass';
    toneFilter.frequency.value = tone;
    toneFilter.Q.value = 0.7;
    input.connect(ws);
    ws.connect(toneFilter);
    toneFilter.connect(output);
    return { input, output };
  }

  /** Stereo delay pedal */
  createDelay(delayTime: number = 0.375, feedback: number = 0.35, mix: number = 0.3): { input: GainNode; output: GainNode } {
    if (!this.ctx) throw new Error('no ctx');
    const input = this.ctx.createGain();
    const output = this.ctx.createGain();
    const dry = this.ctx.createGain();
    dry.gain.value = 1 - mix;
    const wet = this.ctx.createGain();
    wet.gain.value = mix;
    const delayL = this.ctx.createDelay(2);
    delayL.delayTime.value = delayTime;
    const delayR = this.ctx.createDelay(2);
    delayR.delayTime.value = delayTime * 1.13; // Offset for stereo
    const fb = this.ctx.createGain();
    fb.gain.value = feedback;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 4000;
    // Routing
    input.connect(dry);
    dry.connect(output);
    input.connect(delayL);
    input.connect(delayR);
    delayL.connect(filter);
    delayR.connect(filter);
    filter.connect(fb);
    fb.connect(delayL);
    fb.connect(delayR);
    delayL.connect(wet);
    delayR.connect(wet);
    wet.connect(output);
    return { input, output };
  }

  /** Chorus pedal — modulated short delay for thickening */
  createChorus(rate: number = 1.2, depth: number = 0.004, mix: number = 0.4): { input: GainNode; output: GainNode } {
    if (!this.ctx) throw new Error('no ctx');
    const input = this.ctx.createGain();
    const output = this.ctx.createGain();
    const dry = this.ctx.createGain();
    dry.gain.value = 1 - mix;
    const wet = this.ctx.createGain();
    wet.gain.value = mix;
    const delay = this.ctx.createDelay(0.05);
    delay.delayTime.value = 0.012;
    // LFO modulates delay time
    const lfo = this.ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = rate;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = depth;
    lfo.connect(lfoGain);
    lfoGain.connect(delay.delayTime);
    lfo.start();
    input.connect(dry);
    dry.connect(output);
    input.connect(delay);
    delay.connect(wet);
    wet.connect(output);
    return { input, output };
  }

  /** Half-speed effect — doubles the delay buffer to sound an octave lower */
  createHalfSpeed(mix: number = 0.5): { input: GainNode; output: GainNode } {
    if (!this.ctx) throw new Error('no ctx');
    const input = this.ctx.createGain();
    const output = this.ctx.createGain();
    // Simulate octave-down via ring modulation
    const carrier = this.ctx.createOscillator();
    carrier.type = 'sine';
    // We'll modulate based on incoming signal's perceived pitch
    // Simple approach: ring mod with sub-fundamental
    const ringGain = this.ctx.createGain();
    ringGain.gain.value = mix;
    const dry = this.ctx.createGain();
    dry.gain.value = 1 - mix * 0.5;
    carrier.frequency.value = 0; // Will be set per-note
    input.connect(dry);
    dry.connect(output);
    input.connect(ringGain);
    ringGain.connect(output);
    carrier.connect(ringGain.gain);
    carrier.start();
    return { input, output };
  }

  // ── EFFECT CHAIN MANAGEMENT ─────────────────────────────────
  // Toggle an effect on/off and rebuild the chain
  toggleEffect(type: EffectType, enabled?: boolean) {
    const state = this.effectStates.get(type);
    if (!state) return;
    state.enabled = enabled !== undefined ? enabled : !state.enabled;
    this._rebuildEffectChain();
  }

  setEffectParam(type: EffectType, param: string, value: number) {
    const state = this.effectStates.get(type);
    if (!state) return;
    state.params[param] = value;
    if (state.enabled) this._rebuildEffectChain();
  }

  getEffectStates(): Map<EffectType, EffectState> {
    return this.effectStates;
  }

  private _rebuildEffectChain() {
    if (!this.ctx || !this._effectSend || !this._effectReturn) return;

    // Disconnect existing chain
    this._effectSend.disconnect();
    for (const [, fx] of this._activeEffects) {
      try { fx.input.disconnect(); } catch {}
      try { fx.output.disconnect(); } catch {}
    }
    this._activeEffects.clear();

    // Collect enabled effects in order
    const order: EffectType[] = ['distortion', 'chorus', 'delay', 'halfspeed'];
    const enabled = order.filter(t => this.effectStates.get(t)?.enabled);

    if (enabled.length === 0) {
      // Bypass: send → return directly
      this._effectSend.connect(this._effectReturn);
      return;
    }

    // Build chain: send → fx1 → fx2 → ... → return
    let prevOutput: AudioNode = this._effectSend;
    for (const type of enabled) {
      const state = this.effectStates.get(type)!;
      let fx: { input: GainNode; output: GainNode };
      switch (type) {
        case 'distortion':
          fx = this.createDistortion(state.params.amount, state.params.tone);
          break;
        case 'delay':
          fx = this.createDelay(state.params.time, state.params.feedback, state.params.mix);
          break;
        case 'chorus':
          fx = this.createChorus(state.params.rate, state.params.depth, state.params.mix);
          break;
        case 'halfspeed':
          fx = this.createHalfSpeed(state.params.mix);
          break;
      }
      prevOutput.connect(fx.input);
      this._activeEffects.set(type, { input: fx.input, output: fx.output, nodes: [] });
      prevOutput = fx.output;
    }
    prevOutput.connect(this._effectReturn);
  }

  // ── Auto-harmonize: ensures every sine gets 2nd + 3rd partials ──
  private _autoHarmonize(freq: number, t: number, dur: number, vol: number, dest: AudioNode) {
    if (!this.ctx) return;
    // Add 2nd harmonic (octave)
    const h2 = this.ctx.createOscillator();
    h2.type = 'sine';
    h2.frequency.value = freq * 2;
    const h2g = this.ctx.createGain();
    h2g.gain.setValueAtTime(vol * 0.12, t);
    h2g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    h2.connect(h2g);
    h2g.connect(dest);
    h2.start(t); h2.stop(t + dur + 0.05);

    // Add 3rd harmonic (octave + fifth)
    const h3 = this.ctx.createOscillator();
    h3.type = 'sine';
    h3.frequency.value = freq * 3;
    const h3g = this.ctx.createGain();
    h3g.gain.setValueAtTime(vol * 0.06, t);
    h3g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    h3.connect(h3g);
    h3g.connect(dest);
    h3.start(t); h3.stop(t + dur + 0.05);

    // Add 5th partial for shimmer
    const h5 = this.ctx.createOscillator();
    h5.type = 'sine';
    h5.frequency.value = freq * 5;
    const h5g = this.ctx.createGain();
    h5g.gain.setValueAtTime(vol * 0.025, t);
    h5g.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.5);
    h5.connect(h5g);
    h5g.connect(dest);
    h5.start(t); h5.stop(t + dur * 0.5 + 0.05);
  }

  // ── Reece bass (2 detuned saws + sub, optimized) ─────────
  playReeceBass(time: number, note: number, duration: number, velocity: number = 0.7, genre: Genre = 'edm') {
    if (!this.ctx || !this.master) return;
    const t = time;
    const freq = mtof(note);
    const pan = this._pan(0);

    // Sub sine — clean fundamental
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = freq;
    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(0, t);
    subGain.gain.linearRampToValueAtTime(velocity * 0.5, t + 0.005);
    subGain.gain.linearRampToValueAtTime(0, t + duration);
    sub.connect(subGain);
    subGain.connect(pan);

    // 2 detuned saws (was 3 + 3 LFOs = 9 nodes → now 2 nodes)
    const sawMerge = this.ctx.createGain();
    sawMerge.gain.value = 0.35;
    const s1 = this.ctx.createOscillator();
    s1.type = 'sawtooth'; s1.frequency.value = freq; s1.detune.value = -20;
    s1.connect(sawMerge); s1.start(t); s1.stop(t + duration + 0.05);
    const s2 = this.ctx.createOscillator();
    s2.type = 'sawtooth'; s2.frequency.value = freq; s2.detune.value = 20;
    s2.connect(sawMerge); s2.start(t); s2.stop(t + duration + 0.05);

    // Filter sweep (no LFO — use automation instead)
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const fStart = genre === 'edm' ? 5000 : 2500;
    filter.frequency.setValueAtTime(fStart, t);
    filter.frequency.exponentialRampToValueAtTime(400, t + duration * 0.5);
    filter.frequency.exponentialRampToValueAtTime(fStart * 0.4, t + duration * 0.85);
    filter.Q.value = 4;

    // Saturation (use cached curve)
    const sat = this.ctx.createWaveShaper();
    sat.curve = this._getSatCurve(4);
    sat.oversample = '2x';

    // Envelope
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(velocity * 0.35, t + 0.008);
    env.gain.linearRampToValueAtTime(0, t + duration);

    sawMerge.connect(filter);
    filter.connect(sat);
    sat.connect(env);
    env.connect(pan);

    sub.start(t); sub.stop(t + duration + 0.05);
  }

  // ── Drum break kick (optimized: 4 nodes total) ──────────
  playBreakKick(time: number, velocity: number = 0.85) {
    if (!this.ctx || !this.master) return;
    const t = time;
    const pan = this._pan((Math.random() - 0.5) * 0.08);

    // Body — pitched sine sweep
    const body = this.ctx.createOscillator();
    body.type = 'sine';
    body.frequency.setValueAtTime(160, t);
    body.frequency.exponentialRampToValueAtTime(45, t + 0.04);
    const bodyG = this.ctx.createGain();
    bodyG.gain.setValueAtTime(velocity * 0.9, t);
    bodyG.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    body.connect(bodyG);
    bodyG.connect(pan);

    // Click transient (noise burst through HP)
    const click = this.ctx.createBufferSource();
    click.buffer = this._noiseBuf(0.008);
    const clickG = this.ctx.createGain();
    clickG.gain.setValueAtTime(velocity * 0.35, t);
    clickG.gain.exponentialRampToValueAtTime(0.001, t + 0.008);
    click.connect(clickG);
    clickG.connect(pan);

    body.start(t); body.stop(t + 0.2);
    click.start(t); click.stop(t + 0.012);
  }

  // ── Drum break snare (optimized: 5 nodes total) ─────────
  playBreakSnare(time: number, velocity: number = 0.8) {
    if (!this.ctx || !this.master) return;
    const t = time;
    const pan = this._pan((Math.random() - 0.5) * 0.2);

    // Body — tight thump
    const body = this.ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(220, t);
    body.frequency.exponentialRampToValueAtTime(120, t + 0.03);
    const bodyG = this.ctx.createGain();
    bodyG.gain.setValueAtTime(velocity * 0.5, t);
    bodyG.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    body.connect(bodyG);
    bodyG.connect(pan);

    // Noise with HP — the snare wire character
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._noiseBuf(0.25);
    const nHP = this.ctx.createBiquadFilter();
    nHP.type = 'highpass'; nHP.frequency.value = 1800;
    const nG = this.ctx.createGain();
    nG.gain.setValueAtTime(velocity * 0.6, t);
    nG.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    noise.connect(nHP);
    nHP.connect(nG);
    nG.connect(pan);

    body.start(t); body.stop(t + 0.1);
    noise.start(t); noise.stop(t + 0.25);
  }

  // ── Stereo panner helper (uses pool to avoid allocation) ─
  private _pan(pan: number): StereoPannerNode {
    const p = this._pannerPool[this._pannerIdx % this._pannerPool.length];
    this._pannerIdx++;
    p.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), this.ctx!.currentTime);
    return p;
  }

  // ── LFO helper: returns an oscillator → gain modulator ───
  private _lfo(rate: number, depth: number, target: AudioParam, t: number, dur: number) {
    if (!this.ctx) return;
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = rate;
    lfoGain.gain.value = depth;
    lfo.connect(lfoGain);
    lfoGain.connect(target);
    lfo.start(t);
    lfo.stop(t + dur + 0.1);
  }

  // ── Saturation curve builder ─────────────────────────────
  private _makeSatCurve(amount: number = 2.5): Float32Array {
    const n = 512;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n / 2)) - 1;
      curve[i] = Math.tanh(x * amount);
    }
    return curve;
  }

  // ── Raw noise buffer maker (used only at init) ──────────
  private _makeNoiseBuf(dur: number): AudioBuffer {
    const sr = this.ctx!.sampleRate;
    const len = Math.floor(sr * dur);
    const buf = this.ctx!.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  // ── Cached noise buffer getter (picks closest pre-made buffer) ──
  private _noiseBuf(dur: number): AudioBuffer {
    if (dur <= 0.015) return this._noiseShort!;
    if (dur <= 0.08) return this._noiseMed!;
    if (dur <= 0.5) return this._noiseLong!;
    return this._noiseXLong!;
  }

  // ── Cached saturation curve getter ──────────────────────
  private _getSatCurve(amount: number): Float32Array {
    if (amount <= 2.5) return this._satCurve2!;
    if (amount <= 3.5) return this._satCurve3!;
    return this._satCurve4!;
  }

  // ============================================================
  // KICK — multi-layer: sub sine + body + click + harmonics, stereo
  // ============================================================
  playKick(time: number, velocity: number = 0.8, genre: Genre = 'rock') {
    if (!this.ctx || !this.master) return;
    const t = time;
    const pan = this._pan((Math.random() - 0.5) * 0.15); // Near center

    // Sub layer — deep sine
    const sub = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    sub.type = 'sine';
    const subStart = genre === 'edm' ? 90 : genre === 'hiphop' ? 80 : genre === 'jazz' ? 70 : 85;
    const subEnd = genre === 'edm' ? 28 : genre === 'hiphop' ? 25 : genre === 'jazz' ? 45 : 35;
    const subDecay = genre === 'hiphop' ? 0.55 : genre === 'edm' ? 0.45 : genre === 'jazz' ? 0.12 : 0.25;
    sub.frequency.setValueAtTime(subStart, t);
    sub.frequency.exponentialRampToValueAtTime(subEnd, t + 0.06);
    subGain.gain.setValueAtTime(velocity * 0.85, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + subDecay);
    sub.connect(subGain);
    subGain.connect(pan);
    sub.start(t); sub.stop(t + subDecay + 0.05);

    // Body — pitched sine with 2nd harmonic
    const body = this.ctx.createOscillator();
    const body2 = this.ctx.createOscillator();
    const bodyGain = this.ctx.createGain();
    body.type = 'sine';
    body2.type = 'sine';
    const bStart = genre === 'edm' ? 200 : genre === 'hiphop' ? 170 : 150;
    body.frequency.setValueAtTime(bStart, t);
    body.frequency.exponentialRampToValueAtTime(40, t + 0.08);
    body2.frequency.setValueAtTime(bStart * 2, t);
    body2.frequency.exponentialRampToValueAtTime(80, t + 0.08);
    bodyGain.gain.setValueAtTime(velocity * 0.45, t);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    body.connect(bodyGain);
    body2.connect(bodyGain);
    bodyGain.connect(pan);
    body.start(t); body.stop(t + 0.2);
    body2.start(t); body2.stop(t + 0.2);

    // Click transient — short burst of filtered noise + square
    const clickOsc = this.ctx.createOscillator();
    const clickGain = this.ctx.createGain();
    const clickFilter = this.ctx.createBiquadFilter();
    clickOsc.type = 'square';
    clickOsc.frequency.setValueAtTime(1800, t);
    clickOsc.frequency.exponentialRampToValueAtTime(200, t + 0.008);
    clickFilter.type = 'bandpass';
    clickFilter.frequency.value = 3500;
    clickFilter.Q.value = 2;
    clickGain.gain.setValueAtTime(velocity * 0.35, t);
    clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.015);
    clickOsc.connect(clickFilter);
    clickFilter.connect(clickGain);
    clickGain.connect(pan);
    clickOsc.start(t); clickOsc.stop(t + 0.025);

    // Noise punch
    const nSrc = this.ctx.createBufferSource();
    nSrc.buffer = this._noiseBuf(0.03);
    const nGain = this.ctx.createGain();
    const nHP = this.ctx.createBiquadFilter();
    nHP.type = 'highpass'; nHP.frequency.value = 800;
    nGain.gain.setValueAtTime(velocity * 0.15, t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
    nSrc.connect(nHP); nHP.connect(nGain); nGain.connect(pan);
    nSrc.start(t); nSrc.stop(t + 0.04);
  }

  // ============================================================
  // 808 — real TR-808: sine sub with pitch env, 2nd/3rd harmonics,
  //       saturation, LFO on filter, long decay, stereo
  // ============================================================
  play808(time: number, velocity: number = 0.8, note: number = 36) {
    if (!this.ctx || !this.master) return;
    const t = time;
    const freq = mtof(note);
    const pan = this._pan(0); // Dead center for 808

    // Sub fundamental — long sine with pitch drop
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(freq * 3.5, t);
    sub.frequency.exponentialRampToValueAtTime(freq, t + 0.04);

    // 2nd harmonic for warmth
    const h2 = this.ctx.createOscillator();
    h2.type = 'sine';
    h2.frequency.setValueAtTime(freq * 7, t);
    h2.frequency.exponentialRampToValueAtTime(freq * 2, t + 0.04);
    const h2Gain = this.ctx.createGain();
    h2Gain.gain.value = 0.15;

    // 3rd harmonic — slight odd for grit
    const h3 = this.ctx.createOscillator();
    h3.type = 'sine';
    h3.frequency.setValueAtTime(freq * 10, t);
    h3.frequency.exponentialRampToValueAtTime(freq * 3, t + 0.04);
    const h3Gain = this.ctx.createGain();
    h3Gain.gain.value = 0.06;

    // Merge harmonics
    const merge = this.ctx.createGain();
    merge.gain.value = 1;
    sub.connect(merge);
    h2.connect(h2Gain); h2Gain.connect(merge);
    h3.connect(h3Gain); h3Gain.connect(merge);

    // Saturation — warm tanh distortion
    const dist = this.ctx.createWaveShaper();
    dist.curve = this._getSatCurve(3);
    dist.oversample = '4x';

    // Filter with LFO modulation
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 8, t);
    filter.frequency.exponentialRampToValueAtTime(freq * 2, t + 0.8);
    filter.Q.value = 1.5;

    // LFO on filter cutoff — subtle wobble
    this._lfo(0.8, freq * 0.5, filter.frequency, t, 1.8);

    // Envelope — long 808 decay
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(velocity * 0.9, t + 0.003);
    env.gain.setValueAtTime(velocity * 0.85, t + 0.05);
    env.gain.exponentialRampToValueAtTime(0.001, t + 1.8);

    // Signal chain
    merge.connect(dist);
    dist.connect(filter);
    filter.connect(env);
    env.connect(pan);

    sub.start(t); sub.stop(t + 2);
    h2.start(t); h2.stop(t + 2);
    h3.start(t); h3.stop(t + 2);
  }

  // ============================================================
  // SNARE — body + snare wire noise (stereo spread) + ring harmonics + LFO
  // ============================================================
  playSnare(time: number, velocity: number = 0.7, genre: Genre = 'rock') {
    if (!this.ctx || !this.master) return;
    const t = time;
    const pan = this._pan((Math.random() - 0.5) * 0.3); // Slight random pan

    const noiseDecay = genre === 'jazz' ? 0.15 : genre === 'hiphop' ? 0.3 : genre === 'edm' ? 0.18 : 0.22;
    const bodyFreq = genre === 'jazz' ? 230 : genre === 'hiphop' ? 170 : genre === 'rock' ? 200 : 190;

    // ── Snare wire noise — stereo with spread ──
    const nSrc = this.ctx.createBufferSource();
    nSrc.buffer = this._noiseBuf(noiseDecay + 0.1);
    const nHP = this.ctx.createBiquadFilter();
    nHP.type = 'highpass';
    nHP.frequency.value = genre === 'jazz' ? 2800 : genre === 'hiphop' ? 1800 : 2200;
    const nBP = this.ctx.createBiquadFilter();
    nBP.type = 'peaking';
    nBP.frequency.value = 5000;
    nBP.Q.value = 1.5;
    nBP.gain.value = 6;
    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(velocity * 0.55, t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + noiseDecay);
    // LFO on noise filter for shimmer
    this._lfo(12, 400, nHP.frequency, t, noiseDecay);
    nSrc.connect(nHP); nHP.connect(nBP); nBP.connect(nGain); nGain.connect(pan);
    nSrc.start(t); nSrc.stop(t + noiseDecay + 0.1);

    // ── Body tone — sine + triangle harmonic ──
    const body = this.ctx.createOscillator();
    const bodyH = this.ctx.createOscillator();
    const bodyGain = this.ctx.createGain();
    body.type = 'sine';
    bodyH.type = 'triangle';
    body.frequency.setValueAtTime(bodyFreq, t);
    body.frequency.exponentialRampToValueAtTime(bodyFreq * 0.5, t + 0.04);
    bodyH.frequency.setValueAtTime(bodyFreq * 1.71, t); // Inharmonic for character
    bodyH.frequency.exponentialRampToValueAtTime(bodyFreq * 0.8, t + 0.04);
    const bodyHGain = this.ctx.createGain();
    bodyHGain.gain.value = 0.25;
    bodyGain.gain.setValueAtTime(velocity * 0.5, t);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    body.connect(bodyGain);
    bodyH.connect(bodyHGain); bodyHGain.connect(bodyGain);
    bodyGain.connect(pan);
    body.start(t); body.stop(t + 0.12);
    bodyH.start(t); bodyH.stop(t + 0.12);

    // ── Ring — metallic overtone ──
    const ring = this.ctx.createOscillator();
    const ringGain = this.ctx.createGain();
    ring.type = 'square';
    ring.frequency.setValueAtTime(bodyFreq * 3.2, t);
    ring.frequency.exponentialRampToValueAtTime(bodyFreq * 2, t + 0.02);
    ringGain.gain.setValueAtTime(velocity * 0.08, t);
    ringGain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    const ringFilter = this.ctx.createBiquadFilter();
    ringFilter.type = 'bandpass';
    ringFilter.frequency.value = 1200;
    ringFilter.Q.value = 3;
    ring.connect(ringFilter); ringFilter.connect(ringGain); ringGain.connect(pan);
    ring.start(t); ring.stop(t + 0.06);
  }

  // ============================================================
  // HI-HAT — 2 square oscs + noise, bandpass, stereo
  // (Reduced from 6 oscs to 2 for performance)
  // ============================================================
  playHihat(time: number, velocity: number = 0.4, open: boolean = false, genre: Genre = 'rock') {
    if (!this.ctx || !this.master) return;
    const t = time;
    const decay = open ? 0.35 : (genre === 'jazz' ? 0.065 : genre === 'edm' ? 0.05 : 0.045);
    const pan = this._pan(-0.3 + Math.random() * 0.15);

    // 2 detuned square oscillators (metallic character, was 6)
    const merge = this.ctx.createGain();
    merge.gain.setValueAtTime(velocity * 0.2, t);
    merge.gain.exponentialRampToValueAtTime(0.001, t + decay);

    const mult = genre === 'jazz' ? 1.1 : genre === 'edm' ? 1.2 : 1;
    const o1 = this.ctx.createOscillator();
    o1.type = 'square'; o1.frequency.value = 396 * mult;
    o1.connect(merge); o1.start(t); o1.stop(t + decay + 0.02);
    const o2 = this.ctx.createOscillator();
    o2.type = 'square'; o2.frequency.value = 649 * mult;
    o2.connect(merge); o2.start(t); o2.stop(t + decay + 0.02);

    // Noise
    const nSrc = this.ctx.createBufferSource();
    nSrc.buffer = this._noiseBuf(decay);
    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(velocity * 0.3, t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + decay);
    nSrc.connect(nGain);

    // Single bandpass + highpass
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = genre === 'jazz' ? 8000 : 6500;

    merge.connect(hp);
    nGain.connect(hp);
    hp.connect(pan);

    nSrc.start(t); nSrc.stop(t + decay + 0.02);
  }

  // ============================================================
  // CYMBAL — detuned osc stack + filtered noise, long stereo tail
  // ============================================================
  playCymbal(time: number, velocity: number = 0.5, type: 'crash' | 'ride' = 'ride', genre: Genre = 'rock') {
    if (!this.ctx || !this.master) return;
    const t = time;
    const dur = type === 'crash' ? 2.0 : 0.5;
    const pan = this._pan(type === 'ride' ? 0.35 : -0.15 + Math.random() * 0.3);

    // Metallic oscillators — inharmonic ratios
    const ratios = [1, 1.34, 1.68, 2.14, 2.76, 3.24];
    const baseFreq = type === 'ride' ? 340 : 280;
    const oscOut = this.ctx.createGain();
    oscOut.gain.setValueAtTime(velocity * 0.12, t);
    oscOut.gain.exponentialRampToValueAtTime(0.001, t + dur);

    for (const r of ratios) {
      const o = this.ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = baseFreq * r;
      o.connect(oscOut);
      o.start(t); o.stop(t + dur + 0.1);
    }

    // Noise body
    const nSrc = this.ctx.createBufferSource();
    nSrc.buffer = this._noiseBuf(dur + 0.1);
    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(velocity * 0.2, t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    // Filter shaping
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = type === 'ride' ? 5800 : 4200;
    bp.Q.value = 0.6;
    const peak = this.ctx.createBiquadFilter();
    peak.type = 'peaking';
    peak.frequency.value = type === 'ride' ? 8000 : 3500;
    peak.Q.value = 2;
    peak.gain.value = 4;

    // No LFO here — saves 2 nodes per cymbal hit

    oscOut.connect(bp);
    nSrc.connect(bp);
    bp.connect(peak);
    peak.connect(pan);

    nSrc.start(t); nSrc.stop(t + dur + 0.1);
  }

  // ============================================================
  // BASS — sub sine + mid saw/triangle harmonic + LFO filter, stereo width
  // ============================================================
  playBass(time: number, note: number, duration: number, velocity: number = 0.7, genre: Genre = 'jazz') {
    if (!this.ctx || !this.master) return;
    const t = time;
    const freq = mtof(note);
    const pan = this._pan(0); // Center for bass

    // Sub oscillator — pure sine, below everything
    const sub = this.ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = freq;
    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(0, t);
    subGain.gain.linearRampToValueAtTime(velocity * 0.5, t + 0.008);
    subGain.gain.setValueAtTime(velocity * 0.45, t + 0.02);
    subGain.gain.linearRampToValueAtTime(0, t + duration);

    // Mid harmonic — adds character above the sub
    const mid = this.ctx.createOscillator();
    mid.type = genre === 'jazz' ? 'sawtooth' : genre === 'rock' ? 'sawtooth' : 'triangle';
    mid.frequency.value = freq;
    // Detune for width
    const mid2 = this.ctx.createOscillator();
    mid2.type = mid.type;
    mid2.frequency.value = freq * 1.005;
    mid2.detune.value = 8;

    const midGain = this.ctx.createGain();
    midGain.gain.setValueAtTime(0, t);
    midGain.gain.linearRampToValueAtTime(velocity * 0.25, t + 0.01);
    midGain.gain.setValueAtTime(velocity * 0.2, t + 0.02);
    midGain.gain.linearRampToValueAtTime(0, t + duration);

    // 2nd harmonic for growl
    const h2 = this.ctx.createOscillator();
    h2.type = 'sine';
    h2.frequency.value = freq * 2;
    const h2Gain = this.ctx.createGain();
    h2Gain.gain.setValueAtTime(0, t);
    h2Gain.gain.linearRampToValueAtTime(velocity * 0.08, t + 0.01);
    h2Gain.gain.linearRampToValueAtTime(0, t + duration);

    // Filter with LFO
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const fCut = genre === 'jazz' ? 900 : genre === 'rock' ? 1200 : genre === 'hiphop' ? 600 : 800;
    filter.frequency.setValueAtTime(fCut * 2, t);
    filter.frequency.exponentialRampToValueAtTime(fCut, t + duration * 0.5);
    filter.Q.value = 2;

    // LFO on filter — subtle movement
    this._lfo(genre === 'edm' ? 4 : 1.5, fCut * 0.15, filter.frequency, t, duration);

    // Saturation
    const sat = this.ctx.createWaveShaper();
    sat.curve = this._getSatCurve(genre === 'rock' ? 3 : 1.8);
    sat.oversample = '2x';

    // Routing
    sub.connect(subGain); subGain.connect(pan); // Sub goes direct to pan (clean)
    mid.connect(midGain); mid2.connect(midGain);
    h2.connect(h2Gain); h2Gain.connect(filter);
    midGain.connect(filter);
    filter.connect(sat);
    sat.connect(pan);

    sub.start(t); sub.stop(t + duration + 0.05);
    mid.start(t); mid.stop(t + duration + 0.05);
    mid2.start(t); mid2.stop(t + duration + 0.05);
    h2.start(t); h2.stop(t + duration + 0.05);
  }

  // ============================================================
  // PAD — warm stereo pad (for chord instrument 1)
  // ============================================================
  playPad(time: number, note: number, duration: number, velocity: number = 0.3, genre: Genre = 'jazz') {
    if (!this.ctx || !this.master) return;
    const t = time;
    const freq = mtof(note);
    const panVal = (note % 12 - 6) / 12; // Spread by pitch
    const pan = this._pan(panVal);

    // 3 detuned saws for thick pad
    const oscs: OscillatorNode[] = [];
    const detunes = [-8, 0, 8];
    const merge = this.ctx.createGain();
    merge.gain.value = 0.33;

    for (const d of detunes) {
      const o = this.ctx.createOscillator();
      o.type = genre === 'jazz' ? 'sine' : genre === 'edm' ? 'sawtooth' : 'triangle';
      o.frequency.value = freq;
      o.detune.value = d;
      o.connect(merge);
      oscs.push(o);
    }

    // Filter with slow LFO
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const cutoff = genre === 'jazz' ? 1500 : genre === 'edm' ? 4000 : 2500;
    filter.frequency.value = cutoff;
    filter.Q.value = 1.5;
    this._lfo(0.3, cutoff * 0.2, filter.frequency, t, duration);

    // Slow attack, long release
    const env = this.ctx.createGain();
    const attack = genre === 'edm' ? 0.05 : 0.15;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(velocity * 0.25, t + attack);
    env.gain.setValueAtTime(velocity * 0.2, t + attack + 0.01);
    env.gain.linearRampToValueAtTime(0, t + duration);

    merge.connect(filter);
    filter.connect(env);
    env.connect(pan);

    oscs.forEach(o => { o.start(t); o.stop(t + duration + 0.1); });
  }

  // ============================================================
  // KEYS — electric piano / rhodes-like (chord instrument 2)
  // ============================================================
  playKeys(time: number, note: number, duration: number, velocity: number = 0.3, genre: Genre = 'jazz') {
    if (!this.ctx || !this.master) return;
    const t = time;
    const freq = mtof(note);
    const pan = this._pan((note % 12 - 6) / 18 + 0.2);

    // Sine + bell harmonic (FM-like)
    const carrier = this.ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = freq;

    const mod = this.ctx.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = freq * (genre === 'jazz' ? 7 : 3);
    const modGain = this.ctx.createGain();
    modGain.gain.setValueAtTime(freq * 0.5, t);
    modGain.gain.exponentialRampToValueAtTime(freq * 0.05, t + duration * 0.5);
    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    // Harmonic overtone
    const h = this.ctx.createOscillator();
    h.type = 'sine';
    h.frequency.value = freq * 2;
    const hGain = this.ctx.createGain();
    hGain.gain.setValueAtTime(velocity * 0.1, t);
    hGain.gain.exponentialRampToValueAtTime(0.001, t + duration * 0.3);

    // Envelope — percussive attack
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(velocity * 0.3, t + 0.005);
    env.gain.setValueAtTime(velocity * 0.22, t + 0.03);
    env.gain.exponentialRampToValueAtTime(0.001, t + duration);

    // Gentle filter
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3500, t);
    filter.frequency.exponentialRampToValueAtTime(1500, t + duration);
    filter.Q.value = 1;

    carrier.connect(filter);
    h.connect(hGain); hGain.connect(filter);
    filter.connect(env);
    env.connect(pan);

    carrier.start(t); carrier.stop(t + duration + 0.05);
    mod.start(t); mod.stop(t + duration + 0.05);
    h.start(t); h.stop(t + duration + 0.05);
  }

  // ============================================================
  // PLUCK — guitar/pluck-like (chord instrument 3)
  // ============================================================
  playPluck(time: number, note: number, duration: number, velocity: number = 0.3, genre: Genre = 'jazz') {
    if (!this.ctx || !this.master) return;
    const t = time;
    const freq = mtof(note);
    const pan = this._pan((note % 12 - 6) / 18 - 0.2);

    // Karplus-Strong-ish: noise burst → comb filter effect via delay
    // Simplified: use short noise burst + resonant filter
    const nSrc = this.ctx.createBufferSource();
    nSrc.buffer = this._noiseBuf(0.015);
    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(velocity * 0.6, t);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.02);

    // Body oscillator
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const osc2 = this.ctx.createOscillator();
    osc2.type = 'sawtooth';
    osc2.frequency.value = freq * 1.002;
    const oscGain = this.ctx.createGain();
    oscGain.gain.value = 0.5;

    // Harmonic
    const h3 = this.ctx.createOscillator();
    h3.type = 'sine';
    h3.frequency.value = freq * 3;
    const h3Gain = this.ctx.createGain();
    h3Gain.gain.setValueAtTime(velocity * 0.06, t);
    h3Gain.gain.exponentialRampToValueAtTime(0.001, t + duration * 0.3);

    // Filter — bright attack, quick decay
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(5000, t);
    filter.frequency.exponentialRampToValueAtTime(800, t + duration * 0.4);
    filter.Q.value = 2;

    // Envelope — sharp attack, natural decay
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(velocity * 0.3, t + 0.003);
    env.gain.setValueAtTime(velocity * 0.2, t + 0.02);
    env.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(oscGain); osc2.connect(oscGain);
    nSrc.connect(nGain);
    nGain.connect(filter);
    oscGain.connect(filter);
    h3.connect(h3Gain); h3Gain.connect(filter);
    filter.connect(env);
    env.connect(pan);

    nSrc.start(t); nSrc.stop(t + 0.03);
    osc.start(t); osc.stop(t + duration + 0.05);
    osc2.start(t); osc2.stop(t + duration + 0.05);
    h3.start(t); h3.stop(t + duration + 0.05);
  }

  // ============================================================
  // STRINGS — slow-attack ensemble (chord instrument 4)
  // ============================================================
  playStrings(time: number, note: number, duration: number, velocity: number = 0.25, genre: Genre = 'jazz') {
    if (!this.ctx || !this.master) return;
    const t = time;
    const freq = mtof(note);
    const pan = this._pan((note % 12 - 6) / 15);

    // 2 detuned saws (was 4 + 5 LFOs = 14 nodes → now 2 nodes)
    const merge = this.ctx.createGain();
    merge.gain.value = 0.3;

    const o1 = this.ctx.createOscillator();
    o1.type = 'sawtooth'; o1.frequency.value = freq; o1.detune.value = -10;
    o1.connect(merge); o1.start(t); o1.stop(t + duration + 0.1);
    const o2 = this.ctx.createOscillator();
    o2.type = 'sawtooth'; o2.frequency.value = freq; o2.detune.value = 10;
    o2.connect(merge); o2.start(t); o2.stop(t + duration + 0.1);

    // Filter — warm, no LFO
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2000;
    filter.Q.value = 0.7;

    // Slow attack envelope
    const env = this.ctx.createGain();
    const atk = Math.min(0.3, duration * 0.3);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(velocity * 0.2, t + atk);
    env.gain.setValueAtTime(velocity * 0.18, t + atk + 0.01);
    env.gain.linearRampToValueAtTime(0, t + duration);

    merge.connect(filter);
    filter.connect(env);
    env.connect(pan);
  }

  // ============================================================
  // MELODIC NOTE — for lead melody / user playback
  // ============================================================
  playNote(time: number, note: number, duration: number, velocity: number = 0.6, genre: Genre = 'jazz') {
    if (!this.ctx || !this.master) return;
    const t = time;
    const freq = mtof(note);
    const pan = this._pan((note % 12 - 6) / 20);

    const oscType: OscillatorType = genre === 'jazz' ? 'sine' :
      genre === 'edm' ? 'sawtooth' : genre === 'rock' ? 'square' : 'triangle';

    // Main + detuned for width
    const osc = this.ctx.createOscillator();
    osc.type = oscType;
    osc.frequency.value = freq;
    const osc2 = this.ctx.createOscillator();
    osc2.type = oscType;
    osc2.frequency.value = freq;
    osc2.detune.value = 10;

    // 2nd harmonic
    const h2 = this.ctx.createOscillator();
    h2.type = 'sine';
    h2.frequency.value = freq * 2;
    const h2Gain = this.ctx.createGain();
    h2Gain.gain.value = 0.08;

    // Vibrato LFO on pitch
    this._lfo(5.2, 4, osc.detune, t, duration);

    // Filter with LFO
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    const fBase = genre === 'jazz' ? 2200 : genre === 'edm' ? 6000 : 3500;
    filter.frequency.setValueAtTime(fBase, t);
    filter.frequency.linearRampToValueAtTime(fBase * 0.3, t + duration);
    filter.Q.value = genre === 'edm' ? 4 : 1.5;
    this._lfo(genre === 'edm' ? 3 : 1, fBase * 0.1, filter.frequency, t, duration);

    // Envelope
    const env = this.ctx.createGain();
    const atk = genre === 'edm' ? 0.005 : 0.015;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(velocity * 0.35, t + atk);
    env.gain.setValueAtTime(velocity * 0.28, t + atk + 0.01);
    env.gain.linearRampToValueAtTime(0, t + duration);

    osc.connect(filter); osc2.connect(filter);
    h2.connect(h2Gain); h2Gain.connect(filter);
    filter.connect(env);
    env.connect(pan);

    osc.start(t); osc.stop(t + duration + 0.05);
    osc2.start(t); osc2.stop(t + duration + 0.05);
    h2.start(t); h2.stop(t + duration + 0.05);
  }
}

// ============================================================
// MIC INPUT + MOTIF ANALYZER
// ============================================================

export class MicAnalyzer {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private buffer: Float32Array = new Float32Array(2048);
  private pitchHistory: number[] = [];
  private onsetHistory: number[] = [];  // timestamps in ms
  private running = false;
  private frameId = 0;

  // Public analysis results
  analysis: MicAnalysis = {
    detectedKey: 0, detectedBPM: 120, detectedTimeSig: 4,
    phraseLength: 4, motifNotes: [], motifRhythm: [],
    instrument: 'unknown', confidence: 0,
  };

  onUpdate: ((a: MicAnalysis) => void) | null = null;

  getAnalyserNode() { return this.analyser; }
  getAudioContext() { return this.ctx; }

  async start() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      this.ctx = new AudioContext();
      this.source = this.ctx.createMediaStreamSource(this.stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 4096;
      this.analyser.smoothingTimeConstant = 0.8;
      this.source.connect(this.analyser);
      this.buffer = new Float32Array(this.analyser.fftSize);
      this.running = true;
      this._loop();
      return true;
    } catch (e) {
      console.warn('Mic access denied:', e);
      return false;
    }
  }

  stop() {
    this.running = false;
    clearTimeout(this.frameId);
    this.stream?.getTracks().forEach(t => t.stop());
    this.ctx?.close();
    this.ctx = null;
  }

  isRunning() { return this.running; }

  // Throttled mic loop — runs every 100ms instead of 60fps (6x less CPU)
  private _loop() {
    if (!this.running || !this.analyser) return;

    this.analyser.getFloatTimeDomainData(this.buffer);

    // ── Pitch detection (autocorrelation) — now 10x/sec not 60x ──
    const pitch = this._detectPitch();
    if (pitch > 0) {
      this.pitchHistory.push(pitch);
      if (this.pitchHistory.length > 200) this.pitchHistory.shift(); // Was 500
    }

    // ── Onset detection (energy threshold) ──
    let energy = 0;
    // Sample only every 4th element for speed
    for (let i = 0; i < this.buffer.length; i += 4) energy += this.buffer[i] * this.buffer[i];
    energy = Math.sqrt(energy / (this.buffer.length / 4));

    if (energy > 0.008) {
      const now = performance.now();
      if (this.onsetHistory.length === 0 || now - this.onsetHistory[this.onsetHistory.length - 1] > 80) {
        this.onsetHistory.push(now);
        if (this.onsetHistory.length > 100) this.onsetHistory.shift(); // Was 200
      }
    }

    // ── Run full analysis every 10th call (~1/sec) ──
    if (this.pitchHistory.length % 10 === 0 && this.pitchHistory.length > 10) {
      this._analyze();
      if (this.onUpdate) this.onUpdate(this.analysis);
    }

    this.frameId = window.setTimeout(() => this._loop(), 100) as any; // 100ms = 10fps
  }

  // Autocorrelation pitch detection (optimized: sample every 4th, limit range)
  private _detectPitch(): number {
    if (!this.ctx) return -1;
    const sr = this.ctx.sampleRate;
    const buf = this.buffer;
    const n = buf.length;

    // Quick RMS check (sample every 8th)
    let rms = 0;
    for (let i = 0; i < n; i += 8) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / (n / 8));
    if (rms < 0.01) return -1;

    // Autocorrelation — use only first 1024 samples, step by 2
    const window = Math.min(1024, n / 2);
    const minPeriod = Math.floor(sr / 1000); // max 1000Hz (was 1200)
    const maxPeriod = Math.min(Math.floor(sr / 60), window); // min 60Hz (was 50)
    let bestCorr = 0;
    let bestPeriod = 0;

    for (let lag = minPeriod; lag < maxPeriod; lag += 2) { // Step by 2
      let corr = 0;
      for (let i = 0; i < window; i += 2) { // Sample every 2nd
        corr += buf[i] * buf[i + lag];
      }
      if (corr > bestCorr) {
        bestCorr = corr;
        bestPeriod = lag;
      }
    }

    if (bestPeriod === 0 || bestCorr < 0.01) return -1;
    return sr / bestPeriod;
  }

  // Full analysis: key, BPM, time sig, motif, instrument
  private _analyze() {
    // ── Key detection from pitch histogram ──
    const histogram = new Array(12).fill(0);
    for (const freq of this.pitchHistory) {
      const midi = 12 * Math.log2(freq / 440) + 69;
      const pc = Math.round(midi) % 12;
      if (pc >= 0 && pc < 12) histogram[pc]++;
    }

    // Find best matching key by Krumhansl-Kessler profile correlation
    const majorProfile = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
    let bestKey = 0, bestScore = -Infinity;
    for (let k = 0; k < 12; k++) {
      let score = 0;
      for (let i = 0; i < 12; i++) {
        score += histogram[(i + k) % 12] * majorProfile[i];
      }
      if (score > bestScore) { bestScore = score; bestKey = k; }
    }
    this.analysis.detectedKey = bestKey;

    // ── BPM from inter-onset intervals ──
    if (this.onsetHistory.length > 4) {
      const deltas: number[] = [];
      for (let i = 1; i < this.onsetHistory.length; i++) {
        deltas.push(this.onsetHistory[i] - this.onsetHistory[i - 1]);
      }
      // Cluster deltas around common beat divisions
      const validDeltas = deltas.filter(d => d > 150 && d < 2000);
      if (validDeltas.length > 2) {
        const median = validDeltas.sort((a, b) => a - b)[Math.floor(validDeltas.length / 2)];
        this.analysis.detectedBPM = Math.round(60000 / median);
        this.analysis.motifRhythm = deltas.slice(-16);
      }
    }

    // ── Time signature from accent pattern ──
    if (this.onsetHistory.length > 8) {
      // Count onsets in groups to detect 3/4 vs 4/4
      const deltas: number[] = [];
      for (let i = 1; i < this.onsetHistory.length; i++) {
        deltas.push(this.onsetHistory[i] - this.onsetHistory[i - 1]);
      }
      const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
      // Look for groupings of 3 vs 4
      let groups3 = 0, groups4 = 0;
      for (let i = 0; i < deltas.length; i++) {
        if (Math.abs(deltas[i] - avgDelta * 1.5) < avgDelta * 0.3) groups3++;
        if (Math.abs(deltas[i] - avgDelta) < avgDelta * 0.3) groups4++;
      }
      this.analysis.detectedTimeSig = groups3 > groups4 * 1.5 ? 3 : 4;
    }

    // ── Phrase length from silence gaps ──
    if (this.onsetHistory.length > 4) {
      const deltas: number[] = [];
      for (let i = 1; i < this.onsetHistory.length; i++) {
        deltas.push(this.onsetHistory[i] - this.onsetHistory[i - 1]);
      }
      const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
      // A gap > 3x average delta = phrase boundary
      let phrases = 1;
      for (const d of deltas) {
        if (d > avgDelta * 3) phrases++;
      }
      const totalDur = this.onsetHistory[this.onsetHistory.length - 1] - this.onsetHistory[0];
      const beatMs = 60000 / Math.max(60, this.analysis.detectedBPM);
      const barMs = beatMs * this.analysis.detectedTimeSig;
      this.analysis.phraseLength = Math.max(1, Math.round(totalDur / (phrases * barMs)));
    }

    // ── Motif notes (pitch classes from recent history) ──
    const recent = this.pitchHistory.slice(-32);
    this.analysis.motifNotes = recent.map(f => {
      const midi = 12 * Math.log2(f / 440) + 69;
      return Math.round(midi) % 12;
    });

    // ── Instrument detection from spectral centroid ──
    if (this.analyser) {
      const freqData = new Float32Array(this.analyser.frequencyBinCount);
      this.analyser.getFloatFrequencyData(freqData);
      let centroidNum = 0, centroidDen = 0;
      const sr = this.ctx!.sampleRate;
      for (let i = 0; i < freqData.length; i++) {
        const mag = Math.pow(10, freqData[i] / 20);
        const freq = (i / freqData.length) * (sr / 2);
        centroidNum += freq * mag;
        centroidDen += mag;
      }
      const centroid = centroidDen > 0 ? centroidNum / centroidDen : 0;

      if (centroid < 300) this.analysis.instrument = 'bass';
      else if (centroid < 800) this.analysis.instrument = 'guitar';
      else if (centroid < 1500) this.analysis.instrument = 'keys';
      else this.analysis.instrument = 'voice';
    }

    // Confidence based on data quality
    this.analysis.confidence = Math.min(1,
      (this.pitchHistory.length / 100) * 0.5 +
      (this.onsetHistory.length / 30) * 0.5
    );
  }
}

// ============================================================
// DRUM PATTERN GENERATORS (same patterns, kept intact)
// ============================================================

function purdiePattern(bar: number, chaos: number): DrumPattern {
  const v = (base: number) => base + (Math.random() - 0.5) * chaos * 0.3;
  const ghost = () => Math.random() < 0.3 + chaos * 0.3;

  const hihat: DrumHit[] = [];
  for (let i = 0; i < 12; i++) {
    const beat = i / 3;
    if (i % 3 === 0 || i % 3 === 2) {
      hihat.push({ time: beat, velocity: v(i % 3 === 0 ? 0.55 : 0.35), variation: 0 });
    }
  }

  const kick: DrumHit[] = [{ time: 0, velocity: v(0.7), variation: 0 }];
  if (bar % 2 === 0) kick.push({ time: 2.33, velocity: v(0.5), variation: 0.2 });
  if (Math.random() < chaos) kick.push({ time: 1.67, velocity: v(0.4), variation: 0.3 });

  const snare: DrumHit[] = [
    { time: 1, velocity: v(0.6), variation: 0 },
    { time: 3, velocity: v(0.6), variation: 0 },
  ];
  if (ghost()) snare.push({ time: 0.67, velocity: v(0.15), variation: 0.8 });
  if (ghost()) snare.push({ time: 1.67, velocity: v(0.12), variation: 0.9 });
  if (ghost()) snare.push({ time: 2.33, velocity: v(0.15), variation: 0.8 });
  if (ghost()) snare.push({ time: 3.33, velocity: v(0.1), variation: 0.9 });
  if (bar % 4 === 3) {
    snare.push({ time: 0.33, velocity: v(0.1), variation: 0.95 });
    snare.push({ time: 2.67, velocity: v(0.12), variation: 0.9 });
  }

  return { kick, snare, hihat, cymbal: [], perc: [] };
}

function dillaPattern(bar: number, chaos: number): DrumPattern {
  const v = (base: number) => base + (Math.random() - 0.5) * chaos * 0.2;
  const drift = () => (Math.random() - 0.3) * 0.08;

  const kick: DrumHit[] = [{ time: 0 + drift(), velocity: v(0.9), variation: 0 }];
  if (bar % 2 === 0) {
    kick.push({ time: 1.75 + drift(), velocity: v(0.7), variation: 0.2 });
    kick.push({ time: 2.5 + drift(), velocity: v(0.8), variation: 0.1 });
  } else {
    kick.push({ time: 1.25 + drift(), velocity: v(0.6), variation: 0.3 });
    kick.push({ time: 3.25 + drift(), velocity: v(0.75), variation: 0.1 });
  }

  const snare: DrumHit[] = [
    { time: 1 + drift(), velocity: v(0.75), variation: 0 },
    { time: 3 + drift(), velocity: v(0.75), variation: 0 },
  ];
  if (Math.random() < chaos * 0.5) {
    snare.push({ time: 2.75 + drift(), velocity: v(0.2), variation: 0.8 });
  }

  const hihat: DrumHit[] = [];
  for (let i = 0; i < 16; i++) {
    const beat = i * 0.25 + drift();
    const vel = i % 4 === 0 ? 0.5 : i % 2 === 0 ? 0.35 : 0.2;
    const open = i === 6 || i === 14;
    hihat.push({ time: beat, velocity: v(vel), variation: open ? 0.9 : 0 });
  }

  return { kick, snare, hihat, cymbal: [], perc: [] };
}

function fredAgainPattern(bar: number, chaos: number): DrumPattern {
  const v = (base: number) => base + (Math.random() - 0.5) * chaos * 0.15;

  const kick: DrumHit[] = [
    { time: 0, velocity: v(0.95), variation: 0 },
    { time: 1, velocity: v(0.9), variation: 0 },
    { time: 2, velocity: v(0.95), variation: 0 },
    { time: 3, velocity: v(0.9), variation: 0 },
  ];

  const snare: DrumHit[] = [
    { time: 1, velocity: v(0.8), variation: 0.1 },
    { time: 3, velocity: v(0.8), variation: 0.1 },
  ];
  if (bar % 8 === 7) {
    for (let i = 8; i < 16; i++) {
      snare.push({ time: i * 0.25, velocity: v(0.3 + (i / 16) * 0.5), variation: 0.5 });
    }
  }

  const hihat: DrumHit[] = [];
  for (let i = 0; i < 8; i++) {
    hihat.push({ time: i * 0.5 + 0.25, velocity: v(0.45), variation: i === 3 || i === 7 ? 0.8 : 0 });
  }

  const cymbal: DrumHit[] = [];
  if (bar % 8 === 0) cymbal.push({ time: 0, velocity: v(0.6), variation: 1 });

  return { kick, snare, hihat, cymbal, perc: [] };
}

function hendrixPattern(bar: number, chaos: number): DrumPattern {
  const v = (base: number) => base + (Math.random() - 0.5) * chaos * 0.25;

  const kick: DrumHit[] = [
    { time: 0, velocity: v(0.8), variation: 0 },
    { time: 2, velocity: v(0.7), variation: 0 },
  ];
  if (bar % 2 === 1) {
    kick.push({ time: 1.67, velocity: v(0.5), variation: 0.3 });
    kick.push({ time: 3.5, velocity: v(0.55), variation: 0.2 });
  }

  const snare: DrumHit[] = [
    { time: 1, velocity: v(0.7), variation: 0 },
    { time: 3, velocity: v(0.7), variation: 0 },
  ];
  if (Math.random() < chaos * 0.4) snare.push({ time: 2.5, velocity: v(0.25), variation: 0.9 });

  const hihat: DrumHit[] = [];
  for (let i = 0; i < 12; i++) {
    const beat = i / 3;
    if (i % 3 !== 1) hihat.push({ time: beat, velocity: v(i % 3 === 0 ? 0.5 : 0.3), variation: 0 });
  }

  return { kick, snare, hihat, cymbal: [], perc: [] };
}

function sabbathPattern(bar: number, chaos: number): DrumPattern {
  const v = (base: number) => base + (Math.random() - 0.5) * chaos * 0.2;

  const kick: DrumHit[] = [
    { time: 0, velocity: v(0.95), variation: 0 },
    { time: 2, velocity: v(0.9), variation: 0 },
  ];
  if (bar % 4 === 3) {
    kick.push({ time: 2.5, velocity: v(0.85), variation: 0.1 });
    kick.push({ time: 3, velocity: v(0.9), variation: 0 });
    kick.push({ time: 3.5, velocity: v(0.85), variation: 0.1 });
  } else {
    kick.push({ time: 1, velocity: v(0.5), variation: 0.3 });
  }

  const snare: DrumHit[] = [
    { time: 1, velocity: v(0.85), variation: 0 },
    { time: 3, velocity: v(0.85), variation: 0 },
  ];
  if (bar % 4 === 3 && chaos > 0.3) {
    snare.push({ time: 3.25, velocity: v(0.7), variation: 0.3 });
    snare.push({ time: 3.5, velocity: v(0.75), variation: 0.2 });
    snare.push({ time: 3.75, velocity: v(0.8), variation: 0.1 });
  }

  const hihat: DrumHit[] = [];
  for (let i = 0; i < 8; i++) {
    hihat.push({ time: i * 0.5, velocity: v(i % 2 === 0 ? 0.5 : 0.35), variation: 0 });
  }

  const cymbal: DrumHit[] = [];
  if (bar % 4 === 0) cymbal.push({ time: 0, velocity: v(0.7), variation: 1 });

  return { kick, snare, hihat, cymbal, perc: [] };
}

export function getDrumPattern(genre: Genre, bar: number, chaos: number): DrumPattern {
  switch (genre) {
    case 'jazz': return purdiePattern(bar, chaos);
    case 'hiphop': return dillaPattern(bar, chaos);
    case 'edm': return fredAgainPattern(bar, chaos);
    case 'country': return hendrixPattern(bar, chaos);
    case 'rock': return sabbathPattern(bar, chaos);
  }
}

// ============================================================
// HARMONY ENGINE
// ============================================================

export class HarmonyEngine {
  private key: number = 0;
  private mode: HarmonyMode = 'major';
  private reharmonisation: ReharmonisationMode = 'none';
  private useInversions: boolean = true;

  configure(key: number, mode: HarmonyMode, reharm: ReharmonisationMode, inversions: boolean) {
    this.key = key;
    this.mode = mode;
    this.reharmonisation = reharm;
    this.useInversions = inversions;
  }

  getScale(): number[] {
    return SCALES[this.mode].map(interval => (this.key + interval) % 12);
  }

  buildChord(degree: number): { notes: number[]; name: string } {
    const scale = SCALES[this.mode];
    const qualities = this.mode === 'minor' ? MINOR_CHORD_QUALITIES : MAJOR_CHORD_QUALITIES;
    const root = (this.key + scale[degree % scale.length]) % 12;
    const quality = qualities[degree % qualities.length];
    const intervals = CHORD_TYPES[quality] || CHORD_TYPES.major;
    let notes = intervals.map(i => root + i);

    notes = this._applyReharmonisation(notes, degree, root);

    if (this.useInversions && Math.random() > 0.5) {
      const inv = Math.floor(Math.random() * Math.min(3, notes.length));
      for (let i = 0; i < inv; i++) notes[i] += 12;
      notes.sort((a, b) => a - b);
    }

    const rootName = NOTE_NAMES[root % 12];
    return { notes, name: `${rootName}${quality === 'major' ? '' : quality}` };
  }

  private _applyReharmonisation(notes: number[], degree: number, root: number): number[] {
    switch (this.reharmonisation) {
      case 'tritone_sub':
        if (degree === 4) {
          const newRoot = (root + 6) % 12;
          return CHORD_TYPES.dom7.map(i => newRoot + i);
        }
        return notes;
      case 'secondary_dominant':
        if (Math.random() > 0.6) return CHORD_TYPES.dom7.map(i => root + i);
        return notes;
      case 'modal_interchange':
        if (Math.random() > 0.5) {
          const ps = this.mode === 'major' ? SCALES.minor : SCALES.major;
          const pr = (this.key + ps[degree % ps.length]) % 12;
          return CHORD_TYPES.minor.map(i => pr + i);
        }
        return notes;
      case 'chromatic_mediant':
        if (Math.random() > 0.7) {
          const shift = Math.random() > 0.5 ? 4 : 3;
          const newRoot = (root + shift) % 12;
          return CHORD_TYPES.major.map(i => newRoot + i);
        }
        return notes;
      default: return notes;
    }
  }

  generateProgression(sessionMemory: SessionMemory): { notes: number[]; name: string }[] {
    const commonDegrees = [
      [0, 3, 4, 0], [0, 5, 3, 4], [1, 4, 0, 0],
      [0, 4, 5, 3], [0, 2, 3, 4], [0, 6, 3, 4],
    ];
    const hash = sessionMemory.stepCount * 7 + sessionMemory.chordHistory.length * 13;
    const degrees = commonDegrees[hash % commonDegrees.length];
    return degrees.map(d => this.buildChord(d));
  }

  quantizeToScale(midiNote: number): number {
    const scale = this.getScale();
    const noteClass = midiNote % 12;
    let closest = scale[0], minDist = 12;
    for (const s of scale) {
      const dist = Math.min(Math.abs(noteClass - s), 12 - Math.abs(noteClass - s));
      if (dist < minDist) { minDist = dist; closest = s; }
    }
    return Math.floor(midiNote / 12) * 12 + closest;
  }
}

// ============================================================
// IMPROVISATION ENGINE — motif-reactive generation
// ============================================================

export class ImprovisationEngine {
  private memory: SessionMemory;
  private harmonyEngine: HarmonyEngine;

  constructor(harmonyEngine: HarmonyEngine) {
    this.harmonyEngine = harmonyEngine;
    this.memory = {
      userNotes: [], aiNotes: [], chordHistory: [],
      rhythmPatterns: [], improvisationSeeds: [],
      noveltyHashes: new Set(), stepCount: 0,
    };
  }

  getMemory() { return this.memory; }

  recordUserNote(note: number, velocity: number, duration: number) {
    const time = Date.now();
    this.memory.userNotes.push({ note, time, velocity, duration });
    if (this.memory.userNotes.length > 200) this.memory.userNotes.shift();
  }

  // Feed mic analysis data into the improvisation memory
  ingestMicAnalysis(analysis: MicAnalysis) {
    if (analysis.confidence < 0.3) return;
    // Add detected motif pitches as user notes
    const now = Date.now();
    for (const pc of analysis.motifNotes.slice(-8)) {
      const midi = 60 + pc; // middle octave
      this.memory.userNotes.push({ note: midi, time: now, velocity: 0.6, duration: 0.3 });
    }
    if (this.memory.userNotes.length > 200) this.memory.userNotes = this.memory.userNotes.slice(-200);
  }

  // Extract the detected motif pattern from recent user input
  private _extractMotif(): { intervals: number[]; rhythm: number[] } {
    const recent = this.memory.userNotes.slice(-16);
    if (recent.length < 3) return { intervals: [], rhythm: [] };

    // Extract melodic intervals
    const intervals: number[] = [];
    for (let i = 1; i < recent.length; i++) {
      intervals.push(recent[i].note - recent[i - 1].note);
    }

    // Extract rhythmic pattern (time deltas normalized)
    const rhythm: number[] = [];
    for (let i = 1; i < recent.length; i++) {
      rhythm.push(recent[i].time - recent[i - 1].time);
    }

    return { intervals, rhythm };
  }

  generateMelody(chord: number[], genre: Genre, chaos: number, bars: number = 1): { note: number; beat: number; duration: number; velocity: number }[] {
    this.memory.stepCount++;
    const notes: { note: number; beat: number; duration: number; velocity: number }[] = [];
    const scale = this.harmonyEngine.getScale();
    const beatsPerBar = 4;

    // Extract user's motif for reactive generation
    const motif = this._extractMotif();
    const userMotif = this.memory.userNotes.slice(-16).map(n => n.note % 12);

    const density = genre === 'jazz' ? 0.4 + chaos * 0.4 :
                    genre === 'edm' ? 0.3 + chaos * 0.2 :
                    genre === 'hiphop' ? 0.2 + chaos * 0.3 :
                    0.35 + chaos * 0.3;

    for (let bar = 0; bar < bars; bar++) {
      for (let sub = 0; sub < 16; sub++) {
        if (Math.random() > density) continue;

        const beat = bar * beatsPerBar + sub / 4;
        let noteClass: number;
        const r = Math.random();

        if (r < 0.05 * chaos) {
          // Pure chromatic approach
          noteClass = Math.floor(Math.random() * 12);
        } else if (r < 0.25 && motif.intervals.length > 0) {
          // Motif development — take a user interval and transpose/invert
          const intIdx = Math.floor(Math.random() * motif.intervals.length);
          const interval = motif.intervals[intIdx];
          const lastAI = this.memory.aiNotes.length > 0
            ? this.memory.aiNotes[this.memory.aiNotes.length - 1].note
            : 60;
          // Apply interval with occasional inversion or augmentation
          const transform = Math.random();
          let newNote: number;
          if (transform < 0.3) {
            newNote = lastAI + interval; // exact transposition
          } else if (transform < 0.5) {
            newNote = lastAI - interval; // inversion
          } else if (transform < 0.7) {
            newNote = lastAI + interval * 2; // augmentation
          } else {
            newNote = lastAI + Math.round(interval / 2); // diminution
          }
          noteClass = ((newNote % 12) + 12) % 12;
        } else if (r < 0.4 && userMotif.length > 0) {
          // Direct reference to user pitch
          const idx = Math.floor(Math.random() * userMotif.length);
          noteClass = userMotif[idx];
          if (Math.random() < chaos * 0.5) {
            noteClass = (noteClass + (Math.random() > 0.5 ? 2 : -2) + 12) % 12;
          }
        } else if (r < 0.65) {
          noteClass = chord[Math.floor(Math.random() * chord.length)] % 12;
        } else {
          noteClass = scale[Math.floor(Math.random() * scale.length)];
        }

        // Novelty check
        const hash = `${this.memory.stepCount}-${sub}-${noteClass}`;
        if (this.memory.noveltyHashes.has(hash) && Math.random() > chaos) {
          noteClass = (noteClass + 2) % 12;
        }
        this.memory.noveltyHashes.add(hash);
        if (this.memory.noveltyHashes.size > 1000) {
          const arr = Array.from(this.memory.noveltyHashes);
          this.memory.noveltyHashes = new Set(arr.slice(-500));
        }

        const octave = 4 + (genre === 'jazz' ? 1 : 0) + (Math.random() > 0.7 ? 1 : 0);
        const midiNote = octave * 12 + noteClass;

        // Use motif rhythm if available
        let dur: number;
        if (motif.rhythm.length > 0 && Math.random() < 0.3) {
          const rIdx = Math.floor(Math.random() * motif.rhythm.length);
          dur = Math.max(0.1, Math.min(0.8, motif.rhythm[rIdx] / 1000));
        } else {
          dur = genre === 'jazz' ? 0.15 + Math.random() * 0.35 :
                genre === 'edm' ? 0.1 + Math.random() * 0.15 :
                0.2 + Math.random() * 0.3;
        }

        const velocity = 0.4 + Math.random() * 0.3 * (1 + chaos * 0.5);
        notes.push({ note: midiNote, beat, duration: dur, velocity });
        this.memory.aiNotes.push({ note: midiNote, time: Date.now(), instrument: 'melody', velocity });
        if (this.memory.aiNotes.length > 200) this.memory.aiNotes.shift();
      }
    }
    return notes;
  }

  generateBassLine(chord: number[], genre: Genre, chaos: number): { note: number; beat: number; duration: number; velocity: number }[] {
    const root = chord[0] % 12;
    const fifth = chord.length > 2 ? chord[2] % 12 : (root + 7) % 12;
    const notes: { note: number; beat: number; duration: number; velocity: number }[] = [];
    const octave = 2;

    if (genre === 'jazz') {
      const scale = this.harmonyEngine.getScale();
      for (let beat = 0; beat < 4; beat++) {
        const nc = beat === 0 ? root : beat === 2 ? fifth :
          scale[Math.floor(Math.random() * scale.length)];
        notes.push({ note: octave * 12 + nc, beat, duration: 0.9, velocity: 0.6 + Math.random() * 0.15 });
      }
    } else if (genre === 'hiphop') {
      notes.push({ note: octave * 12 + root, beat: 0, duration: 1.8, velocity: 0.85 });
      if (Math.random() < 0.5 + chaos * 0.3) {
        notes.push({ note: octave * 12 + fifth, beat: 2.5, duration: 1.2, velocity: 0.7 });
      }
    } else if (genre === 'edm') {
      for (let i = 0; i < 4; i++) {
        notes.push({ note: octave * 12 + root, beat: i, duration: 0.4, velocity: 0.8 });
      }
    } else {
      notes.push({ note: octave * 12 + root, beat: 0, duration: 1.8, velocity: 0.75 });
      notes.push({ note: octave * 12 + fifth, beat: 2, duration: 1.8, velocity: 0.65 });
    }
    return notes;
  }
}

// ============================================================
// LIVE AI BAND CONDUCTOR — 4-instrument chord voicing, mic integration
// ============================================================

export class LiveAIBand {
  sound: SoundEngine;
  harmony: HarmonyEngine;
  improv: ImprovisationEngine;
  mic: MicAnalyzer;
  config: BandConfig;

  private playing = false;
  private bar = 0;
  private scheduledUntil = 0;
  private loopTimer: number | null = null;
  private currentChords: { notes: number[]; name: string }[] = [];
  private micEnabled = false;

  constructor() {
    this.sound = new SoundEngine();
    this.harmony = new HarmonyEngine();
    this.improv = new ImprovisationEngine(this.harmony);
    this.mic = new MicAnalyzer();
    this.config = {
      genre: 'jazz', bpm: 110, key: 0, harmonyMode: 'major',
      reharmonisation: 'none', difficulty: 'normal', swing: 0.3,
      chaos: 0.3, volume: 0.7, useInversions: true,
    };
  }

  async enableMic(): Promise<boolean> {
    const ok = await this.mic.start();
    this.micEnabled = ok;
    return ok;
  }

  disableMic() {
    this.mic.stop();
    this.micEnabled = false;
  }

  isMicEnabled() { return this.micEnabled; }
  getMicAnalysis() { return this.mic.analysis; }

  start() {
    this.sound.init();
    this.sound.resume();
    this.sound.setVolume(this.config.volume);
    this.harmony.configure(this.config.key, this.config.harmonyMode, this.config.reharmonisation, this.config.useInversions);
    this.currentChords = this.harmony.generateProgression(this.improv.getMemory());
    this.playing = true;
    this.bar = 0;
    this.scheduledUntil = this.sound.getCurrentTime() + 0.1;
    this._scheduleLoop();
  }

  stop() {
    this.playing = false;
    if (this.loopTimer) clearTimeout(this.loopTimer);
    this.loopTimer = null;
  }

  isPlaying() { return this.playing; }
  getBar() { return this.bar; }
  getCurrentChords() { return this.currentChords; }
  getMemory() { return this.improv.getMemory(); }

  updateConfig(partial: Partial<BandConfig>) {
    Object.assign(this.config, partial);
    this.sound.setVolume(this.config.volume);
    this.harmony.configure(this.config.key, this.config.harmonyMode, this.config.reharmonisation, this.config.useInversions);
  }

  // ── Effect pedal management ──
  toggleEffect(type: EffectType, enabled?: boolean) { this.sound.toggleEffect(type, enabled); }
  setEffectParam(type: EffectType, param: string, value: number) { this.sound.setEffectParam(type, param, value); }
  getEffectStates() { return this.sound.getEffectStates(); }

  userPlay(midiNote: number, velocity: number = 0.7) {
    if (!this.playing) return;
    const quantized = this.harmony.quantizeToScale(midiNote);
    this.sound.playNote(this.sound.getCurrentTime(), quantized, 0.3, velocity, this.config.genre);
    this.improv.recordUserNote(quantized, velocity, 0.3);
  }

  private _scheduleLoop() {
    if (!this.playing) return;

    try {
      const now = this.sound.getCurrentTime();
      const beatDuration = 60 / this.config.bpm;
      const barDuration = beatDuration * 4;

      // Feed mic data into improvisation engine
      if (this.micEnabled && this.mic.analysis.confidence > 0.3) {
        this.improv.ingestMicAnalysis(this.mic.analysis);
        // Auto-adapt key and BPM from mic if confidence is high
        if (this.mic.analysis.confidence > 0.6) {
          this.config.key = this.mic.analysis.detectedKey;
          if (this.mic.analysis.detectedBPM >= 60 && this.mic.analysis.detectedBPM <= 200) {
            // Smooth BPM blend — don't jump suddenly
            this.config.bpm = Math.round(this.config.bpm * 0.8 + this.mic.analysis.detectedBPM * 0.2);
          }
          this.harmony.configure(this.config.key, this.config.harmonyMode, this.config.reharmonisation, this.config.useInversions);
        }
      }

      while (this.scheduledUntil < now + barDuration * 2) {
        try {
          this._scheduleBar(this.scheduledUntil, this.bar);
        } catch (e) {
          console.warn('[Band] scheduleBar error:', e);
        }
        this.scheduledUntil += barDuration;
        this.bar++;

        if (this.bar % 4 === 0) {
          this.harmony.configure(this.config.key, this.config.harmonyMode, this.config.reharmonisation, this.config.useInversions);
          this.currentChords = this.harmony.generateProgression(this.improv.getMemory());
        }
      }
    } catch (e) {
      console.warn('[Band] scheduleLoop error:', e);
    }

    // Use setTimeout instead of rAF — rAF gets throttled in background tabs
    this.loopTimer = window.setTimeout(() => this._scheduleLoop(), 50) as unknown as number;
  }

  private _scheduleBar(barStart: number, barNum: number) {
    const beatDur = 60 / this.config.bpm;
    const { genre, chaos, swing } = this.config;

    const chordIdx = barNum % this.currentChords.length;
    const chord = this.currentChords[chordIdx];

    const swingBeat = (beat: number) => {
      const sub = beat % 0.5;
      if (sub > 0.2 && sub < 0.3 && swing > 0) return beat + swing * 0.08;
      return beat;
    };

    // ── DRUMS ──
    const pattern = getDrumPattern(genre, barNum, chaos);

    const useBreaks = genre === 'edm' || genre === 'hiphop';

    pattern.kick.forEach(h => {
      const t = barStart + swingBeat(h.time) * beatDur;
      if (genre === 'hiphop' && h.variation < 0.2) {
        this.sound.play808(t, h.velocity, 36);
      } else if (useBreaks) {
        this.sound.playBreakKick(t, h.velocity);
      } else {
        this.sound.playKick(t, h.velocity, genre);
      }
    });

    pattern.snare.forEach(h => {
      const t = barStart + swingBeat(h.time) * beatDur;
      if (useBreaks) {
        this.sound.playBreakSnare(t, h.velocity);
      } else {
        this.sound.playSnare(t, h.velocity, genre);
      }
    });

    pattern.hihat.forEach(h => {
      const t = barStart + swingBeat(h.time) * beatDur;
      this.sound.playHihat(t, h.velocity, h.variation > 0.5, genre);
    });

    pattern.cymbal.forEach(h => {
      const t = barStart + h.time * beatDur;
      this.sound.playCymbal(t, h.velocity, h.variation > 0.5 ? 'crash' : 'ride', genre);
    });

    // ── BASS (with sub) ──
    const bassNotes = this.improv.generateBassLine(chord.notes, genre, chaos);
    bassNotes.forEach(n => {
      const t = barStart + n.beat * beatDur;
      if (genre === 'hiphop') {
        this.sound.play808(t, n.velocity, n.note);
      } else if (genre === 'edm') {
        this.sound.playReeceBass(t, n.note, n.duration * beatDur, n.velocity, 'edm');
      } else {
        this.sound.playBass(t, n.note, n.duration * beatDur, n.velocity, genre);
      }
    });

    // ── 4-INSTRUMENT CHORD VOICING ──
    // Spread the chord across 4 instruments: pad, keys, pluck, strings
    // Each gets a different note from the chord + add the 4th (11th) for richness
    const chordNotes = [...chord.notes];
    // Ensure we have at least 4 notes — add 4th interval if needed
    while (chordNotes.length < 4) {
      const last = chordNotes[chordNotes.length - 1];
      chordNotes.push(last + 5); // Add a 4th
    }

    const octave = 4;
    const barDur = beatDur * 4;
    const chordDur = beatDur * 3.5;

    // Instrument 1: PAD — lowest note, sustained
    const padNote = octave * 12 + (chordNotes[0] % 12);
    this.sound.playPad(barStart, padNote, chordDur, 0.18, genre);

    // Instrument 2: KEYS — second note, percussive
    const keysNote = octave * 12 + (chordNotes[1] % 12);
    this.sound.playKeys(barStart + 0.01, keysNote, chordDur * 0.8, 0.2, genre);

    // Instrument 3: PLUCK — third note, staccato
    const pluckNote = (octave + 1) * 12 + (chordNotes[2] % 12);
    this.sound.playPluck(barStart + 0.02, pluckNote, chordDur * 0.5, 0.15, genre);

    // Instrument 4: STRINGS — fourth note (the added 4th), legato
    const stringsNote = (octave + 1) * 12 + (chordNotes[3] % 12);
    this.sound.playStrings(barStart + 0.03, stringsNote, chordDur, 0.15, genre);

    // ── IMPROVISED MELODY ──
    const melody = this.improv.generateMelody(chord.notes, genre, chaos, 1);
    melody.forEach(n => {
      const t = barStart + n.beat * beatDur;
      this.sound.playNote(t, n.note, n.duration * beatDur, n.velocity * 0.45, genre);
    });
  }
}
