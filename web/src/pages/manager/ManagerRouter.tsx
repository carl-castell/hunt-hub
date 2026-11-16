import { Routes, Route, Navigate } from 'react-router-dom'
import { ManagerLayout } from './ManagerLayout'
import { AreasPage } from './areas/AreasPage'
import { AreaPage } from './areas/AreaPage'

/** Manager pages that already live in the React app. */
export function ManagerRouter() {
  return (
    <Routes>
      <Route element={<ManagerLayout />}>
        <Route index element={<Navigate to="/manager/areas" replace />} />
        <Route path="areas" element={<AreasPage />} />
        <Route path="areas/:id" element={<AreaPage />} />
        <Route path="*" element={<Navigate to="/manager/areas" replace />} />
      </Route>
    </Routes>
  )
}
