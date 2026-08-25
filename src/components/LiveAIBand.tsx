import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  LiveAIBand as BandEngine, MicAnalysis,
  Genre, Difficulty, HarmonyMode, ReharmonisationMode, BandConfig,
  EffectType, EffectState,
} from '../lib/music-engine';
import {
  Music, Play, Square, Volume2, VolumeX, Keyboard, Gauge,
  Sparkles, Waves, Radio, Zap, Settings2, BarChart3, ChevronDown, Mic, MicOff,
  Flame, Timer, Repeat, Disc,
} from 'lucide-react';

// ─── Computer keyboard → MIDI mapping ──────────────────────────
// Lower row (Z-M): C3–B3
// Upper row (Q-P): C4–B4
// Number row (1-0): C5–A5

const LOWER_KEYS: Record<string, number> = {
  z: 48, s: 49, x: 50, d: 51, c: 52, v: 53, g: 54,
  b: 55, h: 56, n: 57, j: 58, m: 59,
};
const UPPER_KEYS: Record<string, number> = {
  q: 60, '2': 61, w: 62, '3': 63, e: 64, r: 65, '5': 66,
  t: 67, '6': 68, y: 69, '7': 70, u: 71, i: 72, '9': 73,
  o: 74, '0': 75, p: 76,
};
const ALL_KEYS = { ...LOWER_KEYS, ...UPPER_KEYS };

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const KEY_OPTIONS = NOTE_NAMES.map((n, i) => ({ label: n, value: i }));

const GENRE_INFO: Record<Genre, { label: string; color: string; icon: string; artist: string }> = {
  jazz:    { label: 'Jazz',    color: 'text-amber-400',  icon: '🎷', artist: 'Purdie' },
  hiphop:  { label: 'Hip-Hop', color: 'text-purple-400', icon: '🎤', artist: 'Dilla' },
  edm:     { label: 'EDM',     color: 'text-cyan-400',   icon: '🎛', artist: 'Fred Again' },
  country: { label: 'Country', color: 'text-green-400',  icon: '🎸', artist: 'Hendrix' },
  rock:    { label: 'Rock',    color: 'text-red-400',    icon: '🤘', artist: 'Sabbath' },
};

const HARMONY_MODES: { label: string; value: HarmonyMode }[] = [
  { label: 'Major',      value: 'major' },
  { label: 'Minor',      value: 'minor' },
  { label: 'Dorian',     value: 'dorian' },
  { label: 'Mixolydian', value: 'mixolydian' },
  { label: 'Blues',       value: 'blues' },
  { label: 'Phrygian',   value: 'phrygian' },
];

const REHARM_MODES: { label: string; value: ReharmonisationMode }[] = [
  { label: 'None',             value: 'none' },
  { label: 'Tritone Sub',     value: 'tritone_sub' },
  { label: 'Secondary Dom',   value: 'secondary_dominant' },
  { label: 'Modal Interchange', value: 'modal_interchange' },
  { label: 'Chromatic Mediant', value: 'chromatic_mediant' },
];

// ─── Piano key layout for visual keyboard ─────────────────────
const PIANO_KEYS = [
  { note: 0, black: false, label: 'C' },
  { note: 1, black: true,  label: 'C#' },
  { note: 2, black: false, label: 'D' },
  { note: 3, black: true,  label: 'D#' },
  { note: 4, black: false, label: 'E' },
  { note: 5, black: false, label: 'F' },
  { note: 6, black: true,  label: 'F#' },
  { note: 7, black: false, label: 'G' },
  { note: 8, black: true,  label: 'G#' },
  { note: 9, black: false, label: 'A' },
  { note: 10, black: true, label: 'A#' },
  { note: 11, black: false, label: 'B' },
];

// Computer key labels for piano display
const KEY_LABELS_LOWER = ['Z', 'S', 'X', 'D', 'C', 'V', 'G', 'B', 'H', 'N', 'J', 'M'];
const KEY_LABELS_UPPER = ['Q', '2', 'W', '3', 'E', 'R', '5', 'T', '6', 'Y', '7', 'U'];

