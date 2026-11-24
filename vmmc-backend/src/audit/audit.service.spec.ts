import { Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { createSupabaseClientMock } from '../test-utils/supabase-chain-mock';
import { AuditService } from './audit.service';

describe('AuditService.log', () => {
  afterEach(() => jest.restoreAllMocks());

  it('reports database insert failures without hiding them or throwing into the request', async () => {
    const mock = createSupabaseClientMock([{ data: null, error: { message: 'database unavailable' } }]);
    const service = new AuditService({ getClient: jest.fn(() => mock.client) } as unknown as SupabaseService);
    const logError = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    await expect(service.log({ actorId: 'employee-1', action: 'ACCESS' })).resolves.toBeUndefined();

    expect(logError).toHaveBeenCalledWith(expect.stringContaining('database unavailable'));
  });
});
