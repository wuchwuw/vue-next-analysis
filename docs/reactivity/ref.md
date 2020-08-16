## Ref

在Vue3.x中Ref类型的对象也是一个响应式对象，Ref类型的对象通过ref方法创建。

```js
// 通过Ref的类型可以看出，Ref对象上存在一个用来标记的RefSymbol值为true
// 并且将传入ref api的值保存在value属性上
export interface Ref<T = any> {
  [RefSymbol]: true
  value: T
}

// ref和shallowRefapi都可以创建Ref类型的对象
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
      if (hasChanged(toRaw(newVal), rawValue)) {
        rawValue = newVal
        value = shallow ? newVal : convert(newVal)
        trigger(r, TriggerOpTypes.SET, 'value', newVal)
      }
    }
  }
  return r
}
```