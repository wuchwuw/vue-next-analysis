## Ref

在Vue3.x中Ref类型的对象也是一个响应式对象，Ref类型的对象通过ref方法创建

```js
// 从Ref的类型可以看出，Ref对象上存在一个用来标记的RefSymbol值为true
// 并且将传入ref api的值保存在value属性上
export interface Ref<T = any> {
  [RefSymbol]: true
  value: T
}

// ref和shallowRef都可以创建Ref类型的对象
// 它们内部都是调用createRef方法
export function ref(value?: unknown) {
  return createRef(value)
}

export function shallowRef(value?: unknown) {
  return createRef(value, true)
}

function createRef(rawValue: unknown, shallow = false) {
  // 当传入的value是一个已经ref对象时，直接返回
  if (isRef(rawValue)) {
    return rawValue
  }
  // 如果传入的rawValue是一个对象，并且不是创建shallowRef
  // 那么会调用convert将rawValue转化成响应式对象
  let value = shallow ? rawValue : convert(rawValue)
  // 返回ref对象，定义了value的getter、setter
  const r = {
    __v_isRef: true,
    get value() {
      // 在访问value时会收集依赖,
      track(r, TrackOpTypes.GET, 'value')
      return value
    },
    set value(newVal) {
      // 判断设置的新值是否和旧值相等
      // 如果newVal是一个代理对象，那么应该拿到newVal的原始对象去判断
      if (hasChanged(toRaw(newVal), rawValue)) {
        rawValue = newVal
        // newVal，并且不是创建shallowRef
        // 那么会调用convert将newVal转化成响应式对象
        value = shallow ? newVal : convert(newVal)
        trigger(r, TriggerOpTypes.SET, 'value', newVal)
      }
    }
  }
  return r
}
```

以上就是ref的核心代码，可以看到它就是在一个普通对象上定义了value属性的getter和setter，并且在getter和setter中
派发更新和收集依赖，这使得ref也具有响应式对象的特性，那么为什么有了响应式对象还需要多一个Ref类型的对象呢？
到底什么时候应该用ref什么时候应该用reactive呢?

我们可以从之前响应式对象的实现看出，创建响应式对象时必须传入的是一个对象才行，那么当我们想将一个基础类型的值也变成响应式时，
就需要将它放在一个对象内，这样其实是很不方便的：

```js
  
  const a = 1
  const reactiveA = reactive({ a })

```

所以ref提供了一个将基础类型的值也转化成响应式对象的方法：

```js

  const refA = ref(1)

```

并且在之后使用Vue3.x时，我们经常会使用Hooks来整合一些逻辑：

```js

  function useXXX () {
    const state = reactive({
      foo: 1,
      bar: 2
    })
    return state
  }

  export default {
    setup() {
      const { foo, bar } = useXXX()

      return {
        foo,
        bar
      }
    }
  })

```

在上面的例子中，我们可能想当然的以为通过解构赋值拿到useXXX中创建响应式对象的值应该也是响应式的，其实这样写是很有问题的，
这里拿到的foo和bar只是一个基础类型的变量，当我们将foo和bar从setup中返回并且在模板中使用时，修改foo和bar的值是不能触发
模板的更新的。所以，在这种情况下，我们需要维持foo和bar响应式的特性，这时ref就可以派上用场了：

```js

  function useXXX () {
    const state = reactive({
      foo: 1,
      bar: 2
    })
    return toRefs(state)
  }
  
```

我们使用toRefs api将state中的每个key的值都转化为一个ref对象，这样通过解构赋值拿到的foo和bar就不会失去响应式对象的特性，
这也是ref的另一个用途。

## 类型

```js

export interface Ref<T = any> {
  [RefSymbol]: true
  value: T
}

/**
 * 当ref没有传值时，返回的类型为Ref<T | undefined>，也就是说ref对象上value的类型应该为T或者undefined
 * 如果传入的value本身是一个ref对象，直接返回value本身的类型，因为在api的实现中，传入一个ref对象会直接返回对象本身
 * 除了以上情况，其他都是返回Ref<UnwrapRef<T>>类型，将传入的类型T通过UnwrapRef解引用，再将解引用的类型传到Ref中
 * UnwrapRef在之前响应式的章节已经介绍过。
 * 这里举一个例子:
 * const a = ref({
 *  a: 1,
 *  b: {
 *    c: ref(3),
 *    d: ref([1, 2, 3])
 *   }
 * })
 * 此时通过解引用后a的类型应该为
 * Ref<{
 *  a: number;
 *  b: {
 *    c: number;
 *    d: number[];
 *  };
 * }>
 * 这里可能会有疑问，为什么在ref中嵌套了ref后d的类型不是Ref<number[]>而是number[]
 * 因为在上面api的实现中，当传入ref的是一个对象时，会通过convert将对象转化成响应式对象
 * 而在响应式对象中，ref是默认展开的!
 */

export function ref<T extends object>(
  value: T
): T extends Ref ? T : Ref<UnwrapRef<T>>
export function ref<T>(value: T): Ref<UnwrapRef<T>>
export function ref<T = any>(): Ref<T | undefined>

```
