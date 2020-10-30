## 模板编译过程

当组件对象上不存在render函数时，Vue根据组件上的template，调用compile方法来编译模板，
并生成渲染函数

```js
Component.render = compile(Component.template, {
  isCustomElement: instance.appContext.config.isCustomElement,
  delimiters: Component.delimiters
})
```

模板的编译过程主要分为三步：

+ 1、ast parse: 根据传入的template生成ast树
+ 2、ast transform: 优化ast节点，生成codegenNode
+ 3、codegen: 根据codegenNode拼接渲染函数

### 生成ast

```js
export function baseParse(
  content: string,
  options: ParserOptions = {}
): RootNode {
  // 传入编译配置，生成一个保存编译配置的上下文
  const context = createParserContext(content, options)
  // 获得模板初始的行、列、偏移等信息
  const start = getCursor(context)
  // 先创建子节点，再创建根节点
  return createRoot(
    parseChildren(context, TextModes.DATA, []),
    getSelection(context, start)
  )
}
```

```js
function parseChildren(
  context: ParserContext,
  mode: TextModes,
  ancestors: ElementNode[]
): TemplateChildNode[] {
  const parent = last(ancestors)
  const ns = parent ? parent.ns : Namespaces.HTML
  const nodes: TemplateChildNode[] = []
  // 遍历模板字符串
  // 调用isEnd判断是否已经遍历结束
  // 如果模板为空，或者匹配到结束标签”</“开头并且结束标签的tag和ancestors中的相同
  // 则跳出循环处理结束标签
  while (!isEnd(context, mode, ancestors)) {
    __TEST__ && assert(context.source.length > 0)
    // 获得当前剩余的模板
    const s = context.source
    let node: TemplateChildNode | TemplateChildNode[] | undefined = undefined

    if (mode === TextModes.DATA || mode === TextModes.RCDATA) {
      if (!context.inVPre && startsWith(s, context.options.delimiters[0])) {
        node = parseInterpolation(context, mode)
      } else if (mode === TextModes.DATA && s[0] === '<') {
        // 当模板以”<“开头，
        if (s.length === 1) {
          // 模板长度只有1时，报错
          emitError(context, ErrorCodes.EOF_BEFORE_TAG_NAME, 1)
        } else if (s[1] === '!') {
          // 当模板以"<!"开头，分为以下几种
          if (startsWith(s, '<!--')) {
            // 匹配到"<!--" 调用parseComment生成注释节点
            node = parseComment(context)
          } else if (startsWith(s, '<!DOCTYPE')) {
            // 匹配到"<!--DOCTYPE" 调用parseBogusComment生成注释节点
            node = parseBogusComment(context)
          } else if (startsWith(s, '<![CDATA[')) {
            // 匹配到 "<!--CDATA"开头
            if (ns !== Namespaces.HTML) {
              node = parseCDATA(context, ancestors)
            } else {
              emitError(context, ErrorCodes.CDATA_IN_HTML_CONTENT)
              node = parseBogusComment(context)
            }
          } else {
            // 不符合以上情况，报错并将内容生成注释节点
            emitError(context, ErrorCodes.INCORRECTLY_OPENED_COMMENT)
            node = parseBogusComment(context)
          }
        } else if (s[1] === '/') {
          // 以“</”开头
          if (s.length === 2) {
            // 如果模板只剩“</"2个字符，报错
            emitError(context, ErrorCodes.EOF_BEFORE_TAG_NAME, 2)
          } else if (s[2] === '>') {
            // 如果匹配到”</>“，报错并调用advanceBy跳过这3个字符
            emitError(context, ErrorCodes.MISSING_END_TAG_NAME, 2)
            advanceBy(context, 3)
            continue
          } else if (/[a-z]/i.test(s[2])) {
            // 如果匹配到"</ + 字母"
            emitError(context, ErrorCodes.X_INVALID_END_TAG)
            parseTag(context, TagType.End, parent)
            continue
          } else {
            // 不符合以上情况，报错并将内容生成注释节点
            emitError(
              context,
              ErrorCodes.INVALID_FIRST_CHARACTER_OF_TAG_NAME,
              2
            )
            node = parseBogusComment(context)
          }
        } else if (/[a-z]/i.test(s[1])) {
          // 以”< + 字母开头“则调用parseElement生成element节点
          node = parseElement(context, ancestors)
        } else if (s[1] === '?') {
          // 以“<?”开头，报错并生成注释节点
          emitError(
            context,
            ErrorCodes.UNEXPECTED_QUESTION_MARK_INSTEAD_OF_TAG_NAME,
            1
          )
          node = parseBogusComment(context)
        } else {
          // 不符合以上任意一种，报错
          emitError(context, ErrorCodes.INVALID_FIRST_CHARACTER_OF_TAG_NAME, 1)
        }
      }
    }
    // 如果node不存在，即不符合上面任何一种，则调用parseText找到文本第一个中"<"或者"{{"
    // 将之前的文本生成一个文本节点
    if (!node) {
      node = parseText(context, mode)
    }
    // 将生成的节点保存到nodes中
    // 如果当前生成的节点是文本节点，并且前一个节点也是文本节点
    // 则合并两个文本节点
    if (isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        pushNode(nodes, node[i])
      }
    } else {
      pushNode(nodes, node)
    }
  }

  // 处理节点间的空格
  let removedWhitespace = false
  if (mode !== TextModes.RAWTEXT) {
    // 如果不在pre节点中
    if (!context.inPre) {
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i]
        // 遍历所有节点，如果是文本节点
        if (node.type === NodeTypes.TEXT) {
          // 如果文本开头不存在换行
          // 则以下情况需要过滤空白节点
          if (!/[^\t\r\n\f ]/.test(node.content)) {
            const prev = nodes[i - 1]
            const next = nodes[i + 1]
            // 1、空白节点是第一或者最后一个节点
            // 2、空白节点在注释节点的前或者后
            // 3、空白节点在2个element节点中间，并且存在换行
            if (
              !prev ||
              !next ||
              prev.type === NodeTypes.COMMENT ||
              next.type === NodeTypes.COMMENT ||
              (prev.type === NodeTypes.ELEMENT &&
                next.type === NodeTypes.ELEMENT &&
                /[\r\n]/.test(node.content))
            ) {
              removedWhitespace = true
              nodes[i] = null as any
            } else {
              // 否则，将文本内的连续空格压缩为单个空格
              node.content = ' '
            }
          } else {
            // 否则将换行替换为空格
            node.content = node.content.replace(/[\t\r\n\f ]+/g, ' ')
          }
        } else if (
          !__DEV__ &&
          node.type === NodeTypes.COMMENT &&
          !context.options.comments
        ) {
          // 生产环境中过滤所有注释节点
          removedWhitespace = true
          nodes[i] = null as any
        }
      }
    } else if (parent && context.options.isPreTag(parent.tag)) {
      // 如果当前节点的父节点是pre，则去掉当前文本开头的换行
      const first = nodes[0]
      if (first && first.type === NodeTypes.TEXT) {
        first.content = first.content.replace(/^\r?\n/, '')
      }
    }
  }
  // 如果需要过滤空白节点则调用filter过滤
  return removedWhitespace ? nodes.filter(Boolean) : nodes
}
```

