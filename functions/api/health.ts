import { assertSameOrigin, json, type Env } from './_lib'

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const denied = assertSameOrigin(request, env)
  if (denied) return denied
  return json({ ok: true, service: 'tempo-solana-swap', timestamp: new Date().toISOString() })
}
