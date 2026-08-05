import { throttle, targetInfo, push, computeSelectors, bbox } from './utils';
import { showExtractionPopup } from './extraction-popup';

export function createRecorderInitScript(): () => void {
  return () => {
    const w = window as any;
    w.__recorderEvents__ = w.__recorderEvents__ || [];

    // ---------- Extraction Mode ----------
    let isExtractionMode = false;
    let highlightElement: HTMLElement | null = null;

    function toggleExtractionMode() {
      isExtractionMode = !isExtractionMode;
      document.body.style.cursor = isExtractionMode ? 'crosshair' : 'default';
      if (highlightElement) {
        highlightElement.style.outline = '';
        highlightElement = null;
      }
      w.__recorderEvents__.push({
        type: 'extractionMode',
        active: isExtractionMode,
      });
    }

    (window as any).toggleExtractionMode = toggleExtractionMode;

    // Hotkey: Ctrl+Shift+E
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        toggleExtractionMode();
      }
    });

    // ---------- Extraction Mode Listeners ----------
    document.addEventListener('mouseover', (e) => {
      if (!isExtractionMode) return;
      const el = e.target as HTMLElement;
      if (el.closest && el.closest('#extraction-popup')) return;
      if (highlightElement && highlightElement !== el) {
        highlightElement.style.outline = '';
      }
      highlightElement = el;
      el.style.outline = '2px solid #00aaff';
    });

    document.addEventListener('mouseout', (e) => {
      if (!isExtractionMode) return;
      const el = e.target as HTMLElement;
      if (highlightElement === el) {
        el.style.outline = '';
        highlightElement = null;
      }
    });

    // Fixed extraction click handler – capture phase
    document.addEventListener('click', (e) => {
      if (!isExtractionMode) return;

      let el = e.target as HTMLElement;
      if (!el || el.nodeType !== Node.ELEMENT_NODE) {
        el = (e.target as Node)?.parentElement as HTMLElement;
      }
      if (!el) el = document.body;

      if (el.closest && el.closest('#extraction-popup')) return;

      e.preventDefault();
      e.stopImmediatePropagation();

      console.log('[Recorder] Extraction click detected on:', el);

      try {
        if (typeof showExtractionPopup === 'function') {
          showExtractionPopup(el);
        } else {
          console.error('[Recorder] showExtractionPopup is not defined');
          alert('Extraction popup function not loaded. Please rebuild the recorder script.');
        }
      } catch (err) {
        console.error('[Recorder] Extraction popup error:', err);
        alert('Error opening extraction popup: ' + (err as Error).message);
      }
    }, true);

    // ---------- Standard event listeners (paused during extraction) ----------
    document.addEventListener('click', (e) => {
      if (isExtractionMode) return;
      push({ type: 'click', action: 'click', ...targetInfo(e) });
    });

    document.addEventListener('dblclick', (e) => {
      if (isExtractionMode) return;
      push({ type: 'dblclick', action: 'dblclick', ...targetInfo(e) });
    });
    document.addEventListener('contextmenu', (e) => {
      if (isExtractionMode) return;
      push({ type: 'rightclick', action: 'rightclick', ...targetInfo(e) });
    });
    document.addEventListener('input', (e) => {
      if (isExtractionMode) return;
      const el = e.target as HTMLInputElement;
      push({
        type: 'input',
        action: 'type',
        selectors: computeSelectors(el),
        boundingBox: bbox(el),
        value: el.value,
        inputType: el.type,
      });
    });
    document.addEventListener('change', (e) => {
      if (isExtractionMode) return;
      const el = e.target as HTMLInputElement;
      if (el.type === 'file') {
        const files = Array.from(el.files ?? []).map((f) => f.name);
        push({
          type: 'change',
          action: 'upload',
          selectors: computeSelectors(el),
          value: files.join(', '),
        });
        return;
      }
      if (el.tagName === 'SELECT') {
        push({
          type: 'change',
          action: 'select',
          selectors: computeSelectors(el),
          value: el.value,
        });
      } else if (el.type === 'checkbox' || el.type === 'radio') {
        push({
          type: 'change',
          action: el.checked ? 'check' : 'uncheck',
          selectors: computeSelectors(el),
          value: el.value,
        });
      }
    });
    document.addEventListener('keydown', (e) => {
      if (isExtractionMode) return;
      if (!throttle('keydown', 200)) return;
      const base: Record<string, unknown> = { type: 'keydown', action: 'keydown', key: e.key };
      if (e.target && (e.target as Element).nodeType === 1) {
        Object.assign(base, targetInfo(e));
      }
      push(base);
    });
    document.addEventListener('keyup', (e) => {
      if (isExtractionMode) return;
      if (!throttle('keyup', 200)) return;
      push({ type: 'keyup', action: 'keyup', key: e.key });
    });
    document.addEventListener('mouseover', (e) => {
      if (isExtractionMode) return;
      if (!throttle('hover', 400)) return;
      push({ type: 'hover', action: 'hover', ...targetInfo(e) });
    });
    document.addEventListener('scroll', () => {
      if (isExtractionMode) return;
      if (!throttle('scroll', 500)) return;
      push({ type: 'scroll', action: 'scroll', meta: { x: window.scrollX, y: window.scrollY } });
    });
    document.addEventListener('dragstart', (e) => {
      if (isExtractionMode) return;
      push({ type: 'drag', action: 'drag', ...targetInfo(e) });
    });
    document.addEventListener('drop', (e) => {
      if (isExtractionMode) return;
      push({ type: 'drop', action: 'drop', ...targetInfo(e) });
    });
    document.addEventListener('copy', () => {
      if (isExtractionMode) return;
      const sel = (window as any).getSelection?.()?.toString();
      push({ type: 'copy', action: 'copy', value: sel });
    });
  };
}