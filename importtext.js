/*
 * Importação inteligente de uma lista simples de frases.
 * Aceita vários separadores, marcadores de lista e pares em linhas separadas,
 * reconhece quando a ordem inglês/português está invertida e remove duplicatas.
 * Módulo sem dependências e exportável em Node para poder testar a lógica.
 */
(function (global) {
  'use strict';

  var SEPARATORS = ['\t', ' :: ', ' -> ', ' → ', ' — ', ' – ', ' | ', ' = ', ' : ', ' ; ', ' - ', '; ', ': '];
  var PT_MARKS = /[áéíóúâêôãõç]/i;
  var PT_WORDS = /\b(você|vocês|por favor|obrigad[oa]s?|não|olá|bom dia|boa noite|como vai|tudo bem|preciso|estou|quer|pode|seria|gostaria|desculpe|sim|então|muito|mais|para|com|pelo|pela)\b/i;
  var EN_WORDS = /\b(the|you|are|how|what|is|it|i|am|my|me|please|thank|thanks|good|fine|morning|evening|need|have|can|could|would|will|do|does|did|hello|hi|hey|sorry|yes|ok|okay|well|let|your|this|that|bye|goodbye|nice|great|see|later|take|care)\b/i;

  function clean(raw) {
    var s = String(raw == null ? '' : raw).trim();
    return s.replace(/^(?:[-*•–—]\s+|\d+[.)]\s+|>\s*)/, '').trim();
  }

  function stripQuotes(text) {
    var s = text.trim(), first = s.charAt(0);
    if ((first === '"' || first === "'" || first === '“') && s.charAt(s.length - 1) === first) {
      return s.slice(1, -1).trim();
    }
    return s;
  }

  function splitLine(line) {
    for (var i = 0; i < SEPARATORS.length; i++) {
      var at = line.indexOf(SEPARATORS[i]);
      if (at > 0) {
        return [stripQuotes(line.slice(0, at)), stripQuotes(line.slice(at + SEPARATORS[i].length))];
      }
    }
    return null;
  }

  function looksPortuguese(text) {
    return PT_MARKS.test(text) || PT_WORDS.test(text);
  }

  function looksEnglish(text) {
    return EN_WORDS.test(text);
  }

  function pair(left, right) {
    if (!left || !right) return null;
    if (looksPortuguese(left) && looksEnglish(right)) return { front: right, back: left };
    return { front: left, back: right };
  }

  function parse(text) {
    var lines = String(text == null ? '' : text).split(/\r?\n/);
    var cards = [], skipped = [], loose = [];
    var seen = {};

    function add(item) {
      if (!item) return;
      var key = item.front.toLowerCase().replace(/\s+/g, ' ');
      if (!item.front || !item.back || seen[key]) return;
      seen[key] = true;
      cards.push(item);
    }

    lines.forEach(function (raw) {
      var line = clean(raw);
      if (!line || line.charAt(0) === '#') return;
      var parts = splitLine(line);
      if (parts) {
        var item = pair(parts[0], parts[1]);
        if (item) add(item);
        else skipped.push(line);
      } else {
        loose.push(line);
      }
    });

    // Linhas sem separador: pares em linhas consecutivas (inglês, português).
    for (var i = 0; i + 1 < loose.length; i += 2) {
      var a = loose[i], b = loose[i + 1];
      var bilingual = (looksEnglish(a) || looksEnglish(b)) && (looksPortuguese(a) || looksPortuguese(b));
      var item2 = bilingual ? pair(a, b) : null;
      if (item2) add(item2);
      else skipped.push(a, b);
    }
    if (loose.length % 2) skipped.push(loose[loose.length - 1]);

    return { cards: cards, skipped: skipped };
  }

  var api = { parse: parse, clean: clean, splitLine: splitLine };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.ImportText = api;
})(typeof window !== 'undefined' ? window : globalThis);
