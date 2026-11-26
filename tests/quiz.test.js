const test = require('node:test');
const assert = require('node:assert/strict');
require('../quiz.js');
const Quiz = globalThis.Quiz;

const cards = [
  { id: '1', back: 'Olá' },
  { id: '2', back: 'Tchau' },
  { id: '3', back: 'Obrigado' },
  { id: '4', back: 'Por favor' },
  { id: '5', back: 'Bom dia' }
];
const rng = () => 0.5;

test('a API de Quiz expõe makeOptions', () => {
  assert.equal(typeof Quiz.makeOptions, 'function');
});

test('makeOptions gera 4 alternativas com a correta e mais 3 do mesmo deck', () => {
  const options = Quiz.makeOptions(cards, cards[0], 4, rng);
  assert.equal(options.length, 4);
  assert.equal(options.filter(o => o.correct).length, 1);
  assert.equal(options.find(o => o.correct).text, 'Olá');
  assert.equal(new Set(options.map(o => o.text)).size, 4);
});

test('makeOptions embaralha com o rng informado', () => {
  const a = Quiz.makeOptions(cards, cards[0], 4, () => 0.1).map(o => o.text);
  const b = Quiz.makeOptions(cards, cards[0], 4, () => 0.9).map(o => o.text);
  assert.notDeepEqual(a, b);
});

test('makeOptions usa no máximo as opções disponíveis e nunca repete texto', () => {
  const options = Quiz.makeOptions(cards.slice(0, 2), cards[0], 4, rng);
  assert.equal(options.length, 2);
  assert.equal(new Set(options.map(o => o.text)).size, 2);
});

test('makeOptions ignora o próprio cartão, vazios e duplicatas', () => {
  const source = [
    { id: '1', back: 'Olá' },
    { id: '1b', back: 'Olá' },
    { id: '2', back: ' Tchau ' },
    { id: '3', back: '' },
    { id: '4', back: null }
  ];
  const options = Quiz.makeOptions(source, source[0], 4, rng);
  assert.deepEqual(options.map(o => o.text).sort(), ['Olá', 'Tchau']);
});
