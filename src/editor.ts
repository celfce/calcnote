/** 编辑器 UI */

import { calculate, formatNumber, type CalcResult } from './calculator';
import { initTabs, saveTabContent } from './tabs';

const DEFAULT_TEXT = `# 记事本计算器 - 功能演示
# 以 # 开头的行是注释，不会被计算
# 你可以自由编辑或清空重新开始！

基础算术
---------
1 + 2
10 - 3
4 * 5
20 / 4
2 ^ 10
10 % 3

百分比
---------
200 * 50%
80 + 80 * 20%

链式运算（运算符开头接上上一行结果）
---------
100 + 200 + 350
* 80%
- 50

ans 引用上一行结果
---------
60
ans * 2
ans + 10

变量赋值（支持中文变量名）
---------
房租 = 3500
水电 = 200
网费 = 100
每月支出 = 房租 + 水电 + 网费

单价 = 49.9
数量 = 3
小计 = 单价 * 数量
满减 = 30
实付 = 小计 - 满减

数学函数
---------
sqrt(144)
pow(2, 8)
abs(-42)
ceil(3.2)
floor(3.8)
round(3.456)
min(10, 20, 5)
max(10, 20, 5)
log(100, 10)

三角函数
---------
sin(pi / 6)
cos(pi / 3)

常量
---------
pi
e
pi * 5^2
e ^ 2
`;

let inputArea: HTMLTextAreaElement;
let lineNumbers: HTMLElement;
let outputArea: HTMLElement;
let mirror: HTMLDivElement;
let previousResults: (string | null)[] = [];
let lastResult: CalcResult | null = null;
let rafId: number | null = null;
let activeLine = -1;
let lastContentHeight = 0;

function createMirror(): void {
  mirror = document.createElement('div');
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.overflow = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordBreak = 'break-all';
  mirror.style.boxSizing = 'border-box';
  mirror.setAttribute('aria-hidden', 'true');
  document.body.appendChild(mirror);
}

function syncMirrorStyles(): void {
  const styles = window.getComputedStyle(inputArea);
  mirror.style.fontFamily = styles.fontFamily;
  mirror.style.fontSize = styles.fontSize;
  mirror.style.lineHeight = styles.lineHeight;
  mirror.style.padding = styles.padding;
  mirror.style.width = inputArea.clientWidth + 'px';
}

function measureLineHeights(): number[] {
  syncMirrorStyles();
  const lines = inputArea.value.split('\n');
  const frag = document.createDocumentFragment();
  const divs: HTMLDivElement[] = [];
  for (const line of lines) {
    const div = document.createElement('div');
    div.textContent = line || '\u00a0';
    frag.appendChild(div);
    divs.push(div);
  }
  mirror.textContent = '';
  mirror.appendChild(frag);
  return divs.map(d => d.offsetHeight);
}

export function initEditor(): void {
  inputArea = document.getElementById('inputArea') as HTMLTextAreaElement;
  lineNumbers = document.getElementById('lineNumbers') as HTMLElement;
  outputArea = document.getElementById('outputArea') as HTMLElement;

  createMirror();

  // 初始化页签，获取当前页签内容
  const content = initTabs(DEFAULT_TEXT, onTabSwitch);
  inputArea.value = content;

  inputArea.addEventListener('input', onInput);
  inputArea.addEventListener('scroll', syncScroll);
  inputArea.addEventListener('click', onClickBelow);
  inputArea.addEventListener('touchend', onTouchBelow);

  // 点击结果展开/收起
  outputArea.addEventListener('click', onOutputClick);

  // 光标行跟踪
  document.addEventListener('selectionchange', () => {
    if (document.activeElement === inputArea) updateActiveLine();
  });

  // ResizeObserver 替代 window resize，更精准地监听输入区宽度变化
  new ResizeObserver(() => scheduleRecalculate()).observe(inputArea);

  recalculate();
  inputArea.focus();
}

function onTabSwitch(content: string): void {
  inputArea.value = content;
  previousResults = [];
  recalculate();
  inputArea.focus();
}

function onInput(): void {
  saveTabContent(inputArea.value);
  scheduleRecalculate();
}

/** 点击/触摸内容下方空白区时自动补换行 */
let lastInsertTime = 0;

function insertBelowIfNeeded(clientY: number): void {
  if (Date.now() - lastInsertTime < 400) return;          // 防止 touch+click 双重触发
  if (inputArea.selectionStart !== inputArea.value.length) return;
  const style = getComputedStyle(inputArea);
  const lineHeight = parseFloat(style.lineHeight) || 22;
  const paddingTop = parseFloat(style.paddingTop) || 10;
  const contentBottom = paddingTop + lastContentHeight;
  const tapY = clientY - inputArea.getBoundingClientRect().top + inputArea.scrollTop;
  if (tapY > contentBottom) {
    const extra = Math.max(1, Math.ceil((tapY - contentBottom) / lineHeight));  // ceil 更准
    inputArea.value += '\n'.repeat(extra);
    inputArea.selectionStart = inputArea.selectionEnd = inputArea.value.length;
    saveTabContent(inputArea.value);
    scheduleRecalculate();
    lastInsertTime = Date.now();
  }
}

