import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuditService } from '../../audit/audit.service';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RequestWithEmployee } from '../types/request-with-employee';
import { Role } from '../types/role';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest<RequestWithEmployee>();
    if (!requiredRoles.includes(request.employee.role)) {
      const path = request.originalUrl?.split('?')[0] ?? request.url;
      const segments = path.split('/').filter(Boolean);
      const routeId = request.params?.id ?? request.params?.employeeId;
      await this.auditService.log({
        actorId: request.employee.id,
        action: 'ACCESS_DENIED',
        entityType: segments[1] === 'me' && segments[2] ? `me-${segments[2]}` : (segments[1] ?? 'unknown'),
        entityId: typeof routeId === 'string' ? routeId : null,
        ipAddress: request.ip ?? null,
        userAgent: request.headers['user-agent'] ?? null,
      });
      throw new ForbiddenException('You do not have permission to access this resource.');
    }
    return true;
  }
}
