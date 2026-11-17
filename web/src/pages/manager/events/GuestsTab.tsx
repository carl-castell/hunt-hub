import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { BellRingingIcon, PaperPlaneTiltIcon, PlusIcon, TrashIcon, WarningIcon } from '@phosphor-icons/react'
import { linkSent } from '@hunt-hub/backend/src/shared/invitationStates'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Badge } from './Badge'
import { EmailDialog, type EmailKind } from './EmailDialog'
import { GuestDrawer } from './GuestDrawer'
import { InviteSheet } from './InviteSheet'
import { CERTIFICATE_LABELS, LICENCE_LABELS, RESPONSE_LABELS, invitationText } from './labels'
import { useInvalidateGuests } from './useInvalidateEvent'

type EventInfo = { id: number; name: string; date: string; start: string }

const FILTERS = ['all', 'yes', 'no', 'open', 'notSent'] as const
type Filter = (typeof FILTERS)[number]
const FILTER_TEXT: Record<Filter, string> = { all: 'All', yes: 'Coming', no: 'Not coming', open: 'No answer', notSent: 'Not sent' }

const selectClass = 'h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

/**
 * The guest list of a hunt: who is invited, who answered, whose documents are
 * in order. Invite, send, remind and change several guests at once.
 */
export function GuestsTab({ event }: { event: EventInfo }) {
  const [params, setParams] = useSearchParams()
  const filter: Filter = (FILTERS as readonly string[]).includes(params.get('show') ?? '') ? (params.get('show') as Filter) : 'all'
  const setFilter = (next: Filter) => setParams((p) => { p.set('tab', 'guests'); if (next === 'all') p.delete('show'); else p.set('show', next); return p }, { replace: true })

  const { data: invitations = [], isLoading, error } = trpc.manager.invitations.list.useQuery({ eventId: event.id })
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [inviting, setInviting] = useState(false)
  const [email, setEmail] = useState<EmailKind | null>(null)
  const [openGuest, setOpenGuest] = useState<number | null>(null)

  const counts = useMemo(() => ({
    all: invitations.length,
    yes: invitations.filter((i) => i.response === 'yes').length,
    no: invitations.filter((i) => i.response === 'no').length,
    open: invitations.filter((i) => i.response === 'open' && i.status !== 'staged').length,
    notSent: invitations.filter((i) => i.status === 'staged').length,
  }), [invitations])

  const shown = invitations.filter((i) =>
    filter === 'all' ? true
      : filter === 'notSent' ? i.status === 'staged'
        : filter === 'open' ? i.response === 'open' && i.status !== 'staged'
          : i.response === filter)

  const toSend = invitations.filter((i) => i.status === 'staged')
  const toRemind = invitations.filter((i) => linkSent(i.status) && i.response === 'open')
  const recipients = (email === 'reminder' ? toRemind : toSend).map((i) => ({ id: i.id, name: `${i.guest.firstName} ${i.guest.lastName}`, email: i.guest.email }))

  const allShownSelected = shown.length > 0 && shown.every((i) => selected.has(i.id))
  const toggleAll = () => setSelected(allShownSelected ? new Set() : new Set(shown.map((i) => i.id)))
  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>
  if (error) return <p className="text-sm text-destructive">{error.message}</p>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
          {FILTERS.map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
              className={`rounded-full border px-3 py-1 text-sm tabular-nums ${filter === f ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted'}`}>
              {FILTER_TEXT[f]} {counts[f]}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {toRemind.length > 0 && (
            <Button variant="outline" onClick={() => setEmail('reminder')}><BellRingingIcon /> Remind {toRemind.length}</Button>
          )}
          {toSend.length > 0 && (
            <Button variant="outline" onClick={() => setEmail('invitation')}>
              <PaperPlaneTiltIcon /> {toSend.length === 1 ? 'Send 1 invitation' : `Send ${toSend.length} invitations`}
            </Button>
          )}
          <Button onClick={() => setInviting(true)}><PlusIcon /> Invite guests</Button>
        </div>
      </div>

      {selected.size > 0 && (
        <BulkBar eventId={event.id} selected={invitations.filter((i) => selected.has(i.id))} onDone={() => setSelected(new Set())} />
      )}

      {invitations.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-8 text-center">
          <p className="font-medium">No guests yet</p>
          <p className="text-sm text-muted-foreground">Invite single guests or whole groups. You send the invitations afterwards.</p>
          <Button className="mt-4" onClick={() => setInviting(true)}><PlusIcon /> Invite guests</Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-2">
                  <input type="checkbox" className="size-4 accent-primary" aria-label="Select all shown guests" checked={allShownSelected} onChange={toggleAll} />
                </th>
                <th className="px-3 py-2 font-medium">Guest</th>
                <th className="px-3 py-2 font-medium">Invitation</th>
                <th className="px-3 py-2 font-medium">Answer</th>
                <th className="px-3 py-2 font-medium">Documents</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shown.map((i) => (
                <tr key={i.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setOpenGuest(i.id)}>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" className="size-4 accent-primary" aria-label={`Select ${i.guest.firstName} ${i.guest.lastName}`}
                      checked={selected.has(i.id)} onChange={() => toggle(i.id)} />
                  </td>
                  <td className="px-3 py-2">
                    <button type="button" className="text-left font-medium hover:underline" onClick={(e) => { e.stopPropagation(); setOpenGuest(i.id) }}>
                      {i.guest.firstName} {i.guest.lastName}
                    </button>
                    {i.groups.length > 0 && <div className="text-xs text-muted-foreground">{i.groups.join(', ')}</div>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{invitationText(i)}</td>
                  <td className="px-3 py-2"><Badge label={RESPONSE_LABELS[i.response]} /></td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <Badge label={LICENCE_LABELS[i.licence]} />
                      <Badge label={CERTIFICATE_LABELS[i.certificate]} />
                    </div>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">No guest in this view.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <InviteSheet eventId={event.id} open={inviting} onOpenChange={setInviting} />
      {email && (
        <EmailDialog key={email} event={event} kind={email} recipients={recipients} open onOpenChange={(o) => { if (!o) setEmail(null) }} />
      )}
      <GuestDrawer eventId={event.id} invitationId={openGuest} onClose={() => setOpenGuest(null)} />
    </div>
  )
}

type Selected = { id: number; status: Parameters<typeof linkSent>[0] }

/** Changes for several guests at once: answer, invitation state, or remove (with a warning about sent links). */
function BulkBar({ eventId, selected, onDone }: { eventId: number; selected: Selected[]; onDone: () => void }) {
  const invalidate = useInvalidateGuests(eventId)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const ids = selected.map((s) => s.id)
  const sentLinks = selected.filter((s) => linkSent(s.status)).length
  const update = trpc.manager.invitations.update.useMutation({
    onSuccess: ({ updated }) => { invalidate(); toast.success(updated === 1 ? '1 guest changed' : `${updated} guests changed`); onDone() },
    onError: (err) => toast.error(err.message),
  })
  const remove = trpc.manager.invitations.remove.useMutation({
    onSuccess: ({ removed }) => { invalidate(); toast.success(removed === 1 ? '1 guest removed' : `${removed} guests removed`); setConfirmRemove(false); onDone() },
    onError: (err) => toast.error(err.message),
  })

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-sm">
      <span className="font-medium">{selected.length === 1 ? '1 guest selected' : `${selected.length} guests selected`}</span>
      {!confirmRemove ? (
        <>
          <select className={selectClass} value="" aria-label="Set answer"
            onChange={(e) => update.mutate({ eventId, ids, response: e.target.value as 'yes' | 'no' | 'open' })}>
            <option value="" disabled>Set answer…</option>
            <option value="yes">Coming</option>
            <option value="no">Not coming</option>
            <option value="open">No answer</option>
          </select>
          <select className={selectClass} value="" aria-label="Set invitation"
            onChange={(e) => update.mutate({ eventId, ids, status: e.target.value as 'sent_manually' | 'waitlist' | 'archived' })}>
            <option value="" disabled>Set invitation…</option>
            <option value="sent_manually">Invited in person</option>
            <option value="waitlist">Waiting list</option>
            <option value="archived">Archived</option>
          </select>
          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirmRemove(true)}><TrashIcon /> Remove</Button>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={onDone}>Clear selection</Button>
        </>
      ) : (
        <>
          <span className="flex items-center gap-1.5">
            {sentLinks > 0 && <WarningIcon className="text-amber-600" aria-hidden />}
            {sentLinks === 0
              ? 'Remove them from the guest list?'
              : sentLinks === 1
                ? '1 of them already has an invitation link. It stops working, and the guest is not told. Remove anyway?'
                : `${sentLinks} of them already have invitation links. They stop working, and the guests are not told. Remove anyway?`}
          </span>
          <Button variant="outline" size="sm" onClick={() => setConfirmRemove(false)}>Cancel</Button>
          <Button variant="destructive" size="sm" disabled={remove.isPending} onClick={() => remove.mutate({ eventId, ids })}>Remove</Button>
        </>
      )}
    </div>
  )
}
