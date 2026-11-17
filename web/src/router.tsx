import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { LoginPage } from '@/pages/login/LoginPage'
import { TotpPage } from '@/pages/totp/TotpPage'
import { TotpSetupPage } from '@/pages/totp/TotpSetupPage'
import { TotpBackupCodesPage } from '@/pages/totp/TotpBackupCodesPage'
import { TotpBackupPage } from '@/pages/totp/TotpBackupPage'
import { AdminRouter } from '@/pages/admin/AdminRouter'
import { ManagerRouter } from '@/pages/manager/ManagerRouter'
import { RequireRole } from '@/components/RequireRole'
import { RsvpPage, RsvpPreviewPage } from '@/pages/rsvp/RsvpPage'
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
          {/* The guests' answer page: public, the link's id is the key. The preview is for managers. */}
          <Route path="/rsvp/preview/:eventId" element={<RequireRole role="manager"><RsvpPreviewPage /></RequireRole>} />
          <Route path="/rsvp/:publicId" element={<RsvpPage />} />
          <Route path="/admin/*" element={<RequireRole role="admin"><AdminRouter /></RequireRole>} />
          <Route path="/manager/*" element={<RequireRole role="manager"><ManagerRouter /></RequireRole>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
