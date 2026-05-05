import { createContext, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { trpc } from '@/lib/trpc'

type User = SessionUser

type AuthContextValue = {
  user: User | null
  isLoading: boolean
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const { data: user, isLoading } = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  })
  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => navigate('/login'),
  })

  return (
    <AuthContext.Provider value={{
      user: user ?? null,
      isLoading,
      logout: () => logoutMutation.mutate(),
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
