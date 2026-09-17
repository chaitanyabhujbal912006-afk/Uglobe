export default function InfoPanel({ flight }) {
  if (!flight) return null

  // Key derived from telemetry state to trigger 100ms hardware terminal flash animation on update
  const updateKey = `${flight.callsign || flight.id || 'acft'}-${flight.altitude}-${flight.velocity}-${flight.latitude?.toFixed(2)}-${flight.longitude?.toFixed(2)}`

  return (
    <div className="info-panel">
      {/* Decorative Geometric SVG Corner Accents (Electric Blue Crosshairs/Circuit Lines) */}
      <svg className="corner-accent top-left" width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M 0 6 V 0 H 6" stroke="#00f3ff" strokeWidth="2" />
        <path d="M 0 0 L 5 5" stroke="#00f3ff" strokeWidth="1" />
        <circle cx="5" cy="5" r="1.5" fill="#00f3ff" />
      </svg>
      <svg className="corner-accent top-right" width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M 16 6 V 0 H 10" stroke="#00f3ff" strokeWidth="2" />
        <path d="M 16 0 L 11 5" stroke="#00f3ff" strokeWidth="1" />
        <circle cx="11" cy="5" r="1.5" fill="#00f3ff" />
      </svg>
      <svg className="corner-accent bottom-left" width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M 0 10 V 16 H 6" stroke="#00f3ff" strokeWidth="2" />
        <path d="M 0 16 L 5 11" stroke="#00f3ff" strokeWidth="1" />
        <circle cx="5" cy="11" r="1.5" fill="#00f3ff" />
      </svg>
      <svg className="corner-accent bottom-right" width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M 16 10 V 16 H 10" stroke="#00f3ff" strokeWidth="2" />
        <path d="M 16 16 L 11 11" stroke="#00f3ff" strokeWidth="1" />
        <circle cx="11" cy="11" r="1.5" fill="#00f3ff" />
      </svg>

      <div className="info-panel-header">
        <div className="telemetry-header-title">TELEMETRY READOUT</div>
        <div className="telemetry-target-id">{flight.callsign || flight.id || 'TARGET LOCKED'}</div>
      </div>

      <div key={updateKey} className="terminal-refresh info-content">
        <div className="info-row">
          <span className="telemetry-label">CALLSIGN</span>
          <span className="telemetry-value">{flight.callsign || 'N/A'}</span>
        </div>

        <div className="info-row">
          <span className="telemetry-label">ORIGIN</span>
          <span className="telemetry-value">{flight.originCountry || 'UNKNOWN'}</span>
        </div>

        <div className="info-row">
          <span className="telemetry-label">ALTITUDE</span>
          <span className="telemetry-value">
            {flight.altitude != null ? `${Math.round(flight.altitude).toLocaleString()} M` : '—'}
          </span>
        </div>

        <div className="info-row">
          <span className="telemetry-label">VELOCITY</span>
          <span className="telemetry-value">
            {flight.velocity != null ? `${Math.round(flight.velocity * 3.6).toLocaleString()} KM/H` : '—'}
          </span>
        </div>

        <div className="info-row">
          <span className="telemetry-label">HEADING</span>
          <span className="telemetry-value">
            {flight.heading != null ? `${Math.round(flight.heading)}°` : '—'}
          </span>
        </div>

        <div className="info-row">
          <span className="telemetry-label">POSITION</span>
          <span className="telemetry-value position">
            {flight.latitude != null && flight.longitude != null
              ? `${flight.latitude.toFixed(2)}°, ${flight.longitude.toFixed(2)}°`
              : '—'}
          </span>
        </div>
      </div>
    </div>
  )
}

