/**
 * 宿主 Markdown 组件需要的文案。
 *
 * 官方 `MarkdownText` 要一份 `MarkdownLabels`（代码块按钮与脚注的文案）。我们
 * 在文件阅读区已经有一份，这里单独放一个模块，给思考帧等处复用。
 */
import type { MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives'
import type { RuntimeT } from './locales.ts'

/** 用本包词典拼出 Markdown 组件要的文案。
 * @param t - 本包词典。
 * @returns MarkdownLabels。
 */
export function labelsFor(t: RuntimeT): MarkdownLabels {
  return {
    code: {
      copyLabel: t('markdownTurn.copy'),
      copiedLabel: t('markdownTurn.copied'),
      toolbarLabels: {
        codeLabel: t('markdownTurn.code'),
        wrapLabel: t('markdownTurn.wrap'),
        unwrapLabel: t('markdownTurn.unwrap'),
      },
    },
    footnotes: t('markdownTurn.footnotes'),
  }
}
