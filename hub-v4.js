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

/* Hub EMR Touch 4.4 — contextual chrome and structured dialogs.
   Moves existing action buttons, leaving their commands and original DOM IDs intact. */
(()=>{'use strict';
const toolbar=document.querySelector('.top-actions');
if(!toolbar||toolbar.querySelector('#v4Tools'))return;
const settings=document.createElement('details');
settings.id='v4Tools';settings.className='v4-tools';
settings.innerHTML='<summary aria-label="Abrir ferramentas do encontro" title="Ferramentas do encontro">'+
'<svg viewBox="0 0 24 24" aria-hidden="true" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/><circle cx="9" cy="7" r="2" fill="white"/><circle cx="15" cy="12" r="2" fill="white"/><circle cx="9" cy="17" r="2" fill="white"/></svg>'+
'<span>Ferramentas</span></summary>'+
'<div class="v4-tools-panel" role="group" aria-label="Ferramentas do encontro">'+
'<div class="v4-tools-title">PREFERÊNCIAS E DADOS</div></div>';
const panel=settings.querySelector('.v4-tools-panel');
for(const id of ['sessionsIcon','densityBtn','dataBtn']){
 const element=document.getElementById(id);
 const button=id==='sessionsIcon'?element?.closest('button'):element;
 if(button){
   button.classList.add('v4-tools-item');
   panel.appendChild(button);
   if(button.id==='densityBtn')button.setAttribute('title','Alterar densidade da interface');
 }
}
const fullscreen=document.getElementById('fullscreenBtn');
toolbar.insertBefore(settings,fullscreen||null);
const labels=[['#densityBtn','Escala da interface'],['#dataBtn','Importar / exportar backup']];
for(const [selector,label] of labels){const b=panel.querySelector(selector);if(!b)continue;const span=document.createElement('span');span.className='v4-tools-item-label';span.textContent=label;if(selector==='#densityBtn')b.insertBefore(span,b.querySelector('#densityLabel'));else b.appendChild(span);}
document.addEventListener('pointerdown',e=>{if(settings.open&&!settings.contains(e.target))settings.open=false},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&settings.open){settings.open=false;settings.querySelector('summary').focus()}},true);
panel.addEventListener('click',e=>{if(e.target.closest('button'))settings.open=false});
if(typeof Dialog!=='undefined'&&!Dialog.__hub44){
 Dialog.__hub44=true;const originalOpen=Dialog.open.bind(Dialog);
 const hints=[
  [/participante/i,'Preencha os dados da pessoa que participará da maratona.'],
  [/problema|demanda/i,'Descreva o problema com clareza para facilitar a priorização.'],
  [/encontro|sessão/i,'Organize os dados e as configurações do encontro.'],
  [/post-it|atividade|tarefa/i,'Defina a atividade e registre as informações necessárias.'],
  [/revisão|relatório/i,'Confira as informações antes de finalizar o encontro.'],
  [/PIN/i,'Acesso local do facilitador; não substitui autenticação corporativa.']
 ];
 Dialog.open=function(title,body,footer='',save=null){
  originalOpen(title,body,footer,save);
  const modal=document.getElementById('modal');const titleEl=modal?.querySelector('#modalTitle');
  if(!titleEl)return;
  const match=hints.find(([re])=>re.test(title));
  const head=modal.querySelector('.modal-head');
  if(!head)return;
  head.classList.add('v4-modal-head');
  const main=document.createElement('div');main.className='v4-modal-titlewrap';
  const kicker=document.createElement('span');kicker.className='v4-modal-kicker';kicker.textContent='HUB EMR · FORMULÁRIO';
  const desc=document.createElement('p');desc.className='v4-modal-description';desc.textContent=match?match[1]:'Confira os dados e confirme sua ação.';
  titleEl.parentNode.insertBefore(main,titleEl);
  main.append(kicker,titleEl,desc);
  const bodyEl=modal.querySelector('.modal-body');if(bodyEl)bodyEl.classList.add('v4-modal-body');
  const footerEl=modal.querySelector('.modal-foot');if(footerEl)footerEl.classList.add('v4-modal-footer');
 };
}
})();
