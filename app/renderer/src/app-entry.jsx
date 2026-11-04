import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App, { startWorkflow } from './App.jsx';
import { useStore } from './store.js';

// 给自动化测试和调试用
window.__mj = { store: useStore, startWorkflow };

class Guard extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { console.error(err, info?.componentStack); }
  render() {
    if (!this.state.err) return this.props.children;
    return <div className="empty"><h3>界面出错了</h3><pre style={{ maxWidth: 800, whiteSpace: 'pre-wrap', textAlign: 'left' }}>{String(this.state.err?.stack || this.state.err)}</pre><button className="btn pri" onClick={() => this.setState({ err: null })}>重试</button></div>;
  }
}
createRoot(document.getElementById('root')).render(<Guard><App /></Guard>);
