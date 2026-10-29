import { describe, expect, it } from 'vitest'
import { useCoworkRun } from '../luDisabledSessionProgress'

describe('Lu disabled session progress', () => {
  it('provides no Cowork load and rejects an unexpected session event', () => {
    expect(useCoworkRun((state) => state.loadingModels['session'])).toBeUndefined()
    expect(() => useCoworkRun.getState()).toThrow('unavailable in Lu')
  })
})
