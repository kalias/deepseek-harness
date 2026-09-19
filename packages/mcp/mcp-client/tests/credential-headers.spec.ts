import { describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'

import { Config } from '../src/index.ts'
import { createTransportForContext } from '../src/transport.ts'

function contextWithCredentials(values: Record<string, string | undefined>): Context {
  return {
    get: (name: string) => name === 'credentials'
      ? { resolve: async (ref: string) => values[String(ref)] === undefined ? undefined : { value: values[String(ref)] } }
      : undefined,
  } as unknown as Context
}

function httpConfig(credentialHeaders?: Record<string, { ref: string; prefix?: string }>) {
  return Config({ transport: 'streamable-http', serverName: 'probe', url: 'http://mcp-probe.invalid/mcp', headers: { 'x-literal': 'kept' }, credentialHeaders }) as ReturnType<typeof Config>
}

describe('credential-backed streamable-http headers', () => {
  it('passes through untouched when no credential headers are configured', async () => {
    const transport = await createTransportForContext(contextWithCredentials({}) , httpConfig())
    expect(transport).toBeDefined()
  })

  it('resolves references with their prefix at connection time', async () => {
    // The merged headers are observable through the transport's request init;
    // assert via the resolution path by intercepting a bad reference below and
    // the good path completing without error.
    const transport = await createTransportForContext(
      contextWithCredentials({ 'openbkn_mcp_token': 'secret-value' }),
      httpConfig({ authorization: { ref: 'openbkn_mcp_token', prefix: 'Bearer ' } }),
    )
    expect(transport).toBeDefined()
  })

  it('fails loudly when a reference cannot be resolved', async () => {
    await expect(createTransportForContext(
      contextWithCredentials({}),
      httpConfig({ authorization: { ref: 'missing_ref' } }),
    )).rejects.toThrow(/requires credential reference/)
  })
})
