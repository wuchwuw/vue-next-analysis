## Vue/Reactivity

Reactivity Api是Vue3.x中创建响应式对象的核心api，它的基本实现原理是通过Proxy来拦截对象的操作，并由此收集依赖或派发更新。
Reactivity Api的实现并没有那么复杂，只需记住通过Reactivity Api创建的对象都是Proxy对象，它的核心api有以下几个:

1、reactive: 返回原始对象的Proxy代理对象，支持收集依赖和派发更新，访问自身属性时会执行嵌套对象的深度响应式转换。
2、shallow reactive: 返回原始对象的Proxy代理对象，但只拦截对象根层级的属性的操作，如果属性的值也是对象，不会对它进行响应式转换。
3、readonly: 返回原始对象的Proxy代理对象，限制赋值操作，访问它的任何嵌套属性也将是只读的。
4、shallow readonly: 返回原始对象的Proxy代理对象，只限制对象根层级的属性的set操作，但不执行嵌套对象的深度只读转换。

Reactivity api除了支持基本的plain object和array外，还支持map、weakmap、set、weakset等collection的响应式化。我们可以通过它的测试用例来了解reactive以及它相关api的用法，这对我们学习源码很有帮助。

## 相关源码

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

// 通过shallowReactive方法创建一个shallow reactive，我们已经在前面介绍过它
// 可以看到shallowReactive方法返回的类型和传入的类型T是一致的
export function shallowReactive<T extends object>(target: T): T {
  return createReactiveObject(
    target,
    false,
    shallowReactiveHandlers,
    shallowCollectionHandlers
  )
}

// 通过readonly方法创建一个readonly reactive，我们已经在前面介绍过它
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

// 通过shallowReadonly方法创建一个readonly shallow reactive，我们已经在前面介绍过它
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