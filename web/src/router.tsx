import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { LoginPage } from '@/pages/login/LoginPage'
import { TotpPage } from '@/pages/totp/TotpPage'
import { TotpSetupPage } from '@/pages/totp/TotpSetupPage'
import { TotpBackupCodesPage } from '@/pages/totp/TotpBackupCodesPage'
import { TotpBackupPage } from '@/pages/totp/TotpBackupPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return null
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RootRedirect() {
  const { user, isLoading } = useAuth()
  if (isLoading) return null
  if (!user) return <Navigate to="/login" replace />
  switch (user.role) {
    case 'admin':   return <Navigate to="/admin" replace />
    case 'manager': return <Navigate to="/manager" replace />
    default:        return <Navigate to="/login" replace />
  }
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/totp" element={<TotpPage />} />
          <Route path="/totp/setup" element={<TotpSetupPage />} />
          <Route path="/totp/backup-codes" element={<TotpBackupCodesPage />} />
          <Route path="/totp/backup" element={<TotpBackupPage />} />
          <Route path="/" element={<RootRedirect />} />
          <Route path="/admin/*" element={<ProtectedRoute><div>Admin dashboard coming soon</div></ProtectedRoute>} />
          <Route path="/manager/*" element={<ProtectedRoute><div>Manager dashboard coming soon</div></ProtectedRoute>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
