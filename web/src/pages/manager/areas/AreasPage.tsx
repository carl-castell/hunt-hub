import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { trpc } from '@/lib/trpc'

/**
 * First React page of the manager area. For now it shows the estate summary
 * from the new manager API; the full areas list follows in HUN-47.
 */
export function AreasPage() {
  const { data: estate, isLoading, error } = trpc.manager.estate.get.useQuery()

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">Areas</h1>
        <p className="text-sm text-muted-foreground">Hunting areas of your estate.</p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {estate && (
        <Card>
          <CardHeader>
            <CardTitle>{estate.name}</CardTitle>
            <CardDescription>
              {estate.areaCount === 1 ? '1 area' : `${estate.areaCount} areas`}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Areas are moving to the new web app. Until the list is ready here, you can still manage
            them on the <a href="/manager/estate" className="underline hover:text-foreground">Estate page</a>.
          </CardContent>
        </Card>
      )}
    </div>
  )
}
