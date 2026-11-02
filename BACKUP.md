# Backup global (versão 2026.11.2-1)

## O que entra no arquivo

O arquivo é criptografado com AES-GCM 256. A chave vem da senha via PBKDF2-SHA256 com 600 mil iterações. Depois de gerar o arquivo, o sistema o abre de novo com a senha e confere se está igual aos dados coletados.

| Parte | Professor | Administrador (Gestão → Backup) |
|---|---|---|
| Turmas, alunos, atividades e entregas (baixa tudo do servidor antes de copiar) | ✓ | ✓ (estão no banco) |
| Perfil, modo de correção, plano, solicitação e cota de IA | ✓ | ✓ |
| Todos os bancos IndexedDB `catedra*` deste navegador, com os registros brutos | ✓ | ✓ |
| localStorage `catedra_*` (modelo de convite, avisos enviados, alunos lembrados…) | ✓ | ✓ |
| **Banco de dados do servidor**: todos os arquivos do Gist | — | ✓ |
| **Chaves e segredos**: GITHUB_TOKEN, GIST_ID, AI_KEY, AI_PROVIDER, AI_MODEL, ANTHROPIC_WORKSPACE, SESSION_SECRET, ALLOWED_ORIGIN e outras variáveis | — | ✓ |
| Professores, pagamentos, regras de cobrança, planos, solicitações e código de convite | — | ✓ |
| `/health` do servidor | ✓ | ✓ |

No final, o relatório da exportação lista o que ficou de fora. Exemplo: uma chave que o Worker usa mas que não foi informada.

## Restauração

Você escolhe o que restaurar, item por item:
- **Dados:** o registro mais recente vence, e depois tudo é reenviado ao servidor.
- **Banco local e preferências.**
- **Perfil.**
- **Banco de dados:** grava no Gist original ou num Gist novo. Opcionalmente, apaga do Gist o que não está no backup, para a restauração ficar exata.
- **Configurações de gestão:** reaplica regras de cobrança, convite e o cadastro dos professores.
- **Chaves:** mostra as chaves com botões de copiar, para você cadastrar de novo na Cloudflare.

## Endpoints opcionais no Worker

A Cloudflare não deixa ninguém ler um segredo depois de salvo. Por isso o administrador digita as chaves na tela de backup, ou carrega de um backup anterior. Se o Worker oferecer os endpoints abaixo (só para administrador), o sistema também os usa:

- `GET /admin/backup` → `{ dados: { …tudo o que o Worker guarda… }, segredos: { GITHUB_TOKEN: "...", AI_KEY: "...", ... } }`
- `POST /admin/restaurar` com o corpo `{ dump }` → regrava o conteúdo de `dados`

Se o Worker não tiver essas rotas (resposta 404), o backup continua normalmente sem elas.

## Outras alterações

- A CSP agora permite `https://api.github.com` e `https://gist.githubusercontent.com`. Antes, o navegador bloqueava a leitura do Gist.
