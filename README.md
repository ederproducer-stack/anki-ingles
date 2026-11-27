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
4. A repetição espaçada é uma versão simplificada do SM-2 (o algoritmo do Anki): `De novo` volta o cartão para a mesma sessão; `Bom` segue 1 dia → 6 dias → intervalo × facilidade. O vencimento cai sempre na **virada do dia (00:00)**, nunca 24 horas após a avaliação — um cartão avaliado hoje às 10:13 com `Bom` volta amanhã às 00:00. O intervalo tem **teto de 30 dias** e recebe uma pequena variação aleatória no vencimento para os cartões não caírem todos no mesmo dia. Cartões com intervalos antigos acima de 30 dias são reagendados automaticamente na primeira abertura, com aviso na tela.

Outras abas:
- **Cartões**: adicionar, editar, excluir (com **Desfazer** no aviso), buscar e trocar cartões com planilhas.
  - **Importar** abre a colagem inteligente de frases (ou escolha de CSV); **Baixar** gera o CSV (veja abaixo).
- **Estatísticas**: retenção, sequência de dias, memorizados, total de cartões, gráfico dos últimos 7 dias (com acertos) e distribuição dos cartões.
- **Configurações**: voz automática, velocidade, limites diários, modo livre, backup, atualização, **Reiniciar estudo** (zera progresso e estatísticas sem apagar cartões nem baralhos) e um bloco com descrição e créditos do app.

## Modos de treino

Na tela **Revisar**, os botões acima do cartão ativam modos exclusivos — só um fica destacado por vez; clique de novo no mesmo para voltar ao modo normal:

- **Só ouvido**: a frase em inglês fica oculta até o áudio terminar de tocar — tente entender só pela escuta. Se o navegador bloquear ou não houver áudio, ela aparece na hora para não travar o cartão.
- **Quiz**: quatro alternativas em português, formadas pelas traduções de outros cartões do mesmo deck. Acerto conta como *Bom*; erro conta como *De novo* e mostra a resposta. As teclas `1`–`4` escolhem as opções.
- **Mais Difíceis**: reúne só os cartões em que você mais errou (mais repetições perdidas e menor facilidade), ignorando as datas de revisão. Um cartão sai do filtro quando vira bem memorizado (intervalo de 21 dias), mesmo tendo errado antes. O número no botão mostra quantos cartões entram nesse filtro e atualiza a cada avaliação.

As alternativas vêm dos próprios cartões e a voz usa o áudio em cache do servidor local — os modos funcionam sem internet.

## Colar uma lista de frases

Em **Cartões → Importar**, cole uma lista simples — não precisa montar planilha. A prévia aparece antes de adicionar. Aceito:

- `How are you? :: Como vai?` (também tab, `-`, `→`, `|`, `=`, `:` e `;`);
- frases em linhas alternadas (inglês, português);
- marcadores de lista (`-`, `•`, `1.`), aspas e comentários com `#`;
- ordem invertida (`Você está bem? :: Are you okay?`) é corrigida automaticamente.

Linhas sem par são ignoradas e contadas na prévia, e frases repetidas no deck não são adicionadas de novo. O mesmo modal tem **Escolher arquivo CSV** para quem já usa planilha.

## Importar e baixar em CSV

Na aba **Cartões**, **Baixar** gera `anki-ingles-cartoes-AAAA-MM-DD.csv` (UTF-8 com BOM, para abrir no Excel) com as colunas `front,back,notes` — frente em inglês, verso em português e notas. A formatação rica é convertida em texto puro; para preservar negrito/itálico/cor, use o backup ZIP.

**Importar** escolhe um arquivo `.csv` e mostra quantos cartões foram encontrados. Você pode **Adicionar** ao deck atual ou **Substituir** todos os cartões dele (com confirmação). O delimitador é detectado automaticamente entre vírgula, ponto e vírgula (comum no Excel em português) e tab. Cabeçalhos em português (`Inglês,Português,Notas`) ou inglês (`front,back,notes`) são reconhecidos, assim como aspas escapadas, quebras de linha dentro de campos e BOM. Linhas sem frente ou verso são ignoradas; o progresso de estudo dos cartões importados recomeça do zero.

## Estatísticas

Os cartões do painel usam: **Retenção** = acertos (Bom/Fácil) sobre o total de revisões; **Sequência** = dias consecutivos com revisão (terminando hoje ou ontem), com as revisões de hoje em relação ao limite diário; **Memorizados** = cartões com intervalo de 21 dias ou mais; **Total de Cartões** = quantos cartões há no deck e quantos estão para revisar.

O gráfico dos últimos 7 dias mostra o total de revisões (azul) e os acertos (verde) de cada dia. A distribuição separa os cartões em novos (ainda não revisados), em estudo e bem memorizados.

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
