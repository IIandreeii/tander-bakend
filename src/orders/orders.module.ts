import { Module } from '@nestjs/common';
import { AliclikModule } from '../aliclik/aliclik.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [AliclikModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}
