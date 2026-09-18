import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { latLongToVector3 } from '../utils/coords.js'
import { playTargetLockSound } from '../utils/soundEngine.js'


// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const GLOBE_RADIUS = 2
const EARTH_DAY_URL =
  'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_atmos_2048.jpg'
const EARTH_NIGHT_URL =
  'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_lights_2048.png'

const SUN_DIR        = new THREE.Vector3(5, 3, 5).normalize()
const CAMERA_DEFAULT = new THREE.Vector3(0, 0, 6)
const RESET_DURATION = 1.5
const MAX_INSTANCES  = 15000
const TRAIL_ANGLE    = 0.055 // arc radians backward along heading (~3.1° on globe surface)

// ---------------------------------------------------------------------------
// Heading quaternion helpers (module-level, no allocations in hot path)
// ---------------------------------------------------------------------------
const _Y      = new THREE.Vector3(0, 1, 0)
const _hNorth = new THREE.Vector3()
const _hEast  = new THREE.Vector3()
const _hDir   = new THREE.Vector3()
const _hPos   = new THREE.Vector3()

/**
 * Rotate a geometry-default +Y axis to lie flat on the globe surface pointing
 * in the given compass heading.
 *
 * Coordinate system (coords.js):
 *   x = cos(lat)*cos(-lon)   y = sin(lat)   z = cos(lat)*sin(-lon)
 * → North pole = +Y.  North tangent = normalize(Y - (Y·p̂)p̂).
 * → East tangent = cross(p̂, north)  [negated-lon makes this genuinely east]
 */
function computeHeadingQuat(lat, lon, headingDeg, out) {
  const { x, y, z } = latLongToVector3(lat, lon, 1)
  _hPos.set(x, y, z)

  const dot = _Y.dot(_hPos)
  _hNorth.copy(_Y).addScaledVector(_hPos, -dot)

  if (_hNorth.lengthSq() < 1e-8) {
    _hNorth.set(1, 0, 0)
  } else {
    _hNorth.normalize()
  }

  _hEast.crossVectors(_hPos, _hNorth)

  const rad = (headingDeg || 0) * (Math.PI / 180)
  _hDir
    .copy(_hNorth).multiplyScalar(Math.cos(rad))
    .addScaledVector(_hEast, Math.sin(rad))
    .normalize()

  out.setFromUnitVectors(_Y, _hDir)
}

// ---------------------------------------------------------------------------
// Altitude → Complex 4-Band Data Gradient
//   0 – 4,000 m     → Vibrant Orange (20°)  to  Neon Green (140°)
//   4,000 – 8,000 m → Neon Green (140°)     to  Electric Cyan (190°)
//   8,000 – 12,000+m→ Electric Cyan (190°)  to  Deep Sapphire Blue (225°)
// ---------------------------------------------------------------------------
const _altColor = new THREE.Color()
function altitudeToColor(altMeters) {
  const a = altMeters ?? 8000
  const t = Math.max(0, Math.min(1, a / 12000))

  let hueDeg
  if (t < 0.33) {
    // 0 to 4,000m: Vibrant Orange (20°) → Green (140°)
    const k = t / 0.33
    hueDeg = 20 + k * (140 - 20)
  } else if (t < 0.66) {
    // 4,000m to 8,000m: Green (140°) → Electric Cyan (190°)
    const k = (t - 0.33) / 0.33
    hueDeg = 140 + k * (190 - 140)
  } else {
    // 8,000m to 12,000m+: Electric Cyan (190°) → Deep Sapphire Blue (225°)
    const k = Math.min(1, (t - 0.66) / 0.34)
    hueDeg = 190 + k * (225 - 190)
  }

  _altColor.setHSL(hueDeg / 360, 1.0, 0.55)
  // Push luminance above bloom threshold for genuine HDR glow
  _altColor.multiplyScalar(2.5)
  return _altColor
}

// ---------------------------------------------------------------------------
// Reusable scratch objects (avoid per-frame allocations)
// ---------------------------------------------------------------------------
const _mat       = new THREE.Matrix4()
const _pos       = new THREE.Vector3()
const _quat      = new THREE.Quaternion()
const _scale     = new THREE.Vector3()
const _color     = new THREE.Color()
const _origin    = new THREE.Vector3()
const _trailAxis = new THREE.Vector3()
const _trailNorm = new THREE.Vector3()
const _trailQRot = new THREE.Quaternion()

/**
 * Creates a sleek low-poly paper airplane BufferGeometry.
 * +Y points toward the nose (flight heading), +Z is outward from globe surface.
 */
