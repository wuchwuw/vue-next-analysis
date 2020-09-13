## 组件更新

之前在组件创建流程中我们已经分析过了，组件创建时会创建组件的effect，当组件中的响应式对象改变时，
会触发组件effect的重新执行:

```js
instance.update = effect(function componentEffect() {
  if (!instance.isMounted) {
    // 组件创建的逻辑
  } else {
    // 组件更新
    let { next, bu, u, parent, vnode } = instance
    let originNext = next
    let vnodeHook: VNodeHook | null | undefined
    if (__DEV__) {
      pushWarningContext(next || instance.vnode)
    }
    // 判断next是否存在
    // 当组件更新是通过effect触发时，next = null
    // 当组件更新是通过父组件更新触发时，next为组件的更新后的组件vnode
    if (next) {
      // 当next存在时，调用updateComponentPreRender更新组件的props、slot
      updateComponentPreRender(instance, next, optimized)
    } else {
      // next不存在时，将组件的组件vnode复制给next
      next = vnode
    }
    next.el = vnode.el

    // 调用before update钩子
    if (bu) {
      invokeArrayFns(bu)
    }
    // 调用组件vnode的before update钩子
    if ((vnodeHook = next.props && next.props.onVnodeBeforeUpdate)) {
      invokeVNodeHook(vnodeHook, parent, next, vnode)
    }

    // render
    if (__DEV__) {
      startMeasure(instance, `render`)
    }
    // 调用renderComponentRoot重新执行render函数创建更新后的vnode
    const nextTree = renderComponentRoot(instance)
    if (__DEV__) {
      endMeasure(instance, `render`)
    }
    const prevTree = instance.subTree
    // 更新subTree
    instance.subTree = nextTree

    // reset refs
    // only needed if previous patch had refs
    if (instance.refs !== EMPTY_OBJ) {
      instance.refs = {}
    }
    if (__DEV__) {
      startMeasure(instance, `patch`)
    }
    // 调用patch更新新旧子树
    patch(
      prevTree,
      nextTree,
      // parent may have changed if it's in a teleport
      hostParentNode(prevTree.el!)!,
      // anchor may have changed if it's in a fragment
      getNextHostNode(prevTree),
      instance,
      parentSuspense,
      isSVG
    )
    if (__DEV__) {
      endMeasure(instance, `patch`)
    }
    // 将更新后的的dom节点复制给组件vnode
    next.el = nextTree.el
    if (originNext === null) {
      // self-triggered update. In case of HOC, update parent component
      // vnode el. HOC is indicated by parent instance's subTree pointing
      // to child component's vnode
      updateHOCHostEl(instance, nextTree.el)
    }
    // 调用updated 钩子
    if (u) {
      queuePostRenderEffect(u, parentSuspense)
    }
    // 调用组件vnode的updated 钩子
    if ((vnodeHook = next.props && next.props.onVnodeUpdated)) {
      queuePostRenderEffect(() => {
        invokeVNodeHook(vnodeHook!, parent, next!, vnode)
      }, parentSuspense)
    }

    if (__DEV__ || __FEATURE_PROD_DEVTOOLS__) {
      devtoolsComponentUpdated(instance)
    }

    if (__DEV__) {
      popWarningContext()
    }
  }
}, __DEV__ ? createDevEffectOptions(instance) : prodEffectOptions)
// #1801 mark it to allow recursive updates
;(instance.update as SchedulerJob).allowRecurse = true
}
```

当组件更新时，通常有两中触发方式：

+ 1、组件内响应式对象改变，触发组件effect重新执行
+ 2、父组件更新时触发组件的更新

第一种触发方式不需要更新组件vnode，所以直接将之前的组件vnode赋值给next，而第二种方式需要调用updateComponentPreRender
更新组件vnode。处理完组件vnode后，调用render方法重新生成组件vnode的子树，也就是subtree，通过patch方法重新对比新旧子树
并更新DOM节点。

