import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { CalendarBlankIcon, CheckCircleIcon, ClockIcon, FlagIcon } from '@phosphor-icons/react'
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '@hunt-hub/backend/src/trpc/router'
import { formatDuration } from '@hunt-hub/backend/src/shared/driveTimes'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Toaster } from '@/components/ui/sonner'

type RsvpView = inferRouterOutputs<AppRouter>['rsvp']['open']
type Closed = NonNullable<RsvpView['closed']>

const CLOSED_TEXT: Record<Closed, string> = {
  not_sent: 'This invitation has not been sent yet.',
  archived: 'This invitation is no longer open.',
  past: 'This hunt is over. Thank you!',
  deadline: 'The date to answer has passed. Please contact the estate directly.',
}

const longDate = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const shortDate = (d: string) => new Date(d.length === 10 ? `${d}T12:00:00` : d).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
const todayIso = () => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}` }

/** The guest's answer page, from the link in their invitation email. No login needed. */
export function RsvpPage() {
  const { publicId = '' } = useParams<{ publicId: string }>()
  const open = trpc.rsvp.open.useMutation()
  const started = useRef(false)

  // Loaded with a mutation: it records the first visit, and the link's id stays out of the URL of the request.
  useEffect(() => {
    if (started.current) return
    started.current = true
    open.mutate({ publicId })
  }, [open, publicId])

  if (open.error) return <Shell><p className="text-center text-muted-foreground">{open.error.message}</p></Shell>
  if (!open.data) return <Shell><p className="text-center text-muted-foreground">Loading…</p></Shell>
  return <RsvpContent view={open.data} publicId={publicId} reload={() => open.mutate({ publicId })} />
}

/** The manager's preview: the same page for an example guest. Nothing is saved. */
export function RsvpPreviewPage() {
  const eventId = Number(useParams<{ eventId: string }>().eventId)
  const preview = trpc.rsvp.preview.useQuery({ eventId }, { retry: false })
  const [view, setView] = useState<RsvpView | null>(null)
  if (preview.error) return <Shell><p className="text-center text-muted-foreground">{preview.error.message}</p></Shell>
  const shown = view ?? preview.data
  if (!shown) return <Shell><p className="text-center text-muted-foreground">Loading…</p></Shell>
  return <RsvpContent view={shown} preview onPreviewAnswer={(response) => setView({ ...shown, response })} />
}

function Shell({ estate, children }: { estate?: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30 px-4 py-8">
      <div className="mx-auto max-w-xl space-y-6">
        <p className="text-center text-sm font-medium tracking-wide text-muted-foreground">{estate ?? 'Hunt Hub'}</p>
        {children}
      </div>
      <Toaster />
    </div>
  )
}

function RsvpContent({ view, publicId, reload, preview = false, onPreviewAnswer }: {
  view: RsvpView
  publicId?: string
  reload?: () => void
  preview?: boolean
  onPreviewAnswer?: (response: RsvpView['response']) => void
}) {
  const respond = trpc.rsvp.respond.useMutation({
    onSuccess: () => reload?.(),
    onError: (err) => toast.error(err.message),
  })
  const [changing, setChanging] = useState(false)
  const answer = (value: 'yes' | 'no') => {
    setChanging(false)
    if (preview) return onPreviewAnswer?.(value)
    respond.mutate({ publicId: publicId!, answer: value })
  }
  const { event } = view
  const showButtons = !view.closed && (view.response === 'open' || changing)

  return (
    <Shell estate={event.estate}>
      {preview && <p className="rounded-md bg-amber-500/15 p-3 text-center text-sm">Preview for an example guest. Nothing is saved.</p>}

      <section className="space-y-4 rounded-lg border border-border bg-background p-6 shadow-sm">
        <p className="text-sm text-muted-foreground">Hello {view.guest.firstName},</p>
        <h1 className="text-2xl font-semibold">{event.name}</h1>
        <ul className="space-y-1 text-sm">
          <li className="flex items-center gap-2"><CalendarBlankIcon aria-hidden /> {longDate(event.date)}</li>
          <li className="flex items-center gap-2"><ClockIcon aria-hidden /> Starts at {event.start}</li>
        </ul>
        {event.drives.length > 0 && (
          <ol className="space-y-1 rounded-md bg-muted/50 p-3 text-sm">
            {event.drives.map((d) => (
              <li key={`${d.name}-${d.start}`} className="flex items-center gap-2 tabular-nums">
                <FlagIcon aria-hidden className="text-muted-foreground" />
                <span className="font-medium">{d.name}</span>
                <span className="text-muted-foreground">{d.start}–{d.end} · {formatDuration(d.durationMinutes)}</span>
              </li>
            ))}
          </ol>
        )}

        {view.closed ? (
          <p className="rounded-md bg-muted p-3 text-sm">{CLOSED_TEXT[view.closed]}</p>
        ) : showButtons ? (
          <div className="space-y-2">
            <p className="font-medium">Are you coming?</p>
            {view.respondBy && <p className="text-sm text-muted-foreground">Please answer by {shortDate(view.respondBy)}.</p>}
            <div className="grid grid-cols-2 gap-3">
              <Button size="lg" disabled={respond.isPending} onClick={() => answer('yes')}>I&apos;m coming</Button>
              <Button size="lg" variant="outline" disabled={respond.isPending} onClick={() => answer('no')}>I can&apos;t come</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted p-3 text-sm">
            <span className="flex items-center gap-2">
              {view.response === 'yes'
                ? <><CheckCircleIcon className="text-green-600" weight="fill" aria-hidden /> You&apos;re coming. Thank you!</>
                : <>You&apos;ve answered that you can&apos;t come. Thank you for letting us know.</>}
            </span>
            <Button variant="ghost" size="sm" onClick={() => setChanging(true)}>Change answer</Button>
          </div>
        )}
      </section>

      {view.response === 'yes' && view.closed !== 'past' && (
        <>
          <p className="px-1 text-sm text-muted-foreground">
            To take part, the estate needs your hunting licence and training certificate. Anything already on file is shown as done.
          </p>
          <LicenceCard view={view} publicId={publicId} preview={preview} reload={reload} />
          <CertificateCard view={view} publicId={publicId} preview={preview} reload={reload} />
          <ContactCard view={view} publicId={publicId} preview={preview} reload={reload} />
        </>
      )}
    </Shell>
  )
}

type CardProps = { view: RsvpView; publicId?: string; preview: boolean; reload?: () => void }

function Card({ title, done, children }: { title: string; done: boolean; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-border bg-background p-5 shadow-sm">
      <h2 className="flex items-center gap-2 font-semibold">
        {done ? <CheckCircleIcon className="text-green-600" weight="fill" aria-label="Done" /> : <span className="inline-block size-4 rounded-full border-2 border-muted-foreground/40" aria-hidden />}
        {title}
      </h2>
      {children}
    </section>
  )
}

/** File and date for a document. The date is only needed together with a file. */
function DocumentForm({ dateLabel, dateLimits, maxPhotos, saving, onSave }: {
  dateLabel: string
  dateLimits: { min?: string; max?: string }
  maxPhotos: number
  saving: boolean
  onSave: (date: string, files: File[]) => void
}) {
  const [files, setFiles] = useState<File[]>([])
  const [date, setDate] = useState('')
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); onSave(date, files) }}>
      <div className="space-y-1">
        <Label>File</Label>
        <Input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/heic" multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
        <p className="text-xs text-muted-foreground">One PDF or up to {maxPhotos} photos, each at most 10 MB.</p>
      </div>
      {files.length > 0 && (
        <div className="space-y-1">
          <Label htmlFor={`date-${dateLabel}`}>{dateLabel}</Label>
          <Input id={`date-${dateLabel}`} type="date" className="w-48" required value={date} onChange={(e) => setDate(e.target.value)} {...dateLimits} />
        </div>
      )}
      <Button type="submit" disabled={files.length === 0 || !date || saving}>{saving ? 'Uploading…' : 'Upload'}</Button>
    </form>
  )
}

function useUpload(kind: 'licence' | 'certificate', { publicId, preview, reload }: CardProps) {
  const licence = trpc.rsvp.uploadLicence.useMutation()
  const certificate = trpc.rsvp.uploadCertificate.useMutation()
  const mutation = kind === 'licence' ? licence : certificate
  const save = (date: string, files: File[]) => {
    if (preview) return toast.info('Preview: nothing is saved.')
    const form = new FormData()
    form.set('publicId', publicId!)
    form.set(kind === 'licence' ? 'expiryDate' : 'issueDate', date)
    for (const f of files) form.append('files', f)
    mutation.mutate(form, {
      onSuccess: () => { toast.success('Uploaded. The estate will check it.'); reload?.() },
      onError: (err) => toast.error(err.message),
    })
  }
  return { save, saving: mutation.isPending }
}

function LicenceCard(props: CardProps) {
  const { state, expiryDate } = props.view.licence
  const { save, saving } = useUpload('licence', props)
  const [replace, setReplace] = useState(false)
  return (
    <Card title="Hunting licence" done={state === 'valid' || state === 'unchecked'}>
      {state === 'valid' && <p className="text-sm text-muted-foreground">Checked by the estate, valid until {shortDate(expiryDate!)}.</p>}
      {state === 'unchecked' && <p className="text-sm text-muted-foreground">Uploaded (valid until {shortDate(expiryDate!)}). The estate will check it.</p>}
      {state === 'expired' && <p className="text-sm text-destructive">The licence on file expires before the hunt. Please upload your current one.</p>}
      {state === 'missing' && <p className="text-sm text-muted-foreground">Please upload a photo or PDF of your hunting licence.</p>}
      {state === 'rejected' && <Rejected reason={props.view.licence.rejectedBecause} />}
      {(state === 'missing' || state === 'expired' || state === 'rejected' || replace)
        ? <DocumentForm dateLabel="Valid until" dateLimits={{ min: todayIso() }} maxPhotos={4} saving={saving} onSave={save} />
        : <Button variant="ghost" size="sm" className="-ml-3" onClick={() => setReplace(true)}>Upload a newer one</Button>}
    </Card>
  )
}

/** The estate couldn't accept the last upload; the guest sees why. */
function Rejected({ reason }: { reason: string | null }) {
  return (
    <p className="rounded-md bg-red-600/10 p-3 text-sm">
      The estate couldn&apos;t accept your last upload{reason ? `: ${reason}` : '.'} Please upload it again.
    </p>
  )
}

function CertificateCard(props: CardProps) {
  const { state, issueDate } = props.view.certificate
  const { save, saving } = useUpload('certificate', props)
  const [replace, setReplace] = useState(false)
  return (
    <Card title="Training certificate" done={state === 'valid' || state === 'unchecked'}>
      {state === 'valid' && <p className="text-sm text-muted-foreground">Checked by the estate (issued on {shortDate(issueDate!)}).</p>}
      {state === 'unchecked' && <p className="text-sm text-muted-foreground">Uploaded (issued on {shortDate(issueDate!)}). The estate will check it.</p>}
      {state === 'missing' && <p className="text-sm text-muted-foreground">Please upload your shooting training certificate (Schießnachweis).</p>}
      {state === 'rejected' && <Rejected reason={props.view.certificate.rejectedBecause} />}
      {(state === 'missing' || state === 'rejected' || replace)
        ? <DocumentForm dateLabel="Issued on" dateLimits={{ max: todayIso() }} maxPhotos={2} saving={saving} onSave={save} />
        : <Button variant="ghost" size="sm" className="-ml-3" onClick={() => setReplace(true)}>Upload a newer one</Button>}
    </Card>
  )
}

function ContactCard({ view, publicId, preview, reload }: CardProps) {
  const [phone, setPhone] = useState(view.contact.phone ?? '')
  const [dateOfBirth, setDateOfBirth] = useState(view.contact.dateOfBirth ?? '')
  const save = trpc.rsvp.saveDetails.useMutation({
    onSuccess: () => { toast.success('Saved'); reload?.() },
    onError: (err) => toast.error(err.message),
  })
  const done = Boolean(view.contact.phone && view.contact.dateOfBirth)
  return (
    <Card title="Contact on the hunt day" done={done}>
      <form className="space-y-3" onSubmit={(e) => {
        e.preventDefault()
        if (preview) return toast.info('Preview: nothing is saved.')
        save.mutate({ publicId: publicId!, phone: phone.trim() || null, dateOfBirth: dateOfBirth || null })
      }}>
        <div className="space-y-1">
          <Label htmlFor="rsvp-phone">Mobile number</Label>
          <Input id="rsvp-phone" type="tel" autoComplete="tel" value={phone} maxLength={40} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rsvp-birth">Date of birth</Label>
          <Input id="rsvp-birth" type="date" className="w-48" max={todayIso()} value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
        </div>
        <Button type="submit" variant="outline" disabled={save.isPending || (!phone.trim() && !dateOfBirth)}>{save.isPending ? 'Saving…' : 'Save'}</Button>
      </form>
    </Card>
  )
}
