// 路由：#/render 导出用离屏渲染；#/probe 检查代码场景；其他是主界面
const route = location.hash.replace(/^#\/?/, '');
if (route === 'render') import('./render-entry.js');
else if (route === 'probe') import('./probe-entry.js');
else import('./app-entry.jsx');
