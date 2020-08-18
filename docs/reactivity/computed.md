## Computed

了解完Ref和Effect再来看Computed就比较简单了，Vue3.x的Computed和2.x的使用方法类似，它的核心就是基于Effect实现的。
当计算Computed的值时，会收集Computed中函数中的依赖，当依赖改变时，再次访问Computed会重新计算结果并返回。

```js
// 从computed方法的参数类型看到，computed支持传入一个函数或者是一个配置了getter、setter的对象
// 从computed方法的返回类型可以看到，computed本身是一个Ref类型的对象
export function computed<T>(getter: ComputedGetter<T>): ComputedRef<T>
export function computed<T>(
  options: WritableComputedOptions<T>
): WritableComputedRef<T>
export function computed<T>(
  getterOrOptions: ComputedGetter<T> | WritableComputedOptions<T>
) {
  let getter: ComputedGetter<T>
  let setter: ComputedSetter<T>
  // 当传入的getterOrOptions是一个函数时，赋值给变量getter
  // 当传入的getterOrOptions是对象时，拿到get、set方法赋值给getter、setter
  if (isFunction(getterOrOptions)) {
    getter = getterOrOptions
    setter = __DEV__
      ? () => {
          console.warn('Write operation failed: computed value is readonly')
        }
      : NOOP
  } else {
    getter = getterOrOptions.get
    setter = getterOrOptions.set
  }
  // 设置变量dirty，如果dirty为true则代表应该重新计算computed的值
  let dirty = true
  let value: T
  let computed: ComputedRef<T>
  // 创建一个Effect并且将getter作为参数传入
  const runner = effect(getter, {
    // 配置lazy为true，所以effect创建的时候不会执行
    lazy: true,
    // 设置了scheduler方法，所以当getter中依赖的响应式对象改变时，会执行scheduler而不是effect本身
    scheduler: () => {
      // scheduler并没有重新计算computed的值
      // 而是将dirty变为true，当dirty为true时代表computed的值已经发生改变
      // 所以也要派发更新到其他依赖了computed的Effect
      if (!dirty) {
        dirty = true
        trigger(computed, TriggerOpTypes.SET, 'value')
      }
    }
  })
  // computed本身是一个Ref类型的对象
  computed = {
    __v_isRef: true,
    [ReactiveFlags.IS_READONLY]:
      isFunction(getterOrOptions) || !getterOrOptions.set,

    // expose effect so computed can be stopped
    effect: runner,
    // 当访问value时，如果dirty为true，重新执行runner返回getter的结果
    // 并调用track添加依赖
    get value() {
      if (dirty) {
        value = runner()
        dirty = false
      }
      track(computed, TrackOpTypes.GET, 'value')
      return value
    },
    // 当直接设置value的值时，如果没有传入set方法，在开发环境中会有警告
    set value(newValue: T) {
      setter(newValue)
    }
  } as any
  return computed
}

```

### 总结

分析完了Computed的实现，可以总结出Computed有以下特性：

- 本身是一个Ref类型的对象，所以拥有Ref类型对象的特性，比如响应式、嵌套在响应式对象中默认展开等

- 创建或者Computed依赖的值发生改变时，并不会立即重新计算，而是等到下次访问的时候才重新计算Computed的值