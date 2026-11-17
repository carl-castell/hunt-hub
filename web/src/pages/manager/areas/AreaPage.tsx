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
import { usePersistentState } from '@/lib/usePersistentState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { searchStands, standPosition, type ApiStand } from './stands'

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

  return <AreaMapPage area={area} />
}

type Area = { id: number; name: string; boundary: GeoJSON.Geometry | null; stands: ApiStand[] }

function AreaMapPage({ area }: { area: Area }) {
  const mapRef = useRef<AreaMapHandle>(null)
  const [basemapId, setBasemapId] = useState<BasemapId>(DEFAULT_BASEMAP)
  const [showBoundary, setShowBoundary] = useState(true)
  const [showStands, setShowStands] = useState(true)
  const [layersOpen, setLayersOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [standsOpen, setStandsOpen] = useState(false)
  // A display preference of this browser, the same for every area.
  const [boundaryStyle, setBoundaryStyle] = usePersistentState<BoundaryStyle>('hunthub.boundaryStyle', 'inverted', ['inverted', 'line'])

  const mapStands = useMemo<MapStand[]>(() => area.stands.map((s) => ({
    id: s.id, number: s.number, location: s.location?.type === 'Point' ? s.location : null,
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
          basemapId={basemapId} showBoundary={showBoundary} boundaryStyle={boundaryStyle} showStands={showStands} />

        {area.boundary === null && mapStands.every((s) => s.location === null) && (
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
          open={standsOpen} stands={area.stands} onClose={() => setStandsOpen(false)}
          onSelect={(position) => mapRef.current?.flyTo(position)}
        />
      </div>

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

function StandsPanel({ open, stands, onClose, onSelect }: {
  open: boolean; stands: ApiStand[]; onClose: () => void; onSelect: (position: [number, number]) => void
}) {
  const [query, setQuery] = useState('')
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
        {/* Adding stands on the website comes with HUN-58. */}
        <Button size="sm" variant="outline" disabled title="Coming soon" tabIndex={open ? 0 : -1}>
          <PlusIcon /> Add
        </Button>
      </div>
      <div className="relative border-b border-border p-3">
        <MagnifyingGlassIcon className="absolute left-5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search number…"
          aria-label="Search stands" className="pl-8" tabIndex={open ? 0 : -1} />
      </div>
      <ul className="flex-1 overflow-y-auto p-1">
        {found.map((stand) => {
          const position = standPosition(stand)
          return (
            <li key={stand.id}>
              <button type="button" disabled={!position} tabIndex={open ? 0 : -1}
                onClick={() => position && onSelect(position)}
                className="flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm hover:bg-muted disabled:cursor-default disabled:hover:bg-transparent">
                <span className="font-medium">{stand.number}</span>
                {!position && <span className="text-xs text-muted-foreground">not placed</span>}
              </button>
            </li>
          )
        })}
        {found.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-muted-foreground">
            {stands.length === 0 ? 'No stands yet. Stands are placed in QGIS for now.' : 'No stand with this number.'}
          </li>
        )}
      </ul>
    </aside>
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
