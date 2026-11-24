import { EmployeeContext } from '../auth/types/role';
import { SupabaseService } from '../supabase/supabase.service';
import { createSupabaseClientMock } from '../test-utils/supabase-chain-mock';
import { ActivityService, AuditLogRow, describe as describeAuditAction } from './activity.service';

describe('describe', () => {
  it('uses friendly labels for request failures and authentication actions', () => {
    expect(describeAuditAction('FAILED_UPDATE', 'documents')).toBe('Failed to Update Laboratory Documents');
    expect(describeAuditAction('LOGOUT', 'auth')).toBe('Signed Out');
    expect(describeAuditAction('PASSWORD_CHANGED', 'auth')).toBe('Password Changed');
  });
});

const EMPLOYEE = { id: 'employee-1', role: 'STAFF' } as EmployeeContext;

function row(overrides: Partial<AuditLogRow> = {}): AuditLogRow {
  return {
    id: 'audit-1',
    action: 'ACCESS',
    entity_type: 'documents',
    entity_id: '904a7c1e-0000-4000-8000-000000000904',
    ip_address: '10.0.0.5',
    user_agent: null,
    timestamp: '2026-08-20T09:15:00Z',
    ...overrides,
  };
}

describe('ActivityService.listActivityLogs', () => {
  function serviceReturning(rows: AuditLogRow[]) {
    const { client } = createSupabaseClientMock([{ data: rows, error: null }]);
    const supabaseService = { getClient: jest.fn(() => client) } as unknown as SupabaseService;
    return { service: new ActivityService(supabaseService), client };
  }

  it('returns every row, including background reads and same-time events, in the page', async () => {
    const { service } = serviceReturning([
      row({ id: '3', entity_type: 'me-notifications' }),
      row({ id: '2', entity_type: 'documents', timestamp: '2026-08-20T09:14:59Z' }),
      row({ id: '1', entity_type: 'documents', timestamp: '2026-08-20T09:14:59Z' }),
    ]);

    const page = await service.listActivityLogs(EMPLOYEE, 2);

    expect(page.items.map((entry) => entry.action)).toEqual(['ACCESS', 'ACCESS']);
    expect(page.items[0]).toMatchObject({
      title: 'Accessed Notifications',
      entityType: 'me-notifications',
      entityRef: '904A7C',
    });
    expect(page.nextCursor).toEqual({ timestamp: '2026-08-20T09:14:59Z', id: '2' });
  });

  it('requests a stable, caller-scoped cursor page with one extra row to determine the next cursor', async () => {
    const { service, client } = serviceReturning([row()]);

    await service.listActivityLogs(EMPLOYEE, 30, '2026-08-20T09:15:00Z', '904a7c1e-0000-4000-8000-000000000904');

    const chain = (client.from as jest.Mock).mock.results[0].value as {
      eq: jest.Mock;
      order: jest.Mock;
      or: jest.Mock;
      limit: jest.Mock;
    };
    expect(chain.eq).toHaveBeenCalledWith('actor_id', EMPLOYEE.id);
    expect(chain.or).toHaveBeenCalledWith('timestamp.lt.2026-08-20T09:15:00Z,and(timestamp.eq.2026-08-20T09:15:00Z,id.lt.904a7c1e-0000-4000-8000-000000000904)');
    expect(chain.order).toHaveBeenNthCalledWith(1, 'timestamp', { ascending: false });
    expect(chain.order).toHaveBeenNthCalledWith(2, 'id', { ascending: false });
    expect(chain.limit).toHaveBeenCalledWith(31);
  });

  it('leaves entityRef null when the audit row has no entity id', async () => {
    const { service } = serviceReturning([row({ action: 'LOGIN', entity_type: null, entity_id: null })]);
    const page = await service.listActivityLogs(EMPLOYEE);

    expect(page.items[0].action).toBe('LOGIN');
    expect(page.items[0].entityRef).toBeNull();
  });
});
