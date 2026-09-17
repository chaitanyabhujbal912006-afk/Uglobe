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
