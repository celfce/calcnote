/** 计算引擎 - 基于 mathjs 按需导入 */

import {
  create,
  // 类型系统 & 核心
  BigNumberDependencies,
  evaluateDependencies,
  formatDependencies,
  typeOfDependencies,
  bignumberDependencies,
  numberDependencies,
  // 算术运算
  addDependencies,
  subtractDependencies,
  multiplyDependencies,
  divideDependencies,
  unaryMinusDependencies,
  powDependencies,
  modDependencies,
  // 数学函数
  sqrtDependencies,
  sinDependencies,
  cosDependencies,
  absDependencies,
  ceilDependencies,
  floorDependencies,
  roundDependencies,
  minDependencies,
  maxDependencies,
  logDependencies,
  // 常量
  piDependencies,
  eDependencies,
  type MathJsInstance,
} from 'mathjs';

export interface LineResult {
  display: string | null;
  numeric: number;
  error: boolean;
}

export interface CalcResult {
  lines: LineResult[];
}

// 按需创建 mathjs 实例，仅包含实际使用的功能
const math: MathJsInstance = create({
  BigNumberDependencies,
  evaluateDependencies,
  formatDependencies,
  typeOfDependencies,
  bignumberDependencies,
  numberDependencies,
  addDependencies,
  subtractDependencies,
  multiplyDependencies,
  divideDependencies,
  unaryMinusDependencies,
  powDependencies,
  modDependencies,
  sqrtDependencies,
  sinDependencies,
  cosDependencies,
  absDependencies,
  ceilDependencies,
  floorDependencies,
  roundDependencies,
  minDependencies,
  maxDependencies,
  logDependencies,
  piDependencies,
  eDependencies,
}, {
  number: 'BigNumber',
  precision: 64,
});

const BINARY_OPERATORS = ['+', '-', '*', '/'];

/** 超过此指数范围的数字自动切换为科学计数法，防止生成百万位字符串导致浏览器卡死 */
const MAX_FIXED_EXP = 20;
const AUTO_FMT = { notation: 'auto' as const, lowerExp: -MAX_FIXED_EXP, upperExp: MAX_FIXED_EXP, precision: 12 };

/** 中文变量名映射上下文（每次 calculate 调用内局部使用） */
interface VarMapping {
  cnToAlias: Map<string, string>;
  counter: number;
}

function hasUnicodeLetter(s: string): boolean {
  return /[^\x00-\x7F]/.test(s);
}

function getAlias(mapping: VarMapping, cnName: string): string {
  let alias = mapping.cnToAlias.get(cnName);
  if (!alias) {
    alias = `_v${mapping.counter++}`;
    mapping.cnToAlias.set(cnName, alias);
  }
  return alias;
}

function replaceChineseVars(line: string, mapping: VarMapping): string {
  return line.replace(/[\p{L}_][\p{L}\p{N}_]*/gu, (match) => {
    if (hasUnicodeLetter(match)) {
      return getAlias(mapping, match);
    }
    return match;
  });
}

function preprocessPercent(line: string): string {
  return line.replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');
}

/** 将 mathjs 结果转为原始显示字符串（不做格式化） */
function resultToDisplay(val: unknown): string | null {
  if (val === undefined || val === null) return null;
  const type = math.typeOf(val);
  if (type === 'BigNumber' || type === 'number') {
    return math.format(val, AUTO_FMT);
  }
  return null;
}

function resultToNumber(val: unknown): number {
  try {
    return math.number(val as Parameters<typeof math.number>[0]) as number;
  } catch {
    return 0;
  }
}

export function calculate(text: string): CalcResult {
  const mapping: VarMapping = { cnToAlias: new Map(), counter: 0 };
  const lines = text.split('\n');
  const results: LineResult[] = [];
  const scope: Record<string, unknown> = {};
  let previousAnswer: unknown = null;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();

    if (line.length === 0) {
      results.push({ display: null, numeric: 0, error: false });
      continue;
    }

    if (line.startsWith('#')) {
      results.push({ display: null, numeric: 0, error: false });
      continue;
    }

    // 跳过分隔线（纯符号行，如 ------、======、****）
    if (/^[-=_.*·~]+$/.test(line)) {
      results.push({ display: null, numeric: 0, error: false });
      continue;
    }

    // 跳过纯文本行：无数字、无运算符、无括号、也不含已知数学标识符
    // 但允许已定义的变量名（包括中文变量）通过，以便查看其值
    const isKnownVariable = Object.prototype.hasOwnProperty.call(scope, line) || mapping.cnToAlias.has(line);
    if (!isKnownVariable
        && !/[0-9=()^]/.test(line)
        && !BINARY_OPERATORS.some(op => line.includes(op))
        && !/\b(pi|e|ans|true|false|Infinity)\b/i.test(line)) {
      results.push({ display: null, numeric: 0, error: false });
      continue;
    }

    try {
      if (previousAnswer !== null && BINARY_OPERATORS.includes(line[0])) {
        line = math.format(previousAnswer, AUTO_FMT) + line;
      }

      if (previousAnswer !== null) {
        scope['ans'] = previousAnswer;
      }

      line = preprocessPercent(line);
      line = replaceChineseVars(line, mapping);

      const result = math.evaluate(line, scope);
      const display = resultToDisplay(result);

      if (display !== null) {
        previousAnswer = result;
        const num = resultToNumber(result);
        results.push({ display, numeric: num, error: false });
      } else {
        results.push({ display: null, numeric: 0, error: false });
      }
    } catch {
      results.push({ display: null, numeric: 0, error: true });
    }
  }

  return { lines: results };
}

/** 格式化显示：去末尾 0 + 千分位（兼容科学计数法） */
function formatDisplay(str: string): string {
  const eIdx = str.indexOf('e');
  let mantissa = eIdx >= 0 ? str.slice(0, eIdx) : str;
  const exponent = eIdx >= 0 ? str.slice(eIdx) : '';

  // 去掉尾数部分的末尾 0
  if (mantissa.includes('.')) {
    mantissa = mantissa.replace(/\.?0+$/, '');
  }

  // 仅对定点数添加千分位（科学计数法不需要）
  if (!exponent) {
    const parts = mantissa.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    mantissa = parts.join('.');
  }

  return mantissa + exponent;
}

export function formatNumber(str: string): string {
  return formatDisplay(str);
}
