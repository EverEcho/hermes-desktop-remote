import { describe, expect, it } from 'vitest'
import { isMessagingSessionSource } from '@/sessions/store'
import type { SessionInfo } from '@/types/hermes'

describe('session categorization and project grouping', () => {
  it('correctly identifies messaging platform sources vs interactive sources', () => {
    // Messaging platforms
    expect(isMessagingSessionSource('weixin')).toBe(true)
    expect(isMessagingSessionSource('wechatpad')).toBe(true)
    expect(isMessagingSessionSource('telegram')).toBe(true)
    expect(isMessagingSessionSource('slack')).toBe(true)
    expect(isMessagingSessionSource('feishu')).toBe(true)

    // Interactive user sources must NOT be treated as messaging
    expect(isMessagingSessionSource('desktop')).toBe(false)
    expect(isMessagingSessionSource('tui')).toBe(false)
    expect(isMessagingSessionSource('cli')).toBe(false)
    expect(isMessagingSessionSource('mobile')).toBe(false)
    expect(isMessagingSessionSource(null)).toBe(false)
    expect(isMessagingSessionSource(undefined)).toBe(false)
    expect(isMessagingSessionSource('cron')).toBe(false)
  })

  it('groups interactive sessions with cwd into projects and detached sessions into home', () => {
    const sessions: Partial<SessionInfo>[] = [
      { id: '1', title: 'Freelo task 1', source: 'desktop', cwd: '/data/code/freelo' },
      { id: '2', title: 'Freelo task 2', source: 'tui', cwd: '/data/code/freelo' },
      { id: '3', title: 'Home chat', source: 'desktop', cwd: null },
      { id: '4', title: 'Cron job', source: 'cron', cwd: null },
      { id: '5', title: 'WeChat chat', source: 'weixin', cwd: null }
    ]

    const interactive = sessions.filter(
      s => s.source !== 'cron' && !isMessagingSessionSource(s.source)
    )
    expect(interactive.map(s => s.id)).toEqual(['1', '2', '3'])

    const projectsMap = new Map<string, typeof sessions>()
    for (const s of interactive.filter(s => Boolean(s.cwd))) {
      const name = s.cwd!.split('/').filter(Boolean).pop() || 'default'
      projectsMap.set(name, [...(projectsMap.get(name) || []), s])
    }

    const homeSessions = interactive.filter(s => !s.cwd)

    expect([...projectsMap.keys()]).toEqual(['freelo'])
    expect(projectsMap.get('freelo')?.length).toBe(2)
    expect(homeSessions.length).toBe(1)
    expect(homeSessions[0].id).toBe('3')
  })
})
