const test = require('node:test');
const assert = require('node:assert/strict');
require('../csv.js');
const CSV = globalThis.CSV;

test('a API de CSV expõe as funções esperadas', () => {
  ['toCSV', 'parse'].forEach(name => assert.equal(typeof CSV[name], 'function', name));
});

test('parse lê CSV com cabeçalho e vírgula', () => {
  const cards = CSV.parse('front,back,notes\nHello,Olá,teste\nBye,Tchau,');
  assert.equal(cards.length, 2);
  assert.deepEqual(cards[0], { front: 'Hello', back: 'Olá', notes: 'teste' });
  assert.deepEqual(cards[1], { front: 'Bye', back: 'Tchau', notes: '' });
});

test('parse aceita cabeçalho em português e delimitador ponto e vírgula', () => {
  const cards = CSV.parse('Inglês;Português;Notas\nCould you help me?;Você pode me ajudar?;viagem');
  assert.deepEqual(cards[0], {
    front: 'Could you help me?', back: 'Você pode me ajudar?', notes: 'viagem'
  });
});

test('parse aceita delimitador tab e BOM no início do arquivo', () => {
  const cards = CSV.parse('\uFEFFfront\tback\nHi\tOi');
  assert.deepEqual(cards, [{ front: 'Hi', back: 'Oi', notes: '' }]);
});

test('parse sem cabeçalho usa as duas primeiras colunas como frente e verso', () => {
  const cards = CSV.parse('Hello,Olá\nBye,Tchau');
  assert.deepEqual(cards, [
    { front: 'Hello', back: 'Olá', notes: '' },
    { front: 'Bye', back: 'Tchau', notes: '' }
  ]);
});

test('parse lê campos aspados com vírgula, quebra de linha e aspas escapadas', () => {
  const csv = 'front,back,notes\n"Say ""hello"", please","Diga ""olá"", por favor","linha 1\nlinha 2"';
  const cards = CSV.parse(csv);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].front, 'Say "hello", please');
  assert.equal(cards[0].back, 'Diga "olá", por favor');
  assert.equal(cards[0].notes, 'linha 1\nlinha 2');
});

test('parse ignora linhas vazias e cartões incompletos', () => {
  const cards = CSV.parse('front,back\nHello,Olá\n\n,Sem frente\nSem verso,\nBye,Tchau\n');
  assert.deepEqual(cards, [
    { front: 'Hello', back: 'Olá', notes: '' },
    { front: 'Bye', back: 'Tchau', notes: '' }
  ]);
});

test('parse rejeita aspas não fechadas', () => {
  assert.throws(() => CSV.parse('front,back\n"Hello,Olá'), /aspas não fechadas/);
});

test('parse rejeita cabeçalho sem colunas de frente e verso', () => {
  assert.throws(() => CSV.parse('nome,idade\nJoão,30'), /frente|verso|front|back/i);
});

test('parse retorna [] para arquivo vazio', () => {
  assert.deepEqual(CSV.parse(''), []);
  assert.deepEqual(CSV.parse('\n\n'), []);
});

test('toCSV gera cabeçalho, BOM, CRLF e escapa campos', () => {
  const out = CSV.toCSV([
    { front: 'Say "hi", please', back: 'Diga "oi"', notes: 'linha 1\nlinha 2' }
  ]);
  assert.ok(out.startsWith('\uFEFFfront,back,notes\r\n'));
  assert.ok(out.includes('"Say ""hi"", please","Diga ""oi""","linha 1\nlinha 2"'));
  assert.ok(out.endsWith('\r\n'));
});

test('round trip preserva frente, verso e notas', () => {
  const original = [
    { front: 'Hello, world', back: 'Olá, mundo', notes: 'com "aspas" e, vírgula' },
    { front: 'How are you?', back: 'Como você está?', notes: '' }
  ];
  assert.deepEqual(CSV.parse(CSV.toCSV(original)), original);
});