可以看到parseChildren方法大部分判断都是处理一些特殊的节点，只有符合”< + 字母的情况“才调用parseElement
去创建一个ast节点

```js
function parseElement(
  context: ParserContext,
  ancestors: ElementNode[]
): ElementNode | undefined {
  __TEST__ && assert(/^<[a-z]/i.test(context.source))

  // 节点是否在pre标签或者v-pre指令中
  const wasInPre = context.inPre
  const wasInVPre = context.inVPre
  // 获取父节点
  const parent = last(ancestors)
  // 调用parseTag创建ast节点
  const element = parseTag(context, TagType.Start, parent)
  // 如果解析后节点是pre或者有v-pre指令，则说明该节点是pre或者存在v-pre指令
  const isPreBoundary = context.inPre && !wasInPre
  const isVPreBoundary = context.inVPre && !wasInVPre
  // 如果是自闭合的标签，则直接返回
  if (element.isSelfClosing || context.options.isVoidTag(element.tag)) {
    return element
  }

  // 处理子节点
  // 将当前节点添加到ancestors中
  ancestors.push(element)
  const mode = context.options.getTextMode(element, parent)
  // 递归调用parseChildren处理子节点
  const children = parseChildren(context, mode, ancestors)
  ancestors.pop()
  // 将子节点添加到children属性上
  element.children = children

  // 处理闭合标签
  // 当匹配到”</"，并且闭合标签内的tag和起始标签的tag相同
  // 则调用parseTag闭合节点
  if (startsWithEndTagOpen(context.source, element.tag)) {
    parseTag(context, TagType.End, parent)
  } else {
    // 否则提示找不到闭合标签
    emitError(context, ErrorCodes.X_MISSING_END_TAG, 0, element.loc.start)
    if (context.source.length === 0 && element.tag.toLowerCase() === 'script') {
      const first = children[0]
      if (first && startsWith(first.loc.source, '<!--')) {
        emitError(context, ErrorCodes.EOF_IN_SCRIPT_HTML_COMMENT_LIKE_TEXT)
      }
    }
  }
  // 调用getSelection获得节点在模板中的起始、结束位置以及节点的原字符串
  element.loc = getSelection(context, element.loc.start)
  // 如果当前节点是pre或者存在v-pre指令，则解析完当前节点后需要将inPre、inVPre重新设置为false
  if (isPreBoundary) {
    context.inPre = false
  }
  if (isVPreBoundary) {
    context.inVPre = false
  }
  return element
}
```

