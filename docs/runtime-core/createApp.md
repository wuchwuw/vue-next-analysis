## 创建流程

```js

const App = {
  template: `
    <div>
      <div>{{state}}</div>
    </div>
  `,
  setup () {
    const state = 'Hello Parent'
    return {
      state
    }
  }
}
createApp(App).mount(document.querySelector('#app'))

```

我们先从一个例子出发,来看看Vue3.x是如何根据组件生成真实DOM并挂载的。首先创建一个Vue3.x应用需要调用
createApp并传入根组件，再调用mount传入要挂载的DOM节点。

```js

export const createApp = ((...args) => {
  // 首先通过ensureRenderer创建渲染器，这也是Vue3.x支持跨平台的关键
  // 渲染器返回了createApp方法，调用createApp方法创建app实例
  const app = ensureRenderer().createApp(...args)

  if (__DEV__) {
    injectNativeTagCheck(app)
  }
  // 这里先拿到app中定义的mount方法，并重写了mount方法
  const { mount } = app
  // 定义了Web平台的mount方法
  app.mount = (containerOrSelector: Element | string): any => {
    // 如果传入的containerOrSelector是字符串，则通过containerOrSelector转化为DOM节点
    const container = normalizeContainer(containerOrSelector)
    if (!container) return
    // 通过_component拿到保存在app上的根组件定义
    const component = app._component
    // 如果根组件不是函数并且没有定义render函数和template，直接拿到挂载的根节点的innerHTML
    // 赋值给template
    if (!isFunction(component) && !component.render && !component.template) {
      component.template = container.innerHTML
    }
    // 清空container的innerHTML
    container.innerHTML = ''
    // 执行在app中定义的mount方法
    const proxy = mount(container)
    container.removeAttribute('v-cloak')
    container.setAttribute('data-v-app', '')
    return proxy
  }

  return app
}) as CreateAppFunction<Element>


/**
 * ensureRenderer调用并返回了baseCreateRenderer的执行结果
 * 这里baseCreateRenderer为创建Web平台渲染器的方法
 * 在baseCreateRenderer中，options传入的为一系列操作DOM节点的方法
 * 那么在其他平台中，就可以传入不同平台操作节点的方法来创建不同平台的渲染器。
 * 这里createApp是通过createAppAPI创建的，并且传入了定义的render方法
 */

function baseCreateRenderer(options, createHydrationFns) {
  ...
  ...
  const render: RootRenderFunction = (vnode, container) => {
    // 如果传入的vnode是null，则执行的是销毁操作
    // 拿到保存在container上的根组件vnode，调用unmount销毁
    // 否则调用patch执行根组件vnode的patch过程
    if (vnode == null) {
      if (container._vnode) {
        unmount(container._vnode, null, null, true)
      }
    } else {
      patch(container._vnode || null, vnode, container)
    }
    // 调用flushPostFlushCbs执行一些在patch中创建的钩子
    flushPostFlushCbs()
    // 保存根组件vnode
    container._vnode = vnode
  }
  // 返回渲染器
  return {
    render,
    hydrate,
    createApp: createAppAPI(render, hydrate)
  }
}

// createAppAPI创建并返回了createApp，这里也就是我们
// 调用createApp时真正执行的地方
// 传入的rootComponent为我们定义的根组件App，rootProps为根组件的props
function createAppAPI(render, hydrate) {
  return function createApp(rootComponent, rootProps = null) {
    // 通过createAppContext创建app上下文，保存全局的一些配置、组件指令等
    const context = createAppContext()
    // 存放插件
    const installedPlugins = new Set()

    let isMounted = false
    // 创建全局app对象，将传入的根组件的定义、参数等保存在app对象上
    // 并且定义了一些全局的方法，例如注册插件、注册全局组件、指令的方法等等
    // 这里我们主要分析mount方法
    const app: App = (context.app = {
      _component: rootComponent as ConcreteComponent,
      _props: rootProps,
      _container: null,
      _context: context,

      version,

      get config() {
        return context.config
      },

      set config(v) {
        if (__DEV__) {
          warn(
            `app.config cannot be replaced. Modify individual options instead.`
          )
        }
      },

      use(plugin: Plugin, ...options: any[]) {
        ...
      },

      mixin(mixin: ComponentOptions) {
        ...
      },

      component(name: string, component?: Component): any {
        ...
      },

      directive(name: string, directive?: Directive) {
        ...
      },

      mount(rootContainer: HostElement, isHydrate?: boolean): any {
        if (!isMounted) {
          //根据传入的根组件和参数生成根组件vnode
          const vnode = createVNode(
            rootComponent as ConcreteComponent,
            rootProps
          )
          // 将全局上下文保存在根组件vnode的appContext上
          vnode.appContext = context

          // HMR root reload
          if (__DEV__) {
            context.reload = () => {
              render(cloneVNode(vnode), rootContainer)
            }
          }

          if (isHydrate && hydrate) {
            hydrate(vnode as VNode<Node, Element>, rootContainer as any)
          } else {
            // 调用在baseCreateRenderer中定义的render方法渲染根vnode
            render(vnode, rootContainer)
          }
          isMounted = true
          app._container = rootContainer
          // for devtools and telemetry
          ;(rootContainer as any).__vue_app__ = app

          if (__DEV__ || __FEATURE_PROD_DEVTOOLS__) {
            devtoolsInitApp(app, version)
          }

          return vnode.component!.proxy
        } else if (__DEV__) {
          warn(
            `App has already been mounted.\n` +
              `If you want to remount the same app, move your app creation logic ` +
              `into a factory function and create fresh app instances for each ` +
              `mount - e.g. \`const createMyApp = () => createApp(App)\``
          )
        }
      },
      unmount() {
        ..
      },
      provide(key, value) {
        ...
      }
    })

    return app
  }
}

```

## 根组件的patch过程

```js

// patch方法传入旧vnode n1、新vnode n2和父节点container
// 如果传入了anchor，则插入到这个节点之前，否则插入到末尾
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
  // 则先unmount旧节点
  if (n1 && !isSameVNodeType(n1, n2)) {
    anchor = getNextHostNode(n1)
    unmount(n1, parentComponent, parentSuspense, true)
    n1 = null
  }

  if (n2.patchFlag === PatchFlags.BAIL) {
    optimized = false
    n2.dynamicChildren = null
  }
  // 拿到vnode的类型
  const { type, ref, shapeFlag } = n2
  // 根据vnode的类型处理不同的vnode
  // 而当前处理的vnode是根组件vnode，所以调用的是processComponent方法
  switch (type) {
    case Text:
      ...
    case Comment:
      ...
    case Static:
      ...
    case Fragment:
      ...
    default:
      if (shapeFlag & ShapeFlags.ELEMENT) {
       ...
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
        ...
      } else if (__FEATURE_SUSPENSE__ && shapeFlag & ShapeFlags.SUSPENSE) {
        ...
      } else if (__DEV__) {
        warn('Invalid VNode type:', type, `(${typeof type})`)
      }
  }

}

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
  // 创建组件实例
  const instance: ComponentInternalInstance = (initialVNode.component = createComponentInstance(
    initialVNode,
    parentComponent,
    parentSuspense
  ))
  ...
  // 处理组件vnode上的props、执行组件的setup方法
  setupComponent(instance)
  ...
  // 创建组件Effect
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
### 创建组件实例

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

### 处理组件vnode上的props、执行组件的setup方法

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

// 处理setup方法返回的结果
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

### 创建组件Effect、patch组件子树

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