"use client";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, HelpCircle, MapPin } from "lucide-react";
import { useState, useRef } from "react";

const healthClusters = [
  { 
    id: "cardiac", name: "Cardiac", size: "w-32 h-32", color: "bg-[#2D6A4F]", top: "20%", left: "10%", score: "92",
    unit: "BPM", 
    explanation: "Heart rate in beats per minute.",
    example: "60-100 is normal resting range.",
    trendData: [68, 72, 70, 69, 71, 68, 67],
    yMax: 150
  },
  { 
    id: "glucose", name: "Glucose", size: "w-24 h-24", color: "bg-[#FFB4A2]", top: "15%", left: "45%", score: "78",
    unit: "mg/dL", 
    explanation: "Sugar concentration in the blood.",
    example: "70-99 is a normal fasting level.",
    trendData: [90, 110, 95, 105, 120, 98, 92],
    yMax: 200
  },
  { 
    id: "sleep", name: "Sleep", size: "w-40 h-40", color: "bg-[#1B4332]", top: "40%", left: "60%", score: "85",
    unit: "REM %", 
    explanation: "Deep recovery sleep percentage.",
    example: "20-25% is the ideal target for adults.",
    trendData: [20, 22, 18, 25, 23, 21, 24],
    yMax: 50
  },
];

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

interface HealthCluster {
  id: string;
  name: string;
  size: string;
  color: string;
  top: string;
  left: string;
  score: string;
  unit: string;
  explanation: string;
  example: string;
  trendData: number[];
  yMax: number;
}

interface TooltipData {
  index: number;
  x: number;
  y: number;
}

