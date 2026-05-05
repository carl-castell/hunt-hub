import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'

type ConfirmForm = { token: string }

export function TotpSetupPage() {
  const navigate = useNavigate()
  const setupMutation = trpc.auth.beginTotpSetup.useMutation()
  const { register, handleSubmit, formState: { errors }, setFocus } = useForm<ConfirmForm>()

  const confirmMutation = trpc.auth.confirmTotpSetup.useMutation({
    onSuccess: ({ codes }) => {
      navigate('/totp/backup-codes', { state: { codes } })
    },
  })

  useEffect(() => {
    setupMutation.mutate()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (setupMutation.data) setFocus('token')
  }, [setupMutation.data, setFocus])

  if (setupMutation.error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-full max-w-sm space-y-4 p-8 rounded-lg border border-border bg-card text-center">
          <p className="text-sm text-destructive">{setupMutation.error.message}</p>
          <Button variant="outline" onClick={() => navigate('/login')}>Back to login</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8 rounded-lg border border-border bg-card">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Set up two-factor authentication</h1>
          <p className="text-sm text-muted-foreground">
            Scan this QR code with your authenticator app, then enter the 6-digit code to confirm.
          </p>
        </div>

        {!setupMutation.data ? (
          <div className="flex justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center space-y-3">
              <img
                src={setupMutation.data.qrDataUrl}
                alt="TOTP QR code"
                className="rounded-md border border-border"
                width={200}
                height={200}
              />
              <p className="text-xs text-muted-foreground font-mono break-all text-center">
                {setupMutation.data.secret}
              </p>
            </div>

            <form onSubmit={handleSubmit((d) => confirmMutation.mutate(d))} className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="token">Confirmation code</label>
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

              {confirmMutation.error && (
                <p className="text-sm text-destructive">{confirmMutation.error.message}</p>
              )}

              <Button type="submit" className="w-full" disabled={confirmMutation.isPending}>
                {confirmMutation.isPending ? 'Confirming…' : 'Confirm and continue'}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
