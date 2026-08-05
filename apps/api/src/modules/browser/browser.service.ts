import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { EventEmitter } from 'events';
import { IBrowserService, BrowserEvent, PageInfo } from '@repo/core';
import { logger } from '../../shared/logger';
import { createRecorderInitScript } from './recorder-init-script';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Infrastructure adapter implementing the Browser port using Playwright.
 *
 * Capture strategy (hybrid):
 *  - DOM interactions (click/type/select/scroll/...) are captured in-page by an
 *    init script and drained on a poll loop — these are the events Playwright
 *    does not surface on the `page` object.
 *  - Navigation and tab lifecycle are captured with real Playwright events
 *    (`framenavigated`, new `page` on the context, `close`).
 */


@Injectable()
export class BrowserService implements IBrowserService, OnModuleDestroy {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private pages = new Map<string, Page>(); // tabId -> Page
  private tabCounter = 0;
  private eventEmitter = new EventEmitter();
  private pollers = new Map<string, ReturnType<typeof setInterval>>();
  private lastUrl = new Map<string, string>();
  /** Timestamp until which automatic `navigate` steps are suppressed (command-driven nav). */
  private suppressUntil = 0;
  private pageMap: Map<string, any> = new Map();
  

  async launch(headless = false, sessionId?: string, storageState?: string): Promise<Page> {
    const bravePath = 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe';
    let contextOptions: any = {};

    if (storageState) {
      const resolvedPath = path.resolve(storageState);
      if (fs.existsSync(resolvedPath)) {
        try {
          const stateContent = fs.readFileSync(resolvedPath, 'utf-8');
          const storage = JSON.parse(stateContent);
          contextOptions.storageState = storage;
          logger.info('✅ Loaded storage state from %s', resolvedPath);
        } catch (err) {
          logger.warn('Failed to load storage state from %s: %s', resolvedPath, err);
        }
      } else {
        logger.warn('Storage state file not found: %s', resolvedPath);
      }
    }
    this.browser = await chromium.launch({
      headless,
      executablePath: bravePath,
    });

    // ---- Create context with storage state ----
    this.context = await this.browser.newContext(contextOptions);

    this.context.on('page', (page) => this.attachPage(page)); // ✅
    const page = await this.context.newPage();
    this.attachPage(page); // ✅ for the initial page
    logger.info('Browser launched (headless=%s)', headless);
    if (sessionId) {
      this.pageMap.set(sessionId, page);
    }
    return page;
  }
  getPageForSession(sessionId: string): any {
    return this.pageMap.get(sessionId);
  }
  

  private attachPage(page: Page): void {
    const tabId = String(++this.tabCounter);
    this.pages.set(tabId, page);
  
    // 1. Inject the recorder script (should run before any page script)
    page.addInitScript(createRecorderInitScript());
  
    // 2. After each navigation, ensure the script is still present (fallback)
    page.on('framenavigated', async (frame) => {
      if (frame !== page.mainFrame()) return;
  
      // Skip automatic navigation events when we're in a command-driven nav
      if (Date.now() < this.suppressUntil) return;
      const url = page.url();
      if (this.lastUrl.get(tabId) !== url) {
        this.lastUrl.set(tabId, url);
        this.emitAction({
          type: 'framenavigated',
          action: 'navigate',
          url,
          title: page.url(),
          tabId,
        });
      }
  
      // Check if the script is present; if not, inject it now
      try {
        const hasScript = await page.evaluate(() => typeof (window as any).toggleExtractionMode === 'function');
        if (!hasScript) {
          logger.warn('Recorder script missing in tab %s – re‑injecting', tabId);
          // ✅ Correct: evaluate the function directly
          await page.evaluate(createRecorderInitScript());
        }
      } catch (e) {
        // Page may be closed or inaccessible; ignore
      }
    });
  
    // 3. Listen for page close
    page.on('close', () => {
      this.pages.delete(tabId);
      const poller = this.pollers.get(tabId);
      if (poller) {
        clearInterval(poller);
        this.pollers.delete(tabId);
      }
      this.emitAction({ type: 'close', action: 'closeTab', tabId });
    });
  
    // 4. Listen for downloads
    page.on('download', (download) => {
      this.emitAction({
        type: 'download',
        action: 'download',
        value: download.suggestedFilename(),
        url: page.url(),
        tabId,
      });
    });
  
    // 5. Start polling for in‑page events
    const poller = setInterval(async () => {
      try {
        const drained = await page.evaluate(() => {
          const w = window as any;
          const evs = w.__recorderEvents__ || [];
          w.__recorderEvents__ = [];
          return evs as BrowserEvent[];
        });
        for (const ev of drained) {
          this.emitAction({ ...ev, tabId: ev.tabId ?? tabId });
        }
      } catch {
        // Page may be navigating/closed; ignore transient errors
      }
    }, 150);
    this.pollers.set(tabId, poller);
  
    page.on('load', async () => {
      try {
        const hasScript = await page.evaluate(() => typeof (window as any).toggleExtractionMode === 'function');
        if (!hasScript) {
          logger.warn('On‑load: script missing in tab %s – re‑injecting', tabId);
          await page.evaluate(createRecorderInitScript());
        }
      } catch (e) {
        // ignore
      }
    });
  
    logger.debug('Recorder script attached to tab %s', tabId);
  }
  private emitAction(event: BrowserEvent): void {
    this.eventEmitter.emit('action', event);
  }

  async navigate(url: string): Promise<void> {
    const page = this.pages.values().next().value as Page | undefined;
    if (!page) throw new Error('No active page. Call launch() first.');
    await page.goto(url);
  }

  async screenshot(options?: { path?: string }): Promise<string | null> {
    const page = this.activePage();
    if (!page) return null;
    return page.screenshot(options as any).then(
      (buf) => (typeof buf === 'string' ? buf : `data:image/png;base64,${buf.toString('base64')}`),
      () => null,
    );
  }

  private activePage(): Page | undefined {
    return this.pages.values().next().value as Page | undefined;
  }

  activeUrl(): string | undefined {
    return this.activePage()?.url();
  }

  /** Suppress automatic `navigate` steps for `ms` (used around command-driven navigations). */
  suppressNextNavigation(ms = 3000): void {
    this.suppressUntil = Date.now() + ms;
  }

  async goBack(): Promise<void> {
    await this.activePage()?.goBack();
  }

  async goForward(): Promise<void> {
    await this.activePage()?.goForward();
  }

  async reload(): Promise<void> {
    await this.activePage()?.reload();
  }

  async waitForTimeout(ms: number): Promise<void> {
    await this.activePage()?.waitForTimeout(ms);
  }

  /** Text currently selected in the active page (used by the `extract` action). */
  async extractSelection(): Promise<string> {
    const page = this.activePage();
    if (!page) return '';
    return page.evaluate(() => window.getSelection()?.toString() ?? '').catch(() => '');
  }

  async close(): Promise<void> {
    for (const poller of this.pollers.values()) clearInterval(poller);
    this.pollers.clear();
    await this.browser?.close();
    this.browser = null;
    this.context = null;
    this.pages.clear();
    this.lastUrl.clear();
    logger.info('Browser closed');
  }

  onAction(handler: (event: BrowserEvent) => void): void {
    this.eventEmitter.on('action', handler);
  }

  onModuleDestroy(): void {
    void this.close();
  }
}
