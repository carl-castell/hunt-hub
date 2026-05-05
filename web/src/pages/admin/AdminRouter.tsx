import { Routes, Route, Navigate } from 'react-router-dom'
import { AdminLayout } from './AdminLayout'
import { DashboardPage } from './dashboard/DashboardPage'
import { AuditPage } from './audit/AuditPage'
import { SettingsPage } from './settings/SettingsPage'
import { AdminDetailPage } from './settings/AdminDetailPage'
import { AccountPage } from './account/AccountPage'
import { EstatePage } from './estate/EstatePage'
import { ManagerPage } from './manager/ManagerPage'

export function AdminRouter() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="audit" element={<AuditPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="settings/admins/:id" element={<AdminDetailPage />} />
        <Route path="account" element={<AccountPage />} />
        <Route path="estates/:id" element={<EstatePage />} />
        <Route path="estates/:estateId/managers/:managerId" element={<ManagerPage />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  )
}
