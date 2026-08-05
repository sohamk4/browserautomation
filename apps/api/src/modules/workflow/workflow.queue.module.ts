import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WorkflowQueueService } from './workflow.queue.service';
import { WorkflowProcessor } from './workflow.processor';

/**
 * BullMQ module for background workflow processing (selector-repair,
 * validation, replay). Opt-in: the queue, worker, and Redis connection are
 * only created when `BULLMQ_ENABLED=true` is set, so the app boots fine
 * without Redis in local/dev. Provide `REDIS_URL` to override the default.
 */
const enabled = process.env.BULLMQ_ENABLED === 'true';

@Module({
  imports: enabled
    ? [
        BullModule.forRoot({
          connection: { url: process.env.REDIS_URL ?? 'redis://localhost:6379' },
        }),
        BullModule.registerQueue({ name: 'workflow' }),
      ]
    : [],
  providers: enabled ? [WorkflowQueueService, WorkflowProcessor] : [],
  exports: enabled ? [WorkflowQueueService] : [],
})
export class WorkflowQueueModule {}
