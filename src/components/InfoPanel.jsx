export default function InfoPanel({ flight }) {
  if (!flight) return null

  return (
    <div className="info-panel">
      <h3>{flight.callsign}</h3>
      <div className="info-row">
        <span>Origin</span>
        <span>{flight.originCountry || 'Unknown'}</span>
      </div>
      <div className="info-row">
        <span>Altitude</span>
        <span>{flight.altitude != null ? `${Math.round(flight.altitude)} m` : '—'}</span>
      </div>
      <div className="info-row">
        <span>Speed</span>
        <span>{flight.velocity != null ? `${Math.round(flight.velocity * 3.6)} km/h` : '—'}</span>
      </div>
      <div className="info-row">
        <span>Heading</span>
        <span>{flight.heading != null ? `${Math.round(flight.heading)}°` : '—'}</span>
      </div>
      <div className="info-row">
        <span>Position</span>
        <span>
          {flight.latitude.toFixed(2)}, {flight.longitude.toFixed(2)}
        </span>
      </div>
    </div>
  )
}
