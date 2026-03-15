'use client'

import { Zone, ZoneAllocation, UseType, ZoneStatus, USE_TYPE_COLORS, USE_TYPE_LABELS, ZONE_STATUS_CONFIG } from '@/types/planner'
import { useState, useEffect } from 'react'

const USE_TYPES: UseType[] = ['commercial', 'community', 'shared', 'lab', 'charitable', 'unassigned']
const ZONE_STATUSES: ZoneStatus[] = ['let', 'partially-let', 'vacant', 'refurb', 'out-of-use', 'shared']

interface Props {
  zone: Zone | null
  allocation?: ZoneAllocation
  onUpdate: (updates: Partial<ZoneAllocation & Zone>) => void
  onDelete: () => void
  onClose: () => void
}

const inputCls = 'w-full border border-stone-200 rounded-md px-2.5 py-1.5 text-sm text-stone-900 placeholder:text-stone-400 bg-white focus:outline-none focus:border-stone-400 focus:ring-1 focus:ring-stone-200 transition-colors'
const labelCls = 'block text-[11px] font-semibold text-stone-500 uppercase tracking-wider mb-1.5'

export default function ZoneDetailPanel({ zone, allocation, onUpdate, onDelete, onClose }: Props) {
  const [name, setName] = useState('')
  const [sqft, setSqft] = useState('')
  const [teamInput, setTeamInput] = useState('')
  const [sectorInput, setSectorInput] = useState('')

  useEffect(() => {
    if (zone) {
      setName(zone.name)
      setSqft(zone.sqft?.toString() ?? '')
    }
  }, [zone?.id])

  if (!zone) return null

  const useType = allocation?.useType ?? 'unassigned'
  const status = allocation?.status
  const teams = allocation?.teams ?? []
  const sectors = allocation?.sectors ?? []
  const color = USE_TYPE_COLORS[useType]

  return (
    <div
      className="flex flex-col h-full bg-white"
      style={{ width: 280, borderLeft: '1px solid #e7e3dc' }}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-stone-100">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1">
              <div
                className="text-[10px] font-bold uppercase tracking-widest"
                style={{ color: useType !== 'unassigned' ? color : '#a8a29e' }}
              >
                {USE_TYPE_LABELS[useType]}
              </div>
              {status && ZONE_STATUS_CONFIG[status] && (
                <span
                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: ZONE_STATUS_CONFIG[status].color + '22',
                    color: ZONE_STATUS_CONFIG[status].color,
                  }}
                >
                  {ZONE_STATUS_CONFIG[status].label}
                </span>
              )}
            </div>
            <h3 className="text-sm font-semibold text-stone-900 leading-snug truncate">{zone.name}</h3>
            {zone.sqft && (
              <div className="text-xs text-stone-500 mt-0.5">{zone.sqft.toLocaleString()} sq ft</div>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-700 text-xl leading-none mt-0.5 transition-colors"
          >
            ×
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* Name */}
        <div>
          <label className={labelCls}>Name</label>
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => onUpdate({ name })}
          />
        </div>

        {/* Area */}
        <div>
          <label className={labelCls}>Area (sq ft)</label>
          <input
            type="number"
            className={inputCls}
            value={sqft}
            placeholder="—"
            onChange={(e) => setSqft(e.target.value)}
            onBlur={() => onUpdate({ sqft: sqft ? Number(sqft) : undefined })}
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
                  onClick={() => onUpdate({ useType: ut, color: USE_TYPE_COLORS[ut] })}
                  className="px-2 py-0.5 rounded text-xs font-medium transition-all"
                  style={
                    active
                      ? { backgroundColor: USE_TYPE_COLORS[ut], color: ut === 'shared' ? '#292524' : '#fff' }
                      : { backgroundColor: '#f5f4f0', color: '#57534e', border: '1px solid #e7e3dc' }
                  }
                >
                  {USE_TYPE_LABELS[ut]}
                </button>
              )
            })}
          </div>
        </div>

        {/* Status */}
        <div>
          <label className={labelCls}>Status</label>
          <div className="flex flex-wrap gap-1.5">
            {ZONE_STATUSES.map((s) => {
              const active = status === s
              const cfg = ZONE_STATUS_CONFIG[s]
              return (
                <button
                  key={s}
                  onClick={() => onUpdate({ status: s })}
                  className="px-2 py-0.5 rounded text-xs font-medium transition-all"
                  style={
                    active
                      ? { backgroundColor: cfg.color, color: '#fff' }
                      : { backgroundColor: '#f5f4f0', color: '#57534e', border: '1px solid #e7e3dc' }
                  }
                >
                  {cfg.label}
                </button>
              )
            })}
          </div>

          {/* Let percentage — only for partially-let */}
          {status === 'partially-let' && (
            <div className="mt-2.5">
              <div className="text-[10px] text-stone-400 mb-1">% Let</div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  defaultValue={allocation?.letPercentage ?? 50}
                  key={zone.id + '-let-pct'}
                  className="flex-1 accent-amber-500"
                  onChange={(e) => onUpdate({ letPercentage: Number(e.target.value) })}
                />
                <span className="text-xs font-semibold text-stone-700 w-8 text-right">
                  {allocation?.letPercentage ?? 50}%
                </span>
              </div>
              <div className="flex justify-between text-[10px] text-stone-400 mt-0.5">
                <span style={{ color: '#10b981' }}>{allocation?.letPercentage ?? 50}% let</span>
                <span style={{ color: '#ef4444' }}>{100 - (allocation?.letPercentage ?? 50)}% vacant</span>
              </div>
            </div>
          )}
        </div>

        {/* Teams — commercial only */}
        {useType === 'commercial' && (
          <div>
            <label className={labelCls}>Teams</label>
            {teams.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {teams.map((t) => (
                  <span
                    key={t}
                    className="flex items-center gap-1 text-xs rounded px-2 py-0.5"
                    style={{ backgroundColor: '#f0ede8', color: '#292524' }}
                  >
                    {t}
                    <button
                      onClick={() => onUpdate({ teams: teams.filter((x) => x !== t) })}
                      className="opacity-50 hover:opacity-100 transition-opacity text-stone-700"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-1.5">
              <input
                className={inputCls + ' text-xs'}
                placeholder="Add team…"
                value={teamInput}
                onChange={(e) => setTeamInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && teamInput.trim()) {
                    onUpdate({ teams: [...teams, teamInput.trim()] })
                    setTeamInput('')
                  }
                }}
              />
              <button
                onClick={() => {
                  if (teamInput.trim()) {
                    onUpdate({ teams: [...teams, teamInput.trim()] })
                    setTeamInput('')
                  }
                }}
                className="px-3 py-1.5 text-xs font-medium bg-stone-900 text-white rounded-md hover:bg-stone-700 transition-colors whitespace-nowrap"
              >
                Add
              </button>
            </div>
          </div>
        )}

        {/* Sectors — community only */}
        {useType === 'community' && (
          <div>
            <label className={labelCls}>Sectors</label>
            {sectors.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {sectors.map((s) => (
                  <span
                    key={s}
                    className="flex items-center gap-1 text-xs rounded px-2 py-0.5"
                    style={{ backgroundColor: '#fef3c7', color: '#78350f' }}
                  >
                    {s}
                    <button
                      onClick={() => onUpdate({ sectors: sectors.filter((x) => x !== s) })}
                      className="opacity-50 hover:opacity-100 transition-opacity"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-1.5">
              <input
                className={inputCls + ' text-xs'}
                placeholder="Add sector…"
                value={sectorInput}
                onChange={(e) => setSectorInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && sectorInput.trim()) {
                    onUpdate({ sectors: [...sectors, sectorInput.trim()] })
                    setSectorInput('')
                  }
                }}
              />
              <button
                onClick={() => {
                  if (sectorInput.trim()) {
                    onUpdate({ sectors: [...sectors, sectorInput.trim()] })
                    setSectorInput('')
                  }
                }}
                className="px-3 py-1.5 text-xs font-medium bg-stone-900 text-white rounded-md hover:bg-stone-700 transition-colors whitespace-nowrap"
              >
                Add
              </button>
            </div>
          </div>
        )}

        {/* Rent — commercial only */}
        {useType === 'commercial' && (
          <div>
            <label className={labelCls}>Rent (£/sqft/yr)</label>
            <input
              type="number"
              className={inputCls}
              placeholder="—"
              defaultValue={allocation?.rentPerSqft ?? ''}
              key={zone.id + '-rent'}
              onBlur={(e) => onUpdate({ rentPerSqft: e.target.value ? Number(e.target.value) : undefined })}
            />
          </div>
        )}

        {/* Members — community only */}
        {useType === 'community' && (
          <div>
            <label className={labelCls}>Members</label>
            <input
              type="number"
              className={inputCls}
              placeholder="0"
              defaultValue={allocation?.memberCount ?? ''}
              key={zone.id + '-members'}
              onBlur={(e) => onUpdate({ memberCount: e.target.value ? Number(e.target.value) : undefined })}
            />
            {(allocation?.memberCount ?? 0) > 0 && (
              <div className="mt-1 text-[10px] text-stone-400">
                £{((allocation?.memberCount ?? 0) * 100 * 12).toLocaleString()} /yr
              </div>
            )}
          </div>
        )}

        {/* Costs — all types except unassigned */}
        {useType !== 'unassigned' && (
          <div>
            <label className={labelCls}>Costs</label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="text-[10px] text-stone-400 mb-1">Business Rates (£/sqft/yr)</div>
                <input
                  type="number"
                  className={inputCls}
                  placeholder="22"
                  defaultValue={allocation?.councilTaxPerSqft ?? 22}
                  key={zone.id + '-council-tax'}
                  onBlur={(e) => onUpdate({ councilTaxPerSqft: e.target.value ? Number(e.target.value) : 22 })}
                />
              </div>
              <div>
                <div className="text-[10px] text-stone-400 mb-1">Energy (£/yr)</div>
                <input
                  type="number"
                  className={inputCls}
                  placeholder="0"
                  defaultValue={allocation?.energyCost ?? 0}
                  key={zone.id + '-energy'}
                  onBlur={(e) => onUpdate({ energyCost: e.target.value ? Number(e.target.value) : 0 })}
                />
              </div>
            </div>
          </div>
        )}

        {/* Notes */}
        <div>
          <label className={labelCls}>Notes</label>
          <textarea
            className={inputCls + ' resize-none'}
            rows={3}
            placeholder="—"
            defaultValue={allocation?.notes ?? ''}
            key={zone.id + '-notes'}
            onBlur={(e) => onUpdate({ notes: e.target.value })}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-3" style={{ borderTop: '1px solid #f0ede8' }}>
        <button
          onClick={onDelete}
          className="w-full py-1.5 text-xs font-semibold text-red-600 rounded-md transition-colors hover:bg-red-50"
          style={{ border: '1px solid #fecaca' }}
        >
          Delete Zone
        </button>
      </div>
    </div>
  )
}
