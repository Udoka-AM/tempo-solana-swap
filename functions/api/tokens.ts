import { assertSameOrigin, json, supportedTokens, type Env } from './_lib'

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const denied = assertSameOrigin(request, env)
  if (denied) return denied
  return json({ tokens: supportedTokens() }, 200, { 'cache-control': 'public, max-age=300' })
}
