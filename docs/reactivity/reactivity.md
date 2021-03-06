## Reactive

Reactivity Api是Vue3.x中创建响应式对象的核心api，它的基本实现原理是通过Proxy来拦截对象的操作，并由此收集依赖或派发更新。
Reactivity Api的实现并没有那么复杂，只需记住通过Reactivity Api创建的对象都是Proxy对象，它的核心api有以下几个:

1、reactive: 返回原始对象的Proxy代理对象，支持收集依赖和派发更新，访问自身属性时会执行嵌套对象的深度响应式转换。
2、shallowReactive: 返回原始对象的Proxy代理对象，但只拦截对象根层级的属性的操作，如果属性的值也是对象，不会对它进行响应式转换。
3、readonly: 返回原始对象的Proxy代理对象，限制赋值操作，访问它的任何嵌套属性也将是只读的。
4、shallowReadonly: 返回原始对象的Proxy代理对象，只限制对象根层级的属性的set操作，但不执行嵌套对象的深度只读转换。

Reactivity api除了支持基本的plain object和array外，还支持map、weakmap、set、weakset等collection的响应式化。我们可以通过它的测试用例来了解reactive以及它相关api的用法，这对我们学习源码很有帮助。

### 一些概念

普通对象：Object、Array、Map、Weakmap、Set、Weakset中的一种
代理对象：普通对象传入Reactivity Api后创建并返回的Proxy对象
原始对象：创建Proxy对象的target对象，原始对象有可能是普通对象也可能是代理对象

### 相关源码

``` js
// 定义了传入Proxy的原始对象target上可能出现的一些属性的类型，这里需要注意的是，传入的target可能是一个普通对象也可能
// 代理对象，那么就需要一些属性来判断target的类型
// 通过ReactiveFlags枚举了这些属性的名字，它们的含义如下:
// SKIP: 当传入的原始对象target存在此属性则跳过只读或者响应式化
// IS_REACTIVE: 当此属性为true时，则target已经是一个reactive代理对象
// IS_READONLY: 当此属性为true时，则target已经是一个readonly代理对象
// RAW: 当target是一个代理对象时，通过此属性获得原始对象的值
// REACTIVE: 当原始对象target是一个普通对象，但是它已经被响应式化过了，通过此属性可获得target的响应式代理对象
// READONLY: 当原始对象target是一个普通对象，但是它已经被只读化过了，通过此属性可获得target的只读代理对象
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

其他几个经常使用到的Api，后面的源码中也经常用到：

```js

// 判断是一个对是不是响应式代理对象
export function isReactive(value: unknown): boolean {
  // 如果对象是一个只读对象，那么获取它的原始对象
  // 如果原始对象本身是一个响应式代理对象，那么也返回true
  if (isReadonly(value)) {
    return isReactive((value as Target)[ReactiveFlags.RAW])
  }
  // 通过value上ReactiveFlags.IS_REACTIVE属性判断
  return !!(value && (value as Target)[ReactiveFlags.IS_REACTIVE])
}

// 判断一个对象是不是一个只读代理对象
export function isReadonly(value: unknown): boolean {
  return !!(value && (value as Target)[ReactiveFlags.IS_READONLY])
}

// 判断一个对象是不是一个代理对象
export function isProxy(value: unknown): boolean {
  return isReactive(value) || isReadonly(value)
}

// 获取代理对象的原始对象，如果不存在则返回本身
export function toRaw<T>(observed: T): T {
  return (
    (observed && toRaw((observed as Target)[ReactiveFlags.RAW])) || observed
  )
}

