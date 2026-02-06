import React, { useRef, useEffect } from 'react';
import { SimulationState, VRUType, RiskLevel, VRU, Zone } from '../types';
import { INITIAL_CENTER } from '../constants';

interface Props {
  state: SimulationState;
}

const SCALE = 2; // Pixels per meter

export const MapVisualization: React.FC<Props> = ({ state }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Coordinate transform for canvas (Center is 0,0 relative to INITIAL_CENTER)
  const toCanvas = (lat: number, lng: number, width: number, height: number) => {
    const latDiff = (lat - INITIAL_CENTER.lat) * 111320; // Meters approx
    const lngDiff = (lng - INITIAL_CENTER.lng) * (111320 * Math.cos(INITIAL_CENTER.lat * (Math.PI / 180)));
    
    return {
      x: (width / 2) + (lngDiff * SCALE),
      y: (height / 2) - (latDiff * SCALE) // Y is inverted in canvas
    };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear Canvas - Make it transparent to show map behind
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Grid overlay (lighter for visibility over map)
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.4)'; // Subtle grid
    ctx.lineWidth = 1;
    const gridSize = 50 * SCALE;
    for (let x = 0; x < canvas.width; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    // Draw Zones
    state.zones.forEach(zone => {
       let color = 'rgba(16, 185, 129, 0.1)'; // Safe
       if (zone.riskLevel === RiskLevel.WARNING) color = 'rgba(245, 158, 11, 0.2)';
       if (zone.riskLevel === RiskLevel.CRITICAL) color = 'rgba(239, 68, 68, 0.3)';
       
       // Draw simplified zone rectangles for visual feedback
       if (zone.density > 0) {
         const p1 = toCanvas(zone.bounds[0].lat, zone.bounds[0].lng, canvas.width, canvas.height);
         const p3 = toCanvas(zone.bounds[2].lat, zone.bounds[2].lng, canvas.width, canvas.height);
         
         ctx.fillStyle = color;
         ctx.fillRect(p1.x, p1.y, p3.x - p1.x, p3.y - p1.y);
       }
    });

    // Draw VRUs
    state.vrus.forEach(vru => {
      const pos = toCanvas(vru.position.lat, vru.position.lng, canvas.width, canvas.height);
      
      // Shadow/Glow
      ctx.shadowBlur = 10;
      ctx.shadowColor = vru.riskLevel === RiskLevel.CRITICAL ? '#ef4444' : '#3b82f6';
      
      // Body
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = getVRUColor(vru);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Label
      if (vru.isUserControlled) {
        ctx.fillStyle = '#fff';
        ctx.font = '10px monospace';
        ctx.fillText('YOU', pos.x - 10, pos.y - 12);
        
        // Landmark Circle (Accuracy)
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.arc(pos.x, pos.y, vru.localizationError * SCALE, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    });

    // Draw Radar Sweep Effect
    const time = Date.now() / 1000;
    ctx.strokeStyle = `rgba(59, 130, 246, ${Math.abs(Math.sin(time)) * 0.3})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(canvas.width/2, canvas.height/2, (time * 50) % (canvas.width/2), 0, Math.PI*2);
    ctx.stroke();

  }, [state]);

  const getVRUColor = (vru: VRU) => {
    if (vru.riskLevel === RiskLevel.CRITICAL) return '#ef4444';
    if (vru.riskLevel === RiskLevel.WARNING) return '#f59e0b';
    if (vru.isUserControlled) return '#3b82f6';
    return '#94a3b8'; // Slate 400
  };

  return (
    <div className="relative w-full h-full bg-slate-900 overflow-hidden rounded-xl border border-slate-700 shadow-2xl">
      {/* Real Map Background Layer */}
      <div 
        className="absolute inset-0 z-0 opacity-40 grayscale"
        style={{
          // Placeholder for San Francisco Satellite View
          backgroundImage: 'url("https://upload.wikimedia.org/wikipedia/commons/e/ec/San_Francisco_Mission_District_DOQQ_map.jpg")',
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      />
      
      <canvas 
        ref={canvasRef} 
        width={800} 
        height={600} 
        className="relative z-10 w-full h-full object-cover"
      />
      
      <div className="absolute top-4 left-4 z-20 bg-slate-900/80 backdrop-blur px-3 py-1 rounded border border-slate-700 text-xs text-slate-400">
        LIVE SIMULATION | SATELLITE FUSION MODE
      </div>
    </div>
  );
};