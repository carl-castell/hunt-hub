import { useLocation, useNavigate } from 'react-router-dom'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'

export function TotpBackupCodesPage() {
  const navigate = useNavigate()
  const location = useLocation()

  const codesFromState: string[] | undefined = (location.state as { codes?: string[] })?.codes
  const fallback = trpc.auth.getBackupCodes.useQuery(undefined, { enabled: !codesFromState })
  const codes = codesFromState ?? fallback.data?.codes

  const utils = trpc.useUtils()
  const confirmMutation = trpc.auth.confirmBackupCodesSaved.useMutation({
    onSuccess: (user) => {
      utils.auth.me.setData(undefined, user)
      switch (user.role) {
        case 'admin': navigate('/admin'); break
        default:      navigate('/')
      }
    },
  })

  function download() {
    if (!codes) return
    const lines = [
      'Hunt-Hub Admin Backup Codes',
      `Generated: ${new Date().toUTCString()}`,
      '',
      'Store these codes somewhere safe. Each code can only be used once.',
      '',
      ...codes,
    ].join('\n')
    const blob = new Blob([lines], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'hunt-hub-backup-codes.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (fallback.error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-full max-w-sm space-y-4 p-8 rounded-lg border border-border bg-card text-center">
          <p className="text-sm text-destructive">{fallback.error.message}</p>
          <Button variant="outline" onClick={() => navigate('/login')}>Back to login</Button>
        </div>
      </div>
    )
  }

  if (!codes) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8 rounded-lg border border-border bg-card">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Save your backup codes</h1>
          <p className="text-sm text-muted-foreground">
            Store these somewhere safe. Each code can only be used once. If you lose access to your
            authenticator app, these are the only way to recover your account.
          </p>
        </div>

        <div className="rounded-md border border-border bg-muted/50 p-4">
          <ul className="grid grid-cols-2 gap-1">
            {codes.map((code) => (
              <li key={code} className="font-mono text-sm">{code}</li>
            ))}
          </ul>
        </div>

        <div className="space-y-3">
          <Button variant="outline" className="w-full" onClick={download}>
            Download codes
          </Button>
          <Button
            className="w-full"
            disabled={confirmMutation.isPending}
            onClick={() => confirmMutation.mutate()}
          >
            {confirmMutation.isPending ? 'Continuing…' : 'I’ve saved my backup codes'}
          </Button>
        </div>

        {confirmMutation.error && (
          <p className="text-sm text-destructive text-center">{confirmMutation.error.message}</p>
        )}
      </div>
    </div>
  )
}
