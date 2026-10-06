import { useState, useRef, useEffect } from 'react'
import Globe from './components/Globe.jsx'
import InfoPanel from './components/InfoPanel.jsx'
import { useFlights } from './hooks/useFlights.js'
import { useEarthquakes } from './hooks/useEarthquakes.js'
import { useSatellites } from './hooks/useSatellites.js'
import { calculateGreatCircleDistance } from './utils/coords.js'
import {
  setAudioEnabled,
  isAudioEnabled,
  playClickSound,
  playFilterSound,
  playMeasureSound,
} from './utils/soundEngine.js'

export default function App() {
  const { flights, status: flightStatus, lastUpdated } = useFlights()
  const { earthquakes } = useEarthquakes()
  const { satellites } = useSatellites()

  const [selectedTarget, setSelectedTarget] = useState(null)
  const [filterQuery, setFilterQuery] = useState('')
  const [activeLayer, setActiveLayer] = useState('all') // 'all' | 'flights' | 'satellites' | 'earthquakes'

  // Control States
  const [minAltitude, setMinAltitude] = useState(0)
  const [maxAltitude, setMaxAltitude] = useState(15000)
  const [minMagnitude, setMinMagnitude] = useState(0)
  const [renderMode, setRenderMode] = useState('grid') // 'grid' | 'solar' | 'night'
  const [cinematicMode, setCinematicMode] = useState(false)
  const [audioOn, setAudioOn] = useState(true)
  const [isHudCollapsed, setIsHudCollapsed] = useState(false)
  const [utcTime, setUtcTime] = useState(() => new Date().toISOString().substring(11, 19) + ' UTC')

  useEffect(() => {
    const timer = setInterval(() => {
      setUtcTime(new Date().toISOString().substring(11, 19) + ' UTC')
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Distance Measurement Tool State
  const [measureMode, setMeasureMode] = useState(false)
  const [measurePoints, setMeasurePoints] = useState([])

  const resetCameraRef = useRef(null)
  const flyToTargetRef = useRef(null)
  const flyToLocationRef = useRef(null)

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

  const handleToggleMeasureMode = () => {
    playClickSound()
    setMeasureMode(!measureMode)
    if (measureMode) {
      setMeasurePoints([])
    }
  }

  const handleAddMeasurePoint = (point) => {
    playMeasureSound()
    if (measurePoints.length >= 2) {
      setMeasurePoints([point])
    } else {
      setMeasurePoints([...measurePoints, point])
    }
  }

  const handleClearMeasure = () => {
    playClickSound()
    setMeasurePoints([])
  }

  const handleRegionJump = (lat, lon) => {
    playClickSound()
    if (flyToLocationRef.current) {
      flyToLocationRef.current(lat, lon, 4.2)
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

  const measuredDistance = measurePoints.length === 2
    ? calculateGreatCircleDistance(
        measurePoints[0].lat, measurePoints[0].lon,
        measurePoints[1].lat, measurePoints[1].lon
      )
    : null

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
        measureMode={measureMode}
        measurePoints={measurePoints}
        onAddMeasurePoint={handleAddMeasurePoint}
        onSelectTarget={handleSelectTarget}
        onResetReady={(fn) => { resetCameraRef.current = fn }}
        onFlyToTargetReady={(fn) => { flyToTargetRef.current = fn }}
        onFlyToLocationReady={(fn) => { flyToLocationRef.current = fn }}
      />

      {isHudCollapsed ? (
        <button
          className="hud-minimized-pill"
          onClick={() => { playClickSound(); setIsHudCollapsed(false) }}
          title="Expand Mission Control HUD"
        >
          <span className="pill-dot" />
          <span>🌍 UGLOBE HUD</span>
          <span className="pill-clock">{utcTime}</span>
          <span className="pill-chevron">⤢</span>
        </button>
      ) : (
        <div className="hud">
          <div className="hud-header-row">
            <div>
              <div className="hud-title">
                <span>🌍 UGLOBE</span>
                <span className="hud-utc-badge">{utcTime}</span>
              </div>
              <div className="hud-subtitle">Planetary Telemetry & Aerospace Intelligence</div>
            </div>
            <div className="hud-header-actions">
              <button
                className={`audio-toggle-btn ${audioOn ? 'active' : ''}`}
                onClick={handleAudioToggle}
                title="Toggle Web Audio Synthesizer"
              >
                {audioOn ? '🔊 SFX' : '🔇 MUTE'}
              </button>
              <button
                className="hud-collapse-btn"
                onClick={() => { playClickSound(); setIsHudCollapsed(true) }}
                title="Minimize HUD to corner"
              >
                —
              </button>
            </div>
          </div>

          {/* Quick Telemetry Summary Bar */}
          <div className="hud-quick-stats">
            <div className="stat-pill">
              <span className="stat-lbl">AIR</span>
              <span className="stat-val">{flights.length.toLocaleString()}</span>
            </div>
            <div className="stat-pill">
              <span className="stat-lbl">LEO</span>
              <span className="stat-val">{satellites.length.toLocaleString()}</span>
            </div>
            <div className="stat-pill">
              <span className="stat-lbl">SEISMIC</span>
              <span className="stat-val">{earthquakes.length.toLocaleString()}</span>
            </div>
            <div className="stat-pill">
              <span className="stat-lbl">&gt;10KM</span>
              <span className="stat-val">{flights.filter(f => (f.altitude || 0) >= 10000).length.toLocaleString()}</span>
            </div>
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

        {/* Regional Quick Focus Bar */}
        <div className="region-selector">
          <span className="region-title">QUICK FOCUS:</span>
          <button className="region-btn" onClick={() => handleRegionJump(38, -97)}>🗽 NA</button>
          <button className="region-btn" onClick={() => handleRegionJump(48, 15)}>🇪🇺 EU</button>
          <button className="region-btn" onClick={() => handleRegionJump(25, 115)}>🌏 APAC</button>
          <button className="region-btn" onClick={() => handleRegionJump(15, 30)}>🌍 MEA</button>
          <button className="region-btn" onClick={() => handleRegionJump(-25, 135)}>🇦🇺 OCE</button>
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

        {/* Measurement Ruler Mode & Reset View */}
        <div className="tool-row">
          <button
            className={`measure-btn ${measureMode ? 'active' : ''}`}
            onClick={handleToggleMeasureMode}
          >
            📏 RULER MODE: {measureMode ? 'ON' : 'OFF'}
          </button>
          <button
            className="reset-btn"
            onClick={() => { playClickSound(); resetCameraRef.current?.() }}
          >
            ↺ Reset View
          </button>
        </div>
      </div>
    )}

      {/* Spatial Distance Measurement Results HUD Card */}
      {measureMode && (
        <div className="measurement-card">
          <div className="card-header">
            <span className="card-title">📏 SPATIAL DISTANCE RULER</span>
            <button className="card-close" onClick={handleClearMeasure}>✕ RESET</button>
          </div>
          {measurePoints.length === 0 && (
            <div className="measure-status">Click any point or target on globe to set ORIGIN (Pt A)...</div>
          )}
          {measurePoints.length === 1 && (
            <div className="measure-status">
              <div>📍 PT A: {measurePoints[0].lat.toFixed(2)}°, {measurePoints[0].lon.toFixed(2)}°</div>
              <div className="prompt">Click second point on globe to set DESTINATION (Pt B)...</div>
            </div>
          )}
          {measuredDistance && (
            <div className="measure-results">
              <div className="coords-row">
                <span>A: {measurePoints[0].lat.toFixed(2)}°, {measurePoints[0].lon.toFixed(2)}°</span>
                <span>→</span>
                <span>B: {measurePoints[1].lat.toFixed(2)}°, {measurePoints[1].lon.toFixed(2)}°</span>
              </div>
              <div className="dist-main">{measuredDistance.km.toLocaleString()} <span className="unit">KM</span></div>
              <div className="dist-sub">
                <span>{measuredDistance.nauticalMiles.toLocaleString()} NM</span>
                <span className="sep">|</span>
                <span>{measuredDistance.miles.toLocaleString()} MILES</span>
              </div>
            </div>
          )}
        </div>
      )}

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


