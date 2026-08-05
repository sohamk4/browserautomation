import { Controller, Post, Body, Param } from '@nestjs/common';
import { ReplayService } from './replay.service';

@Controller('replay')
export class ReplayController {
  constructor(private replayService: ReplayService) {}

  @Post(':workflowId')
  async replay(@Param('workflowId') workflowId: string, @Body() body: { variables?: Record<string, string> }) {
    return this.replayService.replay(workflowId, {
      variables: body.variables,
      headless: false, // set to true for background execution
    });
  }
}