// 右侧停靠栏：AI 助手和工作流放在同一栏，两个标签切换；工作流等你时自动切过来
import React from 'react';
import { useStore, S } from '../store.js';
import Icon from './Icon.jsx';
import AiDock from './AiDock.jsx';
import WfPanel from './WfPanel.jsx';

export default function Dock() {
  const dock = useStore((s) => s.dock) || { open: true, tab: 'ai' }; const run = useStore((s) => s.run); const settings = useStore((s) => s.settings);
  const active = settings?.ai?.providers?.find((x) => x.id === settings.ai.active);
  const tab = dock.tab || 'ai'; const go = (t) => S().setDock({ ...dock, tab: t });
  return <>
    <div className="dh">
      <button className={'t' + (tab === 'ai' ? ' on' : '')} onClick={() => go('ai')}><Icon n="spark" s={14} />AI 助手</button>
      <button className={'t' + (tab === 'wf' ? ' on' : '')} onClick={() => go('wf')}><Icon n="flow" s={14} />工作流{run?.waiting && <span className="tag human">等你</span>}{run && !run.waiting && !['done', 'error', 'cancelled'].includes(run.state) && <span className="spin" />}</button>
      <span className="spacer" />
      {tab === 'ai' && <span className="tag ai" title="到设置里切换" style={{ maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis' }}>{active ? active.name : '未配置'}</span>}
      <button className="ib sm" onClick={() => S().setDock({ ...dock, open: false })} title="收起"><Icon n="chev" /></button>
    </div>
    <div style={{ display: tab === 'ai' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}><AiDock /></div>
    <div style={{ display: tab === 'wf' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}><WfPanel /></div>
  </>;
}
