const test = require('node:test');
const assert = require('node:assert/strict');
require('../backup.js');
const Backup = globalThis.Backup;

const valid = JSON.stringify({
  app: 'anki-ingles',
  version: 2,
  cards: [{ id: '1', front: 'Hello', back: 'Olá', reps: 1, ef: 2.5 }],
  settings: { autoplay: false, autoBackup: true },
  stats: { totalReviews: 3, history: {} }
});

test('a API de backup expõe as funções esperadas', () => {
  ['isSupported', 'init', 'chooseFolder', 'saveNow', 'onChange', 'readFromFolder', 'parse', 'download', 'getStatus']
    .forEach(name => assert.equal(typeof Backup[name], 'function', name));
});

test('parse aceita um backup válido', () => {
  const data = Backup.parse(valid);
  assert.equal(data.cards.length, 1);
  assert.equal(data.cards[0].front, 'Hello');
  assert.equal(data.settings.autoplay, false);
  assert.equal(data.stats.totalReviews, 3);
});

test('parse rejeita JSON inválido', () => {
  assert.throws(() => Backup.parse('texto qualquer'), /JSON válido/);
});

test('parse rejeita arquivo sem cartões', () => {
  assert.throws(() => Backup.parse('{"foo":1}'), /inválido/);
  assert.throws(() => Backup.parse('{"cards":[]}'), /Nenhum cartão válido/);
});

test('audioFileName é estável, seguro e único por frase', () => {
  const a = Backup.audioFileName('Could you give me a hand with this?');
  const b = Backup.audioFileName('Could you give me a hand with this?');
  const c = Backup.audioFileName('Could you give me a hand with this!');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[a-z0-9_]+_[0-9a-z]+\.mp3$/);
  assert.equal(Backup.audioFileName('Ação éação!'), Backup.audioFileName('Ação éação!'));
});

test('parse ignora cartões malformados', () => {
  const data = Backup.parse(JSON.stringify({
    cards: [{ front: 'Ok', back: 'Certo' }, null, { front: 'Sem verso' }, { back: 'Sem frente' }]
  }));
  assert.equal(data.cards.length, 1);
  assert.equal(data.cards[0].front, 'Ok');
  assert.deepEqual(data.settings, {});
});
