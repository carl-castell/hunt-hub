import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'

export function ManagerPage() {
  const { estateId, managerId } = useParams<{ estateId: string; managerId: string }>()
  const id = Number(managerId)
  const navigate = useNavigate()
  const utils = trpc.useUtils()

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [activationSent, setActivationSent] = useState(false)

  const { data, isLoading, error } = trpc.admin.managers.get.useQuery({ id })

  const deactivate = trpc.admin.managers.deactivate.useMutation({
    onSuccess: () => utils.admin.managers.get.invalidate({ id }),
  })

  const sendActivationLink = trpc.admin.managers.sendActivationLink.useMutation({
    onSuccess: () => setActivationSent(true),
  })

  const deleteManager = trpc.admin.managers.delete.useMutation({
    onSuccess: () => {
      utils.admin.estates.get.invalidate({ id: Number(estateId) })
      navigate(`/admin/estates/${estateId}`)
    },
  })

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
        <p className="text-sm text-destructive">{error?.message ?? 'Manager not found.'}</p>
        <Button variant="outline" size="sm" onClick={() => navigate(`/admin/estates/${estateId}`)}>← Back</Button>
      </div>
    )
  }

  return (
    <div className="max-w-lg space-y-8">
      <Button variant="outline" size="sm" onClick={() => navigate(`/admin/estates/${estateId}`)}>← Estate</Button>

      {/* Info */}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{data.firstName} {data.lastName}</h1>
        <p className="text-sm text-muted-foreground">{data.email}</p>
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
          <div>
            <p className="text-muted-foreground">Role</p>
            <p className="font-medium mt-0.5 capitalize">{data.role}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Status</p>
            <p className={`font-medium mt-0.5 ${data.active ? 'text-primary' : 'text-destructive'}`}>
              {data.active ? 'Active' : 'Inactive'}
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-3">
        {data.active ? (
          <div className="rounded-lg border border-border bg-card p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Deactivate account</p>
              <p className="text-xs text-muted-foreground mt-0.5">Prevents this manager from logging in.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={deactivate.isPending}
              onClick={() => deactivate.mutate({ id })}
            >
              {deactivate.isPending ? 'Deactivating…' : 'Deactivate'}
            </Button>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Send activation link</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {activationSent ? 'Activation email sent.' : 'Sends an email so the manager can set a new password.'}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={sendActivationLink.isPending || activationSent}
              onClick={() => sendActivationLink.mutate({ id })}
            >
              {sendActivationLink.isPending ? 'Sending…' : activationSent ? 'Sent' : 'Send link'}
            </Button>
          </div>
        )}

        {deactivate.error && <p className="text-sm text-destructive">{deactivate.error.message}</p>}
        {sendActivationLink.error && <p className="text-sm text-destructive">{sendActivationLink.error.message}</p>}
      </div>

      {/* Danger zone */}
      <div className="border-t border-border pt-6 space-y-3">
        <p className="text-sm font-semibold text-destructive">Danger Zone</p>
        <p className="text-sm text-muted-foreground">Permanently delete this manager and all their data.</p>
        {showDeleteConfirm ? (
          <div className="space-y-3">
            <p className="text-sm">
              Are you sure you want to delete <strong>{data.firstName} {data.lastName}</strong>? This cannot be undone.
            </p>
            {deleteManager.error && <p className="text-sm text-destructive">{deleteManager.error.message}</p>}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
              <Button variant="destructive" size="sm" disabled={deleteManager.isPending} onClick={() => deleteManager.mutate({ id })}>
                {deleteManager.isPending ? 'Deleting…' : 'Delete Manager'}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="destructive" size="sm" onClick={() => setShowDeleteConfirm(true)}>Delete Manager</Button>
        )}
      </div>
    </div>
  )
}
