import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { v4 as uuid } from 'uuid';
import { BrowserEvent, Step, Variable, Workflow, ActionType } from '@repo/core';
import { BrowserService } from '../browser/browser.service';
import { RecorderGateway } from './recorder.gateway';
import { logger } from '../../shared/logger';

type RecordingStatus = 'idle' | 'recording' | 'paused';

/**
 * Application service implementing the Recorder port. It listens to
 * BrowserEvents, maps them to Steps (via the action mapper), detects
 * variables, and broadcasts each Step over the WebSocket gateway.
 *
 * Persistence is intentionally kept out of this service: the controller
 * (presentation layer) asks `stopRecording()` for the in-memory Workflow and
 * saves it through the Workflow repository, preserving Clean Architecture.
 */
@Injectable()
export class RecorderService {
  private status: RecordingStatus = 'idle';
  private steps: Step[] = [];
  private variables: Variable[] = [];
  private sessionId: string | null = null;
  private currentSessionId: string | null = null;
  private lastStepTime = 0;
  private lastStepAction: ActionType | null = null;
  private lastStepPayloadStr: string | null = null;
  private isLooping = false;
  private loopContainerSelector: any = null;
  private loopSteps: Step[] = [];


  constructor(
    private readonly browserService: BrowserService,
    @Inject(forwardRef(() => RecorderGateway))
    private readonly gateway: RecorderGateway,
  ) {}

  async startRecording(): Promise<{ sessionId: string }> {
    if (this.status === 'recording') return { sessionId: this.sessionId! };
    this.steps = [];
    this.variables = [];
    this.sessionId = uuid();
    this.status = 'recording';

    await this.browserService.launch(
      false,                       // headless
      this.sessionId,                   // session ID
      './linkedin_state.json'     // 👈 storage state file
    );
    this.browserService.onAction((event) => this.handleEvent(event));
    this.gateway.broadcastStatus('recording');
    logger.info('Recording started: session=%s', this.sessionId);
    this.currentSessionId = this.sessionId;
    return { sessionId: this.sessionId };
  }

  async pause(): Promise<void> {
    this.status = 'paused';
    this.gateway.broadcastStatus('paused');
  }

  async resume(): Promise<void> {
    this.status = 'recording';
    this.gateway.broadcastStatus('recording');
  }

