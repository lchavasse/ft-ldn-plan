export interface Zone {
  id: string
  name: string
  polygon: [number, number][]  // normalized 0–1
  sqft?: number
}

export interface Floor {
  id: string
  label: string
  imagePath: string
  repeats: number
  zones: Zone[]
}

export interface Building {
  floors: Floor[]
}

export type UseType = 'commercial' | 'community' | 'shared' | 'lab' | 'charitable' | 'unassigned'

export const USE_TYPE_COLORS: Record<UseType, string> = {
  commercial: '#1d4ed8',
  community:  '#dc2626',
  shared:     '#64748b',
  lab:        '#059669',
  charitable: '#15803d',
  unassigned: 'transparent',
}

export const USE_TYPE_LABELS: Record<UseType, string> = {
  commercial: 'Commercial',
  community:  'Community',
  shared:     'Shared',
  lab:        'Lab',
  charitable: 'Charitable',
  unassigned: 'Unassigned',
}

// Status values — merged letting + operational status
export type ZoneStatus = 'let' | 'partially-let' | 'vacant' | 'refurb' | 'out-of-use' | 'shared'

export const ZONE_STATUS_CONFIG: Record<ZoneStatus, { label: string; color: string }> = {
  'let':         { label: 'Let',         color: '#10b981' },
  'partially-let': { label: 'Partially Let', color: '#f59e0b' },
  'vacant':      { label: 'Vacant',      color: '#ef4444' },
  'refurb':      { label: 'Refurb',      color: '#fb923c' },
  'out-of-use':  { label: 'Out of Use',  color: '#6b7280' },
  'shared':      { label: 'Shared',      color: '#64748b' },
}

// ─── Combined use type × status display color for floorplan / 3D ─────────────
//
// Use type = hue family; status = saturation/lightness modifier:
//   let/shared  → full saturation
//   partially-let → medium
//   vacant      → pale/washed out
//   refurb      → orange (warning: action needed) — same for all use types
//   out-of-use  → grey — same for all use types
//   no status   → base use type colour

const STATUS_TINTS: Record<UseType, Partial<Record<ZoneStatus, string>>> = {
  commercial: {
    'let':           '#1d4ed8',  // deep blue
    'partially-let': '#3b82f6',  // medium blue
    'vacant':        '#93c5fd',  // light but visible blue
    'shared':        '#1d4ed8',
  },
  community: {
    'let':           '#dc2626',  // strong red
    'partially-let': '#f87171',  // medium red
    'vacant':        '#fca5a5',  // light pink-red
    'shared':        '#dc2626',
  },
  shared: {
    'let':           '#64748b',  // slate
    'partially-let': '#94a3b8',  // light slate
    'vacant':        '#cbd5e1',  // pale slate
    'shared':        '#64748b',
  },
  lab: {
    'let':           '#059669',  // deep green
    'partially-let': '#10b981',  // medium green
    'vacant':        '#6ee7b7',  // light green
    'shared':        '#059669',
  },
  charitable: {
    'let':           '#15803d',  // forest green
    'partially-let': '#22c55e',  // medium green
    'vacant':        '#86efac',  // light green
    'shared':        '#15803d',
  },
  unassigned: {},
}

export function getZoneDisplayColor(useType: UseType, status?: ZoneStatus | string): string {
  if (useType === 'unassigned') return 'transparent'
  if (status === 'out-of-use') return '#9ca3af'
  if (status === 'refurb') return '#fb923c'
  const tint = status ? STATUS_TINTS[useType]?.[status as ZoneStatus] : undefined
  return tint ?? USE_TYPE_COLORS[useType]
}

export interface ZoneAllocation {
  floorId: string
  zoneId: string
  useType: UseType
  color: string
  status?: ZoneStatus
  letPercentage?: number     // 0–100, only for status === 'partially-let'
  teams?: string[]           // commercial only
  sectors?: string[]         // community only
  rentPerSqft?: number       // £/sqft/year — commercial only
  ratesInclusive?: boolean   // commercial only — lease includes rates; rates deducted from revenue
  memberCount?: number       // community only — each member generates £100/month
  councilTaxPerSqft?: number // £/sqft/year — pre-filled to 22
  energyCost?: number        // £/year — default 0
  notes?: string
}

