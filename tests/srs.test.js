const test = require('node:test');
const assert = require('node:assert/strict');
const SRS = require('../srs.js');

const NOW = new Date('2026-11-20T12:00:00Z').getTime();
const DAY = SRS.DAY;

test('cartão novo nasce disponível, com ef 2.5 e sem repetições', () => {
  const c = SRS.newCard('id', 'Hello', 'Olá');
  assert.equal(c.due, c.created);
  assert.equal(c.ef, 2.5);
  assert.equal(c.reps, 0);
  assert.equal(c.interval, 0);
});

test('Bom segue a sequência 1 dia → 6 dias → intervalo × facilidade', () => {
  let c = SRS.newCard('id', 'Hi', 'Oi');
  c = SRS.schedule(c, 'good', NOW).card;
  assert.equal(c.interval, 1);
  assert.equal(c.due, NOW + 1 * DAY);
  assert.equal(c.reps, 1);

  c = SRS.schedule(c, 'good', NOW).card;
  assert.equal(c.interval, 6);
  assert.equal(c.reps, 2);

  c = SRS.schedule(c, 'good', NOW).card;
  assert.equal(c.interval, 15); // 6 * 2.5
  assert.equal(c.reps, 3);
});

test('De novo zera as repetições, contabiliza lapse e volta para a fila', () => {
  let c = SRS.newCard('id', 'Hi', 'Oi');
  c = SRS.schedule(c, 'good', NOW).card;
  const result = SRS.schedule(c, 'again', NOW);
  assert.equal(result.requeue, true);
  assert.equal(result.card.reps, 0);
  assert.equal(result.card.interval, 0);
  assert.equal(result.card.lapses, 1);
  assert.equal(result.card.due, NOW + SRS.MINUTE);
  assert.ok(result.card.ef < 2.5);
});

test('Difícil avança pouco e reduz a facilidade', () => {
  let c = SRS.newCard('id', 'Hi', 'Oi');
  c = SRS.schedule(c, 'good', NOW).card;
  const r = SRS.schedule(c, 'hard', NOW);
  assert.equal(r.requeue, false);
  assert.equal(r.card.interval, 1);
  assert.ok(r.card.ef < 2.5);
});

test('Fácil dá um salto maior e aumenta a facilidade', () => {
  const c = SRS.newCard('id', 'Hi', 'Oi');
  const r = SRS.schedule(c, 'easy', NOW);
  assert.equal(r.card.interval, 4);
  assert.equal(r.card.reps, 1);
  assert.equal(r.card.ef, 2.65);
});

test('a facilidade nunca desce abaixo de 1.3', () => {
  let c = SRS.newCard('id', 'Hi', 'Oi');
  c.ef = 1.3;
  for (let i = 0; i < 20; i++) c = SRS.schedule(c, 'again', NOW).card;
  assert.equal(c.ef, 1.3);
});

test('avaliação inválida lança erro', () => {
  assert.throws(() => SRS.schedule(SRS.newCard('id', 'a', 'b'), '???', NOW), /Avaliação inválida/);
});

test('formatInterval gera rótulos legíveis', () => {
  let c = SRS.newCard('id', 'Hi', 'Oi');
  assert.equal(SRS.formatInterval(c, 'again'), '1 min');
  assert.equal(SRS.formatInterval(c, 'good'), '1 dia');

  c = SRS.schedule(c, 'good', NOW).card; // 1 dia
  c = SRS.schedule(c, 'good', NOW).card; // 6 dias
  c = SRS.schedule(c, 'good', NOW).card; // 15 dias
  assert.equal(c.interval, 15);
  assert.equal(SRS.formatInterval(c, 'good'), '1 mês'); // 15 * 2.5 = 38 dias
  assert.equal(SRS.formatInterval({ interval: 90, reps: 3, ef: 2.5 }, 'good'), '8 meses');
});
