## vnode的patch过程

```js
createApp(App).mount(document.querySelector('#app')
```

回顾之前分析的Vue3.x应用的创建过程，我们知道在createApp方法中传入的根组件最后会调用patch方法
来执行根组件vnode的patch过程，在分析了vnode的创建过程后，我们对于vnode有了一个基本的了解，
接下来我们通过分析patch过程，来了解Vue3.x对于不同vnode的处理过程：


### patch

```js

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
    // 如果旧vnode存在，并且新旧vnode的type、key不同
    // 则先unmount旧节点，并将旧节点n1设置为null
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

    const { type, ref, shapeFlag } = n2
    switch (type) {
      case Text:
        // 处理文本节点
        processText(n1, n2, container, anchor)
        break
      case Comment:
        // 处理注释节点
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
        // 处理Fragment节点
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
          // 处理elment节点
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
          // 处理组件节点
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
          // 处理teleport节点
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
          // 处理suspense节点
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

    // 设置ref
    if (ref != null && parentComponent) {
      setRef(ref, n1 && n1.ref, parentComponent, parentSuspense, n2)
    }
  }
```

可以看到patch就是一个递归处理vnode节点的过程，根据编译和创建vnode时生成的type和shapeFlag来决定处理什么节点。

### 处理组件节点processComponent

```js
// 处理组件vnode
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
  // 如果旧节点不存在则调用mountComponent，执行创建组件的逻辑
  // 否则调用updateComponent更新组件
  if (n1 == null) {
    mountComponent(
      n2,
      container,
      anchor,
      parentComponent,
      parentSuspense,
      isSVG,
      optimized
    )
  } else {
    updateComponent(n1, n2, optimized)
  }
}
```


#### 组件创建

```js
// 创建组件的逻辑
const mountComponent: MountComponentFn = (
  initialVNode,
  container,
  anchor,
  parentComponent,
  parentSuspense,
  isSVG,
  optimized
) => {
  // 1、创建组件实例
  const instance: ComponentInternalInstance = (initialVNode.component = createComponentInstance(
    initialVNode,
    parentComponent,
    parentSuspense
  ))
  ...
  // 2、处理组件vnode上的props、执行组件的setup方法
  setupComponent(instance)
  ...
  // 3、创建组件Effect
  setupRenderEffect(
    instance,
    initialVNode,
    container,
    anchor,
    parentSuspense,
    isSVG,
    optimized
  )
  ...
}
```

1、创建组件实例

```js
export function createComponentInstance(
  vnode: VNode,
  parent: ComponentInternalInstance | null,
  suspense: SuspenseBoundary | null
) {
  // 拿到根组件的定义
  const type = vnode.type as ConcreteComponent
  // 拿到全局上下文
  const appContext =
    (parent ? parent.appContext : vnode.appContext) || emptyAppContext
  // 创建组件实例
  const instance: ComponentInternalInstance = {
    uid: uid++,
    vnode,
    type,
    parent,
    appContext,
    root: null!, // to be immediately set
    next: null,
    subTree: null!, // will be set synchronously right after creation
    update: null!, // will be set synchronously right after creation
    render: null,
    proxy: null,
    withProxy: null,
    effects: null,
    provides: parent ? parent.provides : Object.create(appContext.provides),
    accessCache: null!,
    renderCache: [],

    // state
    ctx: EMPTY_OBJ,
    data: EMPTY_OBJ,
    props: EMPTY_OBJ,
    attrs: EMPTY_OBJ,
    slots: EMPTY_OBJ,
    refs: EMPTY_OBJ,
    setupState: EMPTY_OBJ,
    setupContext: null,

    // suspense related
    suspense,
    asyncDep: null,
    asyncResolved: false,

    // lifecycle hooks
    // not using enums here because it results in computed properties
    isMounted: false,
    isUnmounted: false,
    isDeactivated: false,
    bc: null,
    c: null,
    bm: null,
    m: null,
    bu: null,
    u: null,
    um: null,
    bum: null,
    da: null,
    a: null,
    rtg: null,
    rtc: null,
    ec: null,
    emit: null as any, // to be set immediately
    emitted: null
  }
  if (__DEV__) {
    instance.ctx = createRenderContext(instance)
  } else {
    instance.ctx = { _: instance }
  }
  // 将根组件的实例保存在实例的root属性上
  instance.root = parent ? parent.root : instance
  // 将emit方法的this指向实例，并保存到emit属性上
  instance.emit = emit.bind(null, instance)

  return instance
}
```

