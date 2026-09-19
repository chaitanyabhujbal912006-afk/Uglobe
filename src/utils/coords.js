import * as THREE from 'three'

/**
 * Converts geographic coordinates (latitude/longitude in degrees) into a
 * 3D position on the surface of a sphere of the given radius.
 *
 * @param {number} latDeg - Latitude in degrees (-90 to +90)
 * @param {number} lonDeg - Longitude in degrees (-180 to +180)
 * @param {number} radius - Sphere radius
 * @param {number} altitude - Height offset above surface
 * @returns {THREE.Vector3}
 */
export function latLongToVector3(latDeg, lonDeg, radius, altitude = 0) {
  const latRad = (latDeg * Math.PI) / 180
  const lonRad = (-lonDeg * Math.PI) / 180

  const r = radius + altitude
  const x = r * Math.cos(latRad) * Math.cos(lonRad)
  const y = r * Math.sin(latRad)
  const z = r * Math.cos(latRad) * Math.sin(lonRad)

  return new THREE.Vector3(x, y, z)
}

/**
 * Calculates the Great Circle distance between two geographic coordinates in kilometers, miles, and nautical miles.
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {{ km: number, miles: number, nauticalMiles: number }}
 */
export function calculateGreatCircleDistance(lat1, lon1, lat2, lon2) {
  const EARTH_RADIUS_KM = 6371.0088
  const toRad = Math.PI / 180

  const dLat = (lat2 - lat1) * toRad
  const dLon = (lon2 - lon1) * toRad

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const km = EARTH_RADIUS_KM * c
  const miles = km * 0.621371
  const nauticalMiles = km * 0.539957

  return {
    km: Math.round(km),
    miles: Math.round(miles),
    nauticalMiles: Math.round(nauticalMiles),
  }
}

