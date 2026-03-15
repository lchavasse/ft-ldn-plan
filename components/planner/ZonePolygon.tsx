'use client'

import { Zone, ZoneAllocation, USE_TYPE_LABELS, USE_TYPE_COLORS, ZONE_STATUS_CONFIG, getZoneDisplayColor } from '@/types/planner'
import { useState } from 'react'

interface Props {
  zone: Zone
  allocation?: ZoneAllocation
  isSelected: boolean
  isDrawingMode: boolean
  viewBox: { width: number; height: number }
  onClick: () => void
}

const FONT = "var(--font-afacad), 'Afacad', sans-serif"

function centroid(polygon: [number, number][]): [number, number] {
  const x = polygon.reduce((s, [px]) => s + px, 0) / polygon.length
  const y = polygon.reduce((s, [, py]) => s + py, 0) / polygon.length
  return [x, y]
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length <= maxChars) {
      current = candidate
    } else {
      if (current) lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines
}

export default function ZonePolygon({ zone, allocation, isSelected, isDrawingMode, viewBox, onClick }: Props) {
  const [hovered, setHovered] = useState(false)

  const W = viewBox.width
  const H = viewBox.height

  const useType = allocation?.useType ?? 'unassigned'
  const baseColor = getZoneDisplayColor(useType, allocation?.status)

  const points = zone.polygon.map(([x, y]) => `${x * W},${y * H}`).join(' ')

  const fillOpacity = allocation
    ? isSelected ? 0.42 : hovered ? 0.35 : 0.22
    : hovered && !isDrawingMode ? 0.06 : 0

  const strokeColor = isSelected
    ? (baseColor !== 'transparent' ? baseColor : '#6366f1')
    : allocation ? baseColor : '#b0aaa0'
  const strokeWidth = isSelected ? W * 0.0045 : W * 0.0016
  const strokeOpacity = isSelected ? 1 : allocation ? 0.7 : 0.5

  const showLabel = (hovered || isSelected) && !isDrawingMode
  const [cx, cy] = centroid(zone.polygon)

  // Font size as fraction of image width — looks correct at all image sizes
  const NAME_SIZE = W * 0.016
  const DETAIL_SIZE = W * 0.012
  const NAME_LH = NAME_SIZE * 1.35
  const DETAIL_LH = DETAIL_SIZE * 1.4
  const PAD_H = W * 0.014
  const PAD_V = H * 0.018

  const nameLines = wrapText(zone.name, 20)
  const detailLines: { text: string; color: string }[] = []
  if (zone.sqft) detailLines.push({ text: `${zone.sqft.toLocaleString()} sq ft`, color: '#6b6b66' })
  if (allocation && useType !== 'unassigned') {
    const statusLabel = allocation.status ? ZONE_STATUS_CONFIG[allocation.status]?.label : undefined
    const label = statusLabel ? `${USE_TYPE_LABELS[useType]} · ${statusLabel}` : USE_TYPE_LABELS[useType]
    detailLines.push({ text: label, color: baseColor })
  }

  const longestName = nameLines.reduce((a, b) => a.length > b.length ? a : b, '')
  const pillW = longestName.length * NAME_SIZE * 0.52 + PAD_H * 2
  const pillH = nameLines.length * NAME_LH + detailLines.length * DETAIL_LH + PAD_V * 2

  const pillX = cx * W - pillW / 2
  const pillY = cy * H - pillH / 2

  let yPos = pillY + PAD_V + NAME_SIZE * 0.82
  const nameYs = nameLines.map((_, i) => yPos + i * NAME_LH)
  yPos += nameLines.length * NAME_LH + (detailLines.length ? NAME_SIZE * 0.2 : 0)
  const detailYs = detailLines.map((_, i) => yPos + i * DETAIL_LH)

  return (
    <g
      onClick={(e) => { if (isDrawingMode) return; e.stopPropagation(); onClick() }}
      onMouseEnter={() => { if (!isDrawingMode) setHovered(true) }}
      onMouseLeave={() => setHovered(false)}
      style={{ cursor: isDrawingMode ? 'crosshair' : 'pointer', pointerEvents: isDrawingMode ? 'none' : 'auto' }}
    >
      <polygon
        points={points}
        fill={allocation ? baseColor : '#888'}
        fillOpacity={fillOpacity}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeOpacity={strokeOpacity}
        strokeLinejoin="round"
      />

      {showLabel && (
        <g style={{ pointerEvents: 'none', userSelect: 'none' }}>
          <rect
            x={pillX} y={pillY}
            width={pillW} height={pillH}
            rx={W * 0.008}
            fill="white" fillOpacity={0.95}
            filter="url(#label-shadow)"
          />
          {nameLines.map((line, i) => (
            <text key={i}
              x={cx * W} y={nameYs[i]}
              textAnchor="middle"
              fontSize={NAME_SIZE}
              fill="#111110"
              fontWeight="500"
              fontFamily={FONT}
            >
              {line}
            </text>
          ))}
          {detailLines.map((d, i) => (
            <text key={i}
              x={cx * W} y={detailYs[i]}
              textAnchor="middle"
              fontSize={DETAIL_SIZE}
              fill={d.color}
              fontWeight="400"
              fontFamily={FONT}
            >
              {d.text}
            </text>
          ))}
        </g>
      )}
    </g>
  )
}
