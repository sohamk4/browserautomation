import { Controller, Delete, Get, Param } from '@nestjs/common';
import { WorkflowRepository } from './workflow.repository';

@Controller('workflows')
export class WorkflowController {
  constructor(private readonly repo: WorkflowRepository) {}

  @Get()
  async findAll() {
    return this.repo.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.repo.findById(id);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.repo.delete(id);
    return { deleted: true, id };
  }
}
