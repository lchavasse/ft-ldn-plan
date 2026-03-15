'use client'

import { Suspense, useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, useTexture, Html } from '@react-three/drei'
import * as THREE from 'three'
import type { Floor, Zone, Scenario, ZoneAllocation } from '@/types/planner'
import { USE_TYPE_LABELS, ZONE_STATUS_CONFIG, getZoneDisplayColor } from '@/types/planner'

interface Props {
  floors: Floor[]
  scenario: Scenario
  onFloorClick: (id: string) => void
}

// ─── Alignment ────────────────────────────────────────────────────────────────
interface ImageConfig { worldW: number; worldD: number; worldX: number; worldZ: number }

const BASE_CONFIGS: Record<string, ImageConfig> = {
  'basement.png': { worldW: 17.9,  worldD:  10.7,  worldX:  -3.0, worldZ:  12.0 },
  '0.png':        { worldW: 61.2,  worldD: 26.9,  worldX: -36.2, worldZ:  0   },
  '1.png':        { worldW: 57.8,  worldD: 25.3,  worldX: -35.8, worldZ:  0   },
  '2.png':        { worldW: 56.6,  worldD: 22.2,  worldX: -34.6, worldZ:  0   },
  '3-6.png':      { worldW: 50.0,  worldD: 21.8,  worldX: -25.0, worldZ:  0   },
  '7.png':        { worldW: 21.75, worldD: 18.6,  worldX:  -5.1, worldZ:  2 },
  '8-11.png':     { worldW: 20.25, worldD: 13.35, worldX:  -7.9, worldZ:  5.4 },
}

const FLOOR_ORDER = [
  'basement', 'ground', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth',
  'seventh', 'eighth', 'ninth', 'tenth', 'eleventh',
]

function getFloorIndex(id: string) { const i = FLOOR_ORDER.indexOf(id); return i < 0 ? 0 : i }
function getFloorY(id: string, sep: number) {
  if (id === 'basement') return -sep
  return (getFloorIndex(id) - 1) * sep
}
function imageFileFromPath(p: string) { return p.split('/').pop() ?? '' }

function getZoneColor(_zone: Zone, allocation?: ZoneAllocation): string {
  if (!allocation || allocation.useType === 'unassigned') return 'transparent'
  return getZoneDisplayColor(allocation.useType, allocation.status)
}

// ─── Camera state persistence ─────────────────────────────────────────────────
const DEFAULT_CAM_POS: [number, number, number] = [-62, 80, 73]
const DEFAULT_CAM_TARGET: [number, number, number] = [-5, 20, 11]
const CAM_KEY = 'ft-planner-3d-camera'

interface CamState { pos: [number,number,number]; target: [number,number,number] }
function loadCamState(): CamState | null {
  try { return JSON.parse(localStorage.getItem(CAM_KEY) ?? 'null') } catch { return null }
}
function saveCamState(s: CamState) {
  try { localStorage.setItem(CAM_KEY, JSON.stringify(s)) } catch {}
}
function clearCamState() {
  try { localStorage.removeItem(CAM_KEY) } catch {}
}

// ─── Settings ─────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'ft-planner-3d-v2'
interface ViewSettings { spread: number; spreadX: number; separation: number }
const DEFAULTS: ViewSettings = { spread: 0, spreadX: 0, separation: 4 }

function loadSettings(): ViewSettings {
  if (typeof window === 'undefined') return DEFAULTS
  try {
    const p = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<ViewSettings> | null
    if (!p) return DEFAULTS
    return { spread: p.spread ?? 0, spreadX: p.spreadX ?? 0, separation: p.separation ?? 4 }
  } catch { return DEFAULTS }
}
function saveSettings(s: ViewSettings) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch {}
}

// ─── Zone polygon shape ───────────────────────────────────────────────────────
interface ZoneShapeProps {
  zone: Zone
  allocation?: ZoneAllocation
  worldW: number
  worldD: number
  onDoubleClick: () => void
}

