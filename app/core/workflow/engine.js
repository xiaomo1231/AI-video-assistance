// 工作流引擎：按步骤执行；人工节点暂停等待；审片不通过带着意见回到指定步骤（最多 N 轮）。
// 步骤的具体实现由宿主注册（electron/steps.js），引擎本身不依赖 Electron。

export const KINDS = { ai: 'AI 步骤', tool: '工具', human: '人工确认', review: '审片' };

export class Run {
  /**
   * @param {object} wf 工作流 {id,name,inputs,steps,loop}
   * @param {Record<string, Function>} registry 步骤实现：async (ctx, step) => any
   * @param {object} ctx 运行上下文（工程、输入、服务）
   */
  constructor(wf, registry, ctx, { onEvent = () => {} } = {}) {
    this.wf = wf; this.registry = registry; this.ctx = { vars: {}, notes: [], ...ctx }; this.onEvent = onEvent;
    this.id = `run_${Date.now().toString(36)}`; this.state = 'idle'; this.i = 0; this.round = 0;
    this.log = []; this.waiting = null; this.cancelled = false;
    this.status = wf.steps.map(() => 'todo');
  }
  emit(type, extra = {}) { const e = { type, run: this.id, i: this.i, step: this.wf.steps[this.i]?.name, at: new Date().toISOString(), ...extra }; this.log.push(e); this.onEvent(e); }

  /** 人工节点：返回一个等用户回应的 Promise */
  ask(kind, payload) {
    return new Promise((resolve, reject) => {
      this.waiting = { kind, payload, resolve, reject };
      this.state = 'waiting'; this.emit('wait', { kind, payload });
    });
  }
  respond(answer) { const w = this.waiting; if (!w) return false; this.waiting = null; this.state = 'running'; this.emit('answer', { answer }); w.resolve(answer); return true; }
  cancel() { this.cancelled = true; this.waiting?.reject(new Error('已取消')); this.waiting = null; this.state = 'cancelled'; this.emit('cancelled'); }

  async start(from = 0) {
    this.state = 'running'; this.emit('start', { name: this.wf.name });
    const loop = this.wf.loop; const maxRounds = loop?.max ?? 5;
    for (this.i = from; this.i < this.wf.steps.length; this.i++) {
      if (this.cancelled) return this.finish('cancelled');
      const step = this.wf.steps[this.i];
      if (step.skip) { this.status[this.i] = 'skipped'; continue; }
      const fn = this.registry[step.tool] || (step.kind === 'human' ? this.registry['human.confirm'] : null);
      if (!fn) { this.status[this.i] = 'error'; this.emit('error', { error: `步骤「${step.name}」没有实现（${step.tool}）` }); return this.finish('error'); }
      this.status[this.i] = 'run'; this.emit('step', { status: 'run' });
      try {
        const r = await fn(this.ctx, step, this);
        // 审片回路：from 是审片步骤，from+1..to 是「修改」步骤，只在不通过时执行，执行完回到审片
        if (loop && this.i === loop.from) {
          this.status[this.i] = 'done';
          if (r?.verdict === 'fail' && this.round < maxRounds) {
            this.round++; this.ctx.notes = [...(r.notes || [])]; this.ctx.vars.reviewNotes = r.notes || [];
            this.emit('loop', { round: this.round, notes: r.notes });
            this.fixing = true; continue; // 进入修改步骤
          }
          if (r?.verdict === 'fail') this.emit('info', { text: `已经来回 ${this.round} 轮，按当前版本继续` });
          this.emit('step', { status: 'done' });
          for (let k = loop.from + 1; k <= loop.to; k++) this.status[k] = 'skipped';
          this.i = loop.to; continue; // 通过：跳过修改步骤
        }
        if (loop && this.fixing && this.i === loop.to) {
          this.fixing = false; this.status[this.i] = 'done'; this.emit('step', { status: 'done', result: summarizeResult(r) });
          this.status[loop.from] = 'todo'; this.i = loop.from - 1; continue; // 改完回到审片
        }
        if (step.saveAs) this.ctx.vars[step.saveAs] = r;
        this.status[this.i] = 'done'; this.emit('step', { status: 'done', result: summarizeResult(r) });
      } catch (e) {
        if (this.cancelled) return this.finish('cancelled');
        this.status[this.i] = 'error'; this.emit('error', { error: e.message });
        const a = await this.ask('error', { step: step.name, error: e.message, options: ['重试', '跳过', '停止'] }).catch(() => '停止');
        if (a === '重试') { this.i--; continue; }
        if (a === '跳过') { this.status[this.i] = 'skipped'; continue; }
        return this.finish('error');
      }
    }
    return this.finish('done');
  }
  finish(state) { this.state = state; this.emit('finish', { state }); return { state, log: this.log, vars: this.ctx.vars }; }
  snapshot() { return { id: this.id, wf: this.wf.id, name: this.wf.name, state: this.state, i: this.i, round: this.round, status: this.status, waiting: this.waiting && { kind: this.waiting.kind, payload: this.waiting.payload }, log: this.log.slice(-200) }; }
}

function summarizeResult(r) { if (r == null) return null; if (typeof r === 'string') return r.slice(0, 200); if (r.text) return String(r.text).slice(0, 200); if (r.summary) return r.summary; return null; }
