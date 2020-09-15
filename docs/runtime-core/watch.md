## watch

```js
export function watch<T = any>(
  source: WatchSource<T> | WatchSource<T>[],
  cb: WatchCallback<T>,
  options?: WatchOptions
): WatchStopHandle {
  // 校验传入的callback是不是函数
  if (__DEV__ && !isFunction(cb)) {
    warn(
      `\`watch(fn, options?)\` signature has been moved to a separate API. ` +
        `Use \`watchEffect(fn, options?)\` instead. \`watch\` now only ` +
        `supports \`watch(source, cb, options?) signature.`
    )
  }
  // 调用doWatch
  return doWatch(source, cb, options)
}
```

```js
function doWatch(
  source: WatchSource | WatchSource[] | WatchEffect,
  cb: WatchCallback | null,
  { immediate, deep, flush, onTrack, onTrigger }: WatchOptions = EMPTY_OBJ,
  instance = currentInstance
): WatchStopHandle {
  if (__DEV__ && !cb) {
    if (immediate !== undefined) {
      warn(
        `watch() "immediate" option is only respected when using the ` +
          `watch(source, callback, options?) signature.`
      )
    }
    if (deep !== undefined) {
      warn(
        `watch() "deep" option is only respected when using the ` +
          `watch(source, callback, options?) signature.`
      )
    }
  }

  const warnInvalidSource = (s: unknown) => {
    warn(
      `Invalid watch source: `,
      s,
      `A watch source can only be a getter/effect function, a ref, ` +
        `a reactive object, or an array of these types.`
    )
  }

  // 根据传入的source类型创建getter
  // 用于重新获取监听的source的新值
  let getter: () => any
  const isRefSource = isRef(source)
  // 如果source是Ref，则返回其value值
  if (isRefSource) {
    getter = () => (source as Ref).value
  } else if (isReactive(source)) {
    // 如果source是响应式对象，
    // 返回本身，并将deep设置为true
    getter = () => source
    deep = true
  } else if (isArray(source)) {
    // 如果source是数组
    // 遍历数组，根据数组值的类型返回相应的值
    getter = () =>
      source.map(s => {
        if (isRef(s)) {
          return s.value
        } else if (isReactive(s)) {
          return traverse(s)
        } else if (isFunction(s)) {
          return callWithErrorHandling(s, instance, ErrorCodes.WATCH_GETTER)
        } else {
          __DEV__ && warnInvalidSource(s)
        }
      })
  } else if (isFunction(source)) {
    // 如果source是函数，并且存在callback
    // 则直接返回source执行的结果
    if (cb) {
      // getter with cb
      getter = () =>
        callWithErrorHandling(source, instance, ErrorCodes.WATCH_GETTER)
    } else {
      // no cb -> simple effect
      getter = () => {
        if (instance && instance.isUnmounted) {
          return
        }
        if (cleanup) {
          cleanup()
        }
        return callWithErrorHandling(
          source,
          instance,
          ErrorCodes.WATCH_CALLBACK,
          [onInvalidate]
        )
      }
    }
  } else {
    // 如果source不满足以上任何一种
    // 将getter赋值为() => {}
    // 提示source类型错误
    getter = NOOP
    __DEV__ && warnInvalidSource(source)
  }

  // 如果deep为true，则调用traverse将getter的返回值访问一遍
  // 目的是将所有返回值的所有key添加到依赖中
  if (cb && deep) {
    const baseGetter = getter
    getter = () => traverse(baseGetter())
  }

  let cleanup: () => void
  const onInvalidate: InvalidateCbRegistrator = (fn: () => void) => {
    cleanup = runner.options.onStop = () => {
      callWithErrorHandling(fn, instance, ErrorCodes.WATCH_CLEANUP)
    }
  }

  // in SSR there is no need to setup an actual effect, and it should be noop
  // unless it's eager
  // SSR相关逻辑，跳过
  if (__NODE_JS__ && isInSSRComponentSetup) {
    if (!cb) {
      getter()
    } else if (immediate) {
      callWithAsyncErrorHandling(cb, instance, ErrorCodes.WATCH_CALLBACK, [
        getter(),
        undefined,
        onInvalidate
      ])
    }
    return NOOP
  }

  // 获取value的初始旧值，如果source是数组则为[]，否则就是undefined
  let oldValue = isArray(source) ? [] : INITIAL_WATCHER_VALUE
  // 创建传入effect option的Scheduler
  const job: SchedulerJob = () => {
    // 如果effect已经被停止，直接返回
    if (!runner.active) {
      return
    }
    // 如果存在callback
    if (cb) {
      // watch(source, cb)
      // 调用effect重新获得getter的值
      const newValue = runner()
      // 如果deep == true 或者 是ref source 或者新旧value不同，则触发callback执行
      if (deep || isRefSource || hasChanged(newValue, oldValue)) {
        // cleanup before running cb again
        if (cleanup) {
          cleanup()
        }
        callWithAsyncErrorHandling(cb, instance, ErrorCodes.WATCH_CALLBACK, [
          newValue,
          // pass undefined as the old value when it's changed for the first time
          oldValue === INITIAL_WATCHER_VALUE ? undefined : oldValue,
          onInvalidate
        ])
        oldValue = newValue
      }
    } else {
      // watchEffect
      // 如果不存在callback，则简单的重新执行getter
      runner()
    }
  }

  // important: mark the job as a watcher callback so that scheduler knows it
  // it is allowed to self-trigger (#1727)
  // 如果存在callback，那么watch可以递归触发自身
  job.allowRecurse = !!cb

  // 根据flush的值来决定触发的回调是在组件更新前、后或者是同步执行
  let scheduler: (job: () => any) => void
  if (flush === 'sync') {
    // 同步执行，直接将job赋值给scheduler，触发effect时直接执行
    scheduler = job
  } else if (flush === 'pre') {
    // ensure it's queued before component updates (which have positive ids)
    // 组件更新前执行
    // 将id设置为-1，确保函数在队列中最早执行
    job.id = -1
    scheduler = () => {
      if (!instance || instance.isMounted) {
        queuePreFlushCb(job)
      } else {
        // with 'pre' option, the first call must happen before
        // the component is mounted so it is called synchronously.
        job()
      }
    }
  } else {
    // 组件更新后执行
    scheduler = () => queuePostRenderEffect(job, instance && instance.suspense)
  }

  const runner = effect(getter, {
    lazy: true,
    onTrack,
    onTrigger,
    scheduler
  })

  recordInstanceBoundEffect(runner)

  // initial run
  if (cb) {
    if (immediate) {
      job()
    } else {
      oldValue = runner()
    }
  } else {
    runner()
  }

  return () => {
    stop(runner)
    if (instance) {
      remove(instance.effects!, runner)
    }
  }
}
```