import { SelectorSet, Step, Variable, Workflow } from '../../domain/action.js';
import { BrowserEvent } from './browser.port.js';

export interface IRecorderService {
  startRecording(): Promise<{ sessionId: string }>;
  stopRecording(): Promise<Workflow>;
  pause(): Promise<void>;
  resume(): Promise<void>;
}

export interface IActionMapper {
  mapEventToStep(event: BrowserEvent): Step | null;
}

export interface ISelectorGenerator {
  generateForElement(element: unknown): SelectorSet;
}

export interface IVariableDetector {
  detect(value: string, inputType?: string): { isVariable: boolean; type?: Variable['type']; example?: string };
}
