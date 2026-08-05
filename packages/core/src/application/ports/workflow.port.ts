import { Workflow, Step, Variable } from '../../domain/action.js';

export interface IWorkflowRepository {
  save(workflow: Workflow): Promise<Workflow>;
  findById(id: string): Promise<Workflow | null>;
  findAll(): Promise<Workflow[]>;
  delete(id: string): Promise<void>;
}

export interface IStepRepository {
  addStep(workflowId: string, step: Step): Promise<Step>;
  updateStep(stepId: string, step: Step): Promise<Step>;
}

export interface IVariableRepository {
  addVariable(workflowId: string, variable: Variable): Promise<Variable>;
  updateVariable(variableId: string, variable: Variable): Promise<Variable>;
}
