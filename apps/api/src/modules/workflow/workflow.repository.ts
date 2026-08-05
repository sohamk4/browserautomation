import { Injectable } from '@nestjs/common';
import { ActionType, VariableType } from '@prisma/client';
import { Workflow } from '@repo/core';
import { logger } from '../../shared/logger';
import { prisma } from '@repo/db';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Prisma adapter implementing the Workflow repository port. Maps the domain
 * `Workflow` (with nested steps + variables) onto the relational schema and
 * persists it in a single transactional create.
 */
@Injectable()
export class WorkflowRepository {
  constructor(private prisma: PrismaService) {}
  async save(workflow: Workflow) {
    const data = {
      name: workflow.name,
      description: workflow.description,
      status: 'DRAFT' as const,
      variables: workflow.variables?.length
        ? {
            create: workflow.variables.map((v) => ({
              name: v.name,
              exampleValue: v.value,
              type: v.type.toUpperCase() as VariableType,
              description: v.description,
            })),
          }
        : undefined,
      steps: {
        create: workflow.steps.map((step, index) => ({
          order: index,
          action: step.action.toUpperCase() as ActionType,
          payload: step.payload,
          selectors: step.selectors,
          url: step.url,
          title: step.title,
          tabId: step.tabId,
          timestamp: step.timestamp,
          screenshotBefore: step.screenshotBefore,
          screenshotAfter: step.screenshotAfter,
        })),
      },
    };
    const saved = await this.prisma.workflow.create({
      data,
      include: { variables: true, steps: { orderBy: { order: 'asc' } } },
    });
    logger.info('Persisted workflow %s with %d steps', saved.id, workflow.steps.length);
    return saved as unknown as Workflow;
  }

  async findById(id: string) {
    const found = await prisma.workflow.findUnique({
      where: { id },
      include: { variables: true, steps: { orderBy: { order: 'asc' } } },
    });
    return (found as unknown as Workflow) ?? null;
  }

  async findAll() {
    const list = await prisma.workflow.findMany({
      orderBy: { createdAt: 'desc' },
      include: { variables: true, _count: { select: { steps: true } } },
    });
    return list as unknown as Workflow[];
  }

  async delete(id: string) {
    await prisma.workflow.delete({ where: { id } });
  }
}
