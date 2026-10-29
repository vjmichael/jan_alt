// JAN-UPSTREAM-PROVENANCE: Derived from Jan (https://github.com/janhq/jan).
// Jan project notice: Copyright 2025 Menlo Research; upstream portions Apache-2.0.
// LU MODIFICATION NOTICE: Lu contributors have modified this Jan-derived file. Preserve upstream notices.
// See docs/lu/jan-origin-provenance.md. This notice does not license unrelated Lu-only code.
import { defineConfig, loadEnv, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { writeFileSync } from 'node:fs'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import packageJson from './package.json'
const host = process.env.TAURI_DEV_HOST

// Plugin to inject GA scripts in HTML
function injectGoogleAnalytics(gaMeasurementId?: string): Plugin {
  return {
    name: 'inject-google-analytics',
    transformIndexHtml(html) {
      // Only inject GA scripts if GA_MEASUREMENT_ID is set
      if (!gaMeasurementId) {
        // Remove placeholder if no GA ID
        return html.replace(/\s*<!-- INJECT_GOOGLE_ANALYTICS -->\n?/g, '')
      }

      const gaScripts = `<!-- Google Analytics -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){ dataLayer.push(arguments); }
      gtag('consent','default',{
        ad_storage:'denied',
        analytics_storage:'denied',
        ad_user_data:'denied',
        ad_personalization:'denied',
        wait_for_update:500
      });
      gtag('js', new Date());
      gtag('config', '${gaMeasurementId}', {
        debug_mode: (location.hostname === 'localhost'),
        send_page_view: false
      });
    </script>`

      return html.replace('<!-- INJECT_GOOGLE_ANALYTICS -->', gaScripts)
    },
  }
}

// Rebrand the HTML shell only for the separately packaged Lu distribution.
function luBrandHtml(): Plugin {
  return {
    name: 'lu-distribution-html-brand',
    transformIndexHtml(html) {
      if (process.env.LU_BRAND !== 'true') return html
      return html
        .replaceAll('/images/jan-logo.png', '/images/lu-logo.svg')
        .replace('<title>Jan</title>', '<title>Lu</title>')
        .replace('alt="Jan Logo"', 'alt="Lu Logo"')
        .replace('Booting up Jan…', 'Booting up Lu…')
    },
  }
}

// Record the optimized Lu graph outside dist so the audit itself is not shipped.
function luBundleInventory(): Plugin {
  return {
    name: 'lu-cowork-bundle-inventory',
    apply: 'build',
    generateBundle(_options, bundle) {
      if (process.env.LU_BRAND !== 'true') return
      const modules = new Map<string, Set<string>>()
      for (const [chunkName, output] of Object.entries(bundle)) {
        if (output.type !== 'chunk') continue
        for (const id of Object.keys(output.modules)) {
          const normalized = id.replaceAll('\\', '/')
          const source = normalized.match(/(?:^|\/)web-app\/src\/(.+)$/)?.[1]
          if (!source) continue
          const name = `web-app/src/${source}`
          if (!modules.has(name)) modules.set(name, new Set())
          modules.get(name)!.add(chunkName)
        }
      }
      writeFileSync(
        path.resolve(__dirname, '.lu-bundle-modules.json'),
        JSON.stringify(
          [...modules].sort(([a], [b]) => a.localeCompare(b)).map(([module, chunks]) => ({
            module,
            chunks: [...chunks].sort(),
          })),
          null,
          2
        ) + '\n'
      )
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      TanStackRouterVite({
        target: 'react',
        autoCodeSplitting: true,
        // Lu alpha does not generate the Cowork, Artifacts or Cowork Settings
        // routes. Preserve Jan's route graph in non-Lu builds.
        routeFileIgnorePattern:
          process.env.LU_BRAND === 'true'
            ? '.((test).ts)|test-page|(?:^|[\\\\/])(?:cowork|artifacts)\\.tsx$'
            : '.((test).ts)|test-page',
      }),
      react(),
      tailwindcss(),
      nodePolyfills({
        include: ['path'],
      }),
      injectGoogleAnalytics(process.env.LU_BRAND === 'true' ? undefined : env.GA_MEASUREMENT_ID),
      luBrandHtml(),
      luBundleInventory(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@janhq/assistant-extension': path.resolve(__dirname, '../extensions/assistant-extension/dist/index.js'),
        '@janhq/conversational-extension': path.resolve(__dirname, '../extensions/conversational-extension/dist/index.js'),
        '@janhq/download-extension': path.resolve(__dirname, '../extensions/download-extension/dist/index.js'),
        '@janhq/llamacpp-extension': path.resolve(__dirname, '../extensions/llamacpp-extension/dist/index.js'),
        '@janhq/mlx-extension': path.resolve(__dirname, '../extensions/mlx-extension/dist/index.js'),
        '@janhq/rag-extension': path.resolve(__dirname, '../extensions/rag-extension/dist/index.js'),
        '@janhq/vector-db-extension': path.resolve(__dirname, '../extensions/vector-db-extension/dist/index.js'),
      },
    },
    optimizeDeps: {
      // Extensions are prebuilt, self-contained ESM dist bundles. Excluding them
      // stops Vite's dev dep-optimizer from crawling/re-bundling them mid-boot,
      // which otherwise invalidates the in-flight dynamic import of the service
      // hub and surfaces as "Importing a module script failed" on cold start.
      exclude: [
        '@janhq/assistant-extension',
        '@janhq/conversational-extension',
        '@janhq/download-extension',
        '@janhq/llamacpp-extension',
        '@janhq/mlx-extension',
        '@janhq/rag-extension',
        '@janhq/vector-db-extension',
      ],
    },
    define: {
      IS_TAURI: JSON.stringify(process.env.IS_TAURI),
      LU_BRAND: JSON.stringify(process.env.LU_BRAND === 'true'),
      IS_DEV: JSON.stringify(process.env.IS_DEV),
      IS_WEB_APP: JSON.stringify(false),
      IS_MACOS: JSON.stringify(
        process.env.TAURI_ENV_PLATFORM?.includes('darwin') ?? false
      ),
      IS_WINDOWS: JSON.stringify(
        process.env.TAURI_ENV_PLATFORM?.includes('windows') ?? false
      ),
      IS_LINUX: JSON.stringify(
        process.env.TAURI_ENV_PLATFORM?.includes('linux') ?? false
      ),
      IS_IOS: JSON.stringify(
        process.env.TAURI_ENV_PLATFORM?.includes('ios') ?? false
      ),
      IS_ANDROID: JSON.stringify(
        process.env.TAURI_ENV_PLATFORM?.includes('android') ?? false
      ),
      PLATFORM: JSON.stringify(process.env.TAURI_ENV_PLATFORM),

      VERSION: JSON.stringify(packageJson.version),

      POSTHOG_KEY: JSON.stringify(process.env.LU_BRAND === 'true' ? '' : env.POSTHOG_KEY),
      POSTHOG_HOST: JSON.stringify(env.POSTHOG_HOST),
      GA_MEASUREMENT_ID: JSON.stringify(process.env.LU_BRAND === 'true' ? '' : env.GA_MEASUREMENT_ID),
      MODEL_CATALOG_URL: JSON.stringify(
        'https://raw.githubusercontent.com/janhq/model-catalog/main/model_catalog_v2.json'
      ),
      LATEST_JAN_MODEL_URL: JSON.stringify(
        'https://raw.githubusercontent.com/janhq/model-catalog/main/latest_jan_model.json'
      ),
      AUTO_UPDATER_DISABLED: JSON.stringify(
        env.AUTO_UPDATER_DISABLED === 'true' || process.env.LU_BRAND === 'true'
      ),
      UPDATE_CHECK_INTERVAL_MS: JSON.stringify(
        Number(env.UPDATE_CHECK_INTERVAL_MS) || 60 * 60 * 1000
      ),
    },

    // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
    //
    // 1. prevent vite from obscuring rust errors
    clearScreen: false,
    // 2. tauri expects a fixed port, fail if that port is not available
    server: {
      port: 1420,
      strictPort: true,
      host: host || false,
      hmr: host
        ? {
            protocol: 'ws',
            host,
            port: 1421,
          }
        : undefined,
      watch: {
        // 3. tell vite to ignore watching `src-tauri`
        ignored: ['**/src-tauri/**'],
        usePolling: true
      },
    },
  }
})
