import { useState, useCallback, useRef, useEffect } from 'react'

export function useCooldown(durationMs: number) {
  const [secondsLeft, setSecondsLeft] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const start = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    const total = Math.ceil(durationMs / 1000)
    setSecondsLeft(total)
    let remaining = total
    intervalRef.current = setInterval(() => {
      remaining -= 1
      if (remaining <= 0) {
        clearInterval(intervalRef.current!)
        intervalRef.current = null
        setSecondsLeft(0)
      } else {
        setSecondsLeft(remaining)
      }
    }, 1000)
  }, [durationMs])

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current) }, [])

  return { isCooling: secondsLeft > 0, secondsLeft, start }
}
