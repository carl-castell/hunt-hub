import { trpc } from '@/lib/trpc'

/** Reload an event and the events list after a change. */
export function useInvalidateEvent(eventId: number) {
  const utils = trpc.useUtils()
  return () => {
    void utils.manager.events.get.invalidate({ id: eventId })
    void utils.manager.events.list.invalidate()
  }
}
