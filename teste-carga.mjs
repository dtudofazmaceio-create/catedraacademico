#!/usr/bin/env node
/* =========================================================
   Cátedra · teste de carga do servidor (Cloudflare Worker)
   © 2026 Mercatto Labs. Todos os direitos reservados.

   Requer Node 18 ou mais novo. Exemplos:

   1) Só leitura (padrão, seguro): 50 acessos simultâneos ao /health por 60 s
      node teste-carga.mjs --api https://catedra-api.SEU.workers.dev --conc 50 --seg 60

   2) Alunos abrindo uma atividade (só leitura): cole o link do aluno
      node teste-carga.mjs --modo atividade --link "https://.../#/enviar/XXXX" --conc 40 --seg 60

   3) Professores sincronizando (GRAVA no banco: use uma CONTA DE TESTE):
      node teste-carga.mjs --api https://... --modo sync --token SESSAO_DA_CONTA_DE_TESTE --prof 200 --seg 120
      (a sessão está no navegador logado na conta de teste: localStorage "catedra_tok")
      Atenção: no plano gratuito da Cloudflare, este modo consome a cota diária do banco.
   ========================================================= */
const arg = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, v) => (x.startsWith('--') ? a.push([x.slice(2), v[i + 1] && !v[i + 1].startsWith('--') ? v[i + 1] : '1']) : 0, a), []));
const modo = arg.modo || 'health', seg = +arg.seg || 60, conc = +arg.conc || 20, prof = +arg.prof || 50;
let api = String(arg.api || '').replace(/\/+$/, ''), atv = '';
if (modo === 'atividade') {
  const m = String(arg.link || '').match(/#\/enviar\/([\w-]+)/); if (!m) sair('Informe --link com o link de envio do aluno.');
  const OBF = Buffer.from('catedra::link::v1'), b = Buffer.from(m[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const P = JSON.parse(Buffer.from(b.map((x, i) => x ^ OBF[i % OBF.length])).toString()); api = P.w.replace(/\/+$/, ''); atv = P.a;
}
if (!/^https:\/\//.test(api) && !process.env.CATEDRA_TESTE) sair('Informe --api com o endereço https do servidor.');
if (modo === 'sync' && !arg.token) sair('O modo sync precisa de --token (sessão de uma conta de teste).');
function sair(m) { console.error('Erro: ' + m); process.exit(1); }

const R = { total: 0, ok: 0, s429: 0, s5xx: 0, s4xx: 0, rede: 0, lat: [] }, fim = Date.now() + seg * 1000;
async function req(path, body) {
  const t0 = performance.now(); R.total++;
  try {
    const r = await fetch(api + path, { method: body ? 'POST' : 'GET', headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(arg.token ? { authorization: 'Bearer ' + arg.token } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
    await r.arrayBuffer(); R.lat.push(performance.now() - t0);
    if (r.ok) R.ok++; else if (r.status === 429) R.s429++; else if (r.status >= 500) R.s5xx++; else R.s4xx++;
  } catch { R.rede++; }
}
const dorme = ms => new Promise(r => setTimeout(r, ms));
async function trabalhador() { while (Date.now() < fim) await req(modo === 'atividade' ? '/atividade?a=' + encodeURIComponent(atv) : '/health'); }
async function professor(i) { // simula o site: sincroniza a cada ~60 s, começando em momentos diferentes
  await dorme(Math.random() * (process.env.CATEDRA_TESTE ? 500 : 60000)); let rev = 0, since = 0;
  while (Date.now() < fim) { await req('/sync', { since, rev, data: { v: 1, turmas: [], alunos: [], atividades: [] }, cfg: {}, entregas: [] }); since = Date.now() - 60000; await dorme(process.env.CATEDRA_TESTE ? 300 : 48000 + Math.random() * 24000); }
}
const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return Math.round(s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]); };
console.log(`Teste de carga · modo ${modo} · ${modo === 'sync' ? prof + ' professores' : conc + ' simultâneos'} · ${seg} s · ${api}`);
const t0 = Date.now(), tick = setInterval(() => process.stdout.write(`\r  ${R.total} requisições · ${R.ok} ok · ${R.s429} recusadas (429) · ${R.s5xx} erros 5xx · ${R.rede} falhas de rede   `), 1000);
await Promise.all(modo === 'sync' ? Array.from({ length: prof }, (_, i) => professor(i)) : Array.from({ length: conc }, trabalhador));
clearInterval(tick); const dur = (Date.now() - t0) / 1000;
console.log(`\n\nResultado
  Requisições: ${R.total} (${(R.total / dur).toFixed(1)}/s)
  Sucesso: ${R.ok} (${(100 * R.ok / Math.max(1, R.total)).toFixed(1)}%)
  Recusadas por excesso (429): ${R.s429}   Erros do servidor (5xx): ${R.s5xx}   Outros 4xx: ${R.s4xx}   Falhas de rede: ${R.rede}
  Tempo de resposta: mediana ${pct(R.lat, 50)} ms · 95% até ${pct(R.lat, 95)} ms · 99% até ${pct(R.lat, 99)} ms
${R.s429 || R.s5xx ? '\n  O servidor chegou ao limite. Veja o plano da Cloudflare (Workers Paid) e os limites do banco KV.' : '\n  Sem recusas nem erros nesta carga.'}`);
