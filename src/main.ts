import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';

const requestLogger = new Logger('HTTP');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use((req: Request, res: Response, next: NextFunction) => {
    const { method, originalUrl, headers } = req;
    const start = Date.now();

    requestLogger.log(`→ ${method} ${originalUrl} | origin: ${headers.origin ?? '-'} | ip: ${req.ip}`);

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
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