2、处理组件插槽、props，执行setup方法

```js
export function setupComponent(
  instance: ComponentInternalInstance,
  isSSR = false
) {
  isInSSRComponentSetup = isSSR

  const { props, children, shapeFlag } = instance.vnode
  //
  const isStateful = shapeFlag & ShapeFlags.STATEFUL_COMPONENT
  // 处理props
  initProps(instance, props, isStateful, isSSR)
  // 处理slot
  initSlots(instance, children)
  // 如果是非函数组件，调用setupStatefulComponent执行setup
  const setupResult = isStateful
    ? setupStatefulComponent(instance, isSSR)
    : undefined
  isInSSRComponentSetup = false
  return setupResult
}
```

执行setup方法

```js
function setupStatefulComponent(
  instance: ComponentInternalInstance,
  isSSR: boolean
) {
  // 拿到实例上的组件定义
  const Component = instance.type as ComponentOptions
  ...
  instance.accessCache = {}
  // 代理组件上下文，将生成的代理对象保存在proxy上
  instance.proxy = new Proxy(instance.ctx, PublicInstanceProxyHandlers)
  const { setup } = Component
  if (setup) {
    // 如果定义了setup方法,先拿到保存在实例上的attrs、slots、emit
    const setupContext = (instance.setupContext =
      setup.length > 1 ? createSetupContext(instance) : null)
    // 设置currentInstance
    currentInstance = instance
    // 调用setup方法时暂定依赖收集
    pauseTracking()
    // 调用setup方法
    const setupResult = callWithErrorHandling(
      setup,
      instance,
      ErrorCodes.SETUP_FUNCTION,
      [__DEV__ ? shallowReadonly(instance.props) : instance.props, setupContext]
    )
    resetTracking()
    currentInstance = null
    // 处理setup方法返回的结果
    handleSetupResult(instance, setupResult, isSSR)
  } else {
    // 如果没有定义setup，直接执行finishComponentSetup方法
    finishComponentSetup(instance, isSSR)
  }
}
```

处理setup方法返回的结果

```js
export function handleSetupResult(
  instance: ComponentInternalInstance,
  setupResult: unknown,
  isSSR: boolean
) {
  // 如果setup返回的是一个render函数，那么将它保存在实例的render属性上
  if (isFunction(setupResult)) {
    // setup returned an inline render function
    instance.render = setupResult as InternalRenderFunction
  } else if (isObject(setupResult)) {
    // 如果返回的是一个对象，则代理这个对象，默认展开对象中的ref对象的值
    instance.setupState = proxyRefs(setupResult)
  } else if (__DEV__ && setupResult !== undefined) {
    warn(
      `setup() should return an object. Received: ${
        setupResult === null ? 'null' : typeof setupResult
      }`
    )
  }
  // 调用finishComponentSetup方法
  finishComponentSetup(instance, isSSR)
}
```

根据模板编译渲染函数

```js
function finishComponentSetup(
  instance: ComponentInternalInstance,
  isSSR: boolean
) {
  const Component = instance.type as ComponentOptions

  // template / render function normalization
  if (__NODE_JS__ && isSSR) {
    ...
  } else if (!instance.render) {
    // 如果不存在render函数，根据定义的template调用compile方法生成render函数
    if (compile && Component.template && !Component.render) {
      Component.render = compile(Component.template, {
        isCustomElement: instance.appContext.config.isCustomElement,
        delimiters: Component.delimiters
      })
    }
    // 将生产的render函数保存到实例render属性上
    instance.render = (Component.render || NOOP) as InternalRenderFunction
  }
}

```

3、创建组件Effect，执行组件渲染函数，patch组件子树

