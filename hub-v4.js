/* UI status and offline activation. Domain data stays in IndexedDB. */
(()=>{'use strict';const status=document.createElement('div');status.className='v4-status';status.setAttribute('role','status');status.setAttribute('aria-live','polite');function refresh(){const online=navigator.onLine;status.classList.toggle('offline',!online);status.textContent=online?'Portal online · dados locais':'Modo offline · dados locais'}window.addEventListener('online',refresh);window.addEventListener('offline',refresh);refresh();document.body.appendChild(status);if('serviceWorker' in navigator && location.protocol==='https:')window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(e=>console.warn('PWA indisponível:',e)));})();
/* HUB 4.1: collaborative stages; v3 data model and computations unchanged. */
(()=>{'use strict';
if(typeof Render==='undefined'||typeof State==='undefined'||Render.__hub41)return;
Render.__hub41=true;
const meta=[['Preparação','Confirme quem participa da construção.'],['Descoberta','Registre problemas antes de discutir soluções.'],['Avaliação','Avalie cada problema nos seis critérios.'],['Decisão','Compare pontuações e confirme a prioridade do grupo.'],['Construção','Desenhe processos e distribua atividades.'],['Consolidação','Confira dados, indicadores e decisões.'],['Entrega','Revise o relatório executivo.'],['Continuidade','Retome oportunidades e seus históricos.']];
const head=Render.head.bind(Render);
// Navegação única na lateral. O cabeçalho conserva o título e as ações originais.
Render.head=(i,actions='')=>head(i,actions);
const mapping=Render.mapping.bind(Render);
Render.mapping=()=>{
 const html=mapping();if(!State.demands().length)return html;
 return html.replace('<div class="cards">','<div class="v4-map-toolbar"><div><small>MAPA DE OPORTUNIDADES</small><strong id="v4MapCount">'+State.demands().length+' oportunidades</strong></div><label><span class="visually-hidden">Buscar problemas</span><input id="v4MapSearch" aria-label="Buscar problemas" placeholder="Buscar problema, área ou descrição" autocomplete="off"></label></div><div class="cards v4-map-cards" id="v4MapCards">');
};
const classification=Render.classification.bind(Render);
Render.classification=()=>{
 const html=classification(),ds=State.demands(),complete=ds.filter(Classification.complete).length;
 return html.replace('<div class="progress">','<div class="v4-progress-summary"><div><b>'+ds.length+'</b><span>Oportunidades</span></div><div><b>'+complete+'</b><span>Avaliadas</span></div><div><b>'+(ds.length-complete)+'</b><span>Pendentes</span></div><p>Escolha um problema, avalie os seis critérios e avance.</p></div><div class="progress">');
};
const ranking=Render.ranking.bind(Render);
Render.ranking=()=>{
 const html=ranking(),ds=State.demands().filter(d=>d.status!=='Arquivada');
 return html.replace('<div class="hint" style="margin-bottom:16px">','<div class="v4-ranking-header"><div><small>RESULTADO DO GRUPO</small><strong>'+ds.filter(Classification.complete).length+' de '+ds.length+' oportunidades avaliadas</strong></div><span>Prioridade baseada nos pesos existentes</span></div><div class="hint" style="margin-bottom:16px">');
};
document.addEventListener('input',e=>{if(e.target?.id!=='v4MapSearch')return;const term=e.target.value.trim().toLocaleLowerCase('pt-BR');let found=0;document.querySelectorAll('#v4MapCards .demand').forEach(el=>{const show=el.textContent.toLocaleLowerCase('pt-BR').includes(term);el.hidden=!show;if(show)found++});const el=document.querySelector('#v4MapCount');if(el)el.textContent=found+' resultado'+(found===1?'':'s');});
if(State.data){Render.page();Render.header();}
})();

/* Hub EMR Touch 4.3 — compact participant presentation only.
   Does not modify participants, session data, status, actions or IndexedDB. */
(()=>{'use strict';
if(typeof Render==='undefined'||!Render.participants||Render.__hub43)return;
Render.__hub43=true;
const original=Render.participants.bind(Render);
Render.participants=function(){
 let html=original();
 html=html.replace('<div class="grid3" style="margin-bottom:24px">','<div class="grid3 v4-participant-stats" style="margin-bottom:12px">');
 html=html.replace('<div class="row between" style="margin-bottom:16px"><h2>O grupo','<div class="row between v4-participant-listhead" style="margin-bottom:10px"><h2>O grupo');
 if(State.people().length===0){
  const pos=html.lastIndexOf('<div class="empty">');
  if(pos!==-1){
   html=html.slice(0,pos)+
   '<section class="v4-participant-empty" aria-label="Adicionar participantes">'+
     '<div class="v4-participant-empty-icon">'+icon('people')+'</div>'+
     '<div class="v4-participant-empty-copy"><h3>Nenhum participante cadastrado</h3>'+
     '<p>Adicione quem vai participar da construção da melhoria.</p></div>'+
     button('person-add',icon('plus')+'Adicionar participante','primary')+
   '</section>';
  }
 }
 return html;
};
if(State.data&&State.step===0)Render.page();
})();
