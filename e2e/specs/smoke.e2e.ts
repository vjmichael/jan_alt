import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { browser, expect, $ } from '@wdio/globals'

import { goto } from '../helpers/navigation.js'
import { janDataDir, janUserDataDir } from '../helpers/paths.js'

// The worker inherits this from the launcher; see wdio.conf.ts. Read from the
// environment rather than importing the config, so the spec does not trigger a
// second evaluation of a module with top-level side effects.
const testHome = process.env.JAN_E2E_HOME!

describe(process.env.LU_E2E === '1' ? 'Lu desktop app' : 'Jan desktop app', () => {
  if (process.env.LU_E2E === '1') {
    it('renders the Lu application title and never falls back to Jan branding', async () => {
      const title = await browser.execute(() => document.title)
      if (title !== 'Lu') {
        throw new Error('Lu E2E opened a wrong branded webview: ' + title)
      }
    })
  }
  before(async () => {
    // The webview has loaded the document. React mounting into it is asserted
    // by the first test rather than here, so a mount failure names a test
    // instead of dying in a hook.
    await $('#root').waitForExist({ timeout: 60_000 })
  })

  it('boots into the first-run setup screen', async () => {
    // Every run gets a fresh HOME, so no providers are configured and `/`
    // renders SetupScreen (routes/index.tsx). This doubles as the proof React
    // mounted, and makes the first-run state explicit: the navigation below
    // depends on it, and without this an onboarding change would surface as a
    // confusing "element not found" further down.
    await $('[data-testid="setup-wizard"]').waitForDisplayed({ timeout: 60_000 })
  })

  it('shows a data folder resolved by Rust, inside the throwaway HOME', async () => {
    await goto('/settings/general')

    const path = await $('[data-testid="app-data-folder-path"]')
    await path.waitForDisplayed({ timeout: 30_000 })

    // Assert the title attribute, not the text: the element is visually clipped
    // by `line-clamp-1 break-all`, and the component sets `title` to the full
    // untruncated path for exactly this reason.
    //
    // A path containing the temp HOME proves the whole chain -- React called
    // get_app_configurations over IPC, Rust resolved it from the HOME the
    // harness injected, and the value came back and reached the DOM.
    await expect(path).toHaveAttribute(
      'title',
      expect.stringContaining(testHome)
    )
  })
})

// The regression guard for the destructive bug. Asserting on isolationEnv()
// directly would be tautological -- it returns join(home, ...), so checking the
// result contains `home` proves nothing, and would still pass if wdio.conf.ts
// stopped passing that env to the app at all.
//
// This asserts the opposite end: a file the Rust side wrote, at a path the Rust
// side resolved through core::app::paths::data_dir(). It only exists here if the
// overridden environment actually reached the app process.
describe('on-disk isolation', () => {
  it('wrote its config inside the throwaway profile', async () => {
    // app_data_dir_with_fallback() -> data_dir()/Jan, + CONFIGURATION_FILE_NAME
    // (core/app/commands.rs, core/app/constants.rs).
    const settings = join(janDataDir(testHome), 'settings.json')

    await browser.waitUntil(() => existsSync(settings), {
      timeout: 30_000,
      timeoutMsg:
        `the app never wrote ${settings}. Either it resolved data_dir() ` +
        'outside the throwaway profile -- which is the isolation failing -- or ' +
        'the config path changed in core/app/commands.rs.',
    })
  })
})

if (process.env.LU_E2E === '1') {
  describe('Lu native-first MCP profile through the real webview', () => {
    it('does not import Jan Browser MCP when MCP settings are read from the desktop UI', async () => {
      await goto('/settings/mcp-servers')
      const config = join(janUserDataDir(testHome), 'mcp_config.json')
      await browser.waitUntil(() => existsSync(config), {
        timeout: 30_000,
        timeoutMsg: 'Lu never created its own MCP config in the isolated test profile.',
      })
      // The webview's MCP screen fetches get_mcp_configs. Give that IPC call a
      // chance to complete: it was this second command, not first-run setup,
      // that put the Jan Browser server back on disk.
      await $('[data-testid="app-data-folder-path"]').waitForExist({
        timeout: 500,
        reverse: true,
      }).catch(() => undefined)
      await browser.waitUntil(async () => {
        const result = JSON.parse(readFileSync(config, 'utf8')) as {
          mcpServers?: Record<string, unknown>
        }
        return result.mcpServers !== undefined
      }, { timeout: 30_000 })
      const settings = JSON.parse(readFileSync(config, 'utf8')) as {
        mcpServers?: Record<string, unknown>
      }
      const servers = Object.keys(settings.mcpServers ?? {})
      if (servers.length !== 0) {
        throw new Error('Lu imported non-native MCP defaults: ' + servers.join(', '))
      }
    })
  })
}
