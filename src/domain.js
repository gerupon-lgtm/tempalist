const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UTC_ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/;
const TEMPLATE_STATUSES = new Set(['draft', 'active', 'archived']);
const CHECKLIST_STATUSES = new Set(['active', 'settled']);
const RETENTIONS = new Set(['30d', '90d', '365d', 'keep']);
const OFFSETS = new Set(['-24h', '-1h']);

function fail(message) {
  throw new Error(message);
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireObject(value, label) {
  if (!isObject(value)) fail(`${label}が不正です`);
  return value;
}

function requireText(value, label) {
  if (typeof value !== 'string' || value.trim() === '') fail(`${label}を入力してください`);
  return value;
}

function optionalNote(value, label = 'メモ') {
  if (value === undefined) return '';
  if (typeof value !== 'string') fail(`${label}が不正です`);
  return value;
}

function optionalBoolean(value, label) {
  if (value === undefined) return false;
  if (typeof value !== 'boolean') fail(`${label}が不正です`);
  return value;
}

function requireUuid(value, label) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) fail(`${label}が不正です`);
  return value;
}

function isUtcIso(value) {
  if (typeof value !== 'string') return false;
  const match = UTC_ISO_PATTERN.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute, second, fraction = ''] = match;
  const millisecond = Number(fraction.padEnd(3, '0'));
  const timestamp = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second), millisecond);
  if (!Number.isFinite(timestamp)) return false;
  const parsed = new Date(timestamp);
  return parsed.getUTCFullYear() === Number(year)
    && parsed.getUTCMonth() === Number(month) - 1
    && parsed.getUTCDate() === Number(day)
    && parsed.getUTCHours() === Number(hour)
    && parsed.getUTCMinutes() === Number(minute)
    && parsed.getUTCSeconds() === Number(second)
    && parsed.getUTCMilliseconds() === millisecond;
}

function requireIso(value, label) {
  if (!isUtcIso(value)) fail(`${label}はUTC日時で指定してください`);
  return value;
}

function requireNow(now) {
  const value = now === undefined ? new Date().toISOString() : now;
  return requireIso(value, '日時');
}

function uniqueIds(entries, label) {
  const seen = new Set();
  for (const entry of entries) {
    if (seen.has(entry.id)) fail(`${label}のIDが重複しています`);
    seen.add(entry.id);
  }
}

function sanitizeTemplateItem(value) {
  const item = requireObject(value, 'テンプレート項目');
  return {
    id: requireUuid(item.id, 'テンプレート項目ID'),
    label: requireText(item.label, '項目名'),
    note: optionalNote(item.note),
  };
}

function sanitizeTemplate(value) {
  const source = requireObject(value, 'テンプレート');
  if (!TEMPLATE_STATUSES.has(source.status)) fail('テンプレートの状態が不正です');
  if (!Array.isArray(source.items)) fail('テンプレート項目が不正です');
  const items = source.items.map(sanitizeTemplateItem);
  uniqueIds(items, 'テンプレート項目');
  return {
    id: requireUuid(source.id, 'テンプレートID'),
    name: requireText(source.name, 'テンプレート名'),
    status: source.status,
    defaultOrderLocked: optionalBoolean(source.defaultOrderLocked, '並び順ロックの初期設定'),
    items,
    createdAt: requireIso(source.createdAt, '作成日時'),
    updatedAt: requireIso(source.updatedAt, '更新日時'),
  };
}

function sanitizeChecklistItem(value) {
  const item = requireObject(value, 'チェックリスト項目');
  if (typeof item.checked !== 'boolean') fail('チェック状態が不正です');
  return {
    id: requireUuid(item.id, 'チェックリスト項目ID'),
    label: requireText(item.label, '項目名'),
    note: optionalNote(item.note),
    checked: item.checked,
  };
}

function sanitizeOffsets(value) {
  if (!Array.isArray(value)) fail('通知オフセットが不正です');
  const offsets = value.map((offset) => {
    if (typeof offset !== 'string' || !OFFSETS.has(offset)) fail('通知オフセットが不正です');
    return offset;
  });
  if (new Set(offsets).size !== offsets.length) fail('通知オフセットが重複しています');
  return offsets;
}

