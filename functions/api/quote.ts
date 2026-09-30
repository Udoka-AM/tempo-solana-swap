import { apiError, assertSameOrigin, fetchAcrossQuote, type Env, validateQuote } from './_lib'

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const denied = assertSameOrigin(request, env)
  if (denied) return denied
  if (!env.ACROSS_API_KEY || !env.ACROSS_INTEGRATOR_ID) return apiError('service_not_configured', 503)
  const result = validateQuote(request)
  if (result.error) return result.error
  try {
    return await fetchAcrossQuote(result.params, env)
  } catch {
    return apiError('quote_upstream_unavailable', 502)
  }
}
