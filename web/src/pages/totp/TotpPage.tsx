import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { OtpInput } from '@/components/ui/OtpInput'

export function TotpPage() {
  const navigate = useNavigate()
  const utils = trpc.useUtils()
  const { data, error: statusError, isLoading } = trpc.auth.checkPendingTotp.useQuery()

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

        <div className="space-y-4">
          <OtpInput
            onComplete={(token) => verifyMutation.mutate({ token })}
            disabled={verifyMutation.isPending}
          />

          {verifyMutation.error && (
            <p className="text-sm text-destructive text-center">{verifyMutation.error.message}</p>
          )}

          {verifyMutation.isPending && (
            <p className="text-sm text-muted-foreground text-center">Verifying…</p>
          )}
        </div>

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