function sanitizeChecklist(value) {
  const source = requireObject(value, 'チェックリスト');
  if (!Array.isArray(source.items)) fail('チェックリスト項目が不正です');
  const items = source.items.map(sanitizeChecklistItem);
  uniqueIds(items, 'チェックリスト項目');
  if (source.sourceTemplateId !== null) requireUuid(source.sourceTemplateId, '生まれ元テンプレートID');
  if (source.dueAt !== null) requireIso(source.dueAt, '期限');
  if (typeof source.dueHasTime !== 'boolean') fail('期限の時刻指定が不正です');
  if (source.dueAt === null && source.dueHasTime) fail('期限の時刻指定が不正です');
  if (typeof source.notificationEnabled !== 'boolean') fail('通知設定が不正です');
  if (!CHECKLIST_STATUSES.has(source.status)) fail('チェックリストの状態が不正です');
  if (source.status === 'settled') {
    requireIso(source.settledAt, '確定日時');
  } else if (source.settledAt !== null) {
    fail('進行中チェックリストの確定日時が不正です');
  }
  return {
    id: requireUuid(source.id, 'チェックリストID'),
    title: requireText(source.title, 'タイトル'),
    remarks: optionalNote(source.remarks, '備考'),
    remarksUpdatedAt: source.remarksUpdatedAt == null ? null : requireIso(source.remarksUpdatedAt, '備考更新日時'),
    sourceTemplateId: source.sourceTemplateId,
    orderLocked: optionalBoolean(source.orderLocked, '並び順ロック'),
    items,
    dueAt: source.dueAt,
    dueHasTime: source.dueHasTime,
    notificationEnabled: source.notificationEnabled,
    offsets: sanitizeOffsets(source.offsets),
    status: source.status,
    settledAt: source.settledAt,
    createdAt: requireIso(source.createdAt, '作成日時'),
    updatedAt: requireIso(source.updatedAt, '更新日時'),
  };
}

function freshId(used = new Set()) {
  let id;
  do {
    id = globalThis.crypto.randomUUID();
  } while (used.has(id));
  used.add(id);
  return id;
}

function existingState(value) {
  return validateState(value);
}

function findById(entries, id, label) {
  const entity = entries.find((entry) => entry.id === id);
  if (!entity) fail(`${label}が見つかりません`);
  return entity;
}

function replaceById(entries, id, replacement) {
  return entries.map((entry) => (entry.id === id ? replacement : entry));
}

function normalizeEditableTemplateItems(items, previousItems = []) {
  if (!Array.isArray(items)) fail('テンプレート項目が不正です');
  const previousIds = new Set(previousItems.map((item) => item.id));
  const used = new Set();
  const normalized = items.map((value) => {
    const item = requireObject(value, 'テンプレート項目');
    const id = item.id !== undefined && previousIds.has(item.id) ? item.id : freshId();
    if (used.has(id)) fail('テンプレート項目のIDが重複しています');
    used.add(id);
    return { id, label: requireText(item.label, '項目名'), note: optionalNote(item.note) };
  });
  uniqueIds(normalized, 'テンプレート項目');
  return normalized;
}

function normalizeEditableChecklistItems(items, previousItems = []) {
  if (!Array.isArray(items)) fail('チェックリスト項目が不正です');
  const previousById = new Map(previousItems.map((item) => [item.id, item]));
  const used = new Set();
  const normalized = items.map((value) => {
    const item = requireObject(value, 'チェックリスト項目');
    const existing = item.id === undefined ? undefined : previousById.get(item.id);
    const id = existing ? existing.id : freshId();
    if (used.has(id)) fail('チェックリスト項目のIDが重複しています');
    used.add(id);
    const checked = item.checked === undefined ? (existing?.checked ?? false) : item.checked;
    if (typeof checked !== 'boolean') fail('チェック状態が不正です');
    return { id, label: requireText(item.label, '項目名'), note: optionalNote(item.note), checked };
  });
  uniqueIds(normalized, 'チェックリスト項目');
  return normalized;
}

export function emptyState() {
  return {
    schemaVersion: 1,
    revision: 0,
    templates: [],
    checklists: [],
    settings: { completedRetention: '90d' },
  };
}

