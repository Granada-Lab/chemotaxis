import { useState, useCallback, useRef, useEffect, MutableRefObject } from 'react';
import { Bacterium, SimulationParams, M_MAX, KFromM } from '../types';

const SIM_W = 800;
const SIM_H = 400;
const PIXELS_PER_UM = 4;
const UI_UPDATE_INTERVAL = 0.12;
const MAX_PATH_POINTS = 80;
const MAX_HISTORY_POINTS = 120;
const BASELINE_SIGNAL = 1;

export interface SimUIState {
  bacteria: Bacterium[];
  time: number;
  ensembleData: { tumbleFreq: number }[];
}

function makeBacterium(i: number, p: SimulationParams): Bacterium {
  const jitter = () => (Math.random() - 0.5) * 2 * p.diversity;
  const cheR_mult = Math.max(0.2, 1 + jitter() * 0.8);
  const cheB_mult = Math.max(0.2, 1 + jitter() * 0.8);
  const cheR_i = p.cheRRate * cheR_mult;
  const cheB_i = p.cheBRate * cheB_mult;
  const a_st_i = Math.min(0.95, Math.max(0.05, cheR_i / cheB_i));
  const n_i = Math.max(1, p.hillCoefficient * (1 + jitter() * 0.3));
  const targetK = BASELINE_SIGNAL / Math.pow((1 / a_st_i) - 1, 1 / n_i);
  const m_center = Math.log(Math.max(1e-4, targetK) / 0.1) / 0.5;
  const m_init = Math.max(0, Math.min(M_MAX, m_center + (Math.random() - 0.5) * p.diversity));

  return {
    id: `b-${i}`,
    position: { x: Math.random() * SIM_W, y: Math.random() * SIM_H },
    heading: Math.random() * Math.PI * 2,
    state: 'run',
    m: m_init,
    K: KFromM(m_init),
    activity: a_st_i,
    tumbleFreq: 1,
    tumbleTimer: 0,
    history: [],
    pathHistory: [],
    cheR_mult,
    cheB_mult,
    cheR_i,
    cheB_i,
    n_i,
    signal: 0,
  };
}

