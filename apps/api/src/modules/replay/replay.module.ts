import { Module } from '@nestjs/common';
import { ReplayService } from './replay.service';
import { ReplayController } from './replay.controller';
import { BrowserModule } from '../browser/browser.module';
import { WorkflowModule } from '../workflow/workflow.module';

@Module({
  imports: [BrowserModule, WorkflowModule],
  providers: [ReplayService],
  controllers: [ReplayController],
})
export class ReplayModule {}