export function validateState(value) {
  const source = requireObject(value, 'データ');
  if (source.schemaVersion !== 1) fail('未対応のデータ形式です');
  if (!Number.isInteger(source.revision) || source.revision < 0) fail('リビジョンが不正です');
  if (!Array.isArray(source.templates) || !Array.isArray(source.checklists)) fail('保存データが不正です');
  const templates = source.templates.map(sanitizeTemplate);
  const checklists = source.checklists.map(sanitizeChecklist);
  uniqueIds(templates, 'テンプレート');
  uniqueIds(checklists, 'チェックリスト');
  const settings = requireObject(source.settings, '設定');
  if (!RETENTIONS.has(settings.completedRetention)) fail('保持期間の設定が不正です');
  return {
    schemaVersion: 1,
    revision: source.revision,
    templates,
    checklists,
    settings: { completedRetention: settings.completedRetention },
  };
}

export function createTemplate(state, input, now) {
  const next = existingState(state);
  const value = requireObject(input, 'テンプレート');
  const timestamp = requireNow(now);
  const status = value.status ?? 'active';
  if (!TEMPLATE_STATUSES.has(status)) fail('テンプレートの状態が不正です');
  const entityIds = new Set(next.templates.map((entry) => entry.id));
  const created = {
    id: freshId(entityIds),
    name: requireText(value.name, 'テンプレート名'),
    status,
    defaultOrderLocked: optionalBoolean(value.defaultOrderLocked, '並び順ロックの初期設定'),
    items: normalizeEditableTemplateItems(value.items),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return { ...next, templates: [...next.templates, created] };
}

export function updateTemplate(state, id, input, now) {
  const next = existingState(state);
  requireUuid(id, 'テンプレートID');
  const current = findById(next.templates, id, 'テンプレート');
  const value = requireObject(input, 'テンプレート');
  const timestamp = requireNow(now);
  if (!TEMPLATE_STATUSES.has(value.status)) fail('テンプレートの状態が不正です');
  const updated = {
    ...current,
    name: requireText(value.name, 'テンプレート名'),
    status: value.status,
    defaultOrderLocked: value.defaultOrderLocked === undefined ? current.defaultOrderLocked : optionalBoolean(value.defaultOrderLocked, '並び順ロックの初期設定'),
    items: normalizeEditableTemplateItems(value.items, current.items),
    updatedAt: timestamp,
  };
  return { ...next, templates: replaceById(next.templates, id, updated) };
}

export function duplicateTemplate(state, id, now) {
  const next = existingState(state);
  requireUuid(id, 'テンプレートID');
  const current = findById(next.templates, id, 'テンプレート');
  const timestamp = requireNow(now);
  const entityIds = new Set(next.templates.map((entry) => entry.id));
  const duplicate = {
    id: freshId(entityIds),
    name: `${current.name} のコピー`,
    status: current.status,
    defaultOrderLocked: current.defaultOrderLocked,
    items: current.items.map((item) => ({ id: freshId(), label: item.label, note: item.note })),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return { ...next, templates: [...next.templates, duplicate] };
}

export function deleteTemplate(state, id) {
  const next = existingState(state);
  requireUuid(id, 'テンプレートID');
  findById(next.templates, id, 'テンプレート');
  return { ...next, templates: next.templates.filter((entry) => entry.id !== id) };
}

export function createChecklist(state, input, now) {
  const next = existingState(state);
  const value = requireObject(input, 'チェックリスト');
  const timestamp = requireNow(now);
  const sourceTemplateId = value.sourceTemplateId ?? null;
  let sourceItems = [], orderLocked = false;
  if (sourceTemplateId !== null) {
    requireUuid(sourceTemplateId, '生まれ元テンプレートID');
    const source = findById(next.templates, sourceTemplateId, 'テンプレート');
    if (source.status !== 'active') fail('有効なテンプレートを選択してください');
    sourceItems = source.items;
    orderLocked = source.defaultOrderLocked;
  }
  const dueAt = value.dueAt ?? null;
  const dueHasTime = value.dueHasTime ?? false;
  if (dueAt !== null) requireIso(dueAt, '期限');
  if (typeof dueHasTime !== 'boolean' || (dueAt === null && dueHasTime)) fail('期限の時刻指定が不正です');
  const entityIds = new Set(next.checklists.map((entry) => entry.id));
  const created = {
    id: freshId(entityIds),
    title: requireText(value.title, 'タイトル'),
    remarks: '',
    remarksUpdatedAt: null,
    sourceTemplateId,
    orderLocked,
    items: sourceItems.map((item) => ({ id: freshId(), label: item.label, note: item.note, checked: false })),
    dueAt,
    dueHasTime,
    notificationEnabled: false,
    offsets: ['-24h', '-1h'],
    status: 'active',
    settledAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return { ...next, checklists: [...next.checklists, created] };
}

export function updateChecklist(state, id, patch, now) {
  const next = existingState(state);
  requireUuid(id, 'チェックリストID');
  const current = findById(next.checklists, id, 'チェックリスト');
  if (current.status === 'settled') fail('確定済みのチェックリストは編集できません');
  const value = requireObject(patch, '更新内容');
  const allowed = new Set(['title', 'items', 'dueAt', 'dueHasTime', 'offsets', 'orderLocked']);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail('変更できない項目が含まれています');
  }
  const updated = {
    ...current,
    title: value.title === undefined ? current.title : requireText(value.title, 'タイトル'),
    orderLocked: value.orderLocked === undefined ? current.orderLocked : optionalBoolean(value.orderLocked, '並び順ロック'),
    items: value.items === undefined ? current.items : normalizeEditableChecklistItems(value.items, current.items),
    dueAt: value.dueAt === undefined ? current.dueAt : value.dueAt,
    dueHasTime: value.dueHasTime === undefined ? current.dueHasTime : value.dueHasTime,
    offsets: value.offsets === undefined ? current.offsets : sanitizeOffsets(value.offsets),
    updatedAt: requireNow(now),
  };
  if (current.orderLocked && value.items !== undefined) {
    const remaining = new Set(updated.items.map(item => item.id));
    const previous = new Set(current.items.map(item => item.id));
    const before = current.items.filter(item => remaining.has(item.id)).map(item => item.id);
    const after = updated.items.filter(item => previous.has(item.id)).map(item => item.id);
    if (before.some((id, index) => id !== after[index])) fail('並び順がロックされています。解除してから移動してください');
  }
  if (updated.dueAt !== null) requireIso(updated.dueAt, '期限');
  if (typeof updated.dueHasTime !== 'boolean' || (updated.dueAt === null && updated.dueHasTime)) fail('期限の時刻指定が不正です');
  if(!updated.dueAt||!updated.offsets.length)updated.notificationEnabled=false;
  return { ...next, checklists: replaceById(next.checklists, id, updated) };
}

export function updateChecklistRemarks(state, id, remarks, now) {
  const next = existingState(state);
  const current = findById(next.checklists, requireUuid(id, 'チェックリストID'), 'チェックリスト');
  const value = optionalNote(remarks, '備考');
  if (value === current.remarks) return next;
  const timestamp = requireNow(now);
  const updated = {...current, remarks:value, remarksUpdatedAt:timestamp, updatedAt:timestamp};
  return {...next, checklists:replaceById(next.checklists, id, updated)};
}

export function setChecklistNotification(state,id,enabled,now){
  const next=existingState(state);requireUuid(id,'チェックリストID');
  const current=findById(next.checklists,id,'チェックリスト');const timestamp=requireNow(now);
  if(typeof enabled!=='boolean')fail('通知設定が不正です');
  if(current.status!=='active')fail('確定済みのチェックリストは編集できません');
  const durations={'-24h':86400000,'-1h':3600000};
  if(enabled&&(!current.dueAt||!current.offsets.some(offset=>Date.parse(current.dueAt)-durations[offset]>Date.parse(timestamp))))fail('通知できる時刻がありません。期限と通知タイミングを確認してください');
  return {...next,checklists:replaceById(next.checklists,id,{...current,notificationEnabled:enabled,updatedAt:timestamp})};
}

export function toggleItem(state, checklistId, itemId, now) {
  const next = existingState(state);
  requireUuid(checklistId, 'チェックリストID');
  requireUuid(itemId, '項目ID');
  const current = findById(next.checklists, checklistId, 'チェックリスト');
  if (current.status === 'settled') fail('確定済みのチェックリストは編集できません');
  findById(current.items, itemId, '項目');
  const updated = {
    ...current,
    items: current.items.map((item) => (item.id === itemId ? { ...item, checked: !item.checked } : item)),
    updatedAt: requireNow(now),
  };
  return { ...next, checklists: replaceById(next.checklists, checklistId, updated) };
}

export function reorderItems(state, kind, id, fromIndex, toIndex, now) {
  const next = existingState(state);
  requireUuid(id, '対象ID');
  if (kind !== 'template' && kind !== 'checklist') fail('並べ替え対象が不正です');
  const collectionName = kind === 'template' ? 'templates' : 'checklists';
  const label = kind === 'template' ? 'テンプレート' : 'チェックリスト';
  const current = findById(next[collectionName], id, label);
  if (kind === 'checklist' && current.status === 'settled') fail('確定済みのチェックリストは編集できません');
  if (kind === 'checklist' && current.orderLocked) fail('並び順がロックされています。解除してから移動してください');
  if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)
    || fromIndex < 0 || toIndex < 0 || fromIndex >= current.items.length || toIndex >= current.items.length) {
    fail('並べ替え位置が不正です');
  }
  const items = [...current.items];
  const [moved] = items.splice(fromIndex, 1);
  items.splice(toIndex, 0, moved);
  const updated = { ...current, items, updatedAt: requireNow(now) };
  return { ...next, [collectionName]: replaceById(next[collectionName], id, updated) };
}

