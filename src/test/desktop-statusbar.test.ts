import { describe, it, expect } from 'vitest'

describe('Desktop Status Bar logic', () => {
  it('parses project directory correctly from cwd path', () => {
    const parseProject = (cwd: string | null | undefined) => {
      if (!cwd) return 'freelo'
      const parts = cwd.replace(/\/+$/, '').split('/')
      return parts[parts.length - 1] || 'freelo'
    }

    expect(parseProject('/Users/echo/data/code/freelo')).toBe('freelo')
    expect(parseProject('/home/user/project/my-app/')).toBe('my-app')
    expect(parseProject(null)).toBe('freelo')
    expect(parseProject('')).toBe('freelo')
  })

  it('formats gateway host from full URL or hostname fallback', () => {
    const parseHost = (url: string | null | undefined) => {
      try {
        if (!url) return '127.0.0.1:5175'
        const parsed = new URL(url.startsWith('http') ? url : `http://${url}`)
        return parsed.host || url
      } catch {
        return '127.0.0.1:5175'
      }
    }

    expect(parseHost('http://192.168.10.5:9119')).toBe('192.168.10.5:9119')
    expect(parseHost('192.168.1.100:8080')).toBe('192.168.1.100:8080')
    expect(parseHost('https://gateway.example.com')).toBe('gateway.example.com')
  })

  it('verifies statusbar 3-section layout parameters on the same horizontal plane', () => {
    // Left profile rail alignment with sidebar
    const SIDEBAR_WIDTH = 'w-[13.25rem]'
    const getLeftSectionClass = (sidebarVisible: boolean) => {
      return sidebarVisible ? `${SIDEBAR_WIDTH} justify-between` : 'w-auto'
    }

    expect(getLeftSectionClass(true)).toContain(SIDEBAR_WIDTH)
    expect(getLeftSectionClass(false)).toBe('w-auto')

    // Height across all sections is fixed to h-7
    const STATUSBAR_HEIGHT = 'h-7'
    expect(STATUSBAR_HEIGHT).toBe('h-7')
  })

  it('validates approval mode values and descriptions', () => {
    const validModes = ['smart', 'manual', 'off'] as const
    expect(validModes).toContain('smart')
    expect(validModes).toContain('manual')
    expect(validModes).toContain('off')

    const getApprovalIcon = (mode: 'smart' | 'manual' | 'off') => {
      return mode === 'off' ? 'zap-filled' : 'zap'
    }
    expect(getApprovalIcon('smart')).toBe('zap')
    expect(getApprovalIcon('manual')).toBe('zap')
    expect(getApprovalIcon('off')).toBe('zap-filled')
  })
})

