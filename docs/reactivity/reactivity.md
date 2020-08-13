## reactive

Reactivity Api是Vue3.x中创建响应式对象的核心api，它的基本实现原理是通过Proxy来拦截对象的操作，并由此收集依赖或派发更新。
Reactivity Api的实现并没有那么复杂，只需记住通过Reactivity Api创建的对象都是Proxy对象，它的核心api有以下几个:

1、reactive: 返回原始对象的Proxy代理对象，支持收集依赖和派发更新，访问自身属性时会执行嵌套对象的深度响应式转换。
2、shallowReactive: 返回原始对象的Proxy代理对象，但只拦截对象根层级的属性的操作，如果属性的值也是对象，不会对它进行响应式转换。
3、readonly: 返回原始对象的Proxy代理对象，限制赋值操作，访问它的任何嵌套属性也将是只读的。
4、shallowReadonly: 返回原始对象的Proxy代理对象，只限制对象根层级的属性的set操作，但不执行嵌套对象的深度只读转换。

Reactivity api除了支持基本的plain object和array外，还支持map、weakmap、set、weakset等collection的响应式化。我们可以通过它的测试用例来了解reactive以及它相关api的用法，这对我们学习源码很有帮助。

### 相关源码

``` js
// 定义了传入Proxy的原始对象target上可能出现的一些属性的类型，这里需要注意的是，传入的target可能是一个普通对象也可能是
// reactive对象或者readonly对象，那么就需要一些属性来判断target的类型
// 通过ReactiveFlags枚举了这些属性的名字，它们的含义如下:
// SKIP: 当原始对象target存在此属性则跳过只读或者响应式化
// IS_REACTIVE: 当此属性为true时，则target已经是一个reactive对象
// IS_READONLY: 当此属性为true时，则target已经是一个readonly对象
// RAW: 当target是一个reactive或者readonly对象时，通过此属性获得原始对象的值
// REACTIVE: 当原始对象target是一个普通对象，但是它已经被响应式化过了，通过此属性可获得target的响应式对象
// READONLY: 当原始对象target是一个普通对象，但是它已经被只读化过了，通过此属性可获得target的只读对象
export const enum ReactiveFlags {
  SKIP = '__v_skip',
  IS_REACTIVE = '__v_isReactive',
  IS_READONLY = '__v_isReadonly',
  RAW = '__v_raw',
  REACTIVE = '__v_reactive',
  READONLY = '__v_readonly'
}

interface Target {
  [ReactiveFlags.SKIP]?: boolean
  [ReactiveFlags.IS_REACTIVE]?: boolean
  [ReactiveFlags.IS_READONLY]?: boolean
  [ReactiveFlags.RAW]?: any
  [ReactiveFlags.REACTIVE]?: any
  [ReactiveFlags.READONLY]?: any
}

// isObservableType存放了可以响应式化的对象的类型
// 其中又区分了collectionTypes，它们的实现与普通的Object和Array不同，后面我们会细说

const collectionTypes = new Set<Function>([Set, Map, WeakMap, WeakSet])
const isObservableType = /*#__PURE__*/ makeMap(
  'Object,Array,Map,Set,WeakMap,WeakSet'
)

// 通过canObserve来判断一个对象是否能被响应式化，成为响应式对象必须满足以下条件:
// 1、对象上不存在ReactiveFlags.SKIP属性
// 2、它的类型必须是Object,Array,Map,Set,WeakMap,WeakSet中的一种
// 3、对象没有被冻结
const canObserve = (value: Target): boolean => {
  return (
    !value[ReactiveFlags.SKIP] &&
    isObservableType(toRawType(value)) &&
    !Object.isFrozen(value)
  )
}
```

接下来是几个创建响应式对象的api,这里重点注意创建不同类型的响应式对象的api返回的类型不同，关于类型的详细解析我们放到后面细讲。