export function settleChecklist(state, id, now) {
  const next = existingState(state);
  requireUuid(id, 'チェックリストID');
  const current = findById(next.checklists, id, 'チェックリスト');
  if (current.status === 'settled') fail('チェックリストは確定済みです');
  const timestamp = requireNow(now);
  const updated = { ...current, status: 'settled', settledAt: timestamp, notificationEnabled: false, updatedAt: timestamp };
  return { ...next, checklists: replaceById(next.checklists, id, updated) };
}

export function reopenChecklist(state, id, now) {
  const next = existingState(state);
  requireUuid(id, 'チェックリストID');
  const current = findById(next.checklists, id, 'チェックリスト');
  if (current.status !== 'settled') fail('進行中のチェックリストです');
  const updated = { ...current, status: 'active', settledAt: null, notificationEnabled: false, updatedAt: requireNow(now) };
  return { ...next, checklists: replaceById(next.checklists, id, updated) };
}

export function deleteChecklist(state, id) {
  const next = existingState(state);
  requireUuid(id, 'チェックリストID');
  findById(next.checklists, id, 'チェックリスト');
  return { ...next, checklists: next.checklists.filter((entry) => entry.id !== id) };
}

export function writeBack(state, checklistId, options, now) {
  const next = existingState(state);
  requireUuid(checklistId, 'チェックリストID');
  const list = findById(next.checklists, checklistId, 'チェックリスト');
  const value = requireObject(options, '書き戻し設定');
  if (value.mode !== 'overwrite' && value.mode !== 'new') fail('書き戻し方法が不正です');
  const timestamp = requireNow(now);
  const copyItems = () => list.items.map((item) => ({ id: freshId(), label: item.label, note: item.note }));
  if (value.mode === 'overwrite') {
    if (list.sourceTemplateId === null) fail('書き戻し元のテンプレートがありません');
    const source = findById(next.templates, list.sourceTemplateId, '書き戻し元のテンプレート');
    const updated = {
      ...source,
      status: source.status === 'archived' ? 'active' : source.status,
      items: copyItems(),
      updatedAt: timestamp,
    };
    return { ...next, templates: replaceById(next.templates, source.id, updated) };
  }
  const entityIds = new Set(next.templates.map((entry) => entry.id));
  const created = {
    id: freshId(entityIds),
    name: value.name === undefined ? list.title : requireText(value.name, 'テンプレート名'),
    status: 'active',
    defaultOrderLocked: list.orderLocked,
    items: copyItems(),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return { ...next, templates: [...next.templates, created] };
}

export function expiredChecklistIds(state, now) {
  const next = existingState(state);
  if (next.settings.completedRetention === 'keep') return [];
  const timestamp = Date.parse(requireNow(now));
  const days = Number.parseInt(next.settings.completedRetention, 10);
  const threshold = days * 86_400_000;
  return next.checklists
    .filter((entry) => entry.status === 'settled' && timestamp - Date.parse(entry.settledAt) >= threshold)
    .map((entry) => entry.id);
}

export function removeChecklists(state, ids) {
  const next = existingState(state);
  if (!Array.isArray(ids)) fail('削除対象が不正です');
  const selected = new Set();
  for (const id of ids) {
    requireUuid(id, 'チェックリストID');
    if (selected.has(id)) fail('削除対象が重複しています');
    const entry = findById(next.checklists, id, 'チェックリスト');
    if (entry.status !== 'settled') fail('進行中のチェックリストは自動整理できません');
    selected.add(id);
  }
  return { ...next, checklists: next.checklists.filter((entry) => !selected.has(entry.id)) };
}
