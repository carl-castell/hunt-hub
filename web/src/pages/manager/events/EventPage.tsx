import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeftIcon, CalendarBlankIcon, ClockIcon } from '@phosphor-icons/react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatEventDateLong } from './format'
import { GuestCounts } from './GuestCounts'
import { DrivesTab } from './DrivesTab'
import { DetailsTab } from './DetailsTab'
import { GuestsTab } from './GuestsTab'

const TABS = ['guests', 'drives', 'details'] as const
type Tab = (typeof TABS)[number]

/** One hunt: everything a manager plans for it, in tabs. The open tab is kept in the URL. */
export function EventPage() {
  const eventId = Number(useParams<{ id: string }>().id)
  const [params, setParams] = useSearchParams()
  const tab: Tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as Tab) : 'guests'
  const { data: event, isLoading, error } = trpc.manager.events.get.useQuery(
    { id: eventId },
    { enabled: Number.isInteger(eventId) && eventId > 0, retry: false },
  )

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>
  if (error || !event) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-destructive">{error?.message ?? 'Event not found'}</p>
        <Button variant="outline" size="sm" asChild><Link to="/manager/events">← All events</Link></Button>
      </div>
    )
  }

  return (
    <div className="max-w-4xl space-y-6">
      <header className="space-y-2">
        <Button variant="ghost" size="sm" asChild className="-ml-3 text-muted-foreground">
          <Link to="/manager/events"><ArrowLeftIcon /> All events</Link>
        </Button>
        <h1 className="text-2xl font-semibold">{event.name}</h1>
        <p className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><CalendarBlankIcon aria-hidden /> {formatEventDateLong(event.date)}</span>
          <span className="inline-flex items-center gap-1.5"><ClockIcon aria-hidden /> Starts {event.start}</span>
          <GuestCounts guests={event.guests} />
        </p>
      </header>

      <Tabs value={tab} onValueChange={(next) => setParams({ tab: next }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="guests">Guests <span className="tabular-nums text-muted-foreground">{event.guests.invited}</span></TabsTrigger>
          <TabsTrigger value="drives">Drives <span className="tabular-nums text-muted-foreground">{event.drives}</span></TabsTrigger>
          <TabsTrigger value="details">Details</TabsTrigger>
        </TabsList>
        <TabsContent value="guests"><GuestsTab event={event} /></TabsContent>
        <TabsContent value="drives"><DrivesTab event={event} /></TabsContent>
        <TabsContent value="details"><DetailsTab event={event} /></TabsContent>
      </Tabs>
    </div>
  )
}
