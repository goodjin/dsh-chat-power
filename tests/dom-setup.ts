/**
 * 真渲染用例的公共前置：在 jsdom 里把 React 的 act 环境标好。
 *
 * 必须在测试文件 import react 之前生效，所以走 setupFiles（先于测试模块执行）。
 * React 的 act 从全局读 `IS_REACT_ATT_ENVIRONMENT`；jsdom 下 `window` 与 Node 的
 * `global` 未必是同一个对象，两处都标上，免得 React 警告「testing environment is
 * not configured to support act(...)」。
 */
const flag = { IS_REACT_ATT_ENVIRONMENT: true }
;(globalThis as Record<string, unknown>).IS_REACT_ATT_ENVIRONMENT = true
if (typeof global !== 'undefined' && global !== globalThis) {
  (global as Record<string, unknown>).IS_REACT_ATT_ENVIRONMENT = true
}
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).IS_REACT_ATT_ENVIRONMENT = true
}
void flag
