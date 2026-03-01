export const OSINT_SOURCES = [
  "Osint613", "ConflictTR", "tcdefence", "spectatorindex", 
  "_GlobeObserver", "ELINTNews", "enformasyon56", "temmuz1919", 
  "yunuspaksoy", "IRMilitaryMedia", "RusenPress", "Osinteurope", "WarMonitor3"
];

const CONFLICT_ZONES = {
  MIDDLE_EAST: [
    { name: "Beirut Southern Suburbs", coords: [33.848, 35.511], region: "Lebanon" },
    { name: "Gaza Northern Sector", coords: [31.530, 34.480], region: "Palestine" },
    { name: "Red Sea - Bab el-Mandeb", coords: [12.583, 43.333], region: "Global Shipping" },
    { name: "Erbil High Alert Zone", coords: [36.191, 44.009], region: "Iraq" }
  ],
  EASTERN_EUROPE: [
    { name: "Pokrovsk Defense Line", coords: [48.282, 37.176], region: "Ukraine" },
    { name: "Kursk Incursion Zone", coords: [51.341, 35.215], region: "Russia" },
    { name: "Odessa Port Infrastructure", coords: [46.485, 30.743], region: "Ukraine" },
    { name: "Vovchansk Urban Combat", coords: [50.287, 36.937], region: "Ukraine" }
  ]
};

// Phase 5: Infrastructure Overlays
export const MAP_OVERLAYS = [
  { id: 'military', name: 'Military Bases', color: '#ff4444' },
  { id: 'energy', name: 'Power Grid', color: '#fbbf24' },
  { id: 'shipping', name: 'Shipping Lanes', color: '#3b82f6' }
];

export const INFRASTRUCTURE_DATA = {
  military: [
    { name: "Hmeimim Air Base", coords: [35.412, 35.947] },
    { name: "Incirlik Air Base", coords: [37.001, 35.425] },
    { name: "Sevastopol Naval Base", coords: [44.616, 33.525] }
  ],
  energy: [
    { name: "Zaporizhzhia Nuclear Plant", coords: [47.511, 34.585] },
    { name: "South Pars Gas Field", coords: [26.702, 52.348] }
  ],
  shipping: [
    { name: "Suez Canal Entrance", coords: [29.928, 32.551] },
    { name: "Strait of Hormuz", coords: [26.566, 56.252] }
  ]
};

export const TACTICAL_DICTIONARY = {
  "KINETIC_STRIKE": "An attack using conventional or unconventional weapons to cause physical damage.",
  "MLRS": "Multiple Launch Rocket System to provide high-volume fire.",
  "AD_SYSTEMS": "Air Defense systems designed to intercept incoming aerial threats.",
  "ISW_ASSESSMENT": "Institute for the Study of War detailed military analysis."
};

let regionalStates = {
  "Lebanon": { level: 0 },
  "Palestine": { level: 0 },
  "Global Shipping": { level: 0 },
  "Iraq": { level: 0 },
  "Ukraine": { level: 0 },
  "Russia": { level: 0 }
};

const ESCALATION_STAGES = [
  // Level 0: Monitoring
  [
    "Drone surveillance spotted out of normal flight envelope.",
    "Unusual electronic warfare signature detected.",
    "Logistical movement observed via commercial satellite.",
    "Local sources reporting heightened security patrols."
  ],
  // Level 1: Warning
  [
    "Air defense systems activated in sector.",
    "Artillery repositioning confirmed.",
    "Naval assets altering course unexpectedly.",
    "Intercepted comms suggest imminent tactical action."
  ],
  // Level 2: Kinetic
  [
    "Flash: Unconfirmed kinetic strike reported.",
    "Secondary explosions detected following initial impact.",
    "Significant thermal anomaly registered by orbital sensors.",
    "Mass casualty event suspected. Emergency crews mobilizing."
  ]
];

export const mockOSINTLogic = {
  // Enhanced for Phase 5 timeline
  processFeed: async (rawMessages) => {
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const allZones = [...CONFLICT_ZONES.MIDDLE_EAST, ...CONFLICT_ZONES.EASTERN_EUROPE];

    return rawMessages.map((msg, idx) => {
      const zone = allZones[idx % allZones.length];
      const source = OSINT_SOURCES[idx % OSINT_SOURCES.length];
      const intensity = 75 + Math.floor(Math.random() * 25);
      const corroborationCount = intensity > 90 ? Math.floor(Math.random() * 4) + 2 : Math.floor(Math.random() * 2);
      
      // Phase 5: Impact Prediction
      const impactScore = intensity > 85 ? "LİNKED_TO_ESCALATION" : "STABLE_EVENT";
      const prediction = intensity > 90 ? 
        "High probability of localized retaliatory strikes within 12h." : 
        "Maintaining current conflict equilibrium.";

      return {
        id: Math.random().toString(36).substr(2, 9),
        intensity,
        isVerified: intensity > 88,
        category: (idx % 2 === 0 || intensity > 95) ? "KINETIC_STRIKE" : "DEVELOPMENT",
        summary: msg,
        location: zone.name,
        region: zone.region,
        source: `@${source}`,
        coords: zone.coords,
        corroboration: corroborationCount,
        isAnomaly: intensity > 98,
        impact: impactScore,
        prediction: prediction,
        timestamp: new Date(Date.now() - (idx * 3600000)).toISOString() // Hourly history for scrubber
      };
    });
  },
  // Phase 6: Live Intel Generator (Now Stateful)
  generateLiveIntel: async () => {
    await new Promise(resolve => setTimeout(resolve, 500));
    const allZones = [...CONFLICT_ZONES.MIDDLE_EAST, ...CONFLICT_ZONES.EASTERN_EUROPE];
    const zone = allZones[Math.floor(Math.random() * allZones.length)];
    
    // State machine progression
    let state = regionalStates[zone.region];
    if (!state) state = { level: 0 }; // Fallback
    
    // 35% chance to escalate, 15% chance to de-escalate back to 0
    const rand = Math.random();
    if (rand < 0.35) { state.level = Math.min(2, state.level + 1); }
    else if (rand > 0.85) { state.level = 0; }
    
    regionalStates[zone.region] = state; // Save state

    const source = OSINT_SOURCES[Math.floor(Math.random() * OSINT_SOURCES.length)];
    const baseIntensity = state.level === 0 ? 70 : (state.level === 1 ? 82 : 95);
    const intensity = baseIntensity + Math.floor(Math.random() * 5); // Add variance
    
    const stageMsgs = ESCALATION_STAGES[state.level];
    const summary = stageMsgs[Math.floor(Math.random() * stageMsgs.length)];

    return {
      id: Math.random().toString(36).substr(2, 9),
      intensity,
      isVerified: intensity > 85,
      category: intensity > 90 ? "KINETIC_STRIKE" : "DEVELOPMENT",
      summary: summary,
      location: zone.name,
      region: zone.region,
      source: `@${source}`,
      coords: zone.coords,
      corroboration: state.level > 0 ? state.level * 2 : 0,
      isAnomaly: intensity > 96,
      impact: state.level > 0 ? "LİNKED_TO_ESCALATION" : "STABLE_EVENT",
      prediction: state.level === 2 ? "High probability of further kinetic activity." : (state.level === 1 ? "Imminent escalation expected." : "Monitoring situation."),
      timestamp: new Date().toISOString(),
      isLive: true // Flag for UI notification
    };
  }
};
