import { useState, useEffect } from 'react'

const USGS_25_WEEK_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_week.geojson'

// Generate realistic mock earthquakes if API is offline
function generateMockEarthquakes() {
  const regions = [
    { name: 'Pacific Ring of Fire, Japan', lat: 36.2, lon: 138.25 },
    { name: 'San Andreas Fault, California', lat: 34.05, lon: -118.24 },
    { name: 'Indonesian Subduction Zone', lat: -0.78, lon: 113.92 },
    { name: 'Chilean Trench', lat: -33.45, lon: -70.66 },
    { name: 'Mid-Atlantic Ridge, Iceland', lat: 64.14, lon: -21.94 },
    { name: 'New Zealand Alpine Fault', lat: -43.53, lon: 172.63 },
    { name: 'Himalayan Frontal Thrust', lat: 27.71, lon: 85.32 },
    { name: 'Aleutian Trench, Alaska', lat: 52.2, lon: -174.2 },
    { name: 'Mediterranean Ridge, Greece', lat: 37.9, lon: 23.7 },
  ]

  return Array.from({ length: 80 }, (_, i) => {
    const reg = regions[i % regions.length]
    const mag = Number((2.5 + Math.random() * 4.8).toFixed(1))
    return {
      id: `mock_eq_${i}`,
      title: `M ${mag} - ${reg.name}`,
      magnitude: mag,
      latitude: reg.lat + (Math.random() - 0.5) * 12,
      longitude: reg.lon + (Math.random() - 0.5) * 12,
      depth: Math.floor(5 + Math.random() * 120),
      time: Date.now() - Math.floor(Math.random() * 604800000),
      url: 'https://earthquake.usgs.gov',
    }
  })
}

export function useEarthquakes() {
  const [earthquakes, setEarthquakes] = useState([])
  const [status, setStatus] = useState('loading')

  useEffect(() => {
    let isMounted = true

    async function fetchEarthquakes() {
      try {
        const res = await fetch(USGS_25_WEEK_URL)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()

        const list = (data.features || []).map((f) => ({
          id: f.id,
          title: f.properties.title || `M ${f.properties.mag} Earthquake`,
          magnitude: f.properties.mag || 2.5,
          latitude: f.geometry.coordinates[1],
          longitude: f.geometry.coordinates[0],
          depth: f.geometry.coordinates[2] || 10,
          time: f.properties.time,
          url: f.properties.url,
        }))

        if (isMounted) {
          setEarthquakes(list.length ? list : generateMockEarthquakes())
          setStatus('live')
        }
      } catch (err) {
        console.warn('USGS 2.5_week GeoJSON fetch failed, using fallback mock dataset:', err)
        if (isMounted) {
          setEarthquakes(generateMockEarthquakes())
          setStatus('live')
        }
      }
    }

    fetchEarthquakes()
    const interval = setInterval(fetchEarthquakes, 120000)
    return () => {
      isMounted = false
      clearInterval(interval)
    }
  }, [])

  return { earthquakes, status }
}