``` js
// 通过reactive方法创建普通的mutable reactive，如果传入的对象上存在ReactiveFlags.IS_READONLY属性
// 也就是说它已经是一个只读的响应式对象，则直接返回，否则
// 通过调用createReactiveObject方法来创建响应式对象
// 这里要注意的是reactive方法返回的类型是UnwrapNestedRefs<T>，

export function reactive<T extends object>(target: T): UnwrapNestedRefs<T>
export function reactive(target: object) {
  // if trying to observe a readonly proxy, return the readonly version.
  if (target && (target as Target)[ReactiveFlags.IS_READONLY]) {
    return target
  }
  return createReactiveObject(
    target,
    false,
    mutableHandlers,
    mutableCollectionHandlers
  )
}

// 通过shallowReactive方法创建一个shallow reactive对象，我们已经在前面介绍过它
// 可以看到shallowReactive方法返回的类型和传入的类型T是一致的
export function shallowReactive<T extends object>(target: T): T {
  return createReactiveObject(
    target,
    false,
    shallowReactiveHandlers,
    shallowCollectionHandlers
  )
}

// 通过readonly方法创建一个readonly对象，我们已经在前面介绍过它
// 可以看到readonly方法返回的类型是DeepReadonly<UnwrapNestedRefs<T>>
export function readonly<T extends object>(
  target: T
): DeepReadonly<UnwrapNestedRefs<T>> {
  return createReactiveObject(
    target,
    true,
    readonlyHandlers,
    readonlyCollectionHandlers
  )
}

// 通过shallowReadonly方法创建一个shallow readonly对象，我们已经在前面介绍过它
// 可以看到shallowReadonly方法返回的类型是Readonly<{ [K in keyof T]: UnwrapNestedRefs<T[K]> }>
export function shallowReadonly<T extends object>(
  target: T
): Readonly<{ [K in keyof T]: UnwrapNestedRefs<T[K]> }> {
  return createReactiveObject(
    target,
    true,
    shallowReadonlyHandlers,
    readonlyCollectionHandlers
  )
}
```

不难看出以上的几个主要创建响应式对象的api都是内部调用了createReactiveObject方法，根据传入的参数不同来创建不同类型的响应式对象。

``` js
// 可以看到createReactiveObject方法传入了4个参数
// target: 传入的将要响应式化的原始对象，它可能是一个响应式对象也可能是普通对象
// isReadonly: 是否创建只读的响应式对象
// baseHandlers: 普通的Object和Array的proxy handles对象
// collectionHandlers: Map、Weakmap、Set、Weakset类型的proxy handles对象
// 后面我们会详细分析不同类型的响应式对象的baseHandlers和collectionHandlers的实现
function createReactiveObject(
  target: Target,
  isReadonly: boolean,
  baseHandlers: ProxyHandler<any>,
  collectionHandlers: ProxyHandler<any>
) {
  // 在开发环境中，如果传入的target不是对象，则发出警告并直接返回传入的target
  if (!isObject(target)) {
    if (__DEV__) {
      console.warn(`value cannot be made reactive: ${String(target)}`)
    }
    return target
  }

  // 当target上的ReactiveFlags.RAW属性的值存在，则证明target已经是一个reactive或者readonly对象
  // 那么当除了isReadonly为true并且target上的ReactiveFlags.IS_REACTIVE属性存在值时，都应该直接返回target
  // 意思就是说满足以下情况时都应该直接返回传入的target对象，也就是b === a
  // const a = reactive({})
  // const b = reactive(a)
  // 或
  // const a = readonly({})
  // const b = readonly(a)
  // 或
  // const a = readonly({})
  // const b = reactive(a)
  // 除了以下情况将一个reactive对象传入readonly api
  // const a = reactive({a: 1})
  // const b = readonly(a)
  // 此时会将proxy a作为target来创建proxy b
  // 这样当我们收集了b.a作为依赖时，就可以通过修改a.a的值来派发更新，这样作为只读对象的b也可以当做一个响应式对象来使用
  if (
    target[ReactiveFlags.RAW] &&
    !(isReadonly && target[ReactiveFlags.IS_REACTIVE])
  ) {
    return target
  }
  // 如果target已经响应式或者只读化过(这里注意和上面条件的区别)，那么target上应该存在
  // ReactiveFlags.READONLY或者ReactiveFlags.REACTIVE属性的值，如果存在直接返回属性的值
  // 也就是说多次传入origin，都应该返回同一reactive对象，也就是b === a
  // const origin = { a: 1}
  // const a = reactive(origin)
  // const b = reactive(origin)
  const reactiveFlag = isReadonly
    ? ReactiveFlags.READONLY
    : ReactiveFlags.REACTIVE
  if (hasOwn(target, reactiveFlag)) {
    return target[reactiveFlag]
  }
  // 最后一个条件，判断是否可以响应式或者只读化
  if (!canObserve(target)) {
    return target
  }
  // 传入target生成proxy对象，注意这里区分的collectionHandlers和baseHandlers
  const observed = new Proxy(
    target,
    collectionTypes.has(target.constructor) ? collectionHandlers : baseHandlers
  )
  将生成的proxy对象保存到target的ReactiveFlags.READONLY或者ReactiveFlags.REACTIVE属性上
  def(target, reactiveFlag, observed)
  return observed
}
```

