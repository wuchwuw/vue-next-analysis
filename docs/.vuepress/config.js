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
          ['/runtime-core/updateComponent', '组件更新及diff过程']
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