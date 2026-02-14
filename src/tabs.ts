/** 多页签管理 */

const TABS_KEY = 'calc-notepad-tabs';
const OLD_KEY = 'calc-notepad';

export interface Tab {
  id: string;
  title: string;
  content: string;
}

interface TabState {
  tabs: Tab[];
  activeId: string;
}

let state: TabState;
let tabBar: HTMLElement;
let switchCb: (content: string) => void;

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function loadState(defaultContent: string): TabState {
  const raw = localStorage.getItem(TABS_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.tabs) && parsed.tabs.length > 0 && parsed.activeId) {
        // 确保 activeId 指向有效页签
        if (!parsed.tabs.some((t: Tab) => t.id === parsed.activeId)) {
          parsed.activeId = parsed.tabs[0].id;
        }
        return parsed;
      }
    } catch { /* fall through */ }
  }
  // 迁移旧版单文档存储
  const old = localStorage.getItem(OLD_KEY);
  if (old !== null) localStorage.removeItem(OLD_KEY);
  const tab: Tab = { id: uid(), title: '页签 1', content: old ?? defaultContent };
  return { tabs: [tab], activeId: tab.id };
}

function persist(): void {
  localStorage.setItem(TABS_KEY, JSON.stringify(state));
}

function active(): Tab {
  return state.tabs.find(t => t.id === state.activeId)!;
}

/* ── 公共 API ── */

/** 初始化页签，返回当前页签内容 */
export function initTabs(
  defaultContent: string,
  onSwitch: (content: string) => void,
): string {
  switchCb = onSwitch;
  tabBar = document.getElementById('tabBar')!;
  state = loadState(defaultContent);
  persist();
  renderTabs();
  return active().content;
}

/** 保存当前页签内容（由 editor 的 onInput 调用） */
export function saveTabContent(content: string): void {
  active().content = content;
  persist();
}

/* ── 页签操作 ── */

function switchTab(id: string): void {
  if (id === state.activeId) return;
  state.activeId = id;
  persist();
  renderTabs();
  switchCb(active().content);
}

function addTab(): void {
  const tab: Tab = { id: uid(), title: `页签 ${state.tabs.length + 1}`, content: '' };
  state.tabs.push(tab);
  state.activeId = tab.id;
  persist();
  renderTabs();
  switchCb(tab.content);
}

function removeTab(id: string): void {
  if (state.tabs.length <= 1) return;
  const idx = state.tabs.findIndex(t => t.id === id);
  if (idx === -1) return;
  const wasActive = state.activeId === id;
  state.tabs.splice(idx, 1);
  if (wasActive) {
    state.activeId = state.tabs[Math.min(idx, state.tabs.length - 1)].id;
  }
  persist();
  renderTabs();
  if (wasActive) switchCb(active().content);
}

function startRename(id: string, span: HTMLSpanElement): void {
  const tab = state.tabs.find(t => t.id === id);
  if (!tab) return;
  const input = document.createElement('input');
  input.className = 'tab-rename';
  input.value = tab.title;
  input.maxLength = 20;
  span.textContent = '';
  span.appendChild(input);
  input.focus();
  input.select();
  const finish = () => {
    const v = input.value.trim();
    if (v) tab.title = v;
    persist();
    span.textContent = tab.title;
  };
  input.addEventListener('blur', finish);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') { input.value = tab.title; input.blur(); }
  });
}

/* ── 渲染 ── */

function renderTabs(): void {
  const frag = document.createDocumentFragment();

  for (const tab of state.tabs) {
    const btn = document.createElement('button');
    btn.className = tab.id === state.activeId ? 'tab tab-active' : 'tab';

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = tab.title;
    title.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      startRename(tab.id, title);
    });
    // 触控设备：长按重命名
    let pressTimer = 0;
    btn.addEventListener('touchstart', () => {
      pressTimer = window.setTimeout(() => startRename(tab.id, title), 500);
    }, { passive: true });
    btn.addEventListener('touchend', () => clearTimeout(pressTimer), { passive: true });
    btn.addEventListener('touchmove', () => clearTimeout(pressTimer), { passive: true });
    btn.appendChild(title);

    if (state.tabs.length > 1) {
      const close = document.createElement('span');
      close.className = 'tab-close';
      close.textContent = '×';
      close.addEventListener('click', (e) => { e.stopPropagation(); removeTab(tab.id); });
      btn.appendChild(close);
    }

    btn.addEventListener('click', () => switchTab(tab.id));
    frag.appendChild(btn);
  }

  const add = document.createElement('button');
  add.className = 'tab tab-add';
  add.textContent = '+';
  add.title = '新建页签';
  add.addEventListener('click', addTab);
  frag.appendChild(add);

  tabBar.textContent = '';
  tabBar.appendChild(frag);
}
