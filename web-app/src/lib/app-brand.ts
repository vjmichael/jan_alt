/** Jan package IDs remain intact; only Lu's visible identity changes. */
export function appDisplayName(isLu: boolean = LU_BRAND): 'Jan' | 'Lu' {
  return isLu ? 'Lu' : 'Jan'
}
