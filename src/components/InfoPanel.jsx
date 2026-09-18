export default function InfoPanel({ target, onClearTarget, onFlyToTarget }) {
  if (!target) return null

  const targetType = target.type || (target.noradId ? 'satellite' : target.magnitude ? 'earthquake' : 'flight')

  const updateKey = `${target.id || target.callsign || target.name}-${target.latitude?.toFixed(2)}-${target.longitude?.toFixed(2)}`

  return (
    <div className="info-panel">
      {/* Corner Accents */}
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
        <div className="telemetry-header-title">
          {targetType === 'flight' && '✈️ AIRCRAFT TELEMETRY'}
          {targetType === 'satellite' && '🛰️ SATELLITE TELEMETRY'}
          {targetType === 'earthquake' && '🌋 SEISMIC TELEMETRY'}
        </div>
        <div className="telemetry-header-actions">
          {onFlyToTarget && (
            <button className="telemetry-act-btn fly" onClick={() => onFlyToTarget(target)} title="Fly Camera to Target">
              🎯 LOCK
            </button>
          )}
          {onClearTarget && (
            <button className="telemetry-act-btn close" onClick={onClearTarget} title="Clear Target">
              ✕
            </button>
          )}
        </div>
      </div>

      <div key={updateKey} className="terminal-refresh info-content">
        {targetType === 'flight' && (
          <>
            <div className="info-row">
              <span className="telemetry-label">CALLSIGN</span>
              <span className="telemetry-value highlight">{target.callsign || 'N/A'}</span>
            </div>
            <div className="info-row">
              <span className="telemetry-label">ORIGIN</span>
              <span className="telemetry-value">{target.originCountry || 'UNKNOWN'}</span>
            </div>
            <div className="info-row">
              <span className="telemetry-label">ALTITUDE</span>
              <span className="telemetry-value">
                {target.altitude != null ? `${Math.round(target.altitude).toLocaleString()} M` : '—'}
              </span>
            </div>
            <div className="info-row">
              <span className="telemetry-label">VELOCITY</span>
              <span className="telemetry-value">
                {target.velocity != null ? `${Math.round(target.velocity * 3.6).toLocaleString()} KM/H` : '—'}
              </span>
            </div>
            <div className="info-row">
              <span className="telemetry-label">HEADING</span>
              <span className="telemetry-value">
                {target.heading != null ? `${Math.round(target.heading)}°` : '—'}
              </span>
            </div>
          </>
        )}

        {targetType === 'satellite' && (
          <>
            <div className="info-row">
              <span className="telemetry-label">NAME</span>
              <span className="telemetry-value highlight">{target.name}</span>
            </div>
            <div className="info-row">
              <span className="telemetry-label">NORAD ID</span>
              <span className="telemetry-value">{target.noradId}</span>
            </div>
            <div className="info-row">
              <span className="telemetry-label">ALTITUDE</span>
              <span className="telemetry-value">{target.altitudeKm?.toLocaleString()} KM</span>
            </div>
            <div className="info-row">
              <span className="telemetry-label">VELOCITY</span>
              <span className="telemetry-value">{target.velocityKmS} KM/S</span>
            </div>
            <div className="info-row">
              <span className="telemetry-label">ORBIT PERIOD</span>
              <span className="telemetry-value">{target.orbitPeriodMin} MIN</span>
            </div>
            <div className="info-row">
              <span className="telemetry-label">INCLINATION</span>
              <span className="telemetry-value">{target.inclinationDeg}°</span>
            </div>
          </>
        )}

        {targetType === 'earthquake' && (
          <>
            <div className="info-row">
              <span className="telemetry-label">MAGNITUDE</span>
              <span className="telemetry-value mag-badge">
                M {target.magnitude?.toFixed(1)}
              </span>
            </div>
            <div className="info-row">
              <span className="telemetry-label">LOCATION</span>
              <span className="telemetry-value highlight">{target.title}</span>
            </div>
            <div className="info-row">
              <span className="telemetry-label">DEPTH</span>
              <span className="telemetry-value">{target.depth} KM</span>
            </div>
            <div className="info-row">
              <span className="telemetry-label">TIMESTAMP</span>
              <span className="telemetry-value">
                {target.time ? new Date(target.time).toLocaleString() : 'RECENT'}
              </span>
            </div>
            {target.url && (
              <div className="info-row">
                <span className="telemetry-label">DATA LINK</span>
                <a className="telemetry-link" href={target.url} target="_blank" rel="noreferrer">
                  USGS REPORT ↗
                </a>
              </div>
            )}
          </>
        )}

        <div className="info-row">
          <span className="telemetry-label">COORDINATES</span>
          <span className="telemetry-value position">
            {target.latitude != null && target.longitude != null
              ? `${target.latitude.toFixed(2)}°, ${target.longitude.toFixed(2)}°`
              : '—'}
          </span>
        </div>
      </div>
    </div>
  )
}


