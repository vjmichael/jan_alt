import { expect, it } from 'vitest'
import { appDisplayName } from '../app-brand'

it('brands Lu independently without renaming Jan builds', () => {
  expect(appDisplayName(true)).toBe('Lu')
  expect(appDisplayName(false)).toBe('Jan')
})
