(window.webpackJsonp=window.webpackJsonp||[]).push([[8],{354:function(e,a,t){"use strict";t.r(a);var n=t(42),r=Object(n.a)({},(function(){var e=this,a=e.$createElement,t=e._self._c||a;return t("ContentSlotsDistributor",{attrs:{"slot-key":e.$parent.slotKey}},[t("h2",{attrs:{id:"vue-reactivity"}},[t("a",{staticClass:"header-anchor",attrs:{href:"#vue-reactivity"}},[e._v("#")]),e._v(" Vue/Reactivity")]),e._v(" "),t("p",[e._v("reactive api是Vue3.x中创建响应式对象的核心api，它的基本实现原理是通过Proxy来拦截普通的对象的操作，并由此收集依赖或派发更新。\n响应式对象的实现并没有那么复杂，只需记住响应式对象就是Proxy对象，它的核心就是Proxy，在Vue3.x中，响应式对象也分为了以下几种:")]),e._v(" "),t("p",[e._v("1、mutable reactive: 普通的响应式对象\n2、readonly reactive: 只读的响应式对象，不能进行赋值操作。\n3、shallow reactive: 只拦截对象根层级的属性的操作，如果属性的值也是对象，不会对它进行递归响应式化。\n4、shallow readonly reactive: 只读的shallow reactive对象")]),e._v(" "),t("p",[e._v("reactive api除了支持基本的plain object和array外，还支持map、weakmap、set、weakset等collection的响应式化。我们可以通过它的测试用例来了解reactive以及它相关api的用法，这对我们学习源码很有帮助。")]),e._v(" "),t("h4",{attrs:{id:"测试用例"}},[t("a",{staticClass:"header-anchor",attrs:{href:"#测试用例"}},[e._v("#")]),e._v(" 测试用例")]),e._v(" "),t("p",[e._v("1、reactive的参数必须是一个对象，我们可以像操作一个普通对象一样来操作响应式对象，并且响应式对象不等于原始的对象。")]),e._v(" "),t("div",{staticClass:"language- extra-class"},[t("pre",[t("code",[e._v("test('Object', () => {\n  const original = { foo: 1 }\n  const observed = reactive(original)\n  expect(observed).not.toBe(original)\n  expect(isReactive(observed)).toBe(true)\n  expect(isReactive(original)).toBe(false)\n  // get\n  expect(observed.foo).toBe(1)\n  // has\n  expect('foo' in observed).toBe(true)\n  // ownKeys\n  expect(Object.keys(observed)).toEqual(['foo'])\n})\n")])])]),t("p",[e._v("2、一个响应式对象的属性的值如果也是对象的话，那么它也会被响应式化。")]),e._v(" "),t("div",{staticClass:"language- extra-class"},[t("pre",[t("code",[e._v("test('nested reactives', () => {\n  const original = {\n    nested: {\n      foo: 1\n    },\n    array: [{ bar: 2 }]\n  }\n  const observed = reactive(original)\n  expect(isReactive(observed.nested)).toBe(true)\n  expect(isReactive(observed.array)).toBe(true)\n  expect(isReactive(observed.array[0])).toBe(true)\n})\n")])])]),t("p",[e._v("3、对一个响应式对象进行操作时，操作同时也会影响到原始的对象。")]),e._v(" "),t("div",{staticClass:"language- extra-class"},[t("pre",[t("code",[e._v("test('observed value should proxy mutations to original (Object)', () => {\n  const original: any = { foo: 1 }\n  const observed = reactive(original)\n  // set\n  observed.bar = 1\n  expect(observed.bar).toBe(1)\n  expect(original.bar).toBe(1)\n  // delete\n  delete observed.foo\n  expect('foo' in observed).toBe(false)\n  expect('foo' in original).toBe(false)\n})\n")])])]),t("p",[e._v("4、为一个响应式对象的属性赋值一个对象时，该对象也会变成响应式对象。")]),e._v(" "),t("div",{staticClass:"language- extra-class"},[t("pre",[t("code",[e._v("test('setting a property with an unobserved value should wrap with reactive', () => {\n  const observed = reactive<{ foo?: object }>({})\n  const raw = {}\n  observed.foo = raw\n  expect(observed.foo).not.toBe(raw)\n  expect(isReactive(observed.foo)).toBe(true)\n})\n")])])]),t("p",[e._v("5、当传入的参数已经是一个响应式对象时，直接返回该响应式对象。")]),e._v(" "),t("div",{staticClass:"language- extra-class"},[t("pre",[t("code",[e._v("test('observing already observed value should return same Proxy', () => {\n  const original = { foo: 1 }\n  const observed = reactive(original)\n  const observed2 = reactive(observed)\n  expect(observed2).toBe(observed)\n})\n")])])]),t("h2",{attrs:{id:"相关源码"}},[t("a",{staticClass:"header-anchor",attrs:{href:"#相关源码"}},[e._v("#")]),e._v(" 相关源码")]),e._v(" "),t("div",{staticClass:"language- extra-class"},[t("pre",[t("code",[e._v("// 定义了传入Proxy的原始对象target的类型，在原始对象响应式化的过程中会往原始对象上添加某些标记属性\n// 通过ReactiveFlags枚举了这些属性的名字，它们的功能如下:\n// SKIP: 存在此属性则跳过响应式化\n// IS_REACTIVE: 是否是一个响应式对象\n// IS_READONLY: 是否是一个只读的响应式对象\n// RAW: 当target是一个响应式对象时，通过此属性获得响应式对象的原始对象\n// REACTIVE: 如果是一个响应式对象则将响应式后的Proxy对象存放在这个属性上\n// READONLY: 如果是一个只读的响应式对象则将响应式后的Proxy对象存放在这个属性上\n\nexport const enum ReactiveFlags {\n  SKIP = '__v_skip',\n  IS_REACTIVE = '__v_isReactive',\n  IS_READONLY = '__v_isReadonly',\n  RAW = '__v_raw',\n  REACTIVE = '__v_reactive',\n  READONLY = '__v_readonly'\n}\n\ninterface Target {\n  [ReactiveFlags.SKIP]?: boolean\n  [ReactiveFlags.IS_REACTIVE]?: boolean\n  [ReactiveFlags.IS_READONLY]?: boolean\n  [ReactiveFlags.RAW]?: any\n  [ReactiveFlags.REACTIVE]?: any\n  [ReactiveFlags.READONLY]?: any\n}\n\n// isObservableType存放了可以响应式化的对象的类型\n// 其中又区分了collectionTypes，它们的实现与普通的Object和Array不同，后面我们会细说\n\nconst collectionTypes = new Set<Function>([Set, Map, WeakMap, WeakSet])\nconst isObservableType = /*#__PURE__*/ makeMap(\n  'Object,Array,Map,Set,WeakMap,WeakSet'\n)\n\n// 通过canObserve来判断一个对象是否能被响应式化，成为响应式对象必须满足以下条件:\n// 1、对象上不存在ReactiveFlags.SKIP属性\n// 2、它的类型必须是Object,Array,Map,Set,WeakMap,WeakSet中的一种\n// 3、对象不应该被冻结\nconst canObserve = (value: Target): boolean => {\n  return (\n    !value[ReactiveFlags.SKIP] &&\n    isObservableType(toRawType(value)) &&\n    !Object.isFrozen(value)\n  )\n}\n")])])]),t("p",[e._v("接下来是几个创建响应式对象的api,这里重点注意创建不同类型的响应式对象的api返回的类型不同，关于类型的详细解析我们放到后面细讲。")]),e._v(" "),t("div",{staticClass:"language- extra-class"},[t("pre",[t("code",[e._v("// 通过reactive方法创建普通mutable reactive，如果传入的对象上存在ReactiveFlags.IS_READONLY属性\n// 也就是说它已经是一个只读的响应式对象，则直接返回，否则\n// 通过调用createReactiveObject方法来创建响应式对象\n// 这里要注意的是reactive方法返回的类型是UnwrapNestedRefs<T>，\n\nexport function reactive<T extends object>(target: T): UnwrapNestedRefs<T>\nexport function reactive(target: object) {\n  // if trying to observe a readonly proxy, return the readonly version.\n  if (target && (target as Target)[ReactiveFlags.IS_READONLY]) {\n    return target\n  }\n  return createReactiveObject(\n    target,\n    false,\n    mutableHandlers,\n    mutableCollectionHandlers\n  )\n}\n\n// 通过shallowReactive方法创建一个shallow reactive，我们已经在前面介绍过它\n// 可以看到shallowReactive方法返回的类型和传入的类型T是一致的\nexport function shallowReactive<T extends object>(target: T): T {\n  return createReactiveObject(\n    target,\n    false,\n    shallowReactiveHandlers,\n    shallowCollectionHandlers\n  )\n}\n\n// 通过readonly方法创建一个readonly reactive，我们已经在前面介绍过它\n// 可以看到readonly方法返回的类型是DeepReadonly<UnwrapNestedRefs<T>>\nexport function readonly<T extends object>(\n  target: T\n): DeepReadonly<UnwrapNestedRefs<T>> {\n  return createReactiveObject(\n    target,\n    true,\n    readonlyHandlers,\n    readonlyCollectionHandlers\n  )\n}\n\n// 通过shallowReadonly方法创建一个readonly shallow reactive，我们已经在前面介绍过它\n// 可以看到shallowReadonly方法返回的类型是Readonly<{ [K in keyof T]: UnwrapNestedRefs<T[K]> }>\nexport function shallowReadonly<T extends object>(\n  target: T\n): Readonly<{ [K in keyof T]: UnwrapNestedRefs<T[K]> }> {\n  return createReactiveObject(\n    target,\n    true,\n    shallowReadonlyHandlers,\n    readonlyCollectionHandlers\n  )\n}\n")])])]),t("p",[e._v("不难看出以上的几个主要创建响应式对象的api都是内部调用了createReactiveObject方法，根据传入的参数不同来创建不同类型的响应式对象。")]),e._v(" "),t("div",{staticClass:"language- extra-class"},[t("pre",[t("code",[e._v("// 可以看到createReactiveObject方法传入了4个参数\n// target: 传入的将要响应式化的对象\n// isReadonly: 是否创建只读的响应式对象\n// baseHandlers: 普通的Object和Array的proxy handles对象\n// collectionHandlers: Map、Weakmap、Set、Weakset类型的proxy handles对象\nfunction createReactiveObject(\n  target: Target,\n  isReadonly: boolean,\n  baseHandlers: ProxyHandler<any>,\n  collectionHandlers: ProxyHandler<any>\n) {\n  // 在开发环境中，如果传入的target不是对象，则发出警告并直接返回传入的target\n  if (!isObject(target)) {\n    if (__DEV__) {\n      console.warn(`value cannot be made reactive: ${String(target)}`)\n    }\n    return target\n  }\n  // target is already a Proxy, return it.\n  // exception: calling readonly() on a reactive object\n  // 当可以获取target上的ReactiveFlags.RAW属性的值，则证明target已经是一个响应式对象\n  \n  if (\n    target[ReactiveFlags.RAW] &&\n    !(isReadonly && target[ReactiveFlags.IS_REACTIVE])\n  ) {\n    return target\n  }\n  // target already has corresponding Proxy\n  const reactiveFlag = isReadonly\n    ? ReactiveFlags.READONLY\n    : ReactiveFlags.REACTIVE\n  if (hasOwn(target, reactiveFlag)) {\n    return target[reactiveFlag]\n  }\n  // only a whitelist of value types can be observed.\n  if (!canObserve(target)) {\n    return target\n  }\n  const observed = new Proxy(\n    target,\n    collectionTypes.has(target.constructor) ? collectionHandlers : baseHandlers\n  )\n  def(target, reactiveFlag, observed)\n  return observed\n}")])])])])}),[],!1,null,null,null);a.default=r.exports}}]);