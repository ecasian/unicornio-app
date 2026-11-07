import { Module } from '@nestjs/common';
import { YogurtBaseController } from './yogurt-base.controller.js';
import { YogurtBaseService } from './yogurt-base.service.js';

@Module({ controllers: [YogurtBaseController], providers: [YogurtBaseService] })
export class YogurtBaseModule {}
