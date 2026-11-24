import { SupabaseService } from '../supabase/supabase.service';
import { createSupabaseClientMock } from '../test-utils/supabase-chain-mock';
import { ActorRow, AuditTrailService, buildTrail, TrailRow } from './audit-trail.service';

const ANA: ActorRow = { id: 'u-ana', employee_id: 'VMMC-24-0006', full_name: 'Ana Garcia', job_title: 'Staff Nurse', role: 'STAFF' };
const actors = new Map<string, ActorRow>([[ANA.id, ANA]]);

const row = (overrides: Partial<TrailRow> = {}): TrailRow => ({
  id: '3f2a9c10-1111-4222-8333-444455556666',
  actor_id: ANA.id,
  action: 'ACCESS',
  entity_type: 'documents',
  entity_id: '3f2a9c10-1111-4222-8333-444455556666',
  ip_address: '10.0.0.1',
  user_agent: 'jest',
  timestamp: '2026-10-22T08:00:00.000Z',
  ...overrides,
});

describe('buildTrail', () => {
  it('shapes entries without hiding reads or collapsing bursts', () => {
    const entries = buildTrail([
      row({ entity_type: 'me-notifications' }),
      row({ timestamp: '2026-10-22T08:00:00.100Z' }),
      row({ timestamp: '2026-10-22T08:00:00.200Z' }),
    ], actors);

    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({
      title: 'Accessed Notifications',
      action: 'ACCESS',
      entityType: 'me-notifications',
      entityRef: '3F2A9C',
      actor: { employeeId: ANA.employee_id, fullName: ANA.full_name },
    });
  });

  it('represents missing actors without failing', () => {
    expect(buildTrail([row({ actor_id: null, action: 'LOGIN_FAILED', entity_type: 'auth' })], actors)[0].actor).toBeNull();
  });
});

describe('AuditTrailService.list', () => {
  it('returns a page, indicates additional rows, and looks up page actors', async () => {
    const mock = createSupabaseClientMock([
      { data: [row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c' })], error: null },
      { data: [ANA], error: null },
    ]);
    const service = new AuditTrailService({ getClient: jest.fn(() => mock.client) } as unknown as SupabaseService);

    const result = await service.list(2, '2026-10-22T08:00:00.000Z', '3f2a9c10-1111-4222-8333-444455556666');

    expect(result.items).toHaveLength(2);
    expect(result.nextCursor).toEqual({ timestamp: '2026-10-22T08:00:00.000Z', id: 'b' });
    expect(mock.calls).toEqual(['audit_logs', 'employees']);
    const logChain = mock.client.from.mock.results[0].value as { limit: jest.Mock; order: jest.Mock; or: jest.Mock };
    expect(logChain.limit).toHaveBeenCalledWith(3);
    expect(logChain.or).toHaveBeenCalledWith('timestamp.lt.2026-10-22T08:00:00.000Z,and(timestamp.eq.2026-10-22T08:00:00.000Z,id.lt.3f2a9c10-1111-4222-8333-444455556666)');
    expect(logChain.order).toHaveBeenNthCalledWith(1, 'timestamp', { ascending: false });
    expect(logChain.order).toHaveBeenNthCalledWith(2, 'id', { ascending: false });
  });

  it('skips the actor lookup for an empty page and propagates database errors', async () => {
    const empty = createSupabaseClientMock([{ data: null, error: null }]);
    const emptyService = new AuditTrailService({ getClient: jest.fn(() => empty.client) } as unknown as SupabaseService);
    expect(await emptyService.list()).toEqual({ items: [], nextCursor: null });
    expect(empty.calls).toEqual(['audit_logs']);

    const failed = createSupabaseClientMock([{ data: null, error: { message: 'boom' } }]);
    await expect(new AuditTrailService({ getClient: jest.fn(() => failed.client) } as unknown as SupabaseService).list())
      .rejects.toMatchObject({ message: 'boom' });
  });
});
