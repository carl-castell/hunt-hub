import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { TrashIcon, WarningIcon } from '@phosphor-icons/react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useInvalidateEvent } from './useInvalidateEvent'

type EventDetails = { id: number; name: string; date: string; drives: number; guests: { invited: number }; sentLinks: number }
type DetailsForm = { name: string; date: string }

/** Name and date of the hunt, and deleting it (set apart, with what goes with it). */
export function DetailsTab({ event }: { event: EventDetails }) {
  const invalidate = useInvalidateEvent(event.id)
  const form = useForm<DetailsForm>({ values: { name: event.name, date: event.date } })
  const update = trpc.manager.events.update.useMutation({
    onSuccess: () => { invalidate(); toast.success('Saved') },
    onError: (err) => toast.error(err.message),
  })

  return (
    <div className="max-w-lg space-y-10">
      <form onSubmit={form.handleSubmit((values) => update.mutate({ id: event.id, ...values }))} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="details-name">Name</Label>
          <Input id="details-name" autoComplete="off"
            {...form.register('name', { required: 'Please enter a name', maxLength: { value: 255, message: 'At most 255 characters' } })} />
          {form.formState.errors.name && <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="details-date">Date</Label>
          <Input id="details-date" type="date" className="w-48" {...form.register('date', { required: 'Please choose a date' })} />
        </div>
        <p className="text-sm text-muted-foreground">The start time is the start of the first drive (Drives tab).</p>
        <Button type="submit" disabled={!form.formState.isDirty || update.isPending}>{update.isPending ? 'Saving…' : 'Save'}</Button>
      </form>

      <DeleteEvent event={event} />
    </div>
  )
}

function DeleteEvent({ event }: { event: EventDetails }) {
  const [confirming, setConfirming] = useState(false)
  const navigate = useNavigate()
  const utils = trpc.useUtils()
  const remove = trpc.manager.events.delete.useMutation({
    onSuccess: () => {
      void utils.manager.events.list.invalidate()
      toast.success(`“${event.name}” deleted`)
      navigate('/manager/events')
    },
    onError: (err) => toast.error(err.message),
  })

  // Say exactly what goes with the event.
  const consequences = [
    event.drives === 1 ? 'its drive' : `its ${event.drives} drives`,
    event.guests.invited > 0 ? (event.guests.invited === 1 ? '1 invitation' : `${event.guests.invited} invitations`) : null,
  ].filter(Boolean).join(' and ')

  return (
    <section className="space-y-3 rounded-md border border-destructive/40 p-4">
      <h2 className="font-semibold text-destructive">Delete event</h2>
      {!confirming ? (
        <>
          <p className="text-sm text-muted-foreground">Deletes the event with {consequences}. This can&apos;t be undone.</p>
          <Button variant="outline" className="text-destructive" onClick={() => setConfirming(true)}><TrashIcon /> Delete event…</Button>
        </>
      ) : (
        <div className="space-y-3">
          <p className="text-sm">Delete “{event.name}” with {consequences}?</p>
          {event.sentLinks > 0 && (
            <p className="flex items-start gap-2 rounded-md bg-amber-500/10 p-2 text-sm">
              <WarningIcon className="mt-0.5 shrink-0 text-amber-600" aria-hidden />
              {event.sentLinks === 1
                ? '1 guest has already received an invitation link. It stops working, and the guest is not told.'
                : `${event.sentLinks} guests have already received an invitation link. The links stop working, and the guests are not told.`}
            </p>
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setConfirming(false)}>Cancel</Button>
            <Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate({ id: event.id })}>
              {remove.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
