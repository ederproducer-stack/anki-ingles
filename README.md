# Anki Inglês

Flashcards para treinar inglês no navegador, com a frase em inglês sendo lida em voz americana e a tradução em português brasileiro no outro lado do cartão.

**Criado por [Eder Oliveira](mailto:ederproducer@gmail.com)** · ederproducer@gmail.com

## Como rodar

Não precisa instalar nada (é HTML/CSS/JS puro). Basta servir a pasta com qualquer servidor estático:

O servidor já inicia automaticamente com o sistema via `~/.config/systemd/user/anki-ingles.service` (`enabled`). Abra <http://localhost:8080> no navegador.

Para controlar o serviço:

```bash
systemctl --user status anki-ingles.service
systemctl --user restart anki-ingles.service
systemctl --user stop anki-ingles.service
```

Para rodar manualmente (ex.: outro caminho de backup):

```bash
cd ~/Work/anki-ingles
python3 server.py 8080
```

> **Use o `server.py`** (e não `python3 -m http.server`): ele também serve o áudio do Google Tradutor por `/tts`, como mesma origem. Isso é necessário no **Brave**, que bloqueia a requisição direta ao Google com `ERR_BLOCKED_BY_ORB`. O app ainda tenta o endereço direto e a voz do navegador como reservas, então funciona parcialmente com qualquer servidor estático.
>
> Abrir o `index.html` direto não é recomendado por causa de restrições de `localStorage` e do proxy.

## Como usar

1. Na aba **Revisar**, a frase em inglês aparece e a voz já é reproduzida (se a opção estiver ligada). Use o botão 🔊 ou a tecla `R` para ouvir de novo.
2. Clique em **Mostrar resposta** (ou `Espaço`) para virar o cartão e ver a tradução em português.
3. Avalie com `De novo` / `Difícil` / `Bom` / `Fácil` (ou teclas `1` `2` `3` `4`). O intervalo até a próxima revisão aparece em cada botão.
4. A repetição espaçada é uma versão simplificada do SM-2 (o algoritmo do Anki): `De novo` volta o cartão para a mesma sessão; `Bom` segue 1 dia → 6 dias → intervalo × facilidade.

Outras abas:
- **Cartões**: adicionar, editar, excluir, buscar, importar e exportar.
  - Importar aceita linhas no formato `inglês :: português` (ou separadas por tab).
- **Estatísticas**: cartões, revisões de hoje, precisão e gráfico dos últimos 7 dias.
- **Configurações**: voz automática, velocidade, limites diários, modo livre e restauração do deck.

## Atualizar o app

Em **Configurações → Atualizar do GitHub**, clique em **Verificar atualizações**: o app consulta o repositório e mostra a versão instalada e a versão mais recente. Se houver commits novos, clique em **Atualizar agora**.

O servidor local executa `git pull --ff-only`, regenera o CSS do tema e recarrega a página automaticamente. Se `server.py` mudou, o serviço systemd é reiniciado sozinho.

Seus cartões, estatísticas, deck ativo e backup em HD não são afetados — tudo fica no `localStorage` e no HD, fora do repositório. Se houver arquivos de código modificados localmente, a atualização é bloqueada para não perder trabalho (os arquivos gerados do tema são descartados com segurança).

## Formatação das frases

Ao adicionar ou editar um cartão, os campos de frase são editores com formatação: selecione uma palavra e use a barra para aplicar **negrito**, *itálico*, <u>sublinhado</u>, cor ou limpar a formatação. Atalhos: `Ctrl+B`, `Ctrl+I`, `Ctrl+U`.

O HTML é sanitizado antes de salvar (só negrito, itálico, sublinhado, cor e quebras são permitidos), e convertido em texto puro para a voz, a busca e as mensagens. Cartões antigos com texto simples continuam funcionando normalmente.

## Decks

O seletor no topo da tabela mostra o deck ativo (com a quantidade de cartões) e o botão **+ Deck** cria outro. Em **Configurações → Deck atual** você pode renomear, importar e excluir decks.

- Cada deck tem seus próprios **cartões**, **estatísticas** e **pasta de backup**.
- Um deck novo pode começar vazio ou com as 30 frases de exemplo.
- **Importar deck** lê um JSON (o mesmo formato do backup) e cria um novo deck sem apagar os existentes.
- Não é possível excluir o único deck restante.
- Ao trocar de deck, a sessão de estudo recomeça e o TTS para.

Tudo fica salvo no `localStorage` do navegador (chave `anki-ingles-v2`). Se você usava uma versão anterior, os cartões são migrados automaticamente para um deck chamado "Meu deck".

## Backup automático em disco

Por padrão o `server.py` grava tudo em **`/run/media/eder/BACKUP/Anki`** (configurável pela variável `ANKI_BACKUP_DIR`). O diretório precisa existir e ser gravável.

