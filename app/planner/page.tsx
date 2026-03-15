'use client'

import { useState, useEffect, useCallback } from 'react'
import { Building, Zone, Scenario, ZoneAllocation, UseType, USE_TYPE_COLORS, migrateScenarios } from '@/types/planner'
import FloorPlanViewer from '@/components/planner/FloorPlanViewer'
import FloorTabs from '@/components/planner/FloorTabs'
import ZoneDetailPanel from '@/components/planner/ZoneDetailPanel'
import ScenarioSelector from '@/components/planner/ScenarioSelector'
import Building3DView from '@/components/planner/Building3DView'
import NewZoneModal from '@/components/planner/NewZoneModal'
import TableView from '@/components/planner/TableView'

type ViewMode = 'birdseye' | 'isometric' | 'table'

export default function PlannerPage() {
  const [building, setBuilding] = useState<Building>({ floors: [] })
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [activeScenarioId, setActiveScenarioId] = useState<string>('')
  const [activeFloorId, setActiveFloorId] = useState<string>('')
  const [selectedZone, setSelectedZone] = useState<Zone | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('isometric')
  const [isDrawing, setIsDrawing] = useState(false)
  const [pendingPolygon, setPendingPolygon] = useState<[number, number][] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/building').then((r) => r.json()),
      fetch('/api/scenarios').then((r) => r.json()),
    ]).then(([bldg, scns]: [Building, Scenario[]]) => {
      setBuilding(bldg)
      if (bldg.floors.length > 0) {
        const ground = bldg.floors.find((f) => f.id === 'ground')
        setActiveFloorId(ground ? ground.id : bldg.floors[0].id)
      }
      const migrated = migrateScenarios(scns)
      setScenarios(migrated)
      if (migrated.length > 0) setActiveScenarioId(migrated[0].id)
      setLoading(false)
    })
  }, [])

  const activeScenario = scenarios.find((s) => s.id === activeScenarioId)
  const activeFloor = building.floors.find((f) => f.id === activeFloorId)
  const floorAllocations = activeScenario?.allocations.filter((a) => a.floorId === activeFloorId) ?? []

  const saveBuilding = useCallback((updated: Building) => {
    setBuilding(updated)
    fetch('/api/building', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    })
  }, [])

  const saveScenarios = useCallback((updated: Scenario[]) => {
    setScenarios(updated)
    fetch('/api/scenarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    })
  }, [])

  const updateAllocation = useCallback(
    (floorId: string, zoneId: string, updates: Partial<ZoneAllocation & Zone>) => {
      if ('name' in updates || 'sqft' in updates) {
        const updatedFloors = building.floors.map((f) => {
          if (f.id !== floorId) return f
          return {
            ...f,
            zones: f.zones.map((z) => {
              if (z.id !== zoneId) return z
              return {
                ...z,
                ...('name' in updates ? { name: updates.name } : {}),
                ...('sqft' in updates ? { sqft: updates.sqft } : {}),
              }
            }),
          }
        })
        saveBuilding({ ...building, floors: updatedFloors })
      }

      const allocationKeys: (keyof ZoneAllocation)[] = [
        'useType', 'color', 'status', 'letPercentage',
        'teams', 'sectors',
        'rentPerSqft', 'ratesInclusive', 'memberCount',
        'councilTaxPerSqft', 'energyCost', 'notes',
      ]
      const hasAllocationUpdate = allocationKeys.some((k) => k in updates)

      if (hasAllocationUpdate && activeScenario) {
        const existing = activeScenario.allocations.find(
          (a) => a.floorId === floorId && a.zoneId === zoneId
        )
        const useType = (updates.useType ?? existing?.useType ?? 'unassigned') as UseType
        const updated: ZoneAllocation = {
          floorId,
          zoneId,
          useType,
          color: updates.color ?? existing?.color ?? USE_TYPE_COLORS[useType],
          status: updates.status ?? existing?.status,
          letPercentage: updates.letPercentage ?? existing?.letPercentage,
          teams: updates.teams ?? existing?.teams ?? [],
          sectors: updates.sectors ?? existing?.sectors ?? [],
          rentPerSqft: updates.rentPerSqft ?? existing?.rentPerSqft,
          ratesInclusive: updates.ratesInclusive ?? existing?.ratesInclusive,
          memberCount: updates.memberCount ?? existing?.memberCount,
          councilTaxPerSqft: updates.councilTaxPerSqft ?? existing?.councilTaxPerSqft ?? 22,
          energyCost: updates.energyCost ?? existing?.energyCost ?? 0,
          notes: updates.notes ?? existing?.notes ?? '',
        }
        const newAllocations = existing
          ? activeScenario.allocations.map((a) =>
              a.floorId === floorId && a.zoneId === zoneId ? updated : a
            )
          : [...activeScenario.allocations, updated]

        saveScenarios(
          scenarios.map((s) =>
            s.id === activeScenarioId ? { ...s, allocations: newAllocations } : s
          )
        )
      }
    },
    [building, scenarios, activeScenario, activeScenarioId, saveBuilding, saveScenarios]
  )

  // Called when user finishes drawing a polygon — show the modal
  const handlePolygonComplete = useCallback((polygon: [number, number][]) => {
    setPendingPolygon(polygon)
    setIsDrawing(false)
  }, [])

  // Called when user submits the new zone modal
  const handleNewZoneSave = useCallback(
    (name: string, sqft: number | undefined, useType: UseType) => {
      if (!pendingPolygon || !activeFloor) return

      const newZoneId = `zone-${activeFloorId}-${Date.now()}`
      const newZone: Zone = { id: newZoneId, name, sqft, polygon: pendingPolygon }

      // Add zone to building
      const updatedBuilding = {
        ...building,
        floors: building.floors.map((f) =>
          f.id === activeFloorId ? { ...f, zones: [...f.zones, newZone] } : f
        ),
      }
      saveBuilding(updatedBuilding)

      // If a non-unassigned use type was chosen, also create an allocation
      if (useType !== 'unassigned' && activeScenario) {
        const newAllocation: ZoneAllocation = {
          floorId: activeFloorId,
          zoneId: newZoneId,
          useType,
          color: USE_TYPE_COLORS[useType],
          teams: [],
          sectors: [],
          councilTaxPerSqft: 22,
          energyCost: 0,
          notes: '',
        }
        saveScenarios(
          scenarios.map((s) =>
            s.id === activeScenarioId
              ? { ...s, allocations: [...s.allocations, newAllocation] }
              : s
          )
        )
      }

      setPendingPolygon(null)
      setSelectedZone(newZone)
    },
    [pendingPolygon, activeFloor, activeFloorId, building, scenarios, activeScenario, activeScenarioId, saveBuilding, saveScenarios]
  )

  const handleDeleteZone = useCallback(() => {
    if (!selectedZone) return
    saveBuilding({
      ...building,
      floors: building.floors.map((f) =>
        f.id !== activeFloorId ? f : { ...f, zones: f.zones.filter((z) => z.id !== selectedZone.id) }
      ),
    })
    if (activeScenario) {
      saveScenarios(
        scenarios.map((s) =>
          s.id !== activeScenarioId
            ? s
            : {
                ...s,
                allocations: s.allocations.filter(
                  (a) => !(a.floorId === activeFloorId && a.zoneId === selectedZone.id)
                ),
              }
        )
      )
    }
    setSelectedZone(null)
  }, [selectedZone, building, activeFloorId, activeScenario, activeScenarioId, scenarios, saveBuilding, saveScenarios])

  const handleNewScenario = useCallback(() => {
    const newId = `scenario-${Date.now()}`
    const newScenario: Scenario = {
      id: newId,
      name: `Scenario ${String.fromCharCode(65 + scenarios.length)}`,
      createdAt: new Date().toISOString(),
      allocations: activeScenario ? [...activeScenario.allocations] : [],
    }
    saveScenarios([...scenarios, newScenario])
    setActiveScenarioId(newId)
  }, [scenarios, activeScenario, saveScenarios])

  const handleRenameScenario = useCallback(
    (id: string, name: string) => {
      saveScenarios(scenarios.map((s) => (s.id === id ? { ...s, name } : s)))
    },
    [scenarios, saveScenarios]
  )

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-stone-400 text-sm" style={{ background: '#111110' }}>
        <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#57534e' }}>
          Loading…
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: '#f0ede8' }}>
      {/* New Zone Modal */}
      {pendingPolygon && (
        <NewZoneModal
          onSave={handleNewZoneSave}
          onDiscard={() => { setPendingPolygon(null); setIsDrawing(false) }}
        />
      )}

      {/* Header */}
      <header
        className="flex items-center justify-between px-5 shrink-0"
        style={{ background: '#111110', borderBottom: '1px solid #222220', height: 48 }}
      >
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2.5">
            <div className="w-2 h-2 rounded-sm" style={{ background: '#e4e0d8' }} />
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', color: '#e4e0d8', textTransform: 'uppercase' }}>
              Frontier Tower
            </span>
          </div>
          <div style={{ width: 1, height: 20, background: '#2a2a28' }} />
          <ScenarioSelector
            scenarios={scenarios}
            activeId={activeScenarioId}
            onSelect={setActiveScenarioId}
            onNew={handleNewScenario}
            onRename={handleRenameScenario}
          />
        </div>
        <div className="flex items-center gap-2.5">
          {viewMode === 'birdseye' && (
            <button
              onClick={() => { setIsDrawing((d) => !d); setSelectedZone(null) }}
              className="flex items-center gap-1.5 transition-colors"
              style={{
                fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
                padding: '4px 12px', borderRadius: 5,
                background: isDrawing ? '#4f46e5' : '#2a2a28',
                border: `1px solid ${isDrawing ? '#6366f1' : '#3a3a38'}`,
                color: isDrawing ? '#fff' : '#a8a29e',
              }}
            >
              <span style={{ fontSize: 10 }}>{isDrawing ? '◉' : '◎'}</span>
              {isDrawing ? 'Drawing — click to close' : 'Draw Zone'}
            </button>
          )}
          <div className="flex overflow-hidden" style={{ border: '1px solid #2a2a28', borderRadius: 5 }}>
            {(['birdseye', 'isometric', 'table'] as const).map((mode, i, arr) => (
              <button
                key={mode}
                onClick={() => { setViewMode(mode); setIsDrawing(false) }}
                style={{
                  fontSize: 11, fontWeight: 500, padding: '4px 12px',
                  background: viewMode === mode ? '#2a2a28' : 'transparent',
                  color: viewMode === mode ? '#e4e0d8' : '#78716c',
                  letterSpacing: '0.03em',
                  borderRight: i < arr.length - 1 ? '1px solid #2a2a28' : 'none',
                }}
              >
                {mode === 'birdseye' ? "Bird's Eye" : mode === 'isometric' ? '3D View' : 'Table'}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {viewMode === 'table' ? (
          activeScenario && (
            <TableView
              building={building}
              scenario={activeScenario}
              onUpdate={(floorId, zoneId, updates) => updateAllocation(floorId, zoneId, updates)}
              onUpdateScenario={(updates) => saveScenarios(scenarios.map((s) => s.id === activeScenarioId ? { ...s, ...updates } : s))}
            />
          )
        ) : (
          <>
            {viewMode === 'birdseye' && (
              <div className="border-r border-zinc-200 bg-zinc-50 overflow-y-auto shrink-0">
                <FloorTabs
                  floors={building.floors}
                  activeFloorId={activeFloorId}
                  onSelect={(id) => { setActiveFloorId(id); setSelectedZone(null) }}
                />
              </div>
            )}

            <div className="flex flex-1 overflow-hidden">
              {viewMode === 'birdseye' && activeFloor ? (
                <FloorPlanViewer
                  floor={activeFloor}
                  allocations={floorAllocations}
                  selectedZoneId={selectedZone?.id ?? null}
                  isDrawing={isDrawing}
                  onZoneClick={(zone) => { setSelectedZone(zone); setIsDrawing(false) }}
                  onPolygonComplete={handlePolygonComplete}
                  onCancelDraw={() => setIsDrawing(false)}
                  onDeselect={() => { if (!isDrawing) setSelectedZone(null) }}
                />
              ) : viewMode === 'isometric' && activeScenario ? (
                <Building3DView
                  floors={building.floors}
                  scenario={activeScenario}
                  onFloorClick={(id) => { setActiveFloorId(id); setViewMode('birdseye'); setSelectedZone(null) }}
                />
              ) : null}
            </div>

            {selectedZone && viewMode === 'birdseye' && (
              <ZoneDetailPanel
                zone={selectedZone}
                allocation={activeScenario?.allocations.find(
                  (a) => a.floorId === activeFloorId && a.zoneId === selectedZone.id
                )}
                onUpdate={(updates) => updateAllocation(activeFloorId, selectedZone.id, updates)}
                onDelete={handleDeleteZone}
                onClose={() => setSelectedZone(null)}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
