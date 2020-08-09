## Vue/Reactivity

reactive api是Vue3.x中创建响应式对象的核心api，它的基本实现原理是通过Proxy来拦截普通的对象的操作，并由此收集依赖或派发更新。
响应式对象的实现并没有那么复杂，只需记住响应式对象就是Proxy对象，它的核心就是Proxy，在Vue3.x中，响应式对象也分为了以下几种:

1、mutable reactive: 普通的响应式对象
2、readonly reactive: 只读的响应式对象，不能进行赋值操作。
3、shallow reactive: 只拦截对象根层级的属性的操作，如果属性的值也是对象，不会对它进行递归响应式化。
4、shallow readonly reactive: 只读的shallow reactive对象

reactive api除了支持基本的plain object和array外，还支持map、weakmap、set、weakset等collection的响应式化。我们可以通过它的测试用例
来了解reactive以及它相关api的用法，这对我们学习源码很有帮助，毕竟学习原理之前也要先会用才行。

#### 测试用例

1、reactive的参数必须是一个对象，我们可以像操作一个普通对象一样来操作响应式对象，并且响应式对象不等于原始的对象。

    test('Object', () => {
      const original = { foo: 1 }
      const observed = reactive(original)
      expect(observed).not.toBe(original)
      expect(isReactive(observed)).toBe(true)
      expect(isReactive(original)).toBe(false)
      // get
      expect(observed.foo).toBe(1)
      // has
      expect('foo' in observed).toBe(true)
      // ownKeys
      expect(Object.keys(observed)).toEqual(['foo'])
    })

2、一个响应式对象的属性的值如果也是对象的话，那么它也会被响应式化。

    test('nested reactives', () => {
      const original = {
        nested: {
          foo: 1
        },
        array: [{ bar: 2 }]
      }
      const observed = reactive(original)
      expect(isReactive(observed.nested)).toBe(true)
      expect(isReactive(observed.array)).toBe(true)
      expect(isReactive(observed.array[0])).toBe(true)
    })

3、对一个响应式对象进行操作时，操作同时也会影响到原始的对象。

    test('observed value should proxy mutations to original (Object)', () => {
      const original: any = { foo: 1 }
      const observed = reactive(original)
      // set
      observed.bar = 1
      expect(observed.bar).toBe(1)
      expect(original.bar).toBe(1)
      // delete
      delete observed.foo
      expect('foo' in observed).toBe(false)
      expect('foo' in original).toBe(false)
    })

4、为一个响应式对象的属性赋值一个对象时，该对象也会变成响应式对象。

    test('setting a property with an unobserved value should wrap with reactive', () => {
      const observed = reactive<{ foo?: object }>({})
      const raw = {}
      observed.foo = raw
      expect(observed.foo).not.toBe(raw)
      expect(isReactive(observed.foo)).toBe(true)
    })

5、当传入的参数已经是一个响应式对象时，直接返回该响应式对象。

    test('observing already observed value should return same Proxy', () => {
      const original = { foo: 1 }
      const observed = reactive(original)
      const observed2 = reactive(observed)
      expect(observed2).toBe(observed)
    })