function ZoneShape({ zone, allocation, worldW, worldD, onDoubleClick }: ZoneShapeProps) {
  const [hovered, setHovered] = useState(false)
  const color = getZoneColor(zone, allocation)
  if (color === 'transparent') return null

  const geometry = useMemo(() => {
    const shape = new THREE.Shape()
    const pts = zone.polygon
    if (pts.length < 3) return null
    shape.moveTo((pts[0][0] - 0.5) * worldW, (0.5 - pts[0][1]) * worldD)
    for (let i = 1; i < pts.length; i++) {
      shape.lineTo((pts[i][0] - 0.5) * worldW, (0.5 - pts[i][1]) * worldD)
    }
    shape.closePath()
    return new THREE.ShapeGeometry(shape)
  }, [zone.polygon, worldW, worldD])

  if (!geometry) return null

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      geometry={geometry}
      renderOrder={3}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true) }}
      onPointerOut={() => setHovered(false)}
      onDoubleClick={(e) => { e.stopPropagation(); onDoubleClick() }}
    >
      <meshBasicMaterial
        color={color} transparent
        opacity={hovered ? 0.65 : 0.42}
        depthWrite
        side={THREE.DoubleSide}
      />
      {hovered && (
        <Html position={[0, 0, 0]} center style={{ pointerEvents: 'none', transform: 'translateY(-16px)' }}>
          <div style={{
            background: 'rgba(17,17,16,0.92)', color: '#e4e0d8',
            fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
            padding: '4px 9px', borderRadius: 3, whiteSpace: 'nowrap', border: '1px solid #2a2a28',
          }}>
            {zone.name}
            {allocation?.useType && allocation.useType !== 'unassigned' && (
              <span style={{ color, marginLeft: 6, fontWeight: 400 }}>
                · {USE_TYPE_LABELS[allocation.useType]}
                {allocation.status && ZONE_STATUS_CONFIG[allocation.status] && (
                  <> · {ZONE_STATUS_CONFIG[allocation.status].label}</>
                )}
              </span>
            )}
          </div>
        </Html>
      )}
    </mesh>
  )
}

// ─── Floor plane + zones ──────────────────────────────────────────────────────
interface FloorPlaneProps {
  floor: Floor; yPos: number; zOffset: number; xOffset: number
  cfg: ImageConfig; scenario: Scenario; onDoubleClick: () => void
}

