import { computeSelectors } from './utils.js';

export function showExtractionPopup(element: HTMLElement) {
  console.log('[Recorder] showExtractionPopup called with element:', element);
  const existing = document.getElementById('extraction-popup');
  if (existing) existing.remove();

  // Helper: detect repeating containers (lists/tables)
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
      setExtractionType(img);
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

    (window as any).__recorderEvents__.push(event);
    popup.remove();
  });
  buttonContainer.appendChild(saveBtn);
  configArea.appendChild(buttonContainer);

  // ---- Update extraction type based on selected element ----
  function setExtractionType(el: HTMLElement) {
    if (el.tagName === 'IMG') {
      typeSelect.value = 'imageUrl';
      attrInput.value = 'src';
      typeSelect.dispatchEvent(new Event('change'));
    } else {
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
    setExtractionType(el);
    if (highlightElement) highlightElement.style.outline = '';
    highlightElement = el;
    highlightElement.style.outline = '3px solid #ff6600';
  }

  // ---- Initialise ----
  updatePreview(element);
  setExtractionType(element);
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