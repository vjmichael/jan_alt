// JAN-UPSTREAM-PROVENANCE: Derived from Jan (https://github.com/janhq/jan).
// Jan project notice: Copyright 2025 Menlo Research; upstream portions Apache-2.0.
// LU MODIFICATION NOTICE: Lu contributors have modified this Jan-derived file. Preserve upstream notices.
// See docs/lu/jan-origin-provenance.md. This notice does not license unrelated Lu-only code.
import { isDev } from './utils'

export const isNightly = VERSION.includes('-')
export const isBeta = VERSION.includes('beta')
export const isProd = !isNightly && !isBeta && !isDev()

/**
 * Builds that are allowed to show the Cowork surface (sidebar tab, routes and
 * settings). Cowork is a preview feature: it ships in nightly builds and in the
 * local dev server, and stays out of every Lu-branded build as well as Jan
 * beta and stable releases. Read it at render time - `isDev()` looks at
 * `window.location`, so tests can stub the channel per case.
 *
 * Beta releases carry a hyphen too (`0.7.4-beta`), so `isBeta` has to be
 * excluded explicitly - same rule the updater uses to label nightly builds.
 */
export const isCoworkEnabled = () =>
  !LU_BRAND && ((isNightly && !isBeta) || isDev())
