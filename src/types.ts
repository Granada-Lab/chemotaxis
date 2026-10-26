export interface Vector {
  x: number;
  y: number;
}

export interface Bacterium {
  id: string;
  position: Vector;
  heading: number;
  state: 'run' | 'tumble';
  m: number;        // methylation level ∈ [0, M_MAX]
  K: number;        // K(m) = K0·exp(γ·m)
  activity: number; // a = 1/(1+(S/K)^n)
  tumbleFreq: number;
  tumbleTimer: number;
  history: { activity: number; m: number }[];
  pathHistory: Vector[];
  // Per-cell diversity multipliers (fixed at creation, applied to global rates each step)
  cheR_mult: number;
  cheB_mult: number;
  cheR_i: number;
  cheB_i: number;
  n_i: number;
  signal: number;
}

export interface SimulationParams {
  uniformBackground: number;
  gradientSlope: number;
  cheRRate: number;        // V_R·R — controls a_st and adaptation speed
  cheBRate: number;        // V_B·B — controls a_st
  hillCoefficient: number; // n
  cheBSelectivity: number; // β: 1=BL robust, 0=fine-tuned (breaks adaptation)
  chemicalMode: 'attractant' | 'repellent';
  sourceStrength: number;  // peak [S] contributed by the point source
  speed: number;
  numBacteria: number;
  attractantSource: Vector | null;
  diversity: number;
  showTraces: boolean;
  showGradient: boolean;
}

export const INITIAL_PARAMS: SimulationParams = {
  uniformBackground: 0,
  gradientSlope: 0,
  cheRRate: 0.3,
  cheBRate: 1.0,
  hillCoefficient: 6,
  cheBSelectivity: 1.0,
  chemicalMode: 'attractant',
  sourceStrength: 120,
  speed: 30,
  numBacteria: 15,
  attractantSource: null,
  diversity: 0.2,
  showTraces: true,
  showGradient: true,
};

export const M_MAX = 8;
export const GAMMA = 0.5;
export const K_0 = 0.1;

export function KFromM(m: number): number {
  return K_0 * Math.exp(GAMMA * m);
}
