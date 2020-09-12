## vnode

Vue在2.x中引入了vnode，它是用来描述节点信息的javascript对象。在以往的版本中关于vnode并没有什么特别要分析地方，
但是在3.x版本中为了优化patch的过程，Vue在编译和创建vnode的过程中新增了很多逻辑，不仅新增了一些vnode的类型，例如
Suspense、Teleport、Fragment等等，还通过ShapeFlag和PatchFlag对vnode的类型和动态信息进行标记。通过ShapeFlag，
patch过程只需要执行相应vnode类型的分支逻辑即可，减少了许多条件判断，而有了PatchFlag在组件的更新阶段只需要对比新旧vnode上动
态的地方即可，大大提高了更新效率。

Vue3.x对vnode的另一个优化就是brock tree。以往在更新组件的过程中，都要遍历整个组件的vnode tree，这就使得
组件的更新速度是和模板的大小正相关的，这对于某些存在大量静态节点的组件很不友好。而在3.x版本中，通过brock tree在创建
vnode的过程中收集模板的动态节点，在大部分情况下只需要更新组件的动态节点即可，这使得组件的更新速度变成了和模板的动态节点
正相关，从而大大提高了patch速度。

### ShapeFlag

ShapeFlags的类型有以下几种，通过左移操作符来枚举ShapeFlags的值，配合按位与和按位或操作符来添加或者判断vnode的ShapeFlags，举个例子：
当vnode是一个普通element vnode并且它有多个子节点时，它的shapeFlag属性的值为ShapeFlags.ELEMENT | ShapeFlags.ARRAY_CHILDREN = 17，
同时也可以使用按位与(vnode.shapeFlag & ShapeFlags.ELEMENT)来判断vnode是不是一个普通element vnode。

```js
export const enum ShapeFlags {
  // vnode是一个普通element vnode
  ELEMENT = 1,
  // vnode是一个函数组件vnode
  FUNCTIONAL_COMPONENT = 1 << 1,
  // vnode是一个普通组件vnode
  STATEFUL_COMPONENT = 1 << 2,
  // vnode的子节点是普通文本
  TEXT_CHILDREN = 1 << 3,
  // vnode有多个子节点
  ARRAY_CHILDREN = 1 << 4,
  // vnode的子节点为插槽
  SLOTS_CHILDREN = 1 << 5,
  // vnode是一个teleport
  TELEPORT = 1 << 6,
  // vnode是一个suspense
  SUSPENSE = 1 << 7,
  // 当组件使用KEEPALIVE时，组件vnode还未被缓存的状态
  COMPONENT_SHOULD_KEEP_ALIVE = 1 << 8,
  // 当组件使用KEEPALIVE时，组件vnode已经被缓存的状态
  COMPONENT_KEPT_ALIVE = 1 << 9,
  // vnode是一个组件vnode
  COMPONENT = ShapeFlags.STATEFUL_COMPONENT | ShapeFlags.FUNCTIONAL_COMPONENT
}
```

### PatchFlag

```js

通过PatchFlags来标记一个vnode包含的动态信息，在更新组件的阶段只需要对比新旧vnode的动态部分即可。

export const enum PatchFlags {
  // vnode的节点内容为动态文本
  TEXT = 1,
  // vnode绑定了动态的class
  CLASS = 1 << 1,
  // vnode绑定了动态的style
  STYLE = 1 << 2,
  // vnode绑定了除了class、style的其他props
  PROPS = 1 << 3,
  // vnode绑定了动态key值的props
  FULL_PROPS = 1 << 4,
  HYDRATE_EVENTS = 1 << 5,
  // 子节点顺序不改变的FRAGMENT
  STABLE_FRAGMENT = 1 << 6,
  // 子节点带key值的FRAGMENT
  KEYED_FRAGMENT = 1 << 7,
  // 子节点不带key值的FRAGMENT
  UNKEYED_FRAGMENT = 1 << 8,
  // 绑定了v-ref或者其他自定义指令
  NEED_PATCH = 1 << 9,
  // 有动态插槽的组件vnode，存在此标记时组件每次都需要强制更新
  DYNAMIC_SLOTS = 1 << 10,
  // 特殊标记
  // vnode是一个纯静态节点
  HOISTED = -1,
  // 特殊标记
  // 存在此标记时在diff阶段需要跳过优化模式
  // 例如非编译器生成的插槽，通过手写render函数生成的vnode等
  BAIL = -2
}
```

### Vue 3 Template Explorer

