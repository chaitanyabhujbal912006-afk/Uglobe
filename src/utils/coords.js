/**
 * Converts geographic coordinates (latitude/longitude in degrees) into a
 * 3D position on the surface of a sphere of the given radius, using the
 * standard spherical-to-cartesian conversion.
 *
 * This is the single most important piece of math in the whole project —
 * every plotted point (planes, cities, arcs) goes through this function.
 */
export function latLongToVector3(latDeg, lonDeg, radius) {
  const latRad = (latDeg * Math.PI) / 180
  const lonRad = (-lonDeg * Math.PI) / 180 // negative: matches standard texture UV orientation

  const x = radius * Math.cos(latRad) * Math.cos(lonRad)
  const y = radius * Math.sin(latRad)
  const z = radius * Math.cos(latRad) * Math.sin(lonRad)

  return { x, y, z }
}
