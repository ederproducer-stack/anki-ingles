const test = require('node:test');
const assert = require('node:assert/strict');
require('../stats.js');
const Stats = globalThis.Stats;

const NOW = new Date(2026, 10, 26, 10, 0, 0); // quinta-feira

test('a API de estatísticas expõe as funções esperadas', () => {
  ['dayKey', 'totals', 'counts', 'retention', 'streak', 'distribution', 'difficulty', 'hardCards', 'chart', 'summary']
    .forEach(name => assert.equal(typeof Stats[name], 'function', name));
});

test('dayKey usa a data local no formato AAAA-MM-DD', () => {
  assert.equal(Stats.dayKey(new Date(2026, 0, 2)), '2026-01-02');
  assert.equal(Stats.dayKey(NOW), '2026-11-26');
});

test('counts soma avaliações e separa os acertos (Bom/Fácil)', () => {
  const t = Stats.counts({ '2026-11-25': { again: 1, hard: 1, good: 2, easy: 1 } });
  assert.deepEqual(t, { again: 1, hard: 1, good: 2, easy: 1, total: 5, hits: 3 });
});

test('retention calcula acertos sobre total de revisões', () => {
  // 8 acertos em 9 revisões => 88%, como na referência.
  assert.equal(Stats.retention({ x: { again: 0, hard: 1, good: 7, easy: 1 } }), 88);
  assert.equal(Stats.retention({}), 0);
});

test('streak conta dias consecutivos com revisão, terminando hoje ou ontem', () => {
  const history = {
    '2026-11-24': { good: 1 },
    '2026-11-25': { good: 1 },
    '2026-11-26': { good: 1 },
    '2026-11-20': { good: 1 }
  };
  assert.equal(Stats.streak(history, NOW), 3);
  const semHoje = { '2026-11-24': { good: 1 }, '2026-11-25': { good: 1 } };
  assert.equal(Stats.streak(semHoje, NOW), 2);
  const comFuraco = { '2026-11-26': { good: 1 }, '2026-11-24': { good: 1 } };
  assert.equal(Stats.streak(comFuraco, NOW), 1);
  assert.equal(Stats.streak({}, NOW), 0);
});

test('distribution separa novos, em estudo e bem memorizados', () => {
  const cards = [
    { reps: 0, interval: 0 },
    { reps: 0, interval: 0 },
    { reps: 2, interval: 6 },
    { reps: 9, interval: 21 },
    { reps: 12, interval: 90 }
  ];
  assert.deepEqual(Stats.distribution(cards), { novos: 2, estudo: 1, memorizados: 2 });
});

test('difficulty pontua lapses, facilidade baixa e cartões travados', () => {
  assert.equal(Stats.difficulty({ reps: 0, lapses: 0, ef: 2.5 }), 0);
  assert.equal(Stats.difficulty({ reps: 3, lapses: 2, ef: 2.3, interval: 6 }), 6.4);
  assert.equal(Stats.difficulty({ reps: 2, lapses: 0, ef: 2.5, interval: 0 }), 1);
  assert.equal(Stats.difficulty({ reps: 8, lapses: 5, ef: 2.1, interval: 21 }), 0);
});

test('cartão memorizado sai da lista de mais difíceis', () => {
  const cards = [
    { id: 'a', reps: 4, lapses: 4, ef: 2.0, interval: 3 },
    { id: 'b', reps: 9, lapses: 4, ef: 2.0, interval: 21 }
  ];
  assert.deepEqual(Stats.hardCards(cards).map(c => c.id), ['a']);
});

test('hardCards ordena os mais difíceis e aplica limite', () => {
  const cards = [
    { id: 'a', reps: 1, lapses: 0, ef: 2.5, interval: 3 },
    { id: 'b', reps: 3, lapses: 4, ef: 2.1, interval: 2 },
    { id: 'c', reps: 3, lapses: 1, ef: 2.5, interval: 1 },
    { id: 'd', reps: 0, lapses: 0, ef: 2.5, interval: 0 }
  ];
  assert.deepEqual(Stats.hardCards(cards, 2).map(c => c.id), ['b', 'c']);
  assert.deepEqual(Stats.hardCards(cards).map(c => c.id), ['b', 'c']);
});

test('chart traz 7 dias com totais, acertos e rótulos em português', () => {
  const history = {
    '2026-11-22': { good: 2, again: 1 },
    '2026-11-26': { good: 6, easy: 2, hard: 1 }
  };
  const out = Stats.chart(history, NOW);
  assert.equal(out.days.length, 7);
  assert.deepEqual(out.days[6], { key: '2026-11-26', label: 'Qui', total: 9, hits: 8 });
  assert.deepEqual(out.days[3], { key: '2026-11-23', label: 'Seg', total: 0, hits: 0 });
  assert.equal(out.total, 12);
  assert.equal(out.max, 9);
});

test('summary reúne os cartões do painel e os dados do gráfico', () => {
  const cards = [
    { reps: 0, interval: 0, due: NOW.getTime() - 1000 },
    { reps: 3, interval: 6, due: NOW.getTime() + 100000 }
  ];
  const deckStats = { totalReviews: 9, history: { '2026-11-26': { hard: 1, good: 8 } } };
  const s = Stats.summary(cards, deckStats, { dailyLimit: 20 }, NOW);
  assert.equal(s.retention, 88);
  assert.equal(s.totalReviews, 9);
  assert.equal(s.todayReviews, 9);
  assert.equal(s.dailyLimit, 20);
  assert.equal(s.streak, 1);
  assert.equal(s.memorized, 0);
  assert.equal(s.totalCards, 2);
  assert.equal(s.due, 1);
  assert.deepEqual(s.distribution, { novos: 1, estudo: 1, memorizados: 0 });
  assert.equal(s.chart.total, 9);
});

test('summary lida com deck vazio sem dividir por zero', () => {
  const s = Stats.summary([], { totalReviews: 0, history: {} }, {}, NOW);
  assert.equal(s.retention, 0);
  assert.equal(s.totalCards, 0);
  assert.equal(s.chart.max, 1);
});