```js
const setupRenderEffect: SetupRenderEffectFn = (
  instance,
  initialVNode,
  container,
  anchor,
  parentSuspense,
  isSVG,
  optimized
) => {
  // 创建Effect，并保存在实例的updata方法上，
  // Effect在创建的时候会先执行本身
  instance.update = effect(function componentEffect() {
    if (!instance.isMounted) {
      // 创建组件逻辑
      let vnodeHook: VNodeHook | null | undefined
      const { el, props } = initialVNode
      const { bm, m, parent } = instance

      // 调用beforeMount钩子
      if (bm) {
        invokeArrayFns(bm)
      }
      // 调用vnode上的beforeMount钩子
      if ((vnodeHook = props && props.onVnodeBeforeMount)) {
        invokeVNodeHook(vnodeHook, parent, initialVNode)
      }
      // 创建子树vnode
      const subTree = (instance.subTree = renderComponentRoot(instance))
      ...
      // 调用patch执行子树vnode的patch过程
      patch(
        null,
        subTree,
        container,
        anchor,
        instance,
        parentSuspense,
        isSVG
      )
      // 将生成的真实DOM节点保存在组件vnode的el属性上
      initialVNode.el = subTree.el
      // 调用mountd钩子
      if (m) {
        queuePostRenderEffect(m, parentSuspense)
      }
      // 调用vnode的mountd钩子
      if ((vnodeHook = props && props.onVnodeMounted)) {
        queuePostRenderEffect(() => {
          invokeVNodeHook(vnodeHook!, parent, initialVNode)
        }, parentSuspense)
      }
      instance.isMounted = true
    } else {
      // 更新组件逻辑
    }
  }, __DEV__ ? createDevEffectOptions(instance) : prodEffectOptions)
  // #1801 mark it to allow recursive updates
  ;(instance.update as SchedulerJob).allowRecurse = true
}
```

#### 组件更新

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

当组件更新时，通常有两种触发组件更新的方式：

+ 1、组件内响应式对象改变，触发组件effect重新执行
+ 2、父组件更新时触发组件的更新