## baseHandlers

当传入Reactivity Api的原始对象的类型是Object或者Array时，创建Proxy对象时传入的handlers为baseHandlers，
根据api不同，传入的baseHandlers也分为以下几种:

1、传入reactive api的mutableHandlers
2、传入shallowReactive api的shallowReactiveHandlers
3、传入readonly api的readonlyHandlers
4、传入shallowReadonly api的shallowReadonlyHandlers

baseHandles的代码存放在packages/src/reactivity/baseHandlers.ts中

### 相关源码

```js
// 获取Symbol对象上所有的内建symbol值
const builtInSymbols = new Set(
  Object.getOwnPropertyNames(Symbol)
    .map(key => (Symbol as any)[key])
    .filter(isSymbol)
)

// 定义了handles的get方法，它们都是调用createGetter方法生成的函数，只是传入的参数不同
const get = /*#__PURE__*/ createGetter()
const shallowGet = /*#__PURE__*/ createGetter(false, true)
const readonlyGet = /*#__PURE__*/ createGetter(true)
const shallowReadonlyGet = /*#__PURE__*/ createGetter(true, true)

// 重写了Array上的几个方法并保存在arrayInstrumentations上
// 主要的目的就是当调用这几个方法时，需要将数组上每一个key都添加为依赖
// 试想一下在一个响应式的数组上面调用了includes方法查找某个值是否存在时
// 那么数组上任意一个值的修改都有可能改变includes的结果，其他方法也是同理
const arrayInstrumentations: Record<string, Function> = {}
;['includes', 'indexOf', 'lastIndexOf'].forEach(key => {
  arrayInstrumentations[key] = function(...args: any[]): any {
    // 这里的this值为调用以上方法的proxy对象，也就是reactive或者readonly对象
    // 通过toRaw返回ReactiveFlags.RAW属性上面原始对象的值
    // 遍历所有的key，并通过track方法将所有的key添加为依赖
    const arr = toRaw(this) as any
    for (let i = 0, l = (this as any).length; i < l; i++) {
      track(arr, TrackOpTypes.GET, i + '')
    }
    // we run the method using the original args first (which may be reactive)
    // 通过key值拿到对应的方法并执行，这里也可以看到只要参数存在在原始的arr上，那么不管
    // 传入参数本身还是参数的proxy对象都可以获得相同的结果
    const res = arr[key](...args)
    if (res === -1 || res === false) {
      // if that didn't work, run it again using raw values.
      return arr[key](...args.map(toRaw))
    } else {
      return res
    }
  }
})

// createGetter的参数有isReadonly和shallow，根据这两个参数来创建不同的get方法
// 这里创建的get方法接收了3个参数也就是创建Proxy对象时传入的handlers对象的get方法一样
function createGetter(isReadonly = false, shallow = false) {
  return function get(target: object, key: string | symbol, receiver: object) {
    // 当访问了proxy上的ReactiveFlags.IS_REACTIVE或者ReactiveFlags.IS_READONLY属性时，直接返回对应的值
    // 这里也可以看到这两个属性并不直接添加到reactive或者readonly对象上，而是通过拦截get方法直接返回的
    if (key === ReactiveFlags.IS_REACTIVE) {
      return !isReadonly
    } else if (key === ReactiveFlags.IS_READONLY) {
      return isReadonly
    } else if (
      // 当访问proxy上的ReactiveFlags.RAW属性时，并且receiver和通过target创建的reactive或者readonly对象相等
      // 则直接返回target，前面也说过了通过ReactiveFlags.RAW属性可以获得创建reactive或者readonly对象的原始对象
      key === ReactiveFlags.RAW &&
      receiver ===
        (isReadonly
          ? (target as any)[ReactiveFlags.READONLY]
          : (target as any)[ReactiveFlags.REACTIVE])
    ) {
      return target
    }
    // 当原始对象target是一个数组，并且key是'includes', 'indexOf', 'lastIndexOf'中的一个
    // 则执行上面定义的arrayInstrumentations中的方法
    const targetIsArray = isArray(target)
    if (targetIsArray && hasOwn(arrayInstrumentations, key)) {
      return Reflect.get(arrayInstrumentations, key, receiver)
    }
    // 如果是普通对象则通过Reflect.get拿到属性值res
    const res = Reflect.get(target, key, receiver)
    // 如果key是内建的Symbols或者是__proto__、__v_isRef(ref对象的标志)
    // 则直接返回res，访问这些属性不会将这些key收集为依赖
    if (
      isSymbol(key)
        ? builtInSymbols.has(key)
        : key === `__proto__` || key === `__v_isRef`
    ) {
      return res
    }
    // 如果不是readonly的对象，那么调用tarck方法收集依赖
    if (!isReadonly) {
      track(target, TrackOpTypes.GET, key)
    }
    // 如果是shallow为true，也就是shallowReactiveHandlers或者shallowReadonlyHandlers，到这里就返回了
    if (shallow) {
      return res
    }
    // 如果属性的值是ref类型，那么在Object中应该是默认展开的(ref会在后面的章节介绍，这里先了解即可)
    if (isRef(res)) {
      // ref unwrapping, only for Objects, not for Arrays.
      return targetIsArray ? res : res.value
    }
    // 如果属性的值是一个对象，那么应该继续对res进行响应式或只读转换
    // 前面介绍api的时候也有说过了
    // 这里也可以和Vue2.x的实现对比一下，以前是只要在data中定义了那么初始化的时候会递归遍历整个对象进行响应式转化
    // 而3.x只有访问了属性并且属性的值是一个对象，才会继续进行响应式转化
    if (isObject(res)) {
      // Convert returned value into a proxy as well. we do the isObject check
      // here to avoid invalid value warning. Also need to lazy access readonly
      // and reactive here to avoid circular dependency.
      return isReadonly ? readonly(res) : reactive(res)
    }

    return res
  }
}

// 接下来是set方法
const set = /*#__PURE__*/ createSetter()
const shallowSet = /*#__PURE__*/ createSetter(true)

function createSetter(shallow = false) {
  return function set(
    target: object,
    key: string | symbol,
    value: unknown,
    receiver: object
  ): boolean {
    // 先拿到旧值
    const oldValue = (target as any)[key]
    // 当设置的旧值原本是一个ref类型而新值不是ref时，那么新值应该设置到旧值的value属性上
    if (!shallow) {
      // 当设置的新值是reactive或者readonly对象时，则需要通过toRaw获取他们的原始对象
      value = toRaw(value)
      if (!isArray(target) && isRef(oldValue) && !isRef(value)) {
        oldValue.value = value
        return true
      }
    } else {
      // in shallow mode, objects are set as-is regardless of reactive or not
      // 如果是shallow模式，则不需要处理设置的新值，因为shallow模式的响应式对象只需拦截根层级的属性的操作
    }
    // 判断key值是不是已经存在
    const hadKey = hasOwn(target, key)
    // 通过Reflect.set设置新值
    const result = Reflect.set(target, key, value, receiver)
    // don't trigger if target is something up in the prototype chain of original
    // 分析下面的代码前我们先看下面的例子：
    // let dummy
    // const a = { c: 1 }
    // const b = reactive({ d: 1 })
    // Object.setPrototypeOf(a, b)
    // effect(() => {
    //   dummy = b.d
    //   console.log(dummy)
    // })
    // a.d = 2
    // 这个例子的结果是，只会在输出一次dummy的值 1
    // 当普通对象的原型是一个proxy对象时，对普通对象的操作也会被原型上的proxy对象拦截
    // 这就导致了，我们往普通对象a上添加一个key为d的属性，会触发原型链上proxy b的set方法，proxy b上同样也有d属性
    // 如果在这里派发更新很显然是不合理的，因为我们只是在操作普通对象a而已，所以这里才需要加一个判断条件
    // 当触发原型链上proxy b的set方法时，target为proxy b的原始对象{ d: 1 }，但是由于我们是通过a对象访问d属性的
    // 那么receiver就是a对象，所以target是肯定不等于toRaw(receiver)的，因此这里并不会派发更新
    if (target === toRaw(receiver)) {
      // 调用trigger方法派发更新，根据是修改还是添加key传入不同的参数
      if (!hadKey) {
        trigger(target, TriggerOpTypes.ADD, key, value)
      } else if (hasChanged(value, oldValue)) {
        trigger(target, TriggerOpTypes.SET, key, value, oldValue)
      }
    }
    return result
  }
}
// 拦截删除操作的方法，这里没什么要注意的地方
// 如果key存在并且删除成功，则调用trigger派发更新
function deleteProperty(target: object, key: string | symbol): boolean {
  const hadKey = hasOwn(target, key)
  const oldValue = (target as any)[key]
  const result = Reflect.deleteProperty(target, key)
  if (result && hadKey) {
    trigger(target, TriggerOpTypes.DELETE, key, undefined, oldValue)
  }
  return result
}
// 使用in操作符时会触发has方法，除了key的值为symbol外 都要调用track方法收集依赖
function has(target: object, key: string | symbol): boolean {
  const result = Reflect.has(target, key)
  if (!isSymbol(key) || !builtInSymbols.has(key)) {
    track(target, TrackOpTypes.HAS, key)
  }
  return result
}
// 遍历对象的key值时会触发ownKeys方法，调用track方法收集依赖，返回Reflect.ownKeys的执行结果
function ownKeys(target: object): (string | number | symbol)[] {
  track(target, TrackOpTypes.ITERATE, ITERATE_KEY)
  return Reflect.ownKeys(target)
}
// 根据不同的的proxy对象组合handlers的功能，mutableHandlers包含了以上所有的方法
export const mutableHandlers: ProxyHandler<object> = {
  get,
  set,
  deleteProperty,
  has,
  ownKeys
}
// readonlyHandlers传入的是readonlyGet，并且重写了set和deleteProperty，在开发环境修改readonly对象的时会有警告
export const readonlyHandlers: ProxyHandler<object> = {
  get: readonlyGet,
  has,
  ownKeys,
  set(target, key) {
    if (__DEV__) {
      console.warn(
        `Set operation on key "${String(key)}" failed: target is readonly.`,
        target
      )
    }
    return true
  },
  deleteProperty(target, key) {
    if (__DEV__) {
      console.warn(
        `Delete operation on key "${String(key)}" failed: target is readonly.`,
        target
      )
    }
    return true
  }
}
// shallowReactiveHandlers除了get、set方法其他与mutableHandlers相同
export const shallowReactiveHandlers: ProxyHandler<object> = extend(
  {},
  mutableHandlers,
  {
    get: shallowGet,
    set: shallowSet
  }
)

// Props handlers are special in the sense that it should not unwrap top-level
// refs (in order to allow refs to be explicitly passed down), but should
// retain the reactivity of the normal readonly object.
export const shallowReadonlyHandlers: ProxyHandler<object> = extend(
  {},
  readonlyHandlers,
  {
    get: shallowReadonlyGet
  }
)
```

