'use client'

import { Floor } from '@/types/planner'

interface Props {
  floors: Floor[]
  activeFloorId: string
  onSelect: (floorId: string) => void
}

export default function FloorTabs({ floors, activeFloorId, onSelect }: Props) {
  return (
    <div
      className="flex flex-col overflow-y-auto py-3"
      style={{ width: 108, background: '#111110', height: '100%' }}
    >
      <div
        className="px-3 mb-3"
        style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: '#57534e', textTransform: 'uppercase' }}
      >
        Floors
      </div>
      {floors.map((floor) => {
        const active = activeFloorId === floor.id
        return (
          <button
            key={floor.id}
            onClick={() => onSelect(floor.id)}
            className="text-left px-3 py-2.5 transition-colors relative"
            style={{
              background: active ? '#1c1c1b' : 'transparent',
              borderLeft: active ? '2px solid #e4e0d8' : '2px solid transparent',
            }}
          >
            {active && (
              <div
                style={{
                  position: 'absolute', right: 0, top: 0, bottom: 0, width: 1,
                  background: 'rgba(255,255,255,0.04)'
                }}
              />
            )}
            <div
              style={{
                fontSize: 11, fontWeight: active ? 600 : 400, lineHeight: 1.3,
                color: active ? '#f5f4f0' : '#78716c',
                letterSpacing: '0.01em',
              }}
            >
              {floor.label}
            </div>
            {floor.repeats > 1 && (
              <div style={{ fontSize: 9, color: active ? '#a8a29e' : '#57534e', marginTop: 1 }}>
                ×{floor.repeats} floors
              </div>
            )}
          </button>
        )
      })}
    </div>
  )
}