第一种触发方式不需要更新组件vnode，所以直接将之前的组件vnode赋值给next，而第二种方式需要调用updateComponentPreRender
更新组件vnode。处理完组件vnode后，调用render方法重新生成组件vnode的子树，也就是subtree，通过patch方法重新对比新旧子树
并更新DOM节点。

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

  // 如果组件内监听了props，那么更新了props就会触发watchers
  // 调用flushPreFlushCbs在重新渲染之前执行这些watcher
  // 这里的逻辑会在介绍scheduler的时候分析
  flushPreFlushCbs(undefined, instance.update)
}
```

### 处理Element节点 processElement

```js
// 处理Element节点同样分为创建和更新过程
const processElement = (
  n1: VNode | null,
  n2: VNode,
  container: RendererElement,
  anchor: RendererNode | null,
  parentComponent: ComponentInternalInstance | null,
  parentSuspense: SuspenseBoundary | null,
  isSVG: boolean,
  optimized: boolean
) => {
  isSVG = isSVG || (n2.type as string) === 'svg'
  if (n1 == null) {
    mountElement(
      n2,
      container,
      anchor,
      parentComponent,
      parentSuspense,
      isSVG,
      optimized
    )
  } else {
    patchElement(n1, n2, parentComponent, parentSuspense, isSVG, optimized)
  }
}
```

#### 创建Element节点

```js
  const mountElement = (
    vnode: VNode,
    container: RendererElement,
    anchor: RendererNode | null,
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    isSVG: boolean,
    optimized: boolean
  ) => {
    let el: RendererElement
    let vnodeHook: VNodeHook | undefined | null
    const {
      type,
      props,
      shapeFlag,
      transition,
      scopeId,
      patchFlag,
      dirs
    } = vnode
    if (
      !__DEV__ &&
      vnode.el &&
      hostCloneNode !== undefined &&
      patchFlag === PatchFlags.HOISTED
    ) {
      // If a vnode has non-null el, it means it's being reused.
      // Only static vnodes can be reused, so its mounted DOM nodes should be
      // exactly the same, and we can simply do a clone here.
      // only do this in production since cloned trees cannot be HMR updated.
      // 在生产环境中，如果此时vnode的DOM已经生成保存在el属性上
      // 并且vnode是一个PatchFlags.HOISTED静态节点，说明它已经被patch过并且不会改变
      // 直接复制vnode的DOM节点
      el = vnode.el = hostCloneNode(vnode.el)
    } else {
      // 否则 根据vnode的type创建DOM节点
      el = vnode.el = hostCreateElement(
        vnode.type as string,
        isSVG,
        props && props.is
      )

      // mount children first, since some props may rely on child content
      // being already rendered, e.g. `<select value>`
      // 先创建子节点，props或者props上的某些钩子可能会依赖子节点
      if (shapeFlag & ShapeFlags.TEXT_CHILDREN) {
        // 如果子节点是文本直接设置节点内容
        hostSetElementText(el, vnode.children as string)
      } else if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
        // 如果子节点是array，遍历子节点
        // 递归调用patch创建子节点
        mountChildren(
          vnode.children as VNodeArrayChildren,
          el,
          null,
          parentComponent,
          parentSuspense,
          isSVG && type !== 'foreignObject',
          optimized || !!vnode.dynamicChildren
        )
      }

      // props
      // 处理vnode的props，并调用BeforeMount钩子
      if (props) {
        for (const key in props) {
          if (!isReservedProp(key)) {
            hostPatchProp(
              el,
              key,
              null,
              props[key],
              isSVG,
              vnode.children as VNode[],
              parentComponent,
              parentSuspense,
              unmountChildren
            )
          }
        }
        if ((vnodeHook = props.onVnodeBeforeMount)) {
          invokeVNodeHook(vnodeHook, parentComponent, vnode)
        }
      }
      // 如果存在指令，调用指令的beforeMount钩子
      if (dirs) {
        invokeDirectiveHook(vnode, null, parentComponent, 'beforeMount')
      }

      // scopeId
      // 如果是使用单文件开发模式，存在scopeId，则设置scopeId
      if (scopeId) {
        hostSetScopeId(el, scopeId)
      }
      const treeOwnerId = parentComponent && parentComponent.type.__scopeId
      // vnode's own scopeId and the current patched component's scopeId is
      // different - this is a slot content node.
      // 如果scopeId和实例上的scopeId不同
      // 那么证明节点为插槽内的节点，那么将节点的scopeId设置为treeOwnerId + '-s'
      if (treeOwnerId && treeOwnerId !== scopeId) {
        hostSetScopeId(el, treeOwnerId + '-s')
      }
    }
    // #1583 For inside suspense + suspense not resolved case, enter hook should call when suspense resolved
    // #1689 For inside suspense + suspense resolved case, just call it
    // 关于transition后面会详细介绍
    // 如果满足根据以下这些条件，调用transition的beforeEnter钩子
    const needCallTransitionHooks =
      (!parentSuspense || (parentSuspense && parentSuspense!.isResolved)) &&
      transition &&
      !transition.persisted
    if (needCallTransitionHooks) {
      transition!.beforeEnter(el)
    }
    // 将节点插入真实的DOM中
    hostInsert(el, container, anchor)
    // 调用vnode的mounted钩子
    // transition的enter钩子
    // 指令的mounted钩子
    if (
      (vnodeHook = props && props.onVnodeMounted) ||
      needCallTransitionHooks ||
      dirs
    ) {
      queuePostRenderEffect(() => {
        vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, vnode)
        needCallTransitionHooks && transition!.enter(el)
        dirs && invokeDirectiveHook(vnode, null, parentComponent, 'mounted')
      }, parentSuspense)
    }
  }
