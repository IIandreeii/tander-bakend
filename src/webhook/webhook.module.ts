import { Logger, MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { WebhookController } from './webhook.controller';

const webhookLogger = new Logger('WebhookIncoming');

@Module({
  imports: [OrdersModule],
  controllers: [WebhookController],
})
export class WebhookModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply((req: import('express').Request, _res: import('express').Response, next: import('express').NextFunction) => {
        let body = '';
        req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
        req.on('end', () => {
          webhookLogger.log(`→ ${req.method} ${req.originalUrl} | headers: ${JSON.stringify(req.headers)} | body: ${body || '(empty)'}`);
        });
        next();
      })
      .forRoutes({ path: 'webhook/*path', method: RequestMethod.ALL });
  }
}
