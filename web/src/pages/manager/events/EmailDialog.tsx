import { useDeferredValue, useState } from 'react'
import { CheckCircleIcon, WarningIcon } from '@phosphor-icons/react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { defaultInvitationMessage } from './labels'
import { useInvalidateGuests } from './useInvalidateEvent'

type Recipient = { id: number; name: string; email: string | null }
export type EmailKind = 'invitation' | 'reminder'

/**
 * Writing and sending invitations or reminders: message on the left, the
 * email as the guest gets it on the right, then the result per guest.
 * Errors are shown in the dialog; it never hangs. Render it only while open
 * (with a `key`), so every opening starts fresh.
 */
export function EmailDialog({ event, kind, recipients, open, onOpenChange }: {
  event: { id: number; name: string; date: string; start: string }
  kind: EmailKind
  recipients: Recipient[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  // Mounted fresh each time it opens: a new message and all recipients chosen.
  const [message, setMessage] = useState(() => defaultInvitationMessage(event, kind))
  const [respondBy, setRespondBy] = useState('')
  const [chosen, setChosen] = useState<Set<number>>(() => new Set(recipients.map((r) => r.id)))
  const deferredMessage = useDeferredValue(message)
  const invalidate = useInvalidateGuests(event.id)

  const preview = trpc.manager.invitations.preview.useQuery(
    { eventId: event.id, kind, message: deferredMessage },
    { enabled: open, placeholderData: (prev) => prev },
  )
  const send = trpc.manager.invitations.send.useMutation({ onSettled: invalidate })

  const reachable = recipients.filter((r) => chosen.has(r.id))
  const withoutEmail = reachable.filter((r) => !r.email).length
  const title = kind === 'reminder' ? 'Send a reminder' : 'Send invitations'
  const result = send.data

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!send.isPending) onOpenChange(next) }}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {kind === 'reminder'
              ? 'For guests who got the invitation but haven’t answered. They keep the same link.'
              : 'Each guest gets an email with their own link to answer.'}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            {result.sent.length > 0 && (
              <p className="flex items-center gap-2 text-sm">
                <CheckCircleIcon className="text-green-600" weight="fill" aria-hidden />
                {result.sent.length === 1 ? '1 email sent.' : `${result.sent.length} emails sent.`}
              </p>
            )}
            {result.failed.length > 0 && (
              <div className="space-y-2 rounded-md border border-destructive/40 p-3 text-sm">
                <p className="flex items-center gap-2 font-medium text-destructive"><WarningIcon aria-hidden /> Not sent:</p>
                <ul className="list-inside list-disc text-muted-foreground">
                  {result.failed.map((f) => <li key={f.id}>{f.name}: {f.reason}</li>)}
                </ul>
                <p className="text-muted-foreground">These guests stay on the list as “not sent”; you can try again later.</p>
              </div>
            )}
            {result.sent.length === 0 && result.failed.length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing to send: the chosen guests were already invited or have answered.</p>
            )}
            <div className="flex justify-end"><Button onClick={() => onOpenChange(false)}>Done</Button></div>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email-message">Message</Label>
                <textarea id="email-message" value={message} onChange={(e) => setMessage(e.target.value)} rows={8} maxLength={5000}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                <p className="text-xs text-muted-foreground">{'{{firstName}}'} and {'{{lastName}}'} are replaced by each guest&apos;s name.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="email-respond-by">Answer by (optional)</Label>
                <Input id="email-respond-by" type="date" className="w-48" max={event.date} value={respondBy} onChange={(e) => setRespondBy(e.target.value)} />
              </div>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Recipients ({reachable.length})</legend>
                <ul className="max-h-44 divide-y divide-border overflow-y-auto rounded-md border border-border">
                  {recipients.map((r) => (
                    <li key={r.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-1.5 text-sm hover:bg-muted">
                        <input type="checkbox" className="size-4 accent-primary" checked={chosen.has(r.id)}
                          onChange={() => setChosen((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n })} />
                        <span className="flex-1 truncate">{r.name}</span>
                        <span className={`truncate text-xs ${r.email ? 'text-muted-foreground' : 'text-destructive'}`}>{r.email ?? 'no email address'}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                {withoutEmail > 0 && <p className="text-xs text-destructive">{withoutEmail === 1 ? '1 guest has' : `${withoutEmail} guests have`} no email address and can&apos;t be reached this way.</p>}
              </fieldset>
              {send.error && <p className="text-sm text-destructive">{send.error.message}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={send.isPending}>Cancel</Button>
                <Button disabled={reachable.length === 0 || !message.trim() || send.isPending}
                  onClick={() => send.mutate({ eventId: event.id, kind, message, invitationIds: reachable.map((r) => r.id), respondBy: respondBy || null })}>
                  {send.isPending ? 'Sending…' : reachable.length === 1 ? 'Send 1 email' : `Send ${reachable.length} emails`}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Preview <span className="font-normal text-muted-foreground">(for an example guest)</span></p>
              <p className="truncate text-sm text-muted-foreground">Subject: {preview.data?.subject ?? '…'}</p>
              <iframe title="Email preview" sandbox="" srcDoc={preview.data?.html ?? ''} className="h-[420px] w-full rounded-md border border-border bg-white" />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
