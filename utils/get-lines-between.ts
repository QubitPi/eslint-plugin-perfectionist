import type { TSESLint } from '@typescript-eslint/utils'

import type { SortingNode } from '../types/sorting-node'

export function getLinesBetween(
  source: TSESLint.SourceCode,
  left: Pick<SortingNode, 'node'>,
  right: Pick<SortingNode, 'node'>,
): number {
  let linesBetween = source.lines.slice(
    left.node.loc.end.line,
    right.node.loc.start.line - 1,
  )

  return linesBetween.filter(line => line.trim().length === 0).length
}
