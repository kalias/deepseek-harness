/**
 * Transport factory: creates the appropriate MCP transport based on the
 * plugin's resolved config. Stdio spawns a child process (with credential
 * scrubbing); Streamable HTTP connects to a URL.
 *
 * @module
 */

import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import type { Transport } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { scrubbedParentEnv } from '@deepseek-ai/dsh-subprocess'
import type { Config } from './index.ts'

/**
 * The subprocess seam's scrubbed parent env (credential-shaped and stale
 * `DSH_*` names dropped), plus the spec's explicit env. The MCP SDK owns the
 * actual spawn, so this transport shares the scrub definition rather than the
 * spawn path.
 */
function buildChildEnv(extra: Record<string, string>): Record<string, string> {
  return { ...scrubbedParentEnv(), ...extra }
}

/**
 * Create an MCP transport from the resolved plugin config.
 *
 * @param config - Resolved plugin config discriminated on `transport`.
 * @returns A connected-ready MCP Transport (stdio or Streamable HTTP).
 */
export function createTransport(config: Config): Transport {
  switch (config.transport) {
    case 'stdio':
      return new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: buildChildEnv(config.env),
        cwd: config.cwd,
      })
    case 'streamable-http':
      return new StreamableHTTPClientTransport(
        new URL(config.url),
        { requestInit: { headers: config.headers } },
      )
  }
}

/** Create a transport after resolving optional credential-backed HTTP headers. */
export async function createTransportForContext(ctx: Context, config: Config): Promise<Transport> {
  if (config.transport !== 'streamable-http' || Object.keys(config.credentialHeaders ?? {}).length === 0) {
    return createTransport(config)
  }
  return createTransport({ ...config, headers: await resolveHttpHeaders(ctx, config) })
}

/** Resolve literal and credential-backed HTTP headers without retaining a secret. */
async function resolveHttpHeaders(ctx: Context, config: Extract<Config, { transport: 'streamable-http' }>): Promise<Record<string, string>> {
  const headers = { ...config.headers }
  const credentials = ctx.get('credentials')
  const environment = launchEnvironmentOf(ctx)
  for (const [header, binding] of Object.entries(config.credentialHeaders ?? {})) {
    const ref = credentialRef(binding.ref)
    const resolved = credentials === undefined
      ? environment.get(ref)
      : await credentials.resolve(ref)
    if (resolved === undefined || resolved.value.length === 0) {
      throw new Error(`mcp-client(${config.serverName}): HTTP header ${JSON.stringify(header)} requires credential reference ${JSON.stringify(ref)}.`)
    }
    headers[header] = `${binding.prefix ?? ''}${resolved.value}`
  }
  return headers
}
