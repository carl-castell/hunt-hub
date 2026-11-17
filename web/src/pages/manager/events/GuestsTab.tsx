import { UsersIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { GuestCounts } from './GuestCounts'

type EventGuests = { id: number; guests: { invited: number; yes: number; no: number; open: number; notSent: number } }

/**
 * The guests of a hunt. For now a summary with a link to the guest list on
 * the old pages; the full guest list moves here next (HUN-89).
 */
export function GuestsTab({ event }: { event: EventGuests }) {
  return (
    <div className="space-y-4 rounded-md border border-border p-6">
      <p className="flex items-center gap-2 font-medium"><UsersIcon aria-hidden /> Guests and answers</p>
      <GuestCounts guests={event.guests} className="text-sm" />
      <p className="text-sm text-muted-foreground">Inviting guests and sending invitations still happens on the guest list page.</p>
      <Button asChild variant="outline">
        <a href={`/manager/events/${event.id}/invitations`}>Open guest list</a>
      </Button>
    </div>
  )
}
