import { Injectable, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

/**
 * Background worker for the `workflow` queue. Currently a stub — later this is
 * where AI-driven selector repair, validation, and replay would run.
 */
@Processor('workflow')
@Injectable()
export class WorkflowProcessor extends WorkerHost {
  private readonly logger = new Logger(WorkflowProcessor.name);

  async process(job: Job<{ workflowId: string }>): Promise<{ ok: boolean }> {
    this.logger.log('Processing workflow %s (job %s)', job.data.workflowId, job.id);
    return { ok: true };
  }
}
