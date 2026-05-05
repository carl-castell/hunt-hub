import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'

type BackupForm = { code: string }

export function TotpBackupPage() {
  const navigate = useNavigate()
  const { register, handleSubmit, formState: { errors } } = useForm<BackupForm>()

  const mutation = trpc.auth.useBackupCode.useMutation({
    onSuccess: () => {
      navigate('/totp/setup', { replace: true })
    },
  })

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8 rounded-lg border border-border bg-card">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Use a backup code</h1>
          <p className="text-sm text-muted-foreground">
            Enter one of your backup codes. Using a backup code will require you to re-enroll your
            authenticator app.
          </p>
        </div>

        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="code">Backup code</label>
            <input
              id="code"
              type="text"
              autoComplete="off"
              placeholder="XXXX-XXXX-XXXX"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-ring"
              {...register('code', { required: 'Backup code is required' })}
            />
            {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
          </div>

          {mutation.error && (
            <p className="text-sm text-destructive">{mutation.error.message}</p>
          )}

          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? 'Verifying…' : 'Use backup code'}
          </Button>
        </form>

        <div className="text-center">
          <button
            type="button"
            onClick={() => navigate('/totp')}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Back to authenticator code
          </button>
        </div>
      </div>
    </div>
  )
}
