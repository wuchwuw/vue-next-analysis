module.exports = {
  title: 'VueNextAnalysis',
  description: 'vue3.x源码分析',
  base: '/vue-next-analysis/',
  themeConfig: {
    sidebar: [
      ['/', '写在前面'],
      {
        title: 'Reactivity',
        collapsable: false,
        sidebarDepth: 1,
        children: [
          ['/reactivity/reactivity', 'reactive'],
          ['/reactivity/ref', 'ref'],
          ['/reactivity/effect', 'effect'],
          ['/reactivity/computed', 'computed']
        ]
      }
    ]
  }
}