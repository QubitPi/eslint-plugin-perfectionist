import type { RuleContext } from '@typescript-eslint/utils/ts-eslint'
import type { TSESTree } from '@typescript-eslint/types'

import type {
  DeprecatedCustomGroupsOption,
  CommonOptions,
  GroupsOptions,
} from '../types/common-options'
import type { SortingNode } from '../types/sorting-node'

import {
  deprecatedCustomGroupsJsonSchema,
  commonJsonSchemas,
  groupsJsonSchema,
} from '../utils/common-json-schemas'
import { validateGeneratedGroupsConfiguration } from '../utils/validate-generated-groups-configuration'
import { validateCustomSortConfiguration } from '../utils/validate-custom-sort-configuration'
import { getEslintDisabledLines } from '../utils/get-eslint-disabled-lines'
import { isNodeEslintDisabled } from '../utils/is-node-eslint-disabled'
import { GROUP_ORDER_ERROR, ORDER_ERROR } from '../utils/report-errors'
import { sortNodesByGroups } from '../utils/sort-nodes-by-groups'
import { createEslintRule } from '../utils/create-eslint-rule'
import { reportAllErrors } from '../utils/report-all-errors'
import { computeGroup } from '../utils/compute-group'
import { rangeToDiff } from '../utils/range-to-diff'
import { getSettings } from '../utils/get-settings'
import { isSortable } from '../utils/is-sortable'
import { complete } from '../utils/complete'

export type Options = [
  Partial<
    {
      customGroups: DeprecatedCustomGroupsOption
      groups: GroupsOptions<Group>
    } & CommonOptions
  >,
]

type MESSAGE_ID =
  | 'unexpectedHeritageClausesGroupOrder'
  | 'unexpectedHeritageClausesOrder'

type Group = 'unknown' | string

let defaultOptions: Required<Options[0]> = {
  fallbackSort: { type: 'unsorted' },
  specialCharacters: 'keep',
  type: 'alphabetical',
  ignoreCase: true,
  customGroups: {},
  locales: 'en-US',
  alphabet: '',
  order: 'asc',
  groups: [],
}

export default createEslintRule<Options, MESSAGE_ID>({
  meta: {
    schema: [
      {
        properties: {
          ...commonJsonSchemas,
          customGroups: deprecatedCustomGroupsJsonSchema,
          groups: groupsJsonSchema,
        },
        additionalProperties: false,
        type: 'object',
      },
    ],
    docs: {
      url: 'https://perfectionist.dev/rules/sort-heritage-clauses',
      description: 'Enforce sorted heritage clauses.',
      recommended: true,
    },
    messages: {
      unexpectedHeritageClausesGroupOrder: GROUP_ORDER_ERROR,
      unexpectedHeritageClausesOrder: ORDER_ERROR,
    },
    type: 'suggestion',
    fixable: 'code',
  },
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
      TSInterfaceDeclaration: declaration =>
        sortHeritageClauses(context, options, declaration.extends),
      ClassDeclaration: declaration =>
        sortHeritageClauses(context, options, declaration.implements),
    }
  },
  defaultOptions: [defaultOptions],
  name: 'sort-heritage-clauses',
})

function sortHeritageClauses(
  context: Readonly<RuleContext<MESSAGE_ID, Options>>,
  options: Required<Options[0]>,
  heritageClauses:
    | TSESTree.TSInterfaceHeritage[]
    | TSESTree.TSClassImplements[]
    | undefined,
): void {
  if (!isSortable(heritageClauses)) {
    return
  }
  let { sourceCode, id } = context
  let eslintDisabledLines = getEslintDisabledLines({
    ruleName: id,
    sourceCode,
  })

  let nodes: SortingNode[] = heritageClauses.map(heritageClause => {
    let name = getHeritageClauseExpressionName(heritageClause.expression)

    let group = computeGroup({
      predefinedGroups: [],
      options,
      name,
    })
    return {
      isEslintDisabled: isNodeEslintDisabled(
        heritageClause,
        eslintDisabledLines,
      ),
      size: rangeToDiff(heritageClause, sourceCode),
      node: heritageClause,
      partitionId: 0,
      group,
      name,
    }
  })

  function sortNodesExcludingEslintDisabled(
    ignoreEslintDisabledNodes: boolean,
  ): SortingNode[] {
    return sortNodesByGroups({
      getOptionsByGroupIndex: () => ({ options }),
      ignoreEslintDisabledNodes,
      groups: options.groups,
      nodes,
    })
  }

  reportAllErrors<MESSAGE_ID>({
    availableMessageIds: {
      unexpectedGroupOrder: 'unexpectedHeritageClausesGroupOrder',
      unexpectedOrder: 'unexpectedHeritageClausesOrder',
    },
    sortNodesExcludingEslintDisabled,
    sourceCode,
    options,
    context,
    nodes,
  })
}

function getHeritageClauseExpressionName(
  expression: TSESTree.PrivateIdentifier | TSESTree.Expression,
): string {
  if (expression.type === 'Identifier') {
    return expression.name
  }
  if ('property' in expression) {
    return getHeritageClauseExpressionName(expression.property)
    /* v8 ignore start - should never throw */
  }
  throw new Error(
    'Unexpected heritage clause expression. Please report this issue ' +
      'here: https://github.com/azat-io/eslint-plugin-perfectionist/issues',
  )
  /* v8 ignore end */
}
