// Lu has no Cowork session. Shared Jan UI reads this empty mirror in the
// branded build; any attempt to write a Cowork progress event fails closed.
const empty = {
  loadingModels: {} as Record<string, boolean>,
  modelLoadProgress: {} as Record<string, never>,
}

export const useCoworkRun = Object.assign(
  <T>(selector: (state: typeof empty) => T): T => selector(empty),
  {
    getState(): never {
      throw new Error('Cowork session progress is unavailable in Lu')
    },
  }
)
