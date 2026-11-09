/** Batch file rename and reversible trash operations. Jan must enforce its folder permissions at the call boundary. */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { inspectPath, transferPath, trashPath, type PathInfo, type TrashEntry } from './file_lifecycle';
import { toolFailure, toolSuccess, type ToolResult } from './tool_result';

export interface BatchItem { source: string; sha256: string; destination?: string }
export interface BatchPlan {
  root: string;
  mode: 'rename' | 'trash';
  items: BatchItem[];
  /** SHA-256 of the complete plan. It detects accidental changes; it is not an authorization token. */
  planHash: string;
  naming?: { template: string; timestamp: string; timeZone: string; startAt: number };
}
export interface BatchReceipt {
  source: string;
  destination?: string;
  trashId?: string;
  sha256: string;
}
export interface BatchOutcome { completed: BatchReceipt[]; total: number }

const maxItems = 100;
const digest = (value: unknown) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const validHash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const pathExists = (file: string): boolean => {
  try { fs.lstatSync(file); return true; } catch (error: any) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
};
function planHash(plan: Omit<BatchPlan, 'planHash'>): string {
  return digest([plan.root, plan.mode, plan.items, plan.naming ?? null]);
}
function validName(value: string): boolean {
  return !!value && value !== '.' && value !== '..' && path.basename(value) === value &&
    !/[<>:"/\\|?*\x00-\x1f]/.test(value) && !/[. ]$/.test(value) &&
    !/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(value) && Buffer.byteLength(value, 'utf8') <= 255;
}
function dateParts(timestamp: string, timeZone: string): { date: string; time: string } {
  const parsed = new Date(timestamp);
  if (!Number.isFinite(parsed.getTime())) throw Error('Use a valid ISO timestamp.');
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  }).formatToParts(parsed);
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return { date: `${get('month')}${get('day')}${get('year')}`,
    time: `${get('hour')}${get('minute')}${get('second')}` };
}
function render(template: string, file: string, sequence: number, stamp: { date: string; time: string }): string {
  const ext = path.extname(file), stem = path.basename(file, ext);
  const output = template.replace(/\{([^{}]+)\}/g, (_match, token: string) => {
    if (token === 'stem') return stem;
    if (token === 'ext') return ext;
    if (token === 'date:MMddyyyy') return stamp.date;
    if (token === 'time:HHmmss') return stamp.time;
    const seq = /^seq(?::([1-8]))?$/.exec(token);
    if (seq) return String(sequence).padStart(Number(seq[1] ?? 1), '0');
    throw Error(`Unknown naming token: {${token}}.`);
  });
  if (/[{}]/.test(output) || !validName(output)) throw Error('Template produced an invalid filename.');
  return output;
}
function inspectSources(rootPath: string, sources: string[]): ToolResult<{ root: string; infos: PathInfo[] }> {
  const operation = 'batch_inspect';
  if (!Array.isArray(sources) || sources.length < 1 || sources.length > maxItems ||
      sources.some(s => typeof s !== 'string' || !s.trim())) {
    return toolFailure(operation, 'INVALID_ARGUMENT', `Provide 1 to ${maxItems} file paths.`);
  }
  let root: string;
  try { root = fs.realpathSync(rootPath); }
  catch { return toolFailure(operation, 'INVALID_ROOT', 'Root folder does not exist.'); }
  const infos: PathInfo[] = [], seen = new Set<string>();
  for (const source of sources) {
    const result = inspectPath(root, source);
    if (!result.success) return toolFailure(operation, result.error!.code, result.error!.message, source);
    const info = result.data!;
    if (info.kind !== 'file') return toolFailure(operation, 'NOT_FILE', 'Batch operations accept regular files only.', info.path);
    const key = process.platform === 'win32' ? info.path.toLowerCase() : info.path;
    if (seen.has(key)) return toolFailure(operation, 'DUPLICATE_SOURCE', 'A file appears more than once.', info.path);
    seen.add(key); infos.push(info);
  }
  return toolSuccess(operation, { root, infos });
}

