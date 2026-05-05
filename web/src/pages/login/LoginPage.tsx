import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'

type LoginForm = {
  email: string
  password: string
}

export function LoginPage() {
  const navigate = useNavigate()
  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>()

  const utils = trpc.useUtils()
  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: (data) => {
      if (data.requiresTotp) {
        navigate('/totp')
      } else {
        utils.auth.me.setData(undefined, data.user ?? null)
        switch (data.user?.role) {
          case 'admin':   navigate('/admin'); break
          case 'manager': navigate('/manager'); break
          default:        navigate('/')
        }
      }
    },
  })

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8 rounded-lg border border-border bg-card">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Hunt Hub</h1>
          <p className="text-sm text-muted-foreground">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit((data) => loginMutation.mutate(data))} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              {...register('email', { required: 'Email is required' })}
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              {...register('password', { required: 'Password is required' })}
            />
            {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
          </div>

          {loginMutation.error && (
            <p className="text-sm text-destructive">{loginMutation.error.message}</p>
          )}

          <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
            {loginMutation.isPending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  )
}
