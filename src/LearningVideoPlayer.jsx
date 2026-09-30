import { useEffect, useRef, useState } from 'react';
import { Play, Pause, SpeakerHigh, SpeakerSlash, ArrowsOut, ArrowsIn, ArrowCounterClockwise, ArrowClockwise, ClosedCaptioning } from '@phosphor-icons/react';
import { PLAYBACK_RATES, playbackRate, mediaTime, seekTime } from './player-model.js';
import './learning-player.css';

export function LearningVideoPlayer({ videoRef, source, subtitle, title, resumeTime, onTimeUpdate, onDuration, onSave, onRefresh, saveState }) {
  const container = useRef(null), timer = useRef(null), position = useRef(resumeTime || 0), automaticRetry = useRef(false), retrying = useRef(false);
  const [paused, setPaused] = useState(true), [visible, setVisible] = useState(true), [duration, setDuration] = useState(0), [current, setCurrent] = useState(0);
  const [volume, setVolume] = useState(1), [muted, setMuted] = useState(false), [buffered, setBuffered] = useState(0), [waiting, setWaiting] = useState(false);
  const [error, setError] = useState(''), [full, setFull] = useState(false), [captions, setCaptions] = useState(true);
  const [rate, setRate] = useState(() => { try { return playbackRate(localStorage.getItem('osl-playback-rate')); } catch { return 1; } });
  const [fullscreenSupported, setFullscreenSupported] = useState(false);
  useEffect(() => {
    setFullscreenSupported(Boolean(container.current?.requestFullscreen));
    const change = () => setFull(document.fullscreenElement === container.current);
    document.addEventListener('fullscreenchange', change);
    return () => { clearTimeout(timer.current); document.removeEventListener('fullscreenchange', change); };
  }, []);
  const reveal = () => {
    setVisible(true); clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!videoRef.current?.paused && !container.current?.querySelector('.lp-controls:focus-within')) setVisible(false);
    }, 2800);
  };
  const toggle = async () => {
    if (!videoRef.current) return;
    try {
      if (videoRef.current.paused) await videoRef.current.play(); else videoRef.current.pause();
    } catch { setError('暂时无法播放，请重试或检查视频格式。'); }
    reveal();
  };
  const seek = value => {
    if (!videoRef.current || !duration) return;
    const next = seekTime(value, duration);
    videoRef.current.currentTime = next; position.current = next; setCurrent(next); onTimeUpdate(); reveal();
  };
  const retry = async () => {
    if (retrying.current) return;
    retrying.current = true; setWaiting(true); setError('');
    try {
      const url = await onRefresh();
      if (videoRef.current) { if (url) videoRef.current.src = url; videoRef.current.load(); }
    }
    catch { setError('视频加载失败，请检查网络后重试。'); setWaiting(false); }
    finally { retrying.current = false; }
  };
  const fullscreen = async () => {
    try { if (document.fullscreenElement === container.current) await document.exitFullscreen(); else await container.current.requestFullscreen(); }
    catch { setError('此浏览器暂不支持全屏播放。'); }
  };
  const keyDown = e => {
    if (e.target !== container.current && e.target !== videoRef.current) return;
    const actions = { ' ': toggle, k: toggle, ArrowLeft: () => seek(current - 10), ArrowRight: () => seek(current + 10), m: () => { videoRef.current.muted = !videoRef.current.muted; }, f: () => fullscreenSupported && fullscreen() };
    if (actions[e.key]) { e.preventDefault(); actions[e.key](); }
  };
  return <section ref={container} className={`learning-player ${!paused && !visible && !error ? 'lp-quiet' : ''}`} aria-label={`${title} 视频播放器`} aria-description="空格或 K 播放暂停，左右方向键跳转 10 秒，M 静音，F 全屏。" tabIndex={0} onKeyDown={keyDown} onPointerMove={reveal} onPointerDown={reveal} onFocus={reveal}>
    <video ref={videoRef} className="lp-video" src={source} playsInline preload="metadata" aria-label={title}
      onClick={toggle}
      onLoadedMetadata={() => {
        const v = videoRef.current;
        const length = Number.isFinite(v.duration) ? v.duration : 0;
        setDuration(length); onDuration(length); v.currentTime = seekTime(position.current, length); v.playbackRate = rate;
        setError(''); setWaiting(false);
      }}
      onTimeUpdate={() => { position.current = videoRef.current.currentTime; setCurrent(position.current); onTimeUpdate(); }}
      onPlay={() => { setPaused(false); setError(''); reveal(); }}
      onPause={() => { setPaused(true); setVisible(true); onSave(); }}
      onEnded={() => { setPaused(true); setVisible(true); onSave(); }}
      onWaiting={() => setWaiting(true)} onCanPlay={() => setWaiting(false)} onPlaying={() => setWaiting(false)}
      onVolumeChange={() => { setVolume(videoRef.current.volume); setMuted(videoRef.current.muted); }}
      onProgress={() => { const v = videoRef.current; if (v.buffered.length) setBuffered(v.buffered.end(v.buffered.length - 1)); }}
      onError={() => {
        setWaiting(false);
        if (!automaticRetry.current) { automaticRetry.current = true; retry(); }
        else setError('视频暂时无法加载，请检查网络或重试。');
      }}>
      {subtitle && <track src={subtitle} kind="subtitles" srcLang="zh" label="中文字幕" default />}
    </video>
    <div className="lp-topline"><span>课程视频</span><span>{title}</span></div>
    {error ? <div className="lp-overlay" role="alert"><strong>{error}</strong><button onClick={retry}><ArrowClockwise size={18} />重新加载</button></div>
      : waiting ? <div className="lp-loading" role="status">正在加载视频…</div>
      : paused && <button className="lp-center-play" aria-label={current >= duration && duration ? '重新播放' : '播放视频'} onClick={toggle}><Play size={30} weight="fill" /></button>}
    <div className="lp-controls" onFocus={reveal}>
      <div className="lp-seek" style={{'--played': `${duration ? current / duration * 100 : 0}%`, '--buffered': `${duration ? Math.min(100, buffered / duration * 100) : 0}%`}}>
        <input type="range" min="0" max={duration || 0} step="0.1" value={Math.min(current, duration)} disabled={!duration} aria-label="视频播放进度" aria-valuetext={`${mediaTime(current)} / ${mediaTime(duration)}`} onChange={e => seek(Number(e.target.value))} onPointerUp={onSave} onKeyUp={onSave} />
      </div>
      <div className="lp-control-row">
        <button aria-label={paused ? '播放' : '暂停'} onClick={toggle}>{paused ? <Play weight="fill" /> : <Pause weight="fill" />}</button>
        <button className="lp-skip" aria-label="后退 10 秒" onClick={() => seek(current - 10)} disabled={!duration}><ArrowCounterClockwise /><small>10</small></button>
        <button className="lp-skip" aria-label="前进 10 秒" onClick={() => seek(current + 10)} disabled={!duration}><ArrowClockwise /><small>10</small></button>
        <span className="lp-time">{mediaTime(current)} <span>/ {mediaTime(duration)}</span></span>
        <span className="lp-spacer" />
        <div className="lp-volume"><button aria-label={muted || !volume ? '取消静音' : '静音'} onClick={() => { const v = videoRef.current; if (!v.volume) v.volume = 0.5; v.muted = !v.muted; }}>{muted || !volume ? <SpeakerSlash /> : <SpeakerHigh />}</button><input type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume} aria-label="音量" onChange={e => { videoRef.current.volume = Number(e.target.value); videoRef.current.muted = false; }} /></div>
        <select aria-label="播放速度" value={rate} onChange={e => { const next = playbackRate(e.target.value); setRate(next); videoRef.current.playbackRate = next; try { localStorage.setItem('osl-playback-rate', String(next)); } catch { /* Browser storage is optional. */ } }}>{PLAYBACK_RATES.map(value => <option key={value} value={value}>{value}×</option>)}</select>
        {subtitle && <button aria-label="中文字幕" aria-pressed={captions} onClick={() => { const next = !captions; setCaptions(next); for (const track of videoRef.current.textTracks) track.mode = next ? 'showing' : 'disabled'; }}><ClosedCaptioning /></button>}
        {fullscreenSupported && <button aria-label={full ? '退出视频全屏' : '视频全屏'} onClick={fullscreen}>{full ? <ArrowsIn /> : <ArrowsOut />}</button>}
      </div>
    </div>
    <span className="lp-save-state" aria-live="polite">{saveState}</span>
  </section>;
}