  async stopRecording(): Promise<Workflow> {
    this.status = 'idle';
    const workflow: Workflow = {
      name: `Recording ${new Date().toISOString()}`,
      description: `Captured by session ${this.sessionId ?? 'unknown'}`,
      variables: this.variables.length ? this.variables : undefined,
      steps: this.steps,
    };
    this.gateway.broadcastStatus('stopped');
    logger.info('Recording stopped: %d steps, %d variables', this.steps.length, this.variables.length);
    return workflow;
  }
  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }
  cssSelector(el: Element): string {
    if ((el as HTMLElement).id) return `#${(el as HTMLElement).id}`;
    const parts: string[] = [];
    let node: Element | null = el;
    while (node && node.nodeType === 1 && parts.length < 8) {
      let sel = node.nodeName.toLowerCase();
      if ((node as HTMLElement).id) {
        sel = `#${(node as HTMLElement).id}`;
        parts.unshift(sel);
        break;
      }
      const parent: Element | null = node.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (c): c is Element => c.nodeName === node!.nodeName,
        );
        if (siblings.length > 1) {
          sel += `:nth-of-type(${siblings.indexOf(node as Element) + 1})`;
        }
      }
      parts.unshift(sel);
      node = parent;
    }
    return parts.join(' > ');
  }
  xpathFor(el: Element): string {
    if ((el as HTMLElement).id) return `//*[@id="${(el as HTMLElement).id}"]`;
    const parts: string[] = [];
    let node: Element | null = el;
    while (node && node.nodeType === 1) {
      const parent: Element | null = node.parentElement;
      let idx = 1;
      if (parent) {
        const sibs = Array.from(parent.children).filter(
          (c): c is Element => c.nodeName === node!.nodeName,
        );
        idx = sibs.indexOf(node as Element) + 1;
      }
      parts.unshift(`${node.nodeName.toLowerCase()}${parent ? `[${idx}]` : ''}`);
      if (node === document.body) {
        parts.unshift('body');
        break;
      }
      node = parent;
    }
    return '/' + parts.join('/');
  }

  computeSelectorsForElement(el: any): any {
      const s: Record<string, string> = {};
      s.css = this.cssSelector(el);
      s.xpath = this.xpathFor(el);
      s.domPath = this.cssSelector(el);
      const id = (el as HTMLElement).id;
      if (id) s.id = id;
      const cls = typeof el.className === 'string' ? el.className.trim() : '';
      if (cls) s.className = cls;
      const role = el.getAttribute('role');
      if (role) s.role = role;
      const name = (el as HTMLInputElement).name;
      if (name) s.name = name;
      const ph = el.getAttribute('placeholder');
      if (ph) s.placeholder = ph;
      const tid = el.getAttribute('data-testid') || el.getAttribute('data-test-id');
      if (tid) s.dataTestId = tid;
      const text = (el.textContent || '').trim().slice(0, 100);
      if (text) s.text = text;
      if ((el as HTMLInputElement).id) {
        const label = document.querySelector(
          `label[for="${(el as HTMLInputElement).id}"]`,
        );
        if (label && label.textContent) s.label = label.textContent.trim();
      }
      return s;
  }


  private startLoop(selectors: any): void {
    if (this.isLooping) return;
    this.isLooping = true;
    this.loopContainerSelector = selectors;
    this.loopSteps = [];
    logger.info('Loop started with container selectors: %O', selectors);
  }
  
  private endLoop(): void {
    if (!this.isLooping) return;
    const loopStep: Step = {
      action: 'loop',
      payload: {
        containerSelector: this.loopContainerSelector,
        steps: this.loopSteps,
      },
      url: this.browserService.activeUrl(),
      timestamp: new Date(),
    };
    this.steps.push(loopStep);
    this.gateway.broadcastStep(loopStep);
    logger.info('Loop saved with %d inner steps', this.loopSteps.length);
    this.isLooping = false;
    this.loopContainerSelector = null;
    this.loopSteps = [];
  }  
    /**
   * Record an explicit, command-driven action (not a raw DOM event):
   * back / forward / refresh / wait / screenshot / extract / upload-trigger.
   * These are fired from the UI control buttons while recording.
   */
  async command(action: string, payload?: { ms?: number }): Promise<Step | null> {
    if (this.status !== 'recording') return null;

    let step: Step | null = null;
    switch (action) {
      case 'back':
      case 'forward':
      case 'refresh': {
        this.browserService.suppressNextNavigation();
        if (action === 'back') await this.browserService.goBack();
        else if (action === 'forward') await this.browserService.goForward();
        else await this.browserService.reload();
        step = this.makeCommandStep(action as ActionType, {
          url: this.browserService.activeUrl(),
        });
        break;
      }
      case 'wait': {
        const ms = payload?.ms ?? 1000;
        await this.browserService.waitForTimeout(ms);
        step = this.makeCommandStep('wait' as ActionType, { ms });
        break;
      }
      case 'screenshot': {
        const dataUrl = await this.browserService.screenshot();
        step = this.makeCommandStep('screenshot' as ActionType, { dataUrl });
        break;
      }
      case 'extract': {
        const text = await this.browserService.extractSelection();
        step = this.makeCommandStep('extract' as ActionType, { value: text });
        break;
      }
      default:
        return null;
    }

    if (step) {
      this.steps.push(step);
      this.gateway.broadcastStep(step);
    }
    return step;
  }

  private makeCommandStep(action: ActionType, extra: Record<string, unknown>): Step {
    return {
      action,
      payload: extra,
      url: extra.url as string | undefined,
      tabId: undefined,
      timestamp: new Date(),
    };
  }

  getStatus(): RecordingStatus {
    return this.status;
  }

  private handleEvent(event: BrowserEvent): void {
    if (this.status !== 'recording') return;
  
    // ---- Skip events from extraction popup ----
    if (event.selectors) {
      const sel = event.selectors;
      // If any selector points to the popup or its inputs, skip
      if (sel.id === 'extract-field' ||
          sel.id === 'extract-attribute' ||
          sel.id === 'extract-custom' ||
          sel.id === 'extract-all' ||
          sel.id === 'extraction-popup' ||
          sel.id === 'extract-cancel' ||
          sel.id === 'extract-save' ||
          (sel.css && sel.css.includes('#extraction-popup')) ||
          (sel.domPath && sel.domPath.includes('#extraction-popup'))) {
        return;
      }
    }
  
    if (event.type === 'loopStart') {
      this.startLoop(event.selectors);
      return;
    }
    if (event.type === 'loopEnd') {
      this.endLoop();
      return;
    }
  
    // ---- Skip unwanted actions ----
    const skipActions = ['hover', 'keydown', 'keyup', 'mouseover', 'mouseout'];
    if (event.action && skipActions.includes(event.action)) {
      return;
    }
  
    const step = this.mapEventToStep(event);
    if (!step) return;
  
    // ---- Deduplicate ----
    const now = Date.now();
    const payloadStr = JSON.stringify(step.payload);
    if (
      this.lastStepAction === step.action &&
      this.lastStepPayloadStr === payloadStr &&
      (now - this.lastStepTime) < 500
    ) {
      return;
    }
    this.lastStepTime = now;
    this.lastStepAction = step.action;
    this.lastStepPayloadStr = payloadStr;
  
    // ---- Route step ----
    if (this.isLooping) {
      this.loopSteps.push(step);
      this.gateway.broadcastStep({ ...step, loop: true });
    } else {
      this.steps.push(step);
      this.gateway.broadcastStep(step);
      this.detectVariableForStep(step);
    }
  }  
  /** Action mapper: BrowserEvent -> Step | null. */
  private mapEventToStep(event: BrowserEvent): Step | null {
    const action = event.action;
    if (!action) return null;
  
    const base: Step = {
      action,
      payload: {},
      selectors: event.selectors,
      url: event.url,
      title: event.title,
      tabId: event.tabId,
      timestamp: new Date(),
    };
  
    switch (action) {
      case 'click':
      case 'dblclick':
      case 'rightclick':
      case 'hover':
      case 'drag':
      case 'drop':
        base.payload = { selectors: event.selectors, boundingBox: event.boundingBox };
        break;
      case 'type':
        base.payload = {
          selectors: event.selectors,
          value: event.value ?? '',
          isVariable: false,
          inputType: event.inputType,
        };
        break;
      case 'select':
      case 'check':
      case 'uncheck':
        base.payload = { selectors: event.selectors, value: event.value };
        break;
      case 'keydown':
      case 'keyup':
        base.payload = { key: event.key, selectors: event.selectors };
        break;
      case 'scroll':
        base.payload = { x: (event.meta as any)?.x, y: (event.meta as any)?.y };
        break;
      case 'navigate':
        base.payload = { url: event.url };
        break;
      case 'closeTab':
      case 'newTab':
      case 'copy':
      case 'screenshot':
      case 'upload':
      case 'download':
        base.payload = { value: event.value };
        break;
      case 'extract': {
        const ev = event as any;
        base.payload = {
          field: ev.field,
          type: ev.extractType,           // distinct from event.type
          attribute: ev.attribute,
          selectors: event.selectors,
          tag: ev.tag,
          attributes: ev.attributes,
          textHint: ev.textHint,
          pagePattern: ev.pagePattern,
          extractAll: ev.extractAll ?? false,
        };
        break;
      }
      default:
        return null;
    }
    return base;
  }
  /** Variable detector: flag sensitive/parameterizable typed values. */
  private detectVariableForStep(step: Step): void {
    if (step.action !== 'type') return;
    const value = (step.payload as any)?.value as string | undefined;
    const inputType = (step.payload as any)?.inputType as string | undefined;
    if (!value) return;

    const detected = this.detectVariable(value, inputType);
    if (!detected.isVariable) return;

    (step.payload as any).isVariable = true;
    const name = this.variableName(step, value);
    const variable: Variable = {
      name,
      value,
      type: detected.type ?? 'text',
    };
    // Avoid duplicate variables with the same name.
    if (!this.variables.some((v) => v.name === name)) {
      this.variables.push(variable);
    }
  }

  detectVariable(
    value: string,
    inputType?: string,
  ): { isVariable: boolean; type?: Variable['type'] } {
    if (inputType === 'password') return { isVariable: true, type: 'password' };
    if (inputType === 'email' || /^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(value))
      return { isVariable: true, type: 'email' };
    if (/^https?:\/\//.test(value)) return { isVariable: true, type: 'url' };
    if (inputType === 'number' || /^\d+$/.test(value)) return { isVariable: true, type: 'number' };
    if (inputType === 'search' || /search/i.test(inputType ?? ''))
      return { isVariable: true, type: 'search' };
    // Heuristic: long, mixed-case, alphanumeric strings look like secrets.
    if (value.length >= 8 && /[A-Z]/.test(value) && /[0-9]/.test(value))
      return { isVariable: true, type: 'text' };
    if (value.length >= 4) return { isVariable: true, type: 'text' };
    return { isVariable: false };
  }

  private variableName(step: Step, value: string): string {
    const label = step.selectors?.name || step.selectors?.id || step.selectors?.placeholder;
    if (label) return label.replace(/[^a-zA-Z0-9]/g, '_');
    return `var_${value.slice(0, 6).replace(/[^a-zA-Z0-9]/g, '_')}`;
  }
}
