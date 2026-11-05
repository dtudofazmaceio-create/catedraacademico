# Escala do Cátedra (versão 2026.11.4-2)

© 2026 Mercatto Labs. Todos os direitos reservados.

Arquivos desta versão:
- `index.html`: o site.
- `worker.js`: o servidor.
- `ferramentas/worker-anterior-2026.11.1-1.js`: o servidor anterior, para voltar atrás se for preciso.
- `ferramentas/teste-carga.mjs`: a ferramenta de teste de carga.

O site novo funciona com o servidor antigo e vice-versa, então dá para publicar em qualquer ordem.

## 1. O que mudou e o resultado nos testes

Os testes rodaram no simulador oficial da Cloudflare (Miniflare), com a regra real do KV: 1 gravação por segundo na mesma chave.

| Situação testada | Servidor anterior | Servidor novo |
|---|---|---|
| 40 alunos enviando no mesmo segundo (fim da prova) | 1 aceito; **39 viram "Erro interno"**, embora o envio tenha sido gravado | **40 aceitos**, nenhum erro |
| Correção por IA nesse pico | 1 corrigido pela IA; os outros 39 caíram na correção gratuita | **40 corrigidos pela IA** |
| Contagem da cota de IA nesse pico | 1 (deveria ser 40) | **40** |
| Dois aparelhos do professor sincronizando juntos | **uma alteração se perdia** | as duas são mantidas (no KV e no D1) |
| Sincronização sem nada novo | servidor reenviava todos os dados | resposta vazia (292 bytes no teste) |
| Alteração de 1 aluno | ~2.800 bytes no teste, crescendo com o tamanho das turmas | 372 bytes (só o que mudou) |
| Painel do administrador | baixava os dados completos de cada professor | lê só as contagens |
| IA sobrecarregada (erro 529) | erro para o aluno | com a fila: envio aceito, nova tentativa automática e nota pela IA |

Detalhes das mudanças:
- **Gravações que o KV recusa por excesso:** são repetidas depois de cerca de 1 s. Se não der, o servidor responde "ocupado, tente de novo" (503 com `Retry-After`) em vez de "erro interno", e o site tenta de novo sozinho.
- **Marcador de novas entregas:** passou a ser "melhor esforço" e não derruba mais o envio do aluno.
- **Cota de IA:** cada correção conta separadamente, sem conflito. Com o D1, o contador é atômico. A contagem do mês atual é mantida na atualização.
- **Limite mensal de IA atingido:** agora responde 403 ("não adianta tentar de novo") em vez de 429.
- **Sincronização:** o servidor marca a hora de chegada de cada registro e devolve só o que mudou. O site envia só os registros alterados, com um envio completo de segurança a cada 10 min (KV) ou 6 h (D1).

## Novidade da versão 2026.11.4-2

O servidor ganhou as rotas da **apresentação editável** (Gestão → Apresentação): capa, slides com imagem ou vídeo do YouTube, clientes com logomarca, ordem dos slides e slides ocultos. As imagens ficam no KV, uma chave por imagem.

Para editar a apresentação é preciso publicar este `worker.js`. Sem ele, a apresentação continua mostrando a versão padrão.

## 2. Publicar (obrigatório)

1. **Site:** publique o novo `index.html` (e o `apresentacao.html`), como sempre.
2. **Servidor:** no painel da Cloudflare, abra **Workers e Pages → catedra-api → Editar código**. Apague o conteúdo, cole o novo `worker.js` inteiro e clique em **Implantar**.
3. No Cátedra, entre como administrador e abra **Detalhes** no painel de saúde. Deve aparecer "versão 2026.11.4-2".

Só com isso já valem todas as correções da tabela acima, usando o KV que você já tem.

## 3. Plano Workers Paid (recomendado; obrigatório para a fila)

Em **Workers e Pages → Planos**, assine o **Workers Paid** (US$ 5/mês). Ele remove o limite de 1.000 gravações por dia no KV e o de 10 ms de processamento por chamada.

## 4. Recursos opcionais de escala (ative quando crescer)

Para cada recurso, depois de criar, vá em **Workers e Pages → catedra-api → Configurações → Vínculos → Adicionar**, use **exatamente** o nome indicado e clique em **Implantar**.

### 4.1 Banco D1 (nome do vínculo: `SQL`)
- **Para que serve:** turmas, alunos e atividades passam a ser gravados registro a registro (sem conflito entre aparelhos) e a cota de IA fica exata.
- **Como criar:** **Armazenamento e bancos de dados → D1 → Criar banco**, com o nome `catedra`. Depois, vincule ao worker como **Banco de dados D1**, com o nome `SQL`.
- **Migração:** é automática, professor por professor, na primeira sincronização. As entregas continuam no KV, porque lá já não têm conflito.
- **Importante:** depois de ativar, **não remova o vínculo `SQL`**. Se ele sumir, o servidor bloqueia a sincronização com uma mensagem explicando, em vez de mostrar dados antigos.

### 4.2 Fila de correção (nome do vínculo: `FILA`; exige o Workers Paid)
- **Para que serve:** o envio do aluno é gravado na hora e a correção por IA roda em segundo plano, com novas tentativas quando a IA está ocupada. A tela do aluno mostra "Corrigindo…" e o resultado aparece sozinho. O professor vê "corrigindo…" até a nota chegar.
- **Como criar:** **Filas (Queues) → Criar fila**, com o nome `catedra-correcoes`. Vincule ao worker como **Fila (produtor)**, com o nome `FILA`.
- **Consumidor:** na página da fila, em **Consumidores → Adicionar consumidor**, escolha o worker `catedra-api`.
  - Lote: 5 mensagens.
  - Novas tentativas: o padrão (3) já serve.
  - Para não estourar o limite de uso da IA, limite as **invocações simultâneas** a um número baixo, como 5.

### 4.3 Arquivos R2 (nome do vínculo: `ARQ`)
- **Para que serve:** guarda as fotos enquanto a fila corrige. Sem ele, as fotos esperam no KV por até 2 dias.
- **Como criar:** **R2 → Criar bucket**, com o nome `catedra-arquivos`. Vincule como **Bucket R2**, com o nome `ARQ`.

O painel de saúde do administrador mostra quais recursos estão ativos: Banco KV ou D1, Fila e Arquivos R2.

## 5. Teste de carga (`ferramentas/teste-carga.mjs`)

É preciso ter o Node.js 18 ou mais novo.

```bash
# Seguro, só leitura
node ferramentas/teste-carga.mjs --api https://catedra-api.peixoto-adm85.workers.dev --conc 50 --seg 60
# Alunos abrindo uma atividade (só leitura)
node ferramentas/teste-carga.mjs --modo atividade --link "LINK_DO_ALUNO" --conc 40 --seg 60
# Professores sincronizando: GRAVA no banco, use uma CONTA DE TESTE
node ferramentas/teste-carga.mjs --api https://... --modo sync --token SESSAO_DE_TESTE --prof 200 --seg 120
```

## 6. Voltar atrás

Cole o arquivo `ferramentas/worker-anterior-2026.11.1-1.js` no worker e implante.

Isso só é seguro **antes de ativar o D1**. Depois da migração, os dados novos ficam no D1, e o servidor anterior não sabe lê-los.
