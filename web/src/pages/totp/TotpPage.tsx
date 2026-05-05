import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'

type VerifyForm = { token: string }

export function TotpPage() {
  const navigate = useNavigate()
  const utils = trpc.useUtils()
  const { data, error: statusError, isLoading } = trpc.auth.checkPendingTotp.useQuery()
  const { register, handleSubmit, formState: { errors }, setFocus } = useForm<VerifyForm>()

  const verifyMutation = trpc.auth.verifyTotp.useMutation({
    onSuccess: (user) => {
      utils.auth.me.setData(undefined, user)
      switch (user.role) {
        case 'admin':   navigate('/admin'); break
        default:        navigate('/')
      }
    },
  })

  useEffect(() => {
    if (data?.needsSetup) navigate('/totp/setup', { replace: true })
  }, [data, navigate])

  useEffect(() => {
    if (data && !data.needsSetup) setFocus('token')
  }, [data, setFocus])

  if (statusError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-full max-w-sm space-y-4 p-8 rounded-lg border border-border bg-card text-center">
          <p className="text-sm text-destructive">{statusError.message}</p>
          <Button variant="outline" onClick={() => navigate('/login')}>Back to login</Button>
        </div>
      </div>
    )
  }

  if (isLoading || data?.needsSetup) return null

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8 rounded-lg border border-border bg-card">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Two-factor authentication</h1>
          <p className="text-sm text-muted-foreground">Enter the 6-digit code from your authenticator app.</p>
        </div>

        <form onSubmit={handleSubmit((d) => verifyMutation.mutate(d))} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="token">Authentication code</label>
            <input
              id="token"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-ring"
              {...register('token', { required: 'Code is required' })}
            />
            {errors.token && <p className="text-xs text-destructive">{errors.token.message}</p>}
          </div>

          {verifyMutation.error && (
            <p className="text-sm text-destructive">{verifyMutation.error.message}</p>
          )}

          <Button type="submit" className="w-full" disabled={verifyMutation.isPending}>
            {verifyMutation.isPending ? 'Verifying…' : 'Verify'}
          </Button>
        </form>

        <div className="text-center space-y-1">
          <button
            type="button"
            onClick={() => navigate('/totp/backup')}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Use a backup code instead
          </button>
        </div>
      </div>
    </div>
  )
}
