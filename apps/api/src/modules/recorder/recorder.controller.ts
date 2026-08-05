import { Body, Controller, Optional, Post } from '@nestjs/common';
import { RecorderService } from './recorder.service';
import { WorkflowRepository } from '../workflow/workflow.repository';
import { WorkflowQueueService } from '../workflow/workflow.queue.service';
import { logger } from '../../shared/logger';
import { BrowserService } from '../browser/browser.service';

@Controller('recorder')
export class RecorderController {
  constructor(
    private readonly recorderService: RecorderService,
    private readonly workflowRepository: WorkflowRepository,
    private browserService: BrowserService, // 👈 inject
    @Optional() private readonly queue?: WorkflowQueueService,
  ) {}

  @Post('start')
  async start() {
    return this.recorderService.startRecording();
  }

  @Post('pause')
  async pause() {
    await this.recorderService.pause();
    return { status: 'paused' };
  }

  @Post('resume')
  async resume() {
    await this.recorderService.resume();
    return { status: 'recording' };
  }

  @Post('stop')
  async stop(@Body() body: { save?: boolean }) {
    // Stop recording – this returns the workflow (with steps and variables)
    const workflow = await this.recorderService.stopRecording();

    // Optionally save to database
    let result = workflow;
    if (body?.save !== false) {
      const saved = await this.workflowRepository.save(workflow);
      logger.info('Workflow saved: %s', (saved as { id: string }).id);
      // If you have a queue, enqueue the workflow ID
      // await this.queue.enqueue(saved.id);
      result = saved;
    }

    // ✅ Close the browser
    await this.browserService.close();

    return result;
  }
  @Post('command')
  async command(@Body() body: { action: string; ms?: number }) {
    const step = await this.recorderService.command(body.action, { ms: body.ms });
    return { recorded: Boolean(step), step };
  }
}
