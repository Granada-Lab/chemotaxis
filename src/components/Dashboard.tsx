import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Dna, Settings, Play, Pause, RefreshCcw,
  Activity as ActivityIcon, Calculator, Microscope, Network, Waves, MapPin, Info,
} from 'lucide-react';
import { useChemotaxisModel } from '../hooks/useChemotaxisModel';
import { INITIAL_PARAMS, SimulationParams, M_MAX, GAMMA } from '../types';
import { LineChart, Line, YAxis, ResponsiveContainer, ReferenceLine } from 'recharts';

const SIM_W = 800;
const SIM_H = 400;
const PIXELS_PER_UM = 4;
const BACTERIUM_LENGTH_UM = 3;
const SCALE_BAR_UM = 10;

export default function Dashboard() {
  const [params, setParams] = useState<SimulationParams>(INITIAL_PARAMS);
  const [isPlaying, setIsPlaying] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'sim' | 'math' | 'pathway' | 'details'>('sim');

  const { bacteriaRef, uiState, selectedIdRef, reset } = useChemotaxisModel(params, isPlaying);
  const { bacteria, time, ensembleData } = uiState;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paramsRef = useRef(params);
  paramsRef.current = params;

  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId, selectedIdRef]);

  const selected = useMemo(
    () => bacteria.find(b => b.id === selectedId) ?? bacteria[0],
    [bacteria, selectedId],
  );

  const set = useCallback(<K extends keyof SimulationParams>(k: K, v: SimulationParams[K]) =>
    setParams(p => ({ ...p, [k]: v })), []);

  const preset = useCallback((patch: Partial<SimulationParams>) =>
    setParams(p => ({ ...p, ...patch })), []);

  // Canvas click: scaled coords + select bacterium or place source
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) * (SIM_W / r.width);
    const y = (e.clientY - r.top) * (SIM_H / r.height);
    const hit = bacteriaRef.current.find(b => {
      const dx = b.position.x - x, dy = b.position.y - y;
      return Math.sqrt(dx * dx + dy * dy) < 14;
    });
    if (hit) {
      setSelectedId(hit.id);
    } else {
      const src = paramsRef.current.attractantSource;
      if (src && Math.abs(src.x - x) < 18 && Math.abs(src.y - y) < 18) {
        setParams(p => ({ ...p, attractantSource: null }));
      } else {
        setParams(p => ({ ...p, attractantSource: { x, y } }));
      }
    }
  };

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let rafId = 0;

    const render = () => {
      const p = paramsRef.current;
      const liveBacteria = bacteriaRef.current;
      const liveSelectedId = selectedIdRef.current;
      const fieldColor = p.chemicalMode === 'attractant' ? '59,130,246' : '220,38,38';
      ctx.clearRect(0, 0, SIM_W, SIM_H);

      // Concentration field background
      if (p.showGradient && p.uniformBackground > 0) {
        const uniformAlpha = Math.min(0.22, 0.05 + p.uniformBackground * 0.08);
        ctx.fillStyle = `rgba(${fieldColor},${uniformAlpha})`;
        ctx.fillRect(0, 0, SIM_W, SIM_H);
      }
      if (p.showGradient && p.gradientSlope > 0) {
        const alpha = Math.min(0.3, 0.08 + p.gradientSlope * 1.45);
        const bg = ctx.createLinearGradient(0, 0, SIM_W, 0);
        bg.addColorStop(0, 'rgba(255,255,255,0.02)');
        bg.addColorStop(1, `rgba(${fieldColor},${alpha})`);
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, SIM_W, SIM_H);
      }

      // Point source: glow + iso-concentration rings
      if (p.attractantSource) {
        const { x, y } = p.attractantSource;
        const glow = ctx.createRadialGradient(x, y, 0, x, y, 180);
        glow.addColorStop(0, p.chemicalMode === 'attractant' ? 'rgba(37,99,235,0.28)' : 'rgba(220,38,38,0.28)');
        glow.addColorStop(0.6, p.chemicalMode === 'attractant' ? 'rgba(37,99,235,0.1)' : 'rgba(220,38,38,0.1)');
        glow.addColorStop(1, p.chemicalMode === 'attractant' ? 'rgba(37,99,235,0)' : 'rgba(220,38,38,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(x - 180, y - 180, 360, 360);
        ctx.setLineDash([3, 5]);
        for (const [r, a] of [[40, 0.18], [85, 0.10], [140, 0.05]] as [number, number][]) {
          ctx.beginPath();
          ctx.strokeStyle = p.chemicalMode === 'attractant' ? `rgba(37,99,235,${a})` : `rgba(220,38,38,${a})`;
          ctx.lineWidth = 0.8;
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.fillStyle = p.chemicalMode === 'attractant' ? '#1d4ed8' : '#dc2626';
        ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = p.chemicalMode === 'attractant' ? '#1e40af' : '#991b1b'; ctx.lineWidth = 1; ctx.stroke();
      }

      // Bacteria
      liveBacteria.forEach(b => {
        const isSel = b.id === liveSelectedId;

        // Path traces
        if (p.showTraces && b.pathHistory.length > 1) {
          for (let i = 0; i < b.pathHistory.length - 1; i++) {
            const p1 = b.pathHistory[i], p2 = b.pathHistory[i + 1];
            if (Math.abs(p1.x - p2.x) < 100 && Math.abs(p1.y - p2.y) < 100) {
              const alpha = (1 - i / b.pathHistory.length) * (isSel ? 0.65 : 0.2);
              ctx.beginPath();
              ctx.lineWidth = isSel ? 1.5 : 0.8;
              ctx.strokeStyle = isSel ? `rgba(20,20,20,${alpha})`
                : b.state === 'run' ? `rgba(34,197,94,${alpha})` : `rgba(234,88,12,${alpha})`;
              ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
            }
          }
        }

        ctx.save();
        ctx.translate(b.position.x, b.position.y);
        ctx.rotate(b.heading);

        // Selection ring
        if (isSel) {
          ctx.beginPath(); ctx.strokeStyle = '#141414'; ctx.lineWidth = 1;
          ctx.arc(0, 0, 9 + Math.sin(Date.now() / 130) * 2, 0, Math.PI * 2); ctx.stroke();
        }

        // Flagella
        ctx.strokeStyle = b.state === 'run' ? 'rgba(59,130,246,0.7)' : 'rgba(249,115,22,0.7)';
        ctx.lineWidth = isSel ? 1.5 : 1;
        ctx.beginPath();
        if (b.state === 'run') {
          ctx.moveTo(-6, 0); ctx.lineTo(-18, 0);
        } else {
          const t = Date.now() / 80;
          ctx.moveTo(-6, 0);
          ctx.bezierCurveTo(-10, Math.sin(t) * 3.5, -14, -Math.sin(t) * 3.5, -18, Math.sin(t + 1) * 4);
        }
        ctx.stroke();

        // Body
        ctx.fillStyle = isSel ? '#1a1a1a' : b.state === 'run' ? '#22c55e' : '#ea580c';
        ctx.beginPath(); ctx.ellipse(0, 0, isSel ? 7 : 6, isSel ? 3 : 2.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.5; ctx.stroke();

        ctx.restore();
      });

      if (isPlaying) {
        rafId = requestAnimationFrame(render);
      }
    };

    render();
    return () => cancelAnimationFrame(rafId);
  }, [bacteriaRef, isPlaying, selectedIdRef]);

  // Derived display values
  const a_st = params.cheRRate / params.cheBRate;
  const tau_adapt = 1 / (params.cheBRate * GAMMA);
  const runCount = bacteria.filter(b => b.state === 'run').length;
  const meanActivity = bacteria.length > 0 ? bacteria.reduce((s, b) => s + b.activity, 0) / bacteria.length : 0;
  const meanM = bacteria.length > 0 ? bacteria.reduce((s, b) => s + b.m, 0) / bacteria.length : 0;
  const meanX = bacteria.length > 0 ? bacteria.reduce((s, b) => s + b.position.x, 0) / bacteria.length : 0;
  const meanXUm = meanX / PIXELS_PER_UM;
  const motionColor = params.chemicalMode === 'attractant' ? 'text-blue-700' : 'text-red-700';
  const chemicalAccent = params.chemicalMode === 'attractant' ? 'text-blue-700' : 'text-red-700';

  // Telemetry chart data: overlay activity + normalised m
  const telemetryData = useMemo(() =>
    (selected?.history ?? []).map(h => ({ activity: h.activity, m_norm: h.m / M_MAX })),
    [selected],
  );

  // β colour indicator
  const betaColor = params.cheBSelectivity > 0.7 ? 'text-green-700' :
    params.cheBSelectivity > 0.3 ? 'text-amber-600' : 'text-red-600';
  const betaLabel = params.cheBSelectivity > 0.7 ? 'Barkai-Leibler (Robust)' :
    params.cheBSelectivity > 0.3 ? 'Partial Adaptation' : 'Fine-tuned (Breaks)';

  return (
    <div className="flex flex-col h-screen bg-[#E4E3E0] text-[#141414] font-sans select-none">
      {/* ── Header ── */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-[#141414] shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-[#141414] p-1.5 text-[#E4E3E0] rounded-sm"><Dna size={22} /></div>
          <div>
            <h1 className="text-base font-bold tracking-tight uppercase leading-tight">
              Teaching Bacterial Chemotaxis
            </h1>
            <p className="text-[9px] font-mono opacity-40 uppercase tracking-widest">
              Barkai-Leibler Model · Alon (2020) Ch.9 · Tu, Shimizu &amp; Berg (2008)
            </p>
          </div>
        </div>

        <nav className="flex gap-1 bg-[#d4d3d0] p-1 rounded-sm">
          {([['sim', 'Simulation', Microscope], ['math', 'Equations', Calculator], ['pathway', 'Pathway', Network], ['details', 'Simulation Details', Info]] as const).map(
            ([id, label, Icon]) => (
              <button key={id} onClick={() => setActiveTab(id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs font-medium transition-all ${
                  activeTab === id ? 'bg-[#141414] text-[#E4E3E0]' : 'hover:bg-[#c4c3c0] text-[#141414]/50 hover:text-[#141414]'}`}>
                <Icon size={12} />{label}
              </button>
            )
          )}
        </nav>

        <div className="flex items-center gap-4">
          <button onClick={() => setIsPlaying(v => !v)}
            className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider underline underline-offset-4 decoration-2">
            {isPlaying ? <Pause size={13} /> : <Play size={13} />}
            {isPlaying ? 'Pause' : 'Resume'}
          </button>
          <button onClick={reset} title="Reset bacteria" className="opacity-35 hover:opacity-100 transition-opacity">
            <RefreshCcw size={14} />
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* ── Left Sidebar ── */}
        <aside className="border-r border-[#141414] bg-[#EBEAE7] overflow-y-auto flex flex-col shrink-0" style={{ width: '270px' }}>
          <div className="p-5 border-b border-[#141414] space-y-5">
            <div className="flex items-center gap-2">
              <Settings size={12} className="opacity-40" />
              <h2 className="text-[9px] font-bold italic uppercase tracking-widest opacity-40">Model Parameters</h2>
            </div>

            {/* Lecture presets */}
            <div>
              <p className="text-[8px] font-bold uppercase tracking-widest opacity-35 mb-2">Lecture Presets</p>
              <div className="grid grid-cols-2 gap-1.5">
                {([
                  ['Random Walk', { gradientSlope: 0, attractantSource: null }],
                  ['Step Demo', { gradientSlope: 0, attractantSource: null, uniformBackground: 1.2, chemicalMode: 'attractant' }],
                  ['Linear Grad.', { gradientSlope: 0.1 }],
                  ['Repellent', { chemicalMode: 'repellent', gradientSlope: 0.1 }],
                  ['High CheR', { cheRRate: 0.6, cheBRate: 1.0, cheBSelectivity: 1.0 }],
                  ['Low CheR', { cheRRate: 0.1, cheBRate: 1.0, cheBSelectivity: 1.0 }],
                  ['BL Robust (β=1)', { cheBSelectivity: 1.0 }],
                  ['Fine-Tuned (β=0)', { cheBSelectivity: 0.0 }],
                ] as [string, Partial<SimulationParams>][]).map(([label, p]) => (
                  <button key={label} onClick={() => preset(p)}
                    className="px-2 py-1.5 border border-[#141414] text-[9px] font-bold uppercase hover:bg-[#141414] hover:text-[#E4E3E0] transition-colors">
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Environment */}
            <ParamGroup title="Environment">
              <SliderRow label="Uniform Background" value={params.uniformBackground} min={0} max={4} step={0.05} unit="a.u."
                onChange={v => set('uniformBackground', v)} />
              <SliderRow label="Gradient Slope" value={params.gradientSlope} min={0} max={0.2} step={0.005} unit="µM/µm"
                onChange={v => set('gradientSlope', v)} />
              <SegmentedRow
                label="Chemical Mode"
                value={params.chemicalMode}
                options={[
                  { value: 'attractant', label: 'Attractant' },
                  { value: 'repellent', label: 'Repellent' },
                ]}
                onChange={v => set('chemicalMode', v)}
              />
              <ToggleRow label="Visual Traces" value={params.showTraces} onChange={v => set('showTraces', v)} />
              <ToggleRow label="Show Gradient" value={params.showGradient} onChange={v => set('showGradient', v)} />
            </ParamGroup>

            {/* Chemotaxis circuit — the BL model params */}
            <ParamGroup title="Chemotaxis Circuit">
              {/* CheR / CheB sliders side-by-side */}
              <SliderRow label="CheR Rate (V_R)" value={params.cheRRate} min={0.05} max={1.0} step={0.05} unit="s⁻¹"
                onChange={v => set('cheRRate', v)} />
              <SliderRow label="CheB Rate (V_B)" value={params.cheBRate} min={0.1} max={3.0} step={0.1} unit="s⁻¹"
                onChange={v => set('cheBRate', v)} />

              {/* Derived quantities: a_st and τ */}
              <div className="bg-[#141414] text-[#E4E3E0] px-3 py-2 font-mono text-[9px] space-y-1">
                <div className="flex justify-between">
                  <span className="opacity-50">a_st = V_R/V_B</span>
                  <span className="font-bold text-blue-300">{a_st.toFixed(3)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="opacity-50">τ_adapt ≈ 1/(V_B·γ)</span>
                  <span>{tau_adapt.toFixed(1)} s</span>
                </div>
              </div>

              <SliderRow label="Hill Coeff. (n)" value={params.hillCoefficient} min={1} max={15} step={1} unit=""
                onChange={v => set('hillCoefficient', v)} />

              {/* β — the key BL parameter */}
              <div className="space-y-1.5 pt-1 border-t border-[#14141410]">
                <div className="flex justify-between items-baseline">
                  <label className="text-[10px] font-bold uppercase tracking-tight opacity-70">
                    CheB Selectivity (β)
                  </label>
                  <span className={`text-[10px] font-mono font-bold ${betaColor}`}>
                    {params.cheBSelectivity.toFixed(2)}
                  </span>
                </div>
                <input type="range" min={0} max={1} step={0.05} value={params.cheBSelectivity}
                  onChange={e => set('cheBSelectivity', parseFloat(e.target.value))}
                  className="w-full h-0.5 bg-[#141414]/20 appearance-none cursor-ew-resize accent-[#141414] rounded-full" />
                <div className="flex justify-between text-[7px]">
                  <span className="text-red-500 font-bold">β=0 Fine-tuned</span>
                  <span className={`font-bold ${betaColor}`}>{betaLabel}</span>
                  <span className="text-green-600 font-bold">β=1 Robust</span>
                </div>
              </div>
            </ParamGroup>

            {/* Population */}
            <ParamGroup title="Population">
              <SliderRow label="Speed" value={params.speed} min={5} max={60} step={1} unit="µm/s"
                onChange={v => set('speed', v)} />
              <SliderRow label="N Bacteria" value={params.numBacteria} min={1} max={30} step={1} unit=""
                onChange={v => set('numBacteria', Math.round(v))} />
              <SliderRow label="Diversity (σ)" value={params.diversity} min={0} max={1} step={0.05} unit=""
                onChange={v => set('diversity', v)} />
            </ParamGroup>
          </div>

          {/* Telemetry */}
          <div className="p-5 flex-1 bg-white/40">
            <div className="flex items-center gap-2 mb-3">
              <ActivityIcon size={12} className="opacity-40" />
              <h2 className="text-[9px] font-bold italic uppercase tracking-widest opacity-40">Cell Telemetry</h2>
            </div>
            {selected ? (
              <div className="space-y-3">
                <div className="bg-[#141414] text-[#E4E3E0] p-3 font-mono text-[9px] space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-blue-300 font-bold">ID:</span>
                    <span>{selected.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="opacity-50">Motor:</span>
                    <span className={selected.state === 'run' ? 'text-green-400' : 'text-orange-400 font-bold'}>
                      {selected.state === 'run' ? 'CCW — RUN' : 'CW — TUMBLE'}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-white/10 pt-1.5">
                    <span className="opacity-50">Activity (a):</span>
                    <span>{selected.activity.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="opacity-50">Methylation (m):</span>
                    <span>{selected.m.toFixed(2)} / {M_MAX}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="opacity-50">Binding K:</span>
                    <span>{selected.K.toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between border-t border-white/10 pt-1.5">
                    <span className="opacity-50">a_st (V_R/V_B):</span>
                    <span className="text-blue-300">{(selected.cheR_i / selected.cheB_i).toFixed(3)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="opacity-50">a / a_st:</span>
                    <span className={(selected.activity / (selected.cheR_i / selected.cheB_i)) < 0.95 ? 'text-green-400' : 'text-orange-400'}>
                      {(selected.activity / Math.max(0.01, selected.cheR_i / selected.cheB_i)).toFixed(3)}
                    </span>
                  </div>
                </div>

                {telemetryData.length > 3 && (
                  <>
                    <p className="text-[7px] opacity-30 uppercase tracking-widest">
                      Activity (a) · Methylation m/{M_MAX}
                    </p>
                    <div className="h-28 w-full bg-white border border-[#14141415]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={telemetryData} margin={{ top: 3, right: 3, bottom: 3, left: 3 }}>
                          <YAxis domain={[0, 1.1]} hide />
                          <ReferenceLine y={Math.min(1, a_st)} stroke="#3b82f6" strokeDasharray="3 3" strokeWidth={0.8} />
                          <Line type="monotone" dataKey="activity" stroke="#141414" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                          <Line type="monotone" dataKey="m_norm" stroke="#f97316" strokeWidth={1} strokeDasharray="3 2" dot={false} isAnimationActive={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex gap-4 text-[7px] opacity-50">
                      <span className="flex items-center gap-1">
                        <span className="w-4 border-t border-[#141414] inline-block" /> a
                      </span>
                      <span className="flex items-center gap-1 text-orange-500">
                        <span className="w-4 border-t border-dashed border-orange-400 inline-block" /> m/{M_MAX}
                      </span>
                      <span className="flex items-center gap-1 text-blue-500">
                        <span className="w-4 border-t border-dashed border-blue-400 inline-block" /> a_st
                      </span>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <p className="text-[9px] opacity-35 italic">Click a cell to track it.</p>
            )}
          </div>
        </aside>

        {/* ── Content ── */}
        <section className="flex-1 flex flex-col overflow-hidden">
          {activeTab === 'sim' && (
            <div className="relative flex-1 flex flex-col bg-[#fafafa] overflow-hidden">
              {/* Ensemble bias overlay */}
              <div className="absolute top-4 right-4 z-10 w-[312px] bg-[#fffdf8] border-2 border-[#141414] p-3 shadow-[6px_6px_0px_rgba(0,0,0,0.12)]" style={{ height: '210px' }}>
                <div className="flex justify-between items-center mb-1">
                  <div className="flex items-center gap-1">
                    <Waves size={9} className="text-blue-600" />
                    <span className="text-[8px] font-bold uppercase tracking-widest">Tumble Frequency</span>
                  </div>
                  <span className="text-[8px] font-mono bg-[#141414] text-white px-1.5 py-0.5 font-bold">
                    {ensembleData.length > 0 ? `${ensembleData[ensembleData.length - 1].tumbleFreq.toFixed(2)} /s` : '—'}
                  </span>
                </div>
                <div className="h-[128px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={ensembleData}>
                      <YAxis domain={[0, 1.8]} hide />
                      <ReferenceLine y={1.0} stroke="#3b82f6" strokeDasharray="3 3" strokeWidth={0.8} />
                      <Line type="monotone" dataKey="tumbleFreq" stroke="#141414" strokeWidth={1.7} dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[7px] text-center italic text-black/60 uppercase mt-1">
                  Baseline = 1.0 s⁻¹ · change uniform background on left for exact adaptation
                </p>
              </div>

              {/* Canvas interaction hints */}
              <div className="absolute top-4 left-4 z-10 pointer-events-none space-y-1.5">
                <span className="text-[7px] font-bold uppercase tracking-widest text-black/65 block">Canvas</span>
                {params.uniformBackground > 0 && (
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-20 rounded-sm ${params.chemicalMode === 'attractant' ? 'bg-blue-300/70' : 'bg-red-300/70'}`} />
                    <span className={`text-[7px] uppercase ${chemicalAccent}`}>Uniform background {params.uniformBackground.toFixed(2)}</span>
                  </div>
                )}
                {params.gradientSlope > 0 && (
                  <div className="flex items-center gap-2">
                    <div className={`h-1 w-20 rounded-full ${params.chemicalMode === 'attractant' ? 'bg-gradient-to-r from-transparent to-blue-400/50' : 'bg-gradient-to-r from-transparent to-red-400/50'}`} />
                    <span className={`text-[7px] uppercase ${chemicalAccent}`}>{params.chemicalMode === 'attractant' ? 'Attractant →' : 'Repellent →'}</span>
                  </div>
                )}
                {params.attractantSource && (
                  <div className="flex items-center gap-1.5">
                    <MapPin size={8} className={params.chemicalMode === 'attractant' ? 'text-blue-500' : 'text-red-500'} />
                    <span className={`text-[7px] font-bold uppercase ${chemicalAccent}`}>{params.chemicalMode === 'attractant' ? 'Point Source Active' : 'Repellent Source Active'}</span>
                  </div>
                )}
                <p className="text-[7px] text-black/60 leading-relaxed max-w-[170px] border-l border-black/25 pl-2">
                  Click canvas → place source.<br />Click cell → track telemetry.
                </p>
                <p className="text-[7px] text-black/60 leading-relaxed max-w-[190px] border-l border-black/25 pl-2">
                  Uniform field = constant fill.<br />Gradient field = linear.<br />Point source glow = radial.
                </p>
              </div>

              <div className="absolute bottom-12 left-4 z-10 pointer-events-none rounded-sm border-2 border-[#14141455] bg-[#fffdf8] px-3 py-2 shadow-[4px_4px_0px_rgba(0,0,0,0.08)]">
                <div className="mb-1 flex items-center gap-2">
                  <span className="block h-[2px] w-[40px] bg-[#141414]" />
                  <span className="text-[8px] font-mono uppercase text-black/80">{SCALE_BAR_UM} µm</span>
                </div>
                <p className="text-[7px] font-mono uppercase text-black/65">
                  Cell length ≈ {BACTERIUM_LENGTH_UM} µm · Speed default ≈ 30 µm/s
                </p>
              </div>

              <canvas ref={canvasRef} width={SIM_W} height={SIM_H}
                className="flex-1 w-full h-full cursor-crosshair" onClick={handleClick} />

              {/* Status bar */}
              <div className="h-11 border-t-2 border-[#141414] flex items-center justify-between px-4 bg-[#d9d7d0] text-[9px] font-mono shrink-0">
                <div className="flex gap-5">
                  <span><span className="font-bold opacity-50 uppercase">N: </span>{bacteria.length}</span>
                  <span><span className="font-bold opacity-50 uppercase">Run: </span>{runCount}/{bacteria.length}</span>
                  <span><span className="font-bold opacity-50 uppercase">⟨a⟩: </span>{meanActivity.toFixed(3)}</span>
                  <span><span className="font-bold opacity-50 uppercase">⟨m⟩: </span>{meanM.toFixed(2)}</span>
                  <span><span className="font-bold opacity-50 uppercase">⟨x⟩: </span>{meanXUm.toFixed(1)} µm</span>
                  <span><span className="font-bold opacity-50 uppercase">v: </span>{params.speed.toFixed(0)} µm/s</span>
                  <span><span className="font-bold opacity-50 uppercase">t: </span>{time.toFixed(1)} s</span>
                  <span className={`font-bold uppercase ${betaColor}`}>β={params.cheBSelectivity.toFixed(1)}</span>
                  <span className={`font-bold uppercase ${motionColor}`}>{params.chemicalMode}</span>
                </div>
                <div className="flex items-center gap-5">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                    <span className="text-green-700 font-bold">RUN (CCW)</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" />
                    <span className="text-orange-700 font-bold">TUMBLE (CW)</span>
                  </span>
                  <span className="border-l-2 border-black/40 pl-4 text-[9.6px] font-black uppercase tracking-[0.18em] text-black/85">
                    Adrián E. Granada | Version 1.0
                  </span>
                </div>
              </div>
            </div>
          )}
          {activeTab === 'math' && <EquationView a_st={a_st} tau={tau_adapt} />}
          {activeTab === 'pathway' && <PathwayView />}
          {activeTab === 'details' && <SimulationDetailsView />}
        </section>
      </main>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ParamGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-[8px] font-bold uppercase tracking-widest opacity-35">{title}</p>
      {children}
    </div>
  );
}

function SliderRow({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <label className="text-[10px] font-bold uppercase tracking-tight opacity-65">{label}</label>
        <span className="text-[10px] font-mono bg-white px-1 border border-black/8">
          {step >= 1 ? value.toFixed(0) : value.toFixed(2)}
          {unit && <span className="text-[7px] opacity-35 ml-0.5">{unit}</span>}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-0.5 bg-[#141414]/20 appearance-none cursor-ew-resize accent-[#141414] rounded-full" />
    </div>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-[10px] font-bold uppercase tracking-tight opacity-65">{label}</label>
      <button onClick={() => onChange(!value)}
        className={`relative w-8 h-4 rounded-full transition-colors ${value ? 'bg-blue-500' : 'bg-gray-300'}`}>
        <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}

function SegmentedRow<T extends string>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-bold uppercase tracking-tight opacity-65">{label}</label>
      <div className="grid grid-cols-2 gap-1.5">
        {options.map(option => (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={`px-2 py-1.5 border text-[9px] font-bold uppercase transition-colors ${
              value === option.value
                ? 'border-[#141414] bg-[#141414] text-[#E4E3E0]'
                : 'border-[#14141430] bg-white hover:border-[#141414] hover:bg-[#f2f1ee]'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Equation View ────────────────────────────────────────────────────────────

function EquationView({ a_st, tau }: { a_st: number; tau: number }) {
  const equations = [
    {
      num: '1', title: 'Receptor Activity (Hill Function)',
      eq: 'a  =  1 / [1 + (S/K)ⁿ]',
      note: 'S = local attractant conc.; K = receptor binding threshold (tuned by methylation m); n = Hill coefficient (receptor cluster cooperativity, n ≈ 6). Attractant binding INACTIVATES receptors: high S → low a.',
    },
    {
      num: '2', title: 'Methylation–Binding Constant Relationship',
      eq: 'K(m)  =  K₀ · e^(γm)',
      note: 'Each methyl group (CH₃) added by CheR contributes free energy γ, multiplicatively raising K. Higher K shifts the Hill curve rightward → receptor insensitive to current [S] → activity rises back. This is the memory variable of the system.',
    },
    {
      num: '3', title: 'Barkai-Leibler Methylation Dynamics  [Alon eq. 9.4.1]',
      eq: 'dm/dt  =  V_R·R  −  V_B·B·X*',
      dark: true,
      note: 'CheR (R) adds methyls at a CONSTANT zero-order rate V_R·R — it is saturated, so it doesn\'t "know" current activity. CheB (B) removes methyls ONLY from ACTIVE receptors X* (active conformation exposes methyl groups). This selectivity of B for X* is the structural key to robustness.',
    },
    {
      num: '4', title: 'Steady State — Exact Adaptation',
      eq: 'a_st  =  V_R·R / (V_B·B)  [independent of S!]',
      note: `At dm/dt = 0: a must equal V_R/V_B regardless of background attractant [S]. This is why adaptation is exact. With current parameters: a_st = ${a_st.toFixed(3)}. Changing V_R or V_B shifts the baseline but does NOT break exactness — the system adapts to its new setpoint.`,
    },
    {
      num: '5', title: 'CheB Selectivity — The Robustness Parameter (β)',
      eq: 'dm/dt  =  V_R  −  V_B·(β·a + (1−β)·1)',
      note: 'β=1: CheB acts ONLY on active receptors → integral feedback → robust exact adaptation for ANY V_R, V_B. β=0: CheB acts on ALL receptors equally → dm/dt = V_R − V_B = const → m drifts to boundary → adaptation fails. Intermediate β: partial adaptation (returns toward a_st but imprecisely).',
    },
    {
      num: '6', title: 'Motor Output',
      eq: 'λ_tumble  ∝  a / a_st',
      note: `CheY-P tracks receptor activity a. High a → more CheY-P → CW motor → tumble. Swimming up-gradient transiently suppresses a below a_st → run bias → directed migration. Adaptation time τ ≈ 1/(V_B·γ) = ${tau.toFixed(1)} s.`,
    },
  ] as { num: string; title: string; eq: string; note: string; dark?: boolean }[];

  return (
    <div className="p-10 h-full overflow-y-auto bg-white">
      <div className="max-w-3xl mx-auto">
        <div className="mb-10 border-l-4 border-[#141414] pl-5 py-1">
          <h2 className="text-2xl font-bold uppercase tracking-tight">Barkai-Leibler Chemotaxis Model</h2>
          <p className="text-[10px] opacity-40 font-mono mt-1">
            Barkai &amp; Leibler (1997) · Tu, Shimizu &amp; Berg (2008) · Alon, An Introduction to Systems Biology, Ch. 9
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-10">
          {equations.map(({ num, title, eq, note, dark }) => (
            <div key={num}>
              <h3 className="text-[8px] font-bold uppercase tracking-widest opacity-40 mb-3">{num}. {title}</h3>
              <div className={`p-5 font-mono text-[12px] border-b-2 border-[#141414] tracking-wide leading-relaxed ${
                dark ? 'bg-[#141414] text-[#E4E3E0]' : 'bg-[#f3f3f1]'
              }`}>
                {eq}
              </div>
              <p className="text-[10px] text-gray-500 mt-2.5 leading-relaxed">{note}</p>
            </div>
          ))}
        </div>

        <div className="border border-dashed border-[#14141430] p-5 mb-8">
          <h3 className="text-[8px] font-bold uppercase tracking-widest opacity-40 mb-3">Key Insight: Why Is B Working on Active Receptors the Key to Robustness?</h3>
          <p className="text-[10px] text-gray-500 leading-relaxed">
            When attractant is added, receptors become inactive (a drops). Because CheB only removes methyls from ACTIVE receptors,
            CheB's rate automatically decreases. Meanwhile CheR keeps adding methyls at a constant rate. Net result: methylation
            accumulates, K rises, receptors become less sensitive to attractant, activity recovers to a_st. This self-correcting
            feedback is an <span className="font-bold text-[#141414]">integral feedback controller</span> — the
            "error" (a_st − a) is continuously integrated by m until it is zeroed. No fine-tuning of protein levels is required.
          </p>
        </div>

        <p className="text-center text-[8px] font-mono opacity-25 uppercase tracking-widest">
          Barkai &amp; Leibler (1997) Nature 387:913 · Tu et al. (2008) PNAS 105:14855 · Alon (2020) CRC Press Ch.9
        </p>
      </div>
    </div>
  );
}

// ─── Pathway View ─────────────────────────────────────────────────────────────

function PathwayView() {
  return (
    <div className="p-10 h-full overflow-y-auto bg-white flex justify-center">
      <div className="max-w-lg w-full">
        <h2 className="text-[8px] font-bold uppercase tracking-widest opacity-35 mb-10 text-center">
          Barkai-Leibler Circuit · E. coli Chemotaxis
        </h2>

        <div className="flex flex-col items-center gap-0">
          <p className="text-[9px] text-blue-600 font-bold animate-bounce mb-2 tracking-wide uppercase">
            ↓ Attractant S (Aspartate / α-MeAsp)
          </p>

          {/* Receptor */}
          <PBox color="blue" wide>
            <p className="text-[10px] font-bold">MCP Receptor (X)</p>
            <p className="text-[8px] opacity-50 mt-0.5">Tar · Tsr · Tap · Trg clusters</p>
            <p className="text-[8px] mt-1 text-blue-600 font-bold">↑S binds → inactive (X°)</p>
          </PBox>

          {/* Adaptation module — CheR/CheB */}
          <div className="flex items-start gap-0 w-full justify-center mt-2">
            <div className="flex flex-col items-center">
              <Arrow />

              {/* CheA/CheW */}
              <PBox color="orange">
                <p className="text-[10px] font-bold">CheA · CheW</p>
                <p className="text-[8px] opacity-50">Histidine kinase (active when X* active)</p>
              </PBox>
              <Arrow />
              <PBox color="green">
                <p className="text-[10px] font-bold">CheY-P</p>
                <p className="text-[8px] opacity-50">Response regulator · tracks a</p>
              </PBox>
              <Arrow />
              <PBox color="dark">
                <p className="text-[10px] font-bold">Flagellar Motor</p>
                <p className="text-[8px] opacity-60">CCW (run) ↔ CW (tumble)</p>
                <p className="text-[8px] text-orange-300 font-bold mt-0.5">λ_tumble ∝ a/a_st</p>
              </PBox>
            </div>

            {/* Side: adaptation module */}
            <div className="flex flex-col gap-4 ml-8 mt-12">
              <div className="border-l-2 border-red-400 pl-3 py-1 max-w-[140px]">
                <p className="text-[8px] font-bold text-red-700">CheR (R)</p>
                <p className="text-[7px] opacity-60 leading-snug mt-0.5">
                  Adds methyls at <span className="font-bold">constant rate V_R·R</span><br />
                  (zero-order, saturated)<br />
                  → works regardless of X state
                </p>
              </div>
              <div className="border-l-2 border-purple-500 pl-3 py-1 max-w-[140px]">
                <p className="text-[8px] font-bold text-purple-700">CheB (B)</p>
                <p className="text-[7px] opacity-60 leading-snug mt-0.5">
                  Removes methyls at rate <span className="font-bold">V_B·B·X*</span><br />
                  <span className="text-purple-700 font-bold">ONLY from ACTIVE X*!</span><br />
                  → this selectivity = robustness
                </p>
              </div>
              <div className="border border-dashed border-blue-300 px-2 py-1.5 max-w-[140px] bg-blue-50">
                <p className="text-[7px] font-bold text-blue-700 mb-0.5">Steady State</p>
                <p className="text-[7px] font-mono text-blue-800">
                  a_st = V_R/V_B
                </p>
                <p className="text-[7px] opacity-50 mt-0.5 leading-snug">
                  Independent of S → exact adaptation
                </p>
              </div>
              <div className="border border-dashed border-gray-300 px-2 py-1.5 max-w-[140px]">
                <p className="text-[7px] font-bold mb-0.5">CheZ</p>
                <p className="text-[7px] opacity-50">Phosphatase → resets CheY-P signal</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 grid grid-cols-3 gap-3">
          {([
            ['Response', '<0.1 s', 'CheY-P binds motor FliM'],
            ['Adaptation', '~τ = 1/(V_B·γ)', 'CheR/B methylation cycle'],
            ['Robustness', 'Any V_R, V_B', 'Integral feedback via m'],
          ] as [string, string, string][]).map(([t, v, s]) => (
            <div key={t} className="p-3 border border-dashed border-gray-200 text-center">
              <p className="text-[9px] font-bold uppercase tracking-tight">{t}</p>
              <p className="text-[9px] font-mono font-bold text-blue-700 mt-0.5">{v}</p>
              <p className="text-[7px] opacity-40 mt-0.5">{s}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SimulationDetailsView() {
  const blocks = [
    {
      title: 'Core State Per Bacterium',
      body: 'Each cell stores position, heading, run/tumble state, methylation m, receptor threshold K(m), receptor activity a, current tumble frequency, and fixed per-cell rate multipliers for CheR and CheB. This gives mild cell-to-cell heterogeneity without changing the global sliders.',
    },
    {
      title: 'Signal Field',
      body: 'The local signal S is the sum of three possible pieces: a basal internal reference level, a uniform background offset, and an optional spatial term from either a linear gradient or a point source. The repellent mode flips the sign of the sensed temporal change rather than changing the concentration field drawing.',
    },
    {
      title: 'Receptor Activity',
      body: 'Activity uses a Hill function: a = 1 / (1 + (S/K)^n). More attractant lowers receptor activity. The methylation-dependent threshold is K(m) = K0 exp(gamma m), so increasing m shifts the response curve and restores activity after a stimulus.',
    },
    {
      title: 'Adaptation Law',
      body: 'Methylation follows a Barkai-Leibler style rule: dm/dt = VR - VB (beta a + (1 - beta)). When beta = 1, CheB acts only on active receptors and the system shows exact adaptation. The code updates m every frame using Euler integration with the animation timestep dt.',
    },
    {
      title: 'Tumble Frequency',
      body: 'For each cell, the steady-state setpoint is a_st = VR/VB. The instantaneous tumble rate is based on a/a_st, then multiplied by a temporal-sensing factor. If the sensed signal is improving, tumbles are suppressed; if conditions worsen, tumble rate rises. At zero added background and zero gradient, initialization is chosen so the mean tumble rate starts at 1 s^-1.',
    },
    {
      title: 'Where The Noise Is',
      body: 'Noise enters in several places. Initial positions and headings are random. Each cell gets random CheR/CheB multipliers and Hill-coefficient variation. Tumbling itself is stochastic: during a run, a tumble happens with probability tumbleFreq * dt. Tumble duration and reorientation angle are also randomized, which creates the random walk.',
    },
    {
      title: 'Animation Loop',
      body: 'The simulation runs in requestAnimationFrame. On each frame, dt is measured from wall-clock time and capped for stability. The model updates all cells, then React UI state is refreshed only at a lower fixed rate. Canvas drawing reads live refs directly, which keeps the animation smoother than rerendering React on every frame.',
    },
  ];

  return (
    <div className="p-10 h-full overflow-y-auto bg-[#fcfbf7]">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8 border-l-4 border-[#141414] pl-5 py-1">
          <h2 className="text-2xl font-bold uppercase tracking-tight">Simulation Details</h2>
          <p className="text-[10px] text-black/55 font-mono mt-1 uppercase tracking-widest">
            What the code is doing each frame and how tumble frequency is computed
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {blocks.map(block => (
            <div key={block.title} className="border-2 border-[#14141415] bg-white p-5 shadow-[4px_4px_0px_rgba(0,0,0,0.05)]">
              <h3 className="text-[10px] font-bold uppercase tracking-widest mb-3 text-[#141414]">{block.title}</h3>
              <p className="text-[12px] leading-relaxed text-black/70">{block.body}</p>
            </div>
          ))}
        </div>

        <div className="border-2 border-[#141414] bg-[#141414] text-[#f5f2eb] p-5 font-mono text-[12px] leading-relaxed">
          <p>`S = S_basal + S_uniform + S_gradient + S_source`</p>
          <p>`a = 1 / (1 + (S / K)^n)`</p>
          <p>`K(m) = K0 exp(gamma m)`</p>
          <p>`dm/dt = VR - VB (beta a + (1 - beta))`</p>
          <p>`a_st = VR / VB`</p>
          <p>`lambda_tumble ~= (a / a_st) * temporal_bias`</p>
          <p>`P(tumble in dt) = lambda_tumble * dt`</p>
        </div>
      </div>
    </div>
  );
}

function PBox({ color, children, wide }: { color: string; children: React.ReactNode; wide?: boolean }) {
  const bg: Record<string, string> = {
    blue: 'bg-blue-50 border-[#141414]',
    orange: 'bg-orange-50 border-[#141414]',
    green: 'bg-green-50 border-[#141414]',
    dark: 'bg-[#141414] text-[#E4E3E0] border-[#141414]',
  };
  return (
    <div className={`border-2 ${bg[color]} px-4 py-2.5 text-center shadow-[3px_3px_0px_rgba(0,0,0,0.08)] ${wide ? 'w-72' : 'w-52'}`}>
      {children}
    </div>
  );
}

function Arrow() {
  return (
    <div className="flex flex-col items-center my-1">
      <div className="w-px h-5 bg-[#141414]" />
      <div className="w-0 h-0 border-l-[4px] border-r-[4px] border-t-[6px] border-l-transparent border-r-transparent border-t-[#141414]" />
    </div>
  );
}
