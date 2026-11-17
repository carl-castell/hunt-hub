import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { CalendarBlankIcon, ClockIcon, FlagIcon } from '@phosphor-icons/react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatEventDate, todayIso } from './format'
import { GuestCounts } from './GuestCounts'

type EventSummary = {
  id: number; name: string; date: string; start: string; drives: number
  guests: { invited: number; yes: number; no: number; open: number; notSent: number }
}

/** The estate's hunts: upcoming (today included) and past. */
export function EventsPage() {
  const { data, isLoading, error } = trpc.manager.events.list.useQuery()

  return (
    <div className="max-w-3xl space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Events</h1>
          <p className="text-sm text-muted-foreground">Hunts of your estate: drives, guests and their answers.</p>
        </div>
        <NewEventDialog />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {data && (
        <>
          <EventList title="Upcoming" events={data.upcoming} empty="No upcoming hunts. Plan the next one with “New event”." />
          {data.past.length > 0 && <EventList title="Past" events={data.past} muted />}
        </>
      )}
    </div>
  )
}

function EventList({ title, events, empty, muted = false }: { title: string; events: EventSummary[]; empty?: string; muted?: boolean }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {events.length === 0 && empty && <p className="text-sm text-muted-foreground">{empty}</p>}
      <ul className="divide-y divide-border rounded-md border border-border">
        {events.map((event) => (
          <li key={event.id}>
            <Link to={`/manager/events/${event.id}`}
              className={`flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 hover:bg-muted ${muted ? 'opacity-75' : ''}`}>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{event.name}</p>
                <p className="flex flex-wrap items-center gap-x-4 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><CalendarBlankIcon aria-hidden /> {formatEventDate(event.date)}</span>
                  <span className="inline-flex items-center gap-1"><ClockIcon aria-hidden /> {event.start}</span>
                  <span className="inline-flex items-center gap-1"><FlagIcon aria-hidden /> {event.drives === 1 ? '1 drive' : `${event.drives} drives`}</span>
                </p>
              </div>
              <GuestCounts guests={event.guests} className="text-sm" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

type NewEventForm = { name: string; date: string }

function NewEventDialog() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const utils = trpc.useUtils()
  const form = useForm<NewEventForm>({ defaultValues: { name: '', date: '' } })
  const defaultStart = trpc.manager.events.defaultStart.useQuery(undefined, { enabled: open })

  const create = trpc.manager.events.create.useMutation({
    onSuccess: ({ id }) => {
      utils.manager.events.list.invalidate()
      toast.success('Event created')
      setOpen(false)
      form.reset()
      navigate(`/manager/events/${id}?tab=drives`)
    },
    onError: (err) => toast.error(err.message),
  })

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) form.reset() }}>
      <Button onClick={() => setOpen(true)}>+ New event</Button>
      <DialogContent>
        <form onSubmit={form.handleSubmit((values) => create.mutate(values))} className="space-y-4">
          <DialogHeader>
            <DialogTitle>New event</DialogTitle>
            <DialogDescription>
              {defaultStart.data
                ? `The hunt starts with “Drive 1” at ${defaultStart.data}. You can change times and add drives on the next page.`
                : 'The hunt starts with “Drive 1”. You can change times and add drives on the next page.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="event-name">Name</Label>
            <Input id="event-name" autoFocus autoComplete="off" placeholder="e.g. Drückjagd Castell"
              {...form.register('name', { required: 'Please enter a name', maxLength: { value: 255, message: 'At most 255 characters' } })} />
            {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="event-date">Date</Label>
            <Input id="event-date" type="date" min={todayIso()} {...form.register('date', { required: 'Please choose a date' })} />
            {form.formState.errors.date && <p className="text-xs text-destructive">{form.formState.errors.date.message}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
