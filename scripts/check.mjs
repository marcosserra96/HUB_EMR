// Verificações estáticas do Hub EMR (sem dependências). Uso: npm run check
// Falha (código 1) quando alguma regra do AGENTS.md / MASTER.md é quebrada.
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';

const problems = [];
const read = path => readFileSync(path, 'utf8');
const list = dir => readdirSync(dir).filter(f => !f.startsWith('.')).map(f => `${dir}/${f}`);

// 1. Sintaxe de todos os scripts.
for (const file of list('js')) {
  try { new vm.Script(read(file), { filename: file }); } catch (e) { problems.push(`${file}: erro de sintaxe — ${e.message}`); }
}

// 2. Cores só em tokens.css (o relatório impresso tem exceção documentada em js/review.js).
for (const file of list('css').filter(f => !f.endsWith('tokens.css'))) {
  read(file).split('\n').forEach((line, i) => {
    if (/#[0-9a-fA-F]{3,8}\b/.test(line) && !/^\s*\/\*/.test(line)) problems.push(`${file}:${i + 1}: cor fixa fora de tokens.css → use uma variável`);
  });
}

// 3. !important só nos utilitários de base.css.
for (const file of list('css')) {
  read(file).split('\n').forEach((line, i) => {
    if (line.includes('!important') && !(file.endsWith('base.css') && /visually-hidden|\[hidden\]|prefers-reduced-motion|transition-duration/.test(line))) {
      problems.push(`${file}:${i + 1}: !important fora dos utilitários`);
    }
  });
}

// 4. index.html carrega todos os arquivos, e o service worker os coloca em cache.
const html = read('index.html');
const sw = read('sw.js');
for (const file of [...list('css'), ...list('js')]) {
  if (!html.includes(`./${file}`)) problems.push(`index.html não carrega ${file}`);
  if (!sw.includes(`'./${file}'`)) problems.push(`sw.js não guarda ${file} no cache (uso offline)`);
}

// 5. Versão única: APP_VERSION (js/core.js) e CACHE (sw.js) andam juntos.
const version = read('js/core.js').match(/APP_VERSION = '([\d.]+)'/)?.[1];
const cache = sw.match(/CACHE = 'hub-emr-v([\d-]+)'/)?.[1];
if (!version || !cache || version.replace(/\./g, '-') !== cache) problems.push(`versão divergente: APP_VERSION=${version} e CACHE=hub-emr-v${cache}`);
const pkg = JSON.parse(read('package.json')).version;
if (!pkg.startsWith(version + '.') && pkg !== version) problems.push(`package.json (${pkg}) não corresponde a APP_VERSION (${version})`);

// 6. Texto da interface: nada de "(s)" para plural.
for (const file of list('js')) {
  read(file).split('\n').forEach((line, i) => {
    if (/^\s*(\/\/|\/\*|\*)/.test(line)) return;
    if (/['"`][^'"`]*[a-zá-ú]\(s\)[^'"`]*['"`]/i.test(line)) problems.push(`${file}:${i + 1}: use plural() em vez de "(s)"`);
  });
}

if (problems.length) {
  console.error(`✘ ${problems.length} ${problems.length === 1 ? "problema" : "problemas"}:\n` + problems.map(p => '  · ' + p).join('\n'));
  process.exit(1);
}
console.log('✓ Verificações estáticas ok (sintaxe, tokens, !important, cache offline, versão, plurais).');
