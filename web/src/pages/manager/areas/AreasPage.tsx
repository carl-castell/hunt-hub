import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

type NewAreaForm = { name: string }

/** All hunting areas of the manager's estate. */
export function AreasPage() {
  const { data: areas, isLoading, error } = trpc.manager.areas.list.useQuery()

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Areas</h1>
          <p className="text-sm text-muted-foreground">Hunting areas of your estate and their stands.</p>
        </div>
        <NewAreaDialog />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {areas && areas.length === 0 && (
        <p className="text-sm text-muted-foreground">No areas yet. Create your first area to get started.</p>
      )}

      {areas && areas.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="text-right">Stands</TableHead>
              <TableHead>Boundary</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {areas.map((area) => (
              <TableRow key={area.id}>
                <TableCell>
                  <Link to={`/manager/areas/${area.id}`} className="font-medium hover:underline">
                    {area.name}
                  </Link>
                </TableCell>
                <TableCell className="text-right tabular-nums">{area.standCount}</TableCell>
                <TableCell className="text-muted-foreground">
                  {area.hasBoundary ? 'Uploaded' : 'Missing'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

function NewAreaDialog() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const utils = trpc.useUtils()
  const form = useForm<NewAreaForm>()

  const create = trpc.manager.areas.create.useMutation({
    onSuccess: (area) => {
      utils.manager.areas.list.invalidate()
      utils.manager.estate.get.invalidate()
      toast.success(`Area "${area.name}" created`)
      setOpen(false)
      form.reset()
      navigate(`/manager/areas/${area.id}`)
    },
    onError: (err) => toast.error(err.message),
  })

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) form.reset() }}>
      <Button onClick={() => setOpen(true)}>+ New area</Button>
      <DialogContent>
        <form onSubmit={form.handleSubmit((values) => create.mutate(values))} className="space-y-4">
          <DialogHeader>
            <DialogTitle>New area</DialogTitle>
            <DialogDescription>You can upload the boundary on the next page.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="area-name">Name</Label>
            <Input
              id="area-name"
              autoFocus
              autoComplete="off"
              {...form.register('name', {
                required: 'Please enter a name',
                maxLength: { value: 255, message: 'At most 255 characters' },
              })}
            />
            {form.formState.errors.name && (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
