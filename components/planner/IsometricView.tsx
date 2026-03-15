'use client'

import { Floor, Scenario, USE_TYPE_COLORS, UseType } from '@/types/planner'

interface Props {
  floors: Floor[]
  scenario: Scenario
  onFloorClick: (floorId: string) => void
}

const COS30 = Math.sqrt(3) / 2
const SIN30 = 0.5

// Building slab dimensions in isometric units
const W = 260   // width
const D = 95    // depth
const SLAB_H = 20
const GAP = 6

function iso(x: number, y: number, z: number): [number, number] {
  return [(x - y) * COS30, (x + y) * SIN30 - z]
}

function pts(points: [number, number][]): string {
  return points.map(([x, y]) => `${x},${y}`).join(' ')
}

function getDominantUseType(floorId: string, scenario: Scenario): UseType | null {
  const allocs = scenario.allocations.filter(
    (a) => a.floorId === floorId && a.useType !== 'unassigned'
  )
  if (!allocs.length) return null
  const counts: Partial<Record<UseType, number>> = {}
  for (const a of allocs) counts[a.useType] = (counts[a.useType] ?? 0) + 1
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] as UseType
}

// Darken a hex color by a given factor
function darken(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgb(${Math.round(r * factor)},${Math.round(g * factor)},${Math.round(b * factor)})`
}

export default function IsometricView({ floors, scenario, onFloorClick }: Props) {
  // floors[0] = basement, floors[n-1] = top floor
  const slabs = floors.map((floor, i) => {
    const zBottom = i * (SLAB_H + GAP)
    const zTop = zBottom + SLAB_H

    const tA = iso(0, 0, zTop)
    const tB = iso(W, 0, zTop)
    const tC = iso(W, D, zTop)
    const tD = iso(0, D, zTop)
    const bA = iso(0, 0, zBottom)
    const bB = iso(W, 0, zBottom)
    const bC = iso(W, D, zBottom)

    const dominantType = getDominantUseType(floor.id, scenario)
    const baseColor = dominantType ? USE_TYPE_COLORS[dominantType] : '#52525b'

    return { floor, tA, tB, tC, tD, bA, bB, bC, baseColor }
  })

  // Bounding box for viewBox
  const allPts = slabs.flatMap((s) => [s.tA, s.tB, s.tC, s.tD, s.bA, s.bB, s.bC])
  const xs = allPts.map((p) => p[0])
  const ys = allPts.map((p) => p[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  const PAD = 24
  const vbW = maxX - minX + PAD * 2
  const vbH = maxY - minY + PAD * 2
  const ox = -minX + PAD
  const oy = -minY + PAD

  const t = ([x, y]: [number, number]): [number, number] => [x + ox, y + oy]

  return (
    <div className="flex items-center justify-center h-full bg-zinc-950 overflow-hidden">
      <svg
        viewBox={`0 0 ${vbW} ${vbH}`}
        style={{ width: '100%', height: '100%', maxHeight: '80vh', maxWidth: 900 }}
        preserveAspectRatio="xMidYMid meet"
      >
        {slabs.map(({ floor, tA, tB, tC, tD, bA, bB, bC, baseColor }) => {
          const frontColor = darken(baseColor, 0.55)
          const rightColor = darken(baseColor, 0.72)
          const topColor = baseColor

          const labelX = (t(tA)[0] + t(tC)[0]) / 2
          const labelY = (t(tA)[1] + t(tC)[1]) / 2

          return (
            <g
              key={floor.id}
              onClick={() => onFloorClick(floor.id)}
              style={{ cursor: 'pointer' }}
            >
              {/* Front face (y=0 wall) */}
              <polygon
                points={pts([t(tA), t(tB), t(bB), t(bA)])}
                fill={frontColor}
                stroke="rgba(255,255,255,0.1)"
                strokeWidth={0.4}
              />
              {/* Right face (x=W wall) */}
              <polygon
                points={pts([t(tB), t(tC), t(bC), t(bB)])}
                fill={rightColor}
                stroke="rgba(255,255,255,0.1)"
                strokeWidth={0.4}
              />
              {/* Top face */}
              <polygon
                points={pts([t(tA), t(tB), t(tC), t(tD)])}
                fill={topColor}
                stroke="rgba(255,255,255,0.2)"
                strokeWidth={0.5}
              />
              {/* Label on top face */}
              <text
                x={labelX}
                y={labelY}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={8}
                fill="rgba(255,255,255,0.85)"
                stroke="rgba(0,0,0,0.4)"
                strokeWidth={1.5}
                paintOrder="stroke"
                style={{ pointerEvents: 'none', userSelect: 'none', fontWeight: 600 }}
              >
                {floor.label}
                {floor.repeats > 1 ? ` ×${floor.repeats}` : ''}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
