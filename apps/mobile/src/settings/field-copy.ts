export function defineFieldCopy(copy: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {}

  const visit = (node: Record<string, unknown>, prefix: string[]) => {
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'string') {
        result[[...prefix, key].join('.')] = value
      } else {
        visit(value as Record<string, unknown>, [...prefix, key])
      }
    }
  }

  visit(copy, [])

  return result
}
