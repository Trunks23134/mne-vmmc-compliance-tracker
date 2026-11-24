import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuditService } from '../../audit/audit.service';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  it('audits a role denial before rejecting the request', async () => {
    const request = {
      originalUrl: '/api/audit-trail?limit=25',
      url: '/api/audit-trail',
      employee: { id: 'employee-1', role: 'STAFF' },
      params: {},
      ip: '127.0.0.1',
      headers: { 'user-agent': 'jest' },
    };
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    const reflector = { getAllAndOverride: jest.fn(() => ['ADMIN']) } as unknown as Reflector;
    const auditService = { log: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
    const guard = new RolesGuard(reflector, auditService);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'employee-1',
      action: 'ACCESS_DENIED',
      entityType: 'audit-trail',
    }));
  });
});