```js
// 之前我们在组件创建的流程中分析过patch方法
// 根据vnode的类型type和我们之前分析过的patchFlag来处理不同的节点
// 处理节点的方法都分为创建节点和更新节点
const patch: PatchFn = (
  n1,
  n2,
  container,
  anchor = null,
  parentComponent = null,
  parentSuspense = null,
  isSVG = false,
  optimized = false
) => {
  // 如果新旧vnode的type或者key不相同
  // 直接消耗旧节点
  if (n1 && !isSameVNodeType(n1, n2)) {
    anchor = getNextHostNode(n1)
    unmount(n1, parentComponent, parentSuspense, true)
    n1 = null
  }
  // 如果patchFlag是PatchFlags.BAIL则跳过优化模式
  // 并将vnode的dynamicChildren设置为null
  if (n2.patchFlag === PatchFlags.BAIL) {
    optimized = false
    n2.dynamicChildren = null
  }
  // 根据vnode类型处理不同的节点
  const { type, ref, shapeFlag } = n2
  switch (type) {
    case Text:
      processText(n1, n2, container, anchor)
      break
    case Comment:
      processCommentNode(n1, n2, container, anchor)
      break
    case Static:
      if (n1 == null) {
        mountStaticNode(n2, container, anchor, isSVG)
      } else if (__DEV__) {
        patchStaticNode(n1, n2, container, isSVG)
      }
      break
    case Fragment:
      processFragment(
        n1,
        n2,
        container,
        anchor,
        parentComponent,
        parentSuspense,
        isSVG,
        optimized
      )
      break
    default:
      if (shapeFlag & ShapeFlags.ELEMENT) {
        processElement(
          n1,
          n2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          isSVG,
          optimized
        )
      } else if (shapeFlag & ShapeFlags.COMPONENT) {
        processComponent(
          n1,
          n2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          isSVG,
          optimized
        )
      } else if (shapeFlag & ShapeFlags.TELEPORT) {
        ;(type as typeof TeleportImpl).process(
          n1 as TeleportVNode,
          n2 as TeleportVNode,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          isSVG,
          optimized,
          internals
        )
      } else if (__FEATURE_SUSPENSE__ && shapeFlag & ShapeFlags.SUSPENSE) {
        ;(type as typeof SuspenseImpl).process(
          n1,
          n2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          isSVG,
          optimized,
          internals
        )
      } else if (__DEV__) {
        warn('Invalid VNode type:', type, `(${typeof type})`)
      }
  }

  // set ref
  if (ref != null && parentComponent) {
    setRef(ref, n1 && n1.ref, parentComponent, parentSuspense, n2)
  }
}
```

### 更新子组件processComponent

```js
const processComponent = (
    n1: VNode | null,
    n2: VNode,
    container: RendererElement,
    anchor: RendererNode | null,
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    isSVG: boolean,
    optimized: boolean
  ) => {
    if (n1 == null) {
      // 创建逻辑
    } else {
      // 调用updateComponent处理组件vnode的更新
      updateComponent(n1, n2, optimized)
    }
  }
```

```js

const updateComponent = (n1: VNode, n2: VNode, optimized: boolean) => {
  const instance = (n2.component = n1.component)!
  // 通过shouldUpdateComponent判断组件是否需要更新
  // 1、当新组件vnode存在指令、或者transition方法时需要更新
  // 2、optimized为true并且patchFlag > 0
  // (1)组件vnode存在动态插槽时需要更新(patchFlag = PatchFlags.DYNAMIC_SLOTS)
  // (2)存在动态key值的props(patchFlag = PatchFlags.FULL_PROPS)时，对比props是否改变，如果改变则更新
  // (3)存在除了style、class的动态props(patchFlag = PatchFlags.PROPS)时，对比props是否改变，如果改变则更新
  // 3、如果是通过手写渲染函数生成的组件vnode,
  // (1)判断传入渲染函数的children是否包含$stable属性，如果不存在$stable属性则更新
  // (2)对比props是否改变，如果改变则更新
  if (shouldUpdateComponent(n1, n2, optimized)) {
    if (
      __FEATURE_SUSPENSE__ &&
      instance.asyncDep &&
      !instance.asyncResolved
    ) {
      // 动态组件更新
    } else {
      // 将新组件vnode赋值给实例的next属性
      instance.next = n2
      // 如果当前组件在更新队列中，则删除当前组件在队列中的更新任务，避免重复更新
      invalidateJob(instance.update)
      // 调用update方法执行组件的effect
      instance.update()
    }
  } else {
    // 如果不需要更新，则直接更新复制旧vnode的component、el属性到新vnode
    // 并更新实例上保存的组件vnode
    n2.component = n1.component
    n2.el = n1.el
    instance.vnode = n2
  }
}

```

注意此时实例上的next属性保存了新vnode节点，再次执行子组件的effect时，就会执行updateComponentPreRender：

```js
const updateComponentPreRender = (
  instance: ComponentInternalInstance,
  nextVNode: VNode,
  optimized: boolean
) => {
  if (__DEV__ && instance.type.__hmrId) {
    optimized = false
  }
  //
  nextVNode.component = instance
  const prevProps = instance.vnode.props
  instance.vnode = nextVNode
  instance.next = null
  // 更新props、slot
  updateProps(instance, nextVNode.props, prevProps, optimized)
  updateSlots(instance, nextVNode.children)

  // props update may have triggered pre-flush watchers.
  // flush them before the render update.
  // 更新了props可能会触发pre-flush watchers
  // 调用flushPreFlushCbs在重新渲染之前执行这些watcher
  // 这里的逻辑会在介绍scheduler的时候分析
  flushPreFlushCbs(undefined, instance.update)
}
```