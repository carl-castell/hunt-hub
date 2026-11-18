import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeftIcon } from '@phosphor-icons/react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '../events/Badge'
import { CERTIFICATE_LABELS, LICENCE_LABELS } from '../events/labels'
import { DocumentChecker, type DocumentKind } from './DocumentChecker'

/**
 * A guest's documents outside of a hunt (from the guest's page): the same
 * check tool; the licence is judged for today.
 */
export function GuestDocumentsPage() {
  const guestId = Number(useParams<{ guestId: string }>().guestId)
  const [params, setParams] = useSearchParams()
  const kind: DocumentKind = params.get('kind') === 'certificate' ? 'certificate' : 'licence'
  const view = trpc.manager.documents.get.useQuery({ guestId }, { enabled: guestId > 0, retry: false })

  if (view.error) return <p className="text-sm text-destructive">{view.error.message}</p>
  if (!view.data) return <p className="text-sm text-muted-foreground">Loading…</p>
  const { guest } = view.data

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild className="-ml-3 text-muted-foreground">
        <a href={`/manager/guests/${guest.id}`}><ArrowLeftIcon /> {guest.firstName} {guest.lastName}</a>
      </Button>
      <h1 className="text-2xl font-semibold">Documents of {guest.firstName} {guest.lastName}</h1>
      <Tabs value={kind} onValueChange={(next) => setParams({ kind: next }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="licence">Hunting licence <Badge label={LICENCE_LABELS[view.data.licenceState]} /></TabsTrigger>
          <TabsTrigger value="certificate">Training certificate <Badge label={CERTIFICATE_LABELS[view.data.certificateState]} /></TabsTrigger>
        </TabsList>
        <TabsContent value="licence"><DocumentChecker guestId={guestId} kind="licence" /></TabsContent>
        <TabsContent value="certificate"><DocumentChecker guestId={guestId} kind="certificate" /></TabsContent>
      </Tabs>
      <p className="text-sm text-muted-foreground">
        To judge a licence for a hunt, open it from the hunt&apos;s guest list. <Link to="/manager/events" className="underline">Events</Link>
      </p>
    </div>
  )
}
