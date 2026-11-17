import { TONE_CLASSES, type Label } from './labels'

export function Badge({ label, className = '' }: { label: Label; className?: string }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium ${TONE_CLASSES[label.tone]} ${className}`}>{label.text}</span>
}
