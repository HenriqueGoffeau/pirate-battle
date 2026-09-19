import { describe, expect, it } from 'vitest'
import { defaultOptions, OptionLimits, validateOptions } from './userOptions'

describe('validateOptions', () => {
  it('accepts the defaults and every limit', () => {
    expect(validateOptions(defaultOptions)).toEqual({ ok: true, options: defaultOptions })
    for (const sessionSeconds of [OptionLimits.sessionSeconds.min, OptionLimits.sessionSeconds.max]) {
      for (const spawnIntervalSec of [OptionLimits.spawnIntervalSec.min, OptionLimits.spawnIntervalSec.max]) {
        expect(validateOptions({ sessionSeconds, spawnIntervalSec }).ok).toBe(true)
      }
    }
  })

  it('rejects values outside the limits, off the step, fractional or not numbers', () => {
    expect(validateOptions({ sessionSeconds: 50, spawnIntervalSec: 11 })).toEqual({
      ok: false,
      errors: {
        sessionSeconds: 'Choose between 60 and 180 seconds.',
        spawnIntervalSec: 'Choose between 1 and 10 seconds.',
      },
    })
    expect(validateOptions({ sessionSeconds: 75, spawnIntervalSec: 0 })).toEqual({
      ok: false,
      errors: { sessionSeconds: 'Use steps of 10 seconds.', spawnIntervalSec: 'Choose between 1 and 10 seconds.' },
    })
    expect(validateOptions({ sessionSeconds: 120.5, spawnIntervalSec: 2.5 })).toEqual({
      ok: false,
      errors: { sessionSeconds: 'Use whole seconds.', spawnIntervalSec: 'Use whole seconds.' },
    })
    for (const bad of [Number.NaN, Infinity, '120', null, undefined]) {
      expect(validateOptions({ sessionSeconds: bad, spawnIntervalSec: 3 })).toEqual({
        ok: false,
        errors: { sessionSeconds: 'Enter a number of seconds.' },
      })
    }
  })

  it('treats a missing or non-object value as invalid and drops unknown keys', () => {
    expect(validateOptions(null).ok).toBe(false)
    expect(validateOptions('s120-i3').ok).toBe(false)
    expect(validateOptions({ sessionSeconds: 90, spawnIntervalSec: 5, godMode: true })).toEqual({
      ok: true,
      options: { sessionSeconds: 90, spawnIntervalSec: 5 },
    })
  })
})
