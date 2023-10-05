module.exports = {
  title: 'Vue3 迁移',
  description: 'vue3.x源码分析',
  base: '/vue-next-analysis/',
  themeConfig: {
    nav: [
      { text: 'Github', link: 'https://github.com/wuchwuw/vue-next-analysis' }
    ],
    sidebar: [
      {
        title: '概览',
        sidebarDepth: 1,
        children: [
          ['/qianyi/one', '迁移流程'],
          ['/qianyi/tow', '非兼容性变更'],
          ['/qianyi/three', '转换工具']
        ]
      }
    ]
  }
}