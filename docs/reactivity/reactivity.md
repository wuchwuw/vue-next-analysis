## Vue/Reactivity

reactive api是Vue3.x中创建响应式对象的核心api，它的基本实现原理是通过Proxy来拦截普通的对象的操作，并由此收集依赖或派发更新。
响应式对象的实现并没有那么复杂，只需记住响应式对象就是Proxy对象，它的核心就是Proxy，在Vue3.x中，响应式对象也分为了以下几种:

1、mutable reactive: 普通的响应式对象
2、readonly reactive: 只读的响应式对象，不能进行赋值操作。
3、shallow reactive: 只拦截对象根层级的属性的操作，如果属性的值也是对象，不会对它进行递归响应式化。
4、shallow readonly reactive: 只读的shallow reactive对象

reactive api除了支持基本的plain object和array外，还支持map、weakmap、set、weakset等collection的响应式化。我们可以通过它的测试用例来了解reactive以及它相关api的用法，这对我们学习源码很有帮助。

#### 测试用例

1、reactive的参数必须是一个对象，我们可以像操作一个普通对象一样来操作响应式对象，并且响应式对象不等于原始的对象。

    test('Object', () => {
      const original = { foo: 1 }
      const observed = reactive(original)
      expect(observed).not.toBe(original)
      expect(isReactive(observed)).toBe(true)
      expect(isReactive(original)).toBe(false)
      // get
      expect(observed.foo).toBe(1)
      // has
      expect('foo' in observed).toBe(true)
      // ownKeys
      expect(Object.keys(observed)).toEqual(['foo'])
    })

2、一个响应式对象的属性的值如果也是对象的话，那么它也会被响应式化。

    test('nested reactives', () => {
      const original = {
        nested: {
          foo: 1
        },
        array: [{ bar: 2 }]
      }
      const observed = reactive(original)
      expect(isReactive(observed.nested)).toBe(true)
      expect(isReactive(observed.array)).toBe(true)
      expect(isReactive(observed.array[0])).toBe(true)
    })

3、对一个响应式对象进行操作时，操作同时也会影响到原始的对象。

    test('observed value should proxy mutations to original (Object)', () => {
      const original: any = { foo: 1 }
      const observed = reactive(original)
      // set
      observed.bar = 1
      expect(observed.bar).toBe(1)
      expect(original.bar).toBe(1)
      // delete
      delete observed.foo
      expect('foo' in observed).toBe(false)
      expect('foo' in original).toBe(false)
    })

4、为一个响应式对象的属性赋值一个对象时，该对象也会变成响应式对象。

    test('setting a property with an unobserved value should wrap with reactive', () => {
      const observed = reactive<{ foo?: object }>({})
      const raw = {}
      observed.foo = raw
      expect(observed.foo).not.toBe(raw)
      expect(isReactive(observed.foo)).toBe(true)
    })

5、当传入的参数已经是一个响应式对象时，直接返回该响应式对象。

    test('observing already observed value should return same Proxy', () => {
      const original = { foo: 1 }
      const observed = reactive(original)
      const observed2 = reactive(observed)
      expect(observed2).toBe(observed)
    })


## 相关源码

    // 定义了传入Proxy的原始对象target的类型，在原始对象响应式化的过程中会往原始对象上添加某些标记属性
    // 通过ReactiveFlags枚举了这些属性的名字，它们的功能如下:
    // SKIP: 存在此属性则跳过响应式化
    // IS_REACTIVE: 是否是一个响应式对象
    // IS_READONLY: 是否是一个只读的响应式对象
    // RAW: 当target是一个响应式对象时，通过此属性获得响应式对象的原始对象
    // REACTIVE: 如果是一个响应式对象则将响应式后的Proxy对象存放在这个属性上
    // READONLY: 如果是一个只读的响应式对象则将响应式后的Proxy对象存放在这个属性上

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
    // 3、对象不应该被冻结
    const canObserve = (value: Target): boolean => {
      return (
        !value[ReactiveFlags.SKIP] &&
        isObservableType(toRawType(value)) &&
        !Object.isFrozen(value)
      )
    }

接下来是几个创建响应式对象的api,这里重点注意创建不同类型的响应式对象的api返回的类型不同，关于类型的详细解析我们放到后面细讲。

    // 通过reactive方法创建普通mutable reactive，如果传入的对象上存在ReactiveFlags.IS_READONLY属性
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

不难看出以上的几个主要创建响应式对象的api都是内部调用了createReactiveObject方法，根据传入的参数不同来创建不同类型的响应式对象。

    // 可以看到createReactiveObject方法传入了4个参数
    // target: 传入的将要响应式化的对象
    // isReadonly: 是否创建只读的响应式对象
    // baseHandlers: 普通的Object和Array的proxy handles对象
    // collectionHandlers: Map、Weakmap、Set、Weakset类型的proxy handles对象
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
      // target is already a Proxy, return it.
      // exception: calling readonly() on a reactive object
      // 当可以获取target上的ReactiveFlags.RAW属性的值，则证明target已经是一个响应式对象
      
      if (
        target[ReactiveFlags.RAW] &&
        !(isReadonly && target[ReactiveFlags.IS_REACTIVE])
      ) {
        return target
      }
      // target already has corresponding Proxy
      const reactiveFlag = isReadonly
        ? ReactiveFlags.READONLY
        : ReactiveFlags.REACTIVE
      if (hasOwn(target, reactiveFlag)) {
        return target[reactiveFlag]
      }
      // only a whitelist of value types can be observed.
      if (!canObserve(target)) {
        return target
      }
      const observed = new Proxy(
        target,
        collectionTypes.has(target.constructor) ? collectionHandlers : baseHandlers
      )
      def(target, reactiveFlag, observed)
      return observed
    }