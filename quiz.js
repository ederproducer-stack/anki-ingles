/*
 * Geração de alternativas para o modo Quiz.
 * Usa apenas os versos dos outros cartões do mesmo deck — nada de rede.
 * Módulo sem dependências e exportável em Node para poder testar a lógica.
 */
(function (global) {
  'use strict';

  function shuffle(list, rng) {
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = list[i]; list[i] = list[j]; list[j] = tmp;
    }
    return list;
  }

  function makeOptions(cards, card, count, rng) {
    count = count || 4;
    rng = rng || Math.random;
    var correct = String(card.back == null ? '' : card.back).trim();

    var pool = [];
    (cards || []).forEach(function (c) {
      if (!c || c.id === card.id || !c.back) return;
      var text = String(c.back).trim();
      if (!text || text.toLowerCase() === correct.toLowerCase()) return;
      if (pool.some(function (v) { return v.toLowerCase() === text.toLowerCase(); })) return;
      pool.push(text);
    });

    var distractors = shuffle(pool, rng).slice(0, Math.max(0, count - 1));
    var options = shuffle([correct].concat(distractors), rng);

    return options.map(function (text) {
      return { text: text, correct: text === correct };
    });
  }

  var api = { makeOptions: makeOptions };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.Quiz = api;
})(typeof window !== 'undefined' ? window : globalThis);
