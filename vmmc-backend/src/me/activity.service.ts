import { BadRequestException, Injectable } from '@nestjs/common';
import { EmployeeContext } from '../auth/types/role';
import { describeUserAgent } from '../common/describe-user-agent';
import { SupabaseService } from '../supabase/supabase.service';

export interface AuditLogRow {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id?: string | null;
  ip_address: string | null;
  user_agent: string | null;
  timestamp: string;
}

export const DEFAULT_ACTIVITY_LIMIT = 30;
export const MAX_ACTIVITY_LIMIT = 50;

export interface ActivityLogCursor {
  timestamp: string;
  id: string;
}

export interface ActivityLogPage {
  items: Array<{
    title: string;
    time: string;
    ip: string | null;
    action: string;
    entityType: string | null;
    entityRef: string | null;
  }>;
  nextCursor: ActivityLogCursor | null;
}

const ENTITY_LABELS: Record<string, string> = {
  auth: 'Account',
  departments: 'Departments',
  compliance: 'Health Registry Tracker',
  dashboard: 'Home Dashboard',
  documents: 'Laboratory Documents',
  'review-queue': 'Review Queue',
  escalations: 'Escalations',
  reports: 'Compliance Reports',
  registry: 'Modules Registry',
  'audit-trail': 'System Audit Trail',
  notifications: 'Notification Log',
  'pep-logs': 'PEP Exposure Log',
  immunizations: 'Immunization Record',
  'pre-employment': 'Pre-Employment Screening',
  'change-requests': 'Change Request',
  monitoring: 'Compliance Scan',
  me: 'Profile',
  'me-profile': 'Profile',
  'me-compliance-summary': 'My Compliance Record',
  'me-documents': 'My Documents',
  'me-notifications': 'Notifications',
  'me-signature': 'Digital Signature',
  'me-security': 'Account Security',
  'me-privacy-settings': 'Data Privacy Settings',
  'me-performance-stats': 'Performance Stats',
  'me-activity-logs': 'Activity Logs',
  'me-login-history': 'Login History',
  'me-devices': 'Registered Devices',
};

export function describe(action: string, entityType: string | null): string {
  const label = (entityType && ENTITY_LABELS[entityType]) || 'Record';
  if (action === 'LOGIN') return 'Secure Login Successful';
  if (action === 'LOGIN_FAILED') return 'Failed Login Attempt';
  if (action === 'LOGOUT') return 'Signed Out';
  if (action === 'ACCOUNT_CREATED') return 'Account Created';
  if (action === 'PASSWORD_CHANGED') return 'Password Changed';
  if (action === 'PASSWORD_RESET') return 'Password Reset';
  if (action === 'PASSWORD_RESET_REQUESTED') return 'Password Reset Requested';
  if (action === 'PASSWORD_RESET_OTP_VERIFIED') return 'Password Reset Code Verified';
  if (action === 'PASSWORD_RESET_OTP_FAILED') return 'Failed Password Reset Code Attempt';
  if (action === 'PASSWORD_CHANGE_FAILED') return 'Failed Password Change Attempt';
  if (action === 'ACCESS_DENIED') return `Blocked Access Attempt: ${label}`;
  if (action === 'FAILED_ACCESS') return `Failed to Access ${label}`;
  if (action === 'FAILED_CREATE') return `Failed to Create ${label} Entry`;
  if (action === 'FAILED_UPDATE') return `Failed to Update ${label}`;
  if (action === 'FAILED_DELETE') return `Failed to Delete ${label} Entry`;
  if (action === 'ACCESS') return `Accessed ${label}`;
  if (action === 'CREATE') return `Created ${label} Entry`;
  if (action === 'UPDATE') return `Updated ${label}`;
  if (action === 'DELETE') return `Deleted ${label} Entry`;
  return `${action} — ${label}`;
}

@Injectable()
export class ActivityService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async listActivityLogs(
    currentUser: EmployeeContext,
    limit = DEFAULT_ACTIVITY_LIMIT,
    beforeTimestamp?: string,
    beforeId?: string,
  ): Promise<ActivityLogPage> {
    const pageSize = Math.min(Math.max(1, limit), MAX_ACTIVITY_LIMIT);
    if (Boolean(beforeTimestamp) !== Boolean(beforeId)) {
      throw new BadRequestException('Both beforeTimestamp and beforeId are required for an activity cursor.');
    }

    let query = this.supabaseService
      .getClient()
      .from('audit_logs')
      .select('id, action, entity_type, entity_id, ip_address, user_agent, timestamp')
      .eq('actor_id', currentUser.id);
    if (beforeTimestamp && beforeId) {
      query = query.or(`timestamp.lt.${beforeTimestamp},and(timestamp.eq.${beforeTimestamp},id.lt.${beforeId})`);
    }
    const { data, error } = await query
      .order('timestamp', { ascending: false })
      .order('id', { ascending: false })
      .limit(pageSize + 1)
      .returns<AuditLogRow[]>();
    if (error) throw error;

    const rows = data ?? [];
    const items = rows.slice(0, pageSize);
    return {
      items: items.map((row) => ({
        title: describe(row.action, row.entity_type),
        time: row.timestamp,
        ip: row.ip_address,
        action: row.action,
        entityType: row.entity_type,
        entityRef: row.entity_id ? row.entity_id.replace(/-/g, '').slice(0, 6).toUpperCase() : null,
      })),
      nextCursor: rows.length > pageSize && items.length > 0
        ? { timestamp: items[items.length - 1].timestamp, id: items[items.length - 1].id }
        : null,
    };
  }

  async listLoginHistory(currentUser: EmployeeContext) {
    const { data, error } = await this.supabaseService
      .getClient()
      .from('audit_logs')
      .select('id, action, entity_type, ip_address, user_agent, timestamp')
      .eq('actor_id', currentUser.id)
      .eq('action', 'LOGIN')
      .order('timestamp', { ascending: false })
      .limit(20)
      .returns<AuditLogRow[]>();
    if (error) throw error;

    return (data ?? []).map((row, index) => ({
      device: describeUserAgent(row.user_agent),
      ip: row.ip_address,
      time: row.timestamp,
      current: index === 0,
    }));
  }
}
