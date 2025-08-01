import { compare as createNaturalCompare } from 'natural-orderby'

import type {
  SpecialCharactersOption,
  CommonOptions,
} from '../types/common-options'
import type { SortingNode } from '../types/sorting-node'

import { convertBooleanToSign } from './convert-boolean-to-sign'
import { UnreachableCaseError } from './unreachable-case-error'

export type NodeValueGetterFunction<T extends SortingNode> = (node: T) => string

interface CompareParameters<T extends SortingNode> {
  fallbackSortNodeValueGetter?: NodeValueGetterFunction<T> | null
  options: { maxLineLength?: number } & CommonOptions
  nodeValueGetter?: NodeValueGetterFunction<T> | null
  a: T
  b: T
}

type SortingFunction<T extends SortingNode> = (a: T, b: T) => number

type IndexByCharacters = Map<string, number>
let alphabetCache = new Map<string, IndexByCharacters>()

export function compare<T extends SortingNode>({
  fallbackSortNodeValueGetter,
  nodeValueGetter,
  options,
  a,
  b,
}: CompareParameters<T>): number {
  if (options.type === 'unsorted') {
    return 0
  }

  let finalNodeValueGetter = nodeValueGetter ?? ((node: T) => node.name)
  let compareValue = computeCompareValue({
    nodeValueGetter: finalNodeValueGetter,
    options,
    a,
    b,
  })

  if (compareValue) {
    return compareValue
  }

  let { fallbackSort, order } = options
  return computeCompareValue({
    options: {
      ...options,
      order: fallbackSort.order ?? order,
      type: fallbackSort.type,
    },
    nodeValueGetter: fallbackSortNodeValueGetter ?? finalNodeValueGetter,
    a,
    b,
  })
}

function getCustomSortingFunction<T extends SortingNode>(
  {
    specialCharacters,
    ignoreCase,
    alphabet,
  }: Pick<CommonOptions, 'specialCharacters' | 'ignoreCase' | 'alphabet'>,
  nodeValueGetter: NodeValueGetterFunction<T>,
): SortingFunction<T> {
  let formatString = getFormatStringFunction(ignoreCase, specialCharacters)
  let indexByCharacters = alphabetCache.get(alphabet)
  if (!indexByCharacters) {
    indexByCharacters = new Map()
    for (let [index, character] of [...alphabet].entries()) {
      indexByCharacters.set(character, index)
    }
    alphabetCache.set(alphabet, indexByCharacters)
  }
  return (aNode: T, bNode: T) => {
    let aValue = formatString(nodeValueGetter(aNode))
    let bValue = formatString(nodeValueGetter(bNode))
    let minLength = Math.min(aValue.length, bValue.length)
    // Iterate character by character.
    for (let i = 0; i < minLength; i++) {
      let aCharacter = aValue[i]!
      let bCharacter = bValue[i]!
      let indexOfA = indexByCharacters.get(aCharacter)
      let indexOfB = indexByCharacters.get(bCharacter)
      indexOfA ??= Infinity
      indexOfB ??= Infinity
      if (indexOfA !== indexOfB) {
        return convertBooleanToSign(indexOfA - indexOfB > 0)
      }
    }
    if (aValue.length === bValue.length) {
      return 0
    }
    return convertBooleanToSign(aValue.length - bValue.length > 0)
  }
}

function computeCompareValue<T extends SortingNode>({
  nodeValueGetter,
  options,
  a,
  b,
}: {
  options: { maxLineLength?: number } & CommonOptions
  nodeValueGetter: NodeValueGetterFunction<T>
  a: T
  b: T
}): number {
  let sortingFunction: SortingFunction<T>

  switch (options.type) {
    case 'alphabetical':
      sortingFunction = getAlphabeticalSortingFunction(options, nodeValueGetter)
      break
    case 'line-length':
      sortingFunction = getLineLengthSortingFunction()
      break
    case 'unsorted':
      return 0
    case 'natural':
      sortingFunction = getNaturalSortingFunction(options, nodeValueGetter)
      break
    case 'custom':
      sortingFunction = getCustomSortingFunction(options, nodeValueGetter)
      break
    /* v8 ignore next 2 */
    default:
      throw new UnreachableCaseError(options.type)
  }

  return convertBooleanToSign(options.order === 'asc') * sortingFunction(a, b)
}

function getFormatStringFunction(
  ignoreCase: boolean,
  specialCharacters: SpecialCharactersOption,
) {
  return (value: string) => {
    let valueToCompare = value
    if (ignoreCase) {
      valueToCompare = valueToCompare.toLowerCase()
    }
    switch (specialCharacters) {
      case 'remove':
        valueToCompare = valueToCompare.replaceAll(
          /[^a-z\u{C0}-\u{24F}\u{1E00}-\u{1EFF}]+/giu,
          '',
        )
        break
      case 'trim':
        valueToCompare = valueToCompare.replaceAll(
          /^[^a-z\u{C0}-\u{24F}\u{1E00}-\u{1EFF}]+/giu,
          '',
        )
        break
      case 'keep':
        break
      /* v8 ignore next 2 */
      default:
        throw new UnreachableCaseError(specialCharacters)
    }
    return valueToCompare.replaceAll(/\s/gu, '')
  }
}

function getNaturalSortingFunction<T extends SortingNode>(
  {
    specialCharacters,
    ignoreCase,
    locales,
  }: Pick<CommonOptions, 'specialCharacters' | 'ignoreCase' | 'locales'>,
  nodeValueGetter: NodeValueGetterFunction<T>,
): SortingFunction<T> {
  let naturalCompare = createNaturalCompare({
    locale: locales.toString(),
  })
  let formatString = getFormatStringFunction(ignoreCase, specialCharacters)
  return (aNode: T, bNode: T) =>
    naturalCompare(
      formatString(nodeValueGetter(aNode)),
      formatString(nodeValueGetter(bNode)),
    )
}

function getAlphabeticalSortingFunction<T extends SortingNode>(
  {
    specialCharacters,
    ignoreCase,
    locales,
  }: Pick<CommonOptions, 'specialCharacters' | 'ignoreCase' | 'locales'>,
  nodeValueGetter: NodeValueGetterFunction<T>,
): SortingFunction<T> {
  let formatString = getFormatStringFunction(ignoreCase, specialCharacters)
  return (aNode: T, bNode: T) =>
    formatString(nodeValueGetter(aNode)).localeCompare(
      formatString(nodeValueGetter(bNode)),
      locales,
    )
}

function getLineLengthSortingFunction<
  T extends SortingNode,
>(): SortingFunction<T> {
  return (aNode: T, bNode: T) => {
    let aSize = aNode.size
    let bSize = bNode.size
    return aSize - bSize
  }
}
