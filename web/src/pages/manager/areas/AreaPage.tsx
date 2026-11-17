import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ArrowLeftIcon, CaretRightIcon, CheckCircleIcon, CornersOutIcon, GearSixIcon, MagnifyingGlassIcon, MapPinIcon, MinusIcon,
  PencilSimpleIcon, PlusIcon, PolygonIcon, StackIcon, TrashIcon, WarningIcon,
} from '@phosphor-icons/react'
import { trpc } from '@/lib/trpc'
import { AreaMap, type AreaMapHandle, type MapStand } from '@/components/map/AreaMap'
import { BASEMAPS, DEFAULT_BASEMAP, type BasemapId, type BoundaryStyle } from '@/components/map/areaStyle'
import { hasLngLatCoordinates } from '@/components/map/bounds'
import { insideBoundary } from '@/components/map/geometry'
import { usePersistentState } from '@/lib/usePersistentState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  formatStatusDate, searchStands, standPosition, standTitle, STAND_STATUS_LABELS, todayIso, type ApiStand,
} from './stands'
import { STAND_STATUSES, type StandStatus } from '@hunt-hub/backend/src/shared/standStatus'

/** File types the server can read a boundary from. */
const BOUNDARY_FILE_TYPES = '.geojson,.json,.kml,.gpx,.zip,.gpkg'
/** Width of the stands panel; the map buttons move left by this much while it is open. */
const PANEL_WIDTH = 288

/** One hunting area as a full-page map: legend, layers, settings and the stands panel. */
export function AreaPage() {
  const areaId = Number(useParams<{ id: string }>().id)
  const { data: area, isLoading, error } = trpc.manager.areas.get.useQuery(
    { id: areaId },
    { enabled: Number.isInteger(areaId) && areaId > 0, retry: false },
  )

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>
  if (error || !area) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">{error?.message ?? 'Area not found'}</p>
        <Button variant="outline" size="sm" asChild><Link to="/manager/areas">← All areas</Link></Button>
      </div>
    )
  }

  // A boundary with coordinates that aren't longitude/latitude (an old upload in UTM) would
  // break the whole map; leave it out and say so instead.
  const brokenBoundary = area.boundary !== null && !hasLngLatCoordinates(area.boundary)
  return <AreaMapPage area={brokenBoundary ? { ...area, boundary: null } : area} brokenBoundary={brokenBoundary} />
}

type Area = { id: number; name: string; boundary: GeoJSON.Geometry | null; stands: ApiStand[] }