function createPaperAirplaneGeometry() {
  const geom = new THREE.BufferGeometry()

  const nose      = [0,      0.016,  0.0005]
  const leftWing  = [-0.008, -0.012, 0.002]
  const rightWing = [0.008,  -0.012, 0.002]
  const spine     = [0,      -0.010, 0.0005]
  const keel      = [0,      -0.006, -0.003]

  // 4 Triangles (12 vertices total)
  const positions = new Float32Array([
    // Top Left Wing
    ...nose, ...leftWing, ...spine,
    // Top Right Wing
    ...nose, ...spine, ...rightWing,
    // Bottom Left Keel
    ...nose, ...keel, ...leftWing,
    // Bottom Right Keel
    ...nose, ...rightWing, ...keel,
  ])

  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geom.computeVertexNormals()
  return geom
}

// Major global flight routes for 3D Arcs
const MAJOR_ROUTES = [
  { from: [51.5074, -0.1278],  to: [40.7128, -74.0060] },  // London ↔ NYC
  { from: [35.6762, 139.6503], to: [34.0522, -118.2437] }, // Tokyo ↔ LA
  { from: [25.2048, 55.2708],  to: [1.3521, 103.8198] },   // Dubai ↔ Singapore
  { from: [-33.8688, 151.2093],to: [1.3521, 103.8198] },   // Sydney ↔ Singapore
  { from: [48.8566, 2.3522],   to: [25.2048, 55.2708] },   // Paris ↔ Dubai
  { from: [22.3193, 114.1694], to: [37.7749, -122.4194] }, // Hong Kong ↔ SF
  { from: [-23.5505, -46.6333],to: [40.7128, -74.0060] },  // São Paulo ↔ NYC
  { from: [51.5074, -0.1278],  to: [25.2048, 55.2708] },   // London ↔ Dubai
  { from: [35.6762, 139.6503], to: [51.5074, -0.1278] },   // Tokyo ↔ London
  { from: [1.3521, 103.8198],  to: [51.5074, -0.1278] },   // Singapore ↔ London
  { from: [19.0760, 72.8777],  to: [51.5074, -0.1278] },   // Mumbai ↔ London
  { from: [37.5665, 126.9780], to: [37.7749, -122.4194] }, // Seoul ↔ SF
]

/**
 * Calculates 3D Quadratic Bézier curves over the sphere's surface.
 * Uses spherical linear interpolation (slerp) to calculate the peak height
 * of the arc based on the angular distance between the two points.
 * Returns a single THREE.LineSegments geometry built from a flat Float32Array.
 */
function create3DArcLines(radius) {
  const segmentsPerArc = 48
  const totalArcs = MAJOR_ROUTES.length
  // Each arc segment has 2 vertices, each vertex has 3 floats (x, y, z)
  const verticesArray = new Float32Array(totalArcs * segmentsPerArc * 2 * 3)
  let attrIdx = 0

  const v1 = new THREE.Vector3()
  const v2 = new THREE.Vector3()
  const u1 = new THREE.Vector3()
  const u2 = new THREE.Vector3()
  const midNorm = new THREE.Vector3()
  const control = new THREE.Vector3()
  const currPt = new THREE.Vector3()
  const prevPt = new THREE.Vector3()

  MAJOR_ROUTES.forEach((route) => {
    // 1. Convert lat/lon to 3D Cartesian points on sphere
    const p1 = latLongToVector3(route.from[0], route.from[1], radius * 1.008)
    const p2 = latLongToVector3(route.to[0], route.to[1], radius * 1.008)
    v1.copy(p1)
    v2.copy(p2)

    // 2. Compute angular distance & slerp direction vector for peak height
    u1.copy(v1).normalize()
    u2.copy(v2).normalize()
    const dot = Math.max(-1, Math.min(1, u1.dot(u2)))
    const angleRad = Math.acos(dot)

    // Spherical linear interpolation midpoint (t = 0.5) for peak control vector
    midNorm.addVectors(u1, u2).normalize()

    // Peak height scales dynamically based on slerp angular distance
    const peakAltitude = radius + Math.min(angleRad * 0.75, 1.4)
    control.copy(midNorm).multiplyScalar(peakAltitude)

    // 3. Sample 3D Quadratic Bézier curve through (v1, control, v2)
    const curve = new THREE.QuadraticBezierCurve3(v1, control, v2)

    for (let i = 0; i <= segmentsPerArc; i++) {
      const t = i / segmentsPerArc
      curve.getPoint(t, currPt)

      if (i > 0) {
        // Line segment: start vertex
        verticesArray[attrIdx++] = prevPt.x
        verticesArray[attrIdx++] = prevPt.y
        verticesArray[attrIdx++] = prevPt.z

        // Line segment: end vertex
        verticesArray[attrIdx++] = currPt.x
        verticesArray[attrIdx++] = currPt.y
        verticesArray[attrIdx++] = currPt.z
      }
      prevPt.copy(currPt)
    }
  })

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(verticesArray, 3))
  return geo
}

/**
 * Parses GeoJSON landmass boundaries (Polygon & MultiPolygon) into 3D Vector3 points
 * and returns a THREE.BufferGeometry for wireframe rendering via THREE.LineSegments.
 */
