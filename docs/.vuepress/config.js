module.exports = {
  title: 'VueNextAnalysis',
  description: 'vue3.x源码分析',
  base: '/vue-next-analysis/',
  themeConfig: {
    sidebar: [
      ['/', '写在前面'],
      {
        title: '响应式原理',
        collapsable: false,
        sidebarDepth: 1,
        children: [
          ['/reactivity/reactivity', 'reactive'],
          ['/reactivity/ref', 'ref'],
          ['/reactivity/effect', 'effect'],
          ['/reactivity/computed', 'computed']
        ]
      },
      {
        title: '运行时',
        collapsable: false,
        sidebarDepth: 1,
        children: [
          ['/runtime-core/createApp', '创建一个Vue3.x应用'],
          ['/runtime-core/vnode', 'vnode详解'],
          ['/runtime-core/patch', 'vnode的patch过程(节点的创建及更新)'],
          ['/runtime-code/scheduler', '组件、节点的生命周期(scheduler)']
        ]
      },
      {
        title: '编译',
        collapsable: false,
        sidebarDepth: 1,
        children: []
      }
    ]
  }
}