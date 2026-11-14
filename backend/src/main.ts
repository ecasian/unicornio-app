import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module.js';
import { runWithAuditRequestContext } from './modules/auth/audit-transaction.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const express = app.getHttpAdapter().getInstance();
  express.set('trust proxy', 1);
  express.use((request: Request, response: Response, next: NextFunction) => {
    const requestId = randomUUID();
    (request as Request & { auditRequestId?: string }).auditRequestId = requestId;
    response.setHeader('X-Request-Id', requestId);
    const route = new URL(request.originalUrl, 'http://local').pathname;
    runWithAuditRequestContext({ requestId, route, method: request.method.toUpperCase() }, next);
  });
  const config = app.get(ConfigService);
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Unicornio API')
    .setDescription('API técnica del proyecto Unicornio')
    .setVersion('0.1.0')
    .build();
  if (config.get<string>('NODE_ENV') !== 'production') {
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = Number(config.get<string>('PORT') ?? config.get<string>('BACKEND_PORT') ?? 3000);
  const host = config.get<string>('BACKEND_HOST')?.trim() || '0.0.0.0';
  await app.listen(port, host);
  if (process.env.AUTH_SMOKE_CONTROLLED === '1' && typeof process.send === 'function') {
    const address = app.getHttpServer().address();
    if (address && typeof address === 'object') {
      process.send({ type: 'auth-smoke-ready', host: address.address, port: address.port });
    }
  }
}

void bootstrap();
