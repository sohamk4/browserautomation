export function createRecorderInitScript(): () => void {
  return () => {
    const w = window as any;
    w.__recorderEvents__ = w.__recorderEvents__ || [];

    // ---------- Helper functions ----------
    function throttle(key: string, ms: number): boolean {
      const now = Date.now();
      const last = (w.__throttleLast__ = w.__throttleLast__ || {});
      if (last[key] && now - last[key] < ms) return false;
      last[key] = now;
      return true;
    }

    // ---------- CSS Selector (absolute) ----------
    function cssSelector(el: Element): string {
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

    // ---------- XPath (absolute) ----------
    function xpathFor(el: Element): string {
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

    // ---------- Compute selectors (with optional root for relative) ----------
    function computeSelectors(el: Element, root?: Element | null): Record<string, string> {
      // If a root is provided, compute a selector relative to root
      if (root) {
        const parts: string[] = [];
        let node: Element | null = el;
        while (node && node !== root) {
          let sel = node.tagName.toLowerCase();
          const id = (node as HTMLElement).id;
          if (id) {
            sel = `#${id}`;
          } else {
            const parent = node.parentElement;
            if (parent) {
              const siblings = Array.from(parent.children).filter(
                (c) => c.tagName === node!.tagName && c.className === node!.className
              );
              if (siblings.length > 1) {
                const idx = siblings.indexOf(node as Element) + 1;
                sel += `:nth-of-type(${idx})`;
              }
            }
          }
          parts.unshift(sel);
          node = node.parentElement;
        }
        // If we didn't reach root, fallback to absolute
        if (node !== root) {
          return computeSelectors(el);
        }
        const relativeSelector = parts.join(' > ');
        // Return as CSS selector with a flag indicating it's relative
        return { css: relativeSelector, relative: 'true' };
      }

      // ---- Absolute selector (original logic) ----
      const s: Record<string, string> = {};
      s.css = cssSelector(el);
      s.xpath = xpathFor(el);
      s.domPath = cssSelector(el);
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

    function bbox(el: Element) {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }

    function push(ev: Record<string, unknown>) {
      ev.url = location.href;
      ev.title = document.title;
      w.__recorderEvents__.push(ev);
    }

    // ---------- targetInfo with optional root ----------
    function targetInfo(e: Event, root?: Element | null) {
      const el = e.target as Element;
      return { selectors: computeSelectors(el, root), boundingBox: bbox(el) };
    }

    // ---------- Loop Mode ----------
    let isLoopMode = false;
    let loopContainerSelected = false;
    let loopContainerElement: HTMLElement | null = null;

    // Find the repeating container (parent list)
    function findRepeatingContainer(el: HTMLElement): HTMLElement | null {
        let node: HTMLElement | null = el;
      while (node && node !== document.body) {
        const parent: HTMLElement | null = node.parentElement; // 👈 explicit type
        if (!parent) break;
        // Check if this parent is a common list container
        if (parent.tagName === 'UL' || parent.tagName === 'OL' || parent.getAttribute('role') === 'list') {
          return parent;
        }
        // Check if parent has at least 2 children with same tag+class
        const children = Array.from(parent.children);
        const sameTagClass = children.filter(
          (c) => c.tagName === node!.tagName && c.className === node!.className
        );
        if (sameTagClass.length >= 2) {
          return parent;
        }
        node = parent;
      }
      return null;
    }

    function toggleLoopMode() {
      if (isLoopMode) {
        // Turning off loop selection mode (cancel)
        isLoopMode = false;
        document.body.style.cursor = 'default';
        w.__recorderEvents__.push({ type: 'loopModeToggle', active: false });
        return;
      }
      if (loopContainerSelected) {
        // End the loop – container already selected
        w.__recorderEvents__.push({
          type: 'loopEnd',
          action: 'loopEnd',
          url: location.href,
          title: document.title,
        });
        loopContainerSelected = false;
        loopContainerElement = null;
        document.body.style.cursor = 'default';
        w.__recorderEvents__.push({ type: 'loopModeToggle', active: false });
        return;
      }
      // Start loop selection mode
      isLoopMode = true;
      document.body.style.cursor = 'pointer';
      w.__recorderEvents__.push({ type: 'loopModeToggle', active: true });
    }

    (window as any).toggleLoopMode = toggleLoopMode;

    // Hotkey: Ctrl+Shift+L
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'L') {
        e.preventDefault();
        toggleLoopMode();
      }
    });

    // ---- Loop Mode Click Handler (capture phase) ----
    document.addEventListener('click', (e) => {
      if (!isLoopMode) return;
    
      let el = e.target as HTMLElement;
      if (!el || el.nodeType !== Node.ELEMENT_NODE) {
        el = (e.target as Node)?.parentElement as HTMLElement;
      }
      if (!el) el = document.body;
      if (el.closest('#extraction-popup')) return;
    
      e.preventDefault();
      e.stopImmediatePropagation();
    
      // 1. Find the repeating container (the parent list)
      const container = findRepeatingContainer(el);
      if (!container) {
        console.warn('Could not detect a repeating container for loop.');
        isLoopMode = false;
        document.body.style.cursor = 'default';
        return;
      }
    
      // 2. Find similar children (same tag and class) of this container
      const children = Array.from(container.children);
      const similarChildren = children.filter(
        (c) => c.tagName === el.tagName && c.className === el.className
      );
      if (similarChildren.length < 2) {
        console.warn('Not enough similar children for loop.');
        isLoopMode = false;
        document.body.style.cursor = 'default';
        return;
      }
    
      // 3. Build an absolute CSS selector for ALL items: parentCss > childTag.childClass
      const parentSelectors = computeSelectors(container);
      const parentCss = parentSelectors.css;
      const childTag = el.tagName.toLowerCase();
      const childClass = el.className ? '.' + el.className.trim().split(/\s+/).join('.') : '';
      const itemSelector = `${parentCss} > ${childTag}${childClass}`;
    
      // 4. Store the clicked item as the root for recording inner steps
      loopContainerElement = el; // the item itself
      loopContainerSelected = true;
    
      // 5. Push loopStart with the item selector
      w.__recorderEvents__.push({
        type: 'loopStart',
        action: 'loopStart',
        selectors: { css: itemSelector }, // this will find all items
        url: location.href,
        title: document.title,
      });
    
      // 6. Exit loop selection mode
      isLoopMode = false;
      document.body.style.cursor = 'default';
    
      // 7. Visual feedback – highlight the container (parent)
      container.style.outline = '3px solid #ff6600';
      setTimeout(() => { container.style.outline = ''; }, 1000);
    
      console.log('🔁 Loop container selected:', container);
      console.log('🔁 Item selector:', itemSelector);
    }, true);
    // ---------- Extraction Mode ----------
    let isExtractionMode = false;
    let highlightElement: HTMLElement | null = null;

    function toggleExtractionMode() {
      // If loop mode is active, end it cleanly
      if (isLoopMode) {
        if (loopContainerSelected) {
          w.__recorderEvents__.push({
            type: 'loopEnd',
            action: 'loopEnd',
            url: location.href,
            title: document.title,
          });
          loopContainerSelected = false;
          loopContainerElement = null;
        }
        isLoopMode = false;
        document.body.style.cursor = 'crosshair';
        // Continue to toggle extraction on
      }
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

    // ---------- Extraction Mode Listeners (unchanged) ----------
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
        highlightElement.style.outline = '';
        highlightElement = null;
      }
    });

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
      try {
        showExtractionPopup(el);
      } catch (err) {
        console.error('Extraction popup error:', err);
      }
    }, true);
        
    // ---------- Extraction Popup (unchanged) ----------
    function showExtractionPopup(element: HTMLElement) {
      const existing = document.getElementById('extraction-popup');
      if (existing) existing.remove();
    
      // ---- Helpers ----
      function findRepeatingContainer(el: HTMLElement): HTMLElement | null {
        let node: HTMLElement | null = el;
        while (node && node !== document.body) {
          const parent: HTMLElement | null = node.parentElement;
          if (!parent) break;
          const children: Element[] = Array.from(parent.children);
          const sameTagClass: Element[] = children.filter(
            (c: Element): boolean => c.tagName === node!.tagName && c.className === node!.className
          );
          if (sameTagClass.length >= 2) {
            return parent;
          }
          if (
            parent.getAttribute('data-component-type') === 's-search-result' ||
            parent.getAttribute('role') === 'listitem' ||
            parent.classList.contains('product') ||
            parent.classList.contains('item')
          ) {
            return parent;
          }
          node = parent;
        }
        return null;
      }
      function countMatchedElements(selectors: any): number {
        if (!selectors) return 0;
        try {
          // Try CSS selector first
          if (selectors.css) {
            return document.querySelectorAll(selectors.css).length;
          }
          // Fallback to XPath
          if (selectors.xpath) {
            const result = document.evaluate(
              selectors.xpath,
              document,
              null,
              XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
              null
            );
            return result.snapshotLength;
          }
          // Fallback to other selector types (id, class, etc.)
          if (selectors.id) {
            return document.querySelectorAll(`#${selectors.id}`).length;
          }
          if (selectors.className) {
            return document.querySelectorAll(`.${selectors.className.replace(/\s+/g, '.')}`).length;
          }
          if (selectors.name) {
            return document.querySelectorAll(`[name="${selectors.name}"]`).length;
          }
        } catch (e) {
          // If any selector fails, return 0
          return 0;
        }
        return 0;
      }
    
      const container = findRepeatingContainer(element);
      const isStructured = container !== null;

      // ---- State ----
      let selectedElement: HTMLElement = element;
      let highlightElement: HTMLElement | null = null;
    
      // ---- Popup container ----
      const popup = document.createElement('div');
      popup.id = 'extraction-popup';
      popup.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 600px;
        height: 600px;
        background: white;
        border: 1px solid #ccc;
        border-radius: 8px;
        z-index: 999999;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        box-sizing: border-box;
      `;
    
      // ---- Tab bar ----
      const tabBar = document.createElement('div');
      tabBar.style.cssText = `
        display: flex;
        border-bottom: 2px solid #e0e0e0;
        background: #f9f9f9;
        flex-shrink: 0;
      `;
      const tabs = [
        { id: 'images', label: '📷 Images' },
        { id: 'inspect', label: '🔍 Inspect' }
      ];
      let activeTab = 'images';
    
      const tabButtons: Record<string, HTMLButtonElement> = {};
      tabs.forEach((t) => {
        const btn = document.createElement('button');
        btn.textContent = t.label;
        btn.dataset.tab = t.id;
        btn.style.cssText = `
          padding: 10px 20px;
          border: none;
          background: transparent;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          color: #666;
          border-bottom: 3px solid transparent;
          transition: all 0.2s;
          flex: 1;
        `;
        btn.addEventListener('click', () => switchTab(t.id));
        tabBar.appendChild(btn);
        tabButtons[t.id] = btn;
      });
      popup.appendChild(tabBar);
    
      // ---- Tab content container ----
      const tabContent = document.createElement('div');
      tabContent.style.cssText = `
        flex: 1;
        overflow: hidden;
        position: relative;
      `;
      popup.appendChild(tabContent);
    
      // ---- Images Tab ----
      const imagesTab = document.createElement('div');
      imagesTab.id = 'tab-images';
      imagesTab.style.cssText = `
        width: 100%;
        height: 100%;
        overflow-y: auto;
        padding: 10px;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
        gap: 8px;
        box-sizing: border-box;
      `;
      const allImages = document.querySelectorAll('img');
      allImages.forEach((img) => {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
          border: 2px solid transparent;
          border-radius: 4px;
          cursor: pointer;
          padding: 4px;
          transition: border-color 0.2s;
          background: #f5f5f5;
          display: flex;
          flex-direction: column;
          align-items: center;
        `;
        const thumb = document.createElement('img');
        thumb.src = img.src || img.getAttribute('data-src') || '';
        thumb.alt = img.alt || '';
        thumb.style.cssText = `
          width: 100%;
          height: 60px;
          object-fit: cover;
          border-radius: 2px;
        `;
        const label = document.createElement('span');
        label.textContent = img.alt || 'img';
        label.style.cssText = `
          font-size: 10px;
          margin-top: 4px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 100%;
          color: #555;
        `;
        wrapper.appendChild(thumb);
        wrapper.appendChild(label);
    
        wrapper.addEventListener('mouseenter', () => {
          if (highlightElement) highlightElement.style.outline = '';
          highlightElement = img;
          highlightElement.style.outline = '3px solid #0066cc';
        });
        wrapper.addEventListener('mouseleave', () => {
          if (highlightElement) {
            highlightElement.style.outline = '';
            highlightElement = null;
          }
        });
        wrapper.addEventListener('click', () => {
          selectedElement = img;
          updatePreview(img);
          setExtractionType(img); // 👈 UPDATE EXTRACTION TYPE
          updateMatchCount(img);
          if (highlightElement) highlightElement.style.outline = '';
          highlightElement = img;
          highlightElement.style.outline = '3px solid #ff6600';
        });
        imagesTab.appendChild(wrapper);
      });
      tabContent.appendChild(imagesTab);
    
      // ---- Inspect Tab ----
      const inspectTab = document.createElement('div');
      inspectTab.id = 'tab-inspect';
      inspectTab.style.cssText = `
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        background: #fafafa;
        font-size: 16px;
        color: #888;
      `;
      const inspectMessage = document.createElement('p');
      inspectMessage.textContent = 'Hover over any element to highlight, click to select.';
      inspectTab.appendChild(inspectMessage);
      tabContent.appendChild(inspectTab);
    
      // ---- Shared preview & config area (bottom) ----
      const configArea = document.createElement('div');
      configArea.style.cssText = `
        border-top: 1px solid #e0e0e0;
        padding: 12px 20px 12px 20px;
        background: #f9f9f9;
        flex-shrink: 0;
        max-height: 200px;
        overflow-y: auto;
      `;
      popup.appendChild(configArea);
    
      // ---- Preview ----
      const preview = document.createElement('div');
      preview.style.cssText = `
        background: #fff;
        border-radius: 4px;
        padding: 6px 10px;
        margin-bottom: 8px;
        font-size: 12px;
        border-left: 3px solid #0066cc;
        font-family: monospace;
        white-space: pre-wrap;
        word-break: break-word;
        max-height: 60px;
        overflow-y: auto;
      `;
      configArea.appendChild(preview);
    
      function updatePreview(el: HTMLElement) {
        const tag = el.tagName.toLowerCase();
        const id = el.id ? `#${el.id}` : '';
        const cls = el.className ? `.${el.className.trim().split(' ').join('.')}` : '';
        const text = (el.textContent || '').trim().slice(0, 60);
        let previewText = `Element: ${tag}${id}${cls}\n`;
        if (text) previewText += `Text: ${text}\n`;
        const href = el.getAttribute('href');
        const src = el.getAttribute('src');
        if (href) previewText += `href: ${href}\n`;
        if (src) previewText += `src: ${src}\n`;
        preview.textContent = previewText;
      }
    
      // ---- Field Name ----
      const fieldLabel = document.createElement('label');
      fieldLabel.textContent = 'Field Name:';
      fieldLabel.style.cssText = 'display:block; font-size:13px; font-weight:600; margin-top:4px;';
      configArea.appendChild(fieldLabel);
    
      const fieldInput = document.createElement('input');
      fieldInput.id = 'extract-field';
      fieldInput.type = 'text';
      fieldInput.placeholder = 'e.g. productName';
      fieldInput.style.cssText = 'width:100%; margin:4px 0 8px; padding:6px; box-sizing:border-box; border:1px solid #ccc; border-radius:4px;';
      configArea.appendChild(fieldInput);
    
      // ---- Extraction Type & Attribute ----
      const typeRow = document.createElement('div');
      typeRow.style.cssText = 'display:flex; gap:12px; align-items:center; flex-wrap:wrap; margin-bottom:6px;';
      const typeLabel = document.createElement('label');
      typeLabel.textContent = 'Extract:';
      typeLabel.style.cssText = 'font-size:13px; font-weight:600;';
      typeRow.appendChild(typeLabel);
      const typeSelect = document.createElement('select');
      typeSelect.id = 'extract-type-select';
      typeSelect.style.cssText = 'padding:4px 8px; border:1px solid #ccc; border-radius:4px;';
      const types = ['text', 'html', 'attribute', 'linkUrl', 'linkText', 'imageUrl', 'downloadImage', 'table', 'list', 'jsonApi', 'screenshot', 'aiSummary', 'custom'];
      types.forEach((t) => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t.charAt(0).toUpperCase() + t.slice(1);
        if (t === 'text') opt.selected = true;
        typeSelect.appendChild(opt);
      });
      typeRow.appendChild(typeSelect);
    
      const attrInput = document.createElement('input');
      attrInput.id = 'extract-attribute';
      attrInput.type = 'text';
      attrInput.placeholder = 'Attribute name (e.g. src)';
      attrInput.style.cssText = 'padding:4px 8px; border:1px solid #ccc; border-radius:4px; display:none; width:150px;';
      typeRow.appendChild(attrInput);
    
      const customInput = document.createElement('input');
      customInput.id = 'extract-custom';
      customInput.type = 'text';
      customInput.placeholder = 'Custom selector';
      customInput.style.cssText = 'padding:4px 8px; border:1px solid #ccc; border-radius:4px; display:none; width:150px;';
      typeRow.appendChild(customInput);
    
      typeSelect.addEventListener('change', () => {
        const val = typeSelect.value;
        attrInput.style.display = val === 'attribute' ? 'inline-block' : 'none';
        customInput.style.display = val === 'custom' ? 'inline-block' : 'none';
      });
      configArea.appendChild(typeRow);

      // ---- Match count ----
      const matchCountDisplay = document.createElement('div');
      matchCountDisplay.id = 'match-count';
      matchCountDisplay.style.cssText = `
        font-size: 12px;
        color: #555;
        margin-bottom: 6px;
      `;
      configArea.appendChild(matchCountDisplay);
    
      // ---- Extract All ----
      const allGroup = document.createElement('div');
      allGroup.style.cssText = 'display:flex; align-items:center; gap:6px; margin-bottom:6px;';
      const allCheckbox = document.createElement('input');
      allCheckbox.type = 'checkbox';
      allCheckbox.id = 'extract-all';
      allCheckbox.checked = isStructured;
      const allLabel = document.createElement('label');
      allLabel.htmlFor = 'extract-all';
      allLabel.textContent = isStructured ? 'Extract all matching items (detected list/table)' : 'Extract all matching items (manual)';
      allLabel.style.cssText = 'font-size:13px;';
      allGroup.appendChild(allCheckbox);
      allGroup.appendChild(allLabel);
      configArea.appendChild(allGroup);
    
      // ---- Buttons ----
      const buttonContainer = document.createElement('div');
      buttonContainer.style.cssText = 'display:flex; gap:8px; justify-content:flex-end; margin-top:6px;';
      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancel';
      cancelBtn.style.cssText = 'padding:6px 16px; background:#fff; border:1px solid #ccc; border-radius:4px; cursor:pointer;';
      cancelBtn.addEventListener('click', () => popup.remove());
      buttonContainer.appendChild(cancelBtn);
    
      const saveBtn = document.createElement('button');
      saveBtn.textContent = 'Save';
      saveBtn.style.cssText = 'padding:6px 20px; background:#0066cc; color:white; border:none; border-radius:4px; cursor:pointer; font-weight:bold;';
      saveBtn.addEventListener('click', () => {
        const field = fieldInput.value.trim();
        const extractType = typeSelect.value;
        const attribute = attrInput.value.trim();
        const custom = customInput.value.trim();
        const extractAll = allCheckbox.checked;
      
        if (!field) {
          alert('Please enter a field name.');
          return;
        }
      
        let selectors: any;
        if (extractType === 'custom' && custom) {
          selectors = { css: custom };
        } else {
          selectors = computeSelectors(selectedElement);
        }
      
        const event: any = {
          type: 'extract',
          action: 'extract',
          field,
          extractType: extractType || 'text',
          selectors,
          tag: selectedElement.tagName.toLowerCase(),
          attributes: {},
          textHint: (selectedElement.textContent || '').trim().slice(0, 100),
          pagePattern: window.location.pathname,
          extractAll,
        };
        if (extractType === 'attribute' && attribute) {
          event.attribute = attribute;
        }
        if (extractType === 'custom' && !custom) {
          event.extractType = 'text';
        }
      
        // ---- DEBUG ----
        console.log('🔵 Extraction event created:', event);
        console.log('🔵 Pushing to __recorderEvents__', w.__recorderEvents__);
      
        w.__recorderEvents__.push(event);
      
        // ---- Visual feedback ----
        saveBtn.textContent = '✅ Saved!';
        saveBtn.style.background = '#28a745';
        setTimeout(() => {
          popup.remove();
        }, 500);
      });
      buttonContainer.appendChild(saveBtn);
      configArea.appendChild(buttonContainer);
      function updateMatchCount(el: HTMLElement) {
        const selectors = computeSelectors(el);
        const count = countMatchedElements(selectors);
        matchCountDisplay.textContent = `🔍 Matched elements on page: ${count}`;
        // Auto-check "Extract All" if more than 1, but only if the user hasn't manually changed it
        if (count > 1 && !allCheckbox.dataset.userChanged) {
          allCheckbox.checked = true;
          allLabel.textContent = `Extract all matching items (${count} found)`;
        } else if (count === 1) {
          allCheckbox.checked = false;
          allLabel.textContent = `Extract all matching items (${count} found)`;
        } else {
          allLabel.textContent = `Extract all matching items (${count} found)`;
        }
      }
        
      // 👇 NEW: Update extraction type based on selected element
      function setExtractionType(el: HTMLElement) {
        if (el.tagName === 'IMG') {
          typeSelect.value = 'imageUrl';
          attrInput.value = 'src'; // pre‑fill attribute for convenience
          typeSelect.dispatchEvent(new Event('change'));
        } else {
          // For non‑images, if the current type is 'imageUrl' (set by previous image selection),
          // switch back to a sensible default (e.g., 'text'). Otherwise leave it as the user chose.
          if (typeSelect.value === 'imageUrl') {
            typeSelect.value = 'text';
            typeSelect.dispatchEvent(new Event('change'));
          }
        }
      }
    
      // ---- Tab switching ----
      function switchTab(tabId: string) {
        activeTab = tabId;
        tabs.forEach((t) => {
          const btn = tabButtons[t.id];
          if (t.id === tabId) {
            btn.style.borderBottomColor = '#0066cc';
            btn.style.color = '#0066cc';
            btn.style.background = '#e6f0ff';
          } else {
            btn.style.borderBottomColor = 'transparent';
            btn.style.color = '#666';
            btn.style.background = 'transparent';
          }
        });
        imagesTab.style.display = tabId === 'images' ? 'grid' : 'none';
        inspectTab.style.display = tabId === 'inspect' ? 'flex' : 'none';
        if (tabId === 'inspect') {
          activateInspectMode();
        } else {
          deactivateInspectMode();
        }
      }
    
      // ---- Inspect mode ----
      let inspectActive = false;
      let inspectHighlight: HTMLElement | null = null;
    
      function activateInspectMode() {
        if (inspectActive) return;
        inspectActive = true;
        document.body.style.cursor = 'crosshair';
        document.addEventListener('mouseover', inspectMouseOver, true);
        document.addEventListener('mouseout', inspectMouseOut, true);
        document.addEventListener('click', inspectClick, true);
      }
    
      function deactivateInspectMode() {
        if (!inspectActive) return;
        inspectActive = false;
        document.body.style.cursor = 'default';
        document.removeEventListener('mouseover', inspectMouseOver, true);
        document.removeEventListener('mouseout', inspectMouseOut, true);
        document.removeEventListener('click', inspectClick, true);
        if (inspectHighlight) {
          inspectHighlight.style.outline = '';
          inspectHighlight = null;
        }
      }
    
      function inspectMouseOver(e: Event) {
        if (!inspectActive) return;
        const el = e.target as HTMLElement;
        if (el.closest('#extraction-popup')) return;
        if (inspectHighlight && inspectHighlight !== el) {
          inspectHighlight.style.outline = '';
        }
        inspectHighlight = el;
        el.style.outline = '3px solid #00aaff';
      }
    
      function inspectMouseOut(e: Event) {
        if (!inspectActive) return;
        const el = e.target as HTMLElement;
        if (inspectHighlight === el) {
          el.style.outline = '';
          inspectHighlight = null;
        }
      }
    
      function inspectClick(e: Event) {
        if (!inspectActive) return;
        const el = e.target as HTMLElement;
        if (el.closest('#extraction-popup')) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        selectedElement = el;
        updatePreview(el);
        setExtractionType(el); // 👈 UPDATE EXTRACTION TYPE
        updateMatchCount(el);
        if (highlightElement) highlightElement.style.outline = '';
        highlightElement = el;
        highlightElement.style.outline = '3px solid #ff6600';
      }
    
      // ---- Initialise ----
      updatePreview(element);
      setExtractionType(element); // 👈 UPDATE ON FIRST OPEN
      updateMatchCount(element);
      switchTab('images');
    
      // ---- Cleanup ----
      const originalRemove = popup.remove.bind(popup);
      popup.remove = function() {
        deactivateInspectMode();
        if (highlightElement) highlightElement.style.outline = '';
        if (inspectHighlight) inspectHighlight.style.outline = '';
        originalRemove();
      };

      document.body.appendChild(popup);
    }

    // ---------- Standard event listeners (paused during extraction) ----------
    // These now pass the loop root if loopContainerSelected is true
    document.addEventListener('click', (e) => {
      if (isExtractionMode) return;
      const root = loopContainerSelected ? loopContainerElement : undefined;
      push({ type: 'click', action: 'click', ...targetInfo(e, root) });
    });
    document.addEventListener('dblclick', (e) => {
      if (isExtractionMode) return;
      const root = loopContainerSelected ? loopContainerElement : undefined;
      push({ type: 'dblclick', action: 'dblclick', ...targetInfo(e, root) });
    });
    document.addEventListener('contextmenu', (e) => {
      if (isExtractionMode) return;
      const root = loopContainerSelected ? loopContainerElement : undefined;
      push({ type: 'rightclick', action: 'rightclick', ...targetInfo(e, root) });
    });
    document.addEventListener('input', (e) => {
      if (isExtractionMode) return;
      const el = e.target as HTMLInputElement;
      const root = loopContainerSelected ? loopContainerElement : undefined;
      push({
        type: 'input',
        action: 'type',
        selectors: computeSelectors(el, root),
        boundingBox: bbox(el),
        value: el.value,
        inputType: el.type,
      });
    });
    document.addEventListener('change', (e) => {
      if (isExtractionMode) return;
      const el = e.target as HTMLInputElement;
      const root = loopContainerSelected ? loopContainerElement : undefined;
      if (el.type === 'file') {
        const files = Array.from(el.files ?? []).map((f) => f.name);
        push({
          type: 'change',
          action: 'upload',
          selectors: computeSelectors(el, root),
          value: files.join(', '),
        });
        return;
      }
      if (el.tagName === 'SELECT') {
        push({
          type: 'change',
          action: 'select',
          selectors: computeSelectors(el, root),
          value: el.value,
        });
      } else if (el.type === 'checkbox' || el.type === 'radio') {
        push({
          type: 'change',
          action: el.checked ? 'check' : 'uncheck',
          selectors: computeSelectors(el, root),
          value: el.value,
        });
      }
    });
    document.addEventListener('keydown', (e) => {
      if (isExtractionMode) return;
      if (!throttle('keydown', 200)) return;
      const root = loopContainerSelected ? loopContainerElement : undefined;
      const base: Record<string, unknown> = { type: 'keydown', action: 'keydown', key: e.key };
      if (e.target && (e.target as Element).nodeType === 1) {
        Object.assign(base, targetInfo(e, root));
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
      const root = loopContainerSelected ? loopContainerElement : undefined;
      push({ type: 'hover', action: 'hover', ...targetInfo(e, root) });
    });
    document.addEventListener('scroll', () => {
      if (isExtractionMode) return;
      if (!throttle('scroll', 500)) return;
      push({ type: 'scroll', action: 'scroll', meta: { x: window.scrollX, y: window.scrollY } });
    });
    document.addEventListener('dragstart', (e) => {
      if (isExtractionMode) return;
      const root = loopContainerSelected ? loopContainerElement : undefined;
      push({ type: 'drag', action: 'drag', ...targetInfo(e, root) });
    });
    document.addEventListener('drop', (e) => {
      if (isExtractionMode) return;
      const root = loopContainerSelected ? loopContainerElement : undefined;
      push({ type: 'drop', action: 'drop', ...targetInfo(e, root) });
    });
    document.addEventListener('copy', () => {
      if (isExtractionMode) return;
      const sel = (window as any).getSelection?.()?.toString();
      push({ type: 'copy', action: 'copy', value: sel });
    });
  };
}