#!/usr/bin/env python3
"""
Servidor estático do app + proxy local do TTS + backup automático em disco.

O proxy do TTS existe porque o Brave bloqueia a requisição direta ao
translate.google.com com ERR_BLOCKED_BY_ORB.

O backup grava JSON, arquivos do app e MP3s em BACKUP_DIR (padrão:
/run/media/eder/BACKUP/Anki). Defina ANKI_BACKUP_DIR para outro caminho.
"""
import base64
import functools
import http.server
import json
import os
import shutil
import socketserver
import subprocess
import sys
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
CONFIG_FILE = os.path.join(ROOT, "backup-path.json")
DEFAULT_BACKUP_DIR = os.environ.get("ANKI_BACKUP_DIR", "/run/media/eder/BACKUP/Anki")


def load_backup_dir():
    """Lê o destino salvo pelo usuário; cai para o padrão se inválido."""
    try:
        with open(CONFIG_FILE, encoding="utf-8") as fh:
            path = json.load(fh).get("path")
            if path and os.path.isdir(path) and os.access(path, os.W_OK):
                return path
    except Exception:  # noqa: BLE001 - config ausente/corrompida
        pass
    return DEFAULT_BACKUP_DIR


BACKUP_DIR = load_backup_dir()
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36"
)

# Arquivos gerados localmente pelo hook de tema: podem ser descartados no update.
VERSION_FILE = os.path.join(ROOT, "version.json")
GENERATED_FILES = {"theme.css", "theme-meta.json"}
THEME_HOOK = os.path.expanduser(
    "~/.config/omarchy/hooks/theme-set.d/anki-webapp-theme-sync"
)


def git(*args):
    """Executa um comando git no diretório do app."""
    try:
        return subprocess.run(
            ["git", "-C", ROOT, *args], capture_output=True, text=True, timeout=120
        )
    except Exception as exc:  # noqa: BLE001
        return subprocess.CompletedProcess(args, 1, "", str(exc))


def version_info():
    """Lê version.json; cai para o hash curto se o arquivo não existir."""
    try:
        with open(VERSION_FILE, encoding="utf-8") as fh:
            data = json.load(fh)
        if data.get("version"):
            return {
                "label": "v" + str(data["version"]),
                "version": str(data["version"]),
                "notes": data.get("notes", "")
            }
    except Exception:  # noqa: BLE001
        pass
    return {"label": git_line("rev-parse", "--short", "HEAD") or "desconhecida",
            "version": "", "notes": ""}


def local_only(handler):
    """Só permite atualizar o app a partir da própria máquina."""
    return handler.client_address[0] in ("127.0.0.1", "::1", "::ffff:127.0.0.1")


def git_line(*args):
    result = git(*args)
    return result.stdout.strip() if result.returncode == 0 else ""


def update_check():
    """Busca alterações no GitHub e informa o que seria atualizado."""
    fetch = git("fetch", "origin")
    if fetch.returncode != 0:
        raise RuntimeError("Falha ao consultar o GitHub: " + (fetch.stderr.strip() or "erro de rede"))

    current = git_line("rev-parse", "HEAD")
    remote = git_line("rev-parse", "origin/main")
    if not current or not remote:
        raise RuntimeError("Não foi possível ler os commits (o repo tem origin/main?)")

    behind = git_line("rev-list", "--count", "%s..origin/main" % current) or "0"
    dirty_raw = git_line("status", "--porcelain", "--untracked-files=no")
    dirty = [line[3:] for line in dirty_raw.splitlines() if line]
    blocking = [f for f in dirty if f not in GENERATED_FILES]
    # Versão legível do GitHub (lida direto do commit remoto).
    remote_version = git_line("show", "origin/main:version.json")
    remote_label = None
    remote_notes = ""
    if remote_version:
        try:
            data = json.loads(remote_version)
            if data.get("version"):
                remote_label = "v" + str(data["version"])
                remote_notes = data.get("notes", "")
        except Exception:  # noqa: BLE001
            pass
    if not remote_label:
        remote_label = git_line("log", "-1", "--pretty=format:%h", "origin/main")

    return {
        "current": version_info()["label"],
        "remote": remote_label,
        "remoteNotes": remote_notes,
        "behind": int(behind),
        "dirty": dirty,
        "blocking": blocking
    }


