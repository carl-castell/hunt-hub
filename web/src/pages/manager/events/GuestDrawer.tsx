import { toast } from 'sonner'
import { ArrowSquareOutIcon, CheckCircleIcon, FileIcon } from '@phosphor-icons/react'
import { INVITATION_RESPONSES, type InvitationStatus } from '@hunt-hub/backend/src/shared/invitationStates'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Badge } from './Badge'
import { CERTIFICATE_LABELS, LICENCE_LABELS, RESPONSE_LABELS, invitationText } from './labels'
import { useInvalidateGuests } from './useInvalidateEvent'

const selectClass = 'h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const formatDate = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * One guest of the hunt: answer and invitation, contact details, and the
 * hunting licence and training certificate, which can be checked here
 * without leaving the event.
 */
export function GuestDrawer({ eventId, invitationId, onClose }: { eventId: number; invitationId: number | null; onClose: () => void }) {
  const open = invitationId !== null
  const details = trpc.manager.invitations.get.useQuery(
    { eventId, invitationId: invitationId ?? 0 },
    { enabled: open },
  )
  const invalidate = useInvalidateGuests(eventId)
  const update = trpc.manager.invitations.update.useMutation({
    onSuccess: () => { invalidate(); toast.success('Saved') },
    onError: (err) => toast.error(err.message),
  })
  const check = trpc.manager.invitations.checkDocument.useMutation({
    onSuccess: () => { invalidate(); toast.success('Marked as checked') },
    onError: (err) => toast.error(err.message),
  })

  const d = details.data
  const name = d ? `${d.guest.firstName} ${d.guest.lastName}` : 'Guest'

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <SheetContent title={name} description={d ? invitationText(d) : undefined}>
        {details.isLoading && <p className="p-5 text-sm text-muted-foreground">Loading…</p>}
        {details.error && <p className="p-5 text-sm text-destructive">{details.error.message}</p>}
        {d && invitationId !== null && (
          <div className="space-y-6 p-5">
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Invitation</h3>
              <div className="grid grid-cols-[8rem_1fr] items-center gap-x-3 gap-y-2 text-sm">
                <span className="text-muted-foreground">Answer</span>
                <select className={selectClass} value={d.response} aria-label="Answer"
                  onChange={(e) => update.mutate({ eventId, ids: [invitationId], response: e.target.value as (typeof INVITATION_RESPONSES)[number] })}>
                  {INVITATION_RESPONSES.map((r) => <option key={r} value={r}>{RESPONSE_LABELS[r].text}</option>)}
                </select>
                <span className="text-muted-foreground">Invitation</span>
                <InvitationState status={d.status} text={invitationText(d)}
                  onChange={(change) => update.mutate({ eventId, ids: [invitationId], ...change })} />
                {d.respondBy && <><span className="text-muted-foreground">Answer by</span><span>{formatDate(d.respondBy)}</span></>}
                {d.respondedAt && <><span className="text-muted-foreground">Answered on</span><span>{formatDate(d.respondedAt)}</span></>}
              </div>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contact</h3>
              <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Email</dt><dd className="truncate">{d.guest.email ?? '–'}</dd>
                <dt className="text-muted-foreground">Phone</dt><dd>{d.guest.phone ?? '–'}</dd>
                <dt className="text-muted-foreground">Date of birth</dt><dd>{d.dateOfBirth ? formatDate(d.dateOfBirth) : '–'}</dd>
                {d.groups.length > 0 && <><dt className="text-muted-foreground">Groups</dt><dd>{d.groups.join(', ')}</dd></>}
              </dl>
            </section>

            <DocumentCard
              title="Hunting licence"
              label={LICENCE_LABELS[d.documents.licenceState]}
              document={d.documents.licence}
              facts={d.documents.licence ? [`Valid until ${formatDate(d.documents.licence.expiryDate)}`] : []}
              checking={check.isPending}
              onCheck={(documentId) => check.mutate({ eventId, invitationId, kind: 'licence', documentId })}
            />
            <DocumentCard
              title="Training certificate"
              label={CERTIFICATE_LABELS[d.documents.certificateState]}
              document={d.documents.certificate}
              facts={d.documents.certificate ? [`Issued on ${formatDate(d.documents.certificate.issueDate)}`] : []}
              checking={check.isPending}
              onCheck={(documentId) => check.mutate({ eventId, invitationId, kind: 'certificate', documentId })}
            />

            <Button asChild variant="outline" size="sm">
              <a href={`/manager/guests/${d.guest.id}`}><ArrowSquareOutIcon /> Full guest page</a>
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

/**
 * The invitation's state and what can be done with it. Sending happens in the
 * send dialog; here a guest can be marked as invited in person, put on the
 * waiting list or archived, and taken back again.
 */
function InvitationState({ status, text, onChange }: {
  status: InvitationStatus
  text: string
  onChange: (change: { status?: 'sent_manually' | 'waitlist' | 'archived'; restore?: boolean }) => void
}) {
  const parked = status === 'waitlist' || status === 'archived'
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span>{text}</span>
      {parked ? (
        <Button variant="outline" size="sm" onClick={() => onChange({ restore: true })}>Back on the guest list</Button>
      ) : (
        <select className={selectClass} value="" aria-label="Change invitation"
          onChange={(e) => onChange({ status: e.target.value as 'sent_manually' | 'waitlist' | 'archived' })}>
          <option value="" disabled>Change…</option>
          {status === 'staged' && <option value="sent_manually">Invited in person</option>}
          <option value="waitlist">Waiting list</option>
          <option value="archived">Archived</option>
        </select>
      )}
    </div>
  )
}

function DocumentCard({ title, label, document, facts, checking, onCheck }: {
  title: string
  label: { text: string; tone: 'green' | 'amber' | 'red' | 'grey' }
  document: { id: number; checked: boolean; checkedAt: string | null; uploadedAt: string; files: { key: string; name: string }[] } | null
  facts: string[]
  checking: boolean
  onCheck: (documentId: number) => void
}) {
  return (
    <section className="space-y-2 rounded-md border border-border p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium">{title}</h3>
        <Badge label={label} />
      </div>
      {!document && <p className="text-sm text-muted-foreground">Not uploaded yet. The guest can upload it on their answer page.</p>}
      {document && (
        <>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {facts.map((f) => <li key={f}>{f}</li>)}
            <li>Uploaded on {formatDate(document.uploadedAt)}</li>
            {document.checkedAt && <li>Checked on {formatDate(document.checkedAt)}</li>}
          </ul>
          {document.files.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {document.files.map((f) => (
                <li key={f.key}>
                  <a href={`/manager/files/${f.key}`} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded border border-border px-2 py-1 text-sm hover:bg-muted">
                    <FileIcon aria-hidden /> {f.name}
                  </a>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">No file attached.</p>}
          {!document.checked && (
            <Button size="sm" disabled={checking} onClick={() => onCheck(document.id)}>
              <CheckCircleIcon /> {checking ? 'Saving…' : 'Mark as checked'}
            </Button>
          )}
        </>
      )}
    </section>
  )
}
