import { Module } from '@nestjs/common';
import { BrowserModule } from './modules/browser/browser.module';
import { RecorderModule } from './modules/recorder/recorder.module';
import { WorkflowModule } from './modules/workflow/workflow.module';
import { WorkflowQueueModule } from './modules/workflow/workflow.queue.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { ReplayModule } from './modules/replay/replay.module';

const queueEnabled = process.env.BULLMQ_ENABLED === 'true';

@Module({
  imports: [
    BrowserModule,
    RecorderModule,
    WorkflowModule,
    PrismaModule,
    ReplayModule,
    ...(queueEnabled ? [WorkflowQueueModule] : []),
  ],
})
export class AppModule {}
