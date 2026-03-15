'use client'

import { useRef, useState } from 'react'
import { Floor, Zone, ZoneAllocation } from '@/types/planner'
import ZonePolygon from './ZonePolygon'
import DrawingLayer from './DrawingLayer'

interface Props {
  floor: Floor
  allocations: ZoneAllocation[]
  selectedZoneId: string | null
  isDrawing: boolean
  onZoneClick: (zone: Zone) => void
  onPolygonComplete: (polygon: [number, number][]) => void
  onCancelDraw: () => void
  onDeselect: () => void
}

export default function FloorPlanViewer({
  floor,
  allocations,
  selectedZoneId,
  isDrawing,
  onZoneClick,
  onPolygonComplete,
  onCancelDraw,
  onDeselect,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null)
  // viewBox tracks the image's natural pixel dimensions so SVG units are square
  const [vb, setVb] = useState({ w: 1000, h: 600 })

  const allocationMap = new Map(allocations.map((a) => [a.zoneId, a]))
  const viewBox = { width: vb.w, height: vb.h }

  return (
    <div
      className="relative w-full h-full flex items-center justify-center overflow-hidden"
      style={{ background: '#f0ede8' }}
      onClick={onDeselect}
    >
      <div className="relative" style={{ maxWidth: '100%', maxHeight: '100%' }}>
        <img
          key={floor.id}
          src={floor.imagePath}
          alt={floor.label}
          className="block max-w-full max-h-full object-contain select-none"
          style={{ maxHeight: 'calc(100vh - 112px)' }}
          draggable={false}
          onLoad={(e) => {
            const img = e.currentTarget
            setVb({ w: img.naturalWidth, h: img.naturalHeight })
          }}
        />
        {/* SVG viewBox matches image natural dimensions — preserveAspectRatio="none" is safe
            because viewBox aspect ratio now equals display aspect ratio, so units are uniform */}
        <svg
          ref={svgRef}
          viewBox={`0 0 ${vb.w} ${vb.h}`}
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full"
          style={{ cursor: isDrawing ? 'crosshair' : 'default' }}
        >
          <defs>
            <filter id="label-shadow" x="-20%" y="-40%" width="140%" height="180%">
              <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000" floodOpacity="0.1" />
            </filter>
          </defs>
          {floor.zones.map((zone) => (
            <ZonePolygon
              key={zone.id}
              zone={zone}
              allocation={allocationMap.get(zone.id)}
              isSelected={selectedZoneId === zone.id}
              isDrawingMode={isDrawing}
              viewBox={viewBox}
              onClick={() => onZoneClick(zone)}
            />
          ))}
          <DrawingLayer
            isDrawing={isDrawing}
            viewBox={viewBox}
            svgRef={svgRef}
            onComplete={onPolygonComplete}
            onCancel={onCancelDraw}
          />
        </svg>
      </div>
    </div>
  )
}
