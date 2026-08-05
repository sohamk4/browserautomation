import { ActionType, SelectorSet, BoundingBox } from '../../domain/action.js';

export interface PageInfo {
  id: string;
  url: string;
  title: string;
  tabId: string;
}

/**
 * A normalized browser interaction event emitted by the BrowserService.
 *
 * `type` is the raw event source (e.g. "click", "input", "framenavigated").
 * `action` is the canonical ActionType the recorder will persist.
 * Selector/metadata fields are pre-computed in the page context so that the
 * event is fully serializable across the browser↔Node boundary.
 */
export interface BrowserEvent {
  type: string;
  action?: ActionType;
  selectors?: SelectorSet;
  boundingBox?: BoundingBox;
  value?: string;
  key?: string;
  inputType?: string;
  url?: string;
  title?: string;
  tabId?: string;
  /** Reserved for non-serializable downstream use; usually undefined. */
  target?: unknown;
  /** Extra raw fields (e.g. scroll coordinates). */
  meta?: Record<string, unknown>;
}

export interface IBrowserService {
  launch(headless?: boolean): Promise<unknown>; // returns a Playwright Page
  close(): Promise<void>;
  navigate(url: string): Promise<void>;
  screenshot(options?: { path?: string }): Promise<string | null>;
  onAction(handler: (event: BrowserEvent) => void): void;
}
