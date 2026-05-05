import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'

type CreateAdminForm = { firstName: string; lastName: string; email: string }

export function SettingsPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const utils = trpc.useUtils()
  const [showCreate, setShowCreate] = useState(false)
  const [createSuccess, setCreateSuccess] = useState(false)

  const { data: admins, isLoading } = trpc.admin.settings.listAdmins.useQuery()

  const createAdmin = trpc.admin.settings.createAdmin.useMutation({
    onSuccess: () => {
      utils.admin.settings.listAdmins.invalidate()
      reset()
      setShowCreate(false)
      setCreateSuccess(true)
    },
  })

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateAdminForm>()

  function handleAdminClick(id: number) {
    if (id === user?.id) {
      navigate('/admin/account')
    } else {
      navigate(`/admin/settings/admins/${id}`)
    }
  }

  return (
    <div className="max-w-lg space-y-8">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Admins</p>
          {!showCreate && (
            <Button size="sm" variant="outline" onClick={() => { setCreateSuccess(false); setShowCreate(true) }}>
              + New Admin
            </Button>
          )}
        </div>

        {createSuccess && (
          <p className="text-sm text-primary">Admin created. Send them an activation link from their profile.</p>
        )}

        {showCreate && (
          <form
            onSubmit={handleSubmit((d) => createAdmin.mutate(d))}
            className="rounded-lg border border-border bg-card p-4 space-y-3"
          >
            <p className="text-sm font-medium">New admin</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">First name</label>
                <input
                  type="text"
                  autoComplete="off"
                  autoFocus
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  {...register('firstName', { required: 'Required' })}
                />
                {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Last name</label>
                <input
                  type="text"
                  autoComplete="off"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  {...register('lastName', { required: 'Required' })}
                />
                {errors.lastName && <p className="text-xs text-destructive">{errors.lastName.message}</p>}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Email</label>
              <input
                type="email"
                autoComplete="off"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                {...register('email', { required: 'Required' })}
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            {createAdmin.error && <p className="text-sm text-destructive">{createAdmin.error.message}</p>}
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => { reset(); setShowCreate(false) }}>Cancel</Button>
              <Button type="submit" size="sm" disabled={createAdmin.isPending}>
                {createAdmin.isPending ? 'Creating…' : 'Create Admin'}
              </Button>
            </div>
          </form>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center h-16">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <ul className="space-y-1">
            {admins?.map((admin) => (
              <li key={admin.id}>
                <button
                  onClick={() => handleAdminClick(admin.id)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors text-sm"
                >
                  <span className="font-medium">
                    {admin.firstName} {admin.lastName}
                    {admin.id === user?.id && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{admin.email}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${admin.active ? 'bg-green-500/15 text-green-500' : 'bg-destructive/15 text-destructive'}`}>
                      {admin.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