function FloorPlane({ floor, yPos, zOffset, xOffset, cfg, scenario, onDoubleClick }: FloorPlaneProps) {
  const imageFile = imageFileFromPath(floor.imagePath)
  const texture = useTexture(`/floorplans/${imageFile}`)
  texture.colorSpace = THREE.SRGBColorSpace

  const cx = cfg.worldX + cfg.worldW / 2 + xOffset
  const cz = cfg.worldZ + cfg.worldD / 2 + zOffset

  const allocationMap = useMemo(() =>
    new Map(scenario.allocations.filter(a => a.floorId === floor.id).map(a => [a.zoneId, a])),
    [scenario, floor.id]
  )

  return (
    <group position={[cx, yPos, cz]}>
      {/* Floor image — no click handler; only zones are clickable */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
        <planeGeometry args={[cfg.worldW, cfg.worldD]} />
        <meshBasicMaterial
          map={texture} transparent alphaTest={0.15} side={THREE.DoubleSide}
          color="#ffffff" depthWrite
        />
      </mesh>

      {/* Zone polygons — raised 0.05 units to clear z-fighting */}
      <group position={[0, 0.05, 0]}>
        {floor.zones.map(zone => (
          <ZoneShape
            key={zone.id}
            zone={zone}
            allocation={allocationMap.get(zone.id)}
            worldW={cfg.worldW}
            worldD={cfg.worldD}
            onDoubleClick={onDoubleClick}
          />
        ))}
      </group>
    </group>
  )
}

// ─── Camera controller (inside Canvas) ───────────────────────────────────────
function CameraController({ resetKey }: { resetKey: number }) {
  const { camera } = useThree()
  const controls = useThree(state => state.controls) as any
  const didInit = useRef(false)
  const isFirstReset = useRef(true)

  // Restore saved camera on first mount
  useEffect(() => {
    if (!controls || didInit.current) return
    didInit.current = true
    const saved = loadCamState()
    if (saved) {
      camera.position.set(...saved.pos)
      controls.target.set(...saved.target)
      controls.update()
    }
  }, [controls, camera])

  // Reset to defaults when resetKey increments
  useEffect(() => {
    if (isFirstReset.current) { isFirstReset.current = false; return }
    if (!controls) return
    camera.position.set(...DEFAULT_CAM_POS)
    controls.target.set(...DEFAULT_CAM_TARGET)
    controls.update()
    clearCamState()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey])

  return null
}

// ─── Scene ────────────────────────────────────────────────────────────────────
interface SceneProps {
  floors: Floor[]; scenario: Scenario; onFloorClick: (id: string) => void
  spread: number; spreadX: number; separation: number; ctrlHeld: boolean; resetKey: number
}

function BuildingScene({ floors, scenario, onFloorClick, spread, spreadX, separation, ctrlHeld, resetKey }: SceneProps) {
  const { camera } = useThree()
  const controls = useThree(state => state.controls) as any

  const handleChange = useCallback(() => {
    if (!controls?.target) return
    saveCamState({
      pos: camera.position.toArray() as [number,number,number],
      target: controls.target.toArray() as [number,number,number],
    })
  }, [camera, controls])

  return (
    <>
      <OrbitControls
        makeDefault enablePan enableZoom enableRotate
        minDistance={20} maxDistance={300}
        dampingFactor={0.08} enableDamping
        onChange={handleChange}
        mouseButtons={{
          LEFT: ctrlHeld ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.PAN,
        }}
      />
      <CameraController resetKey={resetKey} />

      {floors.map((floor) => {
        const imageFile = imageFileFromPath(floor.imagePath)
        const cfg = BASE_CONFIGS[imageFile]
        if (!cfg) return null
        const idx = getFloorIndex(floor.id)
        return (
          <Suspense key={floor.id} fallback={null}>
            <FloorPlane
              floor={floor}
              yPos={getFloorY(floor.id, separation)}
              zOffset={-idx * spread}
              xOffset={idx * spreadX}
              cfg={cfg}
              scenario={scenario}
              onDoubleClick={() => onFloorClick(floor.id)}
            />
          </Suspense>
        )
      })}

      <gridHelper args={[300, 60, '#181816', '#141412']} position={[-5, -4.6, 11]} />
    </>
  )
}

// ─── Slider ───────────────────────────────────────────────────────────────────
function Slider({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: '#78716c', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{label}</span>
        <span style={{ fontSize: 10, color: '#57534e', fontVariantNumeric: 'tabular-nums' }}>{value.toFixed(1)}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: '100%', accentColor: '#4f46e5', cursor: 'pointer' }} />
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function Building3DView({ floors, scenario, onFloorClick }: Props) {
  const [settings, setSettings] = useState<ViewSettings>(DEFAULTS)
  const [ctrlHeld, setCtrlHeld] = useState(false)
  const [resetKey, setResetKey] = useState(0)

  useEffect(() => { setSettings(loadSettings()) }, [])

  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === 'Control') setCtrlHeld(true) }
    const up = (e: KeyboardEvent) => { if (e.key === 'Control') setCtrlHeld(false) }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  function update(patch: Partial<ViewSettings>) {
    setSettings(prev => { const next = { ...prev, ...patch }; saveSettings(next); return next })
  }

  return (
    <div className="relative w-full h-full" style={{ background: '#0e0e0d' }}>
      <Canvas camera={{ position: [-62, 80, 73], fov: 35, near: 0.5, far: 600 }} gl={{ antialias: true }}>
        <color attach="background" args={['#0e0e0d']} />
        <ambientLight intensity={0.7} />
        <BuildingScene
          floors={floors} scenario={scenario} onFloorClick={onFloorClick}
          spread={settings.spread} spreadX={settings.spreadX}
          separation={settings.separation} ctrlHeld={ctrlHeld} resetKey={resetKey}
        />
      </Canvas>

      {/* Always-visible controls */}
      <div style={{
        position: 'absolute', top: 12, right: 12, zIndex: 10,
        background: '#111110', border: '1px solid #222220', borderRadius: 6,
        padding: '12px 14px', width: 200,
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <Slider label="Z spread" value={settings.spread} min={0} max={14} step={0.5}
          onChange={v => update({ spread: v })} />
        <Slider label="X spread" value={settings.spreadX} min={-8} max={8} step={0.5}
          onChange={v => update({ spreadX: v })} />
        <Slider label="Height sep." value={settings.separation} min={1} max={16} step={0.25}
          onChange={v => update({ separation: v })} />
        <button
          onClick={() => { setSettings(DEFAULTS); saveSettings(DEFAULTS); setResetKey(k => k + 1) }}
          style={{
            marginTop: 2, fontSize: 9, fontWeight: 600, letterSpacing: '0.08em',
            textTransform: 'uppercase', padding: '4px 0', borderRadius: 3, cursor: 'pointer',
            background: 'transparent', border: '1px solid #2a2a28', color: '#44403c',
          }}
        >
          Reset view
        </button>
      </div>

      <div style={{
        position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
        fontSize: 10, color: '#fff', letterSpacing: '0.1em', textTransform: 'uppercase',
        pointerEvents: 'none', fontWeight: 500, whiteSpace: 'nowrap',
      }}>
        Drag to orbit · Ctrl+drag to pan · Scroll to zoom · Double-click floor to edit
      </div>
    </div>
  )
}
