import { Module } from '@nestjs/common';
import { AliclikClient } from './aliclik.client';
import { AliclikService } from './aliclik.service';
import { UbigeoMatcher } from './ubigeo-matcher';

@Module({
  providers: [AliclikClient, AliclikService, UbigeoMatcher],
  exports: [AliclikClient, AliclikService, UbigeoMatcher],
})
export class AliclikModule {}
