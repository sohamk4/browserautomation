import { Injectable } from '@nestjs/common';
import { BrowserService } from '../browser/browser.service';
import { WorkflowRepository } from '../workflow/workflow.repository';
import { Step, ActionType } from '@repo/core';
import { logger } from '../../shared/logger';

type ReplayOptions = {
  variables?: Record<string, string>;
  headless?: boolean;
  timeout?: number;
  storageState?: string;
};

@Injectable()
export class ReplayService {
  private extractedData: any[] = [];
  constructor(
    private browser: BrowserService,
    private workflowRepo: WorkflowRepository,
  ) {}

  async replay(workflowId: string, options: ReplayOptions = {}) {
    const workflow = await this.workflowRepo.findById(workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);

    const page = await this.browser.launch(
        options.headless ?? false,
        undefined,                     // sessionId (not needed for replay)
        options.storageState ?? './linkedin_state.json' // default if not provided
      );
    const timeout = options.timeout ?? 30000;

    // Build variable map
    const variables: Record<string, string> = {};
    if (workflow.variables) {
      for (const v of workflow.variables) {
        variables[v.name] = v.value;
      }
    }
    if (options.variables) {
      Object.assign(variables, options.variables);
    }

    // Keep track of pages for tab management
    let currentPage = page;

    for (const step of workflow.steps) {
      logger.info('Replaying step %s: %s', step.id, step.action);
      currentPage = await this.executeStep(currentPage, step, variables, timeout);
    }

    logger.info('Replay completed for workflow %s', workflowId);
    logger.info('Extracted Data', this.extractedData);
    return { success: true, workflowId, extracted: this.extractedData  };
  }