export function LiveAIBand() {
  const bandRef = useRef<BandEngine | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);

  const [playing, setPlaying] = useState(false);
  const [genre, setGenre] = useState<Genre>('jazz');
  const [bpm, setBpm] = useState(110);
  const [chaos, setChaos] = useState(0.3);
  const [swing, setSwing] = useState(0.3);
  const [volume, setVolume] = useState(0.7);
  const [key, setKey] = useState(0);
  const [harmonyMode, setHarmonyMode] = useState<HarmonyMode>('major');
  const [reharmonisation, setReharmonisation] = useState<ReharmonisationMode>('none');
  const [useInversions, setUseInversions] = useState(true);
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [muted, setMuted] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [micAnalysis, setMicAnalysis] = useState<MicAnalysis | null>(null);
  const [listenPhase, setListenPhase] = useState<'idle' | 'listening' | 'ready' | 'playing'>('idle');
  const [micLevel, setMicLevel] = useState(0);
  const [tapCount, setTapCount] = useState(0);
  const micCanvasRef = useRef<HTMLCanvasElement>(null);

  // Effect pedal state
  const [effects, setEffects] = useState<Record<EffectType, EffectState>>({
    distortion: { enabled: false, params: { amount: 3, tone: 3000 } },
    delay:      { enabled: false, params: { time: 0.375, feedback: 0.35, mix: 0.3 } },
    chorus:     { enabled: false, params: { rate: 1.2, depth: 0.004, mix: 0.4 } },
    halfspeed:  { enabled: false, params: { mix: 0.5 } },
  });

  // Live display state
  const [currentBar, setCurrentBar] = useState(0);
  const [currentChords, setCurrentChords] = useState<string[]>([]);
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());
  const [noteHistory, setNoteHistory] = useState<{ note: number; time: number; isUser: boolean }[]>([]);
  const [sessionStats, setSessionStats] = useState({ userNotes: 0, aiNotes: 0, bars: 0 });
  const [showSettings, setShowSettings] = useState(false);

  // Refs for animation-loop access
  const playingRef = useRef(playing);
  playingRef.current = playing;

  // ─── Initialize band engine ─────────────────────────────────
  useEffect(() => {
    if (!bandRef.current) {
      bandRef.current = new BandEngine();
    }
    return () => {
      if (bandRef.current?.isPlaying()) {
        bandRef.current.stop();
      }
    };
  }, []);

  // ─── Sync config to engine ─────────────────────────────────
  useEffect(() => {
    bandRef.current?.updateConfig({
      genre, bpm, key, harmonyMode, reharmonisation,
      difficulty, swing, chaos,
      volume: muted ? 0 : volume,
      useInversions,
    });
  }, [genre, bpm, key, harmonyMode, reharmonisation, difficulty, swing, chaos, volume, muted, useInversions]);

  // ─── Poll band state for display ────────────────────────────
  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(() => {
      const band = bandRef.current;
      if (!band) return;
      setCurrentBar(band.getBar());
      const chords = band.getCurrentChords();
      setCurrentChords(chords.map(c => c.name));
      const mem = band.getMemory();
      setSessionStats({
        userNotes: mem.userNotes.length,
        aiNotes: mem.aiNotes.length,
        bars: band.getBar(),
      });

      // Mic analysis
      if (band.isMicEnabled()) {
        setMicAnalysis(band.getMicAnalysis());
      }

      // Recent notes for visualization
      const now = Date.now();
      const recent = [
        ...mem.userNotes.filter(n => now - n.time < 4000).map(n => ({ note: n.note, time: n.time, isUser: true })),
        ...mem.aiNotes.filter(n => now - n.time < 4000).map(n => ({ note: n.note, time: n.time, isUser: false })),
      ].sort((a, b) => a.time - b.time);
      setNoteHistory(recent);
    }, 100);
    return () => clearInterval(interval);
  }, [playing]);

  // ─── Waveform / note roll visualizer ───────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    const draw = () => {
      ctx.fillStyle = '#050508';
      ctx.fillRect(0, 0, W, H);

      const now = Date.now();
      const windowMs = 4000;

      // Grid lines
      ctx.strokeStyle = 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 12; i++) {
        const y = (i / 12) * H;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      for (let i = 0; i < 8; i++) {
        const x = (i / 8) * W;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }

      // Draw note blocks (piano roll style)
      const notes = noteHistory;
      for (const n of notes) {
        const age = (now - n.time) / windowMs;
        if (age > 1) continue;

        const x = (1 - age) * W;
        const noteClass = n.note % 12;
        const octave = Math.floor(n.note / 12);
        const y = H - ((octave - 2) * 12 + noteClass) / (7 * 12) * H;

        const alpha = Math.max(0.1, 1 - age * 0.8);

        if (n.isUser) {
          // User notes: bright cyan
          ctx.fillStyle = `rgba(0, 255, 220, ${alpha})`;
          ctx.shadowColor = 'rgba(0, 255, 220, 0.5)';
          ctx.shadowBlur = 8;
          ctx.fillRect(x - 2, y - 3, 14, 6);
          ctx.shadowBlur = 0;
        } else {
          // AI notes: genre-colored
          const colors: Record<Genre, string> = {
            jazz: `rgba(255, 180, 50, ${alpha * 0.7})`,
            hiphop: `rgba(180, 100, 255, ${alpha * 0.7})`,
            edm: `rgba(50, 200, 255, ${alpha * 0.7})`,
            country: `rgba(100, 220, 100, ${alpha * 0.7})`,
            rock: `rgba(255, 80, 80, ${alpha * 0.7})`,
          };
          ctx.fillStyle = colors[genre];
          ctx.fillRect(x - 1, y - 2, 8, 4);
        }
      }

      // Playhead line
      if (playingRef.current) {
        const beat = (currentBar % 4);
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        const lineX = W * 0.9;
        ctx.beginPath();
        ctx.moveTo(lineX, 0);
        ctx.lineTo(lineX, H);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // "Live" indicator
      if (playingRef.current) {
        ctx.fillStyle = '#ff3355';
        ctx.beginPath();
        ctx.arc(W - 12, 12, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '8px monospace';
        ctx.fillText('LIVE', W - 36, 15);
      }

      animFrameRef.current = requestAnimationFrame(draw);
    };

    animFrameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [noteHistory, genre, currentBar, playing]);

  // ─── Keyboard input ─────────────────────────────────────────
  useEffect(() => {
    const handleDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      const midi = ALL_KEYS[k];
      if (midi !== undefined && bandRef.current?.isPlaying()) {
        e.preventDefault();
        bandRef.current.userPlay(midi, 0.7 + Math.random() * 0.2);
        setActiveKeys(prev => new Set(prev).add(k));
      }
    };
    const handleUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (ALL_KEYS[k] !== undefined) {
        setActiveKeys(prev => {
          const next = new Set(prev);
          next.delete(k);
          return next;
        });
      }
    };

    window.addEventListener('keydown', handleDown);
    window.addEventListener('keyup', handleUp);
    return () => {
      window.removeEventListener('keydown', handleDown);
      window.removeEventListener('keyup', handleUp);
    };
  }, []);

  // ─── Play / Stop ────────────────────────────────────────────
  const handlePlayStop = useCallback(() => {
    if (!bandRef.current) return;
    if (playing) {
      bandRef.current.stop();
      setPlaying(false);
      setListenPhase(micOn ? 'listening' : 'idle');
    } else {
      bandRef.current.updateConfig({
        genre, bpm, key, harmonyMode, reharmonisation,
        difficulty, swing, chaos,
        volume: muted ? 0 : volume,
        useInversions,
      });
      bandRef.current.start();
      setPlaying(true);
      setListenPhase('playing');
    }
  }, [playing, micOn, genre, bpm, key, harmonyMode, reharmonisation, difficulty, swing, chaos, volume, muted, useInversions]);

  const handleMicToggle = useCallback(async () => {
    if (!bandRef.current) return;
    if (micOn) {
      bandRef.current.disableMic();
      setMicOn(false);
      setMicAnalysis(null);
      setListenPhase(playing ? 'playing' : 'idle');
    } else {
      const ok = await bandRef.current.enableMic();
      setMicOn(ok);
      if (ok) {
        setListenPhase('listening');
        // Set up live analysis callback
        bandRef.current.mic.onUpdate = (a: MicAnalysis) => {
          setMicAnalysis({ ...a });
          setTapCount(prev => prev + 1);
          // Auto-transition to "ready" once we have enough data
          if (a.confidence > 0.5 && a.motifNotes.length > 4) {
            setListenPhase(prev => prev === 'listening' ? 'ready' : prev);
          }
        };
      }
    }
  }, [micOn, playing]);

  // Start the band from mic analysis — auto-configure from what user played
  const handleStartFromMic = useCallback(() => {
    if (!bandRef.current || !micAnalysis) return;
    // Auto-set config from mic detection
    if (micAnalysis.detectedKey >= 0) setKey(micAnalysis.detectedKey);
    if (micAnalysis.detectedBPM >= 60 && micAnalysis.detectedBPM <= 200) setBpm(micAnalysis.detectedBPM);

    bandRef.current.updateConfig({
      genre, bpm: micAnalysis.detectedBPM || bpm, key: micAnalysis.detectedKey ?? key,
      harmonyMode, reharmonisation, difficulty, swing, chaos,
      volume: muted ? 0 : volume, useInversions,
    });
    bandRef.current.start();
    setPlaying(true);
    setListenPhase('playing');
  }, [micAnalysis, genre, bpm, key, harmonyMode, reharmonisation, difficulty, swing, chaos, volume, muted, useInversions]);

  // Draw mic waveform when listening
  useEffect(() => {
    if (!micOn || !bandRef.current) return;
    const analyser = bandRef.current.mic.getAnalyserNode();
    const ctx2d = micCanvasRef.current?.getContext('2d');
    if (!analyser || !ctx2d) return;

    const canvas = micCanvasRef.current!;
    const W = canvas.width;
    const H = canvas.height;
    const buf = new Float32Array(analyser.fftSize);
    let raf = 0;

    const draw = () => {
      analyser.getFloatTimeDomainData(buf);

      // Compute level
      let rms = 0;
      for (let i = 0; i < buf.length; i++) rms += buf[i] * buf[i];
      rms = Math.sqrt(rms / buf.length);
      setMicLevel(rms);

      ctx2d.fillStyle = '#08080c';
      ctx2d.fillRect(0, 0, W, H);

      // Waveform
      ctx2d.strokeStyle = rms > 0.01 ? 'rgba(236, 72, 153, 0.8)' : 'rgba(236, 72, 153, 0.2)';
      ctx2d.lineWidth = 2;
      ctx2d.beginPath();
      const step = Math.max(1, Math.floor(buf.length / W));
      for (let x = 0; x < W; x++) {
        const idx = x * step;
        const y = (0.5 + buf[idx] * 2) * H;
        if (x === 0) ctx2d.moveTo(x, y);
        else ctx2d.lineTo(x, y);
      }
      ctx2d.stroke();

      // Level meter bar at bottom
      const levelW = Math.min(1, rms * 20) * W;
      ctx2d.fillStyle = 'rgba(236, 72, 153, 0.4)';
      ctx2d.fillRect(0, H - 3, levelW, 3);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [micOn]);

  const gInfo = GENRE_INFO[genre];

  // ─── Difficulty descriptions ────────────────────────────────
  const difficultyDesc: Record<Difficulty, string> = {
    easy:   'Root notes, simple rhythms. Band plays fuller.',
    normal: 'Full scale access. Balance of guidance and freedom.',
    hard:   'Chromatic, complex rhythms. Band leaves space for you.',
  };

  return (
    <div className="space-y-4">
      {/* ─── Header bar ─────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded flex items-center justify-center ${playing ? 'bg-green-500' : 'bg-white/10'} transition-colors`}>
            <Music className={`w-5 h-5 ${playing ? 'text-black' : 'text-white/60'}`} />
          </div>
          <div>
            <h2 className="text-sm font-mono font-bold uppercase tracking-[0.15em]">Live AI Band</h2>
            <p className="text-[8px] font-mono text-white/40 uppercase tracking-widest">
              {gInfo.icon} {gInfo.label} &middot; {gInfo.artist} style &middot; {NOTE_NAMES[key]} {harmonyMode}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Difficulty badge */}
          <div className={`px-2 py-0.5 rounded text-[8px] font-mono uppercase tracking-widest border ${
            difficulty === 'easy' ? 'bg-green-500/15 border-green-500/30 text-green-400' :
            difficulty === 'normal' ? 'bg-yellow-500/15 border-yellow-500/30 text-yellow-400' :
            'bg-red-500/15 border-red-500/30 text-red-400'
          }`}>{difficulty}</div>

          {/* BPM */}
          <div className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[9px] font-mono text-white/60">
            {bpm} BPM
          </div>

          {/* Mic toggle */}
          <button
            onClick={handleMicToggle}
            className={`px-2 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase tracking-widest transition-all border ${
              micOn
                ? 'bg-pink-500/20 border-pink-500/40 text-pink-400 hover:bg-pink-500/30'
                : 'bg-white/5 border-white/10 text-white/30 hover:bg-white/10'
            }`}
            title={micOn ? 'Disable microphone' : 'Enable microphone input'}
          >
            {micOn ? <Mic className="w-3 h-3" /> : <MicOff className="w-3 h-3" />}
          </button>

          {/* Play / Stop */}
          <button
            onClick={handlePlayStop}
            className={`px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase tracking-widest transition-all ${
              playing
                ? 'bg-red-500/20 border border-red-500/40 text-red-400 hover:bg-red-500/30'
                : 'bg-green-500/20 border border-green-500/40 text-green-400 hover:bg-green-500/30'
            }`}
          >
            {playing ? (
              <span className="flex items-center gap-1.5"><Square className="w-3 h-3" /> Stop</span>
            ) : (
              <span className="flex items-center gap-1.5"><Play className="w-3 h-3" /> Play</span>
            )}
          </button>
        </div>
      </div>

      {/* ─── Mic Listen Phase ────────────────────────────────── */}
      {micOn && (listenPhase === 'listening' || listenPhase === 'ready') && !playing && (
        <div className="rounded-xl border border-pink-500/20 bg-pink-500/[0.03] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${listenPhase === 'listening' ? 'bg-pink-500 animate-pulse' : 'bg-green-500'}`} />
              <span className="text-[10px] font-mono text-pink-400 uppercase tracking-widest font-bold">
                {listenPhase === 'listening' ? 'Listening...' : 'Ready — band configured from your input'}
              </span>
            </div>
            {micAnalysis && (
              <span className="text-[8px] font-mono text-white/30">{(micAnalysis.confidence * 100).toFixed(0)}% confidence</span>
            )}
          </div>

          {/* Mic waveform */}
          <canvas ref={micCanvasRef} width={640} height={60} className="w-full h-[60px] rounded-lg" />

          {/* Instructions */}
          <div className="text-[9px] font-mono text-white/40 space-y-1">
            {listenPhase === 'listening' ? (
              <>
                <p className="text-pink-300">Sing, play, or tap a rhythm into your mic.</p>
                <p>The band will auto-detect your key, tempo, time signature, and motif.</p>
                <p>Tap a steady beat for BPM. Play a melody for key detection. The more you give, the smarter the band gets.</p>
              </>
            ) : (
              <p className="text-green-300">Input detected. Hit "Start Band" to let the AI band play around your motif.</p>
            )}
          </div>

          {/* Detected values */}
          {micAnalysis && micAnalysis.confidence > 0.15 && (
            <div className="grid grid-cols-5 gap-2">
              <div className="text-center p-1.5 bg-white/[0.03] rounded-lg">
                <div className="text-xs font-mono font-bold text-pink-300">
                  {['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][micAnalysis.detectedKey]}
                </div>
                <div className="text-[6px] font-mono text-white/25 uppercase">Key</div>
              </div>
              <div className="text-center p-1.5 bg-white/[0.03] rounded-lg">
                <div className="text-xs font-mono font-bold text-pink-300">{micAnalysis.detectedBPM}</div>
                <div className="text-[6px] font-mono text-white/25 uppercase">BPM</div>
              </div>
              <div className="text-center p-1.5 bg-white/[0.03] rounded-lg">
                <div className="text-xs font-mono font-bold text-pink-300">{micAnalysis.detectedTimeSig}/4</div>
                <div className="text-[6px] font-mono text-white/25 uppercase">Time</div>
              </div>
              <div className="text-center p-1.5 bg-white/[0.03] rounded-lg">
                <div className="text-xs font-mono font-bold text-pink-300">{micAnalysis.phraseLength} bar{micAnalysis.phraseLength !== 1 ? 's' : ''}</div>
                <div className="text-[6px] font-mono text-white/25 uppercase">Phrase</div>
              </div>
              <div className="text-center p-1.5 bg-white/[0.03] rounded-lg">
                <div className="text-xs font-mono font-bold text-pink-300 capitalize">{micAnalysis.instrument}</div>
                <div className="text-[6px] font-mono text-white/25 uppercase">Source</div>
              </div>
            </div>
          )}

          {/* Motif display */}
          {micAnalysis && micAnalysis.motifNotes.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[7px] font-mono text-white/20 mr-1">Motif:</span>
              {micAnalysis.motifNotes.slice(-16).map((pc, i) => (
                <span key={i} className="px-1 py-0.5 rounded text-[7px] font-mono bg-pink-500/10 text-pink-300">
                  {['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][pc]}
                </span>
              ))}
            </div>
          )}

          {/* Start band button */}
          {listenPhase === 'ready' && (
            <button
              onClick={handleStartFromMic}
              className="w-full py-2 rounded-lg bg-green-500/20 border border-green-500/40 text-green-400 text-[10px] font-mono font-bold uppercase tracking-widest hover:bg-green-500/30 transition-all"
            >
              Start Band Around Your Input
            </button>
          )}
        </div>
      )}

      {/* ─── Visualization canvas ──────────────────────────── */}
      <div className="relative rounded-xl overflow-hidden border border-white/10 bg-[#050508]">
        <canvas
          ref={canvasRef}
          width={640}
          height={160}
          className="w-full h-[160px]"
        />

        {/* Chord overlay */}
        <div className="absolute bottom-0 left-0 right-0 flex items-center gap-0 h-7 bg-black/60 backdrop-blur-sm">
          {currentChords.map((name, i) => (
            <div key={i} className={`flex-1 text-center text-[10px] font-mono font-bold transition-colors ${
              currentBar % 4 === i ? gInfo.color : 'text-white/30'
            }`}>
              {name || '—'}
            </div>
          ))}
          {currentChords.length === 0 && (
            <div className="flex-1 text-center text-[10px] font-mono text-white/20">press play to start the band</div>
          )}
        </div>

        {/* Session stats overlay */}
        {playing && (
          <div className="absolute top-2 left-3 flex items-center gap-3 text-[8px] font-mono text-white/40">
            <span>BAR {currentBar}</span>
            <span className="text-cyan-400">YOU: {sessionStats.userNotes}</span>
            <span className={gInfo.color}>AI: {sessionStats.aiNotes}</span>
          </div>
        )}
      </div>

      {/* ─── Genre selector ────────────────────────────────── */}
      <div className="grid grid-cols-5 gap-1.5">
        {(Object.entries(GENRE_INFO) as [Genre, typeof gInfo][]).map(([g, info]) => (
          <button
            key={g}
            onClick={() => setGenre(g)}
            className={`px-2 py-2 rounded-lg text-center transition-all border ${
              genre === g
                ? `bg-white/10 border-white/20 ${info.color}`
                : 'bg-white/[0.02] border-white/5 text-white/30 hover:bg-white/5'
            }`}
          >
            <div className="text-lg leading-none mb-1">{info.icon}</div>
            <div className="text-[8px] font-mono font-bold uppercase tracking-widest">{info.label}</div>
            <div className="text-[6px] font-mono text-white/20 mt-0.5">{info.artist}</div>
          </button>
        ))}
      </div>

      {/* ─── Effect Pedals ───────────────────────────────────── */}
      <div className="space-y-2">
        <div className="text-[8px] font-mono text-white/30 uppercase tracking-widest flex items-center gap-1">
          <Zap className="w-3 h-3" /> Effect Pedals
        </div>
        <div className="grid grid-cols-4 gap-2">
          {([
            { type: 'distortion' as EffectType, label: 'DIST', icon: <Flame className="w-4 h-4" />, color: 'orange',
              params: [
                { key: 'amount', label: 'Drive', min: 1, max: 10, step: 0.5 },
                { key: 'tone', label: 'Tone', min: 500, max: 8000, step: 100 },
              ]},
            { type: 'delay' as EffectType, label: 'DELAY', icon: <Timer className="w-4 h-4" />, color: 'blue',
              params: [
                { key: 'time', label: 'Time', min: 0.05, max: 1, step: 0.025 },
                { key: 'feedback', label: 'Feedback', min: 0, max: 0.85, step: 0.05 },
                { key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.05 },
              ]},
            { type: 'chorus' as EffectType, label: 'CHORUS', icon: <Repeat className="w-4 h-4" />, color: 'purple',
              params: [
                { key: 'rate', label: 'Rate', min: 0.1, max: 5, step: 0.1 },
                { key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.05 },
              ]},
            { type: 'halfspeed' as EffectType, label: '½ SPD', icon: <Disc className="w-4 h-4" />, color: 'green',
              params: [
                { key: 'mix', label: 'Mix', min: 0, max: 1, step: 0.05 },
              ]},
          ]).map(pedal => {
            const state = effects[pedal.type];
            const isOn = state.enabled;
            const cMap: Record<string, string> = {
              orange: isOn ? 'bg-orange-500/20 border-orange-500/40 text-orange-400' : '',
              blue: isOn ? 'bg-blue-500/20 border-blue-500/40 text-blue-400' : '',
              purple: isOn ? 'bg-purple-500/20 border-purple-500/40 text-purple-400' : '',
              green: isOn ? 'bg-green-500/20 border-green-500/40 text-green-400' : '',
            };
            return (
              <div key={pedal.type} className={`p-2 rounded-lg border transition-all ${
                isOn ? cMap[pedal.color] : 'bg-white/[0.02] border-white/5 text-white/30'
              }`}>
                <button
                  onClick={() => {
                    const newState = { ...effects };
                    newState[pedal.type] = { ...newState[pedal.type], enabled: !isOn };
                    setEffects(newState);
                    bandRef.current?.toggleEffect(pedal.type, !isOn);
                  }}
                  className="w-full flex flex-col items-center gap-1 mb-1"
                >
                  {pedal.icon}
                  <span className="text-[8px] font-mono font-bold uppercase tracking-widest">{pedal.label}</span>
                  <span className={`text-[6px] font-mono uppercase ${isOn ? 'text-inherit' : 'text-white/20'}`}>
                    {isOn ? 'ON' : 'OFF'}
                  </span>
                </button>
                {isOn && (
                  <div className="space-y-1 mt-1 pt-1 border-t border-white/5">
                    {pedal.params.map(p => (
                      <div key={p.key}>
                        <div className="flex items-center justify-between">
                          <span className="text-[6px] font-mono text-white/30">{p.label}</span>
                          <span className="text-[6px] font-mono text-white/40">
                            {state.params[p.key] >= 100 ? state.params[p.key].toFixed(0) : state.params[p.key].toFixed(2)}
                          </span>
                        </div>
                        <input
                          type="range"
                          min={p.min} max={p.max} step={p.step}
                          value={state.params[p.key]}
                          onChange={e => {
                            const val = +e.target.value;
                            const newState = { ...effects };
                            newState[pedal.type] = {
                              ...newState[pedal.type],
                              params: { ...newState[pedal.type].params, [p.key]: val }
                            };
                            setEffects(newState);
                            bandRef.current?.setEffectParam(pedal.type, p.key, val);
                          }}
                          className="w-full h-0.5 bg-white/10 rounded-full appearance-none cursor-pointer"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Visual Piano Keyboard ─────────────────────────── */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <div className="text-[8px] font-mono text-white/30 uppercase tracking-widest">
            <Keyboard className="w-3 h-3 inline mr-1" />
            Keyboard Input — {difficulty === 'easy' ? 'Root Notes Highlighted' : difficulty === 'hard' ? 'All Notes Active' : 'Scale Notes Shown'}
          </div>
          <div className="text-[7px] font-mono text-white/20">press keys to play along</div>
        </div>

        {/* Upper octave (Q-U) */}
        <div className="flex gap-0.5 h-10 relative">
          {PIANO_KEYS.map((pk, i) => {
            const keyLabel = KEY_LABELS_UPPER[i];
            const keyStr = keyLabel?.toLowerCase();
            const isActive = activeKeys.has(keyStr);
            const isBlack = pk.black;

            if (isBlack) return null; // render blacks separately

            return (
              <button
                key={`upper-${i}`}
                onMouseDown={() => {
                  const midi = UPPER_KEYS[keyStr];
                  if (midi !== undefined && bandRef.current?.isPlaying()) {
                    bandRef.current.userPlay(midi, 0.7);
                    setActiveKeys(prev => new Set(prev).add(keyStr));
                    setTimeout(() => setActiveKeys(prev => { const n = new Set(prev); n.delete(keyStr); return n; }), 200);
                  }
                }}
                className={`flex-1 rounded-b relative flex flex-col items-center justify-end pb-0.5 text-[7px] font-mono transition-all border ${
                  isActive
                    ? 'bg-cyan-500/40 border-cyan-500/60 text-cyan-300 scale-y-95'
                    : 'bg-white/[0.06] border-white/10 text-white/20 hover:bg-white/10'
                }`}
              >
                <span className="text-[6px] opacity-60">{keyLabel}</span>
                <span>{pk.label}</span>
              </button>
            );
          })}
          {/* Black keys overlay */}
          <div className="absolute inset-0 pointer-events-none flex">
            {PIANO_KEYS.map((pk, i) => {
              if (!pk.black) return null;
              const keyLabel = KEY_LABELS_UPPER[i];
              const keyStr = keyLabel?.toLowerCase();
              const isActive = activeKeys.has(keyStr);
              // Position black keys between white keys
              const positions = [0.07, 0.21, null, 0.5, 0.64, 0.78];
              const pos = positions[Math.floor(i / 2)];
              if (pos === null) return null;

              return (
                <button
                  key={`upper-b-${i}`}
                  onMouseDown={() => {
                    const midi = UPPER_KEYS[keyStr];
                    if (midi !== undefined && bandRef.current?.isPlaying()) {
                      bandRef.current.userPlay(midi, 0.7);
                      setActiveKeys(prev => new Set(prev).add(keyStr));
                      setTimeout(() => setActiveKeys(prev => { const n = new Set(prev); n.delete(keyStr); return n; }), 200);
                    }
                  }}
                  className={`absolute pointer-events-auto rounded-b h-[60%] w-[8%] text-[5px] font-mono flex items-end justify-center pb-0.5 border transition-all ${
                    isActive
                      ? 'bg-cyan-500/50 border-cyan-500/60 text-cyan-200'
                      : 'bg-white/[0.15] border-white/20 text-white/30 hover:bg-white/25'
                  }`}
                  style={{ left: `${pos * 100}%` }}
                >
                  {keyLabel}
                </button>
              );
            })}
          </div>
        </div>

        {/* Lower octave (Z-M) */}
        <div className="flex gap-0.5 h-10 relative">
          {PIANO_KEYS.map((pk, i) => {
            const keyLabel = KEY_LABELS_LOWER[i];
            const keyStr = keyLabel?.toLowerCase();
            const isActive = activeKeys.has(keyStr);

            if (pk.black) return null;

            return (
              <button
                key={`lower-${i}`}
                onMouseDown={() => {
                  const midi = LOWER_KEYS[keyStr];
                  if (midi !== undefined && bandRef.current?.isPlaying()) {
                    bandRef.current.userPlay(midi, 0.7);
                    setActiveKeys(prev => new Set(prev).add(keyStr));
                    setTimeout(() => setActiveKeys(prev => { const n = new Set(prev); n.delete(keyStr); return n; }), 200);
                  }
                }}
                className={`flex-1 rounded-b relative flex flex-col items-center justify-end pb-0.5 text-[7px] font-mono transition-all border ${
                  isActive
                    ? 'bg-cyan-500/40 border-cyan-500/60 text-cyan-300 scale-y-95'
                    : 'bg-white/[0.06] border-white/10 text-white/20 hover:bg-white/10'
                }`}
              >
                <span className="text-[6px] opacity-60">{keyLabel}</span>
                <span>{pk.label}</span>
              </button>
            );
          })}
          {/* Black keys overlay */}
          <div className="absolute inset-0 pointer-events-none flex">
            {PIANO_KEYS.map((pk, i) => {
              if (!pk.black) return null;
              const keyLabel = KEY_LABELS_LOWER[i];
              const keyStr = keyLabel?.toLowerCase();
              const isActive = activeKeys.has(keyStr);
              const positions = [0.07, 0.21, null, 0.5, 0.64, 0.78];
              const pos = positions[Math.floor(i / 2)];
              if (pos === null) return null;

              return (
                <button
                  key={`lower-b-${i}`}
                  onMouseDown={() => {
                    const midi = LOWER_KEYS[keyStr];
                    if (midi !== undefined && bandRef.current?.isPlaying()) {
                      bandRef.current.userPlay(midi, 0.7);
                      setActiveKeys(prev => new Set(prev).add(keyStr));
                      setTimeout(() => setActiveKeys(prev => { const n = new Set(prev); n.delete(keyStr); return n; }), 200);
                    }
                  }}
                  className={`absolute pointer-events-auto rounded-b h-[60%] w-[8%] text-[5px] font-mono flex items-end justify-center pb-0.5 border transition-all ${
                    isActive
                      ? 'bg-cyan-500/50 border-cyan-500/60 text-cyan-200'
                      : 'bg-white/[0.15] border-white/20 text-white/30 hover:bg-white/25'
                  }`}
                  style={{ left: `${pos * 100}%` }}
                >
                  {keyLabel}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── Difficulty selector ───────────────────────────── */}
      <div className="grid grid-cols-3 gap-2">
        {(['easy', 'normal', 'hard'] as Difficulty[]).map(d => (
          <button
            key={d}
            onClick={() => setDifficulty(d)}
            className={`p-2 rounded-lg text-center transition-all border ${
              difficulty === d
                ? d === 'easy' ? 'bg-green-500/15 border-green-500/30 text-green-400'
                  : d === 'normal' ? 'bg-yellow-500/15 border-yellow-500/30 text-yellow-400'
                  : 'bg-red-500/15 border-red-500/30 text-red-400'
                : 'bg-white/[0.02] border-white/5 text-white/30 hover:bg-white/5'
            }`}
          >
            <div className="text-[10px] font-mono font-bold uppercase tracking-widest">{d}</div>
            <div className="text-[6px] font-mono text-white/20 mt-0.5">{difficultyDesc[d]}</div>
          </button>
        ))}
      </div>

      {/* ─── Core sliders ──────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        {/* BPM */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-[8px] font-mono text-white/40 uppercase tracking-widest">BPM</label>
            <span className="text-[9px] font-mono text-white/60">{bpm}</span>
          </div>
          <input type="range" min={60} max={200} value={bpm}
            onChange={e => setBpm(+e.target.value)}
            className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-cyan-500"
          />
        </div>

        {/* Chaos */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-[8px] font-mono text-white/40 uppercase tracking-widest flex items-center gap-1">
              <Sparkles className="w-2.5 h-2.5" /> Chaos
            </label>
            <span className="text-[9px] font-mono text-white/60">{(chaos * 100).toFixed(0)}%</span>
          </div>
          <input type="range" min={0} max={100} value={chaos * 100}
            onChange={e => setChaos(+e.target.value / 100)}
            className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-purple-500"
          />
        </div>

        {/* Swing */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-[8px] font-mono text-white/40 uppercase tracking-widest flex items-center gap-1">
              <Waves className="w-2.5 h-2.5" /> Swing
            </label>
            <span className="text-[9px] font-mono text-white/60">{(swing * 100).toFixed(0)}%</span>
          </div>
          <input type="range" min={0} max={100} value={swing * 100}
            onChange={e => setSwing(+e.target.value / 100)}
            className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-amber-500"
          />
        </div>

        {/* Volume */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-[8px] font-mono text-white/40 uppercase tracking-widest flex items-center gap-1">
              {muted ? <VolumeX className="w-2.5 h-2.5" /> : <Volume2 className="w-2.5 h-2.5" />} Volume
            </label>
            <button onClick={() => setMuted(!muted)} className="text-[8px] font-mono text-white/30 hover:text-white/60">
              {muted ? 'unmute' : 'mute'}
            </button>
          </div>
          <input type="range" min={0} max={100} value={muted ? 0 : volume * 100}
            onChange={e => { setMuted(false); setVolume(+e.target.value / 100); }}
            className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-green-500"
          />
        </div>
      </div>

      {/* ─── Advanced settings toggle ─────────────────────── */}
      <button
        onClick={() => setShowSettings(!showSettings)}
        className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.02] border border-white/5 text-[9px] font-mono text-white/40 uppercase tracking-widest hover:bg-white/5 transition-all"
      >
        <span className="flex items-center gap-1.5">
          <Settings2 className="w-3 h-3" />
          Harmony &amp; Theory Settings
        </span>
        <ChevronDown className={`w-3 h-3 transition-transform ${showSettings ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden space-y-3"
          >
            {/* Key selector */}
            <div className="space-y-1">
              <label className="text-[8px] font-mono text-white/40 uppercase tracking-widest">Key</label>
              <div className="grid grid-cols-6 gap-1">
                {KEY_OPTIONS.map(k => (
                  <button
                    key={k.value}
                    onClick={() => setKey(k.value)}
                    className={`px-1 py-1 rounded text-[9px] font-mono font-bold transition-all border ${
                      key === k.value
                        ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400'
                        : 'bg-white/[0.03] border-white/5 text-white/30 hover:bg-white/5'
                    }`}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Harmony Mode */}
            <div className="space-y-1">
              <label className="text-[8px] font-mono text-white/40 uppercase tracking-widest">Harmony Mode</label>
              <div className="grid grid-cols-3 gap-1">
                {HARMONY_MODES.map(m => (
                  <button
                    key={m.value}
                    onClick={() => setHarmonyMode(m.value)}
                    className={`px-1 py-1.5 rounded text-[8px] font-mono font-bold uppercase tracking-wider transition-all border ${
                      harmonyMode === m.value
                        ? 'bg-amber-500/15 border-amber-500/30 text-amber-400'
                        : 'bg-white/[0.03] border-white/5 text-white/30 hover:bg-white/5'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Reharmonisation */}
            <div className="space-y-1">
              <label className="text-[8px] font-mono text-white/40 uppercase tracking-widest">Reharmonisation</label>
              <div className="grid grid-cols-3 gap-1">
                {REHARM_MODES.map(m => (
                  <button
                    key={m.value}
                    onClick={() => setReharmonisation(m.value)}
                    className={`px-1 py-1.5 rounded text-[7px] font-mono font-bold uppercase tracking-wider transition-all border ${
                      reharmonisation === m.value
                        ? 'bg-purple-500/15 border-purple-500/30 text-purple-400'
                        : 'bg-white/[0.03] border-white/5 text-white/30 hover:bg-white/5'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Inversions toggle */}
            <div className="flex items-center justify-between px-2 py-1.5 rounded-lg bg-white/[0.02] border border-white/5">
              <span className="text-[8px] font-mono text-white/40 uppercase tracking-widest">Chord Inversions</span>
              <button
                onClick={() => setUseInversions(!useInversions)}
                className={`px-2 py-0.5 rounded text-[8px] font-mono uppercase tracking-widest border transition-all ${
                  useInversions
                    ? 'bg-green-500/20 border-green-500/40 text-green-400'
                    : 'bg-white/5 border-white/10 text-white/40'
                }`}
              >
                {useInversions ? 'ON' : 'OFF'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Session memory display ───────────────────────── */}
      {playing && (
        <div className="grid grid-cols-4 gap-2">
          <div className="p-2 bg-white/[0.03] border border-white/5 rounded-lg text-center">
            <div className="text-sm font-mono font-bold text-cyan-400">{sessionStats.userNotes}</div>
            <div className="text-[6px] font-mono text-white/25 uppercase">Your Notes</div>
          </div>
          <div className="p-2 bg-white/[0.03] border border-white/5 rounded-lg text-center">
            <div className={`text-sm font-mono font-bold ${gInfo.color}`}>{sessionStats.aiNotes}</div>
            <div className="text-[6px] font-mono text-white/25 uppercase">AI Notes</div>
          </div>
          <div className="p-2 bg-white/[0.03] border border-white/5 rounded-lg text-center">
            <div className="text-sm font-mono font-bold text-white/60">{sessionStats.bars}</div>
            <div className="text-[6px] font-mono text-white/25 uppercase">Bars</div>
          </div>
          <div className="p-2 bg-white/[0.03] border border-white/5 rounded-lg text-center">
            <div className="text-sm font-mono font-bold text-green-400">{bpm}</div>
            <div className="text-[6px] font-mono text-white/25 uppercase">BPM</div>
          </div>
        </div>
      )}

      {/* ─── Live Mic Adaptation (while playing) ────────────── */}
      {micOn && playing && micAnalysis && micAnalysis.confidence > 0.2 && (
        <div className="p-2 bg-pink-500/[0.03] border border-pink-500/15 rounded-lg flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-pink-500 animate-pulse flex-shrink-0" />
          <span className="text-[8px] font-mono text-pink-400 uppercase tracking-widest">Mic Live</span>
          <span className="text-[8px] font-mono text-pink-300">
            {['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][micAnalysis.detectedKey]} &middot; {micAnalysis.detectedBPM}bpm &middot; {micAnalysis.instrument}
          </span>
          <span className="text-[7px] font-mono text-white/20 ml-auto">adapting band to your input</span>
        </div>
      )}
    </div>
  );
}
