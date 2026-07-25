import { Module } from '@nestjs/common';
import { CobranaClient } from './cobrana.client';
import { CobranaService } from './cobrana.service';

@Module({
  providers: [CobranaClient, CobranaService],
  exports: [CobranaService],
})
export class CobranaModule {}
