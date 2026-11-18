import { Link } from 'react-router-dom'
import {
  ArrowRightIcon, BellRingingIcon, CalendarBlankIcon, CaretRightIcon, CheckCircleIcon, CheckSquareIcon, ClockIcon, FlagIcon,
  MapTrifoldIcon, PaperPlaneTiltIcon, PlusIcon, UsersIcon,
} from '@phosphor-icons/react'
import { useAuth } from '@/context/AuthContext'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { GuestCounts } from '../events/GuestCounts'
import { greeting, todoText, whenText, type Dashboard } from './texts'

const shortDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
const longToday = () => new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

/**
 * The manager's start page. It answers "what do I have to do before the next
 * hunt?": the next hunt with its next steps, a to-do list (most urgent first,
 * each item one click from where it is solved), upcoming hunts and areas.
 */
export function DashboardPage() {
  const { user } = useAuth()
  const { data, isLoading, error } = trpc.manager.dashboard.get.useQuery()
  const estate = trpc.manager.estate.get.useQuery()

  return (
    <div className="max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">{greeting()}{user?.firstName ? `, ${user.firstName}` : ''}</h1>
          <p className="text-sm text-muted-foreground">{estate.data?.name ? `${estate.data.name} · ` : ''}{longToday()}</p>
        </div>
      </header>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {data && (
        <>
          <NextHunt hunt={data.nextHunt} />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <TodoList todos={data.todos} />
            <div className="space-y-6">
              <UpcomingHunts hunts={data.upcoming} pastCount={data.pastCount} />
              <Areas areas={data.areas} />
            </div>
          </div>
          <QuickLinks guests={data.counts.guests} groups={data.counts.groups} />
        </>
      )}
    </div>
  )
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-border bg-background p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** The answers as one bar: coming, not coming, no answer, not sent. */
function AnswerBar({ guests }: { guests: { invited: number; yes: number; no: number; open: number; notSent: number } }) {
  if (guests.invited === 0) return null
  const parts = [
    { n: guests.yes, className: 'bg-green-600', label: 'Coming' },
    { n: guests.no, className: 'bg-red-500', label: 'Not coming' },
    { n: guests.open, className: 'bg-muted-foreground/40', label: 'No answer' },
    { n: guests.notSent, className: 'bg-amber-400', label: 'Not sent' },
  ].filter((p) => p.n > 0)
  return (
    <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" role="img"
      aria-label={parts.map((p) => `${p.label} ${p.n}`).join(', ')}>
      {parts.map((p) => <div key={p.label} className={p.className} style={{ width: `${(p.n / guests.invited) * 100}%` }} title={`${p.label}: ${p.n}`} />)}
    </div>
  )
}

function NextHunt({ hunt }: { hunt: Dashboard['nextHunt'] }) {
  if (!hunt) {
    return (
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-dashed border-border p-6">
        <div>
          <p className="font-medium">No hunt planned</p>
          <p className="text-sm text-muted-foreground">Plan the next one: drives, guests and invitations in one place.</p>
        </div>
        <Button asChild><Link to="/manager/events"><PlusIcon /> Plan a hunt</Link></Button>
      </section>
    )
  }
  const base = `/manager/events/${hunt.id}?tab=guests`
  return (
    <section className="space-y-4 rounded-lg border border-primary/30 bg-primary/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Next hunt · {whenText(hunt.daysLeft)}</p>
          <h2 className="text-xl font-semibold">{hunt.name}</h2>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1"><CalendarBlankIcon aria-hidden /> {shortDate(hunt.date)}</span>
            <span className="inline-flex items-center gap-1"><ClockIcon aria-hidden /> Starts {hunt.start}</span>
            <span className="inline-flex items-center gap-1"><FlagIcon aria-hidden /> {hunt.drives === 1 ? '1 drive' : `${hunt.drives} drives`}</span>
          </p>
        </div>
        <Button asChild variant="outline"><Link to={`/manager/events/${hunt.id}`}>Open hunt <ArrowRightIcon /></Link></Button>
      </div>
      <div className="space-y-2">
        <AnswerBar guests={hunt.guests} />
        <GuestCounts guests={hunt.guests} className="text-sm" />
      </div>
      <div className="flex flex-wrap gap-2">
        {hunt.guests.invited === 0 && <Button asChild><Link to={`${base}&open=invite`}><PlusIcon /> Invite guests</Link></Button>}
        {hunt.guests.notSent > 0 && (
          <Button asChild><Link to={`${base}&open=send`}><PaperPlaneTiltIcon /> {hunt.guests.notSent === 1 ? 'Send 1 invitation' : `Send ${hunt.guests.notSent} invitations`}</Link></Button>
        )}
        {hunt.toRemind > 0 && <Button asChild variant="outline"><Link to={`${base}&open=remind`}><BellRingingIcon /> Remind {hunt.toRemind}</Link></Button>}
        {hunt.toCheck > 0 && (
          <Button asChild variant="outline"><Link to={`${base}&open=check`}><CheckSquareIcon /> {hunt.toCheck === 1 ? 'Check 1 document' : `Check ${hunt.toCheck} documents`}</Link></Button>
        )}
      </div>
    </section>
  )
}

const TONE_DOT = { red: 'bg-red-600', amber: 'bg-amber-500', grey: 'bg-muted-foreground/40' } as const

function TodoList({ todos }: { todos: Dashboard['todos'] }) {
  return (
    <Card title={todos.length ? `To do (${todos.length})` : 'To do'}>
      {todos.length === 0 ? (
        <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <CheckCircleIcon className="size-5 text-green-600" weight="fill" aria-hidden /> Nothing to do. Everything is in order.
        </p>
      ) : (
        <ul className="-mx-2 divide-y divide-border">
          {todos.map((t, i) => {
            const item = todoText(t, shortDate)
            return (
              <li key={`${t.code}-${i}`}>
                <Link to={item.to} className="group flex items-center gap-3 rounded px-2 py-2.5 hover:bg-muted">
                  <span className={`size-2 shrink-0 rounded-full ${TONE_DOT[item.tone]}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{item.text}</span>
                    {item.detail && <span className="block truncate text-xs text-muted-foreground">{item.detail}</span>}
                  </span>
                  <CaretRightIcon className="shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

function UpcomingHunts({ hunts, pastCount }: { hunts: Dashboard['upcoming']; pastCount: number }) {
  return (
    <Card title="Upcoming hunts" action={<Button asChild size="sm" variant="ghost"><Link to="/manager/events"><PlusIcon /> New</Link></Button>}>
      {hunts.length === 0 && <p className="text-sm text-muted-foreground">No hunts planned.</p>}
      <ul className="-mx-2">
        {hunts.map((h) => (
          <li key={h.id}>
            <Link to={`/manager/events/${h.id}`} className="flex items-center gap-3 rounded px-2 py-2 hover:bg-muted">
              <span className="w-20 shrink-0 text-xs tabular-nums text-muted-foreground">{shortDate(h.date)}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{h.name}</span>
              <GuestCounts guests={h.guests} className="shrink-0 text-xs" />
            </Link>
          </li>
        ))}
      </ul>
      <Link to="/manager/events" className="inline-block text-xs text-muted-foreground hover:underline">
        All events{pastCount ? ` (${pastCount} past)` : ''} →
      </Link>
    </Card>
  )
}

function Areas({ areas }: { areas: Dashboard['areas'] }) {
  return (
    <Card title="Areas" action={<Button asChild size="sm" variant="ghost"><Link to="/manager/areas"><PlusIcon /> New</Link></Button>}>
      {areas.length === 0 && <p className="text-sm text-muted-foreground">No areas yet. Create one and upload its boundary.</p>}
      <ul className="-mx-2">
        {areas.map((a) => (
          <li key={a.id}>
            <Link to={`/manager/areas/${a.id}`} className="flex items-center gap-3 rounded px-2 py-2 hover:bg-muted">
              <MapTrifoldIcon className="shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {!a.hasBoundary ? 'no boundary yet'
                  : [a.stands === 1 ? '1 stand' : `${a.stands} stands`, a.broken ? `${a.broken} broken` : null, a.needsRepair ? `${a.needsRepair} to repair` : null].filter(Boolean).join(' · ')}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}

/** The pages that are still on the old site, so they are one click away too. */
function QuickLinks({ guests, groups }: { guests: number; groups: number }) {
  const links = [
    { href: '/manager/guests', label: 'Guests', detail: guests === 1 ? '1 guest' : `${guests} guests` },
    { href: '/manager/guest-groups', label: 'Guest groups', detail: groups === 1 ? '1 group' : `${groups} groups` },
    { href: '/manager/people', label: 'People', detail: 'Staff and managers' },
    { href: '/manager/estate', label: 'Estate', detail: 'Name and settings' },
  ]
  return (
    <nav aria-label="Quick links" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {links.map((l) => (
        <a key={l.href} href={l.href} className="flex items-center gap-3 rounded-lg border border-border p-4 hover:bg-muted">
          <UsersIcon className="shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{l.label}</span>
            <span className="block text-xs text-muted-foreground">{l.detail}</span>
          </span>
          <CaretRightIcon className="text-muted-foreground" aria-hidden />
        </a>
      ))}
    </nav>
  )
}
