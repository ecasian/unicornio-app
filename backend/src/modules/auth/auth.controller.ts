import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Put, Query, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { CurrentUser, Public, RequirePermission } from './auth.security.js';
import type { AuthenticatedRequest, AuthenticatedUser } from './auth.security.js';
import { CreateUserDto, LoginDto, ResetPasswordDto, SetActiveDto, SetRolesDto } from './auth.dto.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Get('csrf')
  csrf(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return this.auth.csrf(request, response);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() body: LoginDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    return this.auth.login(body.email, body.password, request, response);
  }

  @RequirePermission('auth:session')
  @Get('session')
  current(@Req() request: AuthenticatedRequest) {
    return this.auth.current(request);
  }

  @RequirePermission('auth:session')
  @Post('logout')
  @HttpCode(200)
  logout(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: Response) {
    return this.auth.logout(request, response);
  }

  @RequirePermission('usuarios:manage')
  @Get('users')
  users() { return this.auth.listUsers(); }

  @RequirePermission('usuarios:manage')
  @Post('users')
  createUser(@Body() body: CreateUserDto, @CurrentUser() user: AuthenticatedUser, @Req() request: AuthenticatedRequest) {
    return this.auth.createUser(body, user.id, request.auditRequestId);
  }

  @RequirePermission('usuarios:manage')
  @Patch('users/:id/active')
  setActive(@Param('id', ParseIntPipe) id: number, @Body() body: SetActiveDto, @CurrentUser() user: AuthenticatedUser, @Req() request: AuthenticatedRequest) {
    return this.auth.setUserActive(id, body.activo, user.id, request.auditRequestId);
  }

  @RequirePermission('usuarios:manage')
  @Put('users/:id/roles')
  setRoles(@Param('id', ParseIntPipe) id: number, @Body() body: SetRolesDto, @CurrentUser() user: AuthenticatedUser, @Req() request: AuthenticatedRequest) {
    return this.auth.setUserRoles(id, body.roles, user.id, request.auditRequestId);
  }

  @RequirePermission('usuarios:manage')
  @Patch('users/:id/password')
  resetPassword(@Param('id', ParseIntPipe) id: number, @Body() body: ResetPasswordDto, @CurrentUser() user: AuthenticatedUser, @Req() request: AuthenticatedRequest) {
    return this.auth.resetPassword(id, body.password, user.id, request.auditRequestId);
  }

  @RequirePermission('usuarios:manage')
  @Get('roles')
  roles() { return this.auth.listRoles(); }

  @RequirePermission('auditoria:read')
  @Get('audit')
  audit(@Query('take') take?: string) {
    const count = take && /^\d+$/.test(take) ? Number(take) : 100;
    return this.auth.listAudit(count);
  }
}