```

#### 更新Element节点

```js
  const patchElement = (
    n1: VNode,
    n2: VNode,
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    isSVG: boolean,
    optimized: boolean
  ) => {
    const el = (n2.el = n1.el!)
    let { patchFlag, dynamicChildren, dirs } = n2
    // #1426 take the old vnode's patch flag into account since user may clone a
    // compiler-generated vnode, which de-opts to FULL_PROPS
    // 同步新旧节点的patchFlag
    patchFlag |= n1.patchFlag & PatchFlags.FULL_PROPS
    const oldProps = n1.props || EMPTY_OBJ
    const newProps = n2.props || EMPTY_OBJ
    let vnodeHook: VNodeHook | undefined | null
    // 调用vnode的before update钩子
    if ((vnodeHook = newProps.onVnodeBeforeUpdate)) {
      invokeVNodeHook(vnodeHook, parentComponent, n2, n1)
    }
    // 如果节点存在指令调用指令的before update钩子
    if (dirs) {
      invokeDirectiveHook(n2, n1, parentComponent, 'beforeUpdate')
    }

    if (__DEV__ && isHmrUpdating) {
      // HMR updated, force full diff
      patchFlag = 0
      optimized = false
      dynamicChildren = null
    }
    // 处理节点的props
    // patchFlag > 0 进入优化模式，根据props的动态类型对比更新props
    if (patchFlag > 0) {
      // the presence of a patchFlag means this element's render code was
      // generated by the compiler and can take the fast path.
      // in this path old node and new node are guaranteed to have the same shape
      // (i.e. at the exact same position in the source template)
      // 节点存在动态key时，对比所有的props
      if (patchFlag & PatchFlags.FULL_PROPS) {
        // element props contain dynamic keys, full diff needed
        patchProps(
          el,
          n2,
          oldProps,
          newProps,
          parentComponent,
          parentSuspense,
          isSVG
        )
      } else {
        // class
        // this flag is matched when the element has dynamic class bindings.
        // 存在动态class，处理动态class props
        if (patchFlag & PatchFlags.CLASS) {
          if (oldProps.class !== newProps.class) {
            hostPatchProp(el, 'class', null, newProps.class, isSVG)
          }
        }

        // style
        // this flag is matched when the element has dynamic style bindings
        // 存在动态style，处理动态style props
        if (patchFlag & PatchFlags.STYLE) {
          hostPatchProp(el, 'style', oldProps.style, newProps.style, isSVG)
        }

        // props
        // This flag is matched when the element has dynamic prop/attr bindings
        // other than class and style. The keys of dynamic prop/attrs are saved for
        // faster iteration.
        // Note dynamic keys like :[foo]="bar" will cause this optimization to
        // bail out and go through a full diff because we need to unset the old key
        // 存在除了动态class、动态style的props时，会将props的key值保存在dynamicProps属性上
        // 只对比dynamicProps上的props key即可
        if (patchFlag & PatchFlags.PROPS) {
          // if the flag is present then dynamicProps must be non-null
          const propsToUpdate = n2.dynamicProps!
          for (let i = 0; i < propsToUpdate.length; i++) {
            const key = propsToUpdate[i]
            const prev = oldProps[key]
            const next = newProps[key]
            if (
              next !== prev ||
              (hostForcePatchProp && hostForcePatchProp(el, key))
            ) {
              hostPatchProp(
                el,
                key,
                prev,
                next,
                isSVG,
                n1.children as VNode[],
                parentComponent,
                parentSuspense,
                unmountChildren
              )
            }
          }
        }
      }

      // text
      // This flag is matched when the element has only dynamic text children.
      // 存在动态文本子节点时，直接更新节点的内容
      if (patchFlag & PatchFlags.TEXT) {
        if (n1.children !== n2.children) {
          hostSetElementText(el, n2.children as string)
        }
      }
    } else if (!optimized && dynamicChildren == null) {
      // unoptimized, full diff
      // 当patchFlag < 0并且dynamicChildren === null时不进入优化模式
      // 此时要patch所有props
      patchProps(
        el,
        n2,
        oldProps,
        newProps,
        parentComponent,
        parentSuspense,
        isSVG
      )
    }

    const areChildrenSVG = isSVG && n2.type !== 'foreignObject'
    // 递归patch子节点
    // 存在dynamicChildren时，只patch dynamicChildren保存的动态节点
    if (dynamicChildren) {
      patchBlockChildren(
        n1.dynamicChildren!,
        dynamicChildren,
        el,
        parentComponent,
        parentSuspense,
        areChildrenSVG
      )
      if (__DEV__ && parentComponent && parentComponent.type.__hmrId) {
        traverseStaticChildren(n1, n2)
      }
    } else if (!optimized) {
      // full diff
      // 否则调用patchChildren，patch所有子节点
      patchChildren(
        n1,
        n2,
        el,
        null,
        parentComponent,
        parentSuspense,
        areChildrenSVG
      )
    }
    // 更新完子节点后调用vnode和指令的updated钩子
    if ((vnodeHook = newProps.onVnodeUpdated) || dirs) {
      queuePostRenderEffect(() => {
        vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, n2, n1)
        dirs && invokeDirectiveHook(n2, n1, parentComponent, 'updated')
      }, parentSuspense)
    }
  }
