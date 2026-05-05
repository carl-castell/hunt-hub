import { useRef, useState, useEffect, KeyboardEvent, ClipboardEvent } from 'react'

type Props = {
  length?: number
  onComplete: (value: string) => void
  disabled?: boolean
}

export function OtpInput({ length = 6, onComplete, disabled = false }: Props) {
  const [values, setValues] = useState<string[]>(Array(length).fill(''))
  const inputs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => { inputs.current[0]?.focus() }, [])

  function focus(index: number) {
    inputs.current[index]?.focus()
  }

  function handleChange(index: number, raw: string) {
    const digit = raw.replace(/\D/g, '').slice(-1)
    const next = [...values]
    next[index] = digit
    setValues(next)

    if (digit) {
      if (index < length - 1) {
        focus(index + 1)
      } else {
        inputs.current[index]?.blur()
        onComplete(next.join(''))
      }
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      e.preventDefault()
      const next = [...values]
      if (next[index]) {
        next[index] = ''
        setValues(next)
      } else if (index > 0) {
        next[index - 1] = ''
        setValues(next)
        focus(index - 1)
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      focus(index - 1)
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      focus(index + 1)
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    if (!pasted) return
    const next = [...values]
    pasted.split('').forEach((d, i) => { next[i] = d })
    setValues(next)
    const lastFilled = Math.min(pasted.length, length - 1)
    focus(lastFilled)
    if (pasted.length === length) onComplete(next.join(''))
  }

  return (
    <div className="flex gap-2 justify-center">
      {values.map((val, i) => (
        <input
          key={i}
          ref={(el) => { inputs.current[i] = el }}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={1}
          value={val}
          disabled={disabled}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          className="w-10 h-12 text-center text-lg font-mono rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        />
      ))}
    </div>
  )
}
