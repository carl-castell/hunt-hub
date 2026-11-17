import { useForm } from 'react-hook-form'
import { Navigate, useNavigate } from 'react-router-dom'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/context/AuthContext'
import { hasWebArea, homeForRole } from '@/lib/roles'

type LoginFields = {
  email: string
  password: string
}

export function LoginPage() {
  const { user, isLoading } = useAuth()
  if (isLoading) return null
  if (user && hasWebArea(user.role)) return <Navigate to={homeForRole(user.role)} replace />
  if (user) return <NoWebAreaNotice />
  return <LoginForm />
}

/** Staff (and guests) can log in, but have nothing to do in the web app. */
function NoWebAreaNotice() {
  const { logout } = useAuth()
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-4 p-8 rounded-lg border border-border bg-card">
        <h1 className="text-2xl font-semibold">Hunt Hub</h1>
        <p className="text-sm text-muted-foreground">
          Your account works with the Hunt Hub iPhone app. Please sign in there.
        </p>
        <Button variant="outline" className="w-full" onClick={logout}>Sign out</Button>
      </div>
    </div>
  )
}

function LoginForm() {
  const navigate = useNavigate()
  const { register, handleSubmit, formState: { errors } } = useForm<LoginFields>()

  const utils = trpc.useUtils()
  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: (data) => {
      if (data.requiresTotp) {
        navigate('/totp')
      } else {
        utils.auth.me.setData(undefined, data.user ?? null)
        navigate(homeForRole(data.user?.role))
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

        <DevLogin />
      </div>
    </div>
  )
}

/**
 * Local development only (DEV_LOGIN=true in backend/.env): log in as any admin
 * or manager with one click. Without that setting the server answers "not
 * found" and nothing is shown; the production build doesn't even ask.
 */
function DevLogin() {
  const navigate = useNavigate()
  const utils = trpc.useUtils()
  // Only asked by the Vite dev server; the production build never calls it.
  const users = trpc.dev.users.useQuery(undefined, { enabled: import.meta.env.DEV, retry: false, refetchOnWindowFocus: false })
  const loginAs = trpc.dev.loginAs.useMutation({
    onSuccess: (user) => {
      utils.auth.me.setData(undefined, user)
      navigate(homeForRole(user.role))
    },
  })

  if (!users.data?.length) return null

  return (
    <div className="space-y-2 rounded-md border border-dashed border-amber-500 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Dev login (only on this computer)</p>
      <ul className="space-y-1">
        {users.data.map((u) => (
          <li key={u.id}>
            <button type="button" onClick={() => loginAs.mutate({ userId: u.id })} disabled={loginAs.isPending}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50">
              <span className="w-16 shrink-0 text-xs capitalize text-muted-foreground">{u.role}</span>
              <span className="truncate font-medium">{u.firstName} {u.lastName}</span>
              <span className="ml-auto truncate text-xs text-muted-foreground">{u.email}</span>
            </button>
          </li>
        ))}
      </ul>
      {loginAs.error && <p className="text-xs text-destructive">{loginAs.error.message}</p>}
    </div>
  )
}
