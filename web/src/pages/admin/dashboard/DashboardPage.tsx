import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'

type CreateForm = { name: string }

export function DashboardPage() {
  const navigate = useNavigate()
  const utils = trpc.useUtils()
  const [showCreate, setShowCreate] = useState(false)

  const { data: estates, isLoading } = trpc.admin.estates.list.useQuery()

  const createEstate = trpc.admin.estates.create.useMutation({
    onSuccess: (estate) => {
      utils.admin.estates.list.invalidate()
      reset()
      setShowCreate(false)
      navigate(`/admin/estates/${estate.id}`)
    },
  })

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateForm>()

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Estates</h1>
        {!showCreate && (
          <Button size="sm" onClick={() => setShowCreate(true)}>+ New Estate</Button>
        )}
      </div>

      {showCreate && (
        <form
          onSubmit={handleSubmit((d) => createEstate.mutate(d))}
          className="rounded-lg border border-border bg-card p-4 space-y-3"
        >
          <p className="text-sm font-medium">New estate</p>
          <div className="space-y-1">
            <input
              type="text"
              placeholder="Estate name"
              autoFocus
              autoComplete="off"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              {...register('name', { required: 'Estate name is required' })}
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          {createEstate.error && (
            <p className="text-sm text-destructive">{createEstate.error.message}</p>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => { reset(); setShowCreate(false) }}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={createEstate.isPending}>
              {createEstate.isPending ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : estates && estates.length > 0 ? (
        <ul className="space-y-1">
          {estates.map((estate) => (
            <li key={estate.id}>
              <button
                onClick={() => navigate(`/admin/estates/${estate.id}`)}
                className="w-full text-left px-4 py-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors text-sm font-medium"
              >
                {estate.name}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No estates yet. Create one to get started.</p>
      )}
    </div>
  )
}
