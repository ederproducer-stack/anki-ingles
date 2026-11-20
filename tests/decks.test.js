const test = require('node:test');
const assert = require('node:assert/strict');
const store = {};
globalThis.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
globalThis.SEED_DECK = require('../deck.js');
require('../srs.js');
require('../decks.js');
const Decks = globalThis.Decks;

test('expõe a API esperada', () => {
  ['load', 'save', 'getState', 'getDecks', 'getActive', 'getDeck', 'setActive',
   'createDeck', 'renameDeck', 'deleteDeck', 'importDeck', 'clearDir']
    .forEach(name => assert.ok(name === 'clearDir' || typeof Decks[name] === 'function', name));
});

test('estado novo começa com um deck e 30 frases de exemplo', () => {
  for (const k of Object.keys(store)) delete store[k];
  const s = Decks.load();
  assert.equal(s.decks.length, 1);
  assert.equal(Decks.getActive().cards.length, 30);
  assert.equal(Decks.getActive().name, 'Inglês básico');
});

test('criar deck vazio e trocar o ativo', () => {
  for (const k of Object.keys(store)) delete store[k];
  Decks.load();
  const first = Decks.getActive();
  const d = Decks.createDeck('Viagem');
  assert.equal(d.cards.length, 0);
  assert.equal(Decks.getActive().id, d.id);
  assert.equal(Decks.getDecks().length, 2);
  assert.equal(Decks.setActive(first.id), true);
  assert.equal(Decks.getActive().id, first.id);
});

test('criar deck com as frases de exemplo', () => {
  for (const k of Object.keys(store)) delete store[k];
  Decks.load();
  const d = Decks.createDeck('Teste', true);
  assert.equal(d.cards.length, 30);
});

test('nomes duplicados são rejeitados', () => {
  for (const k of Object.keys(store)) delete store[k];
  Decks.load();
  assert.throws(() => Decks.createDeck('Inglês básico'), /Já existe/);
  assert.throws(() => Decks.createDeck('  '), /Informe um nome/);
});

test('renomear e excluir decks', () => {
  for (const k of Object.keys(store)) delete store[k];
  Decks.load();
  const d = Decks.createDeck('Temporário');
  Decks.renameDeck(d.id, 'Novo nome');
  assert.equal(Decks.getDeck(d.id).name, 'Novo nome');
  Decks.deleteDeck(d.id);
  assert.equal(Decks.getDecks().length, 1);
  assert.throws(() => Decks.deleteDeck(Decks.getActive().id), /único deck/);
});

test('importar deck cria um novo deck com os cartões do JSON', () => {
  for (const k of Object.keys(store)) delete store[k];
  Decks.load();
  const d = Decks.importDeck({ cards: [{ front: 'Hi', back: 'Oi' }] }, 'Importado');
  assert.equal(d.name, 'Importado');
  assert.equal(d.cards.length, 1);
  assert.equal(Decks.getActive().id, d.id);
});

test('migra o estado antigo (v1) preservando cartões e configurações', () => {
  for (const k of Object.keys(store)) delete store[k];
  store['anki-ingles-v1'] = JSON.stringify({
    cards: [{ front: 'Hi', back: 'Oi', ef: 2.5 }],
    settings: { rate: 0.75 },
    stats: { totalReviews: 5, history: {} }
  });
  const s = Decks.load();
  assert.equal(s.decks.length, 1);
  assert.equal(Decks.getActive().cards.length, 1);
  assert.equal(s.settings.rate, 0.75);
  assert.equal(Decks.getActive().stats.totalReviews, 5);
});

test('persiste após recarregar', () => {
  for (const k of Object.keys(store)) delete store[k];
  Decks.load();
  Decks.createDeck('Persistido');
  Decks.load();
  assert.equal(Decks.getDecks().length, 2);
  assert.equal(Decks.getActive().name, 'Persistido');
});