export interface Scenario {
  id: string
  name: string
  createdAt: string
  allocations: ZoneAllocation[]
  miscRevenue?: number   // £/year — car parking, etc.
  miscCost?: number      // £/year — commercial misc costs
}

// ─── Revenue & cost helpers ───────────────────────────────────────────────────

export function calcAnnualRevenue(a: ZoneAllocation, sqft: number | undefined): number {
  if (!sqft) return 0
  const status = a.status
  if (a.useType === 'commercial') {
    if (!a.rentPerSqft) return 0
    const ratesDeduction = a.ratesInclusive ? (a.councilTaxPerSqft ?? 22) * sqft : 0
    const base = a.rentPerSqft * sqft - ratesDeduction
    if (status === 'let') return base
    if (status === 'partially-let') return base * ((a.letPercentage ?? 0) / 100)
    return 0
  }
  if (a.useType === 'community') {
    const base = (a.memberCount ?? 0) * 100 * 12
    if (status === 'partially-let') return base * ((a.letPercentage ?? 0) / 100)
    return base
  }
  return 0
}

export function calcAnnualCost(a: ZoneAllocation, sqft: number | undefined): number {
  if (!sqft) return (a.energyCost ?? 0)
  const ctRate = a.councilTaxPerSqft ?? 22
  const energy = a.energyCost ?? 0

  if (a.useType === 'unassigned') return 0

  // Out-of-use: no rates for any use type
  if (a.status === 'out-of-use') return energy

  if (a.useType === 'commercial') {
    // Let: tenant pays rates; vacant/refurb: 3-month relief → rates shown in brackets, not in cost
    return energy
  }

  // community, shared, lab, charitable — always pay rates
  return ctRate * sqft + energy
}

// Business rates portion for charitable zones — shown as reducible sub-total
export function calcCharitableRates(a: ZoneAllocation, sqft: number | undefined): number {
  if (!sqft || a.useType !== 'charitable' || a.status === 'out-of-use') return 0
  return (a.councilTaxPerSqft ?? 22) * sqft
}

// Revenue that could be earned if vacant portions were filled (commercial only)
export function calcPotentialRevenue(a: ZoneAllocation, sqft: number | undefined): number {
  if (!sqft || !a.rentPerSqft || a.useType !== 'commercial') return 0
  const status = a.status
  if (status === 'vacant' || status === 'refurb') return a.rentPerSqft * sqft
  if (status === 'partially-let') return a.rentPerSqft * sqft * (1 - (a.letPercentage ?? 0) / 100)
  return 0
}

// Business rates on vacant commercial — excluded from cost, shown in brackets
export function calcVacantRates(a: ZoneAllocation, sqft: number | undefined): number {
  if (!sqft || a.useType !== 'commercial') return 0
  if (a.status === 'out-of-use') return 0  // truly exempt
  const ctRate = a.councilTaxPerSqft ?? 22
  const status = a.status
  if (status === 'vacant' || status === 'refurb') return ctRate * sqft
  if (status === 'partially-let') return ctRate * sqft * (1 - (a.letPercentage ?? 0) / 100)
  return 0
}

// ─── Migration ────────────────────────────────────────────────────────────────

type OldUseType = 'office' | 'robotics' | 'social' | 'amenity' | 'circulation' | 'plant' | 'parking' | 'storage' | 'lab' | 'unassigned'

const OLD_TO_NEW: Record<OldUseType, UseType> = {
  office: 'commercial',
  robotics: 'commercial',
  social: 'community',
  amenity: 'community',
  circulation: 'shared',
  plant: 'shared',
  parking: 'shared',
  storage: 'shared',
  lab: 'lab',
  unassigned: 'unassigned',
}

const VALID_STATUSES = new Set<string>(['let', 'partially-let', 'vacant', 'refurb', 'out-of-use', 'shared'])

export function migrateScenarios(scenarios: Scenario[]): Scenario[] {
  return scenarios.map((s) => ({
    ...s,
    allocations: s.allocations.map((a) => {
      const mapped = OLD_TO_NEW[a.useType as OldUseType]
      const useType = mapped ?? a.useType
      const status = a.status && VALID_STATUSES.has(a.status) ? a.status : undefined
      return { ...a, useType, color: USE_TYPE_COLORS[useType], status }
    }),
  }))
}
