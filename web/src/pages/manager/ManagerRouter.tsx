import { Routes, Route, Navigate } from 'react-router-dom'
import { ManagerLayout } from './ManagerLayout'
import { AreasPage } from './areas/AreasPage'
import { DashboardPage } from './dashboard/DashboardPage'
import { AreaPage } from './areas/AreaPage'
import { EventsPage } from './events/EventsPage'
import { EventPage } from './events/EventPage'
import { GuestDocumentsPage } from './documents/GuestDocumentsPage'

/** Manager pages that already live in the React app. */
export function ManagerRouter() {
  return (
    <Routes>
      <Route element={<ManagerLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="areas" element={<AreasPage />} />
        <Route path="areas/:id" element={<AreaPage />} />
        <Route path="events" element={<EventsPage />} />
        <Route path="events/:id" element={<EventPage />} />
        <Route path="guests/:guestId/documents" element={<GuestDocumentsPage />} />
        <Route path="*" element={<Navigate to="/manager" replace />} />
      </Route>
    </Routes>
  )
}
