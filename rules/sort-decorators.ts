import type { RuleContext } from '@typescript-eslint/utils/ts-eslint'
import type { TSESTree } from '@typescript-eslint/types'

import type {
  DeprecatedCustomGroupsOption,
  PartitionByCommentOption,
  CommonOptions,
  GroupsOptions,
} from '../types/common-options'
import type { SortingNode } from '../types/sorting-node'

import {
  deprecatedCustomGroupsJsonSchema,
  partitionByCommentJsonSchema,
  commonJsonSchemas,
  groupsJsonSchema,
} from '../utils/common-json-schemas'
import { validateGeneratedGroupsConfiguration } from '../utils/validate-generated-groups-configuration'
import { validateCustomSortConfiguration } from '../utils/validate-custom-sort-configuration'
import { getEslintDisabledLines } from '../utils/get-eslint-disabled-lines'
import { isNodeEslintDisabled } from '../utils/is-node-eslint-disabled'
import { GROUP_ORDER_ERROR, ORDER_ERROR } from '../utils/report-errors'
import { sortNodesByGroups } from '../utils/sort-nodes-by-groups'
import { getNodeDecorators } from '../utils/get-node-decorators'
import { getDecoratorName } from '../utils/get-decorator-name'
import { createEslintRule } from '../utils/create-eslint-rule'
import { reportAllErrors } from '../utils/report-all-errors'
import { shouldPartition } from '../utils/should-partition'
import { computeGroup } from '../utils/compute-group'
import { rangeToDiff } from '../utils/range-to-diff'
import { getSettings } from '../utils/get-settings'
import { isSortable } from '../utils/is-sortable'
import { complete } from '../utils/complete'

export type Options = [
  Partial<
    {
      partitionByComment: PartitionByCommentOption
      customGroups: DeprecatedCustomGroupsOption
      groups: GroupsOptions<Group>
      sortOnParameters: boolean
      sortOnProperties: boolean
      sortOnAccessors: boolean
      sortOnMethods: boolean
      sortOnClasses: boolean
    } & CommonOptions
  >,
]

type MESSAGE_ID = 'unexpectedDecoratorsGroupOrder' | 'unexpectedDecoratorsOrder'

type SortDecoratorsSortingNode = SortingNode<TSESTree.Decorator>

type Group = 'unknown' | string

let defaultOptions: Required<Options[0]> = {
  fallbackSort: { type: 'unsorted' },
  specialCharacters: 'keep',
  partitionByComment: false,
  sortOnProperties: true,
  sortOnParameters: true,
  sortOnAccessors: true,
  type: 'alphabetical',
  sortOnClasses: true,
  sortOnMethods: true,
  ignoreCase: true,
  customGroups: {},
  locales: 'en-US',
  alphabet: '',
  order: 'asc',
  groups: [],
}