def update_apply():
    """Aplica o git pull e retorna a lista de arquivos alterados."""
    before = git_line("rev-parse", "HEAD")
    dirty_raw = git_line("status", "--porcelain", "--untracked-files=no")
    dirty = [line[3:] for line in dirty_raw.splitlines() if line]
    blocking = [f for f in dirty if f not in GENERATED_FILES]
    if blocking:
        raise RuntimeError(
            "Existem alterações locais em: " + ", ".join(blocking) +
            ". Salve/reverta antes de atualizar."
        )

    # Descarta apenas os arquivos gerados pelo hook de tema.
    generated = [f for f in dirty if f in GENERATED_FILES]
    if generated:
        git("checkout", "--", *generated)

    pull = git("pull", "--ff-only", "origin", "main")
    if pull.returncode != 0:
        msg = (pull.stderr or pull.stdout or "erro desconhecido").strip()
        raise RuntimeError("Falha no git pull: " + msg[-600:])

    after = git_line("rev-parse", "HEAD")
    changed = []
    if before and after and before != after:
        changed = git_line("diff", "--name-only", before, after).splitlines()

    # Regera o tema caso os arquivos gerados tenham sido revertidos/alterados.
    if os.path.isfile(THEME_HOOK):
        try:
            subprocess.run(["bash", THEME_HOOK], capture_output=True, timeout=60)
        except Exception:  # noqa: BLE001
            pass

    server_changed = "server.py" in changed
    if server_changed:
        # Reinicia o serviço depois de responder, para o novo código carregar.
        try:
            subprocess.Popen(
                ["bash", "-c", "sleep 2; systemctl --user restart anki-ingles.service"],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
            )
        except Exception:  # noqa: BLE001
            pass

    return {
        "changed": changed,
        "serverChanged": server_changed,
        "newVersion": git_line("log", "-1", "--pretty=format:%h %ad %s", "--date=short", "HEAD")
    }

_cache = {}
_cache_max = 200


def fetch_tts(text, lang):
    key = (text, lang)
    if key in _cache:
        return _cache[key]
    query = urllib.parse.urlencode({"ie": "UTF-8", "client": "tw-ob", "tl": lang, "q": text})
    url = "https://translate.google.com/translate_tts?" + query
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=20) as response:
        data = response.read()
    if len(_cache) >= _cache_max:
        _cache.clear()
    _cache[key] = data
    return data


def backup_available():
    """Verifica se o diretório de backup existe e é gravável."""
    try:
        return os.path.isdir(BACKUP_DIR) and os.access(BACKUP_DIR, os.W_OK)
    except OSError:
        return False


def move_backup(old_dir, new_dir):
    """Copia todo o conteúdo da pasta antiga para a nova e troca o destino."""
    global BACKUP_DIR
    if not new_dir or not os.path.isabs(new_dir):
        raise ValueError("Informe um caminho absoluto (começando com /).")
    if not os.path.isdir(new_dir):
        raise ValueError("A pasta escolhida não existe.")
    if not os.access(new_dir, os.W_OK):
        raise ValueError("A pasta escolhida não é gravável.")

    old = os.path.realpath(old_dir or BACKUP_DIR)
    new = os.path.realpath(new_dir)
    copied = 0
    if old != new and os.path.isdir(old):
        for root, _dirs, files in os.walk(old):
            rel = os.path.relpath(root, old)
            dest_root = new if rel == "." else os.path.join(new, rel)
            os.makedirs(dest_root, exist_ok=True)
            for name in files:
                shutil.copy2(os.path.join(root, name), os.path.join(dest_root, name))
                copied += 1

    BACKUP_DIR = new
    with open(CONFIG_FILE, "w", encoding="utf-8") as fh:
        json.dump({"path": new}, fh)
    return {"path": new, "copiedFiles": copied, "previous": old}


