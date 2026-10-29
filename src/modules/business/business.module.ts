import { Global, Module } from '@nestjs/common';
import { BusinessController } from './business.controller.js';
import { BusinessService } from './business.service.js';

/** Global because stock rules, "today" and emails all read the business settings. */
@Global()
@Module({
  controllers: [BusinessController],
  providers: [BusinessService],
  exports: [BusinessService],
})
export class BusinessModule {}
