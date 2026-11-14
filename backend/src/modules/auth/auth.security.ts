import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export const PUBLIC_ROUTE = 'public_route';
export const REQUIRED_PERMISSION = 'required_permission';
export const Public = () => SetMetadata(PUBLIC_ROUTE, true);
export const RequirePermission = (permission: string) => SetMetadata(REQUIRED_PERMISSION, permission);

export type AuthenticatedUser = {
  id: number;
  email: string;
  nombre: string;
  repartidorId: number | null;
  roles: string[];
  permissions: string[];
};

export type AuthenticatedRequest = Request & { authUser?: AuthenticatedUser; sessionId?: string; auditRequestId?: string };

export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) =>
  context.switchToHttp().getRequest<AuthenticatedRequest>().authUser,
);
