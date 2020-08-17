## Effect

在之前的章节中，我们分析了Reactivity Api和Ref的实现，在分析的过程中我们一直会遇到两个方法track和trigger，不过之前我们并没有
深入这两个方法去分析，而是简单的将它们称为收集依赖和派发更新的过程。而track和trigger方法和本章将要分析的Effect息息相关，所以我们
将在这个章节重点介绍这两个方法。不过本章的主角依然是effect，同时effect也是实现computed、watch等api的核心。

```js

  let dummy
  const r = reactive({ a: 1 })
  effect(() => {
    dummy = r.a
    console.log(dummy) // 执行2次，结果为1、 2
  })
  r.a = 2

```

我们可以使用effect api并且传递一个函数来创建一个Effect，当函数中的响应式对象发生变化时，传入effect的函数会再次执行。

## 相关源码

```js
// 从ReactiveEffect类型可以看到，当我们调用effect方法创建一个Effect时
// 返回的是一个函数，并且在函数上面挂载了一些属性，这些属性的含义后面会详细说明
export interface ReactiveEffect<T = any> {
  (): T
  _isEffect: true
  id: number
  active: boolean
  raw: () => T
  deps: Array<Dep>
  options: ReactiveEffectOptions
}

// effect方法传入了一个函数fn和一个配置对象options
// 从配置对象的类型ReactiveEffectOptions可以看到，
// options支持以下的参数，这些参数的作用会在下面的源码中说明
export interface ReactiveEffectOptions {
  lazy?: boolean
  scheduler?: (job: ReactiveEffect) => void
  onTrack?: (event: DebuggerEvent) => void
  onTrigger?: (event: DebuggerEvent) => void
  onStop?: () => void
}

export function effect<T = any>(
  fn: () => T,
  options: ReactiveEffectOptions = EMPTY_OBJ
): ReactiveEffect<T> {
  // 通过isEffect判断传入的fn上是否存在_isEffect属性
  // 如果存在，则证明传入的fn本身已经是一个Effect
  // 而创建Effect时传入的函数fn都会保存在raw属性上
  // 所以这里应该拿到Effect上的raw属性的函数赋值给fn
  if (isEffect(fn)) {
    fn = fn.raw
  }
  // 通过createReactiveEffect创建effect
  const effect = createReactiveEffect(fn, options)
  // 从上面的例子可以看出，Effect在创建时会先执行一次
  // 如果想跳过这次执行，可以将options.lazy设置为true
  if (!options.lazy) {
    effect()
  }
  return effect
}

// effect全局id
let uid = 0

function createReactiveEffect<T = any>(
  fn: () => T,
  options: ReactiveEffectOptions
): ReactiveEffect<T> {
  // 从createReactiveEffect方法可以看出，创建的Effect和我们上面分析的一样
  // 它本身是一个函数，并且挂载了一些属性，当传入effect方法的fn中的响应式对象发生改变时，
  // 就会再次执行这个effect函数，而当没有设置options.lazy时，第一次创建Effect时也会执行
  const effect = function reactiveEffect(): unknown {
    // 如果effect.active为false，并且配置了options.scheduler
    // 那么直接返回undefined，否则再次执行传入的fn并返回结果
    // 这里主要是为了配合computed的实现，后面分析computed会再次说明
    if (!effect.active) {
      return options.scheduler ? undefined : fn()
    }
    // 因为effect是可以嵌套的执行的，所以这里通过一个栈来保存当前所有嵌套的Effect
    // EffectA
    // effect(() => { 
    //   EffectB
    //   effect(() => {}) 
    // })
    // effectStack: [EffectA, EffectB]
    // 如果当前的effect已经存在在effectStack中则什么都不做，这样做避免了在effect中修改
    // 响应式对象而造成循环
    if (!effectStack.includes(effect)) {
      // 每次执行fn前，先调用cleanup方法，遍历deps属性，将本身从依赖中清除
      // 
      cleanup(effect)
      try {
        enableTracking()
        // 将当前的effect添加到effectStack中
        effectStack.push(effect)
        // 将当前的effect赋值给activeEffect
        activeEffect = effect
        // 执行fn，并且重新收集依赖
        return fn()
      } finally {
        // 执行完当前的effect后，将effect从effectStack中pop出来
        // 并且将activeEffect赋值为上一个Effect
        effectStack.pop()
        resetTracking()
        activeEffect = effectStack[effectStack.length - 1]
      }
    }
  } as ReactiveEffect
  // effect全局id
  effect.id = uid++
  // 是否为Effect的标志
  effect._isEffect = true
  // 配合实现computed的属性
  effect.active = true
  // 保存传入的fn
  effect.raw = fn
  // 将fn中所有的响应式对象的依赖保存一份到deps属性上，方便在某些时候清除依赖
  effect.deps = []
  // 保存传入的options
  effect.options = options
  return effect
}

```

分析完了Effect的创建过程，我们已经对Effect有了一定的了解，但是仅仅了解如何创建Effect是不够的，我们还需要知道Effect
是如何与响应式对象一起协作的，也就是Effect是如何收集依赖和派发更新的。在上面源码中我们分析到，Effect创建的时候会先自己
执行一次，那么就会执行到我们传入effect方法的函数fn，执行fn时就会访问到函数里的响应式对象并触发响应式对象的get方法，在
get方法中就会调用track方法进行依赖收集。

## 收集依赖