function AreaMapPage({ area, brokenBoundary = false }: { area: Area; brokenBoundary?: boolean }) {
  const mapRef = useRef<AreaMapHandle>(null)
  const [basemapId, setBasemapId] = useState<BasemapId>(DEFAULT_BASEMAP)
  const [showBoundary, setShowBoundary] = useState(true)
  const [showStands, setShowStands] = useState(true)
  const [layersOpen, setLayersOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [standsOpen, setStandsOpen] = useState(false)
  // Edit mode (like the iPhone app): stands can be dragged; right-click adds one.
  const [editStands, setEditStands] = useState(false)
  const [placing, setPlacing] = useState(false)
  const [newStandAt, setNewStandAt] = useState<[number, number] | null>(null)
  const [pendingMove, setPendingMove] = useState<{ stand: ApiStand; to: [number, number]; revert: () => void } | null>(null)
  // A display preference of this browser, the same for every area.
  const [boundaryStyle, setBoundaryStyle] = usePersistentState<BoundaryStyle>('hunthub.boundaryStyle', 'inverted', ['inverted', 'line'])

  const mapStands = useMemo<MapStand[]>(() => area.stands.map((s) => ({
    id: s.id, number: s.number, location: s.location?.type === 'Point' ? s.location : null,
    title: s.status ? `${standTitle(s)} (${STAND_STATUS_LABELS[s.status]})` : standTitle(s),
  })), [area.stands])

  return (
    // The page fills the space next to the menu: heading on top, the map below.
    <div className="-m-8 flex h-screen flex-col">
      <header className="flex items-center gap-3 border-b border-border px-8 py-4">
        <Button variant="ghost" size="icon" asChild aria-label="All areas">
          <Link to="/manager/areas"><ArrowLeftIcon /></Link>
        </Button>
        <h1 className="truncate text-2xl font-semibold">{area.name}</h1>
      </header>

      <div className="relative flex-1 overflow-hidden">
        <AreaMap ref={mapRef} boundary={area.boundary} stands={mapStands}
          basemapId={basemapId} showBoundary={showBoundary} boundaryStyle={boundaryStyle} showStands={showStands}
          editable={editStands} placing={placing}
          onPlace={(at) => { setPlacing(false); setNewStandAt(at) }}
          onMoveStand={(standId, to, revert) => {
            const stand = area.stands.find((s) => s.id === standId)
            if (stand) setPendingMove({ stand, to, revert })
            else revert()
          }} />

        {editStands && (
          <div role="status" className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-3 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground shadow-md">
            {placing
              ? <>Click on the map where the new stand goes.
                  <Button size="sm" variant="secondary" onClick={() => setPlacing(false)}>Cancel</Button></>
              : <>Edit mode: drag a stand to move it, right-click the map to add one.
                  <Button size="sm" variant="secondary" onClick={() => setEditStands(false)}>Done</Button></>}
          </div>
        )}

        {brokenBoundary && (
          <p role="alert" className="absolute left-4 top-4 max-w-md rounded-md bg-background/95 px-3 py-2 text-sm text-destructive shadow">
            The boundary can&apos;t be shown: its coordinates are not longitude/latitude. Upload the file again in the settings.
          </p>
        )}
        {!brokenBoundary && area.boundary === null && mapStands.every((s) => s.location === null) && (
          <p className="absolute left-4 top-4 rounded-md bg-background/90 px-3 py-2 text-sm text-muted-foreground shadow">
            No boundary yet. Upload one in the settings.
          </p>
        )}

        <Legend
          showStands={showStands} onStands={setShowStands}
          showBoundary={showBoundary} onBoundary={setShowBoundary}
        />

        {/* Buttons bottom right; they move left next to the stands panel instead of the map getting narrower. */}
        <div className="absolute bottom-4 flex flex-col items-end gap-2 transition-[right] duration-200"
          style={{ right: standsOpen ? PANEL_WIDTH + 16 : 16 }}>
          <MapButton label={standsOpen ? 'Close stands' : 'Stands'} active={standsOpen} onClick={() => setStandsOpen((o) => !o)}>
            <MapPinIcon />
          </MapButton>
          <div className="relative">
            {layersOpen && (
              <LayerMenu value={basemapId} onChange={(id) => { setBasemapId(id); setLayersOpen(false) }} onClose={() => setLayersOpen(false)} />
            )}
            <MapButton label="Layers" active={layersOpen} onClick={() => setLayersOpen((o) => !o)}>
              <StackIcon />
            </MapButton>
          </div>
          <MapButton label="Settings" onClick={() => setSettingsOpen(true)}><GearSixIcon /></MapButton>
          <MapButton label="Show whole area" onClick={() => mapRef.current?.fitArea()}><CornersOutIcon /></MapButton>
          <MapButton label="Zoom in" onClick={() => mapRef.current?.zoomIn()}><PlusIcon /></MapButton>
          <MapButton label="Zoom out" onClick={() => mapRef.current?.zoomOut()}><MinusIcon /></MapButton>
        </div>

        <StandsPanel
          areaId={area.id}
          onAdd={() => { setEditStands(true); setPlacing(true) }}
          editing={editStands}
          onToggleEdit={() => { setEditStands((on) => !on); setPlacing(false) }}
          open={standsOpen} stands={area.stands} onClose={() => setStandsOpen(false)}
          onSelect={(stand, position) => mapRef.current?.flyTo(position, stand.id)}
        />
      </div>

      {newStandAt && (
        <NewStandDialog areaId={area.id} at={newStandAt} outside={!insideBoundary(newStandAt, area.boundary)}
          onClose={() => setNewStandAt(null)} />
      )}
      {pendingMove && (
        <MoveStandDialog areaId={area.id} move={pendingMove} outside={!insideBoundary(pendingMove.to, area.boundary)}
          onClose={() => setPendingMove(null)} />
      )}

      <AreaSettings area={area} open={settingsOpen} onOpenChange={setSettingsOpen}
        boundaryStyle={boundaryStyle} onBoundaryStyle={setBoundaryStyle} />
    </div>
  )
}

function MapButton({ label, active = false, onClick, children }: { label: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <Button
      variant={active ? 'default' : 'outline'} size="icon" aria-label={label} title={label} aria-pressed={active}
      onClick={onClick} className="size-10 rounded-full bg-background shadow-md aria-pressed:bg-primary [&_svg]:size-5"
    >
      {children}
    </Button>
  )
}

function Legend({ showStands, onStands, showBoundary, onBoundary }: {
  showStands: boolean; onStands: (on: boolean) => void
  showBoundary: boolean; onBoundary: (on: boolean) => void
}) {
  return (
    // Sits above the map's copyright button (ⓘ), which is bottom left.
    <div className="absolute bottom-12 left-2.5 space-y-1.5 rounded-md bg-background/95 px-3 py-2 text-sm shadow-md">
      <label className="flex cursor-pointer items-center gap-2">
        <input type="checkbox" checked={showStands} onChange={(e) => onStands(e.target.checked)} />
        <span className="inline-block size-3 rounded-full border-2 border-red-600 bg-white" aria-hidden />
        Stands
      </label>
      <label className="flex cursor-pointer items-center gap-2">
        <input type="checkbox" checked={showBoundary} onChange={(e) => onBoundary(e.target.checked)} />
        <span className="inline-block h-0.5 w-3 bg-red-600" aria-hidden />
        Boundary
      </label>
    </div>
  )
}

function LayerMenu({ value, onChange, onClose }: { value: BasemapId; onChange: (id: BasemapId) => void; onClose: () => void }) {
  return (
    <>
      {/* A click anywhere else closes the menu. */}
      <div className="fixed inset-0 z-10" onClick={onClose} aria-hidden />
      <div role="radiogroup" aria-label="Base map"
        className="absolute bottom-0 right-12 z-20 w-44 rounded-md border border-border bg-background p-1 shadow-lg">
        {BASEMAPS.map((b) => (
          <button key={b.id} type="button" role="radio" aria-checked={b.id === value} onClick={() => onChange(b.id)}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted">
            <span className="w-4 text-primary">{b.id === value ? '✓' : ''}</span>
            {b.label}
          </button>
        ))}
      </div>
    </>
  )
}

function StandsPanel({ areaId, open, stands, editing, onToggleEdit, onAdd, onClose, onSelect }: {
  areaId: number; open: boolean; stands: ApiStand[]; editing: boolean; onToggleEdit: () => void
  onAdd: () => void; onClose: () => void; onSelect: (stand: ApiStand, position: [number, number]) => void
}) {
  const [query, setQuery] = useState('')
  const [editingStand, setEditingStand] = useState<ApiStand | null>(null)
  const found = searchStands(stands, query)

  return (
    <aside
      aria-label="Stands" aria-hidden={!open}
      className="absolute inset-y-0 right-0 flex flex-col border-l border-border bg-background shadow-xl transition-transform duration-200"
      style={{ width: PANEL_WIDTH, transform: open ? 'translateX(0)' : 'translateX(100%)' }}
    >
      {/* Small tab in the middle of the left edge that hides the panel. Only while it is open. */}
      {open && (
        <button type="button" onClick={onClose} aria-label="Hide stands" title="Hide stands"
          className="absolute -left-5 top-1/2 flex h-12 w-5 -translate-y-1/2 items-center justify-center rounded-l-md border border-r-0 border-border bg-background text-muted-foreground shadow-md hover:text-foreground">
          <CaretRightIcon className="size-3.5" weight="bold" />
        </button>
      )}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="font-semibold">Stands <span className="font-normal text-muted-foreground">({stands.length})</span></h2>
        <Button size="sm" variant="outline" title="Add a stand on the map" tabIndex={open ? 0 : -1} onClick={onAdd}>
          <PlusIcon /> Add
        </Button>
      </div>
      <div className="relative border-b border-border p-3">
        <MagnifyingGlassIcon className="absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search number or name…"
          aria-label="Search stands" className="pl-8" tabIndex={open ? 0 : -1} />
      </div>
      <ul className="flex-1 overflow-y-auto p-1">
        {found.map((stand) => {
          const position = standPosition(stand)
          return (
            <li key={stand.id} className="group flex items-start gap-1 rounded hover:bg-muted">
              <button type="button" disabled={!position} tabIndex={open ? 0 : -1}
                onClick={() => position && onSelect(stand, position)}
                className="flex min-w-0 flex-1 flex-col gap-1 px-3 py-2 text-left text-sm disabled:cursor-default">
                <span className="flex w-full items-baseline gap-2">
                  <span className="font-medium">{stand.number}</span>
                  {stand.nickname && <span className="truncate text-muted-foreground">{stand.nickname}</span>}
                  {!position && <span className="ml-auto shrink-0 text-xs text-muted-foreground">not placed</span>}
                </span>
                {stand.status && <StandStatusLine status={stand.status} date={stand.statusDate} />}
              </button>
              <Button type="button" variant="ghost" size="icon" tabIndex={open ? 0 : -1}
                aria-label={`Edit ${standTitle(stand)}`} title="Edit number, name and status"
                className="mt-1 mr-1 text-muted-foreground opacity-60 group-hover:opacity-100"
                onClick={() => setEditingStand(stand)}>
                <PencilSimpleIcon />
              </Button>
            </li>
          )
        })}
        {found.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">
            {stands.length === 0 ? 'No stands yet. Click Add to place one on the map.' : 'No stand matches this search.'}
          </li>
        )}
      </ul>
      {/* Edit mode at the bottom of the list, like a footer: drag stands, right-click to add. */}
      <div className="border-t border-border p-3">
        <Button className="w-full" variant={editing ? 'default' : 'outline'} aria-pressed={editing}
          tabIndex={open ? 0 : -1} onClick={onToggleEdit}>
          <PencilSimpleIcon /> {editing ? 'Done editing' : 'Edit stands'}
        </Button>
      </div>
      {editingStand && (
        <StandDetailsDialog key={editingStand.id} areaId={areaId} stand={editingStand} onClose={() => setEditingStand(null)} />
      )}
    </aside>
  )
}

