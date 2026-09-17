import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { latLongToVector3 } from '../utils/coords.js'

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

function create3DArcLines(radius) {
  const pointsList = []
  MAJOR_ROUTES.forEach((route) => {
    const p1 = latLongToVector3(route.from[0], route.from[1], radius * 1.01)
    const p2 = latLongToVector3(route.to[0], route.to[1], radius * 1.01)

    const v1 = new THREE.Vector3(p1.x, p1.y, p1.z)
    const v2 = new THREE.Vector3(p2.x, p2.y, p2.z)

    const dist = v1.distanceTo(v2)
    const mid = new THREE.Vector3().addVectors(v1, v2).multiplyScalar(0.5).normalize()
    mid.multiplyScalar(radius + Math.min(dist * 0.35, 1.2))

    const curve = new THREE.QuadraticBezierCurve3(v1, mid, v2)
    const points = curve.getPoints(36)

    for (let i = 0; i < points.length - 1; i++) {
      pointsList.push(points[i].x, points[i].y, points[i].z)
      pointsList.push(points[i + 1].x, points[i + 1].y, points[i + 1].z)
    }
  })

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pointsList, 3))
  return geo
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
  onSelectFlight,
  onResetReady,
}) {
  const containerRef       = useRef(null)
  const flightsRef         = useRef(flights)
  const earthquakesRef     = useRef(earthquakes)
  const satellitesRef      = useRef(satellites)
  const activeLayerRef     = useRef(activeLayer)
  const filterQueryRef     = useRef(filterQuery)

  const instancedMeshRef   = useRef(null)
  const satellitesMeshRef  = useRef(null)
  const earthquakesMeshRef = useRef(null)
  const arcsMeshRef        = useRef(null)
  const selectionRingRef   = useRef(null)
  const selectedIdxRef     = useRef(-1)
  const trailGeoRef        = useRef(null)
  const trailMatRef        = useRef(null)

  useEffect(() => {
    flightsRef.current     = flights
    earthquakesRef.current = earthquakes
    satellitesRef.current  = satellites
    activeLayerRef.current = activeLayer
    filterQueryRef.current = filterQuery
    updateMarkers()
  }, [flights, earthquakes, satellites, activeLayer, filterQuery])

  // -------------------------------------------------------------------------
  // updateMarkers — one call per data cycle; updates all active 3D layers
  // -------------------------------------------------------------------------
  function updateMarkers() {
    const layer = activeLayerRef.current
    const showFlights = layer === 'all' || layer === 'flights'
    const showSats    = layer === 'all' || layer === 'satellites'
    const showEqs     = layer === 'all' || layer === 'earthquakes'

    // --- 1. Flights & Trails ---
    const mesh = instancedMeshRef.current
    if (mesh) {
      const currentFlights = flightsRef.current
      const query = (filterQueryRef.current || '').toLowerCase().trim()
      const n = showFlights ? Math.min(currentFlights.length, MAX_INSTANCES) : 0

      mesh.count = n

      const trailGeo = trailGeoRef.current
      const tPos = trailGeo?.attributes?.position?.array
      const tCol = trailGeo?.attributes?.aColor?.array
      const tAlp = trailGeo?.attributes?.aAlpha?.array

      for (let i = 0; i < n; i++) {
        const f = currentFlights[i]
        const raw = latLongToVector3(f.latitude, f.longitude, GLOBE_RADIUS * 1.012)
        _pos.set(raw.x, raw.y, raw.z)

        computeHeadingQuat(f.latitude, f.longitude, f.heading ?? 0, _quat)

        const matched =
          !query ||
          (f.callsign      || '').toLowerCase().includes(query) ||
          (f.originCountry || '').toLowerCase().includes(query)

        const s = matched ? 1 : 0.15
        _scale.set(s, s, s)
        _mat.compose(_pos, _quat, _scale)
        mesh.setMatrixAt(i, _mat)

        altitudeToColor(f.altitude)
        const tr = _altColor.r, tg = _altColor.g, tb = _altColor.b

        _color.copy(_altColor)
        if (!matched) _color.multiplyScalar(0.08)
        mesh.setColorAt(i, _color)

        if (tPos) {
          const v0 = i * 2
          const v1 = i * 2 + 1

          tPos[v0 * 3] = _pos.x; tPos[v0 * 3 + 1] = _pos.y; tPos[v0 * 3 + 2] = _pos.z
          tAlp[v0] = matched ? 1.0 : 0.0

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
      const nSat = showSats ? Math.min(currentSats.length, 300) : 0
      satMesh.count = nSat

      for (let i = 0; i < nSat; i++) {
        const s = currentSats[i]
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

    // --- 4. Earthquakes (Pulsing Surface Rings) ---
    const eqMesh = earthquakesMeshRef.current
    if (eqMesh) {
      const currentEqs = earthquakesRef.current
      const nEq = showEqs ? Math.min(currentEqs.length, 100) : 0
      eqMesh.count = nEq

      for (let i = 0; i < nEq; i++) {
        const eq = currentEqs[i]
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

    positionSelectionRing(selectedIdxRef.current)
  }

  // -------------------------------------------------------------------------
  // positionSelectionRing
  // -------------------------------------------------------------------------
  function positionSelectionRing(idx) {
    const ring = selectionRingRef.current
    if (!ring) return
    if (idx < 0 || idx >= (flightsRef.current?.length ?? 0)) {
      ring.visible = false
      return
    }
    const f = flightsRef.current[idx]
    const raw = latLongToVector3(f.latitude, f.longitude, GLOBE_RADIUS * 1.013)
    _pos.set(raw.x, raw.y, raw.z)
    _hPos.set(raw.x, raw.y, raw.z).normalize()
    _quat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), _hPos)
    ring.position.copy(_pos)
    ring.quaternion.copy(_quat)
    ring.visible = true
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

    // Lighting
    scene.add(new THREE.AmbientLight(0x445577, 1.2))
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.5)
    sunLight.position.set(5, 3, 5)
    scene.add(sunLight)

    // Parent group for Earth + atmosphere + flights + trails (rotates together)
    const globeGroup = new THREE.Group()
    scene.add(globeGroup)

    // Earth — Stark, modern negative-space globe with electric blue grid
    const earthGeometry = new THREE.SphereGeometry(GLOBE_RADIUS, 64, 64)
    const earthMaterial = new THREE.ShaderMaterial({
      uniforms: {
        sunDirection: { value: SUN_DIR.clone() },
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
        varying vec2 vUv;
        varying vec3 vWorldNormal;
        varying vec3 vViewDir;

        void main() {
          // Procedural lat/lon coordinate grid
          vec2 gridLines = abs(fract(vUv * vec2(24.0, 12.0) - 0.5) - 0.5) / fwidth(vUv * vec2(24.0, 12.0));
          float line = min(gridLines.x, gridLines.y);
          float grid = 1.0 - min(line, 1.0);

          // Dark negative space base color
          vec3 baseColor = vec3(0.015, 0.03, 0.07);

          // Electric cyan-blue grid lines
          vec3 gridColor = vec3(0.0, 0.85, 1.0) * grid * 0.45;

          // Smooth Fresnel edge highlight
          float dotNV = dot(vWorldNormal, vViewDir);
          float fresnel = pow(1.0 - max(0.0, dotNV), 3.0);
          vec3 rimGlow = vec3(0.0, 0.65, 1.0) * fresnel * 0.4;

          // Sun lighting
          float sunDot = dot(vWorldNormal, sunDirection);
          float sunFactor = smoothstep(-0.2, 0.3, sunDot) * 0.4 + 0.6;

          vec3 finalCol = (baseColor + gridColor + rimGlow) * sunFactor;
          gl_FragColor = vec4(finalCol, 1.0);
        }
      `,
    })

    const earthMesh = new THREE.Mesh(earthGeometry, earthMaterial)
    globeGroup.add(earthMesh)

    // Fresnel Atmosphere Glow — FrontSide sphere around Earth (radius 1.025 * GLOBE_RADIUS)
    const atmosphereGeometry = new THREE.SphereGeometry(GLOBE_RADIUS * 1.025, 64, 64)
    const atmosphereMaterial = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.FrontSide,
      depthWrite: false,
      uniforms: {
        sunDirection: { value: SUN_DIR.clone() },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewDir;
        varying vec3 vWorldNormal;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vNormal = normalize(mat3(modelMatrix) * normal);
          vWorldNormal = vNormal;
          vViewDir = normalize(cameraPosition - worldPosition.xyz);
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 sunDirection;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        varying vec3 vWorldNormal;
        void main() {
          float dotNV = dot(vNormal, vViewDir);
          float fresnel = pow(1.0 - max(0.0, dotNV), 3.2);
          
          float sunDot = dot(vWorldNormal, sunDirection);
          float sunFactor = smoothstep(-0.3, 0.4, sunDot) * 0.6 + 0.4;
          
          // Electric blue cyan atmosphere glow
          vec3 atmosColor = vec3(0.12, 0.65, 1.0) * (0.8 + fresnel * 0.6) * sunFactor;
          float alpha = fresnel * 0.88 * sunFactor;
          
          gl_FragColor = vec4(atmosColor, alpha);
        }
      `,
    })
    globeGroup.add(new THREE.Mesh(atmosphereGeometry, atmosphereMaterial))

    // Outer atmosphere halo — BackSide shell
    const outerAtmosGeometry = new THREE.SphereGeometry(GLOBE_RADIUS * 1.045, 64, 64)
    const outerAtmosMaterial = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.BackSide,
      uniforms: {},
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
          float intensity = pow(0.6 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0) * 1.2;
          gl_FragColor = vec4(0.1, 0.55, 1.0, 1.0) * intensity;
        }
      `,
    })
    globeGroup.add(new THREE.Mesh(outerAtmosGeometry, outerAtmosMaterial))

    // Cinematic Deep Space Nebula & Multi-Color Starfield (6,000 points)
    const STAR_COUNT = 6000
    const starGeometry = new THREE.BufferGeometry()
    const starPos = new Float32Array(STAR_COUNT * 3)
    const starCol = new Float32Array(STAR_COUNT * 3)
    const starSiz = new Float32Array(STAR_COUNT)

    const starColors = [
      new THREE.Color('#ffffff'),
      new THREE.Color('#80d8ff'),
      new THREE.Color('#ea80fc'),
      new THREE.Color('#ffd180'),
      new THREE.Color('#82b1ff'),
    ]

    for (let i = 0; i < STAR_COUNT; i++) {
      const u = Math.random()
      const v = Math.random()
      const theta = u * 2.0 * Math.PI
      const phi = Math.acos(2.0 * v - 1.0)
      const r = 160 + Math.random() * 140

      starPos[i * 3]     = r * Math.sin(phi) * Math.cos(theta)
      starPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      starPos[i * 3 + 2] = r * Math.cos(phi)

      const c = starColors[Math.floor(Math.random() * starColors.length)]
      starCol[i * 3]     = c.r
      starCol[i * 3 + 1] = c.g
      starCol[i * 3 + 2] = c.b

      starSiz[i] = 1.0 + Math.random() * 2.8
    }

    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
    starGeometry.setAttribute('color',    new THREE.BufferAttribute(starCol, 3))
    starGeometry.setAttribute('size',     new THREE.BufferAttribute(starSiz, 1))

    const starMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {},
      vertexShader: `
        attribute vec3 color;
        attribute float size;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (180.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          if (d > 0.5) discard;
          float alpha = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vColor, alpha * 0.85);
        }
      `,
    })
    scene.add(new THREE.Points(starGeometry, starMaterial))

    // -----------------------------------------------------------------------
    // Aircraft markers — sleek low-poly paper-airplane geometry
    // -----------------------------------------------------------------------
    const paperPlaneGeometry = createPaperAirplaneGeometry()
    const planeMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,    // instance colour multiplies against white → preserves hue
      side: THREE.DoubleSide, // double-sided so folded wings are visible from all camera angles
      toneMapped: false,  // bypass tone-mapping so HDR values reach the bloom pass raw
    })

    const instancedMesh = new THREE.InstancedMesh(paperPlaneGeometry, planeMaterial, MAX_INSTANCES)
    instancedMesh.count = 0
    instancedMesh.frustumCulled = false
    globeGroup.add(instancedMesh)
    instancedMeshRef.current = instancedMesh

    // -----------------------------------------------------------------------
    // Flight trails — single LineSegments draw call for all aircraft
    // -----------------------------------------------------------------------
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
          // Additive blending: output color multiplied by alpha gradient
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

    // -----------------------------------------------------------------------
    // 3D Glowing Great-Circle Arcs
    // -----------------------------------------------------------------------
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

    // -----------------------------------------------------------------------
    // Satellites InstancedMesh (Orbital Altitude)
    // -----------------------------------------------------------------------
    const satGeometry = new THREE.OctahedronGeometry(0.014)
    const satMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      toneMapped: false,
    })
    const satellitesMesh = new THREE.InstancedMesh(satGeometry, satMaterial, 300)
    satellitesMesh.count = 0
    globeGroup.add(satellitesMesh)
    satellitesMeshRef.current = satellitesMesh

    // -----------------------------------------------------------------------
    // Earthquakes InstancedMesh (Pulsing Surface Rings)
    // -----------------------------------------------------------------------
    const eqGeometry = new THREE.RingGeometry(0.015, 0.032, 24)
    const eqMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    })
    const earthquakesMesh = new THREE.InstancedMesh(eqGeometry, eqMaterial, 100)
    earthquakesMesh.count = 0
    globeGroup.add(earthquakesMesh)
    earthquakesMeshRef.current = earthquakesMesh

    updateMarkers()

    // Selection ring
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
      0.42,  // strength
      0.55,  // radius
      0.80   // threshold — crisp dark earth; HDR trails, atmosphere & plane sparks bloom
    )
    composer.addPass(bloomPass)
    composer.addPass(new OutputPass())

    // Click-to-select
    const raycaster = new THREE.Raycaster()
    const mouse = new THREE.Vector2()

    function handleClick(event) {
      const rect = renderer.domElement.getBoundingClientRect()
      mouse.x =  ((event.clientX - rect.left) / rect.width)  * 2 - 1
      mouse.y = -((event.clientY - rect.top)  / rect.height) * 2 + 1
      raycaster.setFromCamera(mouse, camera)
      const hits = raycaster.intersectObject(instancedMesh)
      if (hits.length > 0) {
        const idx = hits[0].instanceId
        const flight = flightsRef.current[idx]
        if (flight) {
          selectedIdxRef.current = idx
          positionSelectionRing(idx)
          onSelectFlight(flight)
        }
      } else {
        selectedIdxRef.current = -1
        selectionRing.visible  = false
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

    // Animation loop
    let animationFrameId
    function animate() {
      animationFrameId = requestAnimationFrame(animate)
      globeGroup.rotation.y += 0.0006
      earthMaterial.uniforms.sunDirection.value.copy(SUN_DIR)

      trailMaterial.uniforms.uTime.value = performance.now() / 1000

      if (selectionRing.visible) {
        const pulse = 1 + Math.sin(performance.now() * 0.003) * 0.07
        selectionRing.scale.setScalar(pulse)
      }

      if (resetState) {
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
