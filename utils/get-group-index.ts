import type { GroupsOptions } from '../types/common-options'
import type { SortingNode } from '../types/sorting-node'

type Group = GroupsOptions<string>[number]

export function getGroupIndex(groups: Group[], node: SortingNode): number {
  for (let max = groups.length, i = 0; i < max; i++) {
    let currentGroup = groups[i]

    if (
      node.group === currentGroup ||
      (Array.isArray(currentGroup) &&
        typeof node.group === 'string' &&
        currentGroup.includes(node.group))
    ) {
      return i
    }
  }

  return groups.length
}
