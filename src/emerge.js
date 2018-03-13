// # Glossary
//
// put               = replace property by key or index, attempting to preserve old references
// patch             = combines dicts, preserving old references where possible
// merge             = deep patch that combines dicts at all levels
// nil               = null | undefined
// value             = primitive | list | plain dict
//
//
// # Internal glossary
//
// assoc = insert value at key or path without attempting to preserve references
//         (weaker than put or patch)
//
//
// # Rules
//
// When making new values, omit nil properties.
//
// Treat non-value objects atomically: include and replace them entirely,
// without cloning or attempting to reuse their properties.
//
//
// # Performance notes
//
// Emerge seeks a balance of performance and simplicity.
//
// `put`, `patch` and derivatives tend to speculatively create a copy before
// testing for equality and possibly throwing it away. Should revisit the code
// and avoid this if possible.
//
// `putIn` could be defined as recursive `put`, but would be significantly
// slower due to redundant equality checks on every level. Instead, we put
// and check once, then assoc faster.
//
// Overhead of rest/spread in V8 at the time of writing (measured on empty function):
//
//   1) no rest/spread: 1x
//   2) native: ≈8x
//   3) partial arg copying and apply: ≈28x
//   4) arg slicing and apply: ≈56x
//   5) partial arg copying and concat-apply (Babel output): ≈100x
//   6) arg slicing and concat-apply: ≈130x
//
// Currently using (1). Will probably switch to (3) after anyone runs into the
// argument limit and complains.
//
// Argument allocation from things like `reduce.call(arguments)` seems cheap
// enough.
//
//
// # TODO
//
// Add benchmarks with large real-world data.

const {keys: getKeys, prototype: protoObject, getPrototypeOf} = Object
const {hasOwnProperty} = protoObject
const {reduce, slice} = Array.prototype

/**
 * Boolean
 */

export function is(one, other) {
  return one === other || (isNaN(one) && isNaN(other))
}

export function equal(one, other) {
  return equalBy(other, one, equal)
}

export function equalBy(one, other, fun) {
  validate(fun, isFunction)
  return is(one, other) || (
    isList(one)
    ? isList(other) && everyListPairBy(one, other, fun)
    : isDict(one)
    ? isDict(other) && everyDictPairBy(one, other, fun)
    : false
  )
}

/**
 * Get
 */

export function get(value, key) {
  return value == null ? undefined : value[key]
}

export function getIn(value, path) {
  return reduce.call(path, get, value)
}

export function scan() {
  return !arguments.length ? undefined : reduce.call(arguments, get)
}

/**
 * Update
 */

export function put(prev, key, value) {
  validate(key, isPrimitive)
  return assoc(prev, key, putAny(get(prev, key), value))
}

export function putIn(prev, path, next) {
  validate(path, isPath)
  return assocIn(prev, path, putAny(getIn(prev, path), next))
}

export function putBy(prev, key, fun, a, b, c, d, e, f, g, h, i, j) {
  validate(fun, isFunction)
  return put(prev, key, fun(get(prev, key), a, b, c, d, e, f, g, h, i, j))
}

export function putInBy(prev, path, fun, a, b, c, d, e, f, g, h, i, j) {
  validate(fun, isFunction)
  return putIn(prev, path, fun(getIn(prev, path), a, b, c, d, e, f, g, h, i, j))
}

export function patch(prev, next) {
  return arguments.length > 2 ? reduce.call(arguments, patchTwo) : patchTwo(prev, next)
}

export function merge(prev, next) {
  return arguments.length > 2 ? reduce.call(arguments, mergeTwo) : mergeTwo(prev, next)
}

export function insertAtIndex(list, index, value) {
  list = toList(list)
  validateBounds(list, index)
  list = slice.call(list)
  list.splice(index, 0, value)
  return list
}

export function removeAtIndex(list, index) {
  validate(index, isInteger)
  list = toList(list)
  if (isNatural(index) && index < list.length) {
    list = slice.call(list)
    list.splice(index, 1)
  }
  return list
}

/**
 * Update (internal)
 */

function putAny(prev, next) {
  return (
    is(prev, next)
    ? prev
    : isList(prev)
    ? (isList(next) ? replaceListBy(prev, next, putAny) : next)
    : isDict(prev)
    ? (isDict(next) ? replaceDictBy(prev, next, putAny) : next)
    : next
  )
}

function patchTwo(prev, next) {
  return is(prev, next)
    ? toDict(prev)
    : patchDictBy(toDict(prev), toDict(next), putAny)
}

function mergeTwo(prev, next) {
  return is(prev, next)
    ? toDict(prev)
    : patchDictBy(toDict(prev), toDict(next), mergeDictsOrPutAny)
}

function mergeDictsOrPutAny(prev, next) {
  return isDict(prev) || isDict(next) ? mergeTwo(prev, next) : putAny(prev, next)
}

function assoc(prev, key, next) {
  return isList(prev)
    ? assocAtIndex(prev, key, next)
    : assocAtKey(toDict(prev), key, next)
}