/** Colour per status: green = usable, amber = needs work, red = not usable, grey = gone. */
const STATUS_DOT: Record<StandStatus, string> = {
  ok: 'bg-green-600',
  needs_repair: 'bg-amber-500',
  broken: 'bg-red-600',
  removed: 'bg-zinc-400',
}

function StandStatusLine({ status, date }: { status: StandStatus; date: string | null }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className={`size-2 shrink-0 rounded-full ${STATUS_DOT[status]}`} aria-hidden />
      <span className="text-foreground">{STAND_STATUS_LABELS[status]}</span>
      {date && <span>· since {formatStatusDate(date)}</span>}
    </span>
  )
}

/** Status choice: "Not checked" or one of the four statuses. */
function StatusPicker({ value, onChange }: { value: StandStatus | ''; onChange: (status: StandStatus | '') => void }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-xs font-medium">Status</legend>
      <div className="grid grid-cols-2 gap-1.5">
        {(['', ...STAND_STATUSES] as const).map((code) => (
          <label key={code || 'none'}
            className="flex cursor-pointer items-center gap-2 border border-input px-2.5 py-1.5 text-xs has-[:checked]:border-primary has-[:checked]:bg-primary/5">
            <input type="radio" name="stand-status" value={code} checked={value === code}
              onChange={() => onChange(code)} className="accent-primary" />
            {code ? <><span className={`size-2 rounded-full ${STATUS_DOT[code]}`} aria-hidden />{STAND_STATUS_LABELS[code]}</> : 'Not checked'}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function OutsideWarning() {
  return (
    <p className="flex items-start gap-2 border border-amber-500/50 bg-amber-500/10 px-2.5 py-2 text-xs">
      <WarningIcon className="mt-0.5 shrink-0 text-amber-600" aria-hidden />
      This position is outside the area boundary.
    </p>
  )
}

/** A new stand where the map was clicked. Without a number it is saved as NOT-NAMED-n. */
function NewStandDialog({ areaId, at, outside, onClose }: {
  areaId: number; at: [number, number]; outside: boolean; onClose: () => void
}) {
  const invalidate = useInvalidateArea(areaId)
  const [number, setNumber] = useState('')
  const [nickname, setNickname] = useState('')
  const [status, setStatus] = useState<StandStatus | ''>('')
  const [error, setError] = useState<string | null>(null)
  const create = trpc.manager.stands.create.useMutation({
    onSuccess: (stand) => {
      invalidate()
      toast.success(`Stand ${stand.number} added`)
      onClose()
    },
    onError: (err) => setError(err.message),
  })

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    create.mutate({
      areaId, position: { lng: at[0], lat: at[1] },
      number: number.trim() || undefined,
      nickname: nickname.trim() || null,
      status: status || null,
    })
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New stand</DialogTitle>
          <DialogDescription>At {at[1].toFixed(5)}, {at[0].toFixed(5)}</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-stand-number">Number</Label>
            <Input id="new-stand-number" value={number} maxLength={32} autoFocus aria-invalid={error !== null}
              placeholder="Leave empty for NOT-NAMED-…" onChange={(e) => { setNumber(e.target.value); setError(null) }} />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-stand-nickname">Nickname (optional)</Label>
            <Input id="new-stand-nickname" value={nickname} maxLength={64} placeholder="e.g. Eiche"
              onChange={(e) => setNickname(e.target.value)} />
          </div>
          <StatusPicker value={status} onChange={setStatus} />
          {outside && <OutsideWarning />}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Saving…' : outside ? 'Save anyway' : 'Save'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Confirms a stand that was dragged to a new place; Cancel puts it back. */
function MoveStandDialog({ areaId, move, outside, onClose }: {
  areaId: number; move: { stand: ApiStand; to: [number, number]; revert: () => void }; outside: boolean; onClose: () => void
}) {
  const invalidate = useInvalidateArea(areaId)
  const moveStand = trpc.manager.stands.move.useMutation({
    onSuccess: () => {
      invalidate()
      toast.success(`${standTitle(move.stand)} moved`)
      onClose()
    },
    onError: (err) => toast.error(err.message),
  })
  const cancel = () => {
    move.revert()
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !moveStand.isPending) cancel() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move {standTitle(move.stand)}?</DialogTitle>
          <DialogDescription>New position: {move.to[1].toFixed(5)}, {move.to[0].toFixed(5)}</DialogDescription>
        </DialogHeader>
        {outside && <OutsideWarning />}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={cancel}>Cancel</Button>
          <Button type="button" disabled={moveStand.isPending}
            onClick={() => moveStand.mutate({ id: move.stand.id, position: { lng: move.to[0], lat: move.to[1] } })}>
            {moveStand.isPending ? 'Saving…' : outside ? 'Save anyway' : 'Save'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Number, nickname and status of one stand, and deleting it. Changing the
 * status sets the date to today; it can be corrected.
 */
function StandDetailsDialog({ areaId, stand, onClose }: { areaId: number; stand: ApiStand; onClose: () => void }) {
  const invalidate = useInvalidateArea(areaId)
  const [number, setNumber] = useState(stand.number)
  const [nickname, setNickname] = useState(stand.nickname ?? '')
  const [status, setStatus] = useState<StandStatus | ''>(stand.status ?? '')
  const [statusDate, setStatusDate] = useState(stand.statusDate ?? todayIso())
  const [numberError, setNumberError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const rename = trpc.manager.stands.rename.useMutation()
  const update = trpc.manager.stands.update.useMutation()
  const remove = trpc.manager.stands.delete.useMutation({
    onSuccess: () => {
      invalidate()
      toast.success(`${standTitle(stand)} deleted`)
      onClose()
    },
    onError: (err) => toast.error(err.message),
  })
  const saving = rename.isPending || update.isPending

  const changeStatus = (next: StandStatus | '') => {
    setStatus(next)
    // A new status gets today's date; going back to the saved status restores its date.
    setStatusDate(next === stand.status && stand.statusDate ? stand.statusDate : todayIso())
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    setNumberError(null)
    const newNumber = number.trim()
    if (!newNumber) {
      setNumberError('Please enter a number.')
      return
    }
    try {
      if (newNumber !== stand.number) await rename.mutateAsync({ id: stand.id, number: newNumber })
    } catch (err) {
      setNumberError(err instanceof Error ? err.message : 'Could not change the number.')
      return
    }
    try {
      await update.mutateAsync({
        id: stand.id,
        nickname: nickname.trim() || null,
        status: status || null,
        ...(status ? { statusDate } : {}),
      })
      invalidate()
      toast.success(`${standTitle({ number: newNumber, nickname: nickname.trim() || null })} saved`)
      onClose()
    } catch (err) {
      invalidate()
      toast.error(err instanceof Error ? err.message : 'Could not save.')
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{standTitle(stand)}</DialogTitle>
          <DialogDescription>Number, name and condition of the stand. Move it by dragging it in edit mode.</DialogDescription>
        </DialogHeader>
        {confirmDelete ? (
          <div className="space-y-4">
            <p className="text-sm">Delete {standTitle(stand)}? This can&apos;t be undone. It also disappears from the iPhone app with the next sync.</p>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
              <Button type="button" variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate({ id: stand.id })}>
                <TrashIcon /> {remove.isPending ? 'Deleting…' : 'Delete'}
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="stand-number">Number</Label>
              <Input id="stand-number" value={number} maxLength={32} aria-invalid={numberError !== null}
                onChange={(e) => { setNumber(e.target.value); setNumberError(null) }} />
              {numberError && <p className="text-xs text-destructive">{numberError}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="stand-nickname">Nickname (optional)</Label>
              <Input id="stand-nickname" value={nickname} maxLength={64} placeholder="e.g. Eiche"
                onChange={(e) => setNickname(e.target.value)} />
            </div>
            <StatusPicker value={status} onChange={changeStatus} />
            {status && (
              <div className="space-y-1.5">
                <Label htmlFor="stand-status-date">Status since</Label>
                <Input id="stand-status-date" type="date" required value={statusDate} max={todayIso()}
                  onChange={(e) => setStatusDate(e.target.value)} />
              </div>
            )}
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" className="mr-auto text-destructive" onClick={() => setConfirmDelete(true)}>
                <TrashIcon /> Delete
              </Button>
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function useInvalidateArea(areaId: number) {
  const utils = trpc.useUtils()
  return () => {
    utils.manager.areas.get.invalidate({ id: areaId })
    utils.manager.areas.list.invalidate()
  }
}

/** Settings of this area: display, name, boundary file and, set apart, deleting it. */
function AreaSettings({ area, open, onOpenChange, boundaryStyle, onBoundaryStyle }: {
  area: Area; open: boolean; onOpenChange: (open: boolean) => void
  boundaryStyle: BoundaryStyle; onBoundaryStyle: (style: BoundaryStyle) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] gap-0 overflow-y-auto p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>{area.name}</DialogDescription>
        </DialogHeader>
        <div className="divide-y divide-border">
          <DisplaySection value={boundaryStyle} onChange={onBoundaryStyle} />
          <RenameSection areaId={area.id} name={area.name} />
          <BoundarySection areaId={area.id} hasBoundary={area.boundary !== null} />
        </div>
        <DangerZone areaId={area.id} name={area.name} />
      </DialogContent>
    </Dialog>
  )
}

function Section({ icon, title, description, children }: { icon: ReactNode; title: string; description?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 px-6 py-5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-muted-foreground [&_svg]:size-4">{icon}</span>
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      </div>
      <div className="pl-7">{children}</div>
    </section>
  )
}

function DisplaySection({ value, onChange }: { value: BoundaryStyle; onChange: (style: BoundaryStyle) => void }) {
  const options: { id: BoundaryStyle; label: string }[] = [
    { id: 'inverted', label: 'Inverted' },
    { id: 'line', label: 'Line only' },
  ]
  return (
    <Section icon={<PolygonIcon />} title="Boundary display" description="Inverted shades everything outside the area red. Saved in this browser, for all areas.">
      <div role="radiogroup" aria-label="Boundary display" className="inline-flex rounded-md border border-border p-0.5">
        {options.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={value === o.id} onClick={() => onChange(o.id)}
            className="rounded px-3 py-1.5 text-sm transition-colors aria-checked:bg-primary aria-checked:text-primary-foreground hover:bg-muted aria-checked:hover:bg-primary">
            {o.label}
          </button>
        ))}
      </div>
    </Section>
  )
}

function RenameSection({ areaId, name }: { areaId: number; name: string }) {
  const invalidate = useInvalidateArea(areaId)
  const form = useForm<{ name: string }>({ values: { name } })

  const rename = trpc.manager.areas.rename.useMutation({
    onSuccess: () => {
      invalidate()
      toast.success('Area renamed')
    },
    onError: (err) => toast.error(err.message),
  })

  return (
    <Section icon={<PencilSimpleIcon />} title="Name">
      <form onSubmit={form.handleSubmit((values) => rename.mutate({ id: areaId, name: values.name }))} className="flex items-start gap-2">
        <div className="flex-1 space-y-1">
          <Input
            autoComplete="off"
            aria-label="Area name"
            {...form.register('name', {
              required: 'Please enter a name',
              maxLength: { value: 255, message: 'At most 255 characters' },
            })}
          />
          {form.formState.errors.name && (
            <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
          )}
        </div>
        <Button type="submit" disabled={rename.isPending || !form.formState.isDirty}>
          {rename.isPending ? 'Saving…' : 'Save'}
        </Button>
      </form>
    </Section>
  )
}

function BoundarySection({ areaId, hasBoundary }: { areaId: number; hasBoundary: boolean }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const invalidate = useInvalidateArea(areaId)
  // Only for files that don't say which coordinate system they use.
  const [epsg, setEpsg] = useState('')

  const upload = trpc.manager.areas.uploadBoundary.useMutation({
    onSuccess: () => {
      invalidate()
      toast.success('Boundary uploaded')
      if (fileInput.current) fileInput.current.value = ''
    },
    onError: (err) => toast.error(err.message),
  })

  const clear = trpc.manager.areas.clearBoundary.useMutation({
    onSuccess: () => {
      invalidate()
      toast.success('Boundary removed')
    },
    onError: (err) => toast.error(err.message),
  })

  function uploadSelectedFile() {
    const file = fileInput.current?.files?.[0]
    if (!file) return toast.error('Please choose a file')
    const form = new FormData()
    form.set('areaId', String(areaId))
    form.set('file', file)
    form.set('crs', epsg.trim())
    upload.mutate(form)
  }

  return (
    <Section icon={<StackIcon />} title="Boundary file" description="GeoJSON, KML, GPX, Shapefile (zip) or GeoPackage.">
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-sm">
          {hasBoundary
            ? <><CheckCircleIcon className="text-green-600" weight="fill" /> A boundary is uploaded. A new file replaces it.</>
            : <span className="text-muted-foreground">No boundary yet.</span>}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="boundary-file" className="sr-only">Boundary file</Label>
          <Input id="boundary-file" ref={fileInput} type="file" accept={BOUNDARY_FILE_TYPES} className="max-w-xs flex-1" />
          <Button onClick={uploadSelectedFile} disabled={upload.isPending}>
            {upload.isPending ? 'Uploading…' : hasBoundary ? 'Replace' : 'Upload'}
          </Button>
        </div>
        <div className="space-y-1">
          <Label htmlFor="boundary-epsg" className="text-xs">Coordinate system (EPSG code, optional)</Label>
          <Input id="boundary-epsg" value={epsg} onChange={(e) => setEpsg(e.target.value)} inputMode="numeric"
            placeholder="e.g. 25832" className="max-w-40" />
          <p className="text-xs text-muted-foreground">
            Any coordinate system works. Only needed if the file doesn&apos;t say which one it uses, e.g. a shapefile without .prj.
          </p>
        </div>
        {hasBoundary && (
          <Button variant="ghost" size="sm" className="-ml-3 text-muted-foreground"
            onClick={() => clear.mutate({ id: areaId })} disabled={clear.isPending}>
            Remove boundary
          </Button>
        )}
      </div>
    </Section>
  )
}

/** Deleting the area, set apart. The name confirmation only appears after the first click. */
function DangerZone({ areaId, name }: { areaId: number; name: string }) {
  const [confirming, setConfirming] = useState(false)
  const [confirmName, setConfirmName] = useState('')
  const navigate = useNavigate()
  const utils = trpc.useUtils()

  const remove = trpc.manager.areas.delete.useMutation({
    onSuccess: () => {
      utils.manager.areas.list.invalidate()
      utils.manager.estate.get.invalidate()
      toast.success(`Area "${name}" deleted`)
      navigate('/manager/areas')
    },
    onError: (err) => toast.error(err.message),
  })

  return (
    <section className="m-6 mt-2 space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-4">
      <div className="flex items-start gap-3">
        <WarningIcon className="mt-0.5 size-4 text-destructive" weight="bold" />
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold text-destructive">Danger zone</h3>
          <p className="text-xs text-muted-foreground">Deleting the area also deletes its boundary and all its stands. This cannot be undone.</p>
        </div>
      </div>

      {!confirming ? (
        <div className="pl-7">
          <Button variant="destructive" onClick={() => setConfirming(true)}><TrashIcon /> Delete area…</Button>
        </div>
      ) : (
        <form onSubmit={(event) => { event.preventDefault(); remove.mutate({ id: areaId, confirmName }) }} className="space-y-2 pl-7">
          <Label htmlFor="confirm-name" className="text-xs">Type <span className="font-semibold">{name}</span> to confirm</Label>
          <div className="flex items-center gap-2">
            <Input id="confirm-name" autoFocus autoComplete="off" value={confirmName} onChange={(event) => setConfirmName(event.target.value)} />
            <Button type="submit" variant="destructive" disabled={confirmName !== name || remove.isPending}>
              {remove.isPending ? 'Deleting…' : 'Delete'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => { setConfirming(false); setConfirmName('') }}>Cancel</Button>
          </div>
        </form>
      )}
    </section>
  )
}
