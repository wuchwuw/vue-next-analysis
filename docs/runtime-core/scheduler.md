## scheduler

```html
<template>
  <div id="test">{{state}}<div>
  <button @click="setState">set</botton>
</template>
```
```js
<script>
export default {
  setup () {
    const state = ref('Hello, Vue')
    const setState = () => {
      state.value = 'Hello, scheduler'
      console.log(document.getElementById('test').innerHTML)
    }
    return {
      state,
      setState
    }
  }
}
</script>
```

回顾Vue中一个经典的例子，改变模板中的响应式数据后立刻获取DOM节点的内容，结果是获取到的内容还是旧的，这说明在Vue中组件更新是一个异步的过程。这也不难理解，如果每次修改响应式数据
Vue都同步执行一次组件更新的话，会带来很大的性能问题，所以Vue会收集一个Tick内触发的所有更新，一次性执行，之前我们分析了patch过程，也知道了组件的更新会触发组件Effect的重新执行：

```js
instance.update = effect(function componentEffect() {
  ...
}, {
  scheduler: queueJob
})
```

可以看到在创建组件effect时，option传入了scheduler，根据之前分析effect时提到的，当option传了scheduler方法时，触发effect重新时会执行scheduler，而不是effect本身，也就是组件更新时其实执行的是queueJob方法：

```js
// 任务队列
const queue: (SchedulerJob | null)[] = []
// 当前执行到任务队列的位置
let flushIndex = 0
export function queueJob(job: SchedulerJob) {
  // the dedupe search uses the startIndex argument of Array.includes()
  // by default the search index includes the current job that is being run
  // so it cannot recursively trigger itself again.
  // if the job is a watch() callback, the search will start with a +1 index to
  // allow it recursively trigger itself - it is the user's responsibility to
  // ensure it doesn't end up in an infinite loop.
  // 如果队列是空，并且传入的job不在队列中
  // 查找队列中是否存在传入的job时，根据job是否可以递归执行本身来决定判断的位置
  if (
    (!queue.length ||
      !queue.includes(
        job,
        isFlushing && job.allowRecurse ? flushIndex + 1 : flushIndex
      )) &&
    job !== currentPreFlushParentJob
  ) {
    // 将job添加到队列中，执行queueFlush
    queue.push(job)
    queueFlush()
  }
}
```

```js
// 第一次执行queueFlush时将isFlushPending设置为true，并通过Promise.resolve().then
// 将执行任务队列的flushJobs放到微任务中执行
// 所以在一个tick内的宏任务中添加的job都会先push到队列中
function queueFlush() {
  if (!isFlushing && !isFlushPending) {
    isFlushPending = true
    currentFlushPromise = resolvedPromise.then(flushJobs)
  }
}
```

```js
function flushJobs(seen?: CountMap) {
  // 更改flushing状态
  isFlushPending = false
  isFlushing = true
  if (__DEV__) {
    seen = seen || new Map()
  }
  // 执行一些需要在任务队列之前执行的钩子
  // 例如pre watch等等
  flushPreFlushCbs(seen)

  // Sort queue before flush.
  // This ensures that:
  // 1. Components are updated from parent to child. (because parent is always
  //    created before the child so its render effect will have smaller
  //    priority number)
  // 2. If a component is unmounted during a parent component's update,
  //    its update can be skipped.
  // Jobs can never be null before flush starts, since they are only invalidated
  // during execution of another flushed job.

  // 1、按effect id从小到大排列队列中的render effect，因为组件更新是从父到子的，父组件的effect id < 子组件的effect id
  // 2、当一个组件已经销毁时，会调用stop方法将停止该effect，跳过它的更新
  // 队列中的effect有可能在队列开始执行之后变为null，因为存在父组件更新后触发子组件的更新，而子组件的render effect刚好已经在队列中这种情况
  // 那么在子组件执行updateComponent时会检查当前组件effect是否已经在更新队列中，如果存在则将队列中的effect设置为null
  queue.sort((a, b) => getId(a!) - getId(b!))

  try {
    // 遍历队列执行队列中的render effect
    for (flushIndex = 0; flushIndex < queue.length; flushIndex++) {
      const job = queue[flushIndex]
      if (job) {
        if (__DEV__) {
          checkRecursiveUpdates(seen!, job)
        }
        callWithErrorHandling(job, null, ErrorCodes.SCHEDULER)
      }
    }
  } finally {
    flushIndex = 0
    queue.length = 0
    // 执行一些需要在任务队列之后执行的钩子
    // 例如updated
    flushPostFlushCbs(seen)

    isFlushing = false
    currentFlushPromise = null
    // some postFlushCb queued jobs!
    // keep flushing until it drains.
    // 在执行队列的过程中，如果添加了其他的队列，或者钩子
    // 继续调用flushJobs直到队列为空
    if (queue.length || pendingPostFlushCbs.length) {
      flushJobs(seen)
    }
  }
}
```
