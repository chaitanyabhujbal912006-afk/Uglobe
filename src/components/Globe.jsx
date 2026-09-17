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
// Altitude → high-tech colour palette
//   0 m      → neon yellow  #ffe600  (HSL 55° / 1.0 / 0.72)
//   12 000 m  → electric blue #2979ff  (HSL 215° / 1.0 / 0.72)
//
// Colors are boosted 2.5× above [0,1] so the bloom pass threshold (0.85) is
// reliably exceeded — markers genuinely glow on the night side of Earth.
// MeshBasicMaterial outputs the raw linear values without lighting attenuation,
// making it functionally identical to a fully emissive material.
// ---------------------------------------------------------------------------
const _altColor = new THREE.Color()
function altitudeToColor(altMeters) {
  const a = altMeters ?? 8000
  const t = Math.max(0, Math.min(1, a / 12000))
  // Neon yellow (hue 0.153 = 55°) → electric blue (hue 0.597 = 215°)
  _altColor.setHSL(0.153 + t * 0.444, 1.0, 0.72)
  // Push luminance well above the bloom threshold — genuine HDR glow
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function Globe({ flights, filterQuery = '', onSelectFlight, onResetReady }) {
  const containerRef     = useRef(null)
  const flightsRef       = useRef(flights)
  const filterQueryRef   = useRef(filterQuery)
  const instancedMeshRef = useRef(null)
  const selectionRingRef = useRef(null)
  const selectedIdxRef   = useRef(-1)
  const trailGeoRef      = useRef(null)
  const trailMatRef      = useRef(null)

  useEffect(() => {
    flightsRef.current     = flights
    filterQueryRef.current = filterQuery
    updateMarkers()
  }, [flights, filterQuery])

  // -------------------------------------------------------------------------
  // updateMarkers — one call per data cycle; updates instanced mesh + trails
  // -------------------------------------------------------------------------
  function updateMarkers() {
    const mesh = instancedMeshRef.current
    if (!mesh) return

    const currentFlights = flightsRef.current
    const query = (filterQueryRef.current || '').toLowerCase().trim()
    const n = Math.min(currentFlights.length, MAX_INSTANCES)

    mesh.count = n

    const trailGeo = trailGeoRef.current
    const tPos = trailGeo?.attributes?.position?.array
    const tCol = trailGeo?.attributes?.aColor?.array
    const tAlp = trailGeo?.attributes?.aAlpha?.array

    for (let i = 0; i < n; i++) {
      const f = currentFlights[i]

      const raw = latLongToVector3(f.latitude, f.longitude, GLOBE_RADIUS * 1.012)
      _pos.set(raw.x, raw.y, raw.z)

      // Sets _hPos (unit surface normal) and _hDir (heading tangent) as side-effects
      computeHeadingQuat(f.latitude, f.longitude, f.heading ?? 0, _quat)

      const matched =
        !query ||
        (f.callsign      || '').toLowerCase().includes(query) ||
        (f.originCountry || '').toLowerCase().includes(query)

      const s = matched ? 1 : 0.15
      _scale.set(s, s, s)
      _mat.compose(_pos, _quat, _scale)
      mesh.setMatrixAt(i, _mat)

      // Altitude colour — already HDR-boosted by altitudeToColor
      altitudeToColor(f.altitude)                    // sets _altColor
      const tr = _altColor.r, tg = _altColor.g, tb = _altColor.b

      _color.copy(_altColor)
      if (!matched) _color.multiplyScalar(0.08)
      mesh.setColorAt(i, _color)

      // Trail vertices
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

    // Earth — day/night ShaderMaterial
    const textureLoader = new THREE.TextureLoader()
    const earthGeometry = new THREE.SphereGeometry(GLOBE_RADIUS, 64, 64)
    const blankTex = new THREE.DataTexture(new Uint8Array([30, 50, 80, 255]), 1, 1)
    blankTex.needsUpdate = true
    const blackTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
    blackTex.needsUpdate = true

    const earthMaterial = new THREE.ShaderMaterial({
      uniforms: {
        dayMap:       { value: blankTex },
        nightMap:     { value: blackTex },
        sunDirection: { value: SUN_DIR.clone() },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldNormal;
        void main() {
          vUv = uv;
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D dayMap;
        uniform sampler2D nightMap;
        uniform vec3 sunDirection;
        varying vec2 vUv;
        varying vec3 vWorldNormal;
        void main() {
          float cosAngle = dot(vWorldNormal, sunDirection);
          float dayMix   = smoothstep(-0.15, 0.25, cosAngle);
          vec4  dayColorRaw   = texture2D(dayMap,   vUv);
          vec4  nightColorRaw = texture2D(nightMap, vUv);
          
          // Darken daytime texture to a deep, rich slate blue canvas
          // Landmasses remain crisp and detailed without blowing out
          vec3 darkDay = dayColorRaw.rgb * 0.38;
          
          // Night lights on unlit side
          float nightStrength = 1.0 - dayMix;
          vec3 litNight = nightColorRaw.rgb * nightStrength * 2.0;
          
          vec3 finalCol = mix(litNight, darkDay, dayMix);
          gl_FragColor = vec4(finalCol, 1.0);
        }
      `,
    })

    const earthMesh = new THREE.Mesh(earthGeometry, earthMaterial)
    scene.add(earthMesh)
    textureLoader.load(EARTH_DAY_URL,   (tex) => { earthMaterial.uniforms.dayMap.value   = tex })
    textureLoader.load(EARTH_NIGHT_URL, (tex) => { earthMaterial.uniforms.nightMap.value = tex })

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
    scene.add(new THREE.Mesh(atmosphereGeometry, atmosphereMaterial))

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
    scene.add(new THREE.Mesh(outerAtmosGeometry, outerAtmosMaterial))

    // Starfield
    const starGeometry  = new THREE.BufferGeometry()
    const starPositions = new Float32Array(3000 * 3)
    for (let i = 0; i < starPositions.length; i++) starPositions[i] = (Math.random() - 0.5) * 200
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
    const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.15 })
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
    scene.add(instancedMesh)
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
    scene.add(trailLines)
    trailGeoRef.current = trailGeometry
    trailMatRef.current = trailMaterial

    updateMarkers()

    // Selection ring
    const ringGeometry = new THREE.TorusGeometry(0.048, 0.007, 8, 48)
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x00e5ff, toneMapped: false })
    const selectionRing = new THREE.Mesh(ringGeometry, ringMaterial)
    selectionRing.visible = false
    scene.add(selectionRing)
    selectionRingRef.current = selectionRing

    // Bloom / post-processing
    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.4,   // strength
      0.5,   // radius
      0.85   // threshold — globe texture stays clean; HDR markers always bloom
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
      earthMesh.rotation.y += 0.0006
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
      blankTex.dispose(); blackTex.dispose()
      atmosphereGeometry.dispose(); atmosphereMaterial.dispose()
      starGeometry.dispose(); starMaterial.dispose()
      paperPlaneGeometry.dispose(); planeMaterial.dispose()
      ringGeometry.dispose(); ringMaterial.dispose()
      trailGeometry.dispose(); trailMaterial.dispose()
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={containerRef} className="globe-canvas-container" />
}
