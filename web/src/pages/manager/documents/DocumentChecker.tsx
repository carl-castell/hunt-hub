import { useState } from 'react'
import { toast } from 'sonner'
import {
  ArrowClockwiseIcon, CheckCircleIcon, MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon, TrashIcon, UploadSimpleIcon, XCircleIcon,
} from '@phosphor-icons/react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '../events/Badge'
import { CERTIFICATE_LABELS, LICENCE_LABELS } from '../events/labels'
import { REJECTION_REASONS, validityText } from './validity'

export type DocumentKind = 'licence' | 'certificate'
type DocFile = { key: string; name: string; contentType: string }

const formatDate = (d: string) => new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const todayIso = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}` }
const TITLES: Record<DocumentKind, string> = { licence: 'Hunting licence', certificate: 'Training certificate' }

/** Reload everything that shows document states: the tool, the guest list and the guest drawer. */
function useInvalidateDocuments() {
  const utils = trpc.useUtils()
  return () => {
    void utils.manager.documents.get.invalidate()
    void utils.manager.invitations.list.invalidate()
    void utils.manager.invitations.get.invalidate()
  }
}

/**
 * Checking one document of a guest: the document large on the left, the
 * facts to compare on the right, and every decision: confirm (with a
 * corrected date), reject with a reason, delete, or upload for the guest.
 * With `eventId`, the licence is judged for the hunt's date.
 */
export function DocumentChecker({ guestId, kind, eventId, onDone, nextLabel }: {
  guestId: number
  kind: DocumentKind
  eventId?: number
  /** Called after a decision (e.g. to move on in the check queue). */
  onDone?: () => void
  /** Text of the confirm button when there is a next document, e.g. "Confirm & next". */
  nextLabel?: string
}) {
  const view = trpc.manager.documents.get.useQuery({ guestId, eventId })
  if (view.isLoading) return <p className="p-6 text-sm text-muted-foreground">Loading…</p>
  if (view.error || !view.data) return <p className="p-6 text-sm text-destructive">{view.error?.message ?? 'Not found'}</p>
  const d = view.data
  const doc = kind === 'licence' ? d.licence : d.certificate
  const date = kind === 'licence' ? d.licence?.expiryDate : d.certificate?.issueDate
  const state = kind === 'licence' ? d.licenceState : d.certificateState
  const label = kind === 'licence' ? LICENCE_LABELS[d.licenceState] : CERTIFICATE_LABELS[d.certificateState]
  const rejection = kind === 'licence' ? d.licenceRejection : d.certificateRejection

  return (
    // `key`: a different document starts with fresh fields.
    <div key={`${guestId}-${kind}-${doc?.id ?? 'none'}`} className="grid min-h-0 gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(18rem,2fr)]">
      <Viewer files={doc?.files ?? []} />
      <div className="space-y-5">
        <section className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Compare with the document</p>
          <p className="text-lg font-semibold">{d.guest.firstName} {d.guest.lastName}</p>
          <p className="text-sm">Born {d.guest.dateOfBirth ? formatDate(d.guest.dateOfBirth) : <span className="text-muted-foreground">– (not given)</span>}</p>
        </section>

        <section className="space-y-3 rounded-md border border-border p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold">{TITLES[kind]}</h3>
            <Badge label={label} />
          </div>
          {rejection && <p className="text-sm text-muted-foreground">Rejected on {formatDate(rejection.rejectedAt)}: {rejection.reason}</p>}
          {doc && date ? (
            <Decision guestId={guestId} kind={kind} eventId={eventId} documentId={doc.id} date={date} checked={doc.checked}
              uploadedAt={doc.uploadedAt} checkedAt={doc.checkedAt} hunt={d.hunt} state={state} onDone={onDone} nextLabel={nextLabel} />
          ) : (
            <p className="text-sm text-muted-foreground">Nothing uploaded. You can upload it for the guest below, e.g. after seeing the paper document.</p>
          )}
        </section>

        <UploadForGuest guestId={guestId} kind={kind} open={!doc} onDone={onDone} />
      </div>
    </div>
  )
}

/** The document's files: photos with zoom and rotate (phone pictures are often sideways), PDFs inline. */
function Viewer({ files }: { files: DocFile[] }) {
  const [index, setIndex] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [turn, setTurn] = useState(0)
  const file = files[Math.min(index, files.length - 1)]
  if (!file) {
    return <div className="flex min-h-[50vh] items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">No document uploaded</div>
  }
  const url = `/manager/files/${file.key}`
  const isImage = file.contentType.startsWith('image/')
  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {files.length > 1 && files.map((f, i) => (
          <Button key={f.key} size="sm" variant={i === index ? 'default' : 'outline'} onClick={() => { setIndex(i); setZoom(1); setTurn(0) }}>
            {i + 1}
          </Button>
        ))}
        {isImage && (
          <div className="ml-auto flex gap-1">
            <Button size="icon" variant="outline" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}><MagnifyingGlassMinusIcon /></Button>
            <Button size="icon" variant="outline" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(4, z + 0.25))}><MagnifyingGlassPlusIcon /></Button>
            <Button size="icon" variant="outline" aria-label="Rotate" onClick={() => setTurn((t) => (t + 90) % 360)}><ArrowClockwiseIcon /></Button>
          </div>
        )}
        <a href={url} target="_blank" rel="noreferrer" className="text-sm text-muted-foreground underline-offset-2 hover:underline">Open in new tab</a>
      </div>
      <div className="h-[65vh] overflow-auto rounded-md border border-border bg-muted/40">
        {isImage ? (
          <div className="flex min-h-full min-w-full items-center justify-center p-4">
            <img src={url} alt={file.name} className="max-w-none origin-center transition-transform"
              style={{ transform: `rotate(${turn}deg) scale(${zoom})`, width: zoom === 1 ? '100%' : undefined, maxHeight: zoom === 1 ? '60vh' : undefined, objectFit: 'contain' }} />
          </div>
        ) : (
          <iframe title={file.name} src={url} className="h-full w-full" />
        )}
      </div>
    </div>
  )
}

function Decision({ guestId, kind, eventId, documentId, date, checked, uploadedAt, checkedAt, hunt, state, onDone, nextLabel }: {
  guestId: number; kind: DocumentKind; eventId?: number; documentId: number; date: string; checked: boolean
  uploadedAt: string; checkedAt: string | null; hunt: { date: string; name: string | null }; state: string
  onDone?: () => void; nextLabel?: string
}) {
  const invalidate = useInvalidateDocuments()
  const [value, setValue] = useState(date)
  const [mode, setMode] = useState<'decide' | 'reject' | 'delete'>('decide')
  const [reason, setReason] = useState<string>(REJECTION_REASONS[0])
  const [ownReason, setOwnReason] = useState('')
  const done = (message: string) => { invalidate(); toast.success(message); onDone?.() }
  const confirm = trpc.manager.documents.confirm.useMutation({ onSuccess: () => done('Confirmed'), onError: (e) => toast.error(e.message) })
  const reject = trpc.manager.documents.reject.useMutation({
    onSuccess: ({ emailed }) => done(emailed ? 'Rejected. The guest was emailed.' : 'Rejected. The guest has no open invitation, so no email was sent.'),
    onError: (e) => toast.error(e.message),
  })
  const remove = trpc.manager.documents.delete.useMutation({ onSuccess: () => done('Deleted'), onError: (e) => toast.error(e.message) })

  const corrected = value !== date
  const today = todayIso()
  const validOnHunt = kind === 'licence' ? value > hunt.date : null

  return (
    <div className="space-y-3 text-sm">
      <div className="space-y-1">
        <Label htmlFor="doc-date">{kind === 'licence' ? 'Valid until' : 'Issued on'}</Label>
        <Input id="doc-date" type="date" className="w-48" value={value} onChange={(e) => setValue(e.target.value)}
          {...(kind === 'licence' ? { min: today } : { max: today })} />
        {corrected && <p className="text-xs text-muted-foreground">The guest entered {formatDate(date)}.</p>}
      </div>
      {kind === 'licence' && (
        <ul className="space-y-1">
          <li>{validityText(value, today)}</li>
          <li className={validOnHunt ? 'text-green-700 dark:text-green-400' : 'text-destructive'}>
            {validOnHunt ? '✓ Valid on the hunt day' : '✗ Not valid on the hunt day'} ({formatDate(hunt.date)}{hunt.name ? `, ${hunt.name}` : ''})
          </li>
        </ul>
      )}
      <p className="text-xs text-muted-foreground">Uploaded on {formatDate(uploadedAt)}{checkedAt ? ` · checked on ${formatDate(checkedAt)}` : ''}</p>

      {mode === 'decide' && (
        <div className="flex flex-wrap gap-2 pt-1">
          {(!checked || corrected) && (
            <Button disabled={confirm.isPending} onClick={() => confirm.mutate({ guestId, kind, documentId, ...(corrected ? { correctedDate: value } : {}) })}>
              <CheckCircleIcon /> {nextLabel ?? (corrected ? 'Confirm with this date' : 'Confirm')}
            </Button>
          )}
          {checked && !corrected && state !== 'expired' && onDone && <Button variant="outline" onClick={onDone}>{nextLabel ? 'Next' : 'Done'}</Button>}
          <Button variant="outline" onClick={() => setMode('reject')}><XCircleIcon /> Reject…</Button>
          <Button variant="ghost" className="text-destructive" onClick={() => setMode('delete')}><TrashIcon /> Delete</Button>
        </div>
      )}

      {mode === 'reject' && (
        <fieldset className="space-y-2 rounded-md border border-border p-3">
          <legend className="px-1 font-medium">Why can&apos;t you accept it? The guest reads this.</legend>
          {REJECTION_REASONS.map((r) => (
            <label key={r} className="flex cursor-pointer items-start gap-2">
              <input type="radio" name="reason" className="mt-1 accent-primary" checked={reason === r} onChange={() => setReason(r)} /> {r}
            </label>
          ))}
          <label className="flex cursor-pointer items-start gap-2">
            <input type="radio" name="reason" className="mt-1 accent-primary" checked={reason === 'own'} onChange={() => setReason('own')} /> Own reason:
          </label>
          {reason === 'own' && <Input autoFocus value={ownReason} maxLength={500} onChange={(e) => setOwnReason(e.target.value)} placeholder="e.g. Please upload the back page too." />}
          <p className="text-xs text-muted-foreground">The document is removed, and the guest is emailed with the link to upload a new one.</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setMode('decide')}>Cancel</Button>
            <Button variant="destructive" size="sm" disabled={reject.isPending || (reason === 'own' && ownReason.trim().length < 3)}
              onClick={() => reject.mutate({ guestId, kind, documentId, eventId, reason: reason === 'own' ? ownReason.trim() : reason })}>
              {reject.isPending ? 'Rejecting…' : 'Reject and email the guest'}
            </Button>
          </div>
        </fieldset>
      )}

      {mode === 'delete' && (
        <div className="space-y-2 rounded-md border border-destructive/40 p-3">
          <p>Delete this {kind === 'licence' ? 'licence' : 'certificate'} with its files? The guest is not told.</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setMode('decide')}>Cancel</Button>
            <Button variant="destructive" size="sm" disabled={remove.isPending} onClick={() => remove.mutate({ guestId, kind, documentId })}>Delete</Button>
          </div>
        </div>
      )}
    </div>
  )
}

/** The manager uploads the document for the guest (e.g. after seeing the paper one). It counts as checked. */
function UploadForGuest({ guestId, kind, open: startOpen, onDone }: { guestId: number; kind: DocumentKind; open: boolean; onDone?: () => void }) {
  const invalidate = useInvalidateDocuments()
  const [open, setOpen] = useState(startOpen)
  const [files, setFiles] = useState<File[]>([])
  const [date, setDate] = useState('')
  const upload = trpc.manager.documents.upload.useMutation({
    onSuccess: () => { invalidate(); toast.success('Uploaded and confirmed'); setFiles([]); setDate(''); onDone?.() },
    onError: (e) => toast.error(e.message),
  })
  if (!open) {
    return <Button variant="ghost" size="sm" className="-ml-3" onClick={() => setOpen(true)}><UploadSimpleIcon /> Upload for the guest…</Button>
  }
  const today = todayIso()
  return (
    <form className="space-y-3 rounded-md border border-border p-4 text-sm" onSubmit={(e) => {
      e.preventDefault()
      const form = new FormData()
      form.set('guestId', String(guestId))
      form.set('kind', kind)
      form.set('date', date)
      for (const f of files) form.append('files', f)
      upload.mutate(form)
    }}>
      <p className="font-medium">Upload for the guest</p>
      <p className="text-xs text-muted-foreground">For when you have seen the original. It counts as checked and replaces older uploads.</p>
      <Input type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp,image/heic" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
      <div className="space-y-1">
        <Label htmlFor={`upload-date-${kind}`}>{kind === 'licence' ? 'Valid until' : 'Issued on'}</Label>
        <Input id={`upload-date-${kind}`} type="date" className="w-48" required value={date} onChange={(e) => setDate(e.target.value)}
          {...(kind === 'licence' ? { min: today } : { max: today })} />
      </div>
      <Button type="submit" disabled={files.length === 0 || !date || upload.isPending}>{upload.isPending ? 'Uploading…' : 'Upload'}</Button>
    </form>
  )
}