export default createEslintRule<Options, MESSAGE_ID>({
  create: context => {
    let settings = getSettings(context.settings)

    let options = complete(context.options.at(0), settings, defaultOptions)
    validateCustomSortConfiguration(options)
    validateGeneratedGroupsConfiguration({
      selectors: [],
      modifiers: [],
      options,
    })

    return {
      Decorator: decorator => {
        if (!options.sortOnParameters) {
          return
        }
        if (
          'decorators' in decorator.parent &&
          decorator.parent.type === 'Identifier' &&
          decorator.parent.parent.type === 'FunctionExpression'
        ) {
          let { decorators } = decorator.parent
          if (decorator !== decorators[0]) {
            return
          }
          sortDecorators(context, options, decorators)
        }
      },
      PropertyDefinition: propertyDefinition =>
        options.sortOnProperties
          ? sortDecorators(
              context,
              options,
              getNodeDecorators(propertyDefinition),
            )
          : null,
      AccessorProperty: accessorDefinition =>
        options.sortOnAccessors
          ? sortDecorators(
              context,
              options,
              getNodeDecorators(accessorDefinition),
            )
          : null,
      MethodDefinition: methodDefinition =>
        options.sortOnMethods
          ? sortDecorators(
              context,
              options,
              getNodeDecorators(methodDefinition),
            )
          : null,
      ClassDeclaration: declaration =>
        options.sortOnClasses
          ? sortDecorators(context, options, getNodeDecorators(declaration))
          : null,
    }
  },
  meta: {
    schema: [
      {
        properties: {
          ...commonJsonSchemas,
          sortOnParameters: {
            description:
              'Controls whether sorting should be enabled for method parameter decorators.',
            type: 'boolean',
          },
          sortOnProperties: {
            description:
              'Controls whether sorting should be enabled for class property decorators.',
            type: 'boolean',
          },
          sortOnAccessors: {
            description:
              'Controls whether sorting should be enabled for class accessor decorators.',
            type: 'boolean',
          },
          sortOnMethods: {
            description:
              'Controls whether sorting should be enabled for class method decorators.',
            type: 'boolean',
          },
          sortOnClasses: {
            description:
              'Controls whether sorting should be enabled for class decorators.',
            type: 'boolean',
          },
          partitionByComment: partitionByCommentJsonSchema,
          customGroups: deprecatedCustomGroupsJsonSchema,
          groups: groupsJsonSchema,
        },
        additionalProperties: false,
        type: 'object',
      },
    ],
    docs: {
      url: 'https://perfectionist.dev/rules/sort-decorators',
      description: 'Enforce sorted decorators.',
      recommended: true,
    },
    messages: {
      unexpectedDecoratorsGroupOrder: GROUP_ORDER_ERROR,
      unexpectedDecoratorsOrder: ORDER_ERROR,
    },
    type: 'suggestion',
    fixable: 'code',
  },
  defaultOptions: [defaultOptions],
  name: 'sort-decorators',
})

function sortDecorators(
  context: Readonly<RuleContext<MESSAGE_ID, Options>>,
  options: Required<Options[0]>,
  decorators: TSESTree.Decorator[],
): void {
  if (!isSortable(decorators)) {
    return
  }
  let { sourceCode, id } = context
  let eslintDisabledLines = getEslintDisabledLines({
    ruleName: id,
    sourceCode,
  })

  let formattedMembers: SortDecoratorsSortingNode[][] = decorators.reduce(
    (accumulator: SortDecoratorsSortingNode[][], decorator) => {
      let name = getDecoratorName({
        sourceCode,
        decorator,
      })

      let group = computeGroup({
        predefinedGroups: [],
        options,
        name,
      })

      let sortingNode: Omit<SortDecoratorsSortingNode, 'partitionId'> = {
        isEslintDisabled: isNodeEslintDisabled(decorator, eslintDisabledLines),
        size: rangeToDiff(decorator, sourceCode),
        node: decorator,
        group,
        name,
      }

      let lastSortingNode = accumulator.at(-1)?.at(-1)
      if (
        shouldPartition({
          lastSortingNode,
          sortingNode,
          sourceCode,
          options,
        })
      ) {
        accumulator.push([])
      }

      accumulator.at(-1)!.push({
        ...sortingNode,
        partitionId: accumulator.length,
      })

      return accumulator
    },
    [[]],
  )

  function sortNodesExcludingEslintDisabled(
    ignoreEslintDisabledNodes: boolean,
  ): SortDecoratorsSortingNode[] {
    return formattedMembers.flatMap(nodes =>
      sortNodesByGroups({
        getOptionsByGroupIndex: () => ({ options }),
        ignoreEslintDisabledNodes,
        groups: options.groups,
        nodes,
      }),
    )
  }
  let nodes = formattedMembers.flat()

  reportAllErrors<MESSAGE_ID>({
    availableMessageIds: {
      unexpectedGroupOrder: 'unexpectedDecoratorsGroupOrder',
      unexpectedOrder: 'unexpectedDecoratorsOrder',
    },
    ignoreFirstNodeHighestBlockComment: true,
    sortNodesExcludingEslintDisabled,
    sourceCode,
    options,
    context,
    nodes,
  })
}
