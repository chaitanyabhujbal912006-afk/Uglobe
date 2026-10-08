import { useState, useEffect } from 'react'
import { playClickSound, playTargetLockSound } from '../utils/soundEngine.js'

export default function InfoPanel({ target, onClearTarget, onFlyToTarget }) {
  if (!target) return null

  const [unitMode, setUnitMode] = useState('aviation') // 'aviation' | 'metric'
  const [copied, setCopied] = useState(false)

  // Target type detection
  const targetType = target.type || (target.noradId ? 'satellite' : target.magnitude ? 'earthquake' : 'flight')

  const updateKey = `${target.id || target.callsign || target.name}-${target.latitude?.toFixed(2)}-${target.longitude?.toFixed(2)}`

  const handleCopyCoords = () => {
    if (target.latitude != null && target.longitude != null) {
      const text = `${target.latitude.toFixed(4)}, ${target.longitude.toFixed(4)}`
      navigator.clipboard?.writeText(text)
      setCopied(true)
      playClickSound()
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Unit conversions
  const altitudeMeters = target.altitude ?? 8000
  const altitudeFeet = Math.round(altitudeMeters * 3.28084)
  const flightLevel = `FL${Math.round(altitudeFeet / 100)}`
  const velocityMs = target.velocity ?? 250
  const velocityKmh = Math.round(velocityMs * 3.6)
  const velocityKnots = Math.round(velocityMs * 1.94384)
  const machNumber = (velocityKmh / 1234.8).toFixed(2)

  // Earthquake classifications
  const mag = target.magnitude ?? 0
  const depth = target.depth ?? 10
  const quakeClass = mag >= 7.0 ? { text: 'MAJOR DESTRUCTIVE', color: 'crimson' }
    : mag >= 6.0 ? { text: 'STRONG SEISMIC', color: 'amber' }
    : mag >= 4.5 ? { text: 'MODERATE TREMOR', color: 'yellow' }
    : { text: 'MINOR TREMOR', color: 'cyan' }
  const depthClass = depth < 35 ? 'SHALLOW CRUSTAL (<35 KM)' : depth < 300 ? 'INTERMEDIATE (35-300 KM)' : 'DEEP MANTLE (>300 KM)'

  // Satellite orbit regime
  const satAlt = target.altitudeKm ?? 550
  const orbitRegime = satAlt < 2000 ? 'LEO // LOW EARTH ORBIT' : satAlt < 35000 ? 'MEO // MEDIUM ORBIT' : 'GEO // GEOSTATIONARY'

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
          <span className="radar-ping" />
          {targetType === 'flight' && '✈️ AIRCRAFT TELEMETRY'}
          {targetType === 'satellite' && '🛰️ SATELLITE TELEMETRY'}
          {targetType === 'earthquake' && '🌋 SEISMIC TELEMETRY'}
        </div>
        <div className="telemetry-header-actions">
          {targetType === 'flight' && (
            <button
              className="unit-toggle-btn"
              onClick={() => { playClickSound(); setUnitMode(unitMode === 'aviation' ? 'metric' : 'aviation') }}
              title="Toggle Aviation (Knots/FL) or Metric (km/h/m)"
            >
              {unitMode === 'aviation' ? 'FL/KTS' : 'M/KMH'}
            </button>
          )}
          {onFlyToTarget && (
            <button
              className="telemetry-act-btn fly"
              onClick={() => { playTargetLockSound(); onFlyToTarget(target) }}
              title="Fly Camera to Target"
            >
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
              <div className="callsign-group">
                <span className="telemetry-value highlight">{target.callsign || 'N/A'}</span>
                <span className={`squawk-badge ${target.squawk === '7700' ? 'emergency' : ''}`}>
                  SQ {target.squawk || '1200'}
                </span>
              </div>
            </div>
            <div className="info-row">
              <span className="telemetry-label">ORIGIN</span>
              <span className="telemetry-value">{target.originCountry || 'UNKNOWN'}</span>
            </div>
            <div className="info-row">
              <span className="telemetry-label">PHASE</span>
              <span className="flight-phase-tag">{
                (target.altitude ?? 8000) < 1500
                  ? 'TERMINAL APPROACH'
                  : (target.verticalRate ?? 0) > 1.2
                  ? 'CLIMB PROFILE'
                  : (target.verticalRate ?? 0) < -1.2
                  ? 'DESCENT PROFILE'
                  : (target.altitude ?? 8000) >= 8500
                  ? 'HIGH EN-ROUTE CRUISE'
                  : 'REGIONAL FLIGHT LEVEL'
              }</span>
            </div>
            <div className="info-row">
              <span className="telemetry-label">ALTITUDE</span>
              <span className="telemetry-value">
                {target.altitude != null
                  ? unitMode === 'aviation'
                    ? `${flightLevel} (${altitudeFeet.toLocaleString()} FT)`
                    : `${Math.round(target.altitude).toLocaleString()} M`
                  : '—'}
              </span>
            </div>
            {/* Visual Altitude Indicator Bar */}
            <div className="telemetry-alt-bar">
              <div
                className="telemetry-alt-fill"
                style={{ width: `${Math.min(100, Math.max(5, (altitudeMeters / 14000) * 100))}%` }}
              />
            </div>
            <div className="info-row">
              <span className="telemetry-label">VERT SPEED</span>
              <span className={`vrate-badge ${(target.verticalRate ?? 0) > 1.2 ? 'climb' : (target.verticalRate ?? 0) < -1.2 ? 'descend' : 'level'}`}>
                {(target.verticalRate ?? 0) > 1.2
                  ? `▲ +${Math.round(Math.abs(target.verticalRate * 196.85))} FPM`
                  : (target.verticalRate ?? 0) < -1.2
                  ? `▼ -${Math.round(Math.abs(target.verticalRate * 196.85))} FPM`
                  : '► LEVEL (0 FPM)'}
              </span>
            </div>
            <div className="info-row">
              <span className="telemetry-label">VELOCITY</span>
              <span className="telemetry-value">
                {target.velocity != null
                  ? unitMode === 'aviation'
                    ? `${velocityKnots} KTS (M ${machNumber})`
                    : `${velocityKmh.toLocaleString()} KM/H`
                  : '—'}
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
              <span className="telemetry-label">REGIME</span>
              <span className="telemetry-value regime">{orbitRegime}</span>
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
              <span className="telemetry-value">
                {target.velocityKmS} KM/S ({Math.round((target.velocityKmS || 7.6) * 3600).toLocaleString()} KM/H)
              </span>
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
              <div className="mag-container">
                <span className="telemetry-value mag-badge">M {target.magnitude?.toFixed(1)}</span>
                <span className={`quake-tag ${quakeClass.color}`}>{quakeClass.text}</span>
              </div>
            </div>
            <div className="info-row">
              <span className="telemetry-label">LOCATION</span>
              <span className="telemetry-value highlight">{target.title}</span>
            </div>
            <div className="info-row">
              <span className="telemetry-label">DEPTH</span>
              <span className="telemetry-value">{target.depth} KM <span className="depth-tag">({depthClass})</span></span>
            </div>
            <div className="info-row">
              <span className="telemetry-label">TIMESTAMP</span>
              <span className="telemetry-value">
                {target.time ? new Date(target.time).toLocaleString() : 'RECENT'}
              </span>
            </div>
            {target.url && (
              <div className="info-row">
                <span className="telemetry-label">REPORT</span>
                <a className="telemetry-link" href={target.url} target="_blank" rel="noreferrer">
                  USGS SEISMOLOGY ↗
                </a>
              </div>
            )}
          </>
        )}

        <div className="info-row coords-footer">
          <span className="telemetry-label">COORDINATES</span>
          <div className="coords-action-group">
            <span className="telemetry-value position">
              {target.latitude != null && target.longitude != null
                ? `${target.latitude.toFixed(2)}°, ${target.longitude.toFixed(2)}°`
                : '—'}
            </span>
            <button className="copy-coords-btn" onClick={handleCopyCoords} title="Copy coordinates">
              {copied ? '✓ COPIED' : '📋 COPY'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
