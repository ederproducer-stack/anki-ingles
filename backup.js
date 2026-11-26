/*
 * Backup portátil.
 * Com a File System Access API (Chrome), o usuário escolhe uma pasta e o app
 * grava nela JSON + arquivos + MP3s.
 * Sem essa API (Brave a desabilita por padrão), os MP3s ficam no IndexedDB e
 * "Baixar backup" gera um ZIP com JSON + arquivos do app + todos os áudios.
 */
(function (global) {
  'use strict';

  var BACKUP_FILE = 'anki-ingles-backup.json';
  var SOURCE_FILES = [
    'index.html', 'style.css', 'theme.css', 'theme-meta.json',
    'app.js', 'srs.js', 'csv.js', 'stats.js', 'quiz.js', 'importtext.js', 'tts.js', 'richtext.js', 'deck.js', 'decks.js', 'backup.js',
    'theme-sync.js', 'server.py', 'README.md', 'LICENSE', 'version.json',
    'favicon.svg', 'favicon.png', 'favicon.ico'
  ];
  var DB_NAME = 'anki-ingles-backup';
  var DB_VERSION = 2;

  var dir = null;
  var audioDir = null;
  var lastSaved = null;
  var lastAudioSync = null;
  var audioCount = 0;
  var debounceTimer = null;
  var serverBackup = null; // { path, available } quando o servidor grava em disco

  function isSupported() {
    return typeof global.showDirectoryPicker === 'function';
  }

  function openDB() {
    return new Promise(function (resolve, reject) {
      if (!global.indexedDB) return resolve(null);
      try {
        var req = global.indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = function () {
          var db = req.result;
          if (!db.objectStoreNames.contains('handles')) db.createObjectStore('handles');
          if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio');
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      } catch (err) { resolve(null); }
    });
  }

  function dbGet(store, key) {
    return openDB().then(function (db) {
      if (!db) return null;
      return new Promise(function (resolve) {
        try {
          var req = db.transaction(store, 'readonly').objectStore(store).get(key);
          req.onsuccess = function () { resolve(req.result || null); };
          req.onerror = function () { resolve(null); };
        } catch (err) { resolve(null); }
      });
    }).catch(function () { return null; });
  }

  function dbPut(store, key, value) {
    return openDB().then(function (db) {
      if (!db) return;
      return new Promise(function (resolve, reject) {
        try {
          var tx = db.transaction(store, 'readwrite');
          tx.objectStore(store).put(value, key);
          tx.oncomplete = resolve;
          tx.onerror = function () { reject(tx.error); };
        } catch (err) { reject(err); }
      });
    });
  }

  function dbKeys(store) {
    return openDB().then(function (db) {
      if (!db) return [];
      return new Promise(function (resolve) {
        try {
          var req = db.transaction(store, 'readonly').objectStore(store).getAllKeys();
          req.onsuccess = function () { resolve(req.result || []); };
          req.onerror = function () { resolve([]); };
        } catch (err) { resolve([]); }
      });
    }).catch(function () { return []; });
  }

  function loadHandle() { return dbGet('handles', 'dir'); }
  function storeHandle(handle) { return dbPut('handles', 'dir', handle).catch(function () { /* sem persistência, funciona na sessão */ }); }

  function permission(handle, request) {
    if (!handle || !handle.queryPermission) return Promise.resolve(true);
    try {
      var mode = { mode: 'readwrite' };
      return handle.queryPermission(mode).then(function (result) {
        if (result === 'granted' || !request || !handle.requestPermission) return result === 'granted';
        return handle.requestPermission(mode).then(function (r) { return r === 'granted'; });
      });
    } catch (err) {
      return Promise.resolve(false);
    }
  }

  function writeContent(folder, name, content) {
    return folder.getFileHandle(name, { create: true }).then(function (fh) {
      return fh.createWritable();
    }).then(function (writable) {
      return writable.write(content).then(function () { return writable.close(); });
    });
  }

  function fileExists(folder, name) {
    return folder.getFileHandle(name).then(function () { return true; }, function () { return false; });
  }

  function getAudioDir() {
    if (audioDir) return Promise.resolve(audioDir);
    return permission(dir, true).then(function (ok) {
      if (!ok) throw new Error('Permissão negada para a pasta');
      return dir.getDirectoryHandle('audio', { create: true });
    }).then(function (handle) {
      audioDir = handle;
      return handle;
    });
  }

  /* Nome estável por frase: slug + hash FNV-1a. */
  function audioFileName(text) {
    var hash = 2166136261;
    for (var i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    var slug = String(text).toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 28) || 'frase';
    return slug + '_' + (hash >>> 0).toString(36) + '.mp3';
  }

  function mapLimit(items, limit, worker) {
    if (!items.length) return Promise.resolve([]);
    var results = new Array(items.length);
    var index = 0;
    function next() {
      if (index >= items.length) return Promise.resolve();
      var i = index++;
      return Promise.resolve().then(function () { return worker(items[i], i); })
        .then(function (r) { results[i] = r; return next(); });
    }
    var workers = [];
    for (var w = 0; w < Math.min(limit, items.length); w++) workers.push(next());
    return Promise.all(workers).then(function () { return results; });
  }

  function buildPayload(state) {
    return {
      app: 'anki-ingles',
      version: 2,
      exportedAt: new Date().toISOString(),
      cards: state.cards,
      settings: state.settings,
      stats: state.stats
    };
  }

  function uniqueFronts(state) {
    var seen = {};
    var texts = [];
    state.cards.forEach(function (c) {
      if (c && c.front && !seen[c.front]) { seen[c.front] = true; texts.push(c.front); }
    });
    return texts;
  }

  function fetchAudio(text) {
    return fetch('/tts?tl=en&q=' + encodeURIComponent(text)).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.blob();
    });
  }

  /* Baixa os MP3s faltantes para a pasta ou, sem ela, para o IndexedDB. */
  function saveAudios(state, opts) {
    opts = opts || {};
    var texts = uniqueFronts(state);
    var pending = texts.map(function (text) { return { text: text, name: audioFileName(text) }; });

    function missingFolder(folder) {
      if (!opts.onlyMissing) return Promise.resolve(pending);
      return mapLimit(pending, 3, function (item) {
        return fileExists(folder, item.name).then(function (exists) { return exists ? null : item; });
      }).then(function (r) { return r.filter(Boolean); });
    }

    function missingDB() {
      if (!opts.onlyMissing) return Promise.resolve(pending);
      return dbKeys('audio').then(function (keys) {
        return pending.filter(function (item) { return keys.indexOf(item.name) < 0; });
      });
    }

    var target = dir ? getAudioDir().then(missingFolder) : missingDB();
    return target.then(function (list) {
      return mapLimit(list, 3, function (item) {
        return fetchAudio(item.text).then(function (blob) {
          return dir ? writeContent(audioDir, item.name, blob) : dbPut('audio', item.name, blob);
        });
      }).then(function () {
        audioCount = opts.onlyMissing ? audioCount + list.length : texts.length;
        lastAudioSync = new Date();
        return texts.length;
      });
    });
  }

  /* Retorna o MP3 local de uma frase, da pasta ou do IndexedDB. */
  function getAudio(text) {
    if (!text) return Promise.resolve(null);
    var name = audioFileName(text);
    if (dir) {
      return getAudioDir().then(function (folder) {
        return fileExists(folder, name).then(function (exists) {
          if (!exists) return null;
          return folder.getFileHandle(name).then(function (fh) { return fh.getFile(); });
        });
      }).catch(function () { return null; });
    }
    return dbGet('audio', name).catch(function () { return null; });
  }

  function saveNow(state, includeApp) {
    if (!dir) return Promise.reject(new Error('Nenhuma pasta escolhida'));
    return permission(dir, true).then(function (ok) {
      if (!ok) throw new Error('Permissão negada para a pasta');
      return writeContent(dir, BACKUP_FILE, JSON.stringify(buildPayload(state), null, 2));
    }).then(function () {
      lastSaved = new Date();
      if (!includeApp) return;
      return dir.getDirectoryHandle('app', { create: true }).then(function (sub) {
        return Promise.all(SOURCE_FILES.map(function (name) {
          return fetch('./' + name).then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.text();
          }).then(function (text) {
            return writeContent(sub, name, text);
          }).catch(function () { return null; });
        }));
      }).catch(function () { return null; }).then(function () {
        return saveAudios(state, { onlyMissing: true }).catch(function () { return 0; });
      });
    });
  }

  /* Salva tudo no disco pelo servidor local (funciona no Brave, sem API de pastas). */
  function saveToServer(state) {
    if (!serverBackup || !serverBackup.available) return Promise.resolve(false);

    function blobToBase64(blob) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () {
          var s = String(reader.result);
          resolve(s.slice(s.indexOf(',') + 1));
        };
        reader.onerror = function () { reject(reader.error); };
        reader.readAsDataURL(blob);
      });
    }

    var files = {};
    var audio = {};
    var fronts = uniqueFronts(state);

    var filesPromise = Promise.all(SOURCE_FILES.map(function (name) {
      return fetch('./' + name).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      }).then(function (text) { files[name] = text; }).catch(function () { return null; });
    }));

    var audioPromise = mapLimit(fronts, 4, function (text) {
      var name = audioFileName(text);
      return getAudioByAny(name).then(function (file) {
        if (file) return blobToBase64(file).then(function (b64) { audio[name] = b64; });
        // se ainda não existe, busca do proxy e salva localmente também
        return fetchAudio(text).then(function (blob) {
          return blobToBase64(blob).then(function (b64) {
            audio[name] = b64;
            return (dir ? writeContent(audioDir, name, blob) : dbPut('audio', name, blob)).catch(function () { return null; });
          });
        });
      });
    }).catch(function () { return null; });

    return Promise.all([filesPromise, audioPromise]).then(function () {
      return fetch('/backup/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload: buildPayload(state),
          files: files,
          audio: audio
        })
      }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      });
    }).then(function (result) {
      if (!result.ok) throw new Error(result.error || 'Falha ao salvar');
      lastSaved = new Date();
      audioCount = Object.keys(audio).length;
      return result;
    });
  }

  function onChange(state) {
    if (!state.settings.autoBackup) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () {
      debounceTimer = null;
      if (serverBackup && serverBackup.available) {
        saveToServer(state).catch(function () { /* tenta de novo na próxima alteração */ });
        return;
      }
      if (dir) saveNow(state, false).catch(function () { /* falha silenciosa */ });
      saveAudios(state, { onlyMissing: true }).catch(function () { /* sem internet: tenta depois */ });
    }, 2000);
  }

  function chooseFolder(getState) {
    if (!isSupported()) return Promise.reject(new Error('Navegador sem suporte a pastas'));
    return global.showDirectoryPicker({ mode: 'readwrite', id: 'anki-ingles' }).then(function (handle) {
      dir = handle;
      audioDir = null;
      audioCount = 0;
      lastAudioSync = null;
      return storeHandle(handle).then(function () {
        return saveNow(getState(), true);
      }).then(function () {
        return handle.name;
      });
    });
  }

  function readFromFolder() {
    if (!dir) return Promise.reject(new Error('Nenhuma pasta escolhida'));
    return permission(dir, true).then(function (ok) {
      if (!ok) throw new Error('Permissão negada para a pasta');
      return dir.getFileHandle(BACKUP_FILE);
    }).then(function (fh) { return fh.getFile(); }).then(function (file) { return file.text(); });
  }

  function parse(text) {
    var data;
    try { data = JSON.parse(text); }
    catch (err) { throw new Error('Arquivo não é um JSON válido.'); }
    if (!data || !Array.isArray(data.cards)) throw new Error('Arquivo de backup inválido.');
    var cards = data.cards.filter(function (c) {
      return c && typeof c.front === 'string' && typeof c.back === 'string';
    });
    if (!cards.length) throw new Error('Nenhum cartão válido no arquivo.');
    return { cards: cards, settings: data.settings || {}, stats: data.stats || {} };
  }

  /* -------------------- ZIP (sem compressão) -------------------- */

  var CRC_TABLE = (function () {
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function dosDateTime(d) {
    var time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
    var date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return { time: time & 0xFFFF, date: date & 0xFFFF };
  }

  function u16(v) { return [v & 0xFF, (v >>> 8) & 0xFF]; }
  function u32(v) { return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]; }
  function concat(parts) {
    var size = 0, i;
    for (i = 0; i < parts.length; i++) size += parts[i].length;
    var out = new Uint8Array(size), offset = 0;
    for (i = 0; i < parts.length; i++) { out.set(parts[i], offset); offset += parts[i].length; }
    return out;
  }

  function makeZip(files) {
    // files: [{ name, data: Uint8Array }]
    var encoder = new TextEncoder();
    var dt = dosDateTime(new Date());
    var localParts = [], centralParts = [], offset = 0;

    files.forEach(function (file) {
      var name = encoder.encode(file.name);
      var crc = crc32(file.data);
      var local = concat([
        new Uint8Array(u32(0x04034b50)), new Uint8Array(u16(20)), new Uint8Array(u16(0)),
        new Uint8Array(u16(0)), new Uint8Array(u16(dt.time)), new Uint8Array(u16(dt.date)),
        new Uint8Array(u32(crc)), new Uint8Array(u32(file.data.length)), new Uint8Array(u32(file.data.length)),
        new Uint8Array(u16(name.length)), new Uint8Array(u16(0)), name, file.data
      ]);
      var central = concat([
        new Uint8Array(u32(0x02014b50)), new Uint8Array(u16(20)), new Uint8Array(u16(20)),
        new Uint8Array(u16(0)), new Uint8Array(u16(0)), new Uint8Array(u16(dt.time)), new Uint8Array(u16(dt.date)),
        new Uint8Array(u32(crc)), new Uint8Array(u32(file.data.length)), new Uint8Array(u32(file.data.length)),
        new Uint8Array(u16(name.length)), new Uint8Array(u16(0)), new Uint8Array(u16(0)),
        new Uint8Array(u16(0)), new Uint8Array(u16(0)), new Uint8Array(u32(0)),
        new Uint8Array(u32(offset)), name
      ]);
      localParts.push(local);
      centralParts.push(central);
      offset += local.length;
    });

    var centralSize = 0;
    centralParts.forEach(function (p) { centralSize += p.length; });
    var end = concat([
      new Uint8Array(u32(0x06054b50)), new Uint8Array(u16(0)), new Uint8Array(u16(0)),
      new Uint8Array(u16(files.length)), new Uint8Array(u16(files.length)),
      new Uint8Array(u32(centralSize)), new Uint8Array(u32(offset)), new Uint8Array(u16(0))
    ]);
    return new Blob([concat(localParts.concat(centralParts, [end]))], { type: 'application/zip' });
  }

  function toBytes(value) {
    if (value instanceof Uint8Array) return value;
    if (typeof value === 'string') return new TextEncoder().encode(value);
    if (value && value.arrayBuffer) return value.arrayBuffer().then(function (b) { return new Uint8Array(b); });
    return new Uint8Array(0);
  }

  /* Baixa um ZIP com JSON, arquivos do app e todos os áudios. */
  function download(state) {
    var encoder = new TextEncoder();
    var files = [{ name: BACKUP_FILE, data: encoder.encode(JSON.stringify(buildPayload(state), null, 2)) }];
    var audioNames = uniqueFronts(state).map(function (t) { return audioFileName(t); });

    return Promise.all(SOURCE_FILES.map(function (name) {
      return fetch('./' + name).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      }).then(function (text) {
        files.push({ name: 'app/' + name, data: encoder.encode(text) });
      }).catch(function () { return null; });
    })).then(function () {
      return mapLimit(audioNames, 8, function (name) {
        return getAudioByAny(name).then(function (blob) {
          if (blob) files.push({ name: 'audio/' + name, data: toBytes(blob) });
        });
      });
    }).then(function () {
      return Promise.all(files.map(function (f) {
        return Promise.resolve(toBytes(f.data)).then(function (b) { f.data = b; });
      }));
    }).then(function () {
      var blob = makeZip(files);
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'anki-ingles-backup-' + new Date().toISOString().slice(0, 10) + '.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return files.filter(function (f) { return f.name.indexOf('audio/') === 0; }).length;
    });
  }

  function getAudioByAny(name) {
    if (dir) {
      return getAudioDir().then(function (folder) {
        return fileExists(folder, name).then(function (exists) {
          if (!exists) return null;
          return folder.getFileHandle(name).then(function (fh) { return fh.getFile(); });
        });
      }).catch(function () { return null; });
    }
    return dbGet('audio', name).catch(function () { return null; });
  }

  function countAudios(state) {
    var names = uniqueFronts(state || { cards: [] }).map(function (t) { return audioFileName(t); });
    if (dir) {
      return getAudioDir().then(function (folder) {
        return mapLimit(names, 8, function (name) { return fileExists(folder, name); });
      }).then(function (r) {
        audioCount = r.filter(Boolean).length;
        return audioCount;
      }).catch(function () { return 0; });
    }
    return dbKeys('audio').then(function (keys) {
      audioCount = names.filter(function (n) { return keys.indexOf(n) >= 0; }).length;
      return audioCount;
    }).catch(function () { return 0; });
  }

  function clearDir() {
    dir = null; audioDir = null; lastSaved = null; lastAudioSync = null; audioCount = 0;
    if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
    return loadHandle().then(function (handle) {
      if (!handle) return false;
      return permission(handle, false).then(function (ok) {
        if (ok) dir = handle;
        return ok;
      });
    }).catch(function () { return false; });
  }

  /* Muda o destino no servidor local e atualiza o status do app. */
  function moveServerFolder(from, to) {
    return fetch('/backup/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: from, to: to })
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (result) {
      if (!result.ok) throw new Error(result.error || 'Falha ao mudar a pasta');
      if (serverBackup) serverBackup.path = result.path;
      audioDir = null;
      return result;
    });
  }

  /* Muda a pasta no modo navegador, copiando o conteúdo da anterior. */
  function moveBrowserFolder(getState) {
    if (!isSupported()) return Promise.reject(new Error('Navegador sem suporte a pastas'));
    var oldDir = dir;
    return global.showDirectoryPicker({ mode: 'readwrite', id: 'anki-ingles' }).then(function (newDir) {
      function copyFile(fh, target, name) {
        return fh.getFile().then(function (file) {
          return writeContent(target, name, file);
        });
      }
      function copyAll() {
        if (!oldDir) return Promise.resolve(0);
        var count = 0;
        function walk(folder, target) {
          return folder.entries ? folder.entries().next().then(function step(entry) {
            if (entry.done) return;
            var name = entry.value[0];
            var handle = entry.value[1];
            count++;
            if (handle.kind === 'directory') {
              return target.getDirectoryHandle(name, { create: true }).then(function (sub) {
                return walk(handle, sub);
              }).then(function () { return folder.entries().next().then(step); });
            }
            return copyFile(handle, target, name).then(function () {
              return folder.entries().next().then(step);
            });
          }) : Promise.resolve();
        }
        return walk(oldDir, newDir).then(function () { return count; });
      }
      return copyAll().then(function (copied) {
        dir = newDir;
        audioDir = null;
        return storeHandle(newDir).then(function () {
          return saveNow(getState(), true);
        }).then(function () {
          return { path: newDir.name, copiedFiles: copied };
        });
      });
    });
  }

  function getStatus() {
    return {
      supported: isSupported(),
      folder: dir ? dir.name : null,
      serverPath: serverBackup && serverBackup.available ? serverBackup.path : null,
      lastSaved: lastSaved,
      audioCount: audioCount,
      lastAudioSync: lastAudioSync
    };
  }

  function init() {
    if (typeof fetch !== 'function') return Promise.resolve(false);
    var serverProbe = fetch('/backup/status').then(function (res) {
      if (!res.ok) return null;
      return res.json();
    }).then(function (info) {
      if (info && info.available) serverBackup = { path: info.path, available: true };
      return info;
    }).catch(function () { return null; });

    return serverProbe.then(function () {
      if (!isSupported()) return false;
      return loadHandle().then(function (handle) {
        if (!handle) return false;
        return permission(handle, false).then(function (ok) {
          if (ok) dir = handle;
          return ok;
        });
      });
    });
  }

  var api = {
    isSupported: isSupported, init: init, chooseFolder: chooseFolder,
    saveNow: saveNow, saveAudios: saveAudios, countAudios: countAudios,
    getAudio: getAudio, audioFileName: audioFileName, onChange: onChange,
    saveToServer: saveToServer, clearDir: clearDir,
    moveServerFolder: moveServerFolder, moveBrowserFolder: moveBrowserFolder,
    readFromFolder: readFromFolder, parse: parse,
    download: download, makeZip: makeZip, getStatus: getStatus
  };
  global.Backup = api;
})(typeof window !== 'undefined' ? window : globalThis);
