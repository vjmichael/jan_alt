// Jan Cowork persistence is loaded only by the Jan desktop channel.
// The Lu branded build drops this dynamic import from its startup graph.
import { useCoworkSessions } from '@/hooks/useCoworkSessions'
import { useCoworkConfig } from '@/hooks/useCoworkConfig'

export async function hydrateCoworkStores(): Promise<void> {
  await Promise.all([
    Promise.resolve(useCoworkSessions.persist.rehydrate()),
    Promise.resolve(useCoworkConfig.persist.rehydrate()),
  ])
}
