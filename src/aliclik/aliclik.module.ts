import { Module } from '@nestjs/common';
import { AliclikClient } from './aliclik.client';
import { AliclikService } from './aliclik.service';

@Module({
  providers: [AliclikClient, AliclikService],
  exports: [AliclikService],
})
export class AliclikModule {}
