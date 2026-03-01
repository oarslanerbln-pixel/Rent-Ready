import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Shield, Activity, Globe, Zap, AlertTriangle, ChevronRight, Search, Filter, Eye } from 'lucide-react';
import { INFRASTRUCTURE_DATA } from './intelligence';
// Fix for Leaflet default icon issues in React
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

const getMarkerColor = (intensity, isAnomaly) => {
  if (isAnomaly) return '#ff2a2a'; // critical red
  if (intensity > 70) return '#ffb300';
  return '#00ddff'; // electric blue for neutral/low
};

// Credibility badging helper
const getCredibilityBadge = (sourceType) => {
  if (sourceType === 'GDELT') return <span className="text-[8px] bg-[#00ddff]/10 text-[#00ddff] px-1 py-0.5 border border-[#00ddff]/30 ml-2 uppercase">VERIFIED DB</span>;
  if (sourceType === 'TELEGRAM') return <span className="text-[8px] bg-orange-900/40 text-orange-300 px-1 py-0.5 rounded border border-orange-500/30 ml-2">OSINT FEED</span>;
  return <span className="text-[8px] bg-zinc-800 text-zinc-400 px-1 py-0.5 rounded ml-2">SIMULATION</span>;
};

// Fix for Leaflet rendering in hidden containers
function MapResize() {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => { map.invalidateSize(); }, 250);
  }, [map]);
  return null;
}

// Controller for flyTo animation
function MapController({ coords }) {
  const map = useMap();
  useEffect(() => {
    if (coords && coords.length === 2) {
      map.flyTo(coords, 6, {
        duration: 1.5,
        easeLinearity: 0.25
      });
    }
  }, [coords, map]);
  return null;
}

const createTacticalIcon = (isAnomaly) => {
  return L.divIcon({
    html: `
      <div class="tactical-marker ${isAnomaly ? 'anomaly' : ''}">
        <div class="tactical-marker-glow"></div>
        <div class="tactical-marker-inner">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="16"></line>
            <line x1="8" y1="12" x2="16" y2="12"></line>
          </svg>
        </div>
      </div>
    `,
    className: '',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14]
  });
};

