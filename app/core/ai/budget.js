// 预算：每个接口单独设上限，本地记账。单价由用户填（元 / 百万 token），默认 0 只记用量。
import fs from 'node:fs/promises';
import path from 'node:path';

export class Budget {
  constructor(file) { this.file = file; this.data = { month: '', byProvider: {} }; }
  async load() { try { this.data = JSON.parse(await fs.readFile(this.file, 'utf8')); } catch {} this.roll(); return this; }
  roll() { const m = new Date().toISOString().slice(0, 7); if (this.data.month !== m) this.data = { month: m, byProvider: {} }; }
  async save() { await fs.mkdir(path.dirname(this.file), { recursive: true }); await fs.writeFile(this.file, JSON.stringify(this.data, null, 1)); }
  entry(id) { return (this.data.byProvider[id] ||= { input: 0, output: 0, cost: 0, calls: 0 }); }
  /** 为某个接口建一个计量器；limit 为本月上限（元），0 = 不限 */
  meter(id, { priceIn = 0, priceOut = 0, limit = 0 } = {}) {
    const self = this; this.roll();
    return {
      check() { const e = self.entry(id); if (limit > 0 && e.cost >= limit) throw new Error(`本月 ${id} 已用 ${e.cost.toFixed(2)} 元，达到你设的上限 ${limit} 元。到设置里调高或换接口。`); },
      add(u) { const e = self.entry(id); e.input += u.input || 0; e.output += u.output || 0; e.calls++; e.cost += ((u.input || 0) * priceIn + (u.output || 0) * priceOut) / 1e6; self.save().catch(() => {}); },
      get used() { return self.entry(id); },
    };
  }
  summary() { this.roll(); return this.data; }
}
