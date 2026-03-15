'use client'

import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import {
  Building, Scenario, ZoneAllocation, UseType, ZoneStatus,
  USE_TYPE_LABELS, USE_TYPE_COLORS, ZONE_STATUS_CONFIG,
  calcAnnualRevenue, calcAnnualCost, calcPotentialRevenue, calcVacantRates, calcCharitableRates,
} from '@/types/planner'

interface Props {
  building: Building
  scenario: Scenario
  onUpdate: (floorId: string, zoneId: string, updates: Partial<ZoneAllocation & { name: string; sqft: number | undefined }>) => void
  onUpdateScenario: (updates: Partial<Scenario>) => void
}

interface Row {
  floorId: string
  floorLabel: string
  zoneId: string
  zoneName: string
  sqft: number | undefined
  useType: UseType
  status: string | undefined
  letPercentage: number | undefined
  rentPerSqft: number | undefined
  memberCount: number | undefined
  councilTaxPerSqft: number | undefined
  energyCost: number | undefined
  annualRevenue: number
  potentialRevenue: number
  vacantRates: number
  commercialCost: number   // energy only (commercial zones)
  communityCost: number    // rates + energy (community / shared / lab / charitable zones)
  charitableRates: number  // rates portion of charitable zones — potentially reducible
}

type SortKey = keyof Row
type SortDir = 'asc' | 'desc'
type EditingCell = { zoneId: string; field: string }
type AreaUnit = 'sqft' | 'sqm'

const SQFT_TO_SQM = 0.092903
const areaConvert = (val: number | undefined, unit: AreaUnit): number | undefined =>
  val !== undefined ? (unit === 'sqm' ? val * SQFT_TO_SQM : val) : undefined
const rateConvert = (val: number | undefined, unit: AreaUnit): number | undefined =>
  val !== undefined ? (unit === 'sqm' ? val / SQFT_TO_SQM : val) : undefined
const areaRevert = (val: number | undefined, unit: AreaUnit): number | undefined =>
  val !== undefined ? (unit === 'sqm' ? val / SQFT_TO_SQM : val) : undefined
const rateRevert = (val: number | undefined, unit: AreaUnit): number | undefined =>
  val !== undefined ? (unit === 'sqm' ? val * SQFT_TO_SQM : val) : undefined

const USE_TYPES: UseType[] = ['commercial', 'community', 'shared', 'lab', 'unassigned']
const ZONE_STATUSES: ZoneStatus[] = ['let', 'partially-let', 'vacant', 'refurb', 'out-of-use', 'shared']
const USE_TYPE_FILTER_OPTIONS: (UseType | 'all')[] = ['all', 'commercial', 'community', 'shared', 'lab', 'charitable', 'unassigned']

function fmt(val: number): string {
  if (val === 0) return '—'
  return '£' + val.toLocaleString('en-GB', { maximumFractionDigits: 0 })
}

function fmtOpt(val: number | undefined): string {
  if (val === undefined) return '—'
  return val.toLocaleString('en-GB', { maximumFractionDigits: 2 })
}

// ─── Inline number cell ───────────────────────────────────────────────────────

function NumCell({
  value, zoneId, field, editing, onStartEdit, onCommit, onCancel, align = 'right', placeholder = '—',
}: {
  value: number | undefined
  zoneId: string
  field: string
  editing: boolean
  onStartEdit: () => void
  onCommit: (val: number | undefined) => void
  onCancel: () => void
  align?: 'left' | 'right'
  placeholder?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [local, setLocal] = useState('')

  useEffect(() => {
    if (editing) {
      setLocal(value?.toString() ?? '')
      setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 0)
    }
  }, [editing])

  const commit = () => onCommit(local !== '' ? Number(local) : undefined)

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') onCancel() }}
        className="w-full bg-white border border-blue-400 rounded px-1.5 py-0.5 text-xs tabular-nums focus:outline-none"
        style={{ textAlign: align }}
      />
    )
  }

  return (
    <span
      onClick={onStartEdit}
      className="block w-full cursor-text rounded px-1 py-0.5 hover:bg-stone-100 transition-colors"
      style={{ textAlign: align, minWidth: 40 }}
      title="Click to edit"
    >
      {value !== undefined ? fmtOpt(value) : <span className="text-stone-300">{placeholder}</span>}
    </span>
  )
}

