import { trpc } from '@/lib/trpc'

/** Reload an event and the events list after a change. */
export function useInvalidateEvent(eventId: number) {
  const utils = trpc.useUtils()
  return () => {
    void utils.manager.events.get.invalidate({ id: eventId })
    void utils.manager.events.list.invalidate()
  }
}

/** Reload the guest list of an event, its counts and the events list. */
export function useInvalidateGuests(eventId: number) {
  const utils = trpc.useUtils()
  return () => {
    void utils.manager.invitations.list.invalidate({ eventId })
    void utils.manager.invitations.searchGuests.invalidate({ eventId })
    void utils.manager.invitations.get.invalidate()
    void utils.manager.events.get.invalidate({ id: eventId })
    void utils.manager.events.list.invalidate()
  }
}
