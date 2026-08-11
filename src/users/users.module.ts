import { Module } from '@nestjs/common';
import { AliclikModule } from '../aliclik/aliclik.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AliclikModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
