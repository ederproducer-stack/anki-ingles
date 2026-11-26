/*
 * Cálculos da tela de estatísticas.
 * Módulo sem dependências e exportável em Node para poder testar a lógica.
 * "Bem memorizados" segue a convenção do Anki: intervalo de 21 dias ou mais.
 */
(function (global) {
  'use strict';

  var MATURE_DAYS = 21;
  var WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  function dayKey(date) {
    var d = date || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function totals(day) {
    day = day || {};
    var out = {
      again: Number(day.again) || 0,
      hard: Number(day.hard) || 0,
      good: Number(day.good) || 0,
      easy: Number(day.easy) || 0
    };
    out.total = out.again + out.hard + out.good + out.easy;
    out.hits = out.good + out.easy;
    return out;
  }

  function counts(history) {
    var out = { again: 0, hard: 0, good: 0, easy: 0, total: 0, hits: 0 };
    Object.keys(history || {}).forEach(function (key) {
      var t = totals(history[key]);
      ['again', 'hard', 'good', 'easy', 'total', 'hits'].forEach(function (field) {
        out[field] += t[field];
      });
    });
    return out;
  }

  function retention(history) {
    var t = counts(history);
    return t.total ? Math.floor((t.hits / t.total) * 100) : 0;
  }

  function streak(history, now) {
    now = now || new Date();
    var day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (totals((history || {})[dayKey(day)]).total === 0) day.setDate(day.getDate() - 1);
    var n = 0;
    while (n < 3650 && totals((history || {})[dayKey(day)]).total > 0) {
      n++;
      day.setDate(day.getDate() - 1);
    }
    return n;
  }

  function distribution(cards) {
    var out = { novos: 0, estudo: 0, memorizados: 0 };
    (cards || []).forEach(function (c) {
      if (!c) return;
      if ((Number(c.interval) || 0) >= MATURE_DAYS) out.memorizados++;
      else if ((Number(c.reps) || 0) > 0) out.estudo++;
      else out.novos++;
    });
    return out;
  }

  function chart(history, now, count) {
    now = now || new Date();
    count = count || 7;
    var days = [], total = 0, max = 0;
    for (var i = count - 1; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      var key = dayKey(d);
      var t = totals((history || {})[key]);
      days.push({ key: key, label: WEEKDAYS[d.getDay()], total: t.total, hits: t.hits });
      total += t.total;
      if (t.total > max) max = t.total;
    }
    return { days: days, total: total, max: Math.max(1, max) };
  }

  function difficulty(card) {
    if (!card) return 0;
    // Cartão bem memorizado sai do filtro, mesmo tendo errado antes.
    if ((Number(card.interval) || 0) >= MATURE_DAYS) return 0;
    var lapses = Number(card.lapses) || 0;
    var ef = Number(card.ef) || 2.5;
    var travado = (Number(card.reps) > 0 && (Number(card.interval) || 0) < 1) ? 1 : 0;
    return Math.round((lapses * 3 + Math.max(0, 2.5 - ef) * 2 + travado) * 100) / 100;
  }

  function hardCards(cards, limit) {
    return (cards || [])
      .filter(function (c) { return c && difficulty(c) > 0; })
      .sort(function (a, b) { return difficulty(b) - difficulty(a); })
      .slice(0, limit || 20);
  }

  function summary(cards, deckStats, settings, now) {
    cards = cards || [];
    deckStats = deckStats || {};
    settings = settings || {};
    now = now || new Date();

    var history = deckStats.history || {};
    var t = counts(history);
    var dist = distribution(cards);
    var ts = now.getTime();

    return {
      retention: t.total ? Math.floor((t.hits / t.total) * 100) : 0,
      totalReviews: deckStats.totalReviews || t.total,
      todayReviews: totals(history[dayKey(now)]).total,
      dailyLimit: settings.dailyLimit || 30,
      streak: streak(history, now),
      memorized: dist.memorizados,
      totalCards: cards.length,
      due: cards.filter(function (c) { return (Number(c.due) || 0) <= ts; }).length,
      distribution: dist,
      chart: chart(history, now)
    };
  }

  var api = {
    MATURE_DAYS: MATURE_DAYS,
    dayKey: dayKey,
    totals: totals,
    counts: counts,
    retention: retention,
    streak: streak,
    distribution: distribution,
    difficulty: difficulty,
    hardCards: hardCards,
    chart: chart,
    summary: summary
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.Stats = api;
})(typeof window !== 'undefined' ? window : globalThis);
