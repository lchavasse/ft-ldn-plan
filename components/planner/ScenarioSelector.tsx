'use client'

import { Scenario } from '@/types/planner'
import { useState } from 'react'

interface Props {
  scenarios: Scenario[]
  activeId: string
  onSelect: (id: string) => void
  onNew: () => void
  onRename: (id: string, name: string) => void
}

export default function ScenarioSelector({ scenarios, activeId, onSelect, onNew, onRename }: Props) {
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const active = scenarios.find((s) => s.id === activeId)

  return (
    <div className="flex items-center gap-2">
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: '#78716c', textTransform: 'uppercase' }}>
        Scenario
      </span>
      {editing === activeId ? (
        <input
          autoFocus
          className="rounded px-2 py-1 text-sm text-stone-900 focus:outline-none"
          style={{ border: '1px solid #e4e0d8', background: '#fff', width: 120 }}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => { if (editValue.trim()) onRename(activeId, editValue.trim()); setEditing(null) }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { if (editValue.trim()) onRename(activeId, editValue.trim()); setEditing(null) }
            if (e.key === 'Escape') setEditing(null)
          }}
        />
      ) : (
        <select
          className="rounded px-2 py-1 text-sm text-white focus:outline-none cursor-pointer"
          style={{ border: '1px solid #333', background: '#1c1c1b', minWidth: 110 }}
          value={activeId}
          onChange={(e) => onSelect(e.target.value)}
        >
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      )}
      <button
        onClick={() => { if (active) { setEditValue(active.name); setEditing(activeId) } }}
        style={{ fontSize: 12, color: '#78716c', lineHeight: 1 }}
        className="hover:text-white transition-colors px-0.5"
        title="Rename"
      >
        ✎
      </button>
      <button
        onClick={onNew}
        className="text-white transition-colors"
        style={{
          fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
          background: '#2a2a28', border: '1px solid #3a3a38',
          borderRadius: 5, padding: '3px 10px',
        }}
      >
        + New
      </button>
    </div>
  )
}
