import { useState, useRef } from 'react'
import Globe from './components/Globe.jsx'
import InfoPanel from './components/InfoPanel.jsx'
import { useFlights } from './hooks/useFlights.js'

export default function App() {
  const { flights, status, lastUpdated } = useFlights()
  const [selectedFlight, setSelectedFlight] = useState(null)
  const [filterQuery, setFilterQuery] = useState('')
  const resetCameraRef = useRef(null) // set by Globe once the scene is ready

  const statusLabel = {
    loading: 'Connecting…',
    live: 'Live',
    error: 'Reconnecting…',
  }[status]

  const matchCount = filterQuery.trim()
    ? flights.filter(
        (f) =>
          (f.callsign || '').toLowerCase().includes(filterQuery.toLowerCase()) ||
          (f.originCountry || '').toLowerCase().includes(filterQuery.toLowerCase())
      ).length
    : null

  return (
    <div className="app-shell">
      <Globe
        flights={flights}
        filterQuery={filterQuery}
        onSelectFlight={setSelectedFlight}
        onResetReady={(fn) => { resetCameraRef.current = fn }}
      />

      <div className="hud">
        <div className="hud-title">🌍 Live Globe</div>
        <div className="hud-subtitle">Real-time flight tracker · click a point</div>

        {/* Search */}
        <div className="search-row">
          <input
            className="search-input"
            type="text"
            placeholder="Search callsign or country…"
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
        {matchCount !== null && (
          <div className="search-count">
            {matchCount.toLocaleString()} of {flights.length.toLocaleString()} matching
          </div>
        )}

        {/* Reset View */}
        <button
          className="reset-btn"
          onClick={() => resetCameraRef.current?.()}
        >
          ↺ Reset View
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
        <span className="ticker-label">RADAR.NET // LIVE</span>
        <span className="ticker-divider">|</span>
        <span className="ticker-text">
          TRACKED TARGETS: {flights.length.toLocaleString()} AIRCRAFT · SATELLITE FEED: OPENSKY NETWORK · REFRESH RATE: REALTIME 60FPS
        </span>
      </div>

      <div className="status-pill">
        <span className={`status-dot ${status}`} />
        {statusLabel}
        {lastUpdated && status === 'live' && (
          <span style={{ color: '#556077' }}>
            · {lastUpdated.toLocaleTimeString()}
          </span>
        )}
      </div>

      <InfoPanel flight={selectedFlight} />

      <div className="flight-count">{flights.length.toLocaleString()} aircraft tracked</div>
    </div>
  )
}
