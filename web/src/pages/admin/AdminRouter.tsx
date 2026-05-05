import { Routes, Route, Navigate } from 'react-router-dom'
import { AdminLayout } from './AdminLayout'
import { AccountPage } from './account/AccountPage'

export function AdminRouter() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<div className="text-muted-foreground text-sm">Dashboard coming soon</div>} />
        <Route path="account" element={<AccountPage />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
    </Routes>
  )
}
