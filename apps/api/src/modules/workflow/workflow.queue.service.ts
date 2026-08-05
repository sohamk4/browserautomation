import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class WorkflowQueueService {
  constructor(@InjectQueue('workflow') private readonly queue: Queue) {}

  /** Enqueue a background "process" job for a saved workflow. */
  async enqueue(workflowId: string): Promise<void> {
    await this.queue.add('process', { workflowId }, { attempts: 3 });
  }
}
