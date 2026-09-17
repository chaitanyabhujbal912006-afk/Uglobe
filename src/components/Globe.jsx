import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { latLongToVector3 } from '../utils/coords.js'

const GLOBE_RADIUS = 2
const EARTH_DAY_URL =
  'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_atmos_2048.jpg'
const EARTH_NIGHT_URL =
  'https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets/earth_lights_2048.png'

// Sun direction in world space — matches the DirectionalLight position (normalised).
// Kept as a module-level constant; the uniform is updated each frame.
const SUN_DIR = new THREE.Vector3(5, 3, 5).normalize()

const CAMERA_DEFAULT = new THREE.Vector3(0, 0, 6)
const RESET_DURATION = 1.0 // seconds

export default function Globe({ flights, filterQuery = '', onSelectFlight, onResetReady }) {
  const containerRef = useRef(null)
  const flightsRef = useRef(flights)
  const filterQueryRef = useRef(filterQuery)
  const pointsMeshRef = useRef(null)

  // Keep both refs in sync whenever props change — no scene rebuild needed
  useEffect(() => {
    flightsRef.current = flights
    filterQueryRef.current = filterQuery
    updatePointsGeometry()
  }, [flights, filterQuery])

  function updatePointsGeometry() {
    const pointsMesh = pointsMeshRef.current
    if (!pointsMesh) return

    const currentFlights = flightsRef.current
    const query = (filterQueryRef.current || '').toLowerCase().trim()
    const n = currentFlights.length
    const positions = new Float32Array(n * 3)
    const colors    = new Float32Array(n * 3) // per-vertex RGB

    // Matched colour: bright cyan (#aae8ff).  Dim colour: near-black (#0d1a26).
    const matchR = 0.667, matchG = 0.910, matchB = 1.0
    const dimR   = 0.05,  dimG   = 0.10,  dimB   = 0.15

    currentFlights.forEach((flight, i) => {
      const { x, y, z } = latLongToVector3(
        flight.latitude,
        flight.longitude,
        GLOBE_RADIUS * 1.01
      )
      positions[i * 3]     = x
      positions[i * 3 + 1] = y
      positions[i * 3 + 2] = z

      const matched =
        !query ||
        (flight.callsign  || '').toLowerCase().includes(query) ||
        (flight.originCountry || '').toLowerCase().includes(query)

      colors[i * 3]     = matched ? matchR : dimR
      colors[i * 3 + 1] = matched ? matchG : dimG
      colors[i * 3 + 2] = matched ? matchB : dimB
    })

    const geo = pointsMesh.geometry
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color',    new THREE.BufferAttribute(colors, 3))
    geo.attributes.position.needsUpdate = true
    geo.attributes.color.needsUpdate    = true
    geo.computeBoundingSphere()
  }

  useEffect(() => {
    const container = containerRef.current
    const width = container.clientWidth
    const height = container.clientHeight

    // --- Scene setup ---
    const scene = new THREE.Scene()

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000)
    camera.position.set(0, 0, 6)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    // OutputPass handles the final gamma/tone-map step; keep renderer neutral
    renderer.toneMapping = THREE.NoToneMapping
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace
    container.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.minDistance = 3
    controls.maxDistance = 15
    controls.rotateSpeed = 0.4

    // --- Lighting ---
    scene.add(new THREE.AmbientLight(0x445577, 1.2))
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.5)
    sunLight.position.set(5, 3, 5)
    scene.add(sunLight)

    // --- Earth sphere — custom day/night ShaderMaterial ---
    const textureLoader = new THREE.TextureLoader()
    const earthGeometry = new THREE.SphereGeometry(GLOBE_RADIUS, 64, 64)

    // Placeholder 1×1 textures so the shader compiles before images finish loading
    const blankTex = new THREE.DataTexture(new Uint8Array([30, 50, 80, 255]), 1, 1)
    blankTex.needsUpdate = true
    const blackTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
    blackTex.needsUpdate = true

    const earthMaterial = new THREE.ShaderMaterial({
      uniforms: {
        dayMap:   { value: blankTex },
        nightMap: { value: blackTex },
        sunDirection: { value: SUN_DIR.clone() },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vWorldNormal;
        void main() {
          vUv = uv;
          // World-space normal — accounts for the mesh's rotation each frame.
          vWorldNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D dayMap;
        uniform sampler2D nightMap;
        uniform vec3 sunDirection;  // normalised, world space
        varying vec2 vUv;
        varying vec3 vWorldNormal;

        void main() {
          float cosAngle = dot(vWorldNormal, sunDirection);

          // Smooth terminator: -0.1 (deep night) → 0.1 (full day), ~12° wide band.
          float dayMix = smoothstep(-0.1, 0.1, cosAngle);

          vec4 dayColor   = texture2D(dayMap,   vUv);
          vec4 nightColor = texture2D(nightMap, vUv);

          // City lights fade in where it is dark; scale them up so they read well.
          float nightStrength = 1.0 - dayMix;
          vec4 litNight = nightColor * nightStrength * 2.5;

          // Blend: dark side shows city lights over a darkened day texture.
          vec3 col = mix(litNight.rgb, dayColor.rgb, dayMix);

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    })

    const earthMesh = new THREE.Mesh(earthGeometry, earthMaterial)
    scene.add(earthMesh)

    // Load both textures; assign as soon as each arrives.
    textureLoader.load(EARTH_DAY_URL, (tex) => {
      earthMaterial.uniforms.dayMap.value = tex
    })
    textureLoader.load(EARTH_NIGHT_URL, (tex) => {
      earthMaterial.uniforms.nightMap.value = tex
    })

    // --- Atmosphere glow (a slightly larger, additive, back-facing sphere) ---
    const atmosphereGeometry = new THREE.SphereGeometry(GLOBE_RADIUS * 1.04, 64, 64)
    const atmosphereMaterial = new THREE.ShaderMaterial({
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
          // intensity peaks at the limb; * 1.4 pushes it just above the bloom
          // threshold (0.35) so the edge glows without clipping the whole sphere.
          float intensity = pow(0.6 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0) * 1.4;
          gl_FragColor = vec4(0.3, 0.6, 1.0, 1.0) * intensity;
        }
      `,
    })
    const atmosphereMesh = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial)
    scene.add(atmosphereMesh)

    // --- Starfield background ---
    const starGeometry = new THREE.BufferGeometry()
    const starCount = 3000
    const starPositions = new Float32Array(starCount * 3)
    for (let i = 0; i < starCount * 3; i++) {
      starPositions[i] = (Math.random() - 0.5) * 200
    }
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3))
    const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.15 })
    scene.add(new THREE.Points(starGeometry, starMaterial))

    // --- Flight points (vertex-coloured so filter dims non-matching points) ---
    const pointsGeometry = new THREE.BufferGeometry()
    const pointsMaterial = new THREE.PointsMaterial({
      vertexColors: true,   // colour driven per-point by the 'color' attribute
      size: 0.05,
      sizeAttenuation: true,
      transparent: true,
      opacity: 1.0,
    })
    const pointsMesh = new THREE.Points(pointsGeometry, pointsMaterial)
    scene.add(pointsMesh)
    pointsMeshRef.current = pointsMesh
    updatePointsGeometry()

    // --- Bloom / post-processing ---
    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.9,  // strength  — soft glow, not a neon flare
      0.4,  // radius    — tight halo so it reads as a point-light not a fog
      0.35  // threshold — lit hemisphere (~0.3 luminance) stays clean; only
            //             the atmosphere limb and flight-point peaks bloom
    )
    composer.addPass(bloomPass)
    composer.addPass(new OutputPass()) // gamma-correct final output

    // --- Click-to-select ---
    const raycaster = new THREE.Raycaster()
    raycaster.params.Points.threshold = 0.06
    const mouse = new THREE.Vector2()

    function handleClick(event) {
      const rect = renderer.domElement.getBoundingClientRect()
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

      raycaster.setFromCamera(mouse, camera)
      const intersects = raycaster.intersectObject(pointsMesh)

      if (intersects.length > 0) {
        const index = intersects[0].index
        const flight = flightsRef.current[index]
        if (flight) onSelectFlight(flight)
      }
    }
    renderer.domElement.addEventListener('click', handleClick)

    // --- Resize handling ---
    function handleResize() {
      const w = container.clientWidth
      const h = container.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
      composer.setSize(w, h)
    }
    window.addEventListener('resize', handleResize)

    // --- Reset-view tween state ---
    let resetState = null // { fromPos, fromTarget, startTime }

    function triggerReset() {
      resetState = {
        fromPos:    camera.position.clone(),
        fromTarget: controls.target.clone(),
        startTime:  performance.now() / 1000,
      }
      controls.enabled = false // pause orbit during tween
    }

    // Expose reset to the parent via callback prop
    if (onResetReady) onResetReady(triggerReset)

    // --- Animation loop ---
    let animationFrameId
    function animate() {
      animationFrameId = requestAnimationFrame(animate)
      earthMesh.rotation.y += 0.0006

      earthMaterial.uniforms.sunDirection.value.copy(SUN_DIR)

      // Camera-reset lerp
      if (resetState) {
        const elapsed = performance.now() / 1000 - resetState.startTime
        const t = Math.min(elapsed / RESET_DURATION, 1)
        // Smoothstep easing
        const ease = t * t * (3 - 2 * t)
        camera.position.lerpVectors(resetState.fromPos, CAMERA_DEFAULT, ease)
        controls.target.lerpVectors(resetState.fromTarget, new THREE.Vector3(0, 0, 0), ease)
        controls.update()
        if (t >= 1) {
          controls.enabled = true
          resetState = null
        }
      } else {
        controls.update()
      }

      composer.render()
    }
    animate()

    // --- Cleanup on unmount ---
    return () => {
      cancelAnimationFrame(animationFrameId)
      window.removeEventListener('resize', handleResize)
      renderer.domElement.removeEventListener('click', handleClick)
      controls.dispose()
      composer.dispose()
      renderer.dispose()
      earthGeometry.dispose()
      earthMaterial.dispose()
      blankTex.dispose()
      blackTex.dispose()
      atmosphereGeometry.dispose()
      atmosphereMaterial.dispose()
      pointsGeometry.dispose()
      pointsMaterial.dispose()
      starGeometry.dispose()
      starMaterial.dispose()
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally empty — scene is built once; data updates flow through flightsRef

  return <div ref={containerRef} className="globe-canvas-container" />
}
