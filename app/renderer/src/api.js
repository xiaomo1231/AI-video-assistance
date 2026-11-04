// 和主进程通信
const M = window.mojian;
export const api = (ch, ...args) => M.invoke(ch, ...args);
export const on = (ch, fn) => M.on(ch, fn);
export const pathOf = (f) => M.pathOf(f);
export const hasBridge = !!M;

/** 主进程（工作流）调用界面：读当前工程、应用操作、跳页面 */
export function serveRpc(handlers) {
  return on('rpc', async ({ id, method, args }) => {
    try { const result = await handlers[method](args); M.reply({ id, result }); }
    catch (e) { M.reply({ id, error: e.message }); }
  });
}
