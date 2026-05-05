import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'

type PasswordForm = {
  oldPassword: string
  newPassword: string
  confirmPassword: string
}

export function AccountPage() {
  const navigate = useNavigate()
  const utils = trpc.useUtils()
  const [showPasswordForm, setShowPasswordForm] = useState(false)

  const { data, isLoading } = trpc.admin.account.get.useQuery()

  const changePassword = trpc.admin.account.changePassword.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null)
      navigate('/login')
    },
  })

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<PasswordForm>()
  const newPassword = watch('newPassword', '')

  const hints = {
    length:  newPassword.length >= 8,
    upper:   /[A-Z]/.test(newPassword),
    number:  /[0-9]/.test(newPassword),
    special: /[^a-zA-Z0-9]/.test(newPassword),
  }

  function cancel() {
    reset()
    changePassword.reset()
    setShowPasswordForm(false)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-semibold">My Account</h1>

      <div className="rounded-lg border border-border bg-card p-6">
        <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
          <div>
            <p className="text-muted-foreground">First name</p>
            <p className="font-medium mt-0.5">{data?.firstName}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Last name</p>
            <p className="font-medium mt-0.5">{data?.lastName}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Email</p>
            <p className="font-medium mt-0.5">{data?.email}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Role</p>
            <p className="font-medium mt-0.5 capitalize">{data?.role}</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Password</p>
          {!showPasswordForm && (
            <Button variant="outline" size="sm" onClick={() => setShowPasswordForm(true)}>
              Change password
            </Button>
          )}
        </div>

        {showPasswordForm && (
          <form onSubmit={handleSubmit((d) => changePassword.mutate(d))} className="space-y-4 pt-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Current password</label>
              <input
                type="password"
                autoComplete="current-password"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                {...register('oldPassword', { required: 'Required' })}
              />
              {errors.oldPassword && <p className="text-xs text-destructive">{errors.oldPassword.message}</p>}
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">New password</label>
              <input
                type="password"
                autoComplete="new-password"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                {...register('newPassword', { required: 'Required' })}
              />
              <ul className="mt-1.5 space-y-0.5 text-xs">
                <li className={hints.length  ? 'text-primary' : 'text-muted-foreground'}>✓ At least 8 characters</li>
                <li className={hints.upper   ? 'text-primary' : 'text-muted-foreground'}>✓ One uppercase letter</li>
                <li className={hints.number  ? 'text-primary' : 'text-muted-foreground'}>✓ One number</li>
                <li className={hints.special ? 'text-primary' : 'text-muted-foreground'}>✓ One special character</li>
              </ul>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Confirm new password</label>
              <input
                type="password"
                autoComplete="new-password"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                {...register('confirmPassword', {
                  required: 'Required',
                  validate: v => v === newPassword || 'Passwords do not match',
                })}
              />
              {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword.message}</p>}
            </div>

            {changePassword.error && (
              <p className="text-sm text-destructive">{changePassword.error.message}</p>
            )}

            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" onClick={cancel}>Cancel</Button>
              <Button type="submit" disabled={changePassword.isPending}>
                {changePassword.isPending ? 'Saving…' : 'Save password'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
