import { describe, it, expect } from 'vitest'
import { en } from '@/i18n/en'
import { zh } from '@/i18n/zh'

describe('i18n localization coverage', () => {
  it('has identical keys for desktop.commands in both en and zh', () => {
    const enCommandKeys = Object.keys(en.desktop.commands).sort()
    const zhCommandKeys = Object.keys(zh.desktop.commands).sort()
    expect(enCommandKeys).toEqual(zhCommandKeys)
  })

  it('has identical keys for desktop.statusbar in both en and zh', () => {
    const enStatusbarKeys = Object.keys(en.desktop.statusbar).sort()
    const zhStatusbarKeys = Object.keys(zh.desktop.statusbar).sort()
    expect(enStatusbarKeys).toEqual(zhStatusbarKeys)
  })

  it('has identical keys for home.status in both en and zh', () => {
    const enHomeStatusKeys = Object.keys(en.home.status).sort()
    const zhHomeStatusKeys = Object.keys(zh.home.status).sort()
    expect(enHomeStatusKeys).toEqual(zhHomeStatusKeys)
  })

  it('contains non-empty command labels and descriptions in zh', () => {
    for (const value of Object.values(zh.desktop.commands)) {
      expect(typeof value).toBe('string')
      expect(value.trim().length).toBeGreaterThan(0)
    }
  })

  it('has identical keys for webhooks in both en and zh', () => {
    const enWebhooksKeys = Object.keys(en.webhooks).sort()
    const zhWebhooksKeys = Object.keys(zh.webhooks).sort()
    expect(enWebhooksKeys).toEqual(zhWebhooksKeys)
    expect(Object.keys(en.webhooks.errors).sort()).toEqual(Object.keys(zh.webhooks.errors).sort())
    expect(Object.keys(en.webhooks.deliveryLabels).sort()).toEqual(Object.keys(zh.webhooks.deliveryLabels).sort())
  })
})
