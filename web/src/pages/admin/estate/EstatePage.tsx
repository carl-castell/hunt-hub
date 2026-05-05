import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router-dom'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'

type RenameForm    = { name: string }
type AddManagerForm = { firstName: string; lastName: string; email: string }

export function EstatePage() {
  const { id } = useParams<{ id: string }>()
  const estateId = Number(id)
  const navigate = useNavigate()
  const utils = trpc.useUtils()

  const [renaming, setRenaming]           = useState(false)
  const [showAddManager, setShowAddManager] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmName, setDeleteConfirmName] = useState('')

  const { data, isLoading, error } = trpc.admin.estates.get.useQuery({ id: estateId })

  const rename = trpc.admin.estates.rename.useMutation({
    onSuccess: () => {
      utils.admin.estates.get.invalidate({ id: estateId })
      utils.admin.estates.list.invalidate()
      setRenaming(false)
      renameForm.reset()
    },
  })

  const addManager = trpc.admin.estates.addManager.useMutation({
    onSuccess: () => {
      utils.admin.estates.get.invalidate({ id: estateId })
      setShowAddManager(false)
      addForm.reset()
    },
  })

  const deleteEstate = trpc.admin.estates.delete.useMutation({
    onSuccess: () => {
      utils.admin.estates.list.invalidate()
      navigate('/admin')
    },
  })

  const renameForm = useForm<RenameForm>()
  const addForm    = useForm<AddManagerForm>()

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">{error?.message ?? 'Estate not found.'}</p>
        <Button variant="outline" size="sm" onClick={() => navigate('/admin')}>← Dashboard</Button>
      </div>
    )
  }

  const { estate, managers } = data

  return (
    <div className="max-w-2xl space-y-8">
      <Button variant="outline" size="sm" onClick={() => navigate('/admin')}>← Dashboard</Button>

      {/* Header */}
      <div className="space-y-1">
        {renaming ? (
          <form
            onSubmit={renameForm.handleSubmit((d) => rename.mutate({ id: estateId, name: d.name }))}
            className="flex gap-2 items-start"
          >
            <div className="space-y-1 flex-1">
              <input
                type="text"
                autoFocus
                autoComplete="off"
                defaultValue={estate.name}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                {...renameForm.register('name', { required: 'Name is required' })}
              />
              {renameForm.formState.errors.name && (
                <p className="text-xs text-destructive">{renameForm.formState.errors.name.message}</p>
              )}
              {rename.error && <p className="text-xs text-destructive">{rename.error.message}</p>}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => { setRenaming(false); renameForm.reset() }}>Cancel</Button>
            <Button type="submit" size="sm" disabled={rename.isPending}>
              {rename.isPending ? 'Saving…' : 'Save'}
            </Button>
          </form>
        ) : (
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{estate.name}</h1>
            <Button variant="outline" size="sm" onClick={() => setRenaming(true)}>Rename</Button>
          </div>
        )}
        <p className="text-xs text-muted-foreground">Estate ID: {estate.id}</p>
      </div>

      {/* Managers */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Managers</h2>
          {!showAddManager && (
            <Button size="sm" variant="outline" onClick={() => setShowAddManager(true)}>+ Add Manager</Button>
          )}
        </div>

        {showAddManager && (
          <form
            onSubmit={addForm.handleSubmit((d) => addManager.mutate({ ...d, estateId }))}
            className="rounded-lg border border-border bg-card p-4 space-y-3"
          >
            <p className="text-sm font-medium">New manager</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">First name</label>
                <input
                  type="text"
                  autoComplete="off"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  {...addForm.register('firstName', { required: 'Required' })}
                />
                {addForm.formState.errors.firstName && (
                  <p className="text-xs text-destructive">{addForm.formState.errors.firstName.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Last name</label>
                <input
                  type="text"
                  autoComplete="off"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  {...addForm.register('lastName', { required: 'Required' })}
                />
                {addForm.formState.errors.lastName && (
                  <p className="text-xs text-destructive">{addForm.formState.errors.lastName.message}</p>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <input
                type="email"
                autoComplete="off"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                {...addForm.register('email', { required: 'Required' })}
              />
              {addForm.formState.errors.email && (
                <p className="text-xs text-destructive">{addForm.formState.errors.email.message}</p>
              )}
            </div>
            {addManager.error && <p className="text-sm text-destructive">{addManager.error.message}</p>}
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => { setShowAddManager(false); addForm.reset(); addManager.reset() }}>Cancel</Button>
              <Button type="submit" size="sm" disabled={addManager.isPending}>
                {addManager.isPending ? 'Adding…' : 'Add Manager'}
              </Button>
            </div>
          </form>
        )}

        {managers.length > 0 ? (
          <ul className="space-y-1">
            {managers.map((m) => (
              <li key={m.id}>
                <button
                  onClick={() => navigate(`/admin/estates/${estateId}/managers/${m.id}`)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors text-sm"
                >
                  <span className="font-medium">{m.firstName} {m.lastName}</span>
                  <span className="text-muted-foreground">{m.email}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No managers yet.</p>
        )}
      </div>

      {/* Danger zone */}
      <div className="border-t border-border pt-6 space-y-3">
        <p className="text-sm font-semibold text-destructive">Danger Zone</p>
        <p className="text-sm text-muted-foreground">Permanently delete this estate and all its data.</p>
        {showDeleteConfirm ? (
          <div className="space-y-3">
            <p className="text-sm">
              Type <strong>{estate.name}</strong> to confirm deletion. This cannot be undone.
            </p>
            <input
              type="text"
              autoComplete="off"
              placeholder={estate.name}
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {deleteEstate.error && <p className="text-sm text-destructive">{deleteEstate.error.message}</p>}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmName('') }}>Cancel</Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={deleteEstate.isPending || deleteConfirmName !== estate.name}
                onClick={() => deleteEstate.mutate({ id: estateId })}
              >
                {deleteEstate.isPending ? 'Deleting…' : 'Delete Estate'}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="destructive" size="sm" onClick={() => setShowDeleteConfirm(true)}>Delete Estate</Button>
        )}
      </div>
    </div>
  )
}
