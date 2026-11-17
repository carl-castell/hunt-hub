import { useDeferredValue, useState } from 'react'
import { toast } from 'sonner'
import { MagnifyingGlassIcon, UsersThreeIcon } from '@phosphor-icons/react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { useInvalidateGuests } from './useInvalidateEvent'

/**
 * Adding guests to the guest list: search by name or group, tick guests, or
 * add a whole group at once. Nothing is sent yet; that is a separate step.
 */
export function InviteSheet({ eventId, open, onOpenChange }: { eventId: number; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [search, setSearch] = useState('')
  const term = useDeferredValue(search)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [pickedGroups, setPickedGroups] = useState<Set<number>>(new Set())
  const invalidate = useInvalidateGuests(eventId)
  const found = trpc.manager.invitations.searchGuests.useQuery({ eventId, search: term }, { enabled: open, placeholderData: (prev) => prev })

  const reset = () => { setPicked(new Set()); setPickedGroups(new Set()); setSearch('') }
  const add = trpc.manager.invitations.add.useMutation({
    onSuccess: ({ added }) => {
      invalidate()
      toast.success(added === 0 ? 'Everyone chosen was already on the guest list' : added === 1 ? '1 guest added' : `${added} guests added`)
      reset()
      onOpenChange(false)
    },
    onError: (err) => toast.error(err.message),
  })

  const toggle = (set: Set<number>, id: number, update: (s: Set<number>) => void) => {
    const next = new Set(set)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    update(next)
  }

  const groups = found.data?.groups.filter((g) => g.available > 0) ?? []
  const guests = found.data?.guests ?? []
  const groupGuests = (found.data?.groups ?? []).filter((g) => pickedGroups.has(g.id)).reduce((n, g) => n + g.available, 0)
  const count = picked.size + groupGuests

  return (
    <Sheet open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) reset() }}>
      <SheetContent title="Invite guests" description="Add guests to the guest list. You send the invitations afterwards.">
        <div className="space-y-5 p-5">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or group…" className="pl-8" autoFocus aria-label="Search guests" />
          </div>

          {groups.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Whole groups</h3>
              <div className="flex flex-wrap gap-2">
                {groups.map((g) => {
                  const on = pickedGroups.has(g.id)
                  return (
                    <button key={g.id} type="button" aria-pressed={on} onClick={() => toggle(pickedGroups, g.id, setPickedGroups)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm ${on ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-muted'}`}>
                      <UsersThreeIcon aria-hidden /> {g.name}
                      <span className="tabular-nums opacity-75">{g.available === g.members ? g.members : `${g.available} of ${g.members}`}</span>
                    </button>
                  )
                })}
              </div>
            </section>
          )}

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Guests</h3>
            {found.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {found.data && guests.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {term ? 'No guest matches this search.' : 'Everyone is on the guest list already, or the estate has no guests yet.'}
              </p>
            )}
            <ul className="divide-y divide-border rounded-md border border-border">
              {guests.map((g) => (
                <li key={g.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted">
                    <input type="checkbox" checked={picked.has(g.id)} onChange={() => toggle(picked, g.id, setPicked)} className="size-4 accent-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{g.firstName} {g.lastName}</span>
                      <span className="block truncate text-xs text-muted-foreground">{[g.email, ...g.groups].filter(Boolean).join(' · ')}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {found.data?.hasMore && <p className="text-xs text-muted-foreground">Showing the first 50. Search to find others.</p>}
          </section>
        </div>
        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-border bg-background px-5 py-3">
          <span className="text-sm text-muted-foreground">{count === 0 ? 'Nobody chosen yet' : count === 1 ? '1 guest chosen' : `${count} guests chosen`}</span>
          <Button disabled={count === 0 || add.isPending}
            onClick={() => add.mutate({ eventId, guestIds: [...picked], groupIds: [...pickedGroups] })}>
            {add.isPending ? 'Adding…' : 'Add to guest list'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
