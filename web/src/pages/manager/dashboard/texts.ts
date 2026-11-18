import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '@hunt-hub/backend/src/trpc/router'

export type Dashboard = inferRouterOutputs<AppRouter>['manager']['dashboard']['get']
export type Todo = Dashboard['todos'][number]

/** "Good morning" / "Good afternoon" / "Good evening", by the hour of the day. */
export function greeting(now = new Date()): string {
  const h = now.getHours()
  if (h < 5 || h >= 18) return 'Good evening'
  return h < 12 ? 'Good morning' : 'Good afternoon'
}

/** "today", "tomorrow", "in 17 days". */
export function whenText(daysLeft: number): string {
  if (daysLeft === 0) return 'today'
  if (daysLeft === 1) return 'tomorrow'
  return `in ${daysLeft} days`
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** What a to-do says, and where it is solved. Whole sentences, for the later translation. */
export function todoText(t: Todo, formatDate: (d: string) => string): { text: string; detail?: string; to: string; tone: 'red' | 'amber' | 'grey' } {
  switch (t.code) {
    case 'coming_without_licence':
      return {
        text: `${plural(t.count, 'guest is', 'guests are')} coming without a checked, valid licence`,
        detail: `${t.eventName}: ${t.names.join(', ')}${t.count > t.names.length ? ' …' : ''}`,
        to: `/manager/events/${t.eventId}?tab=guests&show=yes`, tone: 'red',
      }
    case 'documents_to_check':
      return { text: `${plural(t.count, 'document', 'documents')} to check`, detail: t.eventName, to: `/manager/events/${t.eventId}?tab=guests&open=check`, tone: 'amber' }
    case 'answer_deadline':
      return {
        text: `Answer-by date ${whenText(t.daysLeft)}: ${plural(t.count, 'guest has', 'guests have')} not answered`,
        detail: `${t.eventName} · ${formatDate(t.respondBy)}`,
        to: `/manager/events/${t.eventId}?tab=guests&open=remind`, tone: 'amber',
      }
    case 'no_answer':
      return { text: `${plural(t.count, 'guest has', 'guests have')} not answered yet`, detail: t.eventName, to: `/manager/events/${t.eventId}?tab=guests&open=remind`, tone: 'grey' }
    case 'not_sent':
      return { text: `${plural(t.count, 'invitation is', 'invitations are')} not sent yet`, detail: t.eventName, to: `/manager/events/${t.eventId}?tab=guests&open=send`, tone: 'amber' }
    case 'rejected_waiting':
      return { text: `${plural(t.count, 'rejected document is', 'rejected documents are')} waiting for a new upload`, detail: t.eventName, to: `/manager/events/${t.eventId}?tab=guests`, tone: 'grey' }
    case 'no_guests':
      return { text: `No guests invited yet, and the hunt is ${whenText(t.daysLeft)}`, detail: t.eventName, to: `/manager/events/${t.eventId}?tab=guests&open=invite`, tone: 'amber' }
    case 'stands_damaged': {
      const parts = [t.broken ? plural(t.broken, 'stand is broken', 'stands are broken') : null, t.needsRepair ? `${t.needsRepair} ${t.needsRepair === 1 ? 'needs' : 'need'} repair` : null].filter(Boolean)
      return { text: parts.join(', '), detail: t.areaName, to: `/manager/areas/${t.areaId}`, tone: t.broken ? 'red' : 'amber' }
    }
    case 'area_without_boundary':
      return { text: 'Area has no boundary yet', detail: t.areaName, to: `/manager/areas/${t.areaId}`, tone: 'grey' }
  }
}
