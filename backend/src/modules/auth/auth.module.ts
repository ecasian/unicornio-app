import { Global, Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { AuditInterceptor } from './audit.interceptor.js';
import { AuthSessionGuard, CsrfGuard, PermissionsGuard, RepartidorScopeGuard } from './auth.guards.js';

@Global()
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: AuthSessionGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: RepartidorScopeGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
  exports: [AuthService],
})
export class AuthModule {}
