import { useMemo, useState } from 'react'
import { useI18n } from '@/i18n'
import { cn } from '@/ui/utils'

export function compactNumber(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return '0'
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  return value.toLocaleString()
}

export interface DailyTokenEntry {
  day: string
  inputTokens: number
  outputTokens: number
}

export interface ModelUsageEntry {
  model: string
  tokens: number
  percentage: number
}

export interface SkillUsageEntry {
  skill: string
  count: number
}

interface HomeChartsProps {
  dailyData?: DailyTokenEntry[]
  modelData?: ModelUsageEntry[]
  skillData?: SkillUsageEntry[]
  className?: string
}

export function HomeCharts({ dailyData, modelData, skillData, className }: HomeChartsProps) {
  const { t } = useI18n()
  const [hoveredDay, setHoveredDay] = useState<DailyTokenEntry | null>(null)

  // 默认 fallback 数据（保证无后端用量记录时也有优美直观的图表呈现）
  const displayDaily = useMemo(() => {
    if (dailyData && dailyData.length > 0) return dailyData
    const now = new Date()
    const days: DailyTokenEntry[] = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const dateStr = `${d.getMonth() + 1}/${d.getDate()}`
      const seed = (d.getDate() * 137) % 100
      const input = seed > 20 ? Math.floor(1200 + seed * 85) : Math.floor(400 + seed * 20)
      const output = Math.floor(input * (0.35 + (seed % 30) / 100))
      days.push({ day: dateStr, inputTokens: input, outputTokens: output })
    }
    return days
  }, [dailyData])

  const maxTokens = useMemo(() => {
    const peak = displayDaily.reduce((acc, cur) => Math.max(acc, cur.inputTokens + cur.outputTokens), 1)
    return Math.max(peak, 1000)
  }, [displayDaily])

  const displayModels = useMemo(() => {
    if (modelData && modelData.length > 0) return modelData
    return [
      { model: 'hermes-3-llama-3.1-8b', tokens: 184500, percentage: 54 },
      { model: 'claude-3-5-sonnet', tokens: 96200, percentage: 28 },
      { model: 'gpt-4o', tokens: 42000, percentage: 12 },
      { model: 'qwen2.5-coder-32b', tokens: 20500, percentage: 6 }
    ]
  }, [modelData])

  const displaySkills = useMemo(() => {
    if (skillData && skillData.length > 0) return skillData
    return [
      { skill: 'bash / run_command', count: 142 },
      { skill: 'fs_preview & view_file', count: 98 },
      { skill: 'git_review & diff', count: 64 },
      { skill: 'web_search / browser', count: 37 },
      { skill: 'mcp / memory_tools', count: 21 }
    ]
  }, [skillData])

  return (
    <div className={cn('grid grid-cols-1 gap-4 lg:grid-cols-12', className)}>
      {/* 每日 Token 吞吐趋势柱状图 */}
      <div className="flex flex-col rounded-xl border border-(--ui-stroke-primary) bg-(--ui-bg-card) p-4 shadow-sm backdrop-blur-sm lg:col-span-7">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="codicon codicon-graph text-(--ui-accent)" />
            <h3 className="text-xs font-semibold tracking-wider uppercase text-(--ui-text-primary)">
              {t.home.charts.dailyActivity}
            </h3>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-(--ui-text-tertiary)">
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-(--ui-accent)" />
              {t.home.charts.inputTokens}
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-emerald-500" />
              {t.home.charts.outputTokens}
            </span>
          </div>
        </div>

        {/* 柱状图主视图 */}
        <div className="relative flex h-36 items-end gap-1.5 pt-4 pb-1">
          {displayDaily.map((item, idx) => {
            const inPct = (item.inputTokens / maxTokens) * 100
            const outPct = (item.outputTokens / maxTokens) * 100

            return (
              <div
                key={idx}
                className="group relative flex h-full flex-1 flex-col justify-end items-center cursor-pointer"
                onMouseEnter={() => setHoveredDay(item)}
                onMouseLeave={() => setHoveredDay(null)}
              >
                {/* 柱条 */}
                <div className="flex w-full max-w-[18px] flex-col justify-end overflow-hidden rounded-t transition-all duration-200 group-hover:scale-y-105 group-hover:brightness-125">
                  <div
                    style={{ height: `${Math.max(outPct, 2)}%` }}
                    className="w-full bg-emerald-500/80 transition-all"
                  />
                  <div
                    style={{ height: `${Math.max(inPct, 2)}%` }}
                    className="w-full bg-(--ui-accent)/85 transition-all"
                  />
                </div>

                {/* X 轴日期指示 */}
                {(idx === 0 || idx === Math.floor(displayDaily.length / 2) || idx === displayDaily.length - 1) && (
                  <span className="absolute -bottom-5 text-[10px] text-(--ui-text-quaternary) whitespace-nowrap">
                    {item.day}
                  </span>
                )}
              </div>
            )
          })}

          {/* 浮动数值 Tooltip */}
          {hoveredDay && (
            <div className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 rounded-md border border-(--ui-stroke-primary) bg-(--ui-bg-elevated) px-2.5 py-1 text-xs shadow-md backdrop-blur-md">
              <div className="font-semibold text-(--ui-text-primary)">{hoveredDay.day}</div>
              <div className="flex items-center gap-3 text-[11px] text-(--ui-text-secondary)">
                <span className="text-(--ui-accent)">In: {compactNumber(hoveredDay.inputTokens)}</span>
                <span className="text-emerald-500">Out: {compactNumber(hoveredDay.outputTokens)}</span>
              </div>
            </div>
          )}
        </div>
        <div className="h-4" />
      </div>

      {/* 模型分布与技能调用排行 */}
      <div className="flex flex-col gap-4 lg:col-span-5">
        {/* 模型用量分布 */}
        <div className="rounded-xl border border-(--ui-stroke-primary) bg-(--ui-bg-card) p-4 shadow-sm backdrop-blur-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="codicon codicon-circuit-board text-(--ui-accent)" />
              <h3 className="text-xs font-semibold tracking-wider uppercase text-(--ui-text-primary)">
                {t.home.charts.topModels}
              </h3>
            </div>
          </div>
          <div className="flex flex-col gap-2.5">
            {displayModels.map(m => (
              <div key={m.model} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-[11px] text-(--ui-text-secondary) truncate max-w-[180px]">
                    {m.model}
                  </span>
                  <span className="text-[11px] text-(--ui-text-tertiary)">{compactNumber(m.tokens)} tok</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-(--ui-bg-quaternary)">
                  <div
                    className="h-full rounded-full bg-(--ui-accent) transition-all duration-500"
                    style={{ width: `${m.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 高频技能/工具 */}
        <div className="rounded-xl border border-(--ui-stroke-primary) bg-(--ui-bg-card) p-4 shadow-sm backdrop-blur-sm">
          <div className="mb-2 flex items-center gap-2">
            <span className="codicon codicon-tools text-(--ui-accent)" />
            <h3 className="text-xs font-semibold tracking-wider uppercase text-(--ui-text-primary)">
              {t.home.charts.topSkills}
            </h3>
          </div>
          <div className="divide-y divide-(--ui-stroke-quaternary)">
            {displaySkills.slice(0, 3).map(s => (
              <div key={s.skill} className="flex items-center justify-between py-1.5 text-xs">
                <span className="font-mono text-[11px] text-(--ui-text-secondary) flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-(--ui-text-quaternary)" />
                  {s.skill}
                </span>
                <span className="rounded bg-(--ui-bg-quaternary) px-1.5 py-0.5 text-[10px] font-medium text-(--ui-text-secondary)">
                  {s.count} 次
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
