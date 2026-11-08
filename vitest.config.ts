import { defineConfig } from 'vitest/config'

/**
 * 只跑源码里的测试。lib/ 下是 tsc 的中间产物（lib/src）和打包结果（lib/client.js），
 * 编译后的测试副本再跑一遍没有意义，还会让同一断言失败两次。
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    // 真 React 渲染 + 真 DOM 的用例单独走 vitest.dom.config.ts（jsdom、不挂哑代理
    // 的 setup），这里排除掉，免得 node 环境 + 被 mock 的 react-dom 去跑它们。
    exclude: ['lib/**', 'node_modules/**', 'tests/**/*.dom.spec.ts'],
    setupFiles: ['./tests/setup.ts'],
  },
})
