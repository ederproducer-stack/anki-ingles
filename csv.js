/*
 * Importação e exportação de cartões em CSV.
 * Módulo sem dependências e exportável em Node para poder testar a lógica.
 * Aceita vírgula, ponto e vírgula ou tab como delimitador, BOM, aspas
 * escapadas e cabeçalhos em português ou inglês.
 */
(function (global) {
  'use strict';

  var HEADER = ['front', 'back', 'notes'];

  // Os valores são normalizados (sem acentos, sem pontuação) antes da busca.
  var FRONT_KEYS = ['front', 'ingles', 'english', 'en', 'frase', 'phrase', 'question', 'pergunta'];
  var BACK_KEYS = ['back', 'portugues', 'portuguese', 'pt', 'traducao', 'translation', 'answer', 'resposta'];
  var NOTES_KEYS = ['notes', 'notas', 'note', 'observacoes', 'obs', 'extra', 'tags'];
  var HEADER_HINTS = FRONT_KEYS.concat(BACK_KEYS, NOTES_KEYS,
    ['nome', 'name', 'id', 'idade', 'age', 'numero', 'number', 'assunto', 'subject']);

  function normalize(text) {
    return String(text == null ? '' : text)
      .replace(/^\uFEFF/, '')
      .trim()
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '');
  }

  function indexOfAny(list, keys) {
    for (var i = 0; i < list.length; i++) {
      if (keys.indexOf(list[i]) >= 0) return i;
    }
    return -1;
  }

  function looksLikeHeader(row) {
    var hits = 0;
    for (var i = 0; i < row.length; i++) {
      if (HEADER_HINTS.indexOf(normalize(row[i])) >= 0) hits++;
    }
    return hits >= 2;
  }

  function detectDelimiter(text) {
    var line = String(text == null ? '' : text).replace(/^\uFEFF/, '').split(/\r?\n/)[0] || '';
    var counts = { ',': 0, ';': 0, '\t': 0 };
    var quoted = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') { i++; continue; }
        quoted = !quoted;
      } else if (!quoted && Object.prototype.hasOwnProperty.call(counts, ch)) {
        counts[ch]++;
      }
    }
    var best = ',', max = -1;
    [',', ';', '\t'].forEach(function (d) {
      if (counts[d] > max) { max = counts[d]; best = d; }
    });
    return max === 0 ? ',' : best;
  }

  function parseRows(text, delimiter) {
    var rows = [], row = [], cell = '', quoted = false, started = false;
    var s = String(text == null ? '' : text).replace(/^\uFEFF/, '');

    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (quoted) {
        if (ch === '"') {
          if (s[i + 1] === '"') { cell += '"'; i++; }
          else quoted = false;
        } else {
          cell += ch;
        }
        continue;
      }
      if (ch === '"' && !started) {
        quoted = true; started = true;
      } else if (ch === delimiter) {
        row.push(cell); cell = ''; started = false;
      } else if (ch === '\r' || ch === '\n') {
        if (ch === '\r' && s[i + 1] === '\n') i++;
        if (started || cell !== '' || row.length) { row.push(cell); rows.push(row); }
        row = []; cell = ''; started = false;
      } else {
        cell += ch; started = true;
      }
    }
    if (quoted) throw new Error('CSV inválido: aspas não fechadas.');
    if (started || cell !== '' || row.length) { row.push(cell); rows.push(row); }

    return rows.filter(function (r) {
      return r.some(function (v) { return String(v).trim() !== ''; });
    });
  }

  function column(row, index) {
    if (index < 0 || index >= row.length) return '';
    return row[index].replace(/\r\n?/g, '\n').trim();
  }

  function parse(text) {
    var rows = parseRows(text, detectDelimiter(text));
    if (!rows.length) return [];

    var header = looksLikeHeader(rows[0]) ? rows[0].map(normalize) : null;
    var fi = header ? indexOfAny(header, FRONT_KEYS) : 0;
    var bi = header ? indexOfAny(header, BACK_KEYS) : 1;
    var ni = header ? indexOfAny(header, NOTES_KEYS) : 2;
    if (header && (fi < 0 || bi < 0)) {
      throw new Error('CSV inválido: não encontrei colunas de frente e verso.');
    }

    var cards = [];
    rows.slice(header ? 1 : 0).forEach(function (row) {
      var front = column(row, fi);
      var back = column(row, bi);
      if (!front || !back) return;
      cards.push({ front: front, back: back, notes: ni >= 0 ? column(row, ni) : '' });
    });
    return cards;
  }

  function escapeCell(value) {
    var s = String(value == null ? '' : value);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCSV(cards) {
    var lines = [HEADER.map(escapeCell).join(',')];
    (cards || []).forEach(function (c) {
      if (!c) return;
      lines.push([c.front, c.back, c.notes || ''].map(escapeCell).join(','));
    });
    // BOM ajuda o Excel a reconhecer UTF-8; CRLF é o padrão de planilhas.
    return '\uFEFF' + lines.join('\r\n') + '\r\n';
  }

  var api = { parse: parse, toCSV: toCSV };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.CSV = api;
})(typeof window !== 'undefined' ? window : globalThis);