def write_backup(payload, files, audio):
    """Grava JSON, arquivos do app e MP3s no diretório de backup."""
    if not backup_available():
        raise RuntimeError("Diretório de backup indisponível: " + BACKUP_DIR)

    app_dir = os.path.join(BACKUP_DIR, "app")
    audio_dir = os.path.join(BACKUP_DIR, "audio")
    os.makedirs(app_dir, exist_ok=True)
    os.makedirs(audio_dir, exist_ok=True)

    with open(os.path.join(BACKUP_DIR, "anki-ingles-backup.json"), "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)

    for name, content in (files or {}).items():
        # impede path traversal
        if os.path.basename(name) != name:
            continue
        with open(os.path.join(app_dir, name), "w", encoding="utf-8") as fh:
            fh.write(content)

    for name, data_b64 in (audio or {}).items():
        if os.path.basename(name) != name:
            continue
        with open(os.path.join(audio_dir, name), "wb") as fh:
            fh.write(base64.b64decode(data_b64))

    return {
        "path": BACKUP_DIR,
        "appFiles": len(files or {}),
        "audioFiles": len(audio or {}),
        "cards": len(payload.get("cards", [])),
    }


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)

        if parsed.path == "/update/version":
            info = version_info()
            self._json({"ok": True, "current": info["label"], "notes": info["notes"]})
            return

        if parsed.path == "/update/check":
            if not local_only(self):
                self.send_error(403)
                return
            try:
                self._json({"ok": True, **update_check()})
            except Exception as exc:  # noqa: BLE001
                self._json({"ok": False, "error": str(exc)}, status=500)
            return

        if parsed.path == "/backup/status":
            self._json({
                "available": backup_available(),
                "path": BACKUP_DIR,
                "hasBackup": os.path.isfile(os.path.join(BACKUP_DIR, "anki-ingles-backup.json")),
            })
            return

        if parsed.path == "/backup/load":
            try:
                with open(os.path.join(BACKUP_DIR, "anki-ingles-backup.json"), encoding="utf-8") as fh:
                    self._json({"ok": True, "data": json.load(fh)})
            except Exception as exc:  # noqa: BLE001
                self._json({"ok": False, "error": str(exc)}, status=404)
            return

        if parsed.path != "/tts":
            return super().do_GET()

        params = urllib.parse.parse_qs(parsed.query)
        text = params.get("q", [""])[0]
        lang = params.get("tl", ["en"])[0]
        if not text:
            self.send_error(400, "Parametro q obrigatorio")
            return

        try:
            data = fetch_tts(text, lang)
        except Exception as exc:  # noqa: BLE001
            self.send_error(502, "Falha ao buscar voz: %s" % exc)
            return

        self.send_response(200)
        self.send_header("Content-Type", "audio/mpeg")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "public, max-age=86400")
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass  # navegador abortou ao trocar de frase

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path not in ("/backup/save", "/backup/move", "/update"):
            self.send_error(404)
            return

        try:
            if parsed.path == "/update":
                if not local_only(self):
                    self.send_error(403)
                    return
                self._json({"ok": True, **update_apply()})
                return
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length).decode("utf-8"))
            if parsed.path == "/backup/move":
                result = move_backup(body.get("from"), body.get("to"))
            else:
                result = write_backup(body.get("payload", {}), body.get("files", {}), body.get("audio", {}))
            self._json({"ok": True, **result})
        except Exception as exc:  # noqa: BLE001
            self._json({"ok": False, "error": str(exc)}, status=500)

    def _json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def send_response(self, code, message=None):
        super().send_response(code, message)
        self._cache_control_sent = False

    def send_header(self, keyword, value):
        if keyword.lower() == "cache-control":
            self._cache_control_sent = True
        super().send_header(keyword, value)

    def end_headers(self):
        # Arquivos do app mudam com trocas de tema e edições; o navegador não
        # deve servir versões antigas do index.html/CSS/JS. /tts já define seu
        # próprio Cache-Control e fica de fora.
        if not getattr(self, "_cache_control_sent", False):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        path = args[1] if len(args) > 1 else ""
        if "/tts" in path or "/backup" in path or "/update" in path:
            super().log_message(fmt, *args)


class ReusableTCPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True


def main():
    handler = functools.partial(Handler, directory=ROOT)
    with ReusableTCPServer(("0.0.0.0", PORT), handler) as httpd:
        print("App:     http://localhost:%d" % PORT, flush=True)
        print("TTS:     http://localhost:%d/tts?q=...&tl=en" % PORT, flush=True)
        print("Backup:  %s (%s)" % (BACKUP_DIR, "disponível" if backup_available() else "INDISPONÍVEL"), flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