```

### 处理Fragment节点

+ 1、在Vue3中，模板已经支持了多个根节点，当模板存在多个根节点时，Vue会自动生成一个Fragment节点，将所有的根节点作为Fragment的子节点
+ 2、使用v-for指令渲染列表时，生成的vnode会作为一个Fragment节点的子节点

```js
  const processFragment = (
    n1: VNode | null,
    n2: VNode,
    container: RendererElement,
    anchor: RendererNode | null,
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    isSVG: boolean,
    optimized: boolean
  ) => {
    // Fragment节点是没有内容的，也不会出现在真实的DOM节点
    // 所以需要创建2个锚点来确定Fragment节点的子节点插入的位置
    const fragmentStartAnchor = (n2.el = n1 ? n1.el : hostCreateText(''))!
    const fragmentEndAnchor = (n2.anchor = n1 ? n1.anchor : hostCreateText(''))!

    let { patchFlag, dynamicChildren } = n2
    if (patchFlag > 0) {
      optimized = true
    }

    if (__DEV__ && isHmrUpdating) {
      // HMR updated, force full diff
      patchFlag = 0
      optimized = false
      dynamicChildren = null
    }

    if (n1 == null) {
      // 创建Fragment
      // 将创建的空节点插入父节点中
      hostInsert(fragmentStartAnchor, container, anchor)
      hostInsert(fragmentEndAnchor, container, anchor)
      // a fragment can only have array children
      // since they are either generated by the compiler, or implicitly created
      // from arrays.
      // 调用mountChildren递归创建子节点
      mountChildren(
        n2.children as VNodeArrayChildren,
        container,
        fragmentEndAnchor,
        parentComponent,
        parentSuspense,
        isSVG,
        optimized
      )
    } else {
      // 更新Fragment节点
      if (
        patchFlag > 0 &&
        patchFlag & PatchFlags.STABLE_FRAGMENT &&
        dynamicChildren
      ) {
        // a stable fragment (template root or <template v-for>) doesn't need to
        // patch children order, but it may contain dynamicChildren.
        // 如果是STABLE_FRAGMENT，那么它的子节点的顺序不会改变
        // 那么只需要遍历dynamicChildren动态节点，递归调用patch更新动态节点
        patchBlockChildren(
          n1.dynamicChildren!,
          dynamicChildren,
          container,
          parentComponent,
          parentSuspense,
          isSVG
        )
        if (__DEV__ && parentComponent && parentComponent.type.__hmrId) {
          traverseStaticChildren(n1, n2)
        }
      } else {
        // keyed / unkeyed, or manual fragments.
        // for keyed & unkeyed, since they are compiler generated from v-for,
        // each child is guaranteed to be a block so the fragment will never
        // have dynamicChildren.
        // 如果是v-for生成的keyed或者unkeyed的fragment节点，那么它的子节点的顺序是可能
        // 改变顺序的，所以应该对比所有子节点
        patchChildren(
          n1,
          n2,
          container,
          fragmentEndAnchor,
          parentComponent,
          parentSuspense,
          isSVG,
          optimized
        )
      }
    }
  }
```

更新keyed、 unkeyed子节点

```js
  // 更新不带key值的子节点
  const patchUnkeyedChildren = (
    c1: VNode[],
    c2: VNodeArrayChildren,
    container: RendererElement,
    anchor: RendererNode | null,
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    isSVG: boolean,
    optimized: boolean
  ) => {
    c1 = c1 || EMPTY_ARR
    c2 = c2 || EMPTY_ARR
    const oldLength = c1.length
    const newLength = c2.length
    // 获取新旧子节点长度的最小值
    const commonLength = Math.min(oldLength, newLength)
    let i
    // 遍历到commonLength，递归调用patch
    for (i = 0; i < commonLength; i++) {
      const nextChild = (c2[i] = optimized
        ? cloneIfMounted(c2[i] as VNode)
        : normalizeVNode(c2[i]))
      patch(
        c1[i],
        nextChild,
        container,
        null,
        parentComponent,
        parentSuspense,
        isSVG,
        optimized
      )
    }
    // 当旧子节点的长度大于新的，则销毁旧节点，否则创建新节点
    if (oldLength > newLength) {
      // remove old
      unmountChildren(c1, parentComponent, parentSuspense, true, commonLength)
    } else {
      // mount new
      mountChildren(
        c2,
        container,
        anchor,
        parentComponent,
        parentSuspense,
        isSVG,
        optimized,
        commonLength
      )
    }
  }

