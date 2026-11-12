import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHARACTERS, THRESHOLDS, describeGrowth } from '../src/growth.mjs';
import { nextState } from '../src/state.mjs';
import { expSince } from '../src/stats.mjs';

test('しきい値ちょうどで次の姿になる', () => {
  assert.equal(describeGrowth('turnip', 49).stage, 0);
  assert.equal(describeGrowth('turnip', 50).stage, 1);
  assert.equal(describeGrowth('turnip', 1000).stage, 4);
});

test('Lv は 20 EXP ごとに上がり、1 から始まる', () => {
  assert.equal(describeGrowth('cactus', 0).level, 1);
  assert.equal(describeGrowth('cactus', 19).level, 1);
  assert.equal(describeGrowth('cactus', 20).level, 2);
});

test('次の姿までの残りを返し、最終形では null になる', () => {
  const growing = describeGrowth('sunflower', 386);
  assert.equal(growing.formName, 'つぼみ');
  assert.equal(growing.nextForm, 'ヒマワリ');
  assert.equal(growing.toNext, 114);
  assert.equal(describeGrowth('sunflower', 5000).nextForm, null);
});

test('キャラクターの名前は言語ごとにあり、成長の段階と同じ数だけある', () => {
  for (const { en, ja } of Object.values(CHARACTERS)) {
    assert.equal(en.forms.length, THRESHOLDS.length);
    assert.equal(ja.forms.length, THRESHOLDS.length);
    for (const name of [en.label, ...en.forms]) assert.match(name, /^[A-Za-z ]+$/);
    for (const name of [ja.label, ...ja.forms]) assert.match(name, /^[\u3040-\u30FF]+$/);
  }
});

test('姿の名前は指定した言語で返し、既定は日本語になる', () => {
  assert.equal(describeGrowth('sunflower', 386, 'en').formName, 'Bud');
  assert.equal(describeGrowth('sunflower', 386, 'en').nextForm, 'Sunflower');
  assert.equal(describeGrowth('sunflower', 386).formName, 'つぼみ');
});

test('Object の組み込みの名前はキャラクターとして扱わない', () => {
  assert.throws(() => describeGrowth('constructor', 0), /unknown character/);
});

test('変えた日に活動があっても EXP は 0 から始まり、翌日の活動から増える', () => {
  const previous = { version: 1, character: 'turnip', since: '2026-05-01', maxExp: 0 };
  const { since } = nextState(previous, 'cactus', '2026-11-08');
  assert.equal(expSince([{ date: '2026-11-08', count: 60 }], since), 0);
  assert.equal(expSince([{ date: '2026-11-08', count: 60 }, { date: '2026-11-09', count: 3 }], since), 3);
});

test('同じ日に元のキャラクターへ戻しても、前の成長は引き継がない', () => {
  const previous = { version: 1, character: 'turnip', since: '2026-05-01', maxExp: 0 };
  const changed = nextState(previous, 'cactus', '2026-11-08');
  assert.equal(nextState(changed, 'turnip', '2026-11-08').since, '2026-11-09');
});
