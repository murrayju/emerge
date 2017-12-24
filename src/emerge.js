// # Glossary
//
// put               = replace value, attempting to preserve old references
// patch             = same as put, but if both input values are dicts,
//                     combines their properties
// merge             = deep patch that combines dict properties at all levels
// nil               = null | undefined
// value             = primitive | list | plain dict
//
// # Internal glossary
//
// assoc = insert value at key or path, using an equality check to attempt to
//         preserve old references (weaker than put or patch)
//
// # Rules
//
// When making new values, omit nil properties.
//
// Treat non-value objects atomically: include and replace them entirely,
// without cloning or attempting to reuse their properties.
//
// # TODO
//
// Add benchmarks with real-life data.

const {keys: getKeys, prototype: protoObject, getPrototypeOf} = Object
const {reduce, filter, slice} = Array.prototype

/**
 * Boolean
 */

export function is (one, other) {
  return one === other || (one !== one && other !== other)  // eslint-disable-line no-self-compare
}

export function equal (one, other) {
  return equalBy(equal, one, other)
}

export function equalBy (test, one, other) {
  validate(isFunction, test)
  return is(one, other) || (
    isList(one) && isList(other)
    ? everyListPair(test, one, other)
    : isDict(one) && isDict(other)
    ? everyDictPair(test, one, other)
    : false
  )
}

/**
 * Get
 */

export function get (value, key) {
  return value == null ? undefined : value[key]
}

export function scan () {
  return arguments.length ? reduce.call(arguments, get) : undefined
}

export function getIn (value, path) {
  return reduce.call(path, get, value)
}

export function getAt (path, value) {
  return reduce.call(path, get, value)
}

/**
 * Merge
 */

export function put (prev, next) {
  return putBy(put, prev, next)
}

export function patch (prev, next) {
  return patchBy(put, prev, next)
}

export function merge (prev, next) {
  return patchBy(merge, prev, next)
}

export function putIn (prev, path, next) {
  validate(isPath, path)
  return assocIn(prev, path, put(getIn(prev, path), next))
}

export function patchIn (prev, path, next) {
  validate(isPath, path)
  return assocIn(prev, path, patch(getIn(prev, path), next))
}

export function mergeIn (prev, path, next) {
  validate(isPath, path)
  return assocIn(prev, path, merge(getIn(prev, path), next))
}

export function putBy (fun, prev, next) {
  return (
    is(prev, next)
    ? prev
    : isList(prev) && isList(next)
    ? putListBy(fun, prev, next)
    : isDict(prev) && isDict(next)
    ? putDictBy(fun, prev, next)
    : next
  )
}

export function patchBy (fun, prev, next) {
  return (
    is(prev, next)
    ? prev
    : isList(prev) && isList(next)
    ? putListBy(fun, prev, next)
    : isDict(prev) && isDict(next)
    ? patchDictBy(fun, prev, next)
    : next
  )
}

export function putInBy (prev, path, fun) {
  validate(isFunction, fun)
  return putIn(prev, path, fun(getIn(prev, path), ...slice.call(arguments, 3)))
}

export function patchDicts () {
  return filter.call(arguments, isDict).reduce(patch, {})
}

export function mergeDicts () {
  return filter.call(arguments, isDict).reduce(merge, {})
}

/**
 * Procedural Merge
 *
 * TODO convert to functional style where possible
 */

function putListBy (fun, prev, next) {
  const out = Array(next.length)
  for (let i = -1; (i += 1) < next.length;) out[i] = fun(prev[i], next[i], i)
  return preserveBy(is, prev, out)
}

function putDictBy (fun, prev, next) {
  const out = {}
  const nextKeys = getKeys(next)
  for (let i = -1; (i += 1) < nextKeys.length;) {
    const key = nextKeys[i]
    const piece = fun(prev[key], next[key], key)
    if (piece != null) out[key] = piece
  }
  return preserveBy(is, prev, out)
}

