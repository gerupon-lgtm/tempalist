import { describe, expect, test } from 'vitest';

import {
  createChecklist,
  createTemplate,
  deleteChecklist,
  deleteTemplate,
  duplicateTemplate,
  emptyState,
  expiredChecklistIds,
  removeChecklists,
  reorderItems,
  reopenChecklist,
  settleChecklist,
  toggleItem,
  updateChecklist,
  updateTemplate,
  validateState,
  writeBack,
} from '../src/domain.js';

const NOW = '2026-09-09T03:04:05.000Z';
const LATER = '2026-09-10T03:04:05.000Z';
const TEMPLATE_ID = '11111111-1111-4111-8111-111111111111';
const TEMPLATE_ITEM_ID = '22222222-2222-4222-8222-222222222222';
const CHECKLIST_ID = '33333333-3333-4333-8333-333333333333';
const CHECKLIST_ITEM_ID = '44444444-4444-4444-8444-444444444444';

function template(overrides = {}) {
  return {
    id: TEMPLATE_ID,
    name: '出発準備',
    status: 'active',
    items: [{ id: TEMPLATE_ITEM_ID, label: '財布', note: '現金も確認' }],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function checklist(overrides = {}) {
  return {
    id: CHECKLIST_ID,
    title: '旅行',
    sourceTemplateId: TEMPLATE_ID,
    items: [{ id: CHECKLIST_ITEM_ID, label: '財布', note: '', checked: false }],
    dueAt: '2026-09-12T00:00:00.000Z',
    dueHasTime: false,
    notificationEnabled: false,
    offsets: ['-24h', '-1h'],
    status: 'active',
    settledAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function populatedState(overrides = {}) {
  return {
    schemaVersion: 1,
    revision: 7,
    templates: [template()],
    checklists: [checklist()],
    settings: { completedRetention: '90d' },
    ...overrides,
  };
}

describe('state validation', () => {
  test('emptyState returns the documented independent default state', () => {
    const first = emptyState();
    const second = emptyState();

    expect(first).toEqual({
      schemaVersion: 1,
      revision: 0,
      templates: [],
      checklists: [],
      settings: { completedRetention: '90d' },
    });
    first.settings.completedRetention = 'keep';
    expect(second.settings.completedRetention).toBe('90d');
  });

  test('validateState sanitizes unknown fields and defaults optional notes', () => {
    const input = populatedState({ ignored: 'drop me' });
    delete input.templates[0].items[0].note;
    delete input.checklists[0].items[0].note;
    input.templates[0].ignored = true;

    const result = validateState(input);

    const expected = populatedState();
    expected.templates[0].items[0].note = '';
    expect(result).toEqual(expected);
    expect(result).not.toBe(input);
    expect(result.templates[0]).not.toBe(input.templates[0]);
  });

  test.each([
    ['unknown schema', { ...populatedState(), schemaVersion: 2 }],
    ['noninteger revision', { ...populatedState(), revision: 1.5 }],
    ['invalid template status', populatedState({ templates: [template({ status: 'deleted' })] })],
    ['empty template name', populatedState({ templates: [template({ name: '   ' })] })],
    ['invalid template timestamp', populatedState({ templates: [template({ updatedAt: 'today' })] })],
    ['duplicate template IDs', populatedState({ templates: [template(), template()] })],
    ['duplicate template item IDs', populatedState({ templates: [template({ items: [template().items[0], template().items[0]] })] })],
    ['empty item label', populatedState({ templates: [template({ items: [{ id: TEMPLATE_ITEM_ID, label: '' }] })] })],
    ['invalid checklist status', populatedState({ checklists: [checklist({ status: 'done' })] })],
    ['invalid source UUID', populatedState({ checklists: [checklist({ sourceTemplateId: 'missing' })] })],
    ['nonboolean checked', populatedState({ checklists: [checklist({ items: [{ ...checklist().items[0], checked: 1 }] })] })],
    ['non-Z deadline', populatedState({ checklists: [checklist({ dueAt: '2026-09-12T09:00:00+09:00' })] })],
    ['settled without timestamp', populatedState({ checklists: [checklist({ status: 'settled' })] })],
    ['active with settled timestamp', populatedState({ checklists: [checklist({ settledAt: NOW })] })],
    ['unsupported retention', populatedState({ settings: { completedRetention: 'forever' } })],
  ])('rejects %s', (_label, input) => {
    expect(() => validateState(input)).toThrow(Error);
  });
});

describe('template operations', () => {
  test('createTemplate appends a timestamped template with fresh item IDs without mutating input', () => {
    const state = emptyState();
    const result = createTemplate(state, {
      name: '買い物',
      status: 'draft',
      items: [{ label: '牛乳' }, { label: 'パン', note: '全粒粉' }],
    }, NOW);

    expect(state.templates).toEqual([]);
    expect(result.revision).toBe(0);
    expect(result.templates[0]).toMatchObject({
      name: '買い物', status: 'draft', createdAt: NOW, updatedAt: NOW,
    });
    expect(result.templates[0].items.map(({ label, note }) => ({ label, note }))).toEqual([
      { label: '牛乳', note: '' },
      { label: 'パン', note: '全粒粉' },
    ]);
    expect(new Set(result.templates[0].items.map((item) => item.id)).size).toBe(2);
    expect(result.templates[0].items.every((item) => /^[0-9a-f-]{36}$/i.test(item.id))).toBe(true);
  });

  test('createTemplate permits an empty item array and defaults to active', () => {
    const result = createTemplate(emptyState(), { name: '空', items: [] }, NOW);
    expect(result.templates[0]).toMatchObject({ name: '空', status: 'active', items: [] });
  });

  test('updateTemplate preserves supplied IDs, generates missing IDs, and updates every status', () => {
    const state = populatedState({ templates: [template({ status: 'archived' })] });
    const result = updateTemplate(state, TEMPLATE_ID, {
      name: '更新',
      status: 'draft',
      items: [
        { id: TEMPLATE_ITEM_ID, label: '財布', note: '更新済み' },
        { label: '鍵' },
      ],
    }, LATER);

    expect(result.templates[0].items[0].id).toBe(TEMPLATE_ITEM_ID);
    expect(result.templates[0].items[1].id).not.toBe(TEMPLATE_ITEM_ID);
    expect(result.templates[0]).toMatchObject({ name: '更新', status: 'draft', createdAt: NOW, updatedAt: LATER });
    expect(state.templates[0].name).toBe('出発準備');
  });

  test('duplicateTemplate clones independent items and keeps status', () => {
    const state = populatedState({ templates: [template({ status: 'draft' })] });
    const result = duplicateTemplate(state, TEMPLATE_ID, LATER);
    const copy = result.templates[1];

    expect(copy).toMatchObject({ name: '出発準備 のコピー', status: 'draft', createdAt: LATER, updatedAt: LATER });
    expect(copy.id).not.toBe(TEMPLATE_ID);
    expect(copy.items[0]).toMatchObject({ label: '財布', note: '現金も確認' });
    expect(copy.items[0].id).not.toBe(TEMPLATE_ITEM_ID);
    expect(state.templates).toHaveLength(1);
  });

  test('deleteTemplate leaves the checklist source reference dangling', () => {
    const result = deleteTemplate(populatedState(), TEMPLATE_ID);
    expect(result.templates).toEqual([]);
    expect(result.checklists[0].sourceTemplateId).toBe(TEMPLATE_ID);
  });
});

describe('checklist operations', () => {
  test('createChecklist copies only an active template into independent unchecked items', () => {
    const state = populatedState({ checklists: [] });
    const result = createChecklist(state, {
      title: '明日の準備', sourceTemplateId: TEMPLATE_ID, dueAt: null, dueHasTime: false,
    }, LATER);
    const created = result.checklists[0];

    expect(created).toMatchObject({
      title: '明日の準備', sourceTemplateId: TEMPLATE_ID, dueAt: null, dueHasTime: false,
      notificationEnabled: false, offsets: ['-24h', '-1h'], status: 'active', settledAt: null,
      createdAt: LATER, updatedAt: LATER,
    });
    expect(created.items[0]).toMatchObject({ label: '財布', note: '現金も確認', checked: false });
    expect(created.items[0].id).not.toBe(TEMPLATE_ITEM_ID);
    expect(state.checklists).toEqual([]);
  });

  test('createChecklist can start empty and rejects missing or inactive sources', () => {
    expect(createChecklist(emptyState(), { title: '自由入力' }, NOW).checklists[0].items).toEqual([]);
    expect(() => createChecklist(emptyState(), { title: '不明', sourceTemplateId: TEMPLATE_ID }, NOW)).toThrow(Error);
    const archived = populatedState({ templates: [template({ status: 'archived' })], checklists: [] });
    expect(() => createChecklist(archived, { title: '不可', sourceTemplateId: TEMPLATE_ID }, NOW)).toThrow(Error);
  });

  test('updateChecklist patches allowed fields, preserves supplied IDs, and generates new IDs', () => {
    const state = populatedState();
    const result = updateChecklist(state, CHECKLIST_ID, {
      title: '更新した旅行',
      dueAt: null,
      dueHasTime: false,
      offsets: ['-1h'],
      items: [
        { id: CHECKLIST_ITEM_ID, label: '財布', checked: true },
        { label: '鍵' },
      ],
    }, LATER);

    expect(result.checklists[0].items[0]).toEqual({ id: CHECKLIST_ITEM_ID, label: '財布', note: '', checked: true });
    expect(result.checklists[0].items[1]).toMatchObject({ label: '鍵', note: '', checked: false });
    expect(result.checklists[0].items[1].id).not.toBe(CHECKLIST_ITEM_ID);
    expect(result.checklists[0]).toMatchObject({ title: '更新した旅行', dueAt: null, offsets: ['-1h'], updatedAt: LATER });
    expect(state.checklists[0].title).toBe('旅行');
  });

  test('updateChecklist rejects notification or status fields and all edits to settled lists', () => {
    expect(() => updateChecklist(populatedState(), CHECKLIST_ID, { status: 'settled' }, NOW)).toThrow(Error);
    expect(() => updateChecklist(populatedState(), CHECKLIST_ID, { notificationEnabled: true }, NOW)).toThrow(Error);
    const settled = populatedState({ checklists: [checklist({ status: 'settled', settledAt: NOW })] });
    expect(() => updateChecklist(settled, CHECKLIST_ID, { title: '不可' }, LATER)).toThrow(Error);
  });

  test('toggleItem toggles an active item without automatically settling the checklist', () => {
    const state = populatedState();
    const result = toggleItem(state, CHECKLIST_ID, CHECKLIST_ITEM_ID, LATER);
    expect(result.checklists[0]).toMatchObject({ status: 'active', settledAt: null, updatedAt: LATER });
    expect(result.checklists[0].items[0].checked).toBe(true);
    expect(state.checklists[0].items[0].checked).toBe(false);
  });

  test('toggleItem rejects settled lists and missing items', () => {
    const settled = populatedState({ checklists: [checklist({ status: 'settled', settledAt: NOW })] });
    expect(() => toggleItem(settled, CHECKLIST_ID, CHECKLIST_ITEM_ID, LATER)).toThrow(Error);
    expect(() => toggleItem(populatedState(), CHECKLIST_ID, TEMPLATE_ITEM_ID, LATER)).toThrow(Error);
  });

  test.each(['template', 'checklist'])('reorderItems moves %s items and preserves their IDs', (kind) => {
    const secondId = '55555555-5555-4555-8555-555555555555';
    const state = kind === 'template'
      ? populatedState({ templates: [template({ items: [template().items[0], { id: secondId, label: '鍵', note: '' }] })] })
      : populatedState({ checklists: [checklist({ items: [checklist().items[0], { id: secondId, label: '鍵', note: '', checked: true }] })] });
    const result = reorderItems(state, kind, kind === 'template' ? TEMPLATE_ID : CHECKLIST_ID, 0, 1, LATER);
    const entity = kind === 'template' ? result.templates[0] : result.checklists[0];
    expect(entity.items.map((item) => item.id)).toEqual([secondId, kind === 'template' ? TEMPLATE_ITEM_ID : CHECKLIST_ITEM_ID]);
    expect(entity.updatedAt).toBe(LATER);
  });

  test('reorderItems rejects invalid indices and settled checklists', () => {
    expect(() => reorderItems(populatedState(), 'checklist', CHECKLIST_ID, -1, 0, NOW)).toThrow(Error);
    expect(() => reorderItems(populatedState(), 'template', TEMPLATE_ID, 0, 2, NOW)).toThrow(Error);
    expect(() => reorderItems(populatedState(), 'other', TEMPLATE_ID, 0, 0, NOW)).toThrow(Error);
    const settled = populatedState({ checklists: [checklist({ status: 'settled', settledAt: NOW })] });
    expect(() => reorderItems(settled, 'checklist', CHECKLIST_ID, 0, 0, LATER)).toThrow(Error);
  });

  test('settle and reopen control editing state without requiring or changing checks', () => {
    const settled = settleChecklist(populatedState(), CHECKLIST_ID, LATER);
    expect(settled.checklists[0]).toMatchObject({ status: 'settled', settledAt: LATER, notificationEnabled: false, updatedAt: LATER });
    expect(settled.checklists[0].items[0].checked).toBe(false);
    expect(() => settleChecklist(settled, CHECKLIST_ID, LATER)).toThrow(Error);

    const reopened = reopenChecklist(settled, CHECKLIST_ID, '2026-09-11T03:04:05.000Z');
    expect(reopened.checklists[0]).toMatchObject({ status: 'active', settledAt: null, notificationEnabled: false });
    expect(reopened.checklists[0].items[0].checked).toBe(false);
    const resettled = settleChecklist(reopened, CHECKLIST_ID, '2026-09-12T03:04:05.000Z');
    expect(resettled.checklists[0].settledAt).toBe('2026-09-12T03:04:05.000Z');
  });

  test('deleteChecklist manually removes active or settled lists', () => {
    expect(deleteChecklist(populatedState(), CHECKLIST_ID).checklists).toEqual([]);
    const settled = populatedState({ checklists: [checklist({ status: 'settled', settledAt: NOW })] });
    expect(deleteChecklist(settled, CHECKLIST_ID).checklists).toEqual([]);
  });
});

describe('writeback and retention', () => {
  test.each([
    ['draft', 'draft'],
    ['active', 'active'],
    ['archived', 'active'],
  ])('overwrite writeBack maps %s source status to %s and copies only ordered content', (before, after) => {
    const source = template({ status: before });
    const list = checklist({ items: [
      { id: CHECKLIST_ITEM_ID, label: '先', note: 'a', checked: true },
      { id: '55555555-5555-4555-8555-555555555555', label: '後', note: 'b', checked: false },
    ] });
    const result = writeBack(populatedState({ templates: [source], checklists: [list] }), CHECKLIST_ID, { mode: 'overwrite' }, LATER);
    const updated = result.templates[0];

    expect(updated.status).toBe(after);
    expect(updated.name).toBe('出発準備');
    expect(updated.items.map(({ label, note }) => ({ label, note }))).toEqual([
      { label: '先', note: 'a' }, { label: '後', note: 'b' },
    ]);
    expect(updated.items.every((item) => item.id !== CHECKLIST_ITEM_ID)).toBe(true);
    expect(result.checklists[0]).toEqual(list);
  });

  test('new writeBack creates an active template with supplied name or checklist title', () => {
    const state = populatedState({ templates: [] });
    const named = writeBack(state, CHECKLIST_ID, { mode: 'new', name: '再利用' }, LATER);
    expect(named.templates[0]).toMatchObject({ name: '再利用', status: 'active' });
    const defaulted = writeBack(state, CHECKLIST_ID, { mode: 'new' }, LATER);
    expect(defaulted.templates[0].name).toBe('旅行');
  });

  test('overwrite writeBack rejects a missing source', () => {
    const state = populatedState({ templates: [] });
    expect(() => writeBack(state, CHECKLIST_ID, { mode: 'overwrite' }, LATER)).toThrow(Error);
  });

  test('expiredChecklistIds uses the settled timestamp and includes the exact retention boundary', () => {
    const oldId = '66666666-6666-4666-8666-666666666666';
    const activeId = '77777777-7777-4777-8777-777777777777';
    const state = populatedState({
      settings: { completedRetention: '30d' },
      checklists: [
        checklist({ status: 'settled', settledAt: '2026-08-10T00:00:00.000Z' }),
        checklist({ id: oldId, status: 'settled', settledAt: '2026-08-10T00:00:00.001Z' }),
        checklist({ id: activeId, status: 'active', settledAt: null, createdAt: '2020-01-01T00:00:00.000Z' }),
      ],
    });
    expect(expiredChecklistIds(state, '2026-09-09T00:00:00.000Z')).toEqual([CHECKLIST_ID]);
    expect(expiredChecklistIds({ ...state, settings: { completedRetention: 'keep' } }, '2099-01-01T00:00:00.000Z')).toEqual([]);
  });

  test('removeChecklists removes exactly selected settled lists and rejects active IDs', () => {
    const secondId = '66666666-6666-4666-8666-666666666666';
    const state = populatedState({ checklists: [
      checklist({ status: 'settled', settledAt: NOW }),
      checklist({ id: secondId, status: 'settled', settledAt: NOW }),
    ] });
    expect(removeChecklists(state, [secondId]).checklists.map((entry) => entry.id)).toEqual([CHECKLIST_ID]);
    expect(() => removeChecklists(populatedState(), [CHECKLIST_ID])).toThrow(Error);
  });
});