export function markRaw<T extends object>(value: T): T {
  def(value, ReactiveFlags.SKIP, true)
  return value
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

// 可以从各个类型的instrumentations对象中看出，上面基本重写了Map、Set操作对象的方法
// 当访问Map、Set等类型的Proxy对象的方法时，会被定义在handlers上的get拦截，并根据key值返回
// instrumentations上重写的方法，接下来我们一个个方法分析，看看Vue如何重写这些方法

const toReactive = <T extends unknown>(value: T): T =>
  isObject(value) ? reactive(value) : value

const toReadonly = <T extends unknown>(value: T): T =>
  isObject(value) ? readonly(value) : value

const toShallow = <T extends unknown>(value: T): T => value

const getProto = <T extends CollectionTypes>(v: T): any =>
  Reflect.getPrototypeOf(v)

// 重写Map.prototype.get() / WeakMap.prototype.get()
// target: 从上文看到这里传入的target是this，也就是调用重写的get方法的proxy对象
// key: get方法传入的key值
// wrap: 根据不同的handles对应传入toReactive、toReadonly、toShallow方法
function get(
  target: MapTypes,
  key: unknown,
  wrap: typeof toReactive | typeof toReadonly | typeof toShallow
) {
  // 拿到proxy的原始对象
  target = toRaw(target)
  // 通过toRaw拿到key的原始对象
  // 如果key和rawKey不相等，则传入的key是一个代理对象
  // 那么应该同时将key和rawKey收集为依赖，如果不理解的话，后面添加key的逻辑会再解释
  const rawKey = toRaw(key)
  if (key !== rawKey) {
    track(target, TrackOpTypes.GET, key)
  }
  track(target, TrackOpTypes.GET, rawKey)
  // 从原始对象的原型上拿到原始的has、get方法
  const { has, get } = getProto(target)
  // 如果key存在，那么返回它的值，如果不存在则继续判断key的原始对象是否存在在target中
  // 也就是说当添加一个普通对象作为key值到map上时，不管是key本身还是它的reactive或readonly对象，都可以获取到对应key的值
  if (has.call(target, key)) {
    return wrap(get.call(target, key))
  } else if (has.call(target, rawKey)) {
    return wrap(get.call(target, rawKey))
  }
}
// 重写Map.prototype.has() / WeakMap.prototype.has() / Set.prototype.has() / WeakSet.prototype.has()
// has方法与get实现差不多，
function has(this: CollectionTypes, key: unknown): boolean {
  const target = toRaw(this)
  const rawKey = toRaw(key)
  if (key !== rawKey) {
    track(target, TrackOpTypes.HAS, key)
  }
  track(target, TrackOpTypes.HAS, rawKey)
  const has = getProto(target).has
  return has.call(target, key) || has.call(target, rawKey)
}

// 访问属性size执行此方法，注意这里添加依赖的key为ITERATE_KEY
function size(target: IterableCollections) {
  target = toRaw(target)
  track(target, TrackOpTypes.ITERATE, ITERATE_KEY)
  return Reflect.get(getProto(target), 'size', target)
}

// 重写Set.prototype.add() / WeakSet.prototype.add()
// 当通过add添加一个value时，如果value是一个代理对象，那么会先尝试拿到value
// 的原始对象，并判断了value是否存在在set上，如果不存在才派发更新
function add(this: SetTypes, value: unknown) {
  value = toRaw(value)
  const target = toRaw(this)
  const proto = getProto(target)
  const hadKey = proto.has.call(target, value)
  const result = proto.add.call(target, value)
  if (!hadKey) {
    trigger(target, TriggerOpTypes.ADD, value, value)
  }
  return result
}

// 重写Map.prototype.set() / WeakMap.prototype.set()
function set(this: MapTypes, key: unknown, value: unknown) {
  value = toRaw(value)
  const target = toRaw(this)
  const { has, get, set } = getProto(target)
  // 判断key是否已经存在在map上，先判断传入的key本身是否存在，如果不存在
  // 通过toRaw尝试拿到key的原始对象，继续判断
  // 也就是说当map上的key是一个对象时，不管是传入key本身或者key的代理对象
  // 都可以获取到key的值
  let hadKey = has.call(target, key)
  if (!hadKey) {
    key = toRaw(key)
    hadKey = has.call(target, key)
  } else if (__DEV__) {
    checkIdentityKeys(target, has, key)
  }
  // 调用原始对象的方法拿到旧值并设置新的值
  const oldValue = get.call(target, key)
  const result = set.call(target, key, value)
  // 根据是修改key的值还是添加一个新key，传入不同的参数，派发更新
  if (!hadKey) {
    trigger(target, TriggerOpTypes.ADD, key, value)
  } else if (hasChanged(value, oldValue)) {
    trigger(target, TriggerOpTypes.SET, key, value, oldValue)
  }
  return result
}

// 重写Map.prototype.delete / Set.prototype.delete
function deleteEntry(this: CollectionTypes, key: unknown) {
  const target = toRaw(this)
  const { has, get, delete: del } = getProto(target)
  // 判断key是否已经存在在Map或Set上，如果是Map对象则key是将要删除的键值，
  // 如果是Set对象则key为将要删除的值
  // 先判断传入的key本身是否存在，如果不存在
  // 通过toRaw尝试拿到key的原始对象，继续判断
  // 也就是说当Map上的key或者Set上的值是一个对象时，不管是传入key本身或者key的代理对象
  // 都可以删除这个键或者值
  let hadKey = has.call(target, key)
  if (!hadKey) {
    key = toRaw(key)
    hadKey = has.call(target, key)
  } else if (__DEV__) {
    checkIdentityKeys(target, has, key)
  }
  // 当原始的get方法不存在时，即target是一个Set对象，那么旧值就是undefinedß
  // 如果target是Map对象，则通过原始的get方法拿到旧值
  const oldValue = get ? get.call(target, key) : undefined
  // 执行原始的delete方法
  const result = del.call(target, key)
  // 当删除的Map上的key或者Set的值存在时，才需要派发更新
  if (hadKey) {
    trigger(target, TriggerOpTypes.DELETE, key, undefined, oldValue)
  }
  return result
}

// 重写Map.prototype.clear / Set.prototype.clear
function clear(this: IterableCollections) {
  const target = toRaw(this)
  // 判断Map或者Set是否为空
  const hadItems = target.size !== 0
  // 如果是开发环境则创建一个新的Map或Set传入派发更新的trigger中
  const oldTarget = __DEV__
    ? target instanceof Map
      ? new Map(target)
      : new Set(target)
    : undefined
  // 调用原始的clear拿到结果
  const result = getProto(target).clear.call(target)
  // 调用clear时，如果Map或者Set本身不为空，才派发更新
  if (hadItems) {
    trigger(target, TriggerOpTypes.CLEAR, undefined, undefined, oldTarget)
  }
  return result
}

// 重写Map.prototype.forEach / Set.prototype.forEach
function createForEach(isReadonly: boolean, shallow: boolean) {
  return function forEach(
    this: IterableCollections,
    callback: Function,
    thisArg?: unknown
  ) {
    const observed = this
    const target = toRaw(observed)
    // 根据传入参数使用不同的wrap，当调用forEach遍历时，访问的item或者key也是一个对象时
    // 使用wrap方法将它们转化为只读或者响应式对象
    const wrap = isReadonly ? toReadonly : shallow ? toShallow : toReactive
    // 如果不是readonly对象，才调用tarck添加依赖
    !isReadonly && track(target, TrackOpTypes.ITERATE, ITERATE_KEY)
    // important: create sure the callback is
    // 1. invoked with the reactive map as `this` and 3rd arg
    // 2. the value received should be a corresponding reactive/readonly.
    // 调用传入forEach的callback，并将key和value进行只读或者响应式化
    function wrappedCallback(value: unknown, key: unknown) {
      return callback.call(thisArg, wrap(value), wrap(key), observed)
    }
    return getProto(target).forEach.call(target, wrappedCallback)
  }
}

// 创建对象内部的迭代方法
// method为keys, values, entries, Symbol.iterator中的一种
// 调用这些方法都是返回对象内部的迭代器
function createIterableMethod(
  method: string | symbol,
  isReadonly: boolean,
  shallow: boolean
) {
  return function(
    this: IterableCollections,
    ...args: unknown[]
  ): Iterable & Iterator {
    const target = toRaw(this)
    // 是否是Map对象
    const isMap = target instanceof Map
    // 是否返回键值对
    const isPair = method === 'entries' || (method === Symbol.iterator && isMap)
    // 如果是keys方法并且是Map对象，传入track方法的key为MAP_KEY_ITERATE_KEY
    // 后面会解释MAP_KEY_ITERATE_KE和ITERATE_KEY的不同
    const isKeyOnly = method === 'keys' && isMap
    // 调用原始对象上的方法获得原始的迭代器
    const innerIterator = getProto(target)[method].apply(target, args)
    // 如果不是readonly对象，才调用tarck添加依赖
    const wrap = isReadonly ? toReadonly : shallow ? toShallow : toReactive
    !isReadonly &&
      track(
        target,
        TrackOpTypes.ITERATE,
        isKeyOnly ? MAP_KEY_ITERATE_KEY : ITERATE_KEY
      )
    // return a wrapped iterator which returns observed versions of the
    // values emitted from the real iterator
    // 返回重写的迭代器，访问的key或者value也是一个对象时
    // 使用wrap方法将它们转化为只读或者响应式对象
    return {
      // iterator protocol
      next() {
        const { value, done } = innerIterator.next()
        return done
          ? { value, done }
          : {
              value: isPair ? [wrap(value[0]), wrap(value[1])] : wrap(value),
              done
            }
      },
      // iterable protocol
      [Symbol.iterator]() {
        return this
      }
    }
  }
}

// readonly对象的add、set、delete、clear方法
// 在一个readonly对象上调用这些方法应该发出警告
// 如果调用delete返回false，其他返回对象本身
function createReadonlyMethod(type: TriggerOpTypes): Function {
  return function(this: CollectionTypes, ...args: unknown[]) {
    if (__DEV__) {
      const key = args[0] ? `on key "${args[0]}" ` : ``
      console.warn(
        `${capitalize(type)} operation ${key}failed: target is readonly.`,
        toRaw(this)
      )
    }
    return type === TriggerOpTypes.DELETE ? false : this
  }
}

```

## 类型

```js
// reactive api返回的类型为UnwrapNestedRefs<T>
export function reactive<T extends object>(target: T): UnwrapNestedRefs<T>
// 如果传入的target的类型T为Ref类型，那么返回值的类型也是Ref，否则将类型T传入UnwrapRef解引用
type UnwrapNestedRefs<T> = T extends Ref ? T : UnwrapRef<T>
// 如果类型T是一个Ref那么应该拿到传入这个Ref的类型V，否则还是将T类型传入UnwrapRefSimple
export type UnwrapRef<T> = T extends Ref<infer V>
  ? UnwrapRefSimple<V>
  : UnwrapRefSimple<T>
// 如果T是Function、CollectionTypes、BaseTypes、RefUnwrapBailTypes中的一种，那么直接返回T类型
// RefUnwrapBailTypes是可以让用户自定义的类型
// 如果T是Array，则遍历Array，递归调用UnwrapRefSimple
// 如果T是object，那么将T传入UnwrappedObject中
// 不满足以上情况，都直接返回类型T
type UnwrapRefSimple<T> = T extends
  | Function
  | CollectionTypes
  | BaseTypes
  | Ref
  | RefUnwrapBailTypes[keyof RefUnwrapBailTypes]
  ? T
  : T extends Array<any>
    ? { [K in keyof T]: UnwrapRefSimple<T[K]> }
    : T extends object ? UnwrappedObject<T> : T

// UnwrappedObject包含了2个部分
// 1、遍历object的所有key，递归调用UnwrapRef
// 2、对象上一些内置Symbol，不会出现在keyof中，所以还需要覆盖一些内置Symbol的类型
type UnwrappedObject<T> = { [P in keyof T]: UnwrapRef<T[P]> } & SymbolExtract<T>

// 当object的上某个属性为以下Symbol值的一种时，先通过infer关键字获取当前Symbol属性的值的类型V
// 然后返回key为Symbol，值为V的类型，否则返回{}
// 例如：
// 当响应式对象为 { [Symbol.match]: () => {}, a: 1, b: '2' } 时
// 传入UnwrappedObject后类型为
// { a: number, b: string } & { [Symbol.match]: () => void }
type SymbolExtract<T> = (T extends { [Symbol.asyncIterator]: infer V }
  ? { [Symbol.asyncIterator]: V }
  : {}) &
  (T extends { [Symbol.hasInstance]: infer V }
    ? { [Symbol.hasInstance]: V }
    : {}) &
  (T extends { [Symbol.isConcatSpreadable]: infer V }
    ? { [Symbol.isConcatSpreadable]: V }
    : {}) &
  (T extends { [Symbol.iterator]: infer V } ? { [Symbol.iterator]: V } : {}) &
  (T extends { [Symbol.match]: infer V } ? { [Symbol.match]: V } : {}) &
  (T extends { [Symbol.matchAll]: infer V } ? { [Symbol.matchAll]: V } : {}) &
  (T extends { [Symbol.replace]: infer V } ? { [Symbol.replace]: V } : {}) &
  (T extends { [Symbol.search]: infer V } ? { [Symbol.search]: V } : {}) &
  (T extends { [Symbol.species]: infer V } ? { [Symbol.species]: V } : {}) &
  (T extends { [Symbol.split]: infer V } ? { [Symbol.split]: V } : {}) &
  (T extends { [Symbol.toPrimitive]: infer V }
    ? { [Symbol.toPrimitive]: V }
    : {}) &
  (T extends { [Symbol.toStringTag]: infer V }
    ? { [Symbol.toStringTag]: V }
    : {}) &
  (T extends { [Symbol.unscopables]: infer V }
    ? { [Symbol.unscopables]: V }
    : {})
```

## 总结

可以看到Reactivity Api就是创建一个代理对象来拦截一些对原始对象的操作，根据传入的原始对象的类型传入不同的handlers
Array、Object传入baseHandlers、Map、Weakmap、Set、Weakset的传入collectionHandlers，其中在handlers中
调用的收集依赖方法track和派发更新方法trigger将在effect章节中分析，这里只需知道在哪些拦截方法中收集依赖或者派发
更新并且了解调用这些方法时传入不同的参数。