function App() {
  const [activeTab, setActiveTab] = useState('map');
  const [intelData, setIntelData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeHour, setTimeHour] = useState(0); // Show last 24h by default
  const [overlays, setOverlays] = useState({ military: false, energy: false, shipping: false });
  const [notification, setNotification] = useState(null);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [selectedEvidence, setSelectedEvidence] = useState(null);
  const [focusedCoords, setFocusedCoords] = useState(null);
  const [isCodeRed, setIsCodeRed] = useState(false);

  // Phase 3: Search and Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [showSearch, setShowSearch] = useState(false);
  const [showFilter, setShowFilter] = useState(false);

  // Phase 4: Watcher State
  const [watchedRegion, setWatchedRegion] = useState('All Regions');

  // Socket.io Connection & Intelligent Stream
  useEffect(() => {
    let socket = null;
    let isMounted = true;

    const connectSocket = () => {
      if (!window.io) {
        console.warn('Socket.io not found. Falling back to mock data.');
        loadMockData();
        return;
      }

      socket = window.io('http://localhost:4000', {
        reconnectionAttempts: 3,
        timeout: 5000
      });

      socket.on('connect', () => {
        console.log('Connected to Intelligence Server');
        if (isMounted) setLoading(false);
      });

      socket.on('connect_error', () => {
        console.warn('Socket connection failed. Using mock data.');
        loadMockData();
      });

      socket.on('initial_data', (data) => {
        if (isMounted) setIntelData(data);
      });

      socket.on('intel_update', (newItem) => {
        if (isMounted) {
          setIntelData(prev => [newItem, ...prev].slice(0, 100)); // Increased limit for real feeds
          if (newItem.isAnomaly) {
            setNotification(newItem);
            setIsCodeRed(true);
            setTimeout(() => {
              if (isMounted) {
                setNotification(null);
                setIsCodeRed(false);
              }
            }, 12000); // Show code red longer
            if (watchedRegion === 'All Regions' || newItem.region === watchedRegion) {
              setFocusedCoords(newItem.coords);
            }
          }
        }
      });
    };

    connectSocket();

    return () => {
      isMounted = false;
      if (socket) {
        socket.disconnect();
      }
    }
  }, [watchedRegion]);

  // Filter data based on time scrubber, search, and region/threat
  const filteredData = intelData.filter(item => {
    const hoursAgo = (Date.now() - new Date(item.timestamp)) / 3600000;
    const timeMatch = hoursAgo <= (24 - timeHour) || hoursAgo < 0.1;

    if (!timeMatch) return false;

    if (activeFilter === 'anomaly' && !item.isAnomaly) return false;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!item.location.toLowerCase().includes(q) && !item.summary.toLowerCase().includes(q)) {
        return false;
      }
    }

    return true;
  });

  if (loading) return (
    <div className="h-screen bg-zinc-950 flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
      <p className="text-zinc-500 font-mono text-xs animate-pulse uppercase tracking-widest">Initialising OSINT Pipeline...</p>
    </div>
  );

  return (
    <div className={`relative w-screen h-screen overflow-hidden bg-primary text-primary ${isCodeRed ? 'code-red-active transition-all duration-1000' : ''}`}>
      <div className="crt-overlay"></div>

      {/* 1. BACKGROUND MAP (TACTICAL UNDERLAY) */}
      <div className="absolute inset-0 z-0">
        <MapContainer
          center={[25.0, 15.0]}
          zoom={3}
          style={{ height: '100%', width: '100%', background: '#0a0a0c' }}
          zoomControl={false}
          className="z-0"
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />
          <MapResize />
          <MapController coords={focusedCoords} />

          {/* Dynamic Heatmap Layer */}
          {showHeatmap && intelData.map((item, idx) => (
            <Circle
              key={`heat-${idx}`}
              center={item.coords}
              radius={item.intensity * 2500}
              pathOptions={{
                color: 'red', fillColor: 'red', fillOpacity: 0.05, weight: 0, className: 'heatmap-pulse'
              }}
            />
          ))}

          {/* Infrastructure Overlays */}
          {overlays.military && INFRASTRUCTURE_DATA.military.map((m, idx) => (
            <Circle key={`mil-${idx}`} center={m.coords} radius={15000} pathOptions={{ color: '#ff4444', weight: 2, dashArray: '5, 5', fill: false }} />
          ))}
          {overlays.energy && INFRASTRUCTURE_DATA.energy.map((e, idx) => (
            <Circle key={`eng-${idx}`} center={e.coords} radius={25000} pathOptions={{ color: '#fbbf24', weight: 1, fillOpacity: 0.1 }} />
          ))}
          {overlays.shipping && INFRASTRUCTURE_DATA.shipping.map((s, idx) => (
            <Circle key={`shp-${idx}`} center={s.coords} radius={50000} pathOptions={{ color: '#3b82f6', weight: 1, dashArray: '10, 10', fill: false }} />
          ))}

          {filteredData.map(item => (
            <Marker key={item.id} position={item.coords} icon={createTacticalIcon(item.isAnomaly)}>
              <Popup className="tactical-popup">
                <div className="p-2 min-w-[200px]">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-black text-blue-500 uppercase">{item.source}</span>
                    <span className="text-[9px] text-zinc-500 font-mono">{new Date(item.timestamp).getHours()}:00</span>
                  </div>
                  <p className="text-xs font-bold text-zinc-100 mb-2">{item.location}</p>
                  <p className="text-[10px] text-zinc-400 leading-tight mb-3">{item.summary}</p>
                  <button
                    onClick={() => setSelectedEvidence(item)}
                    className="w-full py-2 bg-blue-600/20 border border-blue-500/50 text-blue-400 text-[9px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-all"
                  >
                    View Intelligence Analysis
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* 2. TOP HUD: MISSION CONTROL (BLOOMBERG STYLE) */}
      <header className={`absolute top-0 left-0 right-0 z-[1000] border-b border-zinc-800 bg-[#0a0a0c]`}>
        {/* WARNING TICKER IF CODE RED */}
        {isCodeRed && notification && (
          <div className="w-full bg-[#ff2a2a] text-black border-y border-[#ff2a2a] relative overflow-hidden">
            <div className="ticker-wrap h-6 flex items-center bg-transparent border-none">
              <div className="ticker text-[10px] font-mono font-black tracking-widest uppercase">
                *** <AlertTriangle size={10} className="inline mb-0.5" /> CRITICAL INCIDENT DETECTED *** SOURCE: {notification.source} *** REGION: {notification.region} *** PROTOCOL: CODE RED ***
              </div>
            </div>
          </div>
        )}

        {/* MAIN NAV BAR */}
        <div className={`flex items-center justify-between px-4 py-1.5 ${isCodeRed ? 'border-b border-[#ff2a2a]' : ''}`}>

          {/* LEFT: Branding */}
          <div className="flex items-center gap-3">
            <div className={`w-6 h-6 rounded-sm flex items-center justify-center border ${isCodeRed ? 'bg-[#ff2a2a] border-[#ff2a2a] text-black' : 'bg-transparent border-[#00ddff] text-[#00ddff]'}`}>
              <Zap size={14} className={isCodeRed ? 'animate-pulse' : ''} />
            </div>
            <div className="flex flex-col justify-center">
              <h1 className="text-sm font-bold tracking-tight text-[#f0f0f0]">GLOBAL<span className={isCodeRed ? "text-[#ff2a2a]" : "text-[#00ddff]"}>PULSE</span></h1>
              <p className="text-[8px] font-mono text-[#888890] tracking-widest uppercase mt-0.5">Terminal OS [v2.4]</p>
            </div>
          </div>

          {/* RIGHT: Global Controls */}
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end border-r border-[#27272a] pr-4">
              <span className="text-[7px] font-mono text-[#888890] uppercase tracking-widest mb-0.5">Active Index</span>
              <select
                value={watchedRegion}
                onChange={(e) => setWatchedRegion(e.target.value)}
                className="bg-[#141416] text-[10px] font-mono text-[#00ff66] border border-[#27272a] rounded-sm px-2 py-0.5 outline-none cursor-pointer hover:border-[#00ff66] transition-colors uppercase"
              >
                <option value="All Regions">^ GLB (ALL)</option>
                <option value="Middle East">^ MDEA (Mid East)</option>
                <option value="Eastern Europe">^ EUEU (East EU)</option>
                <option value="Global Shipping">^ SHIP (Logistics)</option>
              </select>
            </div>

            <div className={`flex items-center gap-2 px-3 py-1 bg-[#141416] border rounded-sm ${isCodeRed ? 'border-[#ff2a2a]' : 'border-[#27272a]'}`}>
              <Activity size={12} className={isCodeRed ? 'text-[#ff2a2a] animate-pulse' : 'text-[#00ff66]'} />
              <div className="flex flex-col">
                <span className="text-[6px] font-mono text-[#888890] uppercase tracking-widest">Sys.Link</span>
                <span className={`text-[8px] font-mono ${isCodeRed ? 'text-[#ff2a2a]' : 'text-[#00ff66]'}`}>READY</span>
              </div>
            </div>
          </div>

        </div>
      </header>

      {/* 3. TERMINAL PANEL (LEFT) */}
      <aside className="absolute top-[60px] left-4 bottom-24 w-[340px] flex flex-col gap-2 z-[500] pointer-events-none">

        {/* Analytics Module */}
        <div className="bg-[#0a0a0c] border border-[#27272a] rounded-sm p-3 pointer-events-auto flex flex-col gap-3 relative">
          <div className="flex justify-between items-end border-b border-[#27272a] pb-2">
            <div>
              <h3 className="text-[8px] font-mono text-[#888890] uppercase tracking-widest">Global Kinetic Index</h3>
              <p className="text-[10px] text-[#f0f0f0] font-mono mt-0.5">INTENSITY RT</p>
            </div>
            <div className="text-right flex flex-col items-end">
              <span className="text-xl font-mono text-[#00ff66] tabular-nums leading-none mb-1">84.22</span>
              <span className="text-[8px] font-mono text-[#00ff66] uppercase bg-[#00ff66]/10 px-1 py-0.5 rounded-sm">+2.45% ▲</span>
            </div>
          </div>

          <div className="h-8 w-full flex items-end gap-[1px]">
            {intelData.slice(0, 50).reverse().map((item, i) => (
              <div
                key={`bar-${i}`}
                className={`flex-1 transition-all duration-1000 ${item.intensity > 90 ? 'bg-[#ff2a2a]' :
                  item.intensity > 70 ? 'bg-[#ffb300]' : 'bg-[#00ddff]'
                  }`}
                style={{ height: `${item.intensity}%` }}
              />
            ))}
          </div>
        </div>

        {/* Terminal Controls */}
        <div className="bg-[#0a0a0c] border border-[#27272a] rounded-sm p-3 pointer-events-auto flex flex-col gap-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="text-[8px] font-mono text-[#00ddff] absolute left-2 top-1/2 -translate-y-1/2">&gt;</span>
              <input
                type="text"
                placeholder="QRY..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-[#141416] border border-[#27272a] rounded-sm py-1.5 pl-6 pr-2 text-[10px] font-mono tracking-widest text-[#f0f0f0] focus:border-[#00ddff] outline-none transition-all placeholder-[#888890]"
              />
            </div>
            <button
              onClick={() => setActiveFilter(activeFilter === 'all' ? 'anomaly' : 'all')}
              className={`px-3 py-1.5 rounded-sm border transition-all text-[9px] font-mono uppercase ${activeFilter === 'anomaly' ? 'bg-[#ff2a2a]/20 border-[#ff2a2a] text-[#ff2a2a]' : 'bg-[#141416] border-[#27272a] text-[#888890] hover:border-[#888890]'
                }`}
            >
              /FLT/ANML
            </button>
          </div>

          <div className="flex justify-between items-center gap-1.5">
            {[
              { id: 'military', icon: Shield, label: 'MIL' },
              { id: 'energy', icon: Zap, label: 'ENG' },
              { id: 'shipping', icon: Globe, label: 'SHP' }
            ].map(layer => (
              <button
                key={layer.id}
                onClick={() => setOverlays(prev => ({ ...prev, [layer.id]: !prev[layer.id] }))}
                className={`flex-1 flex items-center justify-center gap-1.5 p-1.5 rounded-sm border transition-all ${overlays[layer.id]
                  ? 'bg-[#00ddff]/10 border-[#00ddff] text-[#00ddff]'
                  : 'bg-[#141416] border-[#27272a] text-[#52525b] hover:border-[#52525b]'
                  }`}
              >
                <layer.icon size={10} />
                <span className="text-[9px] font-mono uppercase">{layer.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Data Stream */}
        <div className="bg-[#0a0a0c] rounded-sm flex-1 flex flex-col overflow-hidden border border-[#27272a] pointer-events-auto">
          <div className="p-2 border-b border-[#27272a] bg-[#141416] flex justify-between items-center">
            <h3 className="text-[9px] font-mono text-[#888890] uppercase tracking-widest flex items-center gap-2">
              <span className="text-[#00ddff] animate-pulse">●</span>
              RAW TICKER
            </h3>
            <span className="text-[9px] font-mono text-[#00ff66]">{filteredData.length} ACTIVE</span>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
            {filteredData.map((item) => (
              <div
                key={item.id}
                onClick={() => setFocusedCoords(item.coords)}
                className={`group p-2 rounded-sm border transition-all cursor-pointer ${item.isAnomaly
                  ? 'border-[#ff2a2a]/40 bg-[#ff2a2a]/5 hover:bg-[#ff2a2a]/10'
                  : 'border-[#27272a] bg-transparent hover:border-[#27272a] hover:bg-[#141416]'
                  }`}
              >
                <div className="flex justify-between items-start mb-1.5 text-[8px] font-mono">
                  <div className="flex gap-1.5 text-[#00ddff] uppercase">
                    <span>[{item.location}]</span>
                    <span className="text-[#888890]">SRC:{item.source}</span>
                  </div>
                  <span className="text-[#888890]">{new Date(item.timestamp).getHours()}:{String(new Date(item.timestamp).getMinutes()).padStart(2, '0')}</span>
                </div>
                <p className="text-[10px] font-mono text-[#d4d4d8] leading-tight line-clamp-2">{item.summary}</p>
                {item.isAnomaly && (
                  <div className="mt-1.5 text-[8px] font-mono text-[#ff2a2a] uppercase tracking-wide flex items-center gap-1">
                    <AlertTriangle size={8} />
                    CRITICAL WARNING
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* 4. BOTTOM HUD: TERMINAL CONTROLS */}
      <footer className="absolute bottom-6 left-[364px] right-6 z-[1000] pointer-events-none flex gap-2 items-end">
        <div className="bg-[#0a0a0c] border border-[#27272a] rounded-sm p-3 pointer-events-auto flex-1 max-w-[600px] ml-auto">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-mono text-[#888890] uppercase tracking-widest">TIMEFRAME SELECT</span>
            </div>
            <div className="text-[10px] font-mono text-[#00ff66] flex items-center gap-2">
              <span>●</span>
              T-{24 - timeHour}H
            </div>
          </div>

          <div className="relative h-6 flex flex-col justify-center">
            <input
              type="range"
              min="0" max="23"
              value={timeHour}
              onChange={(e) => setTimeHour(parseInt(e.target.value))}
              className="w-full h-px bg-[#27272a] rounded-none appearance-none cursor-pointer relative z-10"
              style={{ accentColor: '#00ddff' }}
            />
            <div className="absolute top-4 justify-between w-full flex text-[8px] font-mono text-[#52525b] uppercase">
              <span>24H</span>
              <span>18H</span>
              <span>12H</span>
              <span>06H</span>
              <span className="text-[#00ddff]">RT</span>
            </div>
          </div>
        </div>

        {/* View Toggle */}
        <button
          onClick={() => setShowHeatmap(!showHeatmap)}
          className={`h-[72px] w-20 rounded-sm border pointer-events-auto flex flex-col items-center justify-center gap-1.5 transition-all ${showHeatmap
            ? 'bg-[#ff2a2a]/10 border-[#ff2a2a] text-[#ff2a2a]'
            : 'bg-[#141416] border-[#27272a] text-[#888890] hover:border-[#52525b]'
            }`}
        >
          <Activity size={16} />
          <span className="text-[8px] font-mono uppercase tracking-widest text-center">LAY: HEAT</span>
        </button>
      </footer>

      {/* 5. MODALS & NOTIFICATIONS */}
      {selectedEvidence && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm pointer-events-auto">
          <div className="bg-[#0a0a0c] w-full max-w-2xl rounded-sm overflow-hidden border border-[#27272a] shadow-2xl">
            <div className="p-3 border-b border-[#27272a] flex justify-between items-center bg-[#141416]">
              <div className="flex items-center gap-3">
                <div className="w-6 h-6 border border-[#00ddff] text-[#00ddff] flex items-center justify-center">
                  <Eye size={12} />
                </div>
                <div>
                  <h3 className="text-[10px] font-mono text-[#f0f0f0] uppercase tracking-widest">DATA RECORD ANALYSIS</h3>
                  <p className="text-[8px] text-[#888890] font-mono">FILE.ID:{selectedEvidence.id}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedEvidence(null)}
                className="w-6 h-6 flex items-center justify-center text-[#888890] hover:text-[#f0f0f0]"
              >
                ✕
              </button>
            </div>

            <div className="p-6 font-mono">
              <div className="aspect-video bg-[#141416] rounded-sm mb-6 relative overflow-hidden border border-[#27272a]">
                <div className="absolute inset-0 opacity-20 bg-[url('https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/0,0,1,0,0/800x600')] bg-cover grayscale contrast-150"></div>
                <div className="absolute inset-0 flex items-center justify-center z-20">
                  <div className="w-16 h-16 border border-[#ff2a2a] flex items-center justify-center">
                    <div className="w-1 h-1 bg-[#ff2a2a] rounded-full animate-ping"></div>
                  </div>
                </div>
                <div className="absolute top-4 left-4 flex flex-col gap-1">
                  <span className="text-[9px] text-[#00ddff] bg-black/60 px-1 py-0.5 border border-[#00ddff]/20">LAT:{selectedEvidence.coords[0].toFixed(6)}</span>
                  <span className="text-[9px] text-[#00ddff] bg-black/60 px-1 py-0.5 border border-[#00ddff]/20">LON:{selectedEvidence.coords[1].toFixed(6)}</span>
                </div>
                <div className="absolute bottom-4 right-4 text-right">
                  <div className="text-[9px] text-[#ff2a2a] bg-black/80 px-2 py-0.5 border border-[#ff2a2a]/30 uppercase">TRG_LOCK</div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="bg-[#141416] p-4 border border-[#27272a] border-l-2 border-l-[#00ddff]">
                  <p className="text-xs text-[#d4d4d8] leading-relaxed">
                    "Intelligence node report matches anomaly profile. Probability metric threshold exceeded. Action suggested: Elevate threat posture."
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[#141416] p-4 border border-[#27272a]">
                    <p className="text-[9px] text-[#888890] uppercase mb-1">SCORE</p>
                    <p className="text-xl text-[#00ddff]">94.8%</p>
                  </div>
                  <div className="bg-[#141416] p-4 border border-[#27272a]">
                    <p className="text-[9px] text-[#888890] uppercase mb-1">LVL</p>
                    <p className="text-xl text-[#ff2a2a]">CRIT</p>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={() => setSelectedEvidence(null)}
              className="w-full py-4 bg-[#00ddff]/10 text-[#00ddff] border-t border-[#00ddff]/30 text-[10px] font-mono uppercase tracking-widest hover:bg-[#00ddff]/20 transition-all"
            >
              [CLOSE terminal/view]
            </button>
          </div>
        </div>
      )}

      {/* Live Alert Toast - Terminal Style */}
      {notification && (watchedRegion === 'All Regions' || notification.region === watchedRegion) && (
        <div
          className="fixed top-16 left-1/2 -translate-x-1/2 z-[3000] w-[400px] cursor-pointer group"
          onClick={() => setFocusedCoords(notification.coords)}
        >
          <div className="bg-[#141416] border border-[#ff2a2a] p-2 shadow-[0_0_20px_rgba(255,42,42,0.2)]">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-6 h-6 bg-[#ff2a2a] flex items-center justify-center animate-pulse">
                <AlertTriangle size={12} className="text-black" />
              </div>
              <div className="font-mono">
                <p className="text-[8px] uppercase tracking-widest text-[#ff2a2a]">SYS_ALERT</p>
                <p className="text-[10px] text-[#f0f0f0] truncate">{notification.location}: {notification.summary}</p>
              </div>
            </div>
            <div className="h-0.5 bg-[#27272a] w-full overflow-hidden">
              <div className="h-full bg-[#ff2a2a] animate-[progress_8s_linear]"></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