export function useChemotaxisModel(
  params: SimulationParams,
  isPlaying: boolean,
): {
  bacteriaRef: MutableRefObject<Bacterium[]>;
  uiState: SimUIState;
  selectedIdRef: MutableRefObject<string | null>;
  reset: () => void;
} {
  // ── Simulation lives entirely in refs — no React re-render per frame ──────
  const bacteriaRef = useRef<Bacterium[]>([]);
  const timeRef = useRef(0);
  const frameRef = useRef(0);
  const ensembleHistRef = useRef<{ tumbleFreq: number }[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const lastUiUpdateRef = useRef(0);

  const paramsRef = useRef(params);
  paramsRef.current = params;
  const selectedIdRef = useRef<string | null>(null);

  // ── React state — updated every 4 frames (~15 fps) for UI panels ──────────
  const [uiState, setUiState] = useState<SimUIState>({
    bacteria: [], time: 0, ensembleData: [],
  });

  // ── Init / reset ──────────────────────────────────────────────────────────
  const initBacteria = useCallback(() => {
    const p = paramsRef.current;
    bacteriaRef.current = Array.from({ length: p.numBacteria }, (_, i) => makeBacterium(i, p));
    timeRef.current = 0;
    frameRef.current = 0;
    ensembleHistRef.current = [];
    lastTsRef.current = null;
    lastUiUpdateRef.current = 0;
    setUiState({ bacteria: [...bacteriaRef.current], time: 0, ensembleData: [] });
  }, []);

  useEffect(() => {
    initBacteria();
  // Only reset when population *composition* changes (not kinetic params)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.numBacteria, params.diversity]);

  // ── Simulation step ───────────────────────────────────────────────────────
  const step = useCallback((dt: number) => {
    const p = paramsRef.current;
    const selId = selectedIdRef.current;
    const beta = p.cheBSelectivity;
    const chemicalSign = p.chemicalMode === 'attractant' ? 1 : -1;

    const bact = bacteriaRef.current;
    for (const b of bact) {
      // Per-cell rates use global params × per-cell diversity multiplier
      // → slider changes take effect immediately on all running bacteria
      const cheR_i = p.cheRRate * b.cheR_mult;
      const cheB_i = p.cheBRate * b.cheB_mult;
      const a_st_i = cheR_i / cheB_i;

      // 1. Local attractant [S]
      let S = BASELINE_SIGNAL + p.uniformBackground + Math.max(0, (b.position.x / SIM_W) * 10 * p.gradientSlope);
      if (p.attractantSource) {
        const dx = b.position.x - p.attractantSource.x;
        const dy = b.position.y - p.attractantSource.y;
        S += p.sourceStrength / (Math.sqrt(dx * dx + dy * dy) + 15);
      }
      const effectiveSignal = S * chemicalSign;

      // 2. Receptor activity: a = 1/(1+(S/K)^n)
      const nextActivity = 1 / (1 + Math.pow(b.K > 0 ? S / b.K : 0, b.n_i));

      // 3. Barkai-Leibler methylation: dm/dt = V_R − V_B·(β·a + (1−β))
      //    β=1 → acts only on X* → exact adaptation (robust)
      //    β=0 → acts on all → fine-tuned, fails
      const dm = (cheR_i - cheB_i * (beta * nextActivity + (1 - beta))) * dt;
      const next_m = Math.max(0, Math.min(M_MAX, b.m + dm));
      const next_K = KFromM(next_m);

      // 4. Run-and-tumble: favorable temporal sensing suppresses tumbles.
      const temporalSignal = (effectiveSignal - b.signal) / Math.max(dt, 1e-3);
      const normalizedSignal = temporalSignal / Math.max(0.5, S + 0.5);
      const biasGain = Math.max(0.04, 1 - normalizedSignal * 4.5);
      const tumbleFreq = Math.max(0.02, (nextActivity / Math.max(0.01, a_st_i)) * biasGain);
      let nextState = b.state;
      let nextHeading = b.heading;
      let nextTumbleTimer = b.tumbleTimer;

      if (b.state === 'run') {
        if (Math.random() < tumbleFreq * dt) {
          nextState = 'tumble';
          nextTumbleTimer = 0.06 + Math.random() * 0.07;
        }
      } else {
        const sign = Math.random() < 0.5 ? 1 : -1;
        nextHeading += sign * (Math.PI / 8 + Math.random() * (5 * Math.PI / 8));
        nextTumbleTimer -= dt;
        if (nextTumbleTimer <= 0) nextState = 'run';
      }

      // 5. Position (wrapping)
      const spd = nextState === 'run' ? p.speed * PIXELS_PER_UM * dt : 0;
      const nextPosition = {
        x: ((b.position.x + Math.cos(nextHeading) * spd) + SIM_W * 2) % SIM_W,
        y: ((b.position.y + Math.sin(nextHeading) * spd) + SIM_H * 2) % SIM_H,
      };

      // 6. Histories
      if (b.id === selId) {
        b.history.push({ activity: nextActivity, m: next_m });
        if (b.history.length > MAX_HISTORY_POINTS) b.history.shift();
      } else if (b.history.length > 0) {
        b.history = [];
      }

      if (p.showTraces) {
        b.pathHistory.unshift({ x: b.position.x, y: b.position.y });
        if (b.pathHistory.length > MAX_PATH_POINTS) b.pathHistory.pop();
      } else if (b.pathHistory.length > 0) {
        b.pathHistory = [];
      }

      b.position = nextPosition;
      b.heading = nextHeading;
      b.state = nextState;
      b.activity = nextActivity;
      b.tumbleFreq = tumbleFreq;
      b.m = next_m;
      b.K = next_K;
      b.cheR_i = cheR_i;
      b.cheB_i = cheB_i;
      b.signal = effectiveSignal;
      b.tumbleTimer = nextTumbleTimer;
    }

    timeRef.current += dt;
    frameRef.current++;

    // Push to React state at a fixed low frequency to keep controls responsive.
    if (timeRef.current - lastUiUpdateRef.current >= UI_UPDATE_INTERVAL) {
      lastUiUpdateRef.current = timeRef.current;
      const avgTumbleFreq = bact.length > 0
        ? bact.reduce((s, b) => s + b.tumbleFreq, 0) / bact.length
        : 1;
      ensembleHistRef.current = [...ensembleHistRef.current, { tumbleFreq: avgTumbleFreq }].slice(-300);
      setUiState({
        bacteria: bact.map(b => ({
          ...b,
          position: { ...b.position },
          history: b.history.slice(),
          pathHistory: b.pathHistory.slice(),
        })),
        time: timeRef.current,
        ensembleData: [...ensembleHistRef.current],
      });
    }
  }, []);

  // ── Animation loop ────────────────────────────────────────────────────────
  const animate = useCallback((ts: number) => {
    if (lastTsRef.current !== null) {
      step(Math.min((ts - lastTsRef.current) / 1000, 0.05));
    }
    lastTsRef.current = ts;
    rafRef.current = requestAnimationFrame(animate);
  }, [step]);

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      lastTsRef.current = null;
      return;
    }
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    };
  }, [animate, isPlaying]);

  return {
    bacteriaRef,
    uiState,
    selectedIdRef,
    reset: initBacteria,
  };
}
