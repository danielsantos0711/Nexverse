"use client"

import { Environment, Float, Lightformer } from "@react-three/drei"
import { Canvas, useFrame } from "@react-three/fiber"
import { useMemo, useRef } from "react"
import * as THREE from "three"

/**
 * The Nexverse N as a real object: one continuous chrome ribbon that rises, folds over the top and runs
 * down the diagonal into the second stroke, like the logo's material studies. The ribbon twists slowly
 * and the whole mark leans toward the pointer.
 */

const SEGMENTS = 420
const WIDTH = 0.66

const curve = new THREE.CatmullRomCurve3(
  [
    new THREE.Vector3(-1.02, -1.25, 0),
    new THREE.Vector3(-1.02, 0.45, 0),
    new THREE.Vector3(-0.74, 1.08, 0.14),
    new THREE.Vector3(-0.2, 0.42, 0.3),
    new THREE.Vector3(0.2, -0.42, 0.3),
    new THREE.Vector3(0.74, -1.08, 0.14),
    new THREE.Vector3(1.02, -0.45, 0),
    new THREE.Vector3(1.02, 1.25, 0),
  ],
  false,
  "centripetal"
)

function Ribbon() {
  const mesh = useRef<THREE.Mesh>(null)
  const { geometry, frames } = useMemo(() => {
    const frames = Array.from({ length: SEGMENTS + 1 }, (_, i) => {
      const t = i / SEGMENTS
      const p = curve.getPointAt(t)
      const tan = curve.getTangentAt(t)
      const side = new THREE.Vector3(0, 0, 1).cross(tan).normalize()
      return { t, p, side }
    })
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array((SEGMENTS + 1) * 2 * 3), 3))
    const index: number[] = []
    for (let i = 0; i < SEGMENTS; i++) {
      const a = i * 2
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
    }
    g.setIndex(index)
    return { geometry: g, frames }
  }, [])

  const z = useMemo(() => new THREE.Vector3(0, 0, 1), [])
  const s = useMemo(() => new THREE.Vector3(), [])

  useFrame(({ clock }) => {
    const time = clock.getElapsedTime()
    const pos = geometry.getAttribute("position") as THREE.BufferAttribute
    for (let i = 0; i <= SEGMENTS; i++) {
      const { t, p, side } = frames[i]
      // Flat panels on the uprights, a fluid fold where the ribbon turns into the diagonal.
      const fold = Math.sin(t * Math.PI * 2.2 + 0.6) * 0.75 + Math.sin(time * 0.7 + t * 6) * 0.22
      s.copy(side).multiplyScalar(Math.cos(fold)).addScaledVector(z, Math.sin(fold))
      const w = (WIDTH / 2) * (0.82 + 0.18 * Math.sin(t * Math.PI))
      pos.setXYZ(i * 2, p.x + s.x * w, p.y + s.y * w, p.z + s.z * w)
      pos.setXYZ(i * 2 + 1, p.x - s.x * w, p.y - s.y * w, p.z - s.z * w)
    }
    pos.needsUpdate = true
    geometry.computeVertexNormals()
  })

  return (
    <mesh ref={mesh} geometry={geometry}>
      <meshPhysicalMaterial
        color="#eef1f7"
        metalness={1}
        roughness={0.16}
        clearcoat={1}
        clearcoatRoughness={0.08}
        envMapIntensity={2.2}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

function Rig({ children }: { children: React.ReactNode }) {
  const group = useRef<THREE.Group>(null)
  useFrame(({ pointer }, dt) => {
    const g = group.current
    if (!g) return
    const scroll = typeof window === "undefined" ? 0 : Math.min(window.scrollY / window.innerHeight, 1.2)
    const k = 1 - Math.exp(-dt * 3)
    g.rotation.y += (pointer.x * 0.45 + scroll * 0.9 - g.rotation.y) * k
    g.rotation.x += (-pointer.y * 0.3 + scroll * 0.25 - g.rotation.x) * k
    const scale = 0.8 - scroll * 0.15
    g.scale.setScalar(g.scale.x + (scale - g.scale.x) * k)
    g.position.y += (scroll * 0.6 - g.position.y) * k
  })
  return <group ref={group}>{children}</group>
}

export default function ChromeN({ className }: { className?: string }) {
  return (
    <Canvas
      className={className}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      camera={{ position: [0, 0, 5.4], fov: 35 }}
    >
      <Rig>
        <Float speed={1.4} rotationIntensity={0.35} floatIntensity={0.5}>
          <Ribbon />
        </Float>
      </Rig>
      <Environment resolution={256} frames={1}>
        <color attach="background" args={["#0b0e16"]} />
        <Lightformer form="rect" intensity={1.2} position={[0, 0, 9]} scale={[14, 8, 1]} />
        <Lightformer form="rect" intensity={5} position={[0, 4, 2]} scale={[10, 1.4, 1]} />
        <Lightformer form="rect" intensity={3} position={[0, 1.2, 4]} scale={[10, 0.25, 1]} />
        <Lightformer form="rect" intensity={3} position={[0, -1.5, 4]} scale={[10, 0.18, 1]} />
        <Lightformer form="rect" intensity={2.4} position={[-5, 0.5, 1]} rotation-y={Math.PI / 2} scale={[8, 1, 1]} />
        <Lightformer form="rect" intensity={1.6} color="#8fb4ff" position={[5, -1, 1]} rotation-y={-Math.PI / 2} scale={[8, 2, 1]} />
        <Lightformer form="ring" intensity={2} color="#d8c59e" position={[2, -3, 3]} scale={2} />
        <Lightformer form="rect" intensity={1} position={[0, -4, -2]} scale={[10, 1, 1]} />
      </Environment>
    </Canvas>
  )
}
