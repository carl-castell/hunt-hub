import { addSample, formatBytes, formatDuration, secondsLeft } from './eta'

describe('secondsLeft', () => {
  it('needs a few seconds of progress first', () => {
    expect(secondsLeft([], 100)).toBeNull()
    expect(secondsLeft([{ at: 0, done: 0 }, { at: 1000, done: 5 }], 100)).toBeNull()
  })

  it('divides what is left by the recent speed', () => {
    // 20 tiles in 10 s = 2 per second; 100 left = 50 s.
    expect(secondsLeft([{ at: 0, done: 0 }, { at: 10_000, done: 20 }], 100)).toBe(50)
  })

  it('is 0 when nothing is left', () => {
    expect(secondsLeft([], 0)).toBe(0)
  })
})

describe('addSample', () => {
  it('forgets samples older than 30 seconds', () => {
    const samples = addSample([{ at: 0, done: 0 }, { at: 20_000, done: 10 }], { at: 45_000, done: 30 })
    expect(samples).toEqual([{ at: 20_000, done: 10 }, { at: 45_000, done: 30 }])
  })
})

describe('formatting', () => {
  it('writes durations as whole sentences parts', () => {
    expect(formatDuration(42)).toBe('about 40 seconds')
    expect(formatDuration(170)).toBe('about 3 minutes')
    expect(formatDuration(60)).toBe('about 1 minute')
    expect(formatDuration(4800)).toBe('about 1 hour 20 minutes')
  })

  it('writes sizes in MB or KB', () => {
    expect(formatBytes(12_440_000, 'en-GB')).toBe('12.4 MB')
    expect(formatBytes(512_000, 'en-GB')).toBe('512 KB')
  })
})