function onClickBelow(e: MouseEvent): void {
  insertBelowIfNeeded(e.clientY);
}

function onTouchBelow(e: TouchEvent): void {
  const t = e.changedTouches[0];
  if (t) insertBelowIfNeeded(t.clientY);
}

/** 当前弹出气泡 */
let activePopup: HTMLDivElement | null = null;

function dismissPopup(): void {
  if (activePopup) {
    activePopup.remove();
    activePopup = null;
  }
}

/** 点击结果区弹出完整数值 */
function onOutputClick(e: MouseEvent): void {
  const div = (e.target as HTMLElement).closest('#outputArea div.has-result') as HTMLDivElement | null;
  if (!div) return;
  // 没有溢出则不需要弹出
  if (div.scrollWidth <= div.clientWidth + 1) return;

  e.stopPropagation();
  dismissPopup();

  const popup = document.createElement('div');
  popup.className = 'result-popup';
  popup.textContent = div.title || div.textContent;
  document.body.appendChild(popup);
  activePopup = popup;

  // 定位：紧贴该行，窄屏左右居中，宽屏右对齐
  const rect = div.getBoundingClientRect();
  const ph = popup.offsetHeight;
  const pw = popup.offsetWidth;
  const vw = document.documentElement.clientWidth;
  let left = rect.right - pw;
  if (left < 4) left = Math.max(4, (vw - pw) / 2); // 窄屏居中
  let top = rect.top - ph - 4;
  if (top < 4) top = rect.bottom + 4;
  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;

  // 点击其他地方关闭
  setTimeout(() => document.addEventListener('pointerdown', onDismiss, { once: true }), 0);
}

function onDismiss(e: Event): void {
  if (activePopup && activePopup.contains(e.target as Node)) {
    // 点在气泡内（选择文本），保持打开
    setTimeout(() => document.addEventListener('pointerdown', onDismiss, { once: true }), 0);
    return;
  }
  dismissPopup();
}

/** RAF 节流：每帧最多重算一次 */
function scheduleRecalculate(): void {
  if (rafId !== null) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    recalculate();
  });
}

function syncScroll(): void {
  dismissPopup();
  lineNumbers.scrollTop = inputArea.scrollTop;
  outputArea.scrollTop = inputArea.scrollTop;
}

function getActiveLine(): number {
  const pos = inputArea.selectionStart;
  return inputArea.value.substring(0, pos).split('\n').length - 1;
}

/** 光标移动时更新高亮（不重新渲染，只切换 class） */
function updateActiveLine(): void {
  const newLine = getActiveLine();
  if (newLine === activeLine) return;
  lineNumbers.children[activeLine]?.classList.remove('active-line');
  outputArea.children[activeLine]?.classList.remove('active-line');
  activeLine = newLine;
  lineNumbers.children[activeLine]?.classList.add('active-line');
  outputArea.children[activeLine]?.classList.add('active-line');
}

function recalculate(): void {
  dismissPopup();
  activeLine = getActiveLine();
  const result: CalcResult = calculate(inputArea.value);
  lastResult = result;
  const heights = measureLineHeights();
  lastContentHeight = heights.reduce((a, b) => a + b, 0);
  renderLineNumbers(heights);
  renderOutput(result, heights);

  previousResults = result.lines.map(l => l.display);
}

function renderLineNumbers(heights: number[]): void {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < heights.length; i++) {
    const span = document.createElement('span');
    span.style.height = `${heights[i]}px`;
    span.textContent = String(i + 1);
    if (i === activeLine) span.classList.add('active-line');
    frag.appendChild(span);
  }
  lineNumbers.textContent = '';
  lineNumbers.appendChild(frag);
}

function renderOutput(result: CalcResult, heights: number[]): void {
  const frag = document.createDocumentFragment();

  for (let i = 0; i < result.lines.length; i++) {
    const h = heights[i] || 22;
    const line = result.lines[i];
    const div = document.createElement('div');
    div.style.height = `${h}px`;

    if (line.error) {
      div.className = 'error';
      div.textContent = '⚠';
    } else if (line.display !== null) {
      const formatted = formatNumber(line.display);
      const changed = previousResults[i] !== line.display;
      div.className = changed ? 'has-result changed' : 'has-result';
      div.textContent = formatted;
      div.title = formatted;
    } else {
      div.textContent = '\u00a0';
    }

    if (i === activeLine) div.classList.add('active-line');
    frag.appendChild(div);
  }

  outputArea.textContent = '';
  outputArea.appendChild(frag);
}

export function clearEditor(): void {
  inputArea.value = '';
  saveTabContent('');
  recalculate();
  inputArea.focus();
}

export function exportText(): void {
  const result = lastResult ?? calculate(inputArea.value);
  const lines = inputArea.value.split('\n');
  let output = '';

  for (let i = 0; i < lines.length; i++) {
    const val = result.lines[i]?.display;
    if (val !== null && val !== undefined) {
      output += `${lines[i]}  →  ${formatNumber(val)}\n`;
    } else {
      output += `${lines[i]}\n`;
    }
  }
  const blob = new Blob([output], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `计算记录_${new Date().toLocaleDateString('zh-CN')}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