// 更新带key值的子节点

  const patchKeyedChildren = (
    c1: VNode[],
    c2: VNodeArrayChildren,
    container: RendererElement,
    parentAnchor: RendererNode | null,
    parentComponent: ComponentInternalInstance | null,
    parentSuspense: SuspenseBoundary | null,
    isSVG: boolean,
    optimized: boolean
  ) => {
    let i = 0
    const l2 = c2.length
    let e1 = c1.length - 1 // prev ending index
    let e2 = l2 - 1 // next ending index

    // 1. sync from start
    // (a b) c
    // (a b) d e
    // 从头开始同步节点，直到第一个不相同的节点
    // 记录此时的同步到的节点的位置i
    while (i <= e1 && i <= e2) {
      const n1 = c1[i]
      const n2 = (c2[i] = optimized
        ? cloneIfMounted(c2[i] as VNode)
        : normalizeVNode(c2[i]))
      if (isSameVNodeType(n1, n2)) {
        patch(
          n1,
          n2,
          container,
          null,
          parentComponent,
          parentSuspense,
          isSVG,
          optimized
        )
      } else {
        break
      }
      i++
    }

    // 2. sync from end
    // a (b c)
    // d e (b c)
    // 从尾部开始同步节点，直到第一个不相同的节点
    // 记录此时的同步到的节点的位置e1、e2
    while (i <= e1 && i <= e2) {
      const n1 = c1[e1]
      const n2 = (c2[e2] = optimized
        ? cloneIfMounted(c2[e2] as VNode)
        : normalizeVNode(c2[e2]))
      if (isSameVNodeType(n1, n2)) {
        patch(
          n1,
          n2,
          container,
          null,
          parentComponent,
          parentSuspense,
          isSVG,
          optimized
        )
      } else {
        break
      }
      e1--
      e2--
    }

    // 3. common sequence + mount
    // (a b)
    // (a b) c
    // i = 2, e1 = 1, e2 = 2
    // (a b)
    // c (a b)
    // i = 0, e1 = -1, e2 = 0
    // 同步完头部、尾部的节点后
    // 如果旧子节点数组没有剩余节点也就是i > e1
    // 并且新节点有剩余节点也就是i <= e2
    // 则证明有新添加的节点，调用patch传入n1 === null创建节点
    if (i > e1) {
      if (i <= e2) {
        const nextPos = e2 + 1
        const anchor = nextPos < l2 ? (c2[nextPos] as VNode).el : parentAnchor
        while (i <= e2) {
          patch(
            null,
            (c2[i] = optimized
              ? cloneIfMounted(c2[i] as VNode)
              : normalizeVNode(c2[i])),
            container,
            anchor,
            parentComponent,
            parentSuspense,
            isSVG
          )
          i++
        }
      }
    }

    // 4. common sequence + unmount
    // (a b) c
    // (a b)
    // i = 2, e1 = 2, e2 = 1
    // a (b c)
    // (b c)
    // i = 0, e1 = 0, e2 = -1
    // 同步完头部、尾部的节点后
    // 如果新子节点数组没有剩余节点也就是i > e2
    // 并且就节点有剩余节点也就是i <= e1
    // 则证明有删除的节点，调用unmount销毁旧节点
    else if (i > e2) {
      while (i <= e1) {
        unmount(c1[i], parentComponent, parentSuspense, true)
        i++
      }
    }

    // 5. unknown sequence
    // [i ... e1 + 1]: a b [c d e] f g
    // [i ... e2 + 1]: a b [e d c h] f g
    // i = 2, e1 = 4, e2 = 5
    // 同步头尾节点后新旧节点都剩余节点
    else {
      const s1 = i // prev starting index
      const s2 = i // next starting index

      // 5.1 build key:index map for newChildren
      // 根据新节点的顺序创建key为新节点的key，value为位置i的map
      const keyToNewIndexMap: Map<string | number, number> = new Map()
      for (i = s2; i <= e2; i++) {
        const nextChild = (c2[i] = optimized
          ? cloneIfMounted(c2[i] as VNode)
          : normalizeVNode(c2[i]))
        if (nextChild.key != null) {
          if (__DEV__ && keyToNewIndexMap.has(nextChild.key)) {
            warn(
              `Duplicate keys found during update:`,
              JSON.stringify(nextChild.key),
              `Make sure keys are unique.`
            )
          }
          keyToNewIndexMap.set(nextChild.key, i)
        }
      }

      // 5.2 loop through old children left to be patched and try to patch
      // matching nodes & remove nodes that are no longer present
      let j
      let patched = 0
      // 以新节点剩余的数量为需要patch的数量
      const toBePatched = e2 - s2 + 1
      let moved = false
      // used to track whether any node has moved
      let maxNewIndexSoFar = 0
      // works as Map<newIndex, oldIndex>
      // Note that oldIndex is offset by +1
      // and oldIndex = 0 is a special value indicating the new node has
      // no corresponding old node.
      // used for determining longest stable subsequence
      // 创建新节点的位置到旧节点位置的映射，初始化为0
      const newIndexToOldIndexMap = new Array(toBePatched)
      for (i = 0; i < toBePatched; i++) newIndexToOldIndexMap[i] = 0
      // 遍历旧节点
      for (i = s1; i <= e1; i++) {
        const prevChild = c1[i]
        if (patched >= toBePatched) {
          // all new children have been patched so this can only be a removal
          unmount(prevChild, parentComponent, parentSuspense, true)
          continue
        }
        let newIndex
        // 如果旧节点的key存在，则获取他在新节点中的位置赋值给newIndex
        if (prevChild.key != null) {
          newIndex = keyToNewIndexMap.get(prevChild.key)
        } else {
          // key-less node, try to locate a key-less node of the same type
          for (j = s2; j <= e2; j++) {
            if (
              newIndexToOldIndexMap[j - s2] === 0 &&
              isSameVNodeType(prevChild, c2[j] as VNode)
            ) {
              newIndex = j
              break
            }
          }
        }
        // 如果newIndex不存在，说明该节点已经删除，则销毁该节点
        if (newIndex === undefined) {
          unmount(prevChild, parentComponent, parentSuspense, true)
        } else {
          // 否则，更新新节点的位置到旧节点位置的映射
          newIndexToOldIndexMap[newIndex - s2] = i + 1
          // 通过maxNewIndexSoFar来记录每次newIndex的位置
          // 如果每次都是
          if (newIndex >= maxNewIndexSoFar) {
            maxNewIndexSoFar = newIndex
          } else {
            moved = true
          }
          patch(
            prevChild,
            c2[newIndex] as VNode,
            container,
            null,
            parentComponent,
            parentSuspense,
            isSVG,
            optimized
          )
          patched++
        }
      }

      // 5.3 move and mount
      // generate longest stable subsequence only when nodes have moved
      const increasingNewIndexSequence = moved
        ? getSequence(newIndexToOldIndexMap)
        : EMPTY_ARR
      j = increasingNewIndexSequence.length - 1
      // looping backwards so that we can use last patched node as anchor
      for (i = toBePatched - 1; i >= 0; i--) {
        const nextIndex = s2 + i
        const nextChild = c2[nextIndex] as VNode
        const anchor =
          nextIndex + 1 < l2 ? (c2[nextIndex + 1] as VNode).el : parentAnchor
        if (newIndexToOldIndexMap[i] === 0) {
          // mount new
          patch(
            null,
            nextChild,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            isSVG
          )
        } else if (moved) {
          // move if:
          // There is no stable subsequence (e.g. a reverse)
          // OR current node is not among the stable sequence
          if (j < 0 || i !== increasingNewIndexSequence[j]) {
            move(nextChild, container, anchor, MoveType.REORDER)
          } else {
            j--
          }
        }
      }
    }
  }
```