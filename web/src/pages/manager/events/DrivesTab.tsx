import { useState } from 'react'
import { toast } from 'sonner'
import { PlusIcon, TrashIcon } from '@phosphor-icons/react'
import { DEFAULT_DRIVE_MINUTES, endOf } from '@hunt-hub/backend/src/shared/driveTimes'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { durationsFor, formatDuration, startTimes, startTimesFrom } from './format'
import { useInvalidateEvent } from './useInvalidateEvent'

type Drive = { id: number; name: string; start: string; end: string; durationMinutes: number }
type EventWithDrives = { id: number; driveList: Drive[]; nextDriveStart: string }

const selectClass = 'h-9 rounded-md border border-input bg-background px-2 text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/**
 * The drives of a hunt, each with start time and length; the end is shown.
 * Every change is saved at once. The first drive's start is the event's start.
 */
export function DrivesTab({ event }: { event: EventWithDrives }) {
  const [adding, setAdding] = useState(false)
  const total = event.driveList.reduce((sum, d) => sum + d.durationMinutes, 0)
  const first = event.driveList[0]
  const last = event.driveList[event.driveList.length - 1]

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {first && last
          ? `${event.driveList.length === 1 ? '1 drive' : `${event.driveList.length} drives`} from ${first.start} to ${last.end}, ${formatDuration(total)} of driving in total.`
          : 'No drives yet.'}
      </p>
      <ol className="divide-y divide-border rounded-md border border-border">
        {event.driveList.map((drive) => (
          <DriveRow key={drive.id} eventId={event.id} drive={drive} canDelete={event.driveList.length > 1} />
        ))}
        {adding && <NewDriveRow event={event} onDone={() => setAdding(false)} />}
      </ol>
      {!adding && (
        <Button variant="outline" onClick={() => setAdding(true)}><PlusIcon /> Add drive</Button>
      )}
    </div>
  )
}

function DriveRow({ eventId, drive, canDelete }: { eventId: number; drive: Drive; canDelete: boolean }) {
  const invalidate = useInvalidateEvent(eventId)
  const [name, setName] = useState(drive.name)
  const update = trpc.manager.drives.update.useMutation({
    onSuccess: invalidate,
    onError: (err) => { toast.error(err.message); invalidate() },
  })
  const remove = trpc.manager.drives.delete.useMutation({
    onSuccess: () => { invalidate(); toast.success(`${drive.name} deleted`) },
    onError: (err) => toast.error(err.message),
  })

  const saveName = () => {
    const next = name.trim()
    if (!next) return setName(drive.name)
    if (next !== drive.name) update.mutate({ id: drive.id, name: next })
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
        aria-label="Name of the drive" className="h-9 w-40 font-medium" maxLength={255} />
      <TimeFields start={drive.start} durationMinutes={drive.durationMinutes} startOptions={startTimes()}
        onChange={(start, durationMinutes) => update.mutate({ id: drive.id, start, durationMinutes })} />
      <Button variant="ghost" size="icon" className="ml-auto text-muted-foreground hover:text-destructive"
        disabled={!canDelete || remove.isPending} title={canDelete ? `Delete ${drive.name}` : 'A hunt needs at least one drive'}
        aria-label={`Delete ${drive.name}`}
        onClick={() => { if (window.confirm(`Delete ${drive.name}?`)) remove.mutate({ id: drive.id }) }}>
        <TrashIcon />
      </Button>
    </li>
  )
}

/** Start and length of a drive, and the resulting end, e.g. "09:00 · 2.5 h → 11:30". */
function TimeFields({ start, durationMinutes, startOptions, onChange, placeholder }: {
  start: string; durationMinutes: number; startOptions: string[]
  onChange: (start: string, durationMinutes: number) => void
  /** Shown as the first entry while no start is chosen yet. */
  placeholder?: string
}) {
  const durations = durationsFor(start || '00:00', durationMinutes)
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <select className={selectClass} aria-label="Start" value={start}
        onChange={(e) => {
          const next = e.target.value
          // Keep the length if it still fits before midnight, otherwise the longest that fits.
          const fits = durationsFor(next)
          onChange(next, fits.includes(durationMinutes) ? durationMinutes : fits[fits.length - 1] ?? 30)
        }}>
        {placeholder !== undefined && <option value="" disabled>{placeholder}</option>}
        {startOptions.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <span className="text-muted-foreground">for</span>
      <select className={selectClass} aria-label="Length in hours" value={durationMinutes} disabled={!start}
        onChange={(e) => onChange(start, Number(e.target.value))}>
        {durations.map((m) => <option key={m} value={m}>{formatDuration(m)}</option>)}
      </select>
      {start && <span className="tabular-nums text-muted-foreground">→ ends {endOf(start, durationMinutes)}</span>}
    </div>
  )
}

/**
 * A new drive. Its start is not pre-set; the list of times opens at the next
 * full hour after the previous drive ends.
 */
function NewDriveRow({ event, onDone }: { event: EventWithDrives; onDone: () => void }) {
  const invalidate = useInvalidateEvent(event.id)
  const [start, setStart] = useState('')
  const [durationMinutes, setDuration] = useState(DEFAULT_DRIVE_MINUTES)
  const create = trpc.manager.drives.create.useMutation({
    onSuccess: ({ name }) => { invalidate(); toast.success(`${name} added`); onDone() },
    onError: (err) => toast.error(err.message),
  })

  return (
    <li className="flex flex-wrap items-center gap-3 bg-muted/40 px-4 py-3">
      <span className="w-40 text-sm font-medium text-muted-foreground">New drive</span>
      <TimeFields start={start} durationMinutes={durationMinutes} startOptions={startTimesFrom(event.nextDriveStart)}
        placeholder="Choose start…" onChange={(s, d) => { setStart(s); setDuration(d) }} />
      <div className="ml-auto flex gap-2">
        <Button variant="outline" size="sm" onClick={onDone}>Cancel</Button>
        <Button size="sm" disabled={!start || create.isPending}
          onClick={() => create.mutate({ eventId: event.id, start, durationMinutes })}>
          {create.isPending ? 'Adding…' : 'Add'}
        </Button>
      </div>
    </li>
  )
}
