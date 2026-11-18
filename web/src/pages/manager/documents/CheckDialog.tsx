import { useState } from 'react'
import { CheckCircleIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DocumentChecker, type DocumentKind } from './DocumentChecker'

export type CheckItem = { guestId: number; name: string; kind: DocumentKind }

const KIND_TEXT: Record<DocumentKind, string> = { licence: 'hunting licence', certificate: 'training certificate' }

/**
 * The check tool in a large dialog: one document, or a queue of documents
 * (e.g. all unchecked ones of a hunt) checked one after the other.
 */
export function CheckDialog({ items, eventId, onClose }: { items: CheckItem[]; eventId?: number; onClose: () => void }) {
  // The queue is fixed when the dialog opens, so checked documents don't vanish from under the manager.
  const [queue] = useState(items)
  const [index, setIndex] = useState(0)
  const item = queue[index]
  const many = queue.length > 1
  const next = () => (index + 1 < queue.length ? setIndex(index + 1) : setIndex(queue.length))

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[96vh] overflow-y-auto text-sm sm:max-w-[min(84rem,calc(100vw-2rem))]">
        <DialogHeader>
          <DialogTitle>
            {item ? `${item.name}: ${KIND_TEXT[item.kind]}` : 'All documents checked'}
          </DialogTitle>
          <DialogDescription>
            {item
              ? many ? `Document ${index + 1} of ${queue.length}` : 'Compare the document with the guest’s details, then decide.'
              : 'Nothing left to check in this list.'}
          </DialogDescription>
        </DialogHeader>
        {item ? (
          <>
            <DocumentChecker key={`${item.guestId}-${item.kind}`} guestId={item.guestId} kind={item.kind} eventId={eventId}
              onDone={many ? next : onClose} nextLabel={many && index + 1 < queue.length ? 'Confirm & next' : undefined} />
            {many && (
              <div className="flex justify-between border-t border-border pt-3">
                <Button variant="outline" disabled={index === 0} onClick={() => setIndex(index - 1)}>← Previous</Button>
                <Button variant="outline" onClick={next}>{index + 1 < queue.length ? 'Skip →' : 'Finish'}</Button>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 py-8">
            <CheckCircleIcon className="size-10 text-green-600" weight="fill" aria-hidden />
            <Button onClick={onClose}>Close</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
