import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ValidationExceptionFilter } from './common/filters/validation-exception.filter';

const requestLogger = new Logger('HTTP');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.use(helmet());

  app.use((req: Request, res: Response, next: NextFunction) => {
    const { method, originalUrl, headers } = req;
    const start = Date.now();

    requestLogger.log(`→ ${method} ${originalUrl} | origin: ${headers.origin ?? '-'} | ip: ${req.ip}${method === 'PATCH' || method === 'POST' ? ` | body: ${JSON.stringify(req.body)}` : ''}`);

    res.on('finish', () => {
      const ms = Date.now() - start;
      requestLogger.log(`← ${method} ${originalUrl} | ${res.statusCode} | ${ms}ms`);
    });

    next();
  });

  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:4000',
      'http://localhost:5173',
      'https://aliclik.app',
      'https://api.aliclik-dev.com',
      'https://tander.web.app',
      'https://tanders.app',
    ],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new ValidationExceptionFilter());
  const config = new DocumentBuilder()
    .setTitle('Tander API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
