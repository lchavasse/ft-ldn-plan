'use client'

import { useEffect, useRef, useState } from 'react'
import { UseType, USE_TYPE_COLORS, USE_TYPE_LABELS } from '@/types/planner'

const USE_TYPES: UseType[] = ['commercial', 'community', 'shared', 'lab', 'charitable', 'unassigned']

interface Props {
  onSave: (name: string, sqft: number | undefined, useType: UseType) => void
  onDiscard: () => void
}

const inputCls = 'w-full border border-stone-200 rounded-md px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 bg-white focus:outline-none focus:border-stone-400 focus:ring-1 focus:ring-stone-200 transition-colors'
const labelCls = 'block text-[11px] font-bold uppercase tracking-wider text-stone-500 mb-1.5'

export default function NewZoneModal({ onSave, onDiscard }: Props) {
  const [name, setName] = useState('')
  const [sqft, setSqft] = useState('')
  const [useType, setUseType] = useState<UseType>('unassigned')
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => { nameRef.current?.focus() }, [])

  const handleSave = () => {
    if (!name.trim()) { nameRef.current?.focus(); return }
    onSave(name.trim(), sqft ? Number(sqft) : undefined, useType)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px]">
      <div
        className="bg-white w-full max-w-sm mx-4 overflow-hidden"
        style={{ borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)' }}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4" style={{ borderBottom: '1px solid #f0ede8' }}>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400">New Zone</span>
          </div>
          <p className="text-stone-900 font-semibold text-sm">Name this area</p>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Name */}
          <div>
            <label className={labelCls}>
              Name <span className="text-red-500 normal-case">*</span>
            </label>
            <input
              ref={nameRef}
              className={inputCls}
              placeholder="e.g. East Wing North, Car Park, Reception…"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
          </div>

          {/* Area */}
          <div>
            <label className={labelCls}>Area (sq ft)</label>
            <input
              type="number"
              className={inputCls}
              placeholder="optional"
              value={sqft}
              onChange={(e) => setSqft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
          </div>

          {/* Use Type */}
          <div>
            <label className={labelCls}>Use Type</label>
            <div className="flex flex-wrap gap-1.5">
              {USE_TYPES.map((ut) => {
                const active = useType === ut
                return (
                  <button
                    key={ut}
                    type="button"
                    onClick={() => setUseType(ut)}
                    className="px-2.5 py-1 rounded text-xs font-medium transition-all"
                    style={
                      active
                        ? { backgroundColor: USE_TYPE_COLORS[ut], color: '#fff' }
                        : { backgroundColor: '#f5f4f0', color: '#57534e', border: '1px solid #e7e3dc' }
                    }
                  >
                    {USE_TYPE_LABELS[ut]}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="px-5 py-4 flex gap-2 justify-end" style={{ borderTop: '1px solid #f0ede8' }}>
          <button
            onClick={onDiscard}
            className="px-4 py-2 text-sm text-stone-600 hover:text-stone-900 rounded-md hover:bg-stone-50 transition-colors"
          >
            Discard
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 text-sm font-semibold text-white rounded-md transition-colors"
            style={{ backgroundColor: '#111110' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#333')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#111110')}
          >
            Save Zone
          </button>
        </div>
      </div>
    </div>
  )
}