## collectionHandlers

当传入Reactivity Api的原始对象的类型是Map、Weakmap、Set、Weakset时，创建Proxy对象时传入的handlers为collectionHandlers，
collectionHandlers的代码存放在packages/src/reactivity/collectionHandlers.ts中，根据api不同，
传入的collectionHandlers也分为以下几种:

```js

export const mutableCollectionHandlers: ProxyHandler<CollectionTypes> = {
  get: createInstrumentationGetter(false, false)
}

export const shallowCollectionHandlers: ProxyHandler<CollectionTypes> = {
  get: createInstrumentationGetter(false, true)
}

export const readonlyCollectionHandlers: ProxyHandler<CollectionTypes> = {
  get: createInstrumentationGetter(true, false)
}

// 可以看到以上几种handlers都只定义了get方法，因为本身所有的collection类型的对象比如Map、Set都只能通过方法
// 来操作对象，比如说set.add()、set.get()等等，所以只需要拦截对象的get操作就行了
// 通过createInstrumentationGetter来创建不同类型的get方法

function createInstrumentationGetter(isReadonly: boolean, shallow: boolean) {
  // 通过传入的参数返回不同的instrumentations
  // instrumentations定义了重写的collection类型的对象上的方法
  // 后面会详细分析
  const instrumentations = shallow
    ? shallowInstrumentations
    : isReadonly
      ? readonlyInstrumentations
      : mutableInstrumentations
  // 返回创建的get方法
  return (
    target: CollectionTypes,
    key: string | symbol,
    receiver: CollectionTypes
  ) => {
    // 这里的实现和baseHandlers一样
    if (key === ReactiveFlags.IS_REACTIVE) {
      return !isReadonly
    } else if (key === ReactiveFlags.IS_READONLY) {
      return isReadonly
    } else if (key === ReactiveFlags.RAW) {
      return target
    }
    // 如果访问的key是存在在instrumentations上的，那么获取的是instrumentations上的方法，否则
    // 获取的是target上的方法
    return Reflect.get(
      hasOwn(instrumentations, key) && key in target
        ? instrumentations
        : target,
      key,
      receiver
    )
  }
}

const mutableInstrumentations: Record<string, Function> = {
  get(this: MapTypes, key: unknown) {
    return get(this, key, toReactive)
  },
  get size() {
    return size((this as unknown) as IterableCollections)
  },
  has,
  add,
  set,
  delete: deleteEntry,
  clear,
  forEach: createForEach(false, false)
}

const shallowInstrumentations: Record<string, Function> = {
  get(this: MapTypes, key: unknown) {
    return get(this, key, toShallow)
  },
  get size() {
    return size((this as unknown) as IterableCollections)
  },
  has,
  add,
  set,
  delete: deleteEntry,
  clear,
  forEach: createForEach(false, true)
}

const readonlyInstrumentations: Record<string, Function> = {
  get(this: MapTypes, key: unknown) {
    return get(this, key, toReadonly)
  },
  get size() {
    return size((this as unknown) as IterableCollections)
  },
  has,
  add: createReadonlyMethod(TriggerOpTypes.ADD),
  set: createReadonlyMethod(TriggerOpTypes.SET),
  delete: createReadonlyMethod(TriggerOpTypes.DELETE),
  clear: createReadonlyMethod(TriggerOpTypes.CLEAR),
  forEach: createForEach(true, false)
}

const iteratorMethods = ['keys', 'values', 'entries', Symbol.iterator]
iteratorMethods.forEach(method => {
  mutableInstrumentations[method as string] = createIterableMethod(
    method,
    false,
    false
  )
  readonlyInstrumentations[method as string] = createIterableMethod(
    method,
    true,
    false
  )
  shallowInstrumentations[method as string] = createIterableMethod(
    method,
    false,
    true
  )
})

```