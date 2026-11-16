import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { LoginPage } from '@/pages/login/LoginPage'
import { TotpPage } from '@/pages/totp/TotpPage'
import { TotpSetupPage } from '@/pages/totp/TotpSetupPage'
import { TotpBackupCodesPage } from '@/pages/totp/TotpBackupCodesPage'
import { TotpBackupPage } from '@/pages/totp/TotpBackupPage'
import { AdminRouter } from '@/pages/admin/AdminRouter'
import { RequireRole } from '@/components/RequireRole'
import { homeForRole } from '@/lib/roles'

function RootRedirect() {
  const { user, isLoading } = useAuth()
  if (isLoading) return null
  return <Navigate to={homeForRole(user?.role)} replace />
}

export function AppRouter() {
  return (
    <BrowserRouter basename="/app">
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/totp" element={<TotpPage />} />
          <Route path="/totp/setup" element={<TotpSetupPage />} />
          <Route path="/totp/backup-codes" element={<TotpBackupCodesPage />} />
          <Route path="/totp/backup" element={<TotpBackupPage />} />
          <Route path="/" element={<RootRedirect />} />
          <Route path="/admin/*" element={<RequireRole role="admin"><AdminRouter /></RequireRole>} />
          <Route path="/manager/*" element={<RequireRole role="manager"><div>Manager dashboard coming soon</div></RequireRole>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