从parseElement中可以看到不管是开始还是结束标签，都需要调用parseTag来处理，根据传入的type来判断是处理开始还是结束标签

```js
function parseTag(
  context: ParserContext,
  type: TagType,
  parent: ElementNode | undefined
): ElementNode {
  __TEST__ && assert(/^<\/?[a-z]/i.test(context.source))
  __TEST__ &&
    assert(
      type === (startsWith(context.source, '</') ? TagType.End : TagType.Start)
    )

  // 获得标签内的tag
  const start = getCursor(context)
  const match = /^<\/?([a-z][^\t\r\n\f />]*)/i.exec(context.source)!
  const tag = match[1]
  const ns = context.options.getNamespace(tag, parent)
  // 将模板前进到第一个props之前
  advanceBy(context, match[0].length)
  advanceSpaces(context)

  // save current state in case we need to re-parse attributes with v-pre
  // 保存解析props之前的模板，如果解析props后存在v-pre指令，需要重新解析props
  const cursor = getCursor(context)
  const currentSource = context.source

  // 解析props
  let props = parseAttributes(context, type)

  // 如果是pre标签 将上下文的inPre设置为true
  if (context.options.isPreTag(tag)) {
    context.inPre = true
  }

  // 如果存在v-pre指令
  if (
    !context.inVPre &&
    props.some(p => p.type === NodeTypes.DIRECTIVE && p.name === 'pre')
  ) {
    // 则将inVPre设置为true,并将解析props之前的模板赋值，并重新解析
    context.inVPre = true
    // reset context
    extend(context, cursor)
    context.source = currentSource
    // 解析后过滤v-pre指令
    props = parseAttributes(context, type).filter(p => p.name !== 'v-pre')
  }

  // Tag close.
  // 闭合开始或者结束标签
  let isSelfClosing = false
  if (context.source.length === 0) {
    emitError(context, ErrorCodes.EOF_IN_TAG)
  } else {
    // 如果匹配到"/>"，说明标签是自闭合标签
    isSelfClosing = startsWith(context.source, '/>')
    // 如果是在处理结束标签时，说明匹配到”</tag/>“，则直接报错
    if (type === TagType.End && isSelfClosing) {
      emitError(context, ErrorCodes.END_TAG_WITH_TRAILING_SOLIDUS)
    }
    // 根据是否是自闭合标签前进">"或者"/>"
    advanceBy(context, isSelfClosing ? 2 : 1)
  }
  // 使用tagType细分标签的类型
  let tagType = ElementTypes.ELEMENT
  const options = context.options
  // 如果当前标签不是在v-pre中，也不是自定义标签
  if (!context.inVPre && !options.isCustomElement(tag)) {
    // 那么先判断有没有is指令
    const hasVIs = props.some(
      p => p.type === NodeTypes.DIRECTIVE && p.name === 'is'
    )
    if (options.isNativeTag && !hasVIs) {
      // 如果不存在is指令，并且不是原生标签，则tagType设置为COMPONENT
      if (!options.isNativeTag(tag)) tagType = ElementTypes.COMPONENT
    } else if (
      // 如果is存在或者标签是Teleport、Suspense、KeepAlive、BaseTransition
      // 中的一个、或者标签是内建的Transition、TransitionGroup、或者标签以大写开头、
      // 或者标签等于'component'，都将tagType设置为COMPONENT
      hasVIs ||
      isCoreComponent(tag) ||
      (options.isBuiltInComponent && options.isBuiltInComponent(tag)) ||
      /^[A-Z]/.test(tag) ||
      tag === 'component'
    ) {
      tagType = ElementTypes.COMPONENT
    }
    // 如果tag为slot、则tagType = ElementTypes.SLOT
    if (tag === 'slot') {
      tagType = ElementTypes.SLOT
    } else if (
      // 如果tag为template、并且存在`if,else,else-if,for,slot`等指令，则tagType = ElementTypes.TEMPLATE
      tag === 'template' &&
      props.some(p => {
        return (
          p.type === NodeTypes.DIRECTIVE && isSpecialTemplateDirective(p.name)
        )
      })
    ) {
      tagType = ElementTypes.TEMPLATE
    }
  }
  // 返回ast对象
  return {
    type: NodeTypes.ELEMENT,
    ns,
    tag,
    tagType,
    props,
    isSelfClosing,
    children: [],
    loc: getSelection(context, start),
    codegenNode: undefined // to be created during transform phase
  }
}
```

