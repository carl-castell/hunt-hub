import { Routes, Route, Navigate } from 'react-router-dom'
import { ManagerLayout } from './ManagerLayout'
import { LegacyRedirect } from '@/components/LegacyRedirect'
import { AreasPage } from './areas/AreasPage'
import { AreaPage } from './areas/AreaPage'

/** Manager pages that already live in the React app. */
export function ManagerRouter() {
  return (
    <Routes>
      {/* The manager's home is the dashboard, which is still server-rendered. */}
      <Route index element={<LegacyRedirect to="/manager" />} />
      <Route element={<ManagerLayout />}>
        <Route path="areas" element={<AreasPage />} />
        <Route path="areas/:id" element={<AreaPage />} />
        <Route path="*" element={<Navigate to="/manager/areas" replace />} />
      </Route>
    </Routes>
  )
}
