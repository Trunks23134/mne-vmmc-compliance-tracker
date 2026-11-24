import { BadRequestException, Injectable } from '@nestjs/common';
import { describe, type ActivityLogCursor, type AuditLogRow } from '../me/activity.service';
import { SupabaseService } from '../supabase/supabase.service';

export const DEFAULT_TRAIL_LIMIT = 25;
export const MAX_TRAIL_LIMIT = 50;
type Role = 'STAFF' | 'UNIT_HEAD' | 'ADMIN';

export interface TrailRow extends AuditLogRow {
  actor_id: string | null;
}

export interface ActorRow {
  id: string;
  employee_id: string;
  full_name: string;
  job_title: string | null;
  role: Role;
}

export interface AuditTrailEntry {
  time: string;
  /** Plain-words version, e.g. "Accessed Laboratory Documents". */
  title: string;
  /** Raw audit code and the entity it touched, for the table's action / resource columns. */
  action: string;
  entityType: string | null;
  entityRef: string | null;
  /** Null when the row has no signed-in actor (e.g. a failed sign-in). */
  actor: { employeeId: string; fullName: string; role: Role; jobTitle: string | null } | null;
}

export interface AuditTrailPage {
  items: AuditTrailEntry[];
  nextCursor: ActivityLogCursor | null;
}

export function buildTrail(rows: TrailRow[], actors: Map<string, ActorRow>): AuditTrailEntry[] {
  return rows.map((row) => {
    const actor = row.actor_id ? actors.get(row.actor_id) : undefined;
    return {
      time: row.timestamp,
      title: describe(row.action, row.entity_type),
      action: row.action,
      entityType: row.entity_type,
      entityRef: row.entity_id ? row.entity_id.replace(/-/g, '').slice(0, 6).toUpperCase() : null,
      actor: actor ? { employeeId: actor.employee_id, fullName: actor.full_name, role: actor.role, jobTitle: actor.job_title } : null,
    };
  });
}

/** The admin's system-wide view of the append-only audit log (the personal Activity Logs only ever show your own rows). */
@Injectable()
export class AuditTrailService {
  constructor(private readonly supabaseService: SupabaseService) {}

  async list(
    limit: number = DEFAULT_TRAIL_LIMIT,
    beforeTimestamp?: string,
    beforeId?: string,
  ): Promise<AuditTrailPage> {
    const wanted = Math.min(Math.max(1, limit), MAX_TRAIL_LIMIT);
    if (Boolean(beforeTimestamp) !== Boolean(beforeId)) {
      throw new BadRequestException('Both beforeTimestamp and beforeId are required for an audit cursor.');
    }
    const client = this.supabaseService.getClient();

    let query = client
      .from('audit_logs')
      .select('id, actor_id, action, entity_type, entity_id, ip_address, user_agent, timestamp');
    if (beforeTimestamp && beforeId) {
      query = query.or(`timestamp.lt.${beforeTimestamp},and(timestamp.eq.${beforeTimestamp},id.lt.${beforeId})`);
    }
    const { data, error } = await query
      .order('timestamp', { ascending: false })
      .order('id', { ascending: false })
      .limit(wanted + 1)
      .returns<TrailRow[]>();
    if (error) throw error;
    const fetched = data ?? [];
    const rows = fetched.slice(0, wanted);

    const actorIds = [...new Set(rows.map((r) => r.actor_id).filter((id): id is string => Boolean(id)))];
    const actors = new Map<string, ActorRow>();
    if (actorIds.length > 0) {
      const { data: people, error: peopleError } = await client
        .from('employees')
        .select('id, employee_id, full_name, job_title, role')
        .in('id', actorIds)
        .returns<ActorRow[]>();
      if (peopleError) throw peopleError;
      for (const person of people ?? []) actors.set(person.id, person);
    }

    return {
      items: buildTrail(rows, actors),
      nextCursor: fetched.length > wanted && rows.length > 0
        ? { timestamp: rows[rows.length - 1].timestamp, id: rows[rows.length - 1].id }
        : null,
    };
  }
}