通过模板编译生成ast节点的过程其实就是不断遍历模板去匹配标签，并且通过递归编译子节点的过程建立节点的父子关系。

## transform

解析模板生成的ast树并不能直接用于生成渲染函数，而是要经过transform方法遍历所有ast节点，根据
ast节点的类型来调用不同helper函数，这些helper函数将会对针对特定的ast节点进一步优化，生成可供codegen函数使用的codegenNode，这里就不具体对每一个helper函数展开分析，作为一个例子我们仅分析一下根ast节点的transform过程：

之前在分析patch过程的时候我们说到，Vue3.0现在已经支持在模板写多个根节点了，但是一棵树总是需要一个根节点的，所以Vue会帮你生成一个FRAGMENT节点作为根节点，这个节点不会在真实的DOM中显示出来，这个过程就是在ast树的根节点的transform过程中实现的。

```js

function createRootCodegen(root: RootNode, context: TransformContext) {
  const { helper } = context
  const { children } = root
  const child = children[0]
  // 当ast树的根节点的子节点只有一个节点
  if (children.length === 1) {
    // 并且它是一个element节点
    if (isSingleElementRoot(root, child) && child.codegenNode) {
      // 则将该节点标记为block节点
      const codegenNode = child.codegenNode
      if (codegenNode.type === NodeTypes.VNODE_CALL) {
        codegenNode.isBlock = true
        helper(OPEN_BLOCK)
        helper(CREATE_BLOCK)
      }
      root.codegenNode = codegenNode
    } else {
      // - single <slot/>, IfNode, ForNode: already blocks.
      // - single text node: always patched.
      // root codegen falls through via genNode()
      root.codegenNode = child
    }
  } else if (children.length > 1) {
    // 如果子节点存在多个，则生成一个FRAGMENT节点保存在codegenNode属性上
    root.codegenNode = createVNodeCall(
      context,
      helper(FRAGMENT),
      undefined,
      root.children,
      `${PatchFlags.STABLE_FRAGMENT} /* ${
        PatchFlagNames[PatchFlags.STABLE_FRAGMENT]
      } */`,
      undefined,
      undefined,
      true
    )
  } else {
    // no children = noop. codegen will return null.
  }
}

```

可以看到transform的过程就是在ast节点的基础上通过特定的helper函数，这些函数会修改原本ast节点上的属性，并将修改后的节点保存在codegenNode属性上，用于生成渲染函数

## codegen

codegen的过程其实就是拼接字符串，这里截取了genNode函数的部分代码，可以看到通过判断codegenNode上的类型调用不同的函数，这些函数的实现基本上就是根据codegenNode上的内容输出相应的字符串然后拼接到最终的代码字符串上，而整个codegen的过程就是递归的调用genNode函数遍历所有codegenNode，最后再通过new Function来创建渲染函数。

```js
function genNode(node: CodegenNode | symbol | string, context: CodegenContext) {
  ...
  switch (node.type) {
    case NodeTypes.ELEMENT:
    case NodeTypes.IF:
    case NodeTypes.FOR:
      __DEV__ &&
        assert(
          node.codegenNode != null,
          `Codegen node is missing for element/if/for node. ` +
            `Apply appropriate transforms first.`
        )
      genNode(node.codegenNode!, context)
      break
    case NodeTypes.TEXT:
      genText(node, context)
      break
    case NodeTypes.COMMENT:
      genComment(node, context)
      break
    case NodeTypes.VNODE_CALL:
      genVNodeCall(node, context)
      break
    ...
  }
}
```