function patchDictBy (fun, prev, next) {
  const out = {}
  const prevKeys = getKeys(prev)
  for (let i = -1; (i += 1) < prevKeys.length;) {
    const key = prevKeys[i]
    if (!(key in next) && prev[key] != null) out[key] = prev[key]
  }
  const nextKeys = getKeys(next)
  for (let i = -1; (i += 1) < nextKeys.length;) {
    const key = nextKeys[i]
    const piece = fun(prev[key], next[key], key)
    if (piece != null) out[key] = piece
  }
  return preserveBy(is, prev, out)
}

function assocIn (prev, path, next) {
  validate(isPath, path)
  if (is(getIn(prev, path), next)) return prev
  return preserveBy(is, prev, (
    !path.length
    ? next
    : assoc(prev, path[0], assocIn(get(prev, path[0]), slice.call(path, 1), next))
  ))
}

function assoc (prev, key, next) {
  return (
    get(prev, key) == null && next == null
    ? prev
    : isListWithIndex(prev, key)
    ? assocOnList(prev, key, next)
    : assocOnDict(toDict(prev), key, next)
  )
}

// Assumes isListWithIndex(list, index)
function assocOnList (list, index, value) {
  if (index < list.length && is(list[index], value)) return list
  const out = list.slice()
  out[index] = value
  return out
}

function assocOnDict (dict, maybeKey, value) {
  const key = String(maybeKey)
  if (is(dict[key], value)) return dict
  if (!(key in dict) && value == null) return dict
  const out = {}
  const oldKeys = getKeys(dict)
  for (let i = -1; (i += 1) < oldKeys.length;) {
    const oldkey = oldKeys[i]
    if (oldkey !== key && dict[oldkey] != null) out[oldkey] = dict[oldkey]
  }
  if (value != null) out[key] = value
  return out
}

/**
 * Utils
 */

function isPrimitive (value) {
  return !isObject(value) && !isFunction(value)
}

function isObject (value) {
  return value !== null && typeof value === 'object'
}

function isList (value) {
  return isSpecialObject(value) && isNatural(value.length)
}

function isDict (value) {
  return isObject(value) && isPlainPrototype(getPrototypeOf(value))
}

function isSpecialObject (value) {
  return isObject(value) && (!isPlainPrototype(getPrototypeOf(value)) || isArguments(value))
}

function isPlainPrototype (value) {
  return value === null || value === protoObject
}

function isArguments (value) {
  return isObject(value) && 'callee' in value && isNatural(value.length)
}

function isFunction (value) {
  return typeof value === 'function'
}

function isNatural (value) {
  return typeof value === 'number' && value >= 0 && value % 1 === 0
}

function isPath (value) {
  return isList(value) && value.every(isPrimitive)
}

// allowed range: within bounds + 1 to allow append
function isListWithIndex (value, key) {
  return isList(value) && isNatural(key) && key <= value.length
}

function everyListPair (fun, one, other) {
  return one.length === other.length && everyBy(compareByIndex, one, fun, other)
}

function compareByIndex (value, index, fun, list) {
  return fun(value, list[index])
}

function everyDictPair (fun, one, other) {
  const keys = getKeys(one)
  return (
    keys.length === getKeys(other).length &&
    // Breadth-first check in case a key has been added or removed
    everyBy(has, keys, other) &&
    // Now a depth-first comparison
    everyBy(compareByKey, keys, fun, one, other)
  )
}

function has (key, _index, dict) {
  return key in dict
}

function compareByKey (key, _index, fun, one, other) {
  return fun(one[key], other[key])
}

function everyBy (fun, list, a, b, c) {
  for (let i = -1; (i += 1) < list.length;) if (!fun(list[i], i, a, b, c)) return false
  return true
}

function toDict (value) {
  return isDict(value) ? value : {}
}

function validate (test, value) {
  if (!test(value)) throw Error(`Expected ${value} to satisfy test ${test.name}`)
}

function preserveBy (fun, prev, next) {
  return equalBy(fun, prev, next) ? prev : next
}