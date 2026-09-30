import { apiError, assertSameOrigin, fetchAcrossMeta, validateMetaResource, type Env } from './_lib'

// Same-origin proxy for Across swap metadata (supported chains/tokens) so
// the app and operators can verify exactly which Tempo <-> Solana routes
// Across supports, without exposing the API key.
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const denied = assertSameOrigin(request, env)
  if (denied) return denied
  if (!env.ACROSS_API_KEY || !env.ACROSS_INTEGRATOR_ID) return apiError('service_not_configured', 503)
  const result = validateMetaResource(request)
  if (result.error) return result.error
  try {
    return await fetchAcrossMeta(result.resource, env)
  } catch {
    return apiError('meta_unavailable', 502)
  }
}
