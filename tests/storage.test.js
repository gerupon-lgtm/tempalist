import { beforeEach, describe, expect, it } from 'vitest';
import { createStore, StorageFailure, DATA_KEY, storageUsage } from '../src/storage.js';

const fresh = () => ({schemaVersion:1,revision:0,templates:[],checklists:[],settings:{completedRetention:'90d'}});
beforeEach(() => localStorage.clear());
describe('persistent snapshot', () => {
  it('commits whole state, survives reload and rejects stale writes', () => {
    const store = createStore(localStorage, value => value);
    store.initialize(fresh());
    const prior = store.read();
    const next = {...prior, settings:{completedRetention:'keep'}};
    store.save(next, prior.revision);
    expect(createStore(localStorage, v => v).read().settings.completedRetention).toBe('keep');
    expect(() => store.save(prior, prior.revision)).toThrow(/別の画面/);
    expect(store.read().revision).toBe(1);
  });
  it('keeps prior snapshot when quota is exceeded', () => {
    const real = new Map();
    const backend = {getItem:k => real.get(k) ?? null, setItem(k,v) {if(v.length > 200) throw new DOMException('Full','QuotaExceededError'); real.set(k,v);}};
    const store = createStore(backend, v => v);
    store.initialize(fresh());
    const before = backend.getItem(DATA_KEY);
    expect(() => store.save({...fresh(),text:'x'.repeat(300)},0)).toThrow(StorageFailure);
    expect(backend.getItem(DATA_KEY)).toBe(before);
  });
  it('does not replace corrupt saved data or silently reseed', () => {
    localStorage.setItem(DATA_KEY, '{broken');
    const store = createStore(localStorage, v => v);
    expect(() => store.read()).toThrow(/読み込めません/);
    expect(() => store.initialize(fresh())).toThrow();
    expect(localStorage.getItem(DATA_KEY)).toBe('{broken');
  });
  it('accounts for all origin keys without writing probes', () => {
    localStorage.setItem('other','あいう');
    expect(storageUsage(localStorage)).toBe(16);
    expect(localStorage.length).toBe(1);
  });
});