/** Preview in the supplied order. Examples: image{seq:3}{ext}; file-{date:MMddyyyy}-{time:HHmmss}-{seq:3}{ext}. */
export function previewBatchRename(rootPath: string, sources: string[], request: {
  template: string; startAt?: number; timestamp?: string; timeZone?: string
}): ToolResult<BatchPlan> {
  const operation = 'preview_batch_rename', inspected = inspectSources(rootPath, sources);
  if (!inspected.success) return toolFailure(operation, inspected.error!.code, inspected.error!.message);
  const template = request?.template, startAt = request?.startAt ?? 1;
  if (typeof template !== 'string' || !template || template.length > 255 ||
      !Number.isSafeInteger(startAt) || startAt < 0) {
    return toolFailure(operation, 'INVALID_ARGUMENT', 'Provide a naming template and nonnegative startAt.');
  }
  const timestamp = request.timestamp ?? new Date().toISOString(), timeZone = request.timeZone ?? 'UTC';
  try {
    const stamp = dateParts(timestamp, timeZone), destinations = new Set<string>(), items: BatchItem[] = [];
    for (let i = 0; i < inspected.data!.infos.length; i++) {
      const info = inspected.data!.infos[i];
      const name = render(template, info.path, startAt + i, stamp);
      const destination = path.join(path.dirname(info.path), name);
      const key = process.platform === 'win32' ? destination.toLowerCase() : destination;
      if (destination === info.path || destinations.has(key) || pathExists(destination)) {
        return toolFailure(operation, 'CONFLICT', 'A proposed name is unchanged, repeated, or already exists.', destination);
      }
      destinations.add(key); items.push({ source: info.path, destination, sha256: info.sha256 });
    }
    const draft = { root: inspected.data!.root, mode: 'rename' as const, items,
      naming: { template, timestamp, timeZone, startAt } };
    return toolSuccess(operation, { ...draft, planHash: planHash(draft) });
  } catch (error) { return toolFailure(operation, 'INVALID_TEMPLATE', String(error)); }
}

export function previewBatchTrash(rootPath: string, sources: string[]): ToolResult<BatchPlan> {
  const operation = 'preview_batch_trash', inspected = inspectSources(rootPath, sources);
  if (!inspected.success) return toolFailure(operation, inspected.error!.code, inspected.error!.message);
  const draft = { root: inspected.data!.root, mode: 'trash' as const,
    items: inspected.data!.infos.map(info => ({ source: info.path, sha256: info.sha256 })) };
  return toolSuccess(operation, { ...draft, planHash: planHash(draft) });
}

/** Apply a reviewed preview. On partial failure, completed receipts identify changes to reverse individually. */
export function applyBatchPlan(rootPath: string, plan: BatchPlan, expectedPlanHash: string): ToolResult<BatchOutcome> {
  const operation = 'apply_batch_plan';
  let root: string;
  try { root = fs.realpathSync(rootPath); }
  catch { return toolFailure(operation, 'INVALID_ROOT', 'Root folder does not exist.'); }
  if (!plan || plan.root !== root || !['rename', 'trash'].includes(plan.mode) ||
      !Array.isArray(plan.items) || plan.items.length < 1 || plan.items.length > maxItems ||
      plan.items.some(i => !i || typeof i.source !== 'string' || !i.source.trim()) ||
      !validHash(plan.planHash) || plan.planHash !== expectedPlanHash ||
      plan.planHash !== planHash({ root: plan.root, mode: plan.mode, items: plan.items, naming: plan.naming })) {
    return toolFailure(operation, 'INVALID_PLAN', 'The reviewed batch plan changed. Preview again.');
  }
  const sources = plan.items.map(i => i.source);
  const inspected = inspectSources(root, sources);
  if (!inspected.success) return toolFailure(operation, inspected.error!.code, inspected.error!.message);
  const targets = new Set<string>();
  for (let i = 0; i < plan.items.length; i++) {
    const item = plan.items[i], info = inspected.data!.infos[i];
    if (info.path !== item.source || !validHash(item.sha256) || info.sha256 !== item.sha256) {
      return toolFailure(operation, 'CONFLICT', 'A source changed since preview. No batch changes were made.', item.source);
    }
    if (plan.mode === 'rename') {
      const dest = item.destination;
      if (!dest || path.dirname(dest) !== path.dirname(item.source) || !validName(path.basename(dest)) ||
          pathExists(dest) || targets.has(process.platform === 'win32' ? dest.toLowerCase() : dest)) {
        return toolFailure(operation, 'CONFLICT', 'A destination is invalid or occupied. No batch changes were made.', dest);
      }
      targets.add(process.platform === 'win32' ? dest.toLowerCase() : dest);
    } else if (item.destination) return toolFailure(operation, 'INVALID_PLAN', 'Trash plan has a destination.');
  }
  const completed: BatchReceipt[] = [];
  for (const item of plan.items) {
    const result: ToolResult<TrashEntry | { source: string; destination: string; sha256: string; mode: string }> =
      plan.mode === 'trash' ? trashPath(root, item.source, item.sha256) :
        transferPath(root, item.source, item.destination!, item.sha256, 'move');
    if (!result.success) return toolFailure(operation, 'PARTIAL_BATCH',
      `${completed.length} of ${plan.items.length} files changed before the batch stopped: ${result.error!.message}`,
      item.source, false, { completed, failed: item.source, cause: result.error });
    completed.push(plan.mode === 'trash'
      ? { source: item.source, sha256: item.sha256, trashId: (result.data as TrashEntry).id }
      : { source: item.source, destination: item.destination, sha256: item.sha256 });
  }
  return toolSuccess(operation, { completed, total: plan.items.length });
}