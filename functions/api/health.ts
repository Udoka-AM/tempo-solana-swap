import { appFeeFor, assertSameOrigin, json, type Env } from './_lib'

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const denied = assertSameOrigin(request, env)
  if (denied) return denied
  const configured = Boolean(env.ACROSS_API_KEY && env.ACROSS_INTEGRATOR_ID)
  return json({
    ok: true,
    service: 'tempo-solana-swap',
    timestamp: new Date().toISOString(),
    across: configured ? 'configured' : 'missing',
    fees: {
      solana: appFeeFor('solana', env) ? 'on' : 'off',
      tempo: appFeeFor('tempo', env) ? 'on' : 'off',
    },
  })
}