function parseGeoJSONToLines(geojson, radius) {
  const positions = []

  function processPolygon(coordinates) {
    coordinates.forEach((ring) => {
      for (let i = 0; i < ring.length - 1; i++) {
        const [lon1, lat1] = ring[i]
        const [lon2, lat2] = ring[i + 1]

        const p1 = latLongToVector3(lat1, lon1, radius)
        const p2 = latLongToVector3(lat2, lon2, radius)

        positions.push(p1.x, p1.y, p1.z)
        positions.push(p2.x, p2.y, p2.z)
      }
    })
  }

  if (geojson.type === 'FeatureCollection') {
    geojson.features.forEach((feature) => {
      if (feature.geometry) {
        if (feature.geometry.type === 'Polygon') {
          processPolygon(feature.geometry.coordinates)
        } else if (feature.geometry.type === 'MultiPolygon') {
          feature.geometry.coordinates.forEach((polyCoords) => {
            processPolygon(polyCoords)
          })
        }
      }
    })
  } else if (geojson.type === 'Polygon') {
    processPolygon(geojson.coordinates)
  } else if (geojson.type === 'MultiPolygon') {
    geojson.coordinates.forEach((polyCoords) => {
      processPolygon(polyCoords)
    })
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  return geometry
}

// ---------------------------------------------------------------------------
// Real-time solar position calculator (declination & UTC hour angle)
// ---------------------------------------------------------------------------
function getSolarDirection() {
  const now = new Date()
  const startOfYear = new Date(now.getFullYear(), 0, 0)
  const diff = now - startOfYear
  const oneDay = 1000 * 60 * 60 * 24
  const dayOfYear = Math.floor(diff / oneDay)

  const declination = -23.44 * Math.cos((2 * Math.PI / 365) * (dayOfYear + 10)) * (Math.PI / 180)
  const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60
  const lonRad = ((12 - utcHours) * 15) * (Math.PI / 180)

  const x = Math.cos(declination) * Math.cos(lonRad)
  const y = Math.sin(declination)
  const z = Math.cos(declination) * Math.sin(-lonRad)
  return new THREE.Vector3(x, y, z).normalize()
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function Globe({
  flights = [],
  earthquakes = [],
  satellites = [],
  activeLayer = 'all',
  filterQuery = '',
  minAltitude = 0,
  maxAltitude = 20000,
  minMagnitude = 0,
  renderMode = 'grid', // 'grid' | 'solar' | 'night'
  cinematicMode = false,
  selectedTarget = null,
  onSelectTarget,
  onResetReady,
  onFlyToTargetReady,
}) {
  const containerRef       = useRef(null)
  const flightsRef         = useRef(flights)
  const earthquakesRef     = useRef(earthquakes)
  const satellitesRef      = useRef(satellites)
  const activeLayerRef     = useRef(activeLayer)
  const filterQueryRef     = useRef(filterQuery)
  const minAltitudeRef     = useRef(minAltitude)
  const maxAltitudeRef     = useRef(maxAltitude)
  const minMagnitudeRef    = useRef(minMagnitude)
  const renderModeRef      = useRef(renderMode)
  const cinematicModeRef   = useRef(cinematicMode)

  const visibleFlightsRef    = useRef([])
  const visibleSatellitesRef = useRef([])
  const visibleEarthquakesRef= useRef([])

  const instancedMeshRef   = useRef(null)
  const satellitesMeshRef  = useRef(null)
  const earthquakesMeshRef = useRef(null)
  const arcsMeshRef        = useRef(null)
  const selectionRingRef   = useRef(null)
  const trailGeoRef        = useRef(null)
  const trailMatRef        = useRef(null)
  const globeGroupRef      = useRef(null)
  const cameraRef          = useRef(null)
  const controlsRef        = useRef(null)
  const earthMatRef        = useRef(null)

  const flyToStateRef      = useRef(null)

  useEffect(() => {
    flightsRef.current      = flights
    earthquakesRef.current  = earthquakes
    satellitesRef.current   = satellites
    activeLayerRef.current  = activeLayer
    filterQueryRef.current  = filterQuery
    minAltitudeRef.current  = minAltitude
    maxAltitudeRef.current  = maxAltitude
    minMagnitudeRef.current = minMagnitude
    renderModeRef.current   = renderMode
    cinematicModeRef.current= cinematicMode
    updateMarkers()
  }, [flights, earthquakes, satellites, activeLayer, filterQuery, minAltitude, maxAltitude, minMagnitude, renderMode, cinematicMode])

  useEffect(() => {
    if (selectedTarget) {
      positionSelectionRingForTarget(selectedTarget)
    } else if (selectionRingRef.current) {
      selectionRingRef.current.visible = false
    }
  }, [selectedTarget])

  // -------------------------------------------------------------------------
  // updateMarkers — updates 3D meshes & populates visible target index arrays
  // -------------------------------------------------------------------------
  function updateMarkers() {
    const layer = activeLayerRef.current
    const showFlights = layer === 'all' || layer === 'flights'
    const showSats    = layer === 'all' || layer === 'satellites'
    const showEqs     = layer === 'all' || layer === 'earthquakes'

    const minAlt = minAltitudeRef.current
    const maxAlt = maxAltitudeRef.current
    const minMag = minMagnitudeRef.current
    const query  = (filterQueryRef.current || '').toLowerCase().trim()

    // --- 1. Flights & Trails ---
    const mesh = instancedMeshRef.current
    if (mesh) {
      const currentFlights = flightsRef.current
      const filtered = showFlights
        ? currentFlights.filter((f) => {
            const alt = f.altitude ?? 8000
            if (alt < minAlt || alt > maxAlt) return false
            if (!query) return true
            return (
              (f.callsign || '').toLowerCase().includes(query) ||
              (f.originCountry || '').toLowerCase().includes(query)
            )
          })
        : []

      visibleFlightsRef.current = filtered
      const n = Math.min(filtered.length, MAX_INSTANCES)
      mesh.count = n

      const trailGeo = trailGeoRef.current
      const tPos = trailGeo?.attributes?.position?.array
      const tCol = trailGeo?.attributes?.aColor?.array
      const tAlp = trailGeo?.attributes?.aAlpha?.array

      for (let i = 0; i < n; i++) {
        const f = filtered[i]
        const raw = latLongToVector3(f.latitude, f.longitude, GLOBE_RADIUS * 1.012)
        _pos.set(raw.x, raw.y, raw.z)

        computeHeadingQuat(f.latitude, f.longitude, f.heading ?? 0, _quat)
        _scale.set(1, 1, 1)
        _mat.compose(_pos, _quat, _scale)
        mesh.setMatrixAt(i, _mat)

        altitudeToColor(f.altitude)
        const tr = _altColor.r, tg = _altColor.g, tb = _altColor.b
        mesh.setColorAt(i, _altColor)

        if (tPos) {
          const v0 = i * 2
          const v1 = i * 2 + 1

          tPos[v0 * 3] = _pos.x; tPos[v0 * 3 + 1] = _pos.y; tPos[v0 * 3 + 2] = _pos.z
          tAlp[v0] = 1.0

          _trailAxis.crossVectors(_hPos, _hDir).normalize()
          _trailQRot.setFromAxisAngle(_trailAxis, -TRAIL_ANGLE)
          _trailNorm.copy(_hPos).applyQuaternion(_trailQRot)
          const R = GLOBE_RADIUS * 1.012
          tPos[v1 * 3] = _trailNorm.x * R; tPos[v1 * 3 + 1] = _trailNorm.y * R; tPos[v1 * 3 + 2] = _trailNorm.z * R
          tAlp[v1] = 0.0

          tCol[v0 * 3] = tr; tCol[v0 * 3 + 1] = tg; tCol[v0 * 3 + 2] = tb
          tCol[v1 * 3] = tr; tCol[v1 * 3 + 1] = tg; tCol[v1 * 3 + 2] = tb
        }
      }

      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true

      if (trailGeo && tPos) {
        trailGeo.attributes.position.needsUpdate = true
        trailGeo.attributes.aColor.needsUpdate   = true
        trailGeo.attributes.aAlpha.needsUpdate   = true
        trailGeo.setDrawRange(0, n * 2)
      }
    }

    // --- 2. 3D Great-Circle Arcs ---
    if (arcsMeshRef.current) {
      arcsMeshRef.current.visible = showFlights
    }

    // --- 3. Satellites (Orbital Altitude) ---
    const satMesh = satellitesMeshRef.current
    if (satMesh) {
      const currentSats = satellitesRef.current
      const filtered = showSats
        ? currentSats.filter((s) => {
            if (!query) return true
            return (
              (s.name || '').toLowerCase().includes(query) ||
              String(s.noradId || '').includes(query)
            )
          })
        : []

      visibleSatellitesRef.current = filtered
      const nSat = Math.min(filtered.length, 300)
      satMesh.count = nSat

      for (let i = 0; i < nSat; i++) {
        const s = filtered[i]
        const rOrbit = GLOBE_RADIUS * (1.16 + (s.altitudeKm / 3500))
        const raw = latLongToVector3(s.latitude, s.longitude, rOrbit)
        _pos.set(raw.x, raw.y, raw.z)
        _quat.identity()
        _scale.setScalar(1.0)
        _mat.compose(_pos, _quat, _scale)
        satMesh.setMatrixAt(i, _mat)

        _color.setHSL(0.52 + (i % 4) * 0.1, 1.0, 0.7).multiplyScalar(2.5)
        satMesh.setColorAt(i, _color)
      }
      satMesh.instanceMatrix.needsUpdate = true
      if (satMesh.instanceColor) satMesh.instanceColor.needsUpdate = true
    }

    // --- 4. Earthquakes ---
    const eqMesh = earthquakesMeshRef.current
    if (eqMesh) {
      const currentEqs = earthquakesRef.current
      const filtered = showEqs
        ? currentEqs.filter((eq) => {
            if (eq.magnitude < minMag) return false
            if (!query) return true
            return (eq.title || '').toLowerCase().includes(query)
          })
        : []

      visibleEarthquakesRef.current = filtered
      const nEq = Math.min(filtered.length, 100)
      eqMesh.count = nEq

      for (let i = 0; i < nEq; i++) {
        const eq = filtered[i]
        const raw = latLongToVector3(eq.latitude, eq.longitude, GLOBE_RADIUS * 1.004)
        _pos.set(raw.x, raw.y, raw.z)
        _hPos.set(raw.x, raw.y, raw.z).normalize()
        _quat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _hPos)

        const magScale = 0.6 + Math.min(eq.magnitude, 8) * 0.35
        _scale.set(magScale, magScale, magScale)
        _mat.compose(_pos, _quat, _scale)
        eqMesh.setMatrixAt(i, _mat)

        const tMag = Math.min(1, Math.max(0, (eq.magnitude - 2.5) / 5.0))
        _color.setHSL(0.14 - tMag * 0.14, 1.0, 0.55).multiplyScalar(2.5)
        eqMesh.setColorAt(i, _color)
      }
      eqMesh.instanceMatrix.needsUpdate = true
      if (eqMesh.instanceColor) eqMesh.instanceColor.needsUpdate = true
    }

    if (selectedTarget) {
      positionSelectionRingForTarget(selectedTarget)
    }
  }

  // -------------------------------------------------------------------------
  // positionSelectionRingForTarget — position target lock reticle ring
  // -------------------------------------------------------------------------
  function positionSelectionRingForTarget(target) {
    const ring = selectionRingRef.current
    if (!ring || !target || target.latitude == null || target.longitude == null) {
      if (ring) ring.visible = false
      return
    }

    let r = GLOBE_RADIUS * 1.013
    if (target.type === 'satellite' || target.noradId) {
      r = GLOBE_RADIUS * (1.16 + ((target.altitudeKm || 500) / 3500))
    } else if (target.type === 'earthquake' || target.magnitude) {
      r = GLOBE_RADIUS * 1.005
    }

    const raw = latLongToVector3(target.latitude, target.longitude, r)
    _pos.set(raw.x, raw.y, raw.z)
    _hPos.set(raw.x, raw.y, raw.z).normalize()
    _quat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _hPos)
    ring.position.copy(_pos)
    ring.quaternion.copy(_quat)
    ring.visible = true
  }

  // -------------------------------------------------------------------------
  // flyToTarget — smooth camera fly-to tween
  // -------------------------------------------------------------------------
  function flyToTarget(target) {
    if (!target || target.latitude == null || target.longitude == null) return
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!camera || !controls) return

    let r = GLOBE_RADIUS * 1.013
    if (target.type === 'satellite') r = GLOBE_RADIUS * (1.16 + ((target.altitudeKm || 500) / 3500))

    const targetLocal = latLongToVector3(target.latitude, target.longitude, r)
    // Convert target local point to world space if globe rotated
    const targetWorld = targetLocal.clone()
    if (globeGroupRef.current) {
      targetWorld.applyMatrix4(globeGroupRef.current.matrixWorld)
    }

    const dist = targetWorld.length() * 1.85
    const camPos = targetWorld.clone().normalize().multiplyScalar(Math.max(3.6, dist))

    flyToStateRef.current = {
      fromPos: camera.position.clone(),
      toPos: camPos,
      fromTarget: controls.target.clone(),
      toTarget: _origin.clone(),
      startTime: performance.now() / 1000,
      duration: 1.25,
    }
    controls.enabled = false
  }

  // -------------------------------------------------------------------------
  // Scene setup — runs once on mount
  // -------------------------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current
    const width  = container.clientWidth
    const height = container.clientHeight

    const scene  = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000)
    camera.position.set(0, 0, 6)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.toneMapping = THREE.NoToneMapping
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace
    container.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.minDistance = 3
    controls.maxDistance = 15
    controls.rotateSpeed = 0.4
    controlsRef.current = controls

    // Lighting
    scene.add(new THREE.AmbientLight(0x445577, 1.2))
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.5)
    sunLight.position.set(5, 3, 5)
    scene.add(sunLight)

    // Parent group for Earth + atmosphere + flights + trails
    const globeGroup = new THREE.Group()
    scene.add(globeGroup)
    globeGroupRef.current = globeGroup

    // Earth — Shader supporting Grid, Solar Day/Night, and High-Contrast Night modes
    const earthGeometry = new THREE.SphereGeometry(GLOBE_RADIUS, 64, 64)
    const earthMaterial = new THREE.ShaderMaterial({
      uniforms: {
        sunDirection: { value: SUN_DIR.clone() },
        uRenderMode:  { value: 0.0 }, // 0 = grid, 1 = solar, 2 = night
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldNormal;
        varying vec3 vViewDir;
        void main() {
          vUv = uv;
          vec4 worldPos = modelMatrix * vec4(position, 1.0);
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          vViewDir = normalize(cameraPosition - worldPos.xyz);
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform vec3 sunDirection;
        uniform float uRenderMode;
        varying vec2 vUv;
        varying vec3 vWorldNormal;
        varying vec3 vViewDir;

        void main() {
          vec2 gridLines = abs(fract(vUv * vec2(24.0, 12.0) - 0.5) - 0.5) / fwidth(vUv * vec2(24.0, 12.0));
          float line = min(gridLines.x, gridLines.y);
          float grid = 1.0 - min(line, 1.0);

          vec3 baseColor = vec3(0.015, 0.03, 0.07);
          vec3 gridColor = vec3(0.0, 0.85, 1.0) * grid * 0.45;

          float dotNV = dot(vWorldNormal, vViewDir);
          float fresnel = pow(1.0 - max(0.0, dotNV), 3.0);
          vec3 rimGlow = vec3(0.0, 0.65, 1.0) * fresnel * 0.4;

          float sunDot = dot(vWorldNormal, sunDirection);
          float dayFactor = smoothstep(-0.2, 0.3, sunDot);

          vec3 finalCol;
          if (uRenderMode > 1.5) {
            // High-contrast Night mode
            finalCol = (baseColor + gridColor * 0.7 + rimGlow * 1.5);
          } else if (uRenderMode > 0.5) {
            // Solar Day/Night Real-time mode
            vec3 dayCol = vec3(0.05, 0.25, 0.45) + gridColor * 0.2;
            vec3 nightCol = vec3(0.005, 0.012, 0.03) + rimGlow;
            finalCol = mix(nightCol, dayCol, dayFactor) + gridColor * 0.2;
          } else {
            // Cyber Grid default mode
            finalCol = (baseColor + gridColor + rimGlow) * (dayFactor * 0.4 + 0.6);
          }

          gl_FragColor = vec4(finalCol, 1.0);
        }
      `,
    })
    const earthMesh = new THREE.Mesh(earthGeometry, earthMaterial)
    globeGroup.add(earthMesh)
    earthMatRef.current = earthMaterial

    // Atmospheric Glow Shell
    const atmoGeometry = new THREE.SphereGeometry(GLOBE_RADIUS * 1.03, 64, 64)
    const atmoMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          float intensity = pow(0.62 - dot(vNormal, vec3(0, 0, 1.0)), 2.8);
          gl_FragColor = vec4(0.0, 0.75, 1.0, 1.0) * intensity * 0.55;
        }
      `,
    })
    globeGroup.add(new THREE.Mesh(atmoGeometry, atmoMaterial))

    // GeoJSON Continental Outlines
    fetch('/continents.geojson')
      .then((res) => res.json())
      .then((geojson) => {
        const geojsonGeometry = parseGeoJSONToLines(geojson, GLOBE_RADIUS * 1.002)
        const geojsonMaterial = new THREE.LineBasicMaterial({
          color: 0x00f3ff,
          transparent: true,
          opacity: 0.28,
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        })
        const lineSegments = new THREE.LineSegments(geojsonGeometry, geojsonMaterial)
        globeGroup.add(lineSegments)
      })
      .catch((err) => console.warn('Failed to load continents.geojson:', err))

    // Background Starfield
    const starCount = 3500
    const starPositions = new Float32Array(starCount * 3)
    const starColors    = new Float32Array(starCount * 3)
    for (let i = 0; i < starCount; i++) {
      const r     = 180 + Math.random() * 220
      const theta = Math.random() * Math.PI * 2
      const phi   = Math.acos(2 * Math.random() - 1)
      starPositions[i * 3]     = r * Math.sin(phi) * Math.cos(theta)
      starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      starPositions[i * 3 + 2] = r * Math.cos(phi)

      const h = 0.52 + (Math.random() - 0.5) * 0.2
      const c = new THREE.Color().setHSL(h, 0.8, 0.7)
      starColors[i * 3]     = c.r
      starColors[i * 3 + 1] = c.g
      starColors[i * 3 + 2] = c.b
    }

    const starGeometry = new THREE.BufferGeometry()
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
    starGeometry.setAttribute('color',    new THREE.BufferAttribute(starColors, 3))

    const starMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending,
      vertexShader: `
        attribute vec3 color;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = (1.5 + sin(position.x * 0.05)) * (250.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float alpha = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vColor * alpha * 0.8, alpha);
        }
      `,
    })
    scene.add(new THREE.Points(starGeometry, starMaterial))

    // Aircraft InstancedMesh
    const paperPlaneGeometry = createPaperAirplaneGeometry()
    const planeMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      toneMapped: false,
    })
    const instancedMesh = new THREE.InstancedMesh(paperPlaneGeometry, planeMaterial, MAX_INSTANCES)
    instancedMesh.count = 0
    instancedMesh.frustumCulled = false
    globeGroup.add(instancedMesh)
    instancedMeshRef.current = instancedMesh

    // Flight Trails
    const TRAIL_VERTS  = MAX_INSTANCES * 2
    const trailPosArr  = new Float32Array(TRAIL_VERTS * 3)
    const trailColArr  = new Float32Array(TRAIL_VERTS * 3)
    const trailAlpArr  = new Float32Array(TRAIL_VERTS)

    const trailPosAttr = new THREE.BufferAttribute(trailPosArr, 3)
    const trailColAttr = new THREE.BufferAttribute(trailColArr, 3)
    const trailAlpAttr = new THREE.BufferAttribute(trailAlpArr, 1)
    trailPosAttr.setUsage(THREE.DynamicDrawUsage)
    trailColAttr.setUsage(THREE.DynamicDrawUsage)
    trailAlpAttr.setUsage(THREE.DynamicDrawUsage)

    const trailGeometry = new THREE.BufferGeometry()
    trailGeometry.setAttribute('position', trailPosAttr)
    trailGeometry.setAttribute('aColor',   trailColAttr)
    trailGeometry.setAttribute('aAlpha',   trailAlpAttr)
    trailGeometry.setDrawRange(0, 0)

    const trailMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending,
      toneMapped:  false,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        attribute vec3  aColor;
        attribute float aAlpha;
        varying   vec3  vColor;
        varying   float vAlpha;
        void main() {
          vColor = aColor;
          vAlpha = aAlpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying vec3  vColor;
        varying float vAlpha;
        void main() {
          float pulse = 0.78 + 0.22 * sin(uTime * 2.8 - vAlpha * 6.28);
          float a = vAlpha * pulse;
          if (a < 0.005) discard;
          gl_FragColor = vec4(vColor * a * 0.85, a);
        }
      `,
    })

    const trailLines = new THREE.LineSegments(trailGeometry, trailMaterial)
    trailLines.frustumCulled = false
    trailLines.renderOrder   = 1
    globeGroup.add(trailLines)
    trailGeoRef.current = trailGeometry
    trailMatRef.current = trailMaterial

    // 3D Great-Circle Arcs
    const arcsGeometry = create3DArcLines(GLOBE_RADIUS)
    const arcsMaterial = new THREE.LineBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    const arcsMesh = new THREE.LineSegments(arcsGeometry, arcsMaterial)
    globeGroup.add(arcsMesh)
    arcsMeshRef.current = arcsMesh

    // Satellites InstancedMesh
    const satGeometry = new THREE.OctahedronGeometry(0.014)
    const satMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      toneMapped: false,
    })
    const satellitesMesh = new THREE.InstancedMesh(satGeometry, satMaterial, 300)
    satellitesMesh.count = 0
    globeGroup.add(satellitesMesh)
    satellitesMeshRef.current = satellitesMesh

    // Earthquakes InstancedMesh
    const eqGeometry = new THREE.TetrahedronGeometry(0.018, 0)
    const eqMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vNormal = normalize(mat3(modelMatrix * instanceMatrix) * normal);
          vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vPosition = worldPos.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPos;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vec3 neonYellow = vec3(1.0, 0.9, 0.0) * 2.8;
          float pulse = 0.85 + 0.15 * sin(uTime * 4.0 + vPosition.x * 10.0);
          gl_FragColor = vec4(neonYellow * pulse, 0.95);
        }
      `,
    })
    const earthquakesMesh = new THREE.InstancedMesh(eqGeometry, eqMaterial, 500)
    earthquakesMesh.count = 0
    globeGroup.add(earthquakesMesh)
    earthquakesMeshRef.current = earthquakesMesh

    updateMarkers()

    // 3D Holographic Selection Ring
    const ringGeometry = new THREE.TorusGeometry(0.048, 0.007, 8, 48)
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x00e5ff, toneMapped: false })
    const selectionRing = new THREE.Mesh(ringGeometry, ringMaterial)
    selectionRing.visible = false
    globeGroup.add(selectionRing)
    selectionRingRef.current = selectionRing

    // Bloom / post-processing
    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.42,
      0.55,
      0.80
    )
    composer.addPass(bloomPass)
    composer.addPass(new OutputPass())

    // Universal Raycasting target selection for Flights, Satellites, and Earthquakes
    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2()

    function handleClick(event) {
      const rect = renderer.domElement.getBoundingClientRect()
      mouse.x =  ((event.clientX - rect.left) / rect.width)  * 2 - 1
      mouse.y = -((event.clientY - rect.top)  / rect.height) * 2 + 1
      raycaster.setFromCamera(mouse, camera)

      const checkObjects = []
      if (instancedMesh.count > 0) checkObjects.push(instancedMesh)
      if (satellitesMesh.count > 0) checkObjects.push(satellitesMesh)
      if (earthquakesMesh.count > 0) checkObjects.push(earthquakesMesh)

      const hits = raycaster.intersectObjects(checkObjects, false)
      if (hits.length > 0) {
        const hit = hits[0]
        const obj = hit.object
        const idx = hit.instanceId

        let target = null
        if (obj === instancedMesh) {
          const f = visibleFlightsRef.current[idx]
          if (f) target = { ...f, type: 'flight' }
        } else if (obj === satellitesMesh) {
          const s = visibleSatellitesRef.current[idx]
          if (s) target = { ...s, type: 'satellite' }
        } else if (obj === earthquakesMesh) {
          const eq = visibleEarthquakesRef.current[idx]
          if (eq) target = { ...eq, type: 'earthquake' }
        }

        if (target) {
          playTargetLockSound()
          positionSelectionRingForTarget(target)
          if (onSelectTarget) onSelectTarget(target)
        }
      } else {
        if (selectionRingRef.current) selectionRingRef.current.visible = false
        if (onSelectTarget) onSelectTarget(null)
      }
    }
    renderer.domElement.addEventListener('click', handleClick)

    // Resize
    function handleResize() {
      const w = container.clientWidth
      const h = container.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
      composer.setSize(w, h)
    }
    window.addEventListener('resize', handleResize)

    // Reset-view tween
    let resetState = null
    function triggerReset() {
      resetState = {
        fromPos:    camera.position.clone(),
        fromTarget: controls.target.clone(),
        startTime:  performance.now() / 1000,
      }
      controls.enabled = false
    }
    if (onResetReady) onResetReady(triggerReset)
    if (onFlyToTargetReady) onFlyToTargetReady(flyToTarget)

    // Animation loop
    let animationFrameId
    function animate() {
      animationFrameId = requestAnimationFrame(animate)

      // Cinematic Mode or Normal Rotation
      const rotSpeed = cinematicModeRef.current ? 0.0024 : 0.0006
      globeGroup.rotation.y += rotSpeed

      // Render mode shader uniform update
      if (earthMatRef.current) {
        const modeVal = renderModeRef.current === 'night' ? 2.0 : renderModeRef.current === 'solar' ? 1.0 : 0.0
        earthMatRef.current.uniforms.uRenderMode.value = modeVal
        if (renderModeRef.current === 'solar') {
          earthMatRef.current.uniforms.sunDirection.value.copy(getSolarDirection())
        } else {
          earthMatRef.current.uniforms.sunDirection.value.copy(SUN_DIR)
        }
      }

      const nowSec = performance.now() / 1000
      trailMaterial.uniforms.uTime.value = nowSec
      eqMaterial.uniforms.uTime.value    = nowSec

      if (selectionRing.visible) {
        const pulse = 1 + Math.sin(performance.now() * 0.004) * 0.08
        selectionRing.scale.setScalar(pulse)
      }

      // Fly-To or Reset Camera Tweens
      if (flyToStateRef.current) {
        const st = flyToStateRef.current
        const elapsed = performance.now() / 1000 - st.startTime
        const t = Math.min(elapsed / st.duration, 1)
        const ease = t * t * (3 - 2 * t)
        camera.position.lerpVectors(st.fromPos, st.toPos, ease)
        controls.target.lerpVectors(st.fromTarget, st.toTarget, ease)
        controls.update()
        if (t >= 1) {
          controls.enabled = true
          flyToStateRef.current = null
        }
      } else if (resetState) {
        const elapsed = performance.now() / 1000 - resetState.startTime
        const t    = Math.min(elapsed / RESET_DURATION, 1)
        const ease = t * t * (3 - 2 * t)
        camera.position.lerpVectors(resetState.fromPos, CAMERA_DEFAULT, ease)
        controls.target.lerpVectors(resetState.fromTarget, _origin, ease)
        controls.update()
        if (t >= 1) { controls.enabled = true; resetState = null }
      } else {
        controls.update()
      }

      composer.render()
    }
    animate()

    // Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId)
      window.removeEventListener('resize', handleResize)
      renderer.domElement.removeEventListener('click', handleClick)
      controls.dispose()
      composer.dispose()
      renderer.dispose()
      earthGeometry.dispose(); earthMaterial.dispose()
      atmosphereGeometry.dispose(); atmosphereMaterial.dispose()
      starGeometry.dispose(); starMaterial.dispose()
      paperPlaneGeometry.dispose(); planeMaterial.dispose()
      satGeometry.dispose(); satMaterial.dispose()
      eqGeometry.dispose(); eqMaterial.dispose()
      arcsGeometry.dispose(); arcsMaterial.dispose()
      ringGeometry.dispose(); ringMaterial.dispose()
      trailGeometry.dispose(); trailMaterial.dispose()
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={containerRef} className="globe-canvas-container" />
}
