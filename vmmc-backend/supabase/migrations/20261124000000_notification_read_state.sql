-- Track whether an employee has viewed an in-app notification without changing
-- the delivery status used by the notification dispatch log.
alter table notifications
  add column if not exists read_at timestamptz;

create index if not exists notifications_unread_in_app_idx
  on notifications (employee_id, created_at desc)
  where channel = 'IN_APP' and read_at is null;

comment on column notifications.read_at is
  'When the employee viewed this in-app notification; delivery status remains in status.';
