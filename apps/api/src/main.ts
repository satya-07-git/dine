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

  // Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );

  // Global Route Prefix for API endpoints (excluding health endpoints)
  app.setGlobalPrefix(apiPrefix, {
    exclude: ['health/live', 'health/ready', 'health'],
  });

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
  logger.log(`Dine API modular monolith running on port ${port} with prefix ${apiPrefix}`, 'Bootstrap');
  logger.log(`OpenAPI documentation available at http://localhost:${port}/docs`, 'Bootstrap');

  return app;
}

if (require.main === module) {
  bootstrap().catch((err) => {
    console.error('Fatal bootstrap error:', err);
    process.exit(1);
  });
}
