const test = require('node:test');
const assert = require('node:assert/strict');
require('../importtext.js');
const ImportText = globalThis.ImportText;

test('a API expõe parse, clean e splitLine', () => {
  ['parse', 'clean', 'splitLine'].forEach(name => assert.equal(typeof ImportText[name], 'function'));
});

test('parse aceita vários separadores de uma vez', () => {
  const text = [
    'How are you? :: Como vai?',
    'I am fine\tEstou bem',
    'Thank you - Obrigado',
    'Good morning → Bom dia',
    'See you later | Até logo',
    'Please help me = Por favor, me ajude',
    'Take care : Cuide-se',
    'No problem; Sem problema',
    'Well done — Muito bem'
  ].join('\n');
  const out = ImportText.parse(text);
  assert.equal(out.cards.length, 9);
  assert.deepEqual(out.cards[0], { front: 'How are you?', back: 'Como vai?' });
  assert.deepEqual(out.cards[1], { front: 'I am fine', back: 'Estou bem' });
});

test('parse ignora marcadores de lista, numeração, aspas e comentários', () => {
  const text = [
    '# minhas frases',
    '- "Hello" :: "Olá"',
    '2) Good night — Boa noite',
    '• Sorry — Desculpe'
  ].join('\n');
  const out = ImportText.parse(text);
  assert.deepEqual(out.cards, [
    { front: 'Hello', back: 'Olá' },
    { front: 'Good night', back: 'Boa noite' },
    { front: 'Sorry', back: 'Desculpe' }
  ]);
});

test('parse reconhece e corrige ordem português -> inglês', () => {
  const out = ImportText.parse('Você está bem? :: Are you okay?');
  assert.deepEqual(out.cards, [{ front: 'Are you okay?', back: 'Você está bem?' }]);
});

test('parse emparelha linhas consecutivas sem separador', () => {
  const out = ImportText.parse('How are you?\nComo vai?\nI am fine\nEstou bem');
  assert.deepEqual(out.cards, [
    { front: 'How are you?', back: 'Como vai?' },
    { front: 'I am fine', back: 'Estou bem' }
  ]);
});

test('parse reporta linhas que não deu para usar', () => {
  const out = ImportText.parse('Hello :: Olá\n\nBye\n~linha solta~');
  assert.deepEqual(out.cards, [{ front: 'Hello', back: 'Olá' }]);
  assert.deepEqual(out.skipped, ['Bye', '~linha solta~']);
});

test('parse remove duplicatas mantendo a primeira ocorrência', () => {
  const out = ImportText.parse('Hello :: Olá\nhello :: Oi\nBye :: Tchau');
  assert.deepEqual(out.cards, [
    { front: 'Hello', back: 'Olá' },
    { front: 'Bye', back: 'Tchau' }
  ]);
});

test('parse lida com texto vazio', () => {
  assert.deepEqual(ImportText.parse(''), { cards: [], skipped: [] });
});