// ─── Text cell ────────────────────────────────────────────────────────────────

function TextCell({
  value, editing, onStartEdit, onCommit, onCancel,
}: {
  value: string
  editing: boolean
  onStartEdit: () => void
  onCommit: (val: string) => void
  onCancel: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [local, setLocal] = useState('')

  useEffect(() => {
    if (editing) {
      setLocal(value)
      setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 0)
    }
  }, [editing])

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => onCommit(local)}
        onKeyDown={(e) => { if (e.key === 'Enter') onCommit(local); if (e.key === 'Escape') onCancel() }}
        className="w-full bg-white border border-blue-400 rounded px-1.5 py-0.5 text-xs focus:outline-none"
      />
    )
  }

  return (
    <span
      onClick={onStartEdit}
      className="block cursor-text rounded px-1 py-0.5 hover:bg-stone-100 transition-colors font-medium text-stone-900"
      title="Click to edit"
    >
      {value || <span className="text-stone-300 font-normal">—</span>}
    </span>
  )
}

// ─── Dropdown cell ────────────────────────────────────────────────────────────

function DropdownCell({
  trigger, options, open, onOpen, onSelect, onClose,
}: {
  trigger: React.ReactNode
  options: { value: string; label: string; color?: string }[]
  open: boolean
  onOpen: () => void
  onSelect: (val: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, onClose])

  return (
    <div ref={ref} className="relative inline-block">
      <div
        onClick={onOpen}
        className="cursor-pointer rounded px-1 py-0.5 hover:bg-stone-100 transition-colors"
        title="Click to change"
      >
        {trigger}
      </div>
      {open && (
        <div
          className="absolute top-full left-0 mt-1 rounded-md shadow-lg overflow-hidden z-50"
          style={{ background: '#fff', border: '1px solid #e7e3dc', minWidth: 130 }}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              onMouseDown={(e) => { e.preventDefault(); onSelect(opt.value); onClose() }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-stone-50 transition-colors flex items-center gap-2"
            >
              {opt.color && (
                <span
                  className="inline-block w-2 h-2 rounded-full shrink-0"
                  style={{ background: opt.color === 'transparent' ? '#e7e3dc' : opt.color }}
                />
              )}
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function TableView({ building, scenario, onUpdate, onUpdateScenario }: Props) {
  const [filter, setFilter] = useState<UseType | 'all'>('all')
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null)
  const [unit, setUnit] = useState<AreaUnit>('sqft')

  const unitLabel = unit === 'sqm' ? 'sq m' : 'sq ft'
  const unitRateLabel = unit === 'sqm' ? 'sqm' : 'sqft'

  const isEditing = (zoneId: string, field: string) =>
    editingCell?.zoneId === zoneId && editingCell?.field === field

  const startEdit = (zoneId: string, field: string) => setEditingCell({ zoneId, field })
  const cancelEdit = () => setEditingCell(null)

  const commit = useCallback(
    (row: Row, field: string, value: unknown) => {
      setEditingCell(null)
      onUpdate(row.floorId, row.zoneId, { [field]: value } as Partial<ZoneAllocation & { name: string; sqft: number | undefined }>)
    },
    [onUpdate]
  )

  const rows: Row[] = useMemo(() => {
    const result: Row[] = []
    for (const floor of building.floors) {
      for (const zone of floor.zones) {
        const alloc = scenario.allocations.find(
          (a) => a.floorId === floor.id && a.zoneId === zone.id
        )
        const useType: UseType = alloc?.useType ?? 'unassigned'
        result.push({
          floorId: floor.id,
          floorLabel: floor.label,
          zoneId: zone.id,
          zoneName: zone.name,
          sqft: zone.sqft,
          useType,
          status: alloc?.status,
          letPercentage: alloc?.letPercentage,
          rentPerSqft: alloc?.rentPerSqft,
          memberCount: alloc?.memberCount,
          councilTaxPerSqft: alloc?.councilTaxPerSqft,
          energyCost: alloc?.energyCost,
          annualRevenue: alloc ? calcAnnualRevenue(alloc, zone.sqft) : 0,
          potentialRevenue: alloc ? calcPotentialRevenue(alloc, zone.sqft) : 0,
          vacantRates: alloc ? calcVacantRates(alloc, zone.sqft) : 0,
          commercialCost:  (alloc && useType === 'commercial') ? calcAnnualCost(alloc, zone.sqft) : 0,
          communityCost:   (alloc && useType !== 'commercial' && useType !== 'unassigned') ? calcAnnualCost(alloc, zone.sqft) : 0,
          charitableRates: alloc ? calcCharitableRates(alloc, zone.sqft) : 0,
        })
      }
    }
    return result
  }, [building, scenario])

  const filtered = useMemo(
    () => (filter === 'all' ? rows : rows.filter((r) => r.useType === filter)),
    [rows, filter]
  )

  const sorted = useMemo(() => {
    if (!sortKey) return filtered
    return [...filtered].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (av === undefined || av === null) return 1
      if (bv === undefined || bv === null) return -1
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av
      }
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av))
    })
  }, [filtered, sortKey, sortDir])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  const grouped = useMemo(() => {
    if (sortKey) return []
    const map = new Map<string, Row[]>()
    for (const row of sorted) {
      const existing = map.get(row.floorId) ?? []
      existing.push(row)
      map.set(row.floorId, existing)
    }
    return Array.from(map.entries()).map(([, rows]) => ({
      floorLabel: rows[0].floorLabel,
      rows,
    }))
  }, [sorted, sortKey])

  // Summary sqft tiles — always computed from all rows (not filtered)
  // Lab is grouped with charitable for display purposes
  const sqftSummary = useMemo(() => {
    let commercialLet = 0, commercialLetRevenue = 0
    let commercialVacant = 0, commercialVacantRevenue = 0
    let community = 0, communityOOU = 0, communityRevenue = 0
    let shared = 0, sharedOOU = 0
    let charitable = 0, charitableOOU = 0  // includes lab

    for (const r of rows) {
      const s = r.sqft ?? 0
      if (r.useType === 'commercial') {
        if (r.status === 'let') { commercialLet += s; commercialLetRevenue += r.annualRevenue }
        else if (r.status === 'partially-let') {
          const pct = (r.letPercentage ?? 0) / 100
          commercialLet += s * pct
          commercialLetRevenue += r.annualRevenue
          commercialVacant += s * (1 - pct)
          commercialVacantRevenue += r.potentialRevenue
        } else if (r.status === 'vacant' || r.status === 'refurb') {
          commercialVacant += s
          commercialVacantRevenue += r.potentialRevenue
        }
      } else if (r.useType === 'community') {
        if (r.status === 'out-of-use') communityOOU += s
        else { community += s; communityRevenue += r.annualRevenue }
      } else if (r.useType === 'shared') {
        if (r.status === 'out-of-use') sharedOOU += s
        else shared += s
      } else if (r.useType === 'lab' || r.useType === 'charitable') {
        if (r.status === 'out-of-use') charitableOOU += s
        else charitable += s
      }
    }
    return {
      commercialLet, commercialLetRevenue,
      commercialVacant, commercialVacantRevenue,
      community, communityOOU, communityRevenue,
      shared, sharedOOU, charitable, charitableOOU,
    }
  }, [rows])

  const grandTotals = useMemo(() => ({
    sqft: sorted.reduce((s, r) => s + (r.sqft ?? 0), 0),
    annualRevenue: sorted.reduce((s, r) => s + r.annualRevenue, 0) + (scenario.miscRevenue ?? 0),
    potentialRevenue: sorted.reduce((s, r) => s + r.potentialRevenue, 0),
    commercialCost: sorted.reduce((s, r) => s + r.commercialCost, 0) + (scenario.miscCost ?? 0),
    vacantRates: sorted.reduce((s, r) => s + r.vacantRates, 0),
    communityCost: sorted.reduce((s, r) => s + r.communityCost, 0),
    charitableRates: sorted.reduce((s, r) => s + r.charitableRates, 0),
  }), [sorted, scenario.miscRevenue, scenario.miscCost])

  const thCls = 'px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-white cursor-pointer select-none hover:bg-white/10 transition-colors whitespace-nowrap'
  const thNumCls = thCls + ' text-right'
  const tdCls = 'px-2 py-1.5 text-xs text-stone-700 whitespace-nowrap'
  const tdNumCls = tdCls + ' text-right tabular-nums'

  const SortIndicator = ({ col }: { col: SortKey }) =>
    sortKey === col ? <span className="ml-1 opacity-70">{sortDir === 'asc' ? '↑' : '↓'}</span> : null

  // Use type badge (also used in dropdown trigger)
  const UseTypeBadge = ({ useType }: { useType: UseType }) => {
    const typeColor = USE_TYPE_COLORS[useType]
    const typeLabel = USE_TYPE_LABELS[useType] ?? useType
    if (!typeColor) return <span className="text-stone-400 text-[10px]">{typeLabel}</span>
    return (
      <span
        className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold"
        style={{
          backgroundColor: typeColor === 'transparent' ? '#f5f4f0' : typeColor + '22',
          color: typeColor === 'transparent' ? '#a8a29e' : typeColor,
        }}
      >
        {typeLabel}
      </span>
    )
  }

  // Status badge
  const StatusBadge = ({ status, letPercentage }: { status: string | undefined; letPercentage: number | undefined }) => {
    if (!status || !ZONE_STATUS_CONFIG[status as ZoneStatus]) return <span className="text-stone-300 text-xs">—</span>
    const cfg = ZONE_STATUS_CONFIG[status as ZoneStatus]
    return (
      <span
        className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold"
        style={{ backgroundColor: cfg.color + '22', color: cfg.color }}
      >
        {cfg.label}
        {status === 'partially-let' && letPercentage !== undefined && ` (${letPercentage}%)`}
      </span>
    )
  }

  const renderRow = (row: Row, idx: number) => (
    <tr key={row.zoneId} style={{ background: idx % 2 === 0 ? '#f9f8f6' : '#fff' }}>
      {/* Floor — read-only */}
      <td className={tdCls + ' text-stone-400'}>{row.floorLabel}</td>

      {/* Zone Name — editable text */}
      <td className={tdCls}>
        <TextCell
          value={row.zoneName}
          editing={isEditing(row.zoneId, 'name')}
          onStartEdit={() => startEdit(row.zoneId, 'name')}
          onCommit={(v) => commit(row, 'name', v)}
          onCancel={cancelEdit}
        />
      </td>

      {/* Area — editable number */}
      <td className={tdNumCls}>
        <NumCell
          value={areaConvert(row.sqft, unit)}
          zoneId={row.zoneId}
          field="sqft"
          editing={isEditing(row.zoneId, 'sqft')}
          onStartEdit={() => startEdit(row.zoneId, 'sqft')}
          onCommit={(v) => commit(row, 'sqft', areaRevert(v, unit))}
          onCancel={cancelEdit}
          placeholder="—"
        />
      </td>

      {/* Use Type — dropdown */}
      <td className={tdCls}>
        <DropdownCell
          trigger={<UseTypeBadge useType={row.useType} />}
          options={USE_TYPES.map((ut) => ({
            value: ut,
            label: USE_TYPE_LABELS[ut],
            color: USE_TYPE_COLORS[ut],
          }))}
          open={isEditing(row.zoneId, 'useType')}
          onOpen={() => startEdit(row.zoneId, 'useType')}
          onSelect={(v) => commit(row, 'useType', v)}
          onClose={cancelEdit}
        />
      </td>

      {/* Status — dropdown + optional let% */}
      <td className={tdCls}>
        <DropdownCell
          trigger={<StatusBadge status={row.status} letPercentage={row.letPercentage} />}
          options={ZONE_STATUSES.map((s) => ({
            value: s,
            label: ZONE_STATUS_CONFIG[s].label,
            color: ZONE_STATUS_CONFIG[s].color,
          }))}
          open={isEditing(row.zoneId, 'status')}
          onOpen={() => startEdit(row.zoneId, 'status')}
          onSelect={(v) => commit(row, 'status', v)}
          onClose={cancelEdit}
        />
        {row.status === 'partially-let' && (
          <div className="mt-0.5">
            <NumCell
              value={row.letPercentage}
              zoneId={row.zoneId}
              field="letPercentage"
              editing={isEditing(row.zoneId, 'letPercentage')}
              onStartEdit={() => startEdit(row.zoneId, 'letPercentage')}
              onCommit={(v) => commit(row, 'letPercentage', v)}
              onCancel={cancelEdit}
              placeholder="50%"
            />
          </div>
        )}
      </td>

      {/* Rent — editable, commercial only */}
      <td className={tdNumCls}>
        {row.useType === 'commercial' ? (
          <NumCell
            value={rateConvert(row.rentPerSqft, unit)}
            zoneId={row.zoneId}
            field="rentPerSqft"
            editing={isEditing(row.zoneId, 'rentPerSqft')}
            onStartEdit={() => startEdit(row.zoneId, 'rentPerSqft')}
            onCommit={(v) => commit(row, 'rentPerSqft', rateRevert(v, unit))}
            onCancel={cancelEdit}
          />
        ) : <span className="text-stone-200">—</span>}
      </td>

      {/* Members — editable, community only */}
      <td className={tdNumCls}>
        {row.useType === 'community' ? (
          <NumCell
            value={row.memberCount}
            zoneId={row.zoneId}
            field="memberCount"
            editing={isEditing(row.zoneId, 'memberCount')}
            onStartEdit={() => startEdit(row.zoneId, 'memberCount')}
            onCommit={(v) => commit(row, 'memberCount', v)}
            onCancel={cancelEdit}
          />
        ) : <span className="text-stone-200">—</span>}
      </td>

      {/* Council Tax rate — editable */}
      <td className={tdNumCls}>
        {row.useType !== 'unassigned' ? (
          <NumCell
            value={rateConvert(row.councilTaxPerSqft, unit)}
            zoneId={row.zoneId}
            field="councilTaxPerSqft"
            editing={isEditing(row.zoneId, 'councilTaxPerSqft')}
            onStartEdit={() => startEdit(row.zoneId, 'councilTaxPerSqft')}
            onCommit={(v) => commit(row, 'councilTaxPerSqft', rateRevert(v, unit) ?? 22)}
            onCancel={cancelEdit}
          />
        ) : <span className="text-stone-200">—</span>}
      </td>

      {/* Energy — editable */}
      <td className={tdNumCls}>
        {row.useType !== 'unassigned' ? (
          <NumCell
            value={row.energyCost}
            zoneId={row.zoneId}
            field="energyCost"
            editing={isEditing(row.zoneId, 'energyCost')}
            onStartEdit={() => startEdit(row.zoneId, 'energyCost')}
            onCommit={(v) => commit(row, 'energyCost', v ?? 0)}
            onCancel={cancelEdit}
            placeholder="0"
          />
        ) : <span className="text-stone-200">—</span>}
      </td>

      {/* Annual Revenue — calculated */}
      <td className={tdNumCls + ' font-medium text-stone-900'}>{row.annualRevenue > 0 ? fmt(row.annualRevenue) : '—'}</td>

      {/* Potential Revenue — calculated */}
      <td className={tdNumCls}>
        {row.potentialRevenue > 0 ? (
          <span style={{ color: '#f59e0b' }}>{fmt(row.potentialRevenue)}</span>
        ) : '—'}
      </td>

      {/* Vacant Commercial Cost — energy only (rates in brackets) */}
      <td className={tdNumCls + ' font-medium text-stone-900'}>
        {row.commercialCost > 0 ? fmt(row.commercialCost) : row.useType === 'commercial' ? '—' : ''}
        {row.vacantRates > 0 && (
          <div className="text-[10px] font-normal" style={{ color: '#a8a29e' }}>
            (+{fmt(row.vacantRates)} rates)
          </div>
        )}
      </td>

      {/* Community / Shared Cost — rates + energy */}
      <td className={tdNumCls + ' font-medium text-stone-900'}>
        {row.communityCost > 0 ? fmt(row.communityCost) : row.useType !== 'commercial' && row.useType !== 'unassigned' ? '—' : ''}
      </td>
    </tr>
  )

  const renderSubtotalRow = (rows: Row[]) => {
    const sqftTotal = rows.reduce((s, r) => s + (r.sqft ?? 0), 0)
    const revTotal = rows.reduce((s, r) => s + r.annualRevenue, 0)
    const potentialTotal = rows.reduce((s, r) => s + r.potentialRevenue, 0)
    const commCostTotal = rows.reduce((s, r) => s + r.commercialCost, 0)
    const vacantRatesTotal = rows.reduce((s, r) => s + r.vacantRates, 0)
    const communityTotal = rows.reduce((s, r) => s + r.communityCost, 0)
    const charitableTotal = rows.reduce((s, r) => s + r.charitableRates, 0)
    return (
      <tr style={{ background: '#f0efe9', borderTop: '1px solid #e7e3dc', borderBottom: '1px solid #e7e3dc' }}>
        <td className={tdCls + ' font-semibold text-stone-600'} colSpan={2}>Subtotal</td>
        <td className={tdNumCls + ' font-semibold text-stone-700'}>{sqftTotal > 0 ? Math.round(areaConvert(sqftTotal, unit)!).toLocaleString() : '—'}</td>
        <td colSpan={6} />
        <td className={tdNumCls + ' font-semibold text-stone-700'}>{revTotal > 0 ? fmt(revTotal) : '—'}</td>
        <td className={tdNumCls + ' font-semibold'} style={{ color: potentialTotal > 0 ? '#f59e0b' : undefined }}>
          {potentialTotal > 0 ? fmt(potentialTotal) : '—'}
        </td>
        <td className={tdNumCls + ' font-semibold text-stone-700'}>
          {commCostTotal > 0 ? fmt(commCostTotal) : '—'}
          {vacantRatesTotal > 0 && (
            <div className="text-[10px] font-normal" style={{ color: '#a8a29e' }}>
              (+{fmt(vacantRatesTotal)} rates)
            </div>
          )}
        </td>
        <td className={tdNumCls + ' font-semibold text-stone-700'}>
          {communityTotal > 0 ? fmt(communityTotal) : '—'}
          {charitableTotal > 0 && (
            <div className="text-[10px] font-normal" style={{ color: '#15803d' }}>
              inc. {fmt(charitableTotal)} charitable rates
            </div>
          )}
        </td>
      </tr>
    )
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden" style={{ background: '#f9f8f6' }}>
      {/* Filter bar */}
      <div className="px-5 py-3 flex items-center gap-2 border-b border-stone-200 bg-white shrink-0">
        <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mr-1">Filter</span>
        {USE_TYPE_FILTER_OPTIONS.map((opt) => {
          const active = filter === opt
          const color = opt !== 'all' ? USE_TYPE_COLORS[opt] : undefined
          return (
            <button
              key={opt}
              onClick={() => setFilter(opt)}
              className="px-2.5 py-1 rounded text-xs font-medium transition-all"
              style={
                active
                  ? { backgroundColor: color && color !== 'transparent' ? color : '#111110', color: '#fff' }
                  : { backgroundColor: '#f5f4f0', color: '#57534e', border: '1px solid #e7e3dc' }
              }
            >
              {opt === 'all' ? 'All' : USE_TYPE_LABELS[opt]}
            </button>
          )
        })}
        <span className="ml-auto text-[10px] text-stone-400">
          Click any cell to edit · Click column header to sort
        </span>
        <div className="flex items-center rounded-md overflow-hidden border border-stone-200" style={{ fontSize: 11 }}>
          {(['sqft', 'sqm'] as AreaUnit[]).map((u) => (
            <button
              key={u}
              onClick={() => setUnit(u)}
              className="px-2 py-0.5 font-medium transition-colors"
              style={unit === u
                ? { background: '#111110', color: '#fff' }
                : { background: '#f5f4f0', color: '#57534e' }}
            >
              {u === 'sqft' ? 'sq ft' : 'sq m'}
            </button>
          ))}
        </div>
        <span className="text-xs text-stone-400">{sorted.length} zones</span>
      </div>

      {/* Sqft summary strip */}
      <div className="flex items-stretch gap-px shrink-0" style={{ background: '#e7e3dc' }}>
        {/* Commercial Let */}
        <div className="flex-1 px-4 py-3" style={{ background: '#eff6ff', borderBottom: '2px solid #1d4ed8' }}>
          <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#1d4ed8' }}>Commercial Let</div>
          <div className="text-lg font-bold tabular-nums" style={{ color: '#111110' }}>
            {Math.round(areaConvert(sqftSummary.commercialLet, unit)!).toLocaleString()}
            <span className="text-xs font-normal text-stone-400 ml-1">{unitLabel}</span>
          </div>
          {sqftSummary.commercialLetRevenue > 0 && (
            <div className="text-xs font-semibold tabular-nums mt-0.5" style={{ color: '#1d4ed8' }}>
              {fmt(sqftSummary.commercialLetRevenue)}<span className="text-[10px] font-normal text-stone-400 ml-1">/yr</span>
            </div>
          )}
        </div>

        {/* Commercial Vacant */}
        <div className="flex-1 px-4 py-3" style={{ background: '#f8faff', borderBottom: '2px solid #93c5fd' }}>
          <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#93c5fd' }}>Commercial Vacant</div>
          <div className="text-lg font-bold tabular-nums" style={{ color: '#111110' }}>
            {Math.round(areaConvert(sqftSummary.commercialVacant, unit)!).toLocaleString()}
            <span className="text-xs font-normal text-stone-400 ml-1">{unitLabel}</span>
          </div>
          {sqftSummary.commercialVacantRevenue > 0 && (
            <div className="text-xs font-semibold tabular-nums mt-0.5" style={{ color: '#f59e0b' }}>
              {fmt(sqftSummary.commercialVacantRevenue)}<span className="text-[10px] font-normal text-stone-400 ml-1">potential</span>
            </div>
          )}
        </div>

        {/* Community */}
        <div className="flex-1 px-4 py-3" style={{ background: '#fff5f5', borderBottom: '2px solid #dc2626' }}>
          <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#dc2626' }}>Community</div>
          <div className="text-lg font-bold tabular-nums" style={{ color: '#111110' }}>
            {Math.round(areaConvert(sqftSummary.community, unit)!).toLocaleString()}
            <span className="text-xs font-normal text-stone-400 ml-1">{unitLabel}</span>
          </div>
          {sqftSummary.communityRevenue > 0 && (
            <div className="text-xs font-semibold tabular-nums mt-0.5" style={{ color: '#dc2626' }}>
              {fmt(sqftSummary.communityRevenue)}<span className="text-[10px] font-normal text-stone-400 ml-1">/yr</span>
            </div>
          )}
          {sqftSummary.communityOOU > 0 && (
            <div className="text-[10px] text-stone-400 mt-0.5">+{Math.round(areaConvert(sqftSummary.communityOOU, unit)!).toLocaleString()} out of use</div>
          )}
        </div>

        {/* Shared (includes charitable + lab as sub-note) */}
        <div className="flex-1 px-4 py-3" style={{ background: '#f8f9fb', borderBottom: '2px solid #64748b' }}>
          <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#64748b' }}>Shared</div>
          <div className="text-lg font-bold tabular-nums" style={{ color: '#111110' }}>
            {Math.round(areaConvert(sqftSummary.shared + sqftSummary.charitable, unit)!).toLocaleString()}
            <span className="text-xs font-normal text-stone-400 ml-1">{unitLabel}</span>
          </div>
          {sqftSummary.charitable > 0 && (
            <div className="text-[10px] font-semibold mt-0.5" style={{ color: '#15803d' }}>
              inc. {Math.round(areaConvert(sqftSummary.charitable, unit)!).toLocaleString()} {unitLabel} "charitable"
            </div>
          )}
          {(sqftSummary.sharedOOU + sqftSummary.charitableOOU) > 0 && (
            <div className="text-[10px] text-stone-400 mt-0.5">
              +{Math.round(areaConvert(sqftSummary.sharedOOU + sqftSummary.charitableOOU, unit)!).toLocaleString()} out of use
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm" style={{ minWidth: 900 }}>
          <thead>
            <tr style={{ background: '#111110', position: 'sticky', top: 0, zIndex: 10 }}>
              <th className={thCls} onClick={() => handleSort('floorLabel')}>Floor <SortIndicator col="floorLabel" /></th>
              <th className={thCls} onClick={() => handleSort('zoneName')}>Zone Name <SortIndicator col="zoneName" /></th>
              <th className={thNumCls} onClick={() => handleSort('sqft')}>Area ({unitLabel}) <SortIndicator col="sqft" /></th>
              <th className={thCls} onClick={() => handleSort('useType')}>Use Type <SortIndicator col="useType" /></th>
              <th className={thCls} onClick={() => handleSort('status')}>Status <SortIndicator col="status" /></th>
              <th className={thNumCls} onClick={() => handleSort('rentPerSqft')}>Rent (£/{unitRateLabel}/yr) <SortIndicator col="rentPerSqft" /></th>
              <th className={thNumCls} onClick={() => handleSort('memberCount')}>Members <SortIndicator col="memberCount" /></th>
              <th className={thNumCls} onClick={() => handleSort('councilTaxPerSqft')}>Rates (£/{unitRateLabel}/yr) <SortIndicator col="councilTaxPerSqft" /></th>
              <th className={thNumCls} onClick={() => handleSort('energyCost')}>Energy (£/yr) <SortIndicator col="energyCost" /></th>
              <th className={thNumCls} onClick={() => handleSort('annualRevenue')}>Annual Revenue <SortIndicator col="annualRevenue" /></th>
              <th className={thNumCls} onClick={() => handleSort('potentialRevenue')} style={{ color: '#fcd34d' }}>Potential Rev <SortIndicator col="potentialRevenue" /></th>
              <th className={thNumCls} onClick={() => handleSort('commercialCost')} style={{ color: '#93c5fd' }}>Commercial Cost <SortIndicator col="commercialCost" /></th>
              <th className={thNumCls} onClick={() => handleSort('communityCost')} style={{ color: '#fca5a5' }}>Community Cost <SortIndicator col="communityCost" /></th>
            </tr>
          </thead>
          <tbody>
            {sortKey ? (
              sorted.map((row, i) => renderRow(row, i))
            ) : (
              grouped.map(({ floorLabel, rows: floorRows }) => (
                <>
                  <tr key={`floor-${floorLabel}`} style={{ background: '#f0efe9' }}>
                    <td className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-stone-500" colSpan={13}>
                      {floorLabel}
                    </td>
                  </tr>
                  {floorRows.map((row, i) => renderRow(row, i))}
                  {renderSubtotalRow(floorRows)}
                </>
              ))
            )}
            {/* Miscellaneous row */}
            <tr style={{ background: '#fafaf9', borderTop: '1px solid #e7e3dc' }}>
              <td className={tdCls + ' text-stone-400'} colSpan={2}>
                <span className="text-[10px] font-bold uppercase tracking-wider">Miscellaneous</span>
                <div className="text-[10px] text-stone-300 font-normal">Car parking, etc.</div>
              </td>
              <td colSpan={7} />
              <td className={tdNumCls}>
                <NumCell
                  value={scenario.miscRevenue}
                  zoneId="__misc__"
                  field="miscRevenue"
                  editing={isEditing('__misc__', 'miscRevenue')}
                  onStartEdit={() => startEdit('__misc__', 'miscRevenue')}
                  onCommit={(v) => { setEditingCell(null); onUpdateScenario({ miscRevenue: v ?? 0 }) }}
                  onCancel={cancelEdit}
                  placeholder="0"
                />
              </td>
              <td />
              <td className={tdNumCls}>
                <NumCell
                  value={scenario.miscCost}
                  zoneId="__misc__"
                  field="miscCost"
                  editing={isEditing('__misc__', 'miscCost')}
                  onStartEdit={() => startEdit('__misc__', 'miscCost')}
                  onCommit={(v) => { setEditingCell(null); onUpdateScenario({ miscCost: v ?? 0 }) }}
                  onCancel={cancelEdit}
                  placeholder="0"
                />
              </td>
              <td />
            </tr>
            <tr style={{ background: '#e8e6e0', borderTop: '2px solid #d6d3cb' }}>
              <td className={tdCls + ' font-bold text-stone-900'} colSpan={2}>Grand Total</td>
              <td className={tdNumCls + ' font-bold text-stone-900'}>{grandTotals.sqft > 0 ? Math.round(areaConvert(grandTotals.sqft, unit)!).toLocaleString() : '—'}</td>
              <td colSpan={6} />
              <td className={tdNumCls + ' font-bold text-stone-900'}>{fmt(grandTotals.annualRevenue)}</td>
              <td className={tdNumCls + ' font-bold'} style={{ color: grandTotals.potentialRevenue > 0 ? '#d97706' : '#292524' }}>
                {grandTotals.potentialRevenue > 0 ? fmt(grandTotals.potentialRevenue) : '—'}
              </td>
              <td className={tdNumCls + ' font-bold text-stone-900'}>
                {fmt(grandTotals.commercialCost)}
                {grandTotals.vacantRates > 0 && (
                  <div className="text-[10px] font-normal" style={{ color: '#a8a29e' }}>
                    (+{fmt(grandTotals.vacantRates)} rates)
                  </div>
                )}
              </td>
              <td className={tdNumCls + ' font-bold text-stone-900'}>
                {fmt(grandTotals.communityCost)}
                {grandTotals.charitableRates > 0 && (
                  <div className="text-[10px] font-normal" style={{ color: '#15803d' }}>
                    inc. {fmt(grandTotals.charitableRates)} "charitable" rates
                  </div>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
