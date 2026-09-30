import { OPC_PHASES, phaseProgress } from './opc-model.js';

export function coursePhasePath(id) {
  const phase = Number(id);
  return Number.isInteger(phase) && phase >= 1 && phase <= 5 ? `/opc/phase/${phase}` : '/opc';
}

export function phaseFromPath(path) {
  const match = /^\/opc\/phase\/([1-5])\/?$/.exec(path);
  return match ? Number(match[1]) : null;
}

export function routeOverview(phases = []) {
  const entries = OPC_PHASES.map(definition => {
    const source = phases.find(p => p.id === definition.id);
    const items = source?.items || [];
    return { ...definition, ...source, items, progress: phaseProgress(items) };
  });
  const items = entries.flatMap(p => p.items);
  const current = entries.find(p => p.items.some(i => !i.locked && i.progress === 'started'))
    || entries.find(p => p.items.some(i => !i.locked && i.progress !== 'completed'))
    || entries.find(p => p.items.length) || entries[0];
  return { phases: entries, progress: phaseProgress(items), current: current.id,
    completedPhases: entries.filter(p => p.items.length && p.progress.percent === 100).length };
}
