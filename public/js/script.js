const path=location.pathname.replace(/\.html$/,'').replace(/\/$/,'')||'/';
const inCaseStudy=path.includes('/case-studies/');
const isMilestones=path.endsWith('/milestones');
const isHome=path==='/'||path.endsWith('/index');

/* Selected-work filter */
const lensCopy={
  all:'Four pieces of work. Same person.',
  data:'Where the medium was data and logic.',
  product:'Where the job was discovery, scope and roadmap.',
  transformation:'Where the job was coordinated change.'
};
const lensButtons=[...document.querySelectorAll('.lens-button')];
const caseCards=[...document.querySelectorAll('.case-card')];
const caseGrid=document.querySelector('.case-grid');
const lensSummary=document.querySelector('#lens-summary strong');
const syncCaseGrid=()=>{
  if(!caseGrid) return;
  const visible=caseCards.filter(card=>!card.classList.contains('is-hidden')).length;
  caseGrid.dataset.visibleCount=String(visible);
};
lensButtons.forEach(button=>{
  button.addEventListener('click',()=>{
    const lens=button.dataset.lens;
    lensButtons.forEach(b=>{
      const active=b===button;
      b.classList.toggle('active',active);
      b.setAttribute('aria-selected',active?'true':'false');
    });
    if(lensSummary) lensSummary.textContent=lensCopy[lens]||lensCopy.all;
    caseCards.forEach(card=>{
      const tags=(card.dataset.tags||'').split(/\s+/);
      const match=lens==='all'||tags.includes(lens);
      card.classList.toggle('is-hidden',!match);
      card.setAttribute('aria-hidden',match?'false':'true');
    });
    syncCaseGrid();
  });
});
syncCaseGrid();

/* Homepage milestone expansion + filter */
const homeMilestones=document.querySelector('.home-milestones');
if(homeMilestones){
  const milestoneCards=[...homeMilestones.querySelectorAll('.milestone-card')];
  milestoneCards.forEach(card=>{
    const label=[card.querySelector('.milestone-card-year')?.textContent,card.querySelector('strong')?.textContent].filter(Boolean).join(' — ');
    if(label) card.setAttribute('aria-label',label);
    card.addEventListener('click',()=>{
      const open=card.classList.toggle('is-open');
      card.setAttribute('aria-expanded',open?'true':'false');
    });
  });
  homeMilestones.querySelectorAll('.home-milestone-filter').forEach(button=>{
    button.addEventListener('click',()=>{
      const lens=button.dataset.homeLens;
      homeMilestones.querySelectorAll('.home-milestone-filter').forEach(b=>{
        const active=b===button;
        b.classList.toggle('active',active);
        b.setAttribute('aria-selected',active?'true':'false');
      });
      milestoneCards.forEach(card=>{
        const tags=(card.dataset.homeTags||'').split(/\s+/);
        const match=lens==='all'||tags.includes(lens);
        card.classList.toggle('is-hidden',!match);
        card.setAttribute('aria-hidden',match?'false':'true');
      });
    });
  });
}

/* Full milestone-page filter */
const milestoneButtons=[...document.querySelectorAll('.milestone-filter')];
const milestones=[...document.querySelectorAll('.milestone-item')];
const milestoneCount=document.querySelector('#milestone-count');
milestoneButtons.forEach(button=>{
  button.addEventListener('click',()=>{
    const lens=button.dataset.milestoneLens;
    milestoneButtons.forEach(b=>{
      const active=b===button;
      b.classList.toggle('active',active);
      b.setAttribute('aria-selected',active?'true':'false');
    });
    let shown=0;
    milestones.forEach(item=>{
      const tags=(item.dataset.milestoneTags||'').split(/\s+/);
      const match=lens==='all'||tags.includes(lens);
      item.classList.toggle('is-hidden',!match);
      item.setAttribute('aria-hidden',match?'false':'true');
      if(match) shown++;
    });
    if(milestoneCount) milestoneCount.textContent=`${shown} selected milestone${shown===1?'':'s'}`;
  });
});

/* Reveal behaviour */
const reveals=[...document.querySelectorAll('.reveal')];
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const compactScreen=window.matchMedia('(max-width: 720px)').matches;
const immediate=new Set(document.querySelectorAll('.hero .reveal,.metrics .reveal,.case-hero.reveal,.milestones-hero .reveal'));
immediate.forEach(el=>el.classList.add('visible'));
const animated=reveals.filter(el=>!immediate.has(el));
if(reducedMotion||compactScreen||!('IntersectionObserver' in window)){
  animated.forEach(el=>el.classList.add('visible'));
}else{
  const observer=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting){
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  },{threshold:.06,rootMargin:'100px 0px'});
  animated.forEach(el=>observer.observe(el));
}
