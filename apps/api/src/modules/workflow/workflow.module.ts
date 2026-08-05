import { Module } from '@nestjs/common';
import { WorkflowRepository } from './workflow.repository';
import { WorkflowController } from './workflow.controller';

@Module({
  providers: [WorkflowRepository],
  controllers: [WorkflowController],
  exports: [WorkflowRepository],
})
export class WorkflowModule {}
