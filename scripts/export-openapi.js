#!/usr/bin/env node
/**
 * Export OpenAPI / Swagger Specification from NestJS application metadata.
 */

const fs = require('fs');
const path = require('path');
const { NestFactory } = require('@nestjs/core');
const { SwaggerModule, DocumentBuilder } = require('@nestjs/swagger');

// Mock environment for OpenAPI doc extraction without live DB requirement
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://mock:mock@localhost:5432/dine_test';
process.env.SUPABASE_JWT_SECRET = 'mock-secret-for-openapi-generation-32chars';

async function generateOpenApiSpec() {
  const { AppModule } = require('../apps/api/dist/app.module');
  const app = await NestFactory.create(AppModule, { logger: false });

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
    .addTag('Notifications & Realtime', 'Transactional outbox worker, topic authorization, and status delivery')
    .addTag('Dining Experiences & Packages', 'Restaurant packages, tasting menus, and celebration options')
    .addTag('Customer Engagement', 'Customer favorites, verified dining reviews, and dining preferences')
    .addTag('Audit, Support & Privacy', 'Audit logs, support interventions, incident traces, and privacy controls')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  const outputPath = path.resolve(__dirname, '../docs/architecture/openapi.json');
  fs.writeFileSync(outputPath, JSON.stringify(document, null, 2), 'utf8');

  console.log(`[OpenAPI] Successfully generated OpenAPI specification at ${outputPath}`);
  console.log(`[OpenAPI] Paths documented: ${Object.keys(document.paths).length}`);

  await app.close();
}

if (require.main === module) {
  generateOpenApiSpec().catch((err) => {
    console.error('[OpenAPI] Failed to generate specification:', err);
    process.exit(1);
  });
}

module.exports = { generateOpenApiSpec };
