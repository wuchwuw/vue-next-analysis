(window.webpackJsonp=window.webpackJsonp||[]).push([[12],{358:function(e,t,a){"use strict";a.r(t);var n=a(42),r=Object(n.a)({},(function(){var e=this,t=e.$createElement,a=e._self._c||t;return a("ContentSlotsDistributor",{attrs:{"slot-key":e.$parent.slotKey}},[a("h2",{attrs:{id:"vnode"}},[a("a",{staticClass:"header-anchor",attrs:{href:"#vnode"}},[e._v("#")]),e._v(" vnode")]),e._v(" "),a("p",[e._v("Vue在2.x中引入了vnode,它是用来描述节点信息的javascript对象。在以往的版本中关于vnode并没有什么特别要分析地方，\n但是在3.x版本中为了优化patch的过程，Vue在编译和创建vnode的过程中新增了很多逻辑，不仅新增了一些vnode的类型，例如\nSuspense、Teleport、Frag等等，还通过PatchFlag对vnode上的动态信息进行标记，有了PatchFlag在组件的更新阶段只\n需要对比新旧vnode上动态的地方即可，大大提高了更新效率。")]),e._v(" "),a("p",[e._v("Vue3.x对vnode的另一个优化就是引入了brock tree。以往在更新组件的过程中，都要遍历整个组件的vnode tree，这就使得\n组件的更新速度是和模板的大小正相关的，这对于某些存在大量静态节点的组件很不友好。而在3.x版本中，通过brock tree在创建\nvnode的过程中收集模板的动态节点，在大部分情况下只需要更新组件的动态节点即可，这使得组件的更新速度变成了和模板的动态节点\n正相关，从而大大提高了patch速度。")]),e._v(" "),a("h3",{attrs:{id:"patchflag"}},[a("a",{staticClass:"header-anchor",attrs:{href:"#patchflag"}},[e._v("#")]),e._v(" PatchFlag")])])}),[],!1,null,null,null);t.default=r.exports}}]);