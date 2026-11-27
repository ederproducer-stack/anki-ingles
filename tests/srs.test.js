const test = require('node:test');
const assert = require('node:assert/strict');
const SRS = require('../srs.js');

const NOW = new Date('2026-11-20T12:00:00Z').getTime();
const DAY = SRS.DAY;
const inicioDoDia = ts => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };

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
  assert.equal(c.due, inicioDoDia(NOW) + 1 * DAY);
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

test('Difícil avança pouco, reduz a facilidade e conta como revisão', () => {
  let c = SRS.newCard('id', 'Hi', 'Oi');
  c = SRS.schedule(c, 'good', NOW).card;
  const r = SRS.schedule(c, 'hard', NOW);
  assert.equal(r.requeue, false);
  assert.equal(r.card.interval, 1);
  assert.ok(r.card.ef < 2.5);
  assert.equal(r.card.reps, 2, 'Difícil deve incrementar reps');
});

test('cartão marcado como Difícil sai da fase inicial no próximo Bom', () => {
  let c = SRS.newCard('id', 'Hi', 'Oi');
  c = SRS.schedule(c, 'hard', NOW).card;      // novo -> difícil
  assert.equal(c.reps, 1);
  c = SRS.schedule(c, 'good', NOW).card;      // próximo Bom
  assert.equal(c.interval, 6, 'Bom após Difícil deve ir para 6 dias, não repetir 1 dia');
});

test('Fácil dá um salto maior e aumenta a facilidade', () => {
  const c = SRS.newCard('id', 'Hi', 'Oi');
  const r = SRS.schedule(c, 'easy', NOW);
  assert.equal(r.card.interval, 4);
  assert.equal(r.card.reps, 1);
  assert.equal(r.card.ef, 2.65);
});

test('Fácil sempre resulta em intervalo maior que Bom', () => {
  // Estados: novo, após 1 Bom, após 2 Boms, após 3 Boms.
  const estados = [
    SRS.newCard('id', 'Hi', 'Oi'),
    SRS.schedule(SRS.newCard('id', 'Hi', 'Oi'), 'good', NOW).card,
    (() => { let c = SRS.newCard('id', 'Hi', 'Oi'); c = SRS.schedule(c, 'good', NOW).card; return SRS.schedule(c, 'good', NOW).card; })(),
    (() => { let c = SRS.newCard('id', 'Hi', 'Oi'); for (let i = 0; i < 3; i++) c = SRS.schedule(c, 'good', NOW).card; return c; })()
  ];
  estados.forEach((card, i) => {
    const bom = SRS.schedule(card, 'good', NOW).card.interval;
    const facil = SRS.schedule(card, 'easy', NOW).card.interval;
    assert.ok(facil >= bom, `estado ${i}: fácil (${facil}) não pode ser menor que bom (${bom})`);
  });
});

test('a facilidade nunca desce abaixo de 1.3', () => {
  let c = SRS.newCard('id', 'Hi', 'Oi');
  c.ef = 1.3;
  for (let i = 0; i < 20; i++) c = SRS.schedule(c, 'again', NOW).card;
  assert.equal(c.ef, 1.3);
});

test('vencimento cai na virada do dia, não 24h após a avaliação', () => {
  const agora = new Date(2026, 10, 26, 10, 13, 0).getTime();
  const novo = SRS.newCard('id', 'Hi', 'Oi');
  const umDia = SRS.schedule(novo, 'good', agora, () => 0.5).card;
  assert.equal(umDia.due, new Date(2026, 10, 27, 0, 0, 0).getTime());

  let seis = novo;
  seis = SRS.schedule(seis, 'good', agora, () => 0.5).card;
  seis = SRS.schedule(seis, 'good', agora, () => 0.5).card;
  assert.equal(seis.interval, 6);
  assert.equal(seis.due, new Date(2026, 11, 2, 0, 0, 0).getTime());
});

test('intervalo nunca passa de 30 dias', () => {
  assert.equal(SRS.MAX_INTERVAL, 30);
  let c = SRS.newCard('id', 'Hi', 'Oi');
  c.interval = 95; c.reps = 5; c.ef = 2.5;
  const r = SRS.schedule(c, 'easy', NOW, () => 0.5);
  assert.equal(r.card.interval, 30);
});

test('jitter espalha o vencimento sem mudar o intervalo exibido', () => {
  const base = SRS.newCard('id', 'Hi', 'Oi');
  base.interval = 10; base.reps = 5; base.ef = 2.5;
  const cedo = SRS.schedule(base, 'good', NOW, () => 0).card;
  const tarde = SRS.schedule(base, 'good', NOW, () => 1).card;
  assert.equal(cedo.interval, tarde.interval);
  assert.equal(cedo.interval, 25);
  assert.ok(tarde.due > cedo.due);
});

test('intervalos curtos não recebem jitter', () => {
  const c = SRS.schedule(SRS.newCard('id', 'Hi', 'Oi'), 'good', NOW, () => 1).card;
  assert.equal(c.interval, 1);
  assert.equal(c.due, inicioDoDia(NOW) + DAY);
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
  assert.equal(SRS.formatInterval({ interval: 90, reps: 3, ef: 2.5 }, 'good'), '1 mês');
});
