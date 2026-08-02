import { useMemo } from 'react'
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { cn } from '@/ui/utils'

export function MarkdownContent({ content, className }: { content: string; className?: string }) {
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(content || '', { async: false }) as string), [content])

  return (
    <div
      className={cn('mobile-markdown text-(--ui-text-primary)', className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
