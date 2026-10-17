// Credentials come only from the owner's existing gcloud sign-in (Principle V).
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { GoogleAuth } from 'google-auth-library';
import { HttpError } from './http.js';

const run = promisify(execFile);

// Scopes are best-effort only: user ADC refresh tokens keep the scopes they were minted with.
// Read-only behaviour is enforced by the request guard in http.ts (research R13).
const SCOPES = ['https://www.googleapis.com/auth/cloud-platform.read-only', 'https://www.googleapis.com/auth/bigquery.readonly'];

export const SIGN_IN_STEP = 'gcloud auth application-default login';

export interface Auth {
  getToken(): Promise<string>;
  /** quota project from ADC, if any */
  adcQuotaProject(): Promise<string | undefined>;
  /** which mechanism produced the token */
  source(): Promise<'adc' | 'gcloud'>;
}

export function findGcloud(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const candidates = [
    '/opt/homebrew/bin/gcloud',
    '/usr/local/bin/gcloud',
    join(homedir(), 'google-cloud-sdk', 'bin', 'gcloud'),
    '/opt/homebrew/share/google-cloud-sdk/bin/gcloud',
    ...(env.PATH ?? '').split(':').filter(Boolean).map((d) => join(d, 'gcloud')),
  ];
  return candidates.find((p) => existsSync(p));
}

export function createAuth(): Auth {
  const google = new GoogleAuth({ scopes: SCOPES });
  let cached: { token: string; expires: number; via: 'adc' | 'gcloud' } | undefined;

  async function fetchToken(): Promise<{ token: string; via: 'adc' | 'gcloud' }> {
    try {
      const client = await google.getClient();
      const t = await client.getAccessToken();
      if (t.token) return { token: t.token, via: 'adc' };
    } catch {
      /* fall through to gcloud */
    }
    const gcloud = findGcloud();
    if (!gcloud) throw new HttpError('auth', `not signed in to Google Cloud — run: ${SIGN_IN_STEP}`);
    try {
      const { stdout } = await run(gcloud, ['auth', 'print-access-token'], { timeout: 15_000 });
      const token = stdout.trim();
      if (token) return { token, via: 'gcloud' };
    } catch {
      /* reported below */
    }
    throw new HttpError('auth', `credentials are missing or expired — run: ${SIGN_IN_STEP}`);
  }

  async function ensure() {
    if (!cached || Date.now() > cached.expires) {
      const t = await fetchToken();
      cached = { ...t, expires: Date.now() + 45 * 60_000 };
    }
    return cached;
  }

  return {
    getToken: async () => (await ensure()).token,
    source: async () => (await ensure()).via,
    async adcQuotaProject() {
      try {
        const client = (await google.getClient()) as { quotaProjectId?: string };
        return client.quotaProjectId ?? (await google.getProjectId().catch(() => undefined)) ?? undefined;
      } catch {
        return undefined;
      }
    },
  };
}
