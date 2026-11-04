// 精修：分镜 / 剪辑 / 调色 / 音频是同一个工程的四种看法，按 1–4 切换；布局预设和圈注开关放在这条上
import React from 'react';
import { useStore, S, PRESETS } from '../store.js';
import { tc } from '../../../core/timing.js';
import { Icon } from '../components/ui.jsx';
import Board from './Board.jsx';
import Edit from './Edit.jsx';
import Color from './Color.jsx';
import AudioPage from './Audio.jsx';

const MODES = [['board', 'grid', '分镜'], ['edit', 'cut', '剪辑'], ['color', 'palette', '调色'], ['audio', 'wave', '音频']];
const LAYOUTS = [['default', 'layout', '默认布局'], ['preview', 'bigpv', '大预览'], ['timeline', 'bigtl', '大时间线']];

export default function Refine() {
  const mode = useStore((s) => s.mode); const p = useStore((s) => s.p); const preset = useStore((s) => s.layout.preset); const anno = useStore((s) => s.annoMode);
  const open = p.annotations.filter((a) => !a.done).length;
  const Mode = { board: Board, edit: Edit, color: Color, audio: AudioPage }[mode] || Edit;
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
      <div className="modebar">
        <div className="modes">{MODES.map(([k, ic, n], i) => <button key={k} className={mode === k ? 'on' : ''} onClick={() => S().setMode(k)} title={`${n}（${i + 1}）`}><Icon n={ic} s={14} />{n}<kbd>{i + 1}</kbd></button>)}</div>
        <span className="note num" style={{ marginLeft: 6 }}>{tc(p.duration, p.fps).slice(3, 8)} · {p.shots.length} 镜 · {p.lines.length} 句</span>
        <span className="spacer" />
        {(mode === 'edit' || mode === 'board') && <button className={'ib' + (anno ? ' on' : '')} onClick={() => useStore.setState({ annoMode: !anno })} title="在画面上拖一个框，写一句修改意见"><Icon n="pen" />圈注{open > 0 && <span className="tag review" style={{ marginLeft: 2 }}>{open}</span>}</button>}
        {mode === 'edit' && <div className="seg" role="group" aria-label="布局">{LAYOUTS.map(([k, ic, n]) => <button key={k} className={preset === k ? 'on' : ''} title={n} onClick={() => S().setLayout({ ...PRESETS[k], preset: k, railOpen: k !== 'preview' })}><Icon n={ic} s={14} /></button>)}</div>}
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}><Mode /></div>
    </div>
  );
}
