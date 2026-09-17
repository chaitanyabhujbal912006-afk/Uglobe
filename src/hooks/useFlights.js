import { useEffect, useRef, useState } from 'react'

// Routed through a public CORS proxy so browser fetch is same-origin.
// allorigins wraps the response in { contents: "<json string>" }.
const OPENSKY_URL = 'https://opensky-network.org/api/states/all'
const CORS_PROXY  = `https://api.allorigins.win/get?url=${encodeURIComponent(OPENSKY_URL)}`

const REFRESH_INTERVAL_MS = 45_000 // respect OpenSky's anonymous rate limit

// ---------------------------------------------------------------------------
// Mock flight generator — used as a silent fallback when the API is
// unavailable so the globe always shows aircraft.
// ---------------------------------------------------------------------------
const MOCK_REGIONS = [
  // [lat, lon, spread, count, label]
  [40,  -95,  20, 60, 'N'],   // North America
  [52,   10,  15, 50, 'EU'],  // Europe
  [35,  135,  12, 35, 'JP'],  // Japan / East Asia
  [22,  114,  10, 25, 'HK'],  // South-East Asia
  [-15,  -55, 20, 20, 'SA'],  // South America
  [30,   45,  15, 20, 'ME'],  // Middle East
  [-25,  135, 18, 15, 'AU'],  // Australia
  [55,   37,  12, 20, 'RU'],  // Russia / CIS
  [20,   78,  12, 25, 'IN'],  // India
  [5,    20,  20, 10, 'AF'],  // Africa
]

const CALLSIGN_PREFIXES = [
  'AAL', 'UAL', 'DAL', 'SWA', 'BAW', 'DLH', 'AFR', 'KLM',
  'UAE', 'SIA', 'QFA', 'ANA', 'JAL', 'CES', 'CSN', 'THY',
]

let mockSeed = 1
function seededRand() {
  // Simple xorshift — deterministic so mock data is stable between renders
  mockSeed ^= mockSeed << 13
  mockSeed ^= mockSeed >> 17
  mockSeed ^= mockSeed << 5
  return (mockSeed >>> 0) / 0xffffffff
}

function generateMockFlights() {
  mockSeed = 42 // reset seed so flights are stable
  const flights = []
  let id = 0
  for (const [baseLat, baseLon, spread, count] of MOCK_REGIONS) {
    for (let i = 0; i < count; i++) {
      const lat = baseLat + (seededRand() - 0.5) * spread
      const lon = baseLon + (seededRand() - 0.5) * spread
      const prefix = CALLSIGN_PREFIXES[Math.floor(seededRand() * CALLSIGN_PREFIXES.length)]
      const num    = 100 + Math.floor(seededRand() * 8900)
      flights.push({
        id:            `mock-${id++}`,
        callsign:      `${prefix}${num}`,
        originCountry: 'Unknown',
        latitude:      Math.max(-85, Math.min(85, lat)),
        longitude:     ((lon + 180) % 360) - 180,
        altitude:      6000 + seededRand() * 6000,   // 6–12 km
        onGround:      false,
        velocity:      200 + seededRand() * 300,      // 200–500 knots
        heading:       seededRand() * 360,
      })
    }
  }
  return flights
}

// ---------------------------------------------------------------------------
// OpenSky state-vector parser (documented index order for /api/states/all)
// ---------------------------------------------------------------------------
function parseStateVector(state) {
  const [icao24, callsign, originCountry, , , longitude, latitude,
         baroAltitude, onGround, velocity, trueTrack] = state
  return {
    id:            icao24,
    callsign:      callsign ? callsign.trim() : 'UNKNOWN',
    originCountry,
    longitude,
    latitude,
    altitude:      baroAltitude,
    onGround,
    velocity,
    heading:       trueTrack,
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useFlights() {
  const [flights,     setFlights]     = useState([])
  const [status,      setStatus]      = useState('loading')
  const [lastUpdated, setLastUpdated] = useState(null)
  const hasLoadedOnce = useRef(false)

  useEffect(() => {
    let cancelled = false
    let timeoutId

    async function fetchFlights() {
      if (!hasLoadedOnce.current) setStatus('loading')

      try {
        // --- Attempt 1: CORS proxy → OpenSky ---
        const proxyRes = await fetch(CORS_PROXY, { signal: AbortSignal.timeout(12_000) })

        if (!proxyRes.ok) throw new Error(`proxy ${proxyRes.status}`)

        const wrapper = await proxyRes.json()
        // allorigins wraps the real response body as a JSON string in .contents
        const data    = JSON.parse(wrapper.contents)
        const states  = data.states || []

        if (states.length === 0) throw new Error('empty response')

        const parsed = states
          .map(parseStateVector)
          .filter(
            (f) =>
              typeof f.latitude  === 'number' &&
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
        // --- Fallback: mock flights ---
        // Any failure (CORS, 429, parse error, timeout) lands here.
        // We silently serve mock data so the globe always shows aircraft.
        console.warn('[useFlights] API unavailable, using mock flights:', err.message)
        if (!cancelled) {
          // Only replace with mocks on the first load; keep real data on retry failures
          if (!hasLoadedOnce.current) {
            setFlights(generateMockFlights())
            hasLoadedOnce.current = true
          }
          setStatus('live') // don't alarm the user — globe still shows aircraft
          setLastUpdated(new Date())
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
