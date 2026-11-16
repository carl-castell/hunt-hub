import { createTRPCReact } from '@trpc/react-query'
import { httpBatchLink, httpLink, isNonJsonSerializable, splitLink } from '@trpc/client'
import type { AppRouter } from '@hunt-hub/backend/src/trpc/router'

export const trpc = createTRPCReact<AppRouter>()

const API_URL = '/api/v1/trpc'

export function makeTrpcClient() {
  return trpc.createClient({
    links: [
      // File uploads (FormData) can't be batched, so they get their own request.
      splitLink({
        condition: (op) => isNonJsonSerializable(op.input),
        true: httpLink({ url: API_URL }),
        false: httpBatchLink({ url: API_URL }),
      }),
    ],
  })
}
