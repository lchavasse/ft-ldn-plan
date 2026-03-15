'use client'

import { useState, useEffect } from 'react'

interface Props {
  isDrawing: boolean
  viewBox: { width: number; height: number }
  svgRef: React.RefObject<SVGSVGElement | null>
  onComplete: (polygon: [number, number][]) => void
  onCancel: () => void
}

function dist(a: [number, number], b: [number, number]) {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2)
}

export default function DrawingLayer({ isDrawing, viewBox, svgRef, onComplete, onCancel }: Props) {
  const [vertices, setVertices] = useState<[number, number][]>([])
  const [cursor, setCursor] = useState<[number, number] | null>(null)
  const [snapping, setSnapping] = useState(false)

  useEffect(() => {
    if (!isDrawing) { setVertices([]); setCursor(null); setSnapping(false) }
  }, [isDrawing])

  useEffect(() => {
    if (!isDrawing) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onCancel(); setVertices([]); setCursor(null) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isDrawing, onCancel])

  const getSVGCoords = (e: React.MouseEvent): [number, number] => {
    const svg = svgRef.current
    if (!svg) return [0, 0]
    const rect = svg.getBoundingClientRect()
    return [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height]
  }

  const toSVG = ([x, y]: [number, number]): [number, number] => [x * viewBox.width, y * viewBox.height]
  const snapRadius = viewBox.width * 0.014

  const handleMouseMove = (e: React.MouseEvent) => {
    const pt = getSVGCoords(e)
    setCursor(pt)
    if (vertices.length >= 3) {
      setSnapping(dist(toSVG(pt), toSVG(vertices[0])) < snapRadius)
    } else {
      setSnapping(false)
    }
  }

  const handleClick = (e: React.MouseEvent) => {
    if (e.detail > 1) return
    e.stopPropagation()
    const pt = getSVGCoords(e)
    if (vertices.length >= 3 && dist(toSVG(pt), toSVG(vertices[0])) < snapRadius) {
      onComplete(vertices)
      setVertices([]); setCursor(null); setSnapping(false)
      return
    }
    setVertices((prev) => [...prev, pt])
  }

  if (!isDrawing) return null

  // Scale drawing constants relative to image width
  const U = viewBox.width
  const dotR = U * 0.005
  const strokeW = U * 0.002

  const svgVerts = vertices.map(toSVG)
  const svgCursor = cursor ? toSVG(cursor) : null
  const closingSnap = snapping && svgCursor && svgVerts.length > 0
  const linePoints = [...svgVerts, closingSnap ? svgVerts[0] : svgCursor].filter(Boolean) as [number, number][]
  const pointsStr = linePoints.map(([x, y]) => `${x},${y}`).join(' ')

  return (
    <g>
      <rect
        x={0} y={0} width={viewBox.width} height={viewBox.height}
        fill="transparent"
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => { setCursor(null); setSnapping(false) }}
        style={{ cursor: 'crosshair' }}
      />

      {/* In-progress fill */}
      {svgVerts.length >= 3 && (
        <polygon
          points={svgVerts.map(([x, y]) => `${x},${y}`).join(' ')}
          fill="#4f46e5" fillOpacity={0.08} stroke="none"
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Edges */}
      {linePoints.length >= 2 && (
        <polyline
          points={pointsStr} fill="none"
          stroke={closingSnap ? '#16a34a' : '#4f46e5'}
          strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round"
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* Vertex dots */}
      {svgVerts.map(([x, y], i) => {
        const canClose = i === 0 && vertices.length >= 3
        return (
          <circle key={i} cx={x} cy={y}
            r={canClose ? dotR * (snapping ? 2.5 : 1.8) : dotR}
            fill={canClose && snapping ? '#16a34a' : '#4f46e5'}
            fillOpacity={canClose ? 0.9 : 0.65}
            stroke="white" strokeWidth={strokeW * 0.6}
            style={{ pointerEvents: 'none' }}
          />
        )
      })}

      {/* Snap ring */}
      {vertices.length >= 3 && svgVerts[0] && (
        <circle
          cx={svgVerts[0][0]} cy={svgVerts[0][1]} r={snapRadius}
          fill="none"
          stroke={snapping ? '#16a34a' : '#4f46e5'}
          strokeWidth={strokeW * 0.7}
          strokeDasharray={`${strokeW * 3},${strokeW * 3}`}
          opacity={snapping ? 0.7 : 0.3}
          style={{ pointerEvents: 'none' }}
        />
      )}
    </g>
  )
}
