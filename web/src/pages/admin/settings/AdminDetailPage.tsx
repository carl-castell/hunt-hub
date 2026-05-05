import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'

export function AdminDetailPage() {
  const { id } = useParams<{ id: string }>()
  const adminId = Number(id)
  const navigate = useNavigate()
  const utils = trpc.useUtils()

  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmName, setDeleteConfirmName] = useState('')
  const [activationSent, setActivationSent] = useState(false)

  const { data, isLoading, error } = trpc.admin.managers.get.useQuery({ id: adminId })

  const deactivate = trpc.admin.managers.deactivate.useMutation({
    onSuccess: () => {
      utils.admin.managers.get.invalidate({ id: adminId })
      setShowDeactivateConfirm(false)
    },
  })

  const sendActivationLink = trpc.admin.managers.sendActivationLink.useMutation({
    onSuccess: () => setActivationSent(true),
  })

  const deleteAdmin = trpc.admin.managers.delete.useMutation({
    onSuccess: () => {
      utils.admin.settings.listAdmins.invalidate()
      navigate('/admin/settings')
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
        <p className="text-sm text-destructive">{error?.message ?? 'Admin not found.'}</p>
        <Button variant="outline" size="sm" onClick={() => navigate('/admin/settings')}>← Settings</Button>
      </div>
    )
  }

  const fullName = `${data.firstName} ${data.lastName}`

  return (
    <div className="max-w-lg space-y-8">
      <Button variant="outline" size="sm" onClick={() => navigate('/admin/settings')}>← Settings</Button>

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">{fullName}</h1>
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

      <div className="space-y-3">
        {data.active ? (
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Deactivate account</p>
                <p className="text-xs text-muted-foreground mt-0.5">Prevents this admin from logging in.</p>
              </div>
              {!showDeactivateConfirm && (
                <Button variant="outline" size="sm" onClick={() => setShowDeactivateConfirm(true)}>Deactivate</Button>
              )}
            </div>
            {showDeactivateConfirm && (
              <div className="flex items-center gap-2">
                <p className="text-sm flex-1">Are you sure?</p>
                <Button variant="outline" size="sm" onClick={() => setShowDeactivateConfirm(false)}>Cancel</Button>
                <Button variant="destructive" size="sm" disabled={deactivate.isPending} onClick={() => deactivate.mutate({ id: adminId })}>
                  {deactivate.isPending ? 'Deactivating…' : 'Confirm'}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Send activation link</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {activationSent ? 'Activation email sent.' : 'Sends an email so the admin can set a new password.'}
              </p>
            </div>
            <Button variant="outline" size="sm" disabled={sendActivationLink.isPending || activationSent} onClick={() => sendActivationLink.mutate({ id: adminId })}>
              {sendActivationLink.isPending ? 'Sending…' : activationSent ? 'Sent' : 'Send link'}
            </Button>
          </div>
        )}
        {deactivate.error && <p className="text-sm text-destructive">{deactivate.error.message}</p>}
        {sendActivationLink.error && <p className="text-sm text-destructive">{sendActivationLink.error.message}</p>}
      </div>

      <div className="border-t border-border pt-6 space-y-3">
        <p className="text-sm font-semibold text-destructive">Danger Zone</p>
        <p className="text-sm text-muted-foreground">Permanently delete this admin account.</p>
        {showDeleteConfirm ? (
          <div className="space-y-3">
            <p className="text-sm">Type <strong>{fullName}</strong> to confirm.</p>
            <input
              type="text"
              autoComplete="off"
              placeholder={fullName}
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {deleteAdmin.error && <p className="text-sm text-destructive">{deleteAdmin.error.message}</p>}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmName('') }}>Cancel</Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={deleteAdmin.isPending || deleteConfirmName !== fullName}
                onClick={() => deleteAdmin.mutate({ id: adminId })}
              >
                {deleteAdmin.isPending ? 'Deleting…' : 'Delete Admin'}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="destructive" size="sm" onClick={() => setShowDeleteConfirm(true)}>Delete Admin</Button>
        )}
      </div>
    </div>
  )
}
