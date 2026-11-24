import { ConfigService } from '@nestjs/config';
import { EscalationsService } from '../escalations/escalations.service';
import { SupabaseService } from '../supabase/supabase.service';
import { createSupabaseClientMock } from '../test-utils/supabase-chain-mock';
import { EmailChannel } from './channels/email.channel';
import { SmsChannel } from './channels/sms.channel';
import { NotificationDispatcherService } from './notification-dispatcher.service';

function serviceWith(result: { data: unknown; error: unknown }) {
  const { client } = createSupabaseClientMock([result]);
  const supabase = { getClient: jest.fn(() => client) } as unknown as SupabaseService;
  const service = new NotificationDispatcherService(
    supabase,
    {} as SmsChannel,
    {} as EmailChannel,
    {} as EscalationsService,
    {} as ConfigService,
  );
  return { service, client };
}

describe('NotificationDispatcherService', () => {
  it('returns read state for the caller’s in-app notifications', async () => {
    const readAt = '2026-11-24T09:00:00.000Z';
    const { service } = serviceWith({
      data: [{
        id: 'notification-1',
        status: 'SENT',
        sent_at: '2026-11-24T08:00:00.000Z',
        created_at: '2026-11-24T08:00:00.000Z',
        read_at: readAt,
        events: { event_type: 'WARNING', event_subtype: 'FIRST_REMINDER', severity: 1, message: 'A reminder' },
      }],
      error: null,
    });

    const [notification] = await service.listMine('employee-1');

    expect(notification.readAt).toBe(readAt);
    expect(notification.eventSubtype).toBe('FIRST_REMINDER');
  });

  it('marks only unread in-app notifications belonging to the caller', async () => {
    const { service, client } = serviceWith({ data: [{ id: 'notification-1' }], error: null });

    const result = await service.markMineRead('employee-1');

    expect(result.markedRead).toBe(1);
    const chain = (client.from as jest.Mock).mock.results[0].value as {
      update: jest.Mock;
      eq: jest.Mock;
      is: jest.Mock;
      select: jest.Mock;
    };
    expect(chain.update).toHaveBeenCalledWith({ read_at: expect.any(String) });
    expect(chain.eq).toHaveBeenNthCalledWith(1, 'employee_id', 'employee-1');
    expect(chain.eq).toHaveBeenNthCalledWith(2, 'channel', 'IN_APP');
    expect(chain.is).toHaveBeenCalledWith('read_at', null);
    expect(chain.select).toHaveBeenCalledWith('id');
  });

  it('surfaces database errors when marking notifications read fails', async () => {
    const error = new Error('database unavailable');
    const { service } = serviceWith({ data: null, error });

    await expect(service.markMineRead('employee-1')).rejects.toBe(error);
  });
});
