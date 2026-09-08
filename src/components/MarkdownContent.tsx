import { useMemo, type MouseEvent } from 'react'
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { cn } from '@/ui/utils'
import { openExternalUrl } from '@/native'

export function MarkdownContent({
  content,
  className,
  onPreview
}: {
  content: string
  className?: string
  onPreview?: (target: { kind: 'file' | 'url'; value: string }) => void
}) {
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(content || '', { async: false }) as string), [content])

  /* Links open in preview workbench or popup browser. */
  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest('a')

    if (!anchor) {
      return
    }

    const href = anchor.getAttribute('href')

    if (!href) {
      return
    }

    if (onPreview) {
      event.preventDefault()
      event.stopPropagation()
      if (/^https?:\/\//i.test(href)) {
        onPreview({ kind: 'url', value: href })
      } else {
        onPreview({ kind: 'file', value: href })
      }
      return
    }

    if (!/^https?:\/\//i.test(href)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    void openExternalUrl(href)
  }

  return (
    <div
      className={cn('mobile_markdown text-(--ui-text-primary)', className)}
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={handleClick}
    />
  )
}
