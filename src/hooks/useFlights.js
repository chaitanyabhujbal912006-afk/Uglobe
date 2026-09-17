import { useEffect, useRef, useState } from 'react'

// Routed through Vite's dev-server proxy → https://opensky-network.org/api/states/all
// This avoids the CORS block that rejects direct browser fetches to opensky-network.org
const OPENSKY_URL = '/api/opensky/states/all'
const REFRESH_INTERVAL_MS = 45_000 // OpenSky anonymous tier: don't poll faster than this

/**
 * OpenSky returns each aircraft as a positional array, not an object.
 * This is the documented index order for /api/states/all.
 */
function parseStateVector(state) {
  const [
    icao24,
    callsign,
    originCountry,
    _timePosition,
    _lastContact,
    longitude,
    latitude,
    baroAltitude,
    onGround,
    velocity,
    trueTrack,
  ] = state

  return {
    id: icao24,
    callsign: callsign ? callsign.trim() : 'UNKNOWN',
    originCountry,
    longitude,
    latitude,
    altitude: baroAltitude,
    onGround,
    velocity,
    heading: trueTrack,
  }
}

/**
 * Polls OpenSky for live flight positions. On failure (rate limit, network
 * error, API downtime — all of which happen regularly with this free API),
 * keeps showing the last successfully fetched data instead of clearing the
 * globe, and reports status so the UI can show a clear "reconnecting" state.
 */
export function useFlights() {
  const [flights, setFlights] = useState([])
  const [status, setStatus] = useState('loading') // 'loading' | 'live' | 'error'
  const [lastUpdated, setLastUpdated] = useState(null)
  const hasLoadedOnce = useRef(false)

  useEffect(() => {
    let cancelled = false
    let timeoutId

    async function fetchFlights() {
      try {
        if (!hasLoadedOnce.current) {
          setStatus('loading')
        }

        const response = await fetch(OPENSKY_URL)

        if (!response.ok) {
          throw new Error(`OpenSky responded with ${response.status}`)
        }

        const data = await response.json()
        const states = data.states || []

        const parsed = states
          .map(parseStateVector)
          .filter(
            (f) =>
              typeof f.latitude === 'number' &&
              typeof f.longitude === 'number' &&
              !f.onGround
          )

        if (!cancelled) {
          setFlights(parsed)
          setStatus('live')
          setLastUpdated(new Date())
          hasLoadedOnce.current = true
        }
      } catch (err) {
        console.error('[useFlights] fetch failed:', err.message)
        if (!cancelled) {
          // Keep showing whatever data we already have — don't blank the globe
          setStatus('error')
        }
      } finally {
        if (!cancelled) {
          timeoutId = setTimeout(fetchFlights, REFRESH_INTERVAL_MS)
        }
      }
    }

    fetchFlights()

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [])

  return { flights, status, lastUpdated }
}
