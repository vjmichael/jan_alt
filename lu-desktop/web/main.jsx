import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

function App() {
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [runtime, setRuntime] = useState({ phase: 'Idle', modelRef: null, sessionId: null });
  const [history, setHistory] = useState([]);
  const [prompt, setPrompt] = useState('');
  const [images, setImages] = useState([]);
  const [stream, setStream] = useState('');
  const [working, setWorking] = useState(false);
  const [generationId, setGenerationId] = useState(null);
  const [error, setError] = useState('');
  const [activity, setActivity] = useState('Lu Native Runtime');
  const endRef = useRef(null);
  const activeGeneration = useRef(null);
  const selected = models.find(m => m.modelRef === selectedModel);
  const loaded = runtime.phase === 'Ready' || runtime.phase === 'Generating';

  async function refresh() {
    const [knownModels, storedHistory, status] = await Promise.all([
      invoke('lu_list_models'), invoke('lu_history'), invoke('lu_status')
    ]);
    setModels(knownModels);
    setHistory(storedHistory);
    setRuntime(status);
    setSelectedModel(old => old || knownModels[0]?.modelRef || '');
  }
  useEffect(() => {
    let alive = true;
    let cancelStart = () => {}, cancelToken = () => {};
    refresh().catch(err => alive && setError(String(err)));
    listen('lu-generation-start', e => {
      if (!alive) return;
      activeGeneration.current = e.payload;
      setGenerationId(e.payload);
      setStream('');
    }).then(fn => { if (alive) cancelStart = fn; else fn(); });
    listen('lu-token', e => {
      if (alive && e.payload?.generationId === activeGeneration.current) {
        setStream(previous => previous + e.payload.text);
      }
    }).then(fn => { if (alive) cancelToken = fn; else fn(); });
    return () => { alive = false; cancelStart(); cancelToken(); };
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({behavior:'smooth'}); }, [history, stream]);

  async function action(label, call) {
    setError(''); setActivity(label);
    setWorking(true);
    try { await call(); } catch (err) { setError(String(err)); }
    finally { setWorking(false); setActivity('Lu Native Runtime'); }
  }
  function importModel() {
    action('Importing GGUF', async () => {
      const model = await invoke('lu_import_model');
      await refresh(); if (model) setSelectedModel(model.modelRef);
    });
  }
  function attachProjector() {
    action('Importing MMProj', async () => {
      await invoke('lu_attach_projector', {modelRef:selectedModel});
      await refresh();
    });
  }
  function loadModel() {
    action('Loading GGUF in Lu Core', async () => {
      await invoke('lu_load_model', {modelRef:selectedModel});
      await refresh();
    });
  }
  function unloadModel() {
    action('Unloading GGUF', async () => {
      await invoke('lu_unload_model', {sessionId:runtime.sessionId});
      await refresh();
    });
  }
  function pickImage() {
    action('Opening native image picker', async () => {
      const img = await invoke('lu_pick_image');
      if (img) setImages(prev => prev.some(p => p.imageRef === img.imageRef) ? prev : [...prev, img]);
    });
  }
  function cancel() {
    if (!generationId || !runtime.sessionId) return;
    invoke('lu_cancel', {sessionId:runtime.sessionId, generationId})
      .catch(err => setError(String(err)));
  }
  async function send(event) {
    event.preventDefault();
    if (working || !runtime.sessionId || !prompt.trim()) return;
    const input = prompt.trim();
    const attachments = images.map(image => image.imageRef);
    let completed = false;
    setStream('');
    await action('Generating response', async () => {
      const output = await invoke('lu_generate', {
        sessionId: runtime.sessionId, prompt:input, imageRefs:attachments, maxNewTokens:512
      });
      if (typeof output !== 'string') throw Error('Lu did not return a text response');
      completed = true;
      await refresh();
    });
    // Preserve the user's input and selected images when a generation fails;
    // an error must never silently destroy the attempted prompt.
    if (completed) {
      setPrompt('');
      setImages([]);
      for (const imageRef of attachments) {
        try { await invoke('lu_release_image', {imageRef}); } catch (error) {
          setError('Response saved, but image cleanup failed: ' + String(error));
        }
      }
    }
    activeGeneration.current = null;
    setGenerationId(null);
    if (completed) setStream('');
  }
  const activeModel = models.find(m => m.modelRef === runtime.modelRef);
  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brandMark">L</div><div><strong>Lu</strong><small>Independent desktop · development evaluation</small></div></div>
      <section className="sidebarSection"><div className="sectionHeading"><span>LOCAL MODELS</span><button className="quietIcon" title="Import GGUF" onClick={importModel} disabled={working}>+</button></div>
        {models.length ? models.map(m => <button key={m.modelRef}
          className={'modelOption '+(selectedModel === m.modelRef ? 'selected' : '')}
          onClick={() => setSelectedModel(m.modelRef)} disabled={working || loaded}>
          <span className="modelName">{m.filename}</span><small>{m.projectorAttached ? 'GGUF + MMProj' : 'GGUF text'}</small>
        </button>) : <p className="asideHelp">Import a local GGUF with the native file picker.</p>}
        <button className="subtleButton full" disabled={working} onClick={importModel}>Import GGUF</button>
      </section>
      <section className="sidebarSection">
        <div className="sectionHeading">MODEL CONTROL</div>
        <button className="subtleButton full" onClick={attachProjector} disabled={working || loaded || !selected || selected.projectorAttached}>Attach MMProj</button>
        <button className="primaryButton full" onClick={loadModel} disabled={working || loaded || !selectedModel}>Load selected model</button>
        <button className="subtleButton full" onClick={unloadModel} disabled={working || !loaded}>Unload model</button>
      </section>
      <div className="sidebarFooter"><span className="statusDot" data-ready={loaded}></span>{runtime.phase || 'Idle'}<div>Lu Core · Vulkan requested; offload unverified</div></div>
    </aside>
    <main className="workspace">
      <header className="topbar"><div><h1>Chat</h1><p>{activeModel?.filename ?? 'Choose a local model to begin'}</p></div>
        <span className="tag">{activity}</span>
      </header>
      <div className="messages" role="log" aria-live="polite">
        {!history.length && <div className="welcome"><div className="welcomeSymbol">L</div><h2>What can I help you build?</h2>
          <p>Your model runs locally. Lu owns the model picker, inference worker and chat commands. No Jan execution path is used.</p>
          <p className="hint">Native tools, full ANSF conversation recovery, and AMD Vulkan acceptance are still being verified.</p>
        </div>}
        {history.map((entry,i) => <div key={i} className={'message '+(entry.role === 'user' ? 'user' : 'assistant')}>
          <span className="messageRole">{entry.role === 'user' ? 'You' : 'Lu'}</span>
          <p>{entry.text}</p>
        </div>)}
        {stream && <div className="message assistant streaming"><span className="messageRole">Lu · generating</span><p>{stream}</p></div>}
        <div ref={endRef}></div>
      </div>
      <div className="composerArea">
        {error && <div className="error" role="alert"><span>{error}</span><button onClick={() => setError('')}>Dismiss</button></div>}
        <form className="composer" onSubmit={send}>
          {images.length > 0 && <div className="attachments">{images.map(im => <span className="attachment" key={im.imageRef}>{im.mimeType} · {im.imageRef.slice(-8)}<button type="button" onClick={() => { setImages(current => current.filter(i => i.imageRef !== im.imageRef)); invoke('lu_release_image', {imageRef:im.imageRef}).catch(err => setError(String(err))); }} aria-label="Remove image">×</button></span>)}</div>}
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3} maxLength={16384}
            placeholder={loaded ? 'Message Lu…' : 'Load a GGUF model first…'} disabled={!loaded || working}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }}/>
          <div className="composerFooter">
            <button type="button" className="subtleButton" disabled={working || !loaded || !selected?.projectorAttached || images.length >= 4} onClick={pickImage}>+ Image</button>
            <span className="composerHelp">Enter to send · Shift+Enter for newline</span>
            {working && generationId ? <button className="dangerButton" type="button" onClick={cancel}>Cancel</button>
              : <button className="primaryButton" type="submit" disabled={working || !loaded || !prompt.trim()}>Send</button>}
          </div>
        </form>
        <p className="footnote">Development evaluation only · Vulkan device offload and real MMProj vision not yet validated on Windows.</p>
      </div>
    </main>
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