```js

// 有以下几种访问响应式对象的操作需要将key添加为依赖
export const enum TrackOpTypes {
  GET = 'get',
  HAS = 'has',
  ITERATE = 'iterate'
}

type Dep = Set<ReactiveEffect>
type KeyToDepMap = Map<any, Dep>
// 定义了全局变量targetMap来存储Effect，它的存储结构如下
// targetMap  { target -> KeyToDepMap }
// KeyToDepMap { [key in target] -> Set<ReactiveEffect> }
// 也就是说当target上的某个key值被添加为依赖时，当前的Effect就会被添加到targetMap中
const targetMap = new WeakMap<any, KeyToDepMap>()

export function track(target: object, type: TrackOpTypes, key: unknown) {
  // 如果shouldTrack为false，或者没有在effect中访问，则直接返回
  if (!shouldTrack || activeEffect === undefined) {
    return
  }
  // 通过target拿到targetMap上对应的Set<ReactiveEffect>
  // 如果没有则创建一个并添加到targetMap上
  let depsMap = targetMap.get(target)
  if (!depsMap) {
    targetMap.set(target, (depsMap = new Map()))
  }
  // 通过key拿到KeyToDepMap上对应的Set<ReactiveEffect>
  // 如果没有则创建一个并添加到KeyToDepMap上
  let dep = depsMap.get(key)
  if (!dep) {
    depsMap.set(key, (dep = new Set()))
  }
  // 如果当前的key对应的Set<ReactiveEffect>也就是dep没有包含activeEffect
  // 则添加到dep中，避免重复添加同一个Effect
  if (!dep.has(activeEffect)) {
    dep.add(activeEffect)
    // 同时Effect上的deps属性也将这个key的dep保存起来
    // 方便清除
    activeEffect.deps.push(dep)
    // 如果是开发环境，并且设置了onTrack
    // 那么会执行onTack方法，并将依赖的信息传递出去，这应该是方便开发的时候调试用的
    if (__DEV__ && activeEffect.options.onTrack) {
      activeEffect.options.onTrack({
        effect: activeEffect,
        target,
        type,
        key
      })
    }
  }
}

```

收集依赖的过程其实很简单，就是将当前的activeEffect添加到targetMap上，并且将需要添加的key的dep添加到activeEffect的deps上。


## 派发更新

```js

// 当通过以下操作修改响应式对象的值时，就会派发更新
export const enum TriggerOpTypes {
  SET = 'set',
  ADD = 'add',
  DELETE = 'delete',
  CLEAR = 'clear'
}

export function trigger(
  target: object,
  type: TriggerOpTypes,
  key?: unknown,
  newValue?: unknown,
  oldValue?: unknown,
  oldTarget?: Map<unknown, unknown> | Set<unknown>
) {
  // 通过target拿到targetMap上的KeyToDepMap
  // 如果不存在，则证明该响应式对象没有被依赖，直接返回
  const depsMap = targetMap.get(target)
  if (!depsMap) {
    // never been tracked
    return
  }
  // 创建一个Set对象effects用来保存将要执行的所有Effect
  const effects = new Set<ReactiveEffect>()
  // 通过add方法添加将要执行的Effect到effects中
  const add = (effectsToAdd: Set<ReactiveEffect> | undefined) => {
    if (effectsToAdd) {
      effectsToAdd.forEach(effect => effects.add(effect))
    }
  }
  // 如果是Map、Set的清除操作，那么所有被依赖的key值的Eeffect都要执行
  if (type === TriggerOpTypes.CLEAR) {
    // collection being cleared
    // trigger all effects for target
    depsMap.forEach(add)
  } else if (key === 'length' && isArray(target)) {
    // 如果依赖了Array的length属性，那么所有依赖length属性的Effect都要执行
    // 并且依赖了比新的length的值大的key的Effect也要执行
    // 因为当设置了length时，所有大于length的key的值都会改变
    depsMap.forEach((dep, key) => {
      if (key === 'length' || key >= (newValue as number)) {
        add(dep)
      }
    })
  } else {
    // 接下来是 SET | ADD | DELETE 操作需要添加的Effect
    // 如果key存在，则直接拿到depsMap上对应key值的Effect
    if (key !== void 0) {
      add(depsMap.get(key))
    }
    // 如果是添加key的操作或者非数组的删除key的操作，isAddOrDelete为true
    const isAddOrDelete =
      type === TriggerOpTypes.ADD ||
      (type === TriggerOpTypes.DELETE && !isArray(target))
    // 在之前分析collectionHandlers的实现时，调用除了keys的迭代方法和size属性时依赖的是ITERATE_KEY
    // 
    // 如果isAddOrDelete为true，或者是调用Map.prototype.set修改key的值时
    if (
      isAddOrDelete ||
      (type === TriggerOpTypes.SET && target instanceof Map)
    ) {
      add(depsMap.get(isArray(target) ? 'length' : ITERATE_KEY))
    }
    // 在之前分析collectionHandlers的实现时，调用Map.prototype.keys时，依赖的key为MAP_KEY_ITERATE_KEY
    // 所以当在Map上添加或者删除key时，应该添加MAP_KEY_ITERATE_KEY对应的Effect
    if (isAddOrDelete && target instanceof Map) {
      add(depsMap.get(MAP_KEY_ITERATE_KEY))
    }
  }
  // 定义run方法执行Effect
  const run = (effect: ReactiveEffect) => {
    // 如果是开发环境，并且设置了onTrigger
    // 那么会执行onTrigger方法，并将派发更新的信息传递出去，方便开发的时候调试用的
    if (__DEV__ && effect.options.onTrigger) {
      effect.options.onTrigger({
        effect,
        target,
        key,
        type,
        newValue,
        oldValue,
        oldTarget
      })
    }
    // 如果设置了scheduler那么执行scheduler方法，否则执行effect本身
    if (effect.options.scheduler) {
      effect.options.scheduler(effect)
    } else {
      effect()
    }
  }
  // 遍历所有要执行的Effect，传入run方法执行
  effects.forEach(run)
}

```