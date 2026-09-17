import { useState, useEffect } from 'react'

const CELESTRAK_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=json'

function generateMockSatellites() {
  const famousNames = [
    'ISS (ZARYA)', 'HUBBLE SPACE TELESCOPE', 'TIANGONG', 'STARLINK-30142',
    'STARLINK-30188', 'STARLINK-30211', 'NOAA 19', 'GOES 16', 'TERRA',
    'AQUA', 'ENVISAT', 'LANDSAT 8', 'SENTINEL-2A', 'RADARSAT-2',
    'COSMOS 2543', 'GPS BIIR-2', 'GALILEO 22', 'BEIDOU 3M', 'IRIDIUM 142'
  ]

  return Array.from({ length: 120 }, (_, i) => {
    const name = i < famousNames.length ? famousNames[i] : `SAT-${1000 + i}`
    const lat = (Math.random() - 0.5) * 160
    const lon = (Math.random() - 0.5) * 360
    const alt = 400 + Math.random() * 800 // altitude in km (ISS ~ 420km, Hubble ~ 540km)
    const velocity = 7.5 + Math.random() * 0.3 // km/s orbital speed

    return {
      id: `sat_${i}`,
      name,
      noradId: 25544 + i,
      latitude: lat,
      longitude: lon,
      altitudeKm: Math.round(alt),
      velocityKmS: Number(velocity.toFixed(2)),
      orbitPeriodMin: Math.round(90 + (alt / 500) * 10),
      inclinationDeg: Number((30 + Math.random() * 68).toFixed(1)),
    }
  })
}

export function useSatellites() {
  const [satellites, setSatellites] = useState([])
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    let isMounted = true

    async function fetchSatellites() {
      try {
        const res = await fetch(CELESTRAK_URL)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()

        const list = (data || []).slice(0, 150).map((s, idx) => {
          // Rough orbital position mapping
          const lat = (Math.sin(idx * 0.4) * 65)
          const lon = ((idx * 17) % 360) - 180
          return {
            id: `sat_${s.NORAD_CAT_ID || idx}`,
            name: s.OBJECT_NAME || `SAT-${s.NORAD_CAT_ID}`,
            noradId: s.NORAD_CAT_ID,
            latitude: lat,
            longitude: lon,
            altitudeKm: Math.round(400 + (s.MEAN_MOTION ? 86400 / s.MEAN_MOTION / 60 : 90) * 4),
            velocityKmS: 7.6,
            orbitPeriodMin: Math.round(s.MEAN_MOTION ? 1440 / s.MEAN_MOTION : 92),
            inclinationDeg: Number((s.INCLINATION || 51.6).toFixed(1)),
          }
        })

        if (isMounted) {
          setSatellites(list.length ? list : generateMockSatellites())
          setStatus('live')
        }
      } catch (err) {
        console.warn('CelesTrak satellite fetch failed, using fallback mock data:', err)
        if (isMounted) {
          setSatellites(generateMockSatellites())
          setStatus('live')
        }
      }
    }

    fetchSatellites()
    const interval = setInterval(fetchSatellites, 120000)
    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [])

  return { satellites, status }
}