function assocIn(prev, path, next) {
  return !path.length ? next : assocInAt(prev, path, next, 0)
}

function assocInAt(prev, path, next, index) {
  const key = path[index]
  return index < path.length - 1
    ? assoc(prev, key, assocInAt(get(prev, key), path, next, index + 1))
    : assoc(prev, key, next)
}

function assocAtIndex(list, index, value) {
  validateBounds(list, index)
  if (index < list.length && is(list[index], value)) return list
  const out = slice.call(list)
  out[index] = value
  return out
}

function assocAtKey(dict, key, value) {
  key = toKey(key)
  if (value == null) {
    if (!has(dict, key)) return dict
  }
  else if (is(dict[key], value)) {
    return dict
  }
  const out = {}
  const prevKeys = getKeys(dict)
  for (let i = -1; (i += 1) < prevKeys.length;) {
    const prevKey = prevKeys[i]
    if (prevKey !== key && dict[prevKey] != null) out[prevKey] = dict[prevKey]
  }
  if (value != null) out[key] = value
  return out
}

function replaceListBy(prev, next, fun) {
  const out = Array(next.length)
  for (let i = -1; (i += 1) < next.length;) out[i] = fun(prev[i], next[i])
  return equalBy(prev, out, is) ? prev : out
}

function replaceDictBy(prev, next, fun) {
  const out = {}
  const nextKeys = getKeys(next)
  for (let i = -1; (i += 1) < nextKeys.length;) {
    const key = nextKeys[i]
    const value = fun(prev[key], next[key])
    if (value != null) out[key] = value
  }
  return equalBy(prev, out, is) ? prev : out
}

function patchDictBy(prev, next, fun) {
  const out = {}
  const prevKeys = getKeys(prev)
  for (let i = -1; (i += 1) < prevKeys.length;) {
    const key = prevKeys[i]
    if (prev[key] != null && !has(next, key)) out[key] = prev[key]
  }
  const nextKeys = getKeys(next)
  for (let i = -1; (i += 1) < nextKeys.length;) {
    const key = nextKeys[i]
    const value = fun(prev[key], next[key])
    if (value != null) out[key] = value
  }
  return equalBy(prev, out, is) ? prev : out
}

/**
 * Utils
 */

function isPrimitive(value) {
  return !isObject(value) && !isFunction(value)
}

function isNaN(value) {
  return value !== value  // eslint-disable-line no-self-compare
}

function isObject(value) {
  return value !== null && typeof value === 'object'
}

function isDict(value) {
  return isObject(value) && isPlainPrototype(getPrototypeOf(value))
}

function isPlainPrototype(value) {
  return value === null || value === protoObject
}

function isList(value) {
  return isObject(value) && (
    isArguments(value) ||
    (!isPlainPrototype(getPrototypeOf(value)) && isNatural(value.length))
  )
}

function isArguments(value) {
  return /* isObject(value) && */ isNatural(value.length) && has(value, 'callee')
}

function isFunction(value) {
  return typeof value === 'function'
}

function isInteger(value) {
  return typeof value === 'number' && (value % 1) === 0
}

function isNatural(value) {
  return isInteger(value) && value >= 0
}

function isPath(value) {
  return isList(value) && value.every(isPrimitive)
}

function everyListPairBy(one, other, fun) {
  return one.length === other.length && everyBy(one, compareAtIndexBy, other, fun)
}

function compareAtIndexBy(value, index, list, fun) {
  return fun(value, list[index])
}

function everyDictPairBy(one, other, fun) {
  const keys = getKeys(one)
  return (
    keys.length === getKeys(other).length &&
    // Breadth-first check in case a key has been added or removed
    everyBy(keys, hasAt, other) &&
    // Now a depth-first comparison
    everyBy(keys, compareAtKeyBy, fun, one, other)
  )
}

function hasAt(key, _index, dict) {
  return has(dict, key)
}

function has(value, key) {
  return hasOwnProperty.call(value, key)
}

function compareAtKeyBy(key, _index, fun, one, other) {
  return fun(one[key], other[key])
}

function everyBy(list, fun, a, b, c) {
  for (let i = -1; (i += 1) < list.length;) if (!fun(list[i], i, a, b, c)) return false
  return true
}

function toList(value) {
  return isList(value) ? value : []
}

function toDict(value) {
  return isDict(value) ? value : {}
}

function toKey(value) {
  return typeof value === 'symbol' ? value : String(value)
}

function validateBounds(list, index) {
  validate(index, isNatural)
  if (!(index <= list.length)) {
    throw Error(`Index ${index} out of bounds for length ${list.length}`)
  }
}

function validate(value, test) {
  if (!test(value)) throw Error(`Expected ${show(value)} to satisfy test ${show(test)}`)
}

function show(value) {
  return isFunction(value)
    ? (value.name || value.toString())
    : isList(value) || isDict(value)
    ? JSON.stringify(value)
    : String(value)
}
