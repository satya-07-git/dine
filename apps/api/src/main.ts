import * as path from 'path';
import * as fs from 'fs';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ConfigService } from './common/config/config.service';
import { ProblemDetailsFilter } from './common/errors/problem-details.filter';
import { StructuredLoggerService } from './common/logging/logger.service';

export async function bootstrap() {
  const logger = new StructuredLoggerService();
  const app = await NestFactory.create(AppModule, {
    logger,
    rawBody: true,
  });

  const configService = app.get(ConfigService);
  const port = configService.get('PORT');
  const apiPrefix = configService.get('API_PREFIX');

  // Global Exception Filter for RFC 7807 Problem Details
  app.useGlobalFilters(new ProblemDetailsFilter());

  // Global Validation Pipe with strict whitelist & forbidden properties (EPIC-026 / EPIC-027)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );

  // Deprecation Middleware & Anti-Duplicate Prefix Guard (EPIC-027 Tasks T01, T02)
  app.use((req: any, res: any, next: any) => {
    const rawUrl = req.url || '';
    const urlPath = rawUrl.split('?')[0];

    // Prohibit and reject duplicate /v1/api/v1 or /api/v1/api/v1 prefixes with 404
    if (urlPath.startsWith('/v1/api/v1') || urlPath.startsWith('/api/v1/api/v1')) {
      return res.status(404).json({
        type: 'https://dine.api.test/errors/not-found',
        title: 'Not Found',
        status: 404,
        detail: `Duplicate route prefix is prohibited: ${urlPath}`,
        code: 'ROUTE_NOT_FOUND',
      });
    }

    // Check if request is targeting legacy /v1/* alias or legacy unprefixed alias
    const isLegacyV1 = urlPath.startsWith('/v1/');
    const isLegacyRoot =
      urlPath.startsWith('/booking-holds') ||
      urlPath.startsWith('/owner/');

    if (isLegacyV1 || isLegacyRoot) {
      res.setHeader('Deprecation', 'true');
      res.setHeader('Sunset', 'Wed, 10 Nov 2027 00:00:00 GMT');
      res.setHeader(
        'Warning',
        '299 - "This endpoint alias is deprecated. Please migrate to canonical /api/v1 route."'
      );

      let canonicalPath = urlPath;
      if (isLegacyV1) {
        canonicalPath = urlPath.replace(/^\/v1\//, '/api/v1/');
      } else {
        canonicalPath = `/api/v1${urlPath}`;
      }

      // Map specific legacy aliases to canonical endpoints
      canonicalPath = canonicalPath
        .replace(/\/booking-holds(\/|$)/, '/holds$1')
        .replace(/\/bookings\/free(\/|$)/, '/reservations/free$1')
        .replace(/\/recommendations(\/|$)/, '/recommendations/tables$1')
        .replace(/\/owner\/reservations(\/|$)/, '/restaurant-ops/reservations$1')
        .replace(/\/owner\/check-in(\/|$)/, '/restaurant-ops/bookings/check-in$1')
        .replace(/\/owner\/seat(\/|$)/, '/restaurant-ops/bookings/seat$1')
        .replace(/\/owner\/complete(\/|$)/, '/restaurant-ops/bookings/complete$1')
        .replace(/\/owner\/blocks(\/|$)/, '/restaurant-ops/table-blocks$1');

      res.setHeader('Link', `<${canonicalPath}>; rel="canonical"`);
    }

    next();
  });

  // Global Route Prefix for API endpoints if custom prefix configured
  if (apiPrefix && apiPrefix !== '/v1' && apiPrefix !== '/api/v1') {
    app.setGlobalPrefix(apiPrefix, {
      exclude: ['health/live', 'health/ready', 'health'],
    });
  }

  // Enable CORS with restricted configured origins
  const corsOriginsConfig = configService.get('CORS_ORIGINS');
  const allowedOrigins = corsOriginsConfig
    ? corsOriginsConfig.split(',').map((o) => o.trim())
    : ['http://localhost:3000', 'http://localhost:5173'];

  app.enableCors({
    origin: allowedOrigins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Serve the Delivery & Architecture Dashboard and Assets
  const projectRoot = path.resolve(__dirname, '../../..');
  const dashboardPath = path.join(projectRoot, 'project-delivery-kit', 'tasks', 'dashboard.html');
  const httpAdapter = app.getHttpAdapter();

  httpAdapter.get('/dashboard', (req: any, res: any) => {
    if (fs.existsSync(dashboardPath)) {
      res.sendFile(dashboardPath);
    } else {
      res.redirect('/docs');
    }
  });

  httpAdapter.get('/', (req: any, res: any) => {
    res.redirect('/docs');
  });

  const expressApp = app.getHttpAdapter().getInstance();
  if (expressApp && typeof expressApp.use === 'function') {
    const assetsDir = path.join(projectRoot, 'assets');
    const taskAssetsDir = path.join(projectRoot, 'project-delivery-kit', 'tasks', 'assets');
    const expressStatic = require('express').static;
    if (fs.existsSync(assetsDir)) {
      expressApp.use('/assets', expressStatic(assetsDir));
    }
    if (fs.existsSync(taskAssetsDir)) {
      expressApp.use('/project-delivery-kit/tasks/assets', expressStatic(taskAssetsDir));
    }
  }

  // OpenAPI / Swagger Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Dine Backend API')
    .setDescription('Dine Modular Monolith REST API contracts and schema specification')
    .setVersion('1.0.0')
    .addBearerAuth()
    .addTag('Health & Readiness', 'Application liveness and dependency status')
    .addTag('Identity & Access', 'Customer and staff profiles')
    .addTag('Restaurants', 'Restaurant details, hours, and policies')
    .addTag('Discovery', 'Geospatial and cuisine restaurant discovery')
    .addTag('Floor Plans', 'Floor plan versions and table geometry')
    .addTag('Availability', 'Interval calculations and table availability')
    .addTag('Reservations', 'Atomic holds, bookings, and lifecycle')
    .addTag('Payments', 'Razorpay checkout orders and webhook inbox')
    .addTag('Waitlist', 'FIFO queue and priority exclusive offers')
    .addTag('Booking Status', 'Guarded transitions and state history')
    .addTag('Owner Operations', 'Staff walk-ins and table management')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  app.enableShutdownHooks();

  const shutdownTimeoutMs = configService.get('SHUTDOWN_TIMEOUT_MS');
  const handleShutdownSignal = async (signal: string) => {
    logger.log(
      `Received ${signal}. Draining connections and initiating graceful shutdown (budget: ${shutdownTimeoutMs}ms)...`,
      'Shutdown'
    );
    const timer = setTimeout(() => {
      logger.error(
        `Graceful shutdown timed out after ${shutdownTimeoutMs}ms. Forcing process exit.`,
        undefined,
        'Shutdown'
      );
      process.exit(1);
    }, shutdownTimeoutMs);
    timer.unref();

    try {
      await app.close();
      clearTimeout(timer);
      logger.log('Graceful shutdown completed successfully.', 'Shutdown');
      process.exit(0);
    } catch (err: any) {
      clearTimeout(timer);
      logger.error(`Error during graceful shutdown: ${err.message}`, err.stack, 'Shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => handleShutdownSignal('SIGTERM'));
  process.on('SIGINT', () => handleShutdownSignal('SIGINT'));

  await app.listen(port);
  logger.log(`Dine API modular monolith running on port ${port}`, 'Bootstrap');
  logger.log(`OpenAPI documentation available at http://localhost:${port}/docs`, 'Bootstrap');

  return app;
}

if (require.main === module) {
  bootstrap().catch((err) => {
    console.error('Fatal bootstrap error:', err);
    process.exit(1);
  });
}