  private async executeStep(
    page: any,
    step: Step,
    variables: Record<string, string>,
    timeout: number,
    root?: any,
  ): Promise<any> {
    const { action, payload, selectors } = step;
    const resolvedPayload = this.resolveVariables(payload, variables);
  
    // Helper to find element
    const findElement = async (sel: any, requireVisible: boolean = true) => {
      if (!selectors) return null;
      return this.findElement(page, selectors, timeout, requireVisible);
    };
  
    // Normalize action to lowercase
    const normalizedAction = action.toLowerCase();
  
    switch (normalizedAction) {
      case 'navigate': {
        const targetUrl = resolvedPayload.url;
        const currentUrl = page.url();
        // If we're already on the target URL, skip navigation
        if (currentUrl === targetUrl || currentUrl.replace(/\/$/, '') === targetUrl.replace(/\/$/, '')) {
          logger.debug('Already on target URL: %s', targetUrl);
          break;
        }
        try {
          logger.debug('Navigating to %s (networkidle)', targetUrl);
          await page.goto(targetUrl, {
            timeout,
            waitUntil: 'networkidle',
          });
        } catch (error: any) {
          logger.warn('networkidle navigation failed: %s', error.message);
          // Fallback: try with 'load'
          try {
            logger.debug('Navigating to %s (load)', targetUrl);
            await page.goto(targetUrl, {
              timeout,
              waitUntil: 'load',
            });
          } catch (fallbackError: any) {
            logger.warn('load navigation also failed: %s', fallbackError.message);
            // If both fail, we still continue; the page might be in a usable state.
          }
        }
        // Optionally wait for URL to match (with a shorter timeout)
        try {
          await page.waitForURL(targetUrl, { timeout: 3000 });
        } catch {
          logger.warn('After navigation, current URL is %s (expected %s)', page.url(), targetUrl);
        }
        break;
      }
        
      case 'click': {
        const el = await this.findElement(page, selectors, timeout, true, root);
        if (el) await el.click({ timeout });
        else throw new Error('Element not found for click');
        break;
      }
  
      case 'dblclick': {
        const el = await findElement(selectors);
        if (el) await el.dblclick({ timeout });
        else throw new Error('Element not found for dblclick');
        break;
      }
  
      case 'rightclick': {
        const el = await findElement(selectors);
        if (el) await el.click({ button: 'right', timeout });
        else throw new Error('Element not found for rightclick');
        break;
      }
  
      case 'type': {
        const el = await findElement(selectors);
        if (el) {
          await el.fill(resolvedPayload.value, { timeout });
        } else {
          await page.keyboard.type(resolvedPayload.value);
        }
        break;
      }
  
      case 'keydown':
      case 'keyup': {
        const key = resolvedPayload.key || resolvedPayload.value;
        if (key) {
          if (normalizedAction === 'keydown') await page.keyboard.down(key);
          else await page.keyboard.up(key);
        }
        break;
      }
  
      case 'scroll': {
        const { x, y } = resolvedPayload.meta || { x: 0, y: 0 };
        await page.evaluate(([sx, sy]: [number, number]) => window.scrollTo(sx, sy), [x, y]);
        break;
      }
  
      case 'hover': {
        const el = await findElement(selectors, false); // allow invisible
        if (el) {
          try {
            // Wait for visibility with a short timeout; if it doesn't become visible, skip.
            await el.waitFor({ state: 'visible', timeout: 2000 }).catch(() => {
              logger.warn('Hover skipped: element not visible after waiting');
              return null;
            });
            // If we got a non-null result, perform the hover with a shorter timeout.
            if (el) {
              await el.hover({ timeout: Math.min(timeout, 5000) });
            }
          } catch (e: any) {
            // Catch both "not visible" and "detached from the DOM" errors.
            if (e.message?.includes('not visible') || e.message?.includes('detached from the DOM')) {
              logger.warn('Hover skipped: element not visible or detached');
              break; // skip this step
            }
            throw e; // re-throw other errors
          }
        } else {
          logger.warn('Hover skipped: element not found');
        }
        break;
      }  
      // Drag / Drop – partial (log warning)
      case 'drag':
        logger.warn('Drag action not fully implemented; handled with drop');
        break;
      case 'drop':
        logger.warn('Drop action requires paired drag; implement full DnD if needed');
        break;
  
      case 'upload': {
        const filePath = resolvedPayload.value;
        if (filePath) {
          const el = await findElement(selectors);
          if (el) await el.setInputFiles(filePath);
          else throw new Error('File input element not found');
        }
        break;
      }
  
      case 'download': {
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout }),
          // The actual click that triggers download is separate; assumed previous step did it.
        ]);
        logger.info('Download started: %s', download.suggestedFilename());
        break;
      }
  
      case 'select': {
        const el = await findElement(selectors);
        if (el) await el.selectOption(resolvedPayload.value);
        else throw new Error('Select element not found');
        break;
      }
  
      case 'check': {
        const el = await findElement(selectors);
        if (el) await el.check({ timeout });
        else throw new Error('Checkbox/radio not found');
        break;
      }
  
      case 'uncheck': {
        const el = await findElement(selectors);
        if (el) await el.uncheck({ timeout });
        else throw new Error('Checkbox/radio not found');
        break;
      }
  
      case 'back':
        await page.goBack({ timeout });
        break;
  
      case 'forward':
        await page.goForward({ timeout });
        break;
  
      case 'refresh':
        await page.reload({ timeout });
        break;
  
      case 'newtab': {
        const context = page.context();
        const newPage = await context.newPage();
        return newPage;
      }
  
      case 'closetab': {
        await page.close();
        const pages = page.context().pages();
        if (pages.length === 0) throw new Error('No pages left');
        return pages[0];
      }
  
      case 'switchtab': {
        const tabId = resolvedPayload.tabId;
        if (tabId) {
          const pages = page.context().pages();
          const target = pages.find((p: any) => p.url() === tabId || p.id() === tabId);
          if (target) return target;
          else throw new Error(`Tab ${tabId} not found`);
        }
        const pages = page.context().pages();
        return pages[pages.length - 1];
      }
  
      case 'wait': {
        const ms = resolvedPayload.milliseconds || resolvedPayload.value || 1000;
        await page.waitForTimeout(ms);
        break;
      }
  
      case 'screenshot': {
        const path = resolvedPayload.path || `screenshot-${Date.now()}.png`;
        await page.screenshot({ path, fullPage: true });
        logger.info('Screenshot saved: %s', path);
        break;
      }
  
      case 'copy': {
        const text = resolvedPayload.value || (await page.evaluate(() => document.getSelection()?.toString()));
        logger.info('Copied text: %s', text);
        break;
      }
        
      case 'extract': {
        const extractType = resolvedPayload.extractType || resolvedPayload.type || 'text';
        const extractAll = resolvedPayload.extractAll || false;
        const selector = resolvedPayload.selectors || selectors;
        let extracted: any = null;
      
        // Helper to extract value from a single element
        const extractFromElement = async (el: any) => {
          if (extractType === 'imageUrl') {
            // Image URL extraction – get src attribute (or data-src, srcset)
            let src = await el.getAttribute('src');
            if (!src) src = await el.getAttribute('data-src');
            if (!src) {
              const srcset = await el.getAttribute('srcset');
              if (srcset) {
                // take the first URL from srcset
                const parts = srcset.split(',');
                if (parts.length > 0) src = parts[0].trim().split(' ')[0];
              }
            }
            return src || '';
          } else if (extractType === 'linkUrl') {
            // For link URL, extract href
            return await el.getAttribute('href') || '';
          } else if (extractType === 'linkText') {
            return await el.textContent() || '';
          } else if (extractType === 'attribute') {
            const attrName = resolvedPayload.attribute || 'src';
            return await el.getAttribute(attrName) || '';
          } else if (extractType === 'html') {
            return await el.innerHTML() || '';
          } else {
            // default: textContent
            return await el.textContent() || '';
          }
        };
      
        if (extractAll || extractType === 'table' || extractType === 'list') {
          // Extract all matching elements
          const locator = this.buildLocator(page, selector);
          if (locator) {
            const elements = await locator.all();
            if (elements.length > 0) {
              extracted = await Promise.all(elements.map(async (el: any) => {
                return await extractFromElement(el);
              }));
              // If all values are empty, warn
              if (extracted.every((v: any) => !v || v === '')) {
                logger.warn('Extracted all empty values for imageUrl – check selectors');
              }
            } else {
              logger.warn('No elements found for table/list extraction');
            }
          } else {
            logger.warn('No selector provided for table/list extraction');
          }
        } else {
          // Single element extraction
          if (selector) {
            const el = await this.findElement(page, selector, timeout);
            if (el) {
              extracted = await extractFromElement(el);
            }
          } else {
            extracted = await page.evaluate(() => document.body.innerText);
          }
        }
      
        this.extractedData.push({
          stepId: step.id,
          url: page.url(),
          title: await page.title(),
          value: extracted,
          field: resolvedPayload.field || 'extracted',
          timestamp: new Date().toISOString(),
        });
        break;
      }  
      case 'loop': {
        const { containerSelector, steps } = resolvedPayload;
        // Find all container elements
        const containerLocator = this.buildLocator(page, containerSelector);
        if (!containerLocator) {
          logger.warn('Container not found for loop, skipping');
          break;
        }
        const containers = await containerLocator.all();
        logger.info('Loop: found %d containers', containers.length);
      
        const loopResults: any[] = [];
        for (const [idx, container] of containers.entries()) {
          logger.debug('Loop iteration %d', idx + 1);
          // Execute inner steps with the container as root
          for (const innerStep of steps) {
            // We need to handle special steps like 'extract' and collect results.
            // For simplicity, we'll execute each inner step with the container as root.
            await this.executeStep(page, innerStep, variables, timeout, container);
            // If the inner step is 'extract', we might want to capture its result.
            // We'll keep the extracted data in the main extractedData array.
          }
        }
        break;
      }
      default:
        logger.warn('Unsupported action: %s', action);
    }
  
    return page;
  }

  private resolveVariables(payload: any, variables: Record<string, string>) {
    if (typeof payload === 'string') {
      return payload.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] || `{{${key}}}`);
    }
    if (typeof payload === 'object' && payload !== null) {
      const result: any = Array.isArray(payload) ? [] : {};
      for (const [key, value] of Object.entries(payload)) {
        result[key] = this.resolveVariables(value, variables);
      }
      return result;
    }
    return payload;
  }
  private buildLocator(page: any, selectors: any, root?: any): any {
    if (!selectors) return null;
    const base = root || page;
    // If selectors has 'relative' flag, use it as CSS relative
    if (selectors.relative) {
      return base.locator(selectors.css).first();
    }
    // Try in priority order
    const strategies = [
      { key: 'id', fn: (sel: string) => page.locator(`#${sel}`) },
      { key: 'dataTestId', fn: (sel: string) => page.locator(`[data-testid="${sel}"]`) },
      { key: 'css', fn: (sel: string) => page.locator(sel) },
      { key: 'xpath', fn: (sel: string) => page.locator(`xpath=${sel}`) },
      { key: 'text', fn: (sel: string) => page.getByText(sel, { exact: true }) },
      { key: 'role', fn: (sel: string) => page.getByRole(sel as any) },
      { key: 'placeholder', fn: (sel: string) => page.locator(`[placeholder="${sel}"]`) },
      { key: 'name', fn: (sel: string) => page.locator(`[name="${sel}"]`) },
      { key: 'className', fn: (sel: string) => page.locator(`.${sel}`) },
      { key: 'domPath', fn: (sel: string) => page.locator(sel) },
    ];
    for (const strat of strategies) {
      const sel = selectors[strat.key];
      if (!sel) continue;
      try {
        const loc = strat.fn(sel);
        if (loc) return loc;
      } catch (e) {
        // ignore
      }
    }
    return null;
  }
  private async findElement(
    page: any,
    selectors: any,
    timeout: number,
    requireVisible: boolean = true,
    root?: any,
  ): Promise<any> {
    const locator = this.buildLocator(page, selectors, root);
    const strategies = [
      { key: 'id', fn: (sel: string) => page.locator(`#${sel}`) },
      { key: 'dataTestId', fn: (sel: string) => page.locator(`[data-testid="${sel}"]`) },
      { key: 'css', fn: (sel: string) => page.locator(sel) },
      { key: 'xpath', fn: (sel: string) => page.locator(`xpath=${sel}`) },
      { key: 'text', fn: (sel: string) => page.getByText(sel, { exact: true }) },
      { key: 'role', fn: (sel: string) => page.getByRole(sel as any) },
      { key: 'placeholder', fn: (sel: string) => page.locator(`[placeholder="${sel}"]`) },
      { key: 'name', fn: (sel: string) => page.locator(`[name="${sel}"]`) },
      { key: 'className', fn: (sel: string) => page.locator(`.${sel}`) },
      { key: 'domPath', fn: (sel: string) => page.locator(sel) },
    ];
  
    for (const strat of strategies) {
      const sel = selectors?.[strat.key];
      if (!sel) continue;
      try {
        const locator = strat.fn(sel);
        const count = await locator.count();
        if (count > 0) {
          const el = locator.first();
          if (requireVisible) {
            const isVisible = await el.isVisible({ timeout: 1000 }).catch(() => false);
            if (!isVisible) {
              logger.debug('Element found via %s but not visible: %s', strat.key, sel);
              continue;
            }
          }
          logger.debug('Found element via %s: %s', strat.key, sel);
          return el;
        }
      } catch (e) {
        // ignore
      }
    }
    return null;
  }
}