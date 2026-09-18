import { useState, useRef } from 'react'
import Globe from './components/Globe.jsx'
import InfoPanel from './components/InfoPanel.jsx'
import { useFlights } from './hooks/useFlights.js'
import { useEarthquakes } from './hooks/useEarthquakes.js'
import { useSatellites } from './hooks/useSatellites.js'
import {
  setAudioEnabled,
  isAudioEnabled,
  playClickSound,
  playFilterSound,
} from './utils/soundEngine.js'

export default function App() {
  const { flights, status: flightStatus, lastUpdated } = useFlights()
  const { earthquakes } = useEarthquakes()
  const { satellites } = useSatellites()

  const [selectedTarget, setSelectedTarget] = useState(null)
  const [filterQuery, setFilterQuery] = useState('')
  const [activeLayer, setActiveLayer] = useState('all') // 'all' | 'flights' | 'satellites' | 'earthquakes'

  // Enhancement 3 & 4 States
  const [minAltitude, setMinAltitude] = useState(0)
  const [maxAltitude, setMaxAltitude] = useState(15000)
  const [minMagnitude, setMinMagnitude] = useState(0)
  const [renderMode, setRenderMode] = useState('grid') // 'grid' | 'solar' | 'night'
  const [cinematicMode, setCinematicMode] = useState(false)
  const [audioOn, setAudioOn] = useState(true)

  const resetCameraRef = useRef(null)
  const flyToTargetRef = useRef(null)

  const handleAudioToggle = () => {
    const next = !audioOn
    setAudioOn(next)
    setAudioEnabled(next)
    if (next) playClickSound()
  }

  const handleSelectTarget = (target) => {
    setSelectedTarget(target)
  }

  const handleFlyToTarget = (target) => {
    playClickSound()
    if (flyToTargetRef.current) {
      flyToTargetRef.current(target)
    }
  }

  const statusLabel = {
    loading: 'Connecting…',
    live: 'Live',
    error: 'Reconnecting…',
  }[flightStatus]

  const filteredFlightCount = flights.filter(f => {
    const alt = f.altitude ?? 8000
    if (alt < minAltitude || alt > maxAltitude) return false
    if (!filterQuery.trim()) return true
    return (
      (f.callsign || '').toLowerCase().includes(filterQuery.toLowerCase()) ||
      (f.originCountry || '').toLowerCase().includes(filterQuery.toLowerCase())
    )
  }).length

  return (
    <div className="app-shell">
      <Globe
        flights={flights}
        earthquakes={earthquakes}
        satellites={satellites}
        activeLayer={activeLayer}
        filterQuery={filterQuery}
        minAltitude={minAltitude}
        maxAltitude={maxAltitude}
        minMagnitude={minMagnitude}
        renderMode={renderMode}
        cinematicMode={cinematicMode}
        selectedTarget={selectedTarget}
        onSelectTarget={handleSelectTarget}
        onResetReady={(fn) => { resetCameraRef.current = fn }}
        onFlyToTargetReady={(fn) => { flyToTargetRef.current = fn }}
      />

      <div className="hud">
        <div className="hud-header-row">
          <div>
            <div className="hud-title">🌍 Live Globe</div>
            <div className="hud-subtitle">Real-time 3D flight, satellite & earthquake visualizer</div>
          </div>
          <button
            className={`audio-toggle-btn ${audioOn ? 'active' : ''}`}
            onClick={handleAudioToggle}
            title="Toggle Web Audio Synthesizer"
          >
            {audioOn ? '🔊 AUDIO ON' : '🔇 MUTE'}
          </button>
        </div>

        {/* Data Layer Toggles */}
        <div className="layer-selector">
          <button
            className={`layer-btn ${activeLayer === 'all' ? 'active' : ''}`}
            onClick={() => { playFilterSound(); setActiveLayer('all') }}
          >
            🌐 All
          </button>
          <button
            className={`layer-btn ${activeLayer === 'flights' ? 'active' : ''}`}
            onClick={() => { playFilterSound(); setActiveLayer('flights') }}
          >
            ✈️ Flights ({flights.length})
          </button>
          <button
            className={`layer-btn ${activeLayer === 'satellites' ? 'active' : ''}`}
            onClick={() => { playFilterSound(); setActiveLayer('satellites') }}
          >
            🛰️ Satellites ({satellites.length})
          </button>
          <button
            className={`layer-btn ${activeLayer === 'earthquakes' ? 'active' : ''}`}
            onClick={() => { playFilterSound(); setActiveLayer('earthquakes') }}
          >
            🌋 Quakes ({earthquakes.length})
          </button>
        </div>

        {/* Shading & Camera Controls */}
        <div className="mode-selector">
          <button
            className={`mode-btn ${renderMode === 'grid' ? 'active' : ''}`}
            onClick={() => { playClickSound(); setRenderMode('grid') }}
          >
            🌐 Cyber Grid
          </button>
          <button
            className={`mode-btn ${renderMode === 'solar' ? 'active' : ''}`}
            onClick={() => { playClickSound(); setRenderMode('solar') }}
          >
            ☀️ Solar Day/Night
          </button>
          <button
            className={`mode-btn ${renderMode === 'night' ? 'active' : ''}`}
            onClick={() => { playClickSound(); setRenderMode('night') }}
          >
            🌙 High Contrast
          </button>
          <button
            className={`mode-btn cinematic ${cinematicMode ? 'active' : ''}`}
            onClick={() => { playClickSound(); setCinematicMode(!cinematicMode) }}
            title="Auto-rotating Orbit Flyby"
          >
            🎬 Cinematic {cinematicMode ? 'ON' : 'OFF'}
          </button>
        </div>

        {/* Search */}
        <div className="search-row">
          <input
            className="search-input"
            type="text"
            placeholder="Search callsign, satellite or location…"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            spellCheck={false}
          />
          {filterQuery && (
            <button
              className="search-clear"
              onClick={() => setFilterQuery('')}
              aria-label="Clear search"
            >✕</button>
          )}
        </div>

        {/* Multi-Parameter Filters */}
        <div className="filter-group">
          {(activeLayer === 'all' || activeLayer === 'flights') && (
            <div className="slider-row">
              <span className="slider-label">MAX ALTITUDE: {maxAltitude.toLocaleString()} M</span>
              <input
                type="range"
                min="2000"
                max="15000"
                step="500"
                value={maxAltitude}
                onChange={(e) => { setMaxAltitude(Number(e.target.value)); playFilterSound() }}
                className="altitude-slider"
              />
            </div>
          )}

          {(activeLayer === 'all' || activeLayer === 'earthquakes') && (
            <div className="mag-filter-row">
              <span className="mag-label">MIN MAGNITUDE:</span>
              {[0, 3.5, 5.0, 6.0].map((mag) => (
                <button
                  key={mag}
                  className={`mag-btn ${minMagnitude === mag ? 'active' : ''}`}
                  onClick={() => { setMinMagnitude(mag); playFilterSound() }}
                >
                  {mag === 0 ? 'ALL' : `M${mag}+`}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Reset View */}
        <button
          className="reset-btn"
          onClick={() => { playClickSound(); resetCameraRef.current?.() }}
        >
          ↺ Reset Camera View
        </button>
      </div>

      {/* Altitude Spectrum Bar */}
      <div className="altitude-legend">
        <div className="legend-title">ALTITUDE SPECTRUM</div>
        <div className="legend-bar">
          <div className="legend-segment low" title="< 4,000m: Approach / Low">
            <span className="dot orange" /> &lt;4,000m
          </div>
          <div className="legend-segment mid-low" title="4,000m - 8,000m: Climb">
            <span className="dot green" /> 4-8k m
          </div>
          <div className="legend-segment mid-high" title="8,000m - 12,000m: Cruise">
            <span className="dot cyan" /> 8-12k m
          </div>
          <div className="legend-segment high" title="> 12,000m+: High Altitude">
            <span className="dot blue" /> &gt;12k m
          </div>
        </div>
      </div>

      {/* Cybernetic Telemetry Ticker */}
      <div className="telemetry-ticker">
        <span className="ticker-label">RADAR.NET // LIVE DATA ENGINE</span>
        <span className="ticker-divider">|</span>
        <span className="ticker-text">
          ✈️ {filteredFlightCount.toLocaleString()} VISIBLE FLIGHTS · 🛰️ {satellites.length.toLocaleString()} SATELLITES · 🌋 {earthquakes.length.toLocaleString()} QUAKES · FEEDS: OPENSKY + CELESTRAK + USGS
        </span>
      </div>

      <div className="status-pill">
        <span className={`status-dot ${flightStatus}`} />
        {statusLabel}
        {lastUpdated && flightStatus === 'live' && (
          <span style={{ color: '#556077' }}>
            · {lastUpdated.toLocaleTimeString()}
          </span>
        )}
      </div>

      <InfoPanel
        target={selectedTarget}
        onClearTarget={() => setSelectedTarget(null)}
        onFlyToTarget={handleFlyToTarget}
      />

      <div className="flight-count">{filteredFlightCount.toLocaleString()} targets rendering</div>
    </div>
  )
}

