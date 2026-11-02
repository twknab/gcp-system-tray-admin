import { describe, expect, it } from 'vitest';
import { createHttp } from '../../src/http.js';
import { getProjectBillingInfo, listBillingAccounts } from '../../src/sources/billingAccounts.js';
import { fakeFetch, token } from '../helpers.js';

describe('Cloud Billing source (R8)', () => {
  it('lists accounts across pages, including closed ones', async () => {
    const http = createHttp({
      getToken: token,
      fetch: fakeFetch([
        { match: /billingAccounts\?pageSize=100&pageToken=next/, body: { billingAccounts: [{ name: 'billingAccounts/222222-222222-222222', displayName: 'Old', open: false }] } },
        { match: 'https://cloudbilling.googleapis.com/v1/billingAccounts', body: {
          billingAccounts: [
            { name: 'billingAccounts/000000-000000-000000', displayName: 'Personal', open: true, currencyCode: 'USD' },
            { name: 'billingAccounts/111111-111111-111111', displayName: 'Side', open: true },
          ],
          nextPageToken: 'next',
        } },
      ]),
    });
    const accts = await listBillingAccounts(http);
    expect(accts.map((a) => [a.id, a.open])).toEqual([
      ['000000-000000-000000', true],
      ['111111-111111-111111', true],
      ['222222-222222-222222', false],
    ]);
    expect(accts[0]!.currencyCode).toBe('USD');
  });
  it('reads project billing info, including disabled billing', async () => {
    const http = createHttp({
      getToken: token,
      fetch: fakeFetch([
        { match: /projects\/fake-on\/billingInfo/, body: { billingEnabled: true, billingAccountName: 'billingAccounts/000000-000000-000000' } },
        { match: /projects\/fake-off\/billingInfo/, body: { billingEnabled: false } },
      ]),
    });
    expect(await getProjectBillingInfo(http, 'fake-on')).toEqual({ billingEnabled: true, billingAccountId: '000000-000000-000000' });
    expect(await getProjectBillingInfo(http, 'fake-off')).toEqual({ billingEnabled: false });
  });
});
