import { apiError, assertSameOrigin, fetchDepositStatus, validateDepositStatus, type Env } from './_lib'

// Same-origin proxy for Across deposit tracking so the browser can verify the
// bridging hop (pending -> filled) without holding the Across API key.
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const denied = assertSameOrigin(request, env)
  if (denied) return denied
  if (!env.ACROSS_API_KEY || !env.ACROSS_INTEGRATOR_ID) return apiError('service_not_configured', 503)
  const result = validateDepositStatus(request)
  if (result.error) return result.error
  try {
    return await fetchDepositStatus(result.params, env)
  } catch {
    return apiError('deposit_status_unavailable', 502)
  }
}