O disco é montado automaticamente no boot via `/etc/fstab` em `/media/BACKUP` (ponto persistente), e `/run/media/eder/BACKUP` é um symlink recriado por `/etc/tmpfiles.d/backup-mount.conf`. Assim o caminho usado pelo app continua o mesmo; se o HD não estiver conectado, a montagem falha silenciosamente e o app cai para o backup no navegador (IndexedDB + ZIP).

A estrutura criada é:

```
/run/media/eder/BACKUP/Anki/
├── anki-ingles-backup.json   # cartões, configurações e estatísticas
├── app/                      # cópia dos arquivos do aplicativo
└── audio/                    # MP3 de cada frase
```

O save acontece na abertura do app e alguns segundos após cada alteração (cartão novo, avaliação, troca de deck etc.). O status em **Configurações → Pasta de backup** mostra o caminho e o horário do último salvamento.

Para usar outro caminho:

```bash
ANKI_BACKUP_DIR=/outro/caminho python3 server.py 8080
```

Se o diretório não existir ou não estiver gravável, o app cai automaticamente para o backup no navegador (IndexedDB + ZIP).

## Backup / pasta portátil

Em **Configurações → Pasta de backup** você pode escolher uma pasta (HD externo, pasta sincronizada etc.). O app grava nela:

- `anki-ingles-backup.json` — cartões, configurações e estatísticas;
- `app/` — cópia de todos os arquivos do app (`index.html`, `app.js`, `server.py` etc.);
- `audio/` — MP3 de cada frase, com nome estável derivado do texto.

Com a opção **Salvar backup e áudios automaticamente** ligada, o JSON é atualizado e o MP3 de cada frase nova é baixado alguns segundos após cada alteração. O botão **Salvar agora** também atualiza a cópia dos arquivos do app e dos áudios. **Restaurar** lê o JSON da mesma pasta (ou abre um seletor de arquivo como reserva).

O app sempre tenta tocar primeiro o MP3 salvo na pasta; só usa a internet se o arquivo não existir. Portanto, com os áudios baixados, ele funciona **offline** (desde que o `server.py` esteja rodando para servir os arquivos locais).

Depois de formatar o notebook: rode novamente o `server.py` a partir da pasta `app/` do backup e use **Restaurar** para trazer seus cartões. O acesso à pasta é lembrado pelo navegador; pode ser preciso conceder a permissão novamente após reiniciar o Brave.

### Brave / navegadores sem API de pastas

O Brave desabilita a File System Access API por padrão, então a opção de escolher pasta não aparece. Nesse caso:

- os MP3s são guardados no **IndexedDB do próprio navegador** (continuam funcionando offline);
- o botão **Baixar backup (ZIP com áudios)** gera um `.zip` com `anki-ingles-backup.json`, a pasta `app/` e a pasta `audio/` com todos os MP3s — é só extrair onde quiser.

Para restaurar, use o seletor de arquivo com o `anki-ingles-backup.json` extraído do ZIP.

Se quiser a integração com pastas no Brave, habilite `brave://flags/#file-system-access-api`, reinicie o navegador e escolha a pasta normalmente.

## Voz

A voz é sempre a do Google Tradutor (`tl=en`, sotaque dos Estados Unidos), obtida por:

```
GET /tts?q=<frase>&tl=en      ← proxy local do server.py (mesma origem)
```

O `server.py` busca o MP3 em `https://translate.google.com/translate_tts?...` e o devolve ao navegador. Se o proxy não estiver disponível, o app tenta o endereço do Google diretamente e, por fim, a síntese de voz do navegador em `en-US`.

- O endpoint do Google é não oficial (sem chave de API), então pode sofrer limitação ou mudanças.
- Respostas são guardadas em cache no servidor (máx. 200 frases) para evitar requisições repetidas.
- A reprodução automática depende da política de autoplay do navegador; se for bloqueada, clique no botão 🔊.

## Tema do sistema

O app usa as cores do tema Omarchy atual (arquivo `colors.toml`), e não apenas
um modo escuro genérico. O hook
`~/.config/omarchy/hooks/theme-set.d/anki-webapp-theme-sync` gera `theme.css` e
`theme-meta.json` a cada troca de tema; `theme-sync.js` troca a folha de estilo
em tempo real (sem recarregar a página) quando a geração muda.

Para aplicar manualmente (ou após mover a pasta do app):

```bash
~/.config/omarchy/hooks/theme-set.d/anki-webapp-theme-sync
```

Se o app estiver em outro caminho, use `ANKI_WEBAPP_DIR=/caminho/do/app`.

Uma cópia do hook está em `scripts/anki-webapp-theme-sync` para facilitar reinstalá-lo:

```bash
cp scripts/anki-webapp-theme-sync ~/.config/omarchy/hooks/theme-set.d/
chmod +x ~/.config/omarchy/hooks/theme-set.d/anki-webapp-theme-sync
```

O `--muted` é derivado de `foreground` + `background` via `color-mix` em vez de usar o valor `muted` do `colors.toml`: alguns temas (como "Matte Black") definem um `muted` muito escuro, que deixava as abas inativas ilegíveis. Isso garante contraste legível em qualquer tema.

## Testes

```bash
node --test tests/*.test.js
```
