import { useId, useState } from 'react'
import type { PluginContext } from './index.ts'
import { readDefaultLinkOpenMode, writeDefaultLinkOpenMode, type LinkOpenMode } from './link-open.ts'
import { fallbackT, NAMESPACE, type RuntimeT } from './locales.ts'

/** Preferences retain the existing storage key; link handlers read it on every click. */
export function LinkSettingsSection({ t = fallbackT }: { t?: RuntimeT }) {
  const [mode, setMode] = useState(readDefaultLinkOpenMode)
  const group = useId()
  const select = (value: LinkOpenMode): void => {
    writeDefaultLinkOpenMode(value)
    setMode(value)
  }
  return <section style={{ padding: 24 }}>
    <h2>{t('settings.title')}</h2>
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend>{t('settings.linkOpenDefault')}</legend>
      {(['right', 'browser'] as const).map(value => <label key={value} style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <input type="radio" name={group} value={value} checked={mode === value} onChange={() => select(value)} />
        {t(value === 'right' ? 'settings.linkOpenRight' : 'settings.linkOpenBrowser')}
      </label>)}
    </fieldset>
  </section>
}

export function registerLinkSettings(slots: PluginContext['slots']): void {
  slots.inject('settings.section', () => slots.register({
    name: 'settings.section',
    id: 'chat-power',
    order: 80,
    label: () => fallbackT('settings.title'),
    locale: NAMESPACE,
  }, LinkSettingsSection))
}