export default function AnalyticsPage() {
  const [selected, setSelected] = useState<HealthCluster | null>(null);
  const [tooltipData, setTooltipData] = useState<TooltipData | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const generateLinePath = (data: number[], yMax: number) => {
    const chartWidth = 500;
    const chartHeight = 250;
    const points = data.map((val, i) => {
      const x = (i / (data.length - 1)) * chartWidth;
      const y = chartHeight - (val * (chartHeight / yMax));
      return `${x},${y}`;
    });
    return `M ${points[0]} L ${points.slice(1).join(" L ")}`;
  };

  // NEW: Handle mouse movement over the chart area
  const handleMouseMove = (event: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
    if (!svgRef.current || !selected) return;

    // 1. Get the mouse coordinates relative to the SVG canvas
    const svgPoint = svgRef.current.createSVGPoint();
    svgPoint.x = event.clientX;
    svgPoint.y = event.clientY;
    const cursor = svgPoint.matrixTransform(svgRef.current.getScreenCTM()?.inverse());

    // 2. Determine which day/data point the mouse is closest to
    const numPoints = selected.trendData.length;
    const chartWidth = 500;
    const segmentWidth = chartWidth / (numPoints - 1);
    const pointIndex = Math.round(cursor.x / segmentWidth);

    // 3. Update the tooltip state with the data point information
    if (pointIndex >= 0 && pointIndex < numPoints) {
      setTooltipData({
        index: pointIndex,
        x: cursor.x, // Tooltip X position
        y: cursor.y  // Tooltip Y position
      });
    } else {
      setTooltipData(null); // Clear tooltip if out of bounds
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20 px-4 sm:px-6 lg:px-8 pt-8 sm:pt-10 lg:pt-12">
      <AnimatePresence mode="wait">
        {!selected ? (
          <motion.div key="grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-10">
            <h1 className="text-4xl font-bold text-[#1B4332]">Health Analytics</h1>
            <div className="h-137.5 bg-white rounded-[3.5rem] border border-slate-100 relative overflow-hidden shadow-inner">
               {healthClusters.map((cluster) => (
                 <motion.div 
                   key={cluster.id} whileHover={{ scale: 1.1 }} onClick={() => setSelected(cluster)}
                   className={`absolute ${cluster.size} ${cluster.color} rounded-full flex flex-col items-center justify-center text-white cursor-pointer shadow-2xl transition-all`}
                   style={{ top: cluster.top, left: cluster.left }}
                 >
                   <span className="text-[10px] font-bold uppercase opacity-60 tracking-wider">{cluster.name}</span>
                   <span className="text-2xl font-bold mt-1 leading-none">{cluster.score}</span>
                 </motion.div>
               ))}
            </div>
          </motion.div>
        ) : (
          <motion.div key="detail" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
            <button onClick={() => setSelected(null)} className="flex items-center gap-2 text-[#1B4332] font-semibold text-sm hover:gap-3 transition-all">
              <ArrowLeft size={18} /> Back to Cluster Hub
            </button>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 bg-white rounded-[3rem] p-12 border border-slate-100 shadow-sm relative overflow-visible">
                <div className="flex justify-between items-start mb-16 relative z-10">
                  <div>
                    <h2 className="text-3xl font-bold text-[#1B4332] tracking-tight">{selected.name} Timeline</h2>
                    <p className="text-slate-400 text-sm mt-1">Daily trend in {selected.unit}</p>
                  </div>
                  <div className={`px-6 py-3 ${selected.color} text-white rounded-2xl font-bold text-lg`}>
                    {selected.score}<span className="text-xs opacity-60 ml-1">avg</span>
                  </div>
                </div>

                {/* --- THE INTERACTIVE CHART --- */}
                <div className="relative h-75 w-full flex">
                   {/* Y-Axis Labels */}
                   <div className="flex flex-col justify-between text-[10px] font-bold text-slate-300 pr-4 pb-8 uppercase">
                      <span>{selected.yMax}</span>
                      <span>{selected.yMax / 2}</span>
                      <span>0</span>
                   </div>

                   <div className="flex-1 relative h-62.5">
                      {/* NEW: Tooltip Overlay */}
                      <AnimatePresence>
                        {tooltipData && (
                          <motion.div 
                            initial={{ opacity: 0, y: 5 }} 
                            animate={{ opacity: 1, y: 0 }} 
                            exit={{ opacity: 0, y: 5 }}
                            className="absolute z-20 bg-[#1B4332] text-white px-4 py-3 rounded-xl shadow-xl border border-white/10 text-center space-y-1 pointer-events-none"
                            // Position the tooltip dynamically based on the mouse/point location
                            style={{ 
                              left: `${(tooltipData.index / (selected.trendData.length - 1)) * 100}%`,
                              bottom: `${(selected.trendData[tooltipData.index] * (250 / selected.yMax))}px`,
                              transform: 'translate(-50%, -110%)' // Center tooltip above the point
                            }}
                          >
                             <div className="text-[10px] font-bold text-[#FFB4A2] uppercase tracking-widest">{days[tooltipData.index]}</div>
                             <div className="flex items-baseline gap-1 justify-center">
                                <span className="text-xl font-bold">{selected.trendData[tooltipData.index]}</span>
                                <span className="text-xs opacity-60 font-medium">{selected.unit}</span>
                             </div>
                             <MapPin size={12} className="mx-auto text-white/40" />
                          </motion.div>
                        )}
                      </AnimatePresence>

                      {/* --- THE SVG CANVAS --- */}
                      <svg 
                        ref={svgRef} 
                        viewBox="0 0 500 250" 
                        className="w-full h-full overflow-visible" 
                        preserveAspectRatio="none"
                        // Handle interactions
                        onMouseMove={handleMouseMove}
                        onMouseLeave={() => setTooltipData(null)}
                      >
                        {/* Grid Lines */}
                        {[0, 0.5, 1].map((v, i) => (
                          <line key={i} x1="0" y1={250 * v} x2="500" y2={250 * v} stroke="#f1f5f9" strokeWidth="1" />
                        ))}

                        {/* Interactive Data Point Dots */}
                        {selected.trendData.map((val: number, i: number) => {
                          const x = (i / (selected.trendData.length - 1)) * 500;
                          const y = 250 - (val * (250 / selected.yMax));
                          const isActive = tooltipData?.index === i;
                          return (
                            <motion.circle 
                              key={i} 
                              cx={x} cy={y} 
                              r={isActive ? 8 : 4} // Highlight point on hover
                              fill={selected.id === "glucose" ? "#FFB4A2" : "#1B4332"} 
                              className={`transition-all ${isActive ? 'opacity-100' : 'opacity-20'}`} 
                            />
                          );
                        })}

                        {/* Trend Line */}
                        <motion.path 
                          d={generateLinePath(selected.trendData, selected.yMax)}
                          fill="none" stroke={selected.id === "glucose" ? "#FFB4A2" : "#1B4332"}
                          strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"
                          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 2 }}
                        />
                      </svg>

                      {/* X-AXIS LABELS */}
                      <div className="flex justify-between mt-6 text-[10px] font-bold text-slate-300 uppercase tracking-widest px-4">
                        {days.map(day => <span key={day}>{day}</span>)}
                      </div>
                   </div>
                </div>
              </div>

              {/* Education Sidebar */}
              <div className="space-y-6">
                <div className="bg-[#1B4332] text-white p-8 rounded-[2.5rem] shadow-xl shadow-green-900/10">
                  <div className="flex items-center gap-3 mb-6 opacity-60">
                    <HelpCircle size={18} />
                    <h3 className="text-[10px] font-bold uppercase tracking-widest">Scientific Unit</h3>
                  </div>
                  <p className="text-[#FFB4A2] font-bold text-2xl mb-2 leading-tight">{selected.unit}</p>
                  <p className="text-white/70 text-sm leading-relaxed mb-6">{selected.explanation}</p>
                  <div className="bg-white/5 p-5 rounded-2xl border border-white/10 italic text-xs text-white/50">
                    "{selected.example}"
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}