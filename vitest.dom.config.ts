import { defineConfig } from 'vitest/config'

/**
 * 真 React 渲染 + 真 DOM 的回归配置。
 *
 * 不挂 `tests/setup.ts`：那里把 `react-dom` 换成 `{ createPortal: () => null }`
 * 的哑代理、顶掉 primitives——真渲染需要真 `react-dom` 与真 `document`，所以这批
 * 用例单独走 jsdom、单独一套 include（`*.dom.spec.ts`）。主配置 `vitest.config.ts`
 * 把这些文件 exclude 掉，免得 node 环境 + 哑代理去跑真渲染。
 *
 * 这里断言的是组件**渲染出来的 DOM 行为**（首批文件真的画出来、失败真的给出提示），
 * 不是对字符串冒充——先红后绿，红必须复现原故障的行为，不能是「模块找不到」。
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.dom.spec.ts'],
    environment: 'jsdom',
    // 真渲染要在测试文件 import react 之前就把 act 环境标好（见 dom-setup.ts）。
    setupFiles: ['./tests/dom-setup.ts'],
  },
})
