import { Module } from '@nestjs/common';
import { RecorderService } from './recorder.service';
import { RecorderGateway } from './recorder.gateway';
import { RecorderController } from './recorder.controller';
import { BrowserModule } from '../browser/browser.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { WorkflowQueueModule } from '../workflow/workflow.queue.module';

const queueEnabled = process.env.BULLMQ_ENABLED === 'true';

@Module({
  imports: [
    BrowserModule,
    WorkflowModule,
    ...(queueEnabled ? [WorkflowQueueModule] : []),
  ],
  providers: [RecorderService, RecorderGateway],
  controllers: [RecorderController],
  exports: [RecorderService],
})
export class RecorderModule {}
