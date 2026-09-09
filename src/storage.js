export const DATA_KEY = 'tempalist:data';
export const WARNING_BYTES = 4 * 1024 * 1024;
export class StorageFailure extends Error {
  constructor(message, kind = 'unavailable', cause) {
    super(message, { cause });
    this.name = 'StorageFailure';
    this.kind = kind;
  }
}

export function createStore(backend, validate) {
  function read() {
    let raw;
    try { raw = backend.getItem(DATA_KEY); }
    catch (error) { throw new StorageFailure('端末の保存領域を利用できません。ブラウザの設定をご確認ください。', 'unavailable', error); }
    if (raw === null) return null;
    try { return validate(JSON.parse(raw)); }
    catch (error) { throw new StorageFailure(`保存データを読み込めません。元データを保存してから復旧してください。${error.message}`, 'invalid', error); }
  }
  function write(value) {
    const clean = validate(value);
    try { backend.setItem(DATA_KEY, JSON.stringify(clean)); }
    catch (error) {
      const quota = error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED';
      throw new StorageFailure(quota ? '保存容量が不足しています。次のリストを作成するには、保存済みデータを削除して空き容量を確保してください。' : '保存できませんでした。入力は画面に残っています。', quota ? 'quota' : 'unavailable', error);
    }
    return clean;
  }
  return {
    read,
    initialize(value) { return read() ?? write(value); },
    save(value, expectedRevision) {
      const current = read();
      if (!current || current.revision !== expectedRevision) throw new StorageFailure('別の画面で更新されました。最新の内容を確認してから、もう一度操作してください。', 'conflict');
      return write({ ...value, revision: current.revision + 1 });
    },
    raw() { return backend.getItem(DATA_KEY); },
  };
}

export function storageUsage(backend) {
  let bytes = 0;
  for (let index = 0; index < backend.length; index++) {
    const key = backend.key(index);
    bytes += 2 * (key.length + (backend.getItem(key)?.length ?? 0));
  }
  return bytes;
}
