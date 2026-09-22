import { Module } from '@nestjs/common';
import { RepartidoresController } from './repartidores.controller.js';
import { RepartidoresService } from './repartidores.service.js';

@Module({
  controllers: [RepartidoresController],
  providers: [RepartidoresService],
})
export class RepartidoresModule {}
