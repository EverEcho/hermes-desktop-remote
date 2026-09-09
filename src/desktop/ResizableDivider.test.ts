import { describe, expect, it } from 'vitest'

import { clampPanelWidth } from './ResizableDivider'

describe('clampPanelWidth', () => {
  it('keeps a panel inside its usable range', () => {
    expect(clampPanelWidth(120, 180, 360)).toBe(180)
    expect(clampPanelWidth(260.4, 180, 360)).toBe(260)
    expect(clampPanelWidth(500, 180, 360)).toBe(360)
  })

  it('falls back to the minimum when the available maximum is smaller', () => {
    expect(clampPanelWidth(240, 180, 150)).toBe(180)
  })
})
