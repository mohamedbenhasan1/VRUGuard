import React, { useState, useEffect } from 'react';
import { SimulationState, RiskLevel, VRUType } from '../types';
import { simulationService } from '../services/SimulationService';
import { MapVisualization } from './MapVisualization';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { GoogleGenAI } from "@google/genai";

// Icons
const RadarIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const ChipIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" /></svg>;
const AlertIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>;

export const Dashboard: React.FC = () => {
  const [state, setState] = useState<SimulationState | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [recommendation, setRecommendation] = useState<string>("Analyzing collision vectors...");
  const [rmseAnalysis, setRmseAnalysis] = useState<string>("");
  const [isQuantum, setIsQuantum] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    simulationService.start();
    const unsub = simulationService.subscribe((newState) => {
      setState(newState);
      setIsQuantum(newState.metrics.quantumFusionActive);
      setHistory(prev => {
        const newData = [...prev, {
          time: new Date(newState.timestamp).toLocaleTimeString(),
          error: newState.metrics.avgError,
          risk: newState.metrics.collisionWarnings
        }];
        if (newData.length > 50) newData.shift();
        return newData;
      });
    });
    return () => {
      simulationService.stop();
      unsub();
    };
  }, []);

  // AI Advisor Logic (Background)
  useEffect(() => {
    if (!state) return;
    
    const timer = setInterval(async () => {
       if (process.env.API_KEY && state.metrics.collisionWarnings > 0) {
          try {
             const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
             const prompt = `
               Context: Real-time VRU safety dashboard.
               Metrics: 
               - VRU Count: ${state.metrics.totalVRUs}
               - Collision Warnings: ${state.metrics.collisionWarnings}
               
               Provide a 1-sentence tactical safety recommendation.
             `;
             const response = await ai.models.generateContent({
                model: 'gemini-3-flash-preview',
                contents: prompt,
             });
             setRecommendation(response.text || "Optimize sensor array.");
          } catch (e) {
             setRecommendation("AI subsystem offline.");
          }
       }
    }, 15000); 

    return () => clearInterval(timer);
  }, [state]);

  const handleMove = (dx: number, dy: number) => {
    simulationService.updateUserVelocity(dx * 4, dy * 4);
  };

  const handleStop = () => {
    simulationService.updateUserVelocity(0, 0);
  };

  const handleAnalyzeRMSE = async () => {
    if (!state || !process.env.API_KEY) return;
    setIsAnalyzing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `
        You are a Sensor Fusion Expert.
        Current RMSE: ${state.metrics.avgError.toFixed(4)} meters.
        Active Sensors: ${state.vrus.find(v => v.isUserControlled)?.sensors.filter(s => s.active).length}
        Quantum Fusion: ${isQuantum ? 'ACTIVE' : 'INACTIVE'}

        Explain strictly the significance of this specific RMSE value for Vulnerable Road User (VRU) safety. 
        Is it safe for autonomous braking decisions? 
        Answer in 2 short paragraphs.
      `;
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });
      setRmseAnalysis(response.text || "Analysis failed.");
    } catch (e) {
      setRmseAnalysis("Could not connect to Gemini AI.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (!state) return <div className="text-center p-20 text-slate-500">Initializing Quantum Core...</div>;

  const userAgent = state.vrus.find(v => v.isUserControlled);

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Sidebar */}
      <div className="w-96 bg-slate-900 border-r border-slate-800 flex flex-col overflow-hidden">
        <div className="p-6 border-b border-slate-800 shrink-0">
          <h1 className="text-2xl font-bold tracking-tighter text-white flex items-center gap-2">
            <span className="w-3 h-3 bg-blue-500 rounded-full animate-pulse"/>
            VRU-GUARD
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-mono">SENTINEL VERSION 2.5.1</p>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Controls - VRU Type */}
          <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
            <h2 className="text-xs font-bold text-slate-400 uppercase mb-3">Agent Configuration</h2>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {Object.values(VRUType).filter(t => t !== VRUType.VEHICLE).map(type => (
                <button
                  key={type}
                  onClick={() => simulationService.setUserType(type)}
                  className={`text-xs py-2 px-2 rounded border ${userAgent?.type === type ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'}`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Controls - Sensors */}
          <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
            <h2 className="text-xs font-bold text-slate-400 uppercase mb-3 flex justify-between">
              <span>Sensor Fusion Sources</span>
              <span className="text-blue-400">{userAgent?.sensors.filter(s => s.active).length}/10</span>
            </h2>
            <div className="space-y-1 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
              {userAgent?.sensors.map(sensor => (
                <label key={sensor.id} className="flex items-center justify-between p-2 rounded hover:bg-slate-700/50 cursor-pointer group transition-colors">
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      checked={sensor.active} 
                      onChange={() => simulationService.toggleUserSensor(sensor.id)}
                      className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500/20" 
                    />
                    <span className={`text-xs ${sensor.active ? 'text-slate-200' : 'text-slate-500'}`}>{sensor.name}</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-600 group-hover:text-slate-400">±{sensor.accuracy}m</span>
                </label>
              ))}
            </div>
             {userAgent?.sensors.filter(s => s.active).length && userAgent.sensors.filter(s => s.active).length >= 3 ? (
               <div className="mt-3 text-[10px] text-quantum-400 text-center font-mono border border-quantum-500/30 rounded py-1 bg-quantum-500/10">
                 QUANTUM THRESHOLD MET
               </div>
             ) : (
                <div className="mt-3 text-[10px] text-slate-500 text-center font-mono border border-slate-700 rounded py-1">
                 CLASSICAL FUSION ONLY
               </div>
             )}
          </div>

          {/* Manual Control */}
          <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
             <h2 className="text-xs font-bold text-slate-400 uppercase mb-3">Navigation</h2>
             <div className="grid grid-cols-3 gap-2">
               <div />
               <button onMouseDown={() => handleMove(0, -1)} onMouseUp={handleStop} className="h-8 bg-slate-700 hover:bg-slate-600 rounded flex items-center justify-center">▲</button>
               <div />
               <button onMouseDown={() => handleMove(-1, 0)} onMouseUp={handleStop} className="h-8 bg-slate-700 hover:bg-slate-600 rounded flex items-center justify-center">◀</button>
               <button onMouseDown={() => handleStop()} className="h-8 bg-red-900/50 hover:bg-red-900/80 rounded flex items-center justify-center border border-red-500/30 text-xs">STOP</button>
               <button onMouseDown={() => handleMove(1, 0)} onMouseUp={handleStop} className="h-8 bg-slate-700 hover:bg-slate-600 rounded flex items-center justify-center">▶</button>
               <div />
               <button onMouseDown={() => handleMove(0, 1)} onMouseUp={handleStop} className="h-8 bg-slate-700 hover:bg-slate-600 rounded flex items-center justify-center">▼</button>
               <div />
             </div>
          </div>

        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Top Bar */}
        <div className="h-16 border-b border-slate-800 flex items-center px-6 justify-between bg-slate-900/50 backdrop-blur shrink-0">
          <div className="flex items-center gap-4">
             <div className="flex items-center gap-2 px-3 py-1 bg-green-900/20 border border-green-500/30 rounded text-green-400 text-xs font-medium">
               <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
               LIVE FEED
             </div>
             {state.metrics.collisionWarnings > 0 && (
                <div className="flex items-center gap-2 px-3 py-1 bg-red-900/20 border border-red-500/30 rounded text-red-400 text-xs font-medium animate-pulse">
                <AlertIcon />
                COLLISION RISK DETECTED
              </div>
             )}
          </div>
          <div className="flex items-center gap-4">
             {/* Gemini Recommendation Snippet */}
             <div className="hidden lg:flex items-center gap-2 text-xs text-indigo-300 bg-indigo-900/20 px-3 py-1 rounded border border-indigo-500/20">
                <ChipIcon />
                {recommendation}
             </div>
          </div>
        </div>

        {/* Content Grid */}
        <div className="flex-1 p-6 grid grid-cols-3 grid-rows-2 gap-6 overflow-hidden">
          {/* Main Map - Spans 2 cols, 2 rows */}
          <div className="col-span-2 row-span-2 relative">
             <MapVisualization state={state} />
          </div>

          {/* Analytics - Right Col */}
          <div className="col-span-1 bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col">
             <div className="flex justify-between items-center mb-4">
                <h3 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                  <RadarIcon /> Real-time Error (RMSE)
                </h3>
                <span className="text-xl font-mono text-blue-400">{state.metrics.avgError.toFixed(4)}m</span>
             </div>
             
             <div className="flex-1 min-h-0 mb-4">
               <ResponsiveContainer width="100%" height="100%">
                 <AreaChart data={history}>
                   <defs>
                     <linearGradient id="colorError" x1="0" y1="0" x2="0" y2="1">
                       <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                       <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                     </linearGradient>
                   </defs>
                   <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                   <XAxis dataKey="time" hide />
                   <YAxis stroke="#475569" fontSize={10} domain={[0, 'auto']} />
                   <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }}
                      itemStyle={{ color: '#94a3b8' }}
                   />
                   <Area type="monotone" dataKey="error" stroke="#3b82f6" fillOpacity={1} fill="url(#colorError)" isAnimationActive={false} />
                 </AreaChart>
               </ResponsiveContainer>
             </div>

             {/* AI Explanation Section */}
             <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700 flex flex-col gap-2">
                <div className="flex justify-between items-center">
                   <h4 className="text-xs font-bold text-slate-400">GEMINI RMSE ANALYSIS</h4>
                   <button 
                    onClick={handleAnalyzeRMSE}
                    disabled={!process.env.API_KEY || isAnalyzing}
                    className="text-[10px] bg-indigo-600 hover:bg-indigo-500 px-2 py-1 rounded text-white disabled:opacity-50"
                   >
                     {isAnalyzing ? 'Thinking...' : 'EXPLAIN'}
                   </button>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed min-h-[60px]">
                  {rmseAnalysis ? rmseAnalysis : "Click explain to analyze current signal integrity..."}
                </p>
             </div>
          </div>

           <div className="col-span-1 bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col">
             <h3 className="text-sm font-semibold text-slate-300 mb-4">Risk Density Profile</h3>
             <div className="flex-1 min-h-0">
               <ResponsiveContainer width="100%" height="100%">
                 <LineChart data={history}>
                   <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                   <XAxis dataKey="time" hide />
                   <YAxis stroke="#475569" fontSize={10} />
                   <Tooltip 
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }}
                   />
                   <Line type="step" dataKey="risk" stroke="#ef4444" strokeWidth={2} dot={false} isAnimationActive={false} />
                 </LineChart>
               </ResponsiveContainer>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};