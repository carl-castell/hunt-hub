import { useMemo, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc'
import { AreaMap, type MapStand } from '@/components/map/AreaMap'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

/** File types the server can read a boundary from. */
const BOUNDARY_FILE_TYPES = '.geojson,.json,.kml,.gpx,.zip,.gpkg'

/** One hunting area: name, boundary file, stands. */
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

  return (
    <div className="space-y-6 max-w-3xl">
      <Button variant="outline" size="sm" asChild><Link to="/manager/areas">← All areas</Link></Button>
      <AreaName areaId={area.id} name={area.name} />
      <AreaMapCard boundary={area.boundary} stands={area.stands} />
      <BoundaryCard areaId={area.id} hasBoundary={area.boundary !== null} />
      <StandsCard stands={area.stands} />
      <DeleteAreaCard areaId={area.id} name={area.name} />
    </div>
  )
}

type ApiStand = { id: number; number: string; location: GeoJSON.Geometry | null }

/** Only stands with a point position can be drawn on the map. */
function toMapStands(stands: ApiStand[]): MapStand[] {
  return stands.map((s) => ({
    id: s.id,
    number: s.number,
    location: s.location?.type === 'Point' ? s.location : null,
  }))
}

function AreaMapCard({ boundary, stands }: { boundary: GeoJSON.Geometry | null; stands: ApiStand[] }) {
  const mapStands = useMemo(() => toMapStands(stands), [stands])
  const nothingToShow = boundary === null && mapStands.every((s) => s.location === null)

  return (
    <div className="space-y-2">
      <AreaMap boundary={boundary} stands={mapStands} />
      {nothingToShow && (
        <p className="text-xs text-muted-foreground">Upload a boundary file to see the area on the map.</p>
      )}
    </div>
  )
}

function useInvalidateArea(areaId: number) {
  const utils = trpc.useUtils()
  return () => {
    utils.manager.areas.get.invalidate({ id: areaId })
    utils.manager.areas.list.invalidate()
  }
}

function AreaName({ areaId, name }: { areaId: number; name: string }) {
  const [editing, setEditing] = useState(false)
  const invalidate = useInvalidateArea(areaId)
  const form = useForm<{ name: string }>({ values: { name } })

  const rename = trpc.manager.areas.rename.useMutation({
    onSuccess: () => {
      invalidate()
      toast.success('Area renamed')
      setEditing(false)
    },
    onError: (err) => toast.error(err.message),
  })

  if (!editing) {
    return (
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">{name}</h1>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>Rename</Button>
      </div>
    )
  }

  return (
    <form
      onSubmit={form.handleSubmit((values) => rename.mutate({ id: areaId, name: values.name }))}
      className="flex items-start gap-2"
    >
      <div className="flex-1 space-y-1">
        <Input
          autoFocus
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
      <Button type="button" variant="outline" size="sm" onClick={() => { setEditing(false); form.reset() }}>Cancel</Button>
      <Button type="submit" size="sm" disabled={rename.isPending}>{rename.isPending ? 'Saving…' : 'Save'}</Button>
    </form>
  )
}

function BoundaryCard({ areaId, hasBoundary }: { areaId: number; hasBoundary: boolean }) {
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
    <Card>
      <CardHeader>
        <CardTitle>Boundary</CardTitle>
        <CardDescription>
          {hasBoundary
            ? 'A boundary is uploaded. Uploading a new file replaces it.'
            : 'No boundary yet. Upload a GeoJSON, KML, GPX, Shapefile (zip) or GeoPackage file.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="boundary-file" className="sr-only">Boundary file</Label>
          <Input id="boundary-file" ref={fileInput} type="file" accept={BOUNDARY_FILE_TYPES} className="max-w-xs" />
          <Button onClick={uploadSelectedFile} disabled={upload.isPending}>
            {upload.isPending ? 'Uploading…' : 'Upload'}
          </Button>
          {hasBoundary && (
            <Button
              variant="outline"
              onClick={() => clear.mutate({ id: areaId })}
              disabled={clear.isPending}
            >
              Remove boundary
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function StandsCard({ stands }: { stands: ApiStand[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Stands</CardTitle>
        <CardDescription>
          {stands.length === 0
            ? 'No stands yet. Stands are placed in QGIS/QField; moving them here and in the iPhone app comes later.'
            : `${stands.length} ${stands.length === 1 ? 'stand' : 'stands'}`}
        </CardDescription>
      </CardHeader>
      {stands.length > 0 && (
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Position</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stands.map((stand) => (
                <TableRow key={stand.id}>
                  <TableCell className="font-medium">{stand.number}</TableCell>
                  <TableCell className="text-muted-foreground">{stand.location ? 'Placed' : 'Not placed'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      )}
    </Card>
  )
}

function DeleteAreaCard({ areaId, name }: { areaId: number; name: string }) {
  const [open, setOpen] = useState(false)
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
    <Card>
      <CardHeader>
        <CardTitle>Delete area</CardTitle>
        <CardDescription>Deletes the area, its boundary and all its stands. This cannot be undone.</CardDescription>
      </CardHeader>
      <CardContent>
        <Dialog open={open} onOpenChange={(next) => { setOpen(next); setConfirmName('') }}>
          <Button variant="destructive" onClick={() => setOpen(true)}>Delete area…</Button>
          <DialogContent>
            <form
              onSubmit={(event) => { event.preventDefault(); remove.mutate({ id: areaId, confirmName }) }}
              className="space-y-4"
            >
              <DialogHeader>
                <DialogTitle>Delete "{name}"?</DialogTitle>
                <DialogDescription>Type the area's name to confirm.</DialogDescription>
              </DialogHeader>
              <Input
                autoFocus
                autoComplete="off"
                aria-label="Area name to confirm"
                value={confirmName}
                onChange={(event) => setConfirmName(event.target.value)}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" variant="destructive" disabled={confirmName !== name || remove.isPending}>
                  {remove.isPending ? 'Deleting…' : 'Delete'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
