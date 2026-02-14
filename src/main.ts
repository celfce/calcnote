/** 记事本计算器 - 入口 */

import './styles.css';
import { initTheme, toggleTheme, getTheme } from './theme';
import { initEditor, clearEditor, exportText } from './editor';

function init(): void {
  initTheme();
  initEditor();

  // 工具栏按钮
  const btnTheme = document.getElementById('btnTheme')!;
  const btnClear = document.getElementById('btnClear')!;
  const btnExport = document.getElementById('btnExport')!;

  btnTheme.addEventListener('click', () => {
    const next = toggleTheme();
    btnTheme.textContent = next === 'dark' ? '☀️ 浅色' : '🌙 深色';
  });

  // 初始化按钮文字
  btnTheme.textContent = getTheme() === 'dark' ? '☀️ 浅色' : '🌙 深色';

  btnClear.addEventListener('click', () => {
    if (confirm('确定要清空所有内容吗？')) {
      clearEditor();
    }
  });

  btnExport.addEventListener('click', exportText);
}

document.addEventListener('DOMContentLoaded', init);
