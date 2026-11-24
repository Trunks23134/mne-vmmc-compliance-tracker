import { CallHandler, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import { deriveEntityType, AuditInterceptor } from './audit.interceptor';

describe('deriveEntityType', () => {
  it('uses the module segment for most routes', () => {
    expect(deriveEntityType('/api/compliance/tracker')).toBe('compliance');
    expect(deriveEntityType('/api/documents')).toBe('documents');
    expect(deriveEntityType('/api/review-queue')).toBe('review-queue');
  });

  describe('AuditInterceptor', () => {
    const request = {
      originalUrl: '/api/documents?limit=10',
      url: '/api/documents',
      employee: { id: 'employee-1' },
      params: {},
      ip: '127.0.0.1',
      headers: { 'user-agent': 'jest' },
      method: 'GET',
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as ExecutionContext;

    it('awaits an audit write before emitting a successful response', async () => {
      let finishWrite: (() => void) | undefined;
      const write = new Promise<void>((resolve) => { finishWrite = resolve; });
      const auditService = { log: jest.fn(() => write) };
      const interceptor = new AuditInterceptor(auditService as never);
      const result = lastValueFrom(interceptor.intercept(context, { handle: () => of('response') } as CallHandler));
      let emitted = false;
      void result.then(() => { emitted = true; });

      await Promise.resolve();
      expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({
        actorId: 'employee-1',
        action: 'ACCESS',
        entityType: 'documents',
      }));
      expect(emitted).toBe(false);
      finishWrite?.();
      await expect(result).resolves.toBe('response');
    });

    it('records failed handler requests and rethrows the original error', async () => {
      const error = new ForbiddenException();
      const auditService = { log: jest.fn().mockResolvedValue(undefined) };
      const interceptor = new AuditInterceptor(auditService as never);
      const result = lastValueFrom(interceptor.intercept(context, { handle: () => throwError(() => error) } as CallHandler));

      await expect(result).rejects.toBe(error);
      expect(auditService.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACCESS_DENIED' }));
    });
  });

  it('splits the me module by its sub-resource instead of collapsing everything to "me"', () => {
    expect(deriveEntityType('/api/me/profile')).toBe('me-profile');
    expect(deriveEntityType('/api/me/activity-logs')).toBe('me-activity-logs');
    expect(deriveEntityType('/api/me/devices')).toBe('me-devices');
    expect(deriveEntityType('/api/me/devices/9f2c1e3a-...')).toBe('me-devices');
    expect(deriveEntityType('/api/me/login-history')).toBe('me-login-history');
    expect(deriveEntityType('/api/me/security/pin')).toBe('me-security');
  });

  it('falls back to "me" for a bare /me path with no sub-resource', () => {
    expect(deriveEntityType('/api/me')).toBe('me');
  });

  it('falls back to "unknown" for a bare /api path', () => {
    expect(deriveEntityType('/api')).toBe('unknown');
  });
});
