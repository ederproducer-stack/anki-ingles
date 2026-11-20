/*
 * Texto para fala, em quatro tentativas:
 * 1) MP3 salvo na pasta de backup (funciona offline).
 * 2) /tts — proxy local do servidor (mesma origem; funciona no Brave, que bloqueia
 *    a requisição direta ao Google com ERR_BLOCKED_BY_ORB).
 * 3) Endpoint direto do Google Tradutor (voz en-US, sem chave de API).
 * 4) Web Speech API do navegador com voz en-US.
 */
(function (global) {
  'use strict';

  var audio = null;
  var token = 0;
  var activeResolve = null;
  var activeObjectUrl = null;

  function googleUrl(text, lang) {
    return 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=' +
      encodeURIComponent(lang || 'en') + '&q=' + encodeURIComponent(text);
  }

  function proxyUrl(text, lang) {
    return '/tts?tl=' + encodeURIComponent(lang || 'en') + '&q=' + encodeURIComponent(text);
  }

  function browserSpeak(text, rate) {
    return new Promise(function (resolve) {
      if (!('speechSynthesis' in global) || !('SpeechSynthesisUtterance' in global)) {
        return resolve(null);
      }
      try {
        var u = new SpeechSynthesisUtterance(text);
        u.lang = 'en-US';
        u.rate = rate || 1;
        var voices = global.speechSynthesis.getVoices() || [];
        var voice = voices.filter(function (v) { return /en[-_]US/i.test(v.lang); })[0] ||
                    voices.filter(function (v) { return /^en/i.test(v.lang); })[0];
        if (voice) u.voice = voice;
        u.onend = function () { resolve('speech'); };
        u.onerror = function () { resolve(null); };
        global.speechSynthesis.cancel();
        global.speechSynthesis.speak(u);
      } catch (err) {
        resolve(null);
      }
    });
  }

  function revokeObjectUrl() {
    if (activeObjectUrl) {
      try { URL.revokeObjectURL(activeObjectUrl); } catch (err) { /* ignore */ }
      activeObjectUrl = null;
    }
  }

  function stop() {
    token += 1;
    revokeObjectUrl();
    if (audio) {
      try { audio.pause(); } catch (err) { /* ignore */ }
      try { audio.src = ''; } catch (err) { /* ignore */ }
      audio = null;
    }
    try {
      if ('speechSynthesis' in global) global.speechSynthesis.cancel();
    } catch (err) { /* ignore */ }
    if (activeResolve) {
      var resolve = activeResolve;
      activeResolve = null;
      resolve({ ok: false, via: 'stopped' });
    }
  }

  /*
   * Fala o texto. Retorna Promise<{ ok, via }>, onde via é
   * 'proxy' | 'google' | 'speech' | 'blocked' | 'none' | 'timeout' | 'stopped'.
   */
  function speak(text, opts) {
    if (!text) return Promise.resolve({ ok: false, via: 'none' });
    opts = opts || {};
    var lang = opts.lang || 'en';
    var rate = opts.rate || 1;

    stop();
    var myToken = token;

    return new Promise(function (resolve) {
      var settled = false;
      var timer = null;

      function finish(via) {
        if (settled || myToken !== token) return;
        settled = true;
        if (timer) clearTimeout(timer);
        if (activeResolve) activeResolve = null;
        revokeObjectUrl();
        resolve({ ok: via === 'local' || via === 'proxy' || via === 'google' || via === 'speech', via: via });
      }

      activeResolve = function (result) {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        resolve(result);
      };

      function tryBrowser() {
        if (myToken !== token) return;
        browserSpeak(text, rate).then(function (via) { finish(via || 'none'); });
      }

      function trySource(url, via, onFailure) {
        if (myToken !== token) return;
        var a = new Audio();
        audio = a;
        a.src = url;
        a.playbackRate = rate;
        a.onended = function () { finish(via); };
        a.onerror = function () { onFailure(); };

        var playPromise;
        try {
          playPromise = a.play();
        } catch (err) {
          playPromise = Promise.reject(err);
        }
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(function (err) {
            if (myToken !== token) return;
            // Autoplay bloqueado: a voz do navegador também exigiria gesto do usuário.
            if (err && err.name === 'NotAllowedError') return finish('blocked');
            onFailure();
          });
        }
      }

      function tryLocal(onFailure) {
        var done = false;
        function fail() {
          if (done) return;
          done = true;
          onFailure();
        }
        if (myToken !== token || !global.Backup || !global.Backup.getAudio) {
          setTimeout(fail, 0);
          return;
        }
        var result;
        try {
          result = global.Backup.getAudio(text);
        } catch (err) {
          setTimeout(fail, 0);
          return;
        }
        // Garante o fallback mesmo se getAudio não retornar uma Promise.
        if (!result || typeof result.then !== 'function') {
          setTimeout(fail, 0);
          return;
        }
        Promise.resolve(result).then(function (file) {
          if (myToken !== token) return;
          if (!file) return fail();
          try {
            activeObjectUrl = URL.createObjectURL(file);
            done = true;
            trySource(activeObjectUrl, 'local', onFailure);
          } catch (err) {
            fail();
          }
        }).catch(fail);
        // Rede de segurança: se getAudio não retornar Promises que resolvam,
        // seguir para o proxy após 300ms.
        setTimeout(function () {
          if (myToken === token && !done) fail();
        }, 300);
      }

      // Ordem: arquivo salvo na pasta (offline) → proxy local → Google direto → voz do navegador.
      tryLocal(function () {
        trySource(proxyUrl(text, lang), 'proxy', function () {
          trySource(googleUrl(text, lang), 'google', tryBrowser);
        });
      });

      timer = setTimeout(function () { finish('timeout'); }, Math.max(9000, text.length * 200));
    });
  }

  var api = { speak: speak, stop: stop, googleUrl: googleUrl, proxyUrl: proxyUrl };
  global.TTS = api;
})(typeof window !== 'undefined' ? window : globalThis);