Vue官方提供了一个在线编译器[Template Explorer](https://vue-next-template-explorer.netlify.app/)，用来在线预览模板编译成的渲染函数。
我们可以通过Template Explorer来看看模板编译成的渲染函数究竟是什么样的:

```html
<template>
  <div>TEXT{{state}}</div>
  <div :class="state">CLASS</div>
  <div :style="state">STYLE</div>
  <div :aa="state">PROPS</div>
  <div :[state2]="state">FULL PROPS</div>
  <div v-for="item in list">UNKEYED_FRAGMENT</div>
  <div v-for="item in list" :key="item.key">KEYED_FRAGMENT</div>
  <div v-ref="state">NEED_PATCH</div>
  <Child>
    <template v-slot:[state]="dynamic">
      DYNAMIC_SLOTS
    </template>
  </Child>
  <div>HOISTED</div>
</template>
```

```js
(_openBlock(), _createBlock(_Fragment, null, [
  _createVNode("div", null, "TEXT" + _toDisplayString(_ctx.state), 1 /* TEXT */),
  _createVNode("div", { class: _ctx.state }, "CLASS", 2 /* CLASS */),
  _createVNode("div", { style: _ctx.state }, "STYLE", 4 /* STYLE */),
  _createVNode("div", { aa: _ctx.state }, "PROPS", 8 /* PROPS */, ["aa"]),
  _createVNode("div", { [_ctx.state2]: _ctx.state }, "FULL PROPS", 16 /* FULL_PROPS */),
  (_openBlock(true), _createBlock(_Fragment, null, _renderList(_ctx.list, (item) => {
    return (_openBlock(), _createBlock("div", null, "UNKEYED_FRAGMENT"))
  }), 256 /* UNKEYED_FRAGMENT */)),
  (_openBlock(true), _createBlock(_Fragment, null, _renderList(_ctx.list, (item) => {
    return (_openBlock(), _createBlock("div", {
      key: item.key
    }, "KEYED_FRAGMENT"))
  }), 128 /* KEYED_FRAGMENT */)),
  _withDirectives(_createVNode("div", null, "NEED_PATCH", 512 /* NEED_PATCH */), [
    [_directive_ref, _ctx.state]
  ]),
  _createVNode(_component_Child, null, {
    [_ctx.state]: _withCtx((dynamic) => [
      _createTextVNode(" DYNAMIC_SLOTS ")
    ]),
    _: 2
  }, 1024 /* DYNAMIC_SLOTS */),
  _createVNode("div", null, "HOISTED")
], 64 /* STABLE_FRAGMENT */))
```

以上的模板基本包含了所有vnode的PatchFlag类型，这里可以注意一下Vue3.x版本已经支持模板有多个根节点，在这种情况下Vue会自动生成一个Stable Fragment节点作为vnode tree的根节点。


### 创建vnode以及收集动态节点的过程

```html
<!-- bock1 -->
<div>
  <!-- bock2 -->
  <div v-if="state">
    <div>
      <span>静态节点</span>
      <span>动态节点1{{state}}</span>
    </div>
  </div>
  <!-- bock3 -->
  <div v-for="item in state">
  </div>
  <div>
    <span>静态节点</span>
    <span>动态节点2{{state}}</span>
  </div>
</div>
```

```js
(_openBlock(), _createBlock("div", null, [
  (_ctx.state)
    ? (_openBlock(), _createBlock("div", { key: 0 }, [
        _createVNode("div", null, [
          _createVNode("span", null, "静态节点"),
          _createVNode("span", null, _toDisplayString(_ctx.state), 1 /* TEXT */)
        ])
      ]))
    : _createCommentVNode("v-if", true),
  (_openBlock(true), _createBlock(_Fragment, null, _renderList(_ctx.state, (item) => {
    return (_openBlock(), _createBlock("div", null, " bock2 "))
  }), 256 /* UNKEYED_FRAGMENT */)),
  _createVNode("div", null, [
    _createVNode("span", null, "静态节点"),
    _createVNode("span", null, _toDisplayString(_ctx.state), 1 /* TEXT */)
  ])
]))
```

我们以上面的模板生成的渲染函数为例子来分析执行渲染函数创建vnode的过程。在Vue3.x中，Vue会将模板分成一个个block，用于收集
动态节点。模板的根节点、有v-for或者v-if指令的节点都是一个block，一个block内的所有动态节点都会添加到block节点生成的
vnode的dynamicChildren属性上，在组件更新的时候只需要对比所有动态节点即可。从上面生成的渲染函数可以看到，在执行_createVNode函数生成vnode时，根节点、有v-for或v-if指令的节点在创建vnode之前都会调用_openBlock和_createBlock打开并
创建一个block：

```js
// openBlock根据传入的disableTracking参数来设置当前的currentBlock
// 并将当前的currentBlock添加到blockStack栈中
// 跟openBlock对应的还有closeBlock
export function openBlock(disableTracking = false) {
  blockStack.push((currentBlock = disableTracking ? null : []))
}

export function closeBlock() {
  blockStack.pop()
  currentBlock = blockStack[blockStack.length - 1] || null
}
```

根据以上渲染函数，首先调用_openBlock打开根节点block1，然后先从子节点开始创建vnode，此时子节点恰好存在v-if指令，
所以会再调用一次_openBlock打开block2，此时blockStack = [[], []] currentBlock = []，currentBlock收集的
为block2的动态节点，然后开始创建block2的子节点：

```js

// 创建vnode
function _createVNode(
  type: VNodeTypes | ClassComponent | typeof NULL_DYNAMIC_COMPONENT,
  props: (Data & VNodeProps) | null = null,
  children: unknown = null,
  patchFlag: number = 0,
  dynamicProps: string[] | null = null,
  isBlockNode = false
): VNode {
  ...

  // 根据传入的type来确定shapeFlag值
  const shapeFlag = isString(type)
    ? ShapeFlags.ELEMENT
    : __FEATURE_SUSPENSE__ && isSuspense(type)
      ? ShapeFlags.SUSPENSE
      : isTeleport(type)
        ? ShapeFlags.TELEPORT
        : isObject(type)
          ? ShapeFlags.STATEFUL_COMPONENT
          : isFunction(type)
            ? ShapeFlags.FUNCTIONAL_COMPONENT
            : 0

  // 创建一个vnode对象，保存vnode相关的信息
  const vnode: VNode = {
    __v_isVNode: true,
    [ReactiveFlags.SKIP]: true,
    type,
    props,
    key: props && normalizeKey(props),
    ref: props && normalizeRef(props),
    scopeId: currentScopeId,
    children: null,
    component: null,
    suspense: null,
    dirs: null,
    transition: null,
    el: null,
    anchor: null,
    target: null,
    targetAnchor: null,
    staticCount: 0,
    shapeFlag,
    patchFlag,
    dynamicProps,
    dynamicChildren: null,
    appContext: null
  }

  // 标准化子节点
  // 根据子节点的类型添加shapeFlag
  normalizeChildren(vnode, children)

  // 判断当前节点是否应该添加到当前的block中
  // 1、如果shouldTrack > 0，在某些情况下不应该将vnode添加当前的blcok中，此时会将shouldTrack设置为-1
  // 例如存在v-noce指令的节点及其子节点
  // 2、当前节点不是block节点
  // 3、patchFlag > 0或者节点是一个组件节点，也就是存在动态信息的节点
  // 4、patchFlag不等于PatchFlags.HYDRATE_EVENTS，这个patchFlag属于ssr相关，这里暂时不分析
  if (
    shouldTrack > 0 &&
    // avoid a block node from tracking itself
    !isBlockNode &&
    // has current parent block
    currentBlock &&
    // presence of a patch flag indicates this node needs patching on updates.
    // component nodes also should always be patched, because even if the
    // component doesn't need to update, it needs to persist the instance on to
    // the next vnode so that it can be properly unmounted later.
    (patchFlag > 0 || shapeFlag & ShapeFlags.COMPONENT) &&
    // the EVENTS flag is only for hydration and if it is the only flag, the
    // vnode should not be considered dynamic due to handler caching.
    patchFlag !== PatchFlags.HYDRATE_EVENTS
  ) {
    currentBlock.push(vnode)
  }

  return vnode
}
```

当创建完block2的子节点后，会调用_createBlock方法创建block2节点。此时currentBlock添加了block2的动态节点<span>{{state}}</span>。

```js

export function createBlock(
  type: VNodeTypes | ClassComponent,
  props?: Record<string, any> | null,
  children?: any,
  patchFlag?: number,
  dynamicProps?: string[]
): VNode {
  // 调用createVNode创建block2节点的vnode
  // 注意这里传入的最后一个参数isBlockNode为true
  // 所以block节点不会添加到currentBlock中
  const vnode = createVNode(
    type,
    props,
    children,
    patchFlag,
    dynamicProps,
    true /* isBlock: prevent a block from tracking itself */
  )
  // 将block2下所有的动态节点也就是currentBlock保存到block2节点vnode的dynamicChildren属性上
  vnode.dynamicChildren = currentBlock || EMPTY_ARR
  // 调用closeBlock，关闭当前blcok，并且将保存当前block2动态节点的currentBlock出栈
  // 将parent block，也就是block1的动态节点重新赋值给currentBlock
  closeBlock()

  // 当前block2节点的vnode也是它的父block节点的动态节点
  // 所以将当前节点添加到父block的动态节点中
  if (currentBlock) {
    currentBlock.push(vnode)
  }
  return vnode
}
```

其他block的创建都是相同的过程，当执行完整个渲染函数之后，当前的block tree为：

```js
{
  name: '根vnode(block1)'
  dynamicChildren: [
    {
      name: 'v-if vnode(block2)',
      dynamicChildren: [
        {
          name: '动态节点1',
          dynamicChildren: null
        }
      ]
    },
    {
      name: 'v-for vnode(block3),
      dynamicChildren: null
    },
    {
      name: '动态节点2',
      dynamicChildren: null
    }
  ]
}
```

这里要注意的是，v-for节点生成的block3的dynamicChildren为null，因为v-for创建的block

通过分析vnode的创建过程，我们了解了Vue3.x中对于vnode的优化以及block tree的创建过程，