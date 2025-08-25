// FP OPS HUB – PWA stand-alone application (Supabase v2 + Auth OTP + Realtime)

(() => {
  // ---------- Config ----------
  const DOMAINS = ['entreprise', 'dev', 'production', 'marketing', 'legal', 'social'];
  const IDEA_STATUSES = { new: 'Nouvelles', in_discussion: 'En discussion', approved: 'Approuvées', rejected: 'Rejetées' };
  const STORAGE_KEY = 'fpOpsData';

  // >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
  // RENSEIGNE TON PROJET SUPABASE ICI
  const SUPABASE_URL = 'https://yhupytjyahcgfohvrmjp.supabase.co'; // ton domaine .supabase.co
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlodXB5dGp5YWhjZ2ZvaHZybWpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYxMDc4MTksImV4cCI6MjA3MTY4MzgxOX0.XXfNG9h6M2QsA61YTdOpVKR5H6IJY9vZvpzOQtAPIl0';            // <-- remplace par ta clé anon
  // <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

  // ---------- Etat local ----------
  let data = { ideas: [], tasks: [], logs: [], currentUser: '' };

  // ---------- Supabase client ----------
  let supabaseClient = null;
  if (typeof window !== 'undefined' && window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  // ---------- Sélecteurs UI ----------
  const navButtons = document.querySelectorAll('#app-nav button');
  const views = {
    inbox: document.getElementById('view-inbox'),
    'checklist-entreprise': document.getElementById('view-checklist-entreprise'),
    'checklist-dev': document.getElementById('view-checklist-dev'),
    meeting: document.getElementById('view-meeting'),
    myday: document.getElementById('view-myday'),
    priorities: document.getElementById('view-priorities'),
    calendar: document.getElementById('view-calendar'),
  };
  const inboxColumns = document.getElementById('inbox-columns');
  const listEntreprise = document.getElementById('list-entreprise');
  const listDev = document.getElementById('list-dev');
  const meetingCard = document.getElementById('meeting-card');
  const mydayList = document.getElementById('myday-list');
  const prioritiesList = document.getElementById('priorities-list');
  const globalSearch = document.getElementById('global-search');
  const filterDomain = document.getElementById('filter-domain');
  const filterStatus = document.getElementById('filter-status');
  const modalOverlay = document.getElementById('modal-overlay');
  const modalTitle = document.getElementById('modal-title');
  const modalTitleInput = document.getElementById('modal-title-input');
  const modalDescInput = document.getElementById('modal-desc-input');
  const modalDomainInput = document.getElementById('modal-domain-input');
  const modalTagsInput = document.getElementById('modal-tags-input');
  const modalPriorityInput = document.getElementById('modal-priority-input');
  const modalPriorityWrapper = document.getElementById('modal-priority');
  const modalCancelBtn = document.getElementById('modal-cancel');
  const modalSaveBtn = document.getElementById('modal-save');
  const toast = document.getElementById('toast');

  // Auth overlay (créé dynamiquement pour éviter d’éditer index.html)
  let authOverlay, authEmail, authSend, authInfo;

  // ---------- Utilitaires ----------
  function uuid() { return '_' + Math.random().toString(36).substr(2, 9); }

  function saveData() { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }

  function loadData() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (stored && typeof stored === 'object') {
        data.ideas = stored.ideas || [];
        data.tasks = stored.tasks || [];
        data.logs = stored.logs || [];
        data.currentUser = stored.currentUser || '';
      }
    } catch (e) { console.error('Error loading data', e); }
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('toast-show');
    setTimeout(() => toast.classList.remove('toast-show'), 3000);
  }

  function buildDomainOptions() {
    const firstOpt = filterDomain.querySelector('option');
    filterDomain.innerHTML = '';
    if (firstOpt) filterDomain.appendChild(firstOpt);
    modalDomainInput.innerHTML = '';
    DOMAINS.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d; opt.textContent = d;
      filterDomain.appendChild(opt.cloneNode(true));
      modalDomainInput.appendChild(opt.cloneNode(true));
    });
  }

  function countVotes(votes) {
    const counts = { yes: 0, no: 0, maybe: 0 };
    for (const k in votes) { const v = votes[k]; if (counts[v] !== undefined) counts[v]++; }
    return counts;
  }

  function recalcIdeaStatus(idea) {
    const c = countVotes(idea.votes);
    if (c.yes >= 3) return 'approved';
    if (c.no >= 3) return 'rejected';
    return c.yes + c.no + c.maybe > 0 ? 'in_discussion' : 'new';
  }

  // ---------- Auth ----------
  function injectAuthOverlay() {
    if (authOverlay) return;
    authOverlay = document.createElement('div');
    authOverlay.id = 'auth-overlay';
    authOverlay.className = 'modal-overlay';
    authOverlay.style.display = 'none'; // caché tant qu’on n’en a pas besoin
    authOverlay.innerHTML = `
      <div class="card" style="max-width:360px;width:90%;margin:auto;">
        <h3>Connexion</h3>
        <p>Entrez votre e-mail pour recevoir un lien de connexion.</p>
        <input id="auth-email" type="email" placeholder="email@domaine.com"
               style="width:100%;margin:8px 0;padding:10px;border-radius:8px;border:1px solid #333;background:#111;color:#fff;">
        <button id="auth-send" class="btn">Recevoir le lien</button>
        <p id="auth-info" style="opacity:.8;margin-top:8px;"></p>
      </div>`;
    document.body.appendChild(authOverlay);
    authEmail = document.getElementById('auth-email');
    authSend = document.getElementById('auth-send');
    authInfo = document.getElementById('auth-info');
    if (authSend) {
      authSend.addEventListener('click', async () => {
        const email = (authEmail.value || '').trim();
        if (!email) { authInfo.textContent = 'Entre un e-mail.'; return; }
        authInfo.textContent = 'Envoi en cours...';
        const { error } = await supabaseClient.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: window.location.href.split('#')[0] }
        });
        authInfo.textContent = error ? ('Erreur : ' + error.message) : 'Vérifie ta boîte mail et clique sur le lien.';
      });
    }
  }

  async function ensureAuth() {
    if (!supabaseClient) return true; // pas de backend => pas d’auth
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session?.user) {
      data.currentUser = session.user.email || data.currentUser;
      return true;
    }
    injectAuthOverlay();
    authOverlay.style.display = 'flex'; // affiche l’overlay
    return false;
  }

  if (supabaseClient) {
    supabaseClient.auth.onAuthStateChange(async (_evt, session) => {
      if (session?.user) {
        data.currentUser = session.user.email;
        if (authOverlay) authOverlay.style.display = 'none';
        await fetchFromBackend();
        subscribeRealtime();
        render();
      }
    });
  }

  // ---------- Rendu ----------
  let currentView = 'inbox';

  function render() {
    const searchVal = globalSearch.value.trim().toLowerCase();
    const domainFilter = filterDomain.value;
    const statusFilter = filterStatus.value;
    switch (currentView) {
      case 'inbox': renderInbox(searchVal, domainFilter, statusFilter); break;
      case 'checklist-entreprise': renderChecklist('entreprise'); break;
      case 'checklist-dev': renderChecklist('dev'); break;
      case 'meeting': renderMeeting(); break;
      case 'myday': renderMyDay(); break;
      case 'priorities': renderPriorities(); break;
      case 'calendar': renderCalendar(); break;
    }
  }

  function renderInbox(searchVal, domainFilter, statusFilter) {
    inboxColumns.innerHTML = '';
    for (const statusKey in IDEA_STATUSES) {
      if (statusFilter && statusFilter !== statusKey) continue;
      const column = document.createElement('div');
      column.className = 'column';
      const h = document.createElement('h3'); h.textContent = IDEA_STATUSES[statusKey];
      column.appendChild(h);

      const filtered = data.ideas.filter(idea => {
        if (idea.status !== statusKey) return false;
        if (domainFilter && idea.domain !== domainFilter) return false;
        if (searchVal) {
          const target = `${idea.title} ${idea.desc}`.toLowerCase();
          if (!target.includes(searchVal)) return false;
        }
        return true;
      });

      if (!filtered.length) {
        const none = document.createElement('div'); none.className = 'card'; none.textContent = 'Aucune idée.';
        column.appendChild(none);
      } else {
        filtered.forEach(idea => column.appendChild(createIdeaCard(idea)));
      }
      inboxColumns.appendChild(column);
    }
  }

  function createIdeaCard(idea) {
    const card = document.createElement('div'); card.className = 'card';
    const title = document.createElement('p'); title.className = 'card-title'; title.textContent = idea.title; card.appendChild(title);
    const meta = document.createElement('p'); meta.className = 'card-meta';
    meta.textContent = `${idea.author ? idea.author + ' • ' : ''}${idea.domain} • ${new Date(idea.createdAt).toLocaleDateString('fr-FR')}`;
    card.appendChild(meta);

    if (idea.tags?.length) {
      const tagContainer = document.createElement('div'); tagContainer.className = 'card-tags';
      idea.tags.forEach(tag => { const s = document.createElement('span'); s.className = 'tag'; s.textContent = `#${tag}`; tagContainer.appendChild(s); });
      card.appendChild(tagContainer);
    }

    const counts = countVotes(idea.votes);
    const actions = document.createElement('div'); actions.className = 'card-actions';
    ['yes', 'maybe', 'no'].forEach(v => {
      const btn = document.createElement('button');
      btn.className = 'vote-btn'; btn.dataset.ideaId = idea.id; btn.dataset.vote = v;
      btn.textContent = (v === 'yes' ? '👍' : v === 'maybe' ? '❓' : '👎') + ' ' + counts[v];
      btn.addEventListener('click', onVote);
      actions.appendChild(btn);
    });
    if (idea.status === 'approved') {
      const promote = document.createElement('button'); promote.className = 'promote-btn'; promote.dataset.ideaId = idea.id;
      promote.textContent = '→ Promouvoir'; promote.addEventListener('click', onPromoteIdea); actions.appendChild(promote);
    }
    const waBtn = document.createElement('button'); waBtn.className = 'whatsapp-btn'; waBtn.textContent = 'Partager WA';
    waBtn.addEventListener('click', () => {
      const text = `[FP OPS] Idée : ${idea.title} → ` + location.href;
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    });
    actions.appendChild(waBtn);
    card.appendChild(actions);
    return card;
  }

  function renderChecklist(domain) {
    const container = domain === 'entreprise' ? listEntreprise : listDev;
    container.innerHTML = '';
    const tasks = data.tasks.filter(t => t.domain === domain);
    if (!tasks.length) {
      const none = document.createElement('div'); none.className = 'card'; none.textContent = 'Aucune tâche.'; container.appendChild(none); return;
    }
    const undone = tasks.filter(t => !t.done);
    const done = tasks.filter(t => t.done);
    undone.forEach(t => container.appendChild(createTaskItem(t)));
    if (done.length) {
      const details = document.createElement('details'); const summary = document.createElement('summary'); summary.textContent = `Fait (${done.length})`; details.appendChild(summary);
      done.forEach(t => { const item = createTaskItem(t); item.querySelector('input[type="checkbox"]').disabled = true; details.appendChild(item); });
      container.appendChild(details);
    }
  }

  function createTaskItem(task) {
    const div = document.createElement('div'); div.className = 'task-item';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = task.done; checkbox.dataset.taskId = task.id; checkbox.addEventListener('change', onToggleTask); div.appendChild(checkbox);
    const spanTitle = document.createElement('span'); spanTitle.className = 'task-title'; spanTitle.textContent = task.title; if (task.done) { spanTitle.style.textDecoration = 'line-through'; spanTitle.style.opacity = '0.6'; } div.appendChild(spanTitle);
    if (task.author) { const a = document.createElement('span'); a.className = 'task-author'; a.textContent = task.author; a.style.fontSize = '12px'; a.style.opacity = '0.8'; div.appendChild(a); }
    if (task.tags?.length) { const tg = document.createElement('div'); tg.className = 'task-tags'; task.tags.forEach(tag => { const s = document.createElement('span'); s.className = 'tag'; s.textContent = `#${tag}`; tg.appendChild(s); }); div.appendChild(tg); }
    const priorityDot = document.createElement('span'); priorityDot.className = `tag priority-${task.priority || 'low'}`; priorityDot.textContent = task.priority === 'high' ? '●●●' : task.priority === 'medium' ? '●●' : '●'; div.appendChild(priorityDot);
    const actions = document.createElement('div'); actions.className = 'task-actions';
    const focusBtn = document.createElement('button'); focusBtn.className = 'focus-btn'; focusBtn.innerHTML = task.focus ? '★' : '☆'; if (task.focus) focusBtn.classList.add('active'); focusBtn.dataset.taskId = task.id; focusBtn.addEventListener('click', onToggleFocus); actions.appendChild(focusBtn);
    const delayBtn = document.createElement('button'); delayBtn.className = 'delay-btn'; delayBtn.dataset.taskId = task.id; delayBtn.textContent = 'Reporter à demain'; delayBtn.addEventListener('click', onDelayTask); actions.appendChild(delayBtn);
    const waBtn = document.createElement('button'); waBtn.className = 'whatsapp-btn'; waBtn.textContent = 'Partager WA'; waBtn.addEventListener('click', () => { const text = `[FP OPS] Tâche : ${task.title} → ` + location.href; window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank'); }); actions.appendChild(waBtn);
    div.appendChild(actions);
    return div;
  }

  function renderMeeting() {
    meetingCard.innerHTML = '';
    const nextIdea = data.ideas.find(i => i.status === 'new');
    if (!nextIdea) { const d = document.createElement('div'); d.className = 'card'; d.textContent = 'Aucune nouvelle idée à décider.'; meetingCard.appendChild(d); return; }
    const card = document.createElement('div'); card.className = 'card';
    const title = document.createElement('p'); title.className = 'card-title'; title.textContent = nextIdea.title; card.appendChild(title);
    const desc = document.createElement('p'); desc.className = 'card-meta'; desc.textContent = nextIdea.desc; card.appendChild(desc);
    const meta = document.createElement('p'); meta.className = 'card-meta'; meta.textContent = `${nextIdea.domain} • ${new Date(nextIdea.createdAt).toLocaleDateString('fr-FR')}`; card.appendChild(meta);
    if (nextIdea.tags?.length) { const tg = document.createElement('div'); tg.className = 'card-tags'; nextIdea.tags.forEach(t => { const s = document.createElement('span'); s.className = 'tag'; s.textContent = `#${t}`; tg.appendChild(s); }); card.appendChild(tg); }
    const counts = countVotes(nextIdea.votes);
    const actions = document.createElement('div'); actions.className = 'card-actions';
    ['yes','maybe','no'].forEach(v => { const b = document.createElement('button'); b.className='vote-btn'; b.dataset.ideaId=nextIdea.id; b.dataset.vote=v; b.textContent=(v==='yes'?'👍 Oui':v==='maybe'?'❓ À discuter':'👎 Non')+` (${counts[v]})`; b.addEventListener('click', onVote); actions.appendChild(b); });
    const waBtn = document.createElement('button'); waBtn.className='whatsapp-btn'; waBtn.textContent='Partager WA'; waBtn.addEventListener('click',()=>{ const text=`[FP OPS] Idée : ${nextIdea.title} → ` + location.href; window.open(`https://wa.me/?text=${encodeURIComponent(text)}`,'_blank');}); actions.appendChild(waBtn);
    if (nextIdea.status === 'approved') { const p = document.createElement('button'); p.className='promote-btn'; p.dataset.ideaId=nextIdea.id; p.textContent='→ Promouvoir en tâche'; p.addEventListener('click', onPromoteIdea); actions.appendChild(p); }
    card.appendChild(actions); meetingCard.appendChild(card);
  }

  function renderMyDay() {
    mydayList.innerHTML = '';
    const tasks = data.tasks.filter(t => !t.done && (!t.assignee || t.assignee === data.currentUser));
    if (!tasks.length) { const d = document.createElement('div'); d.className = 'card'; d.textContent = 'Aucune tâche pour aujourd’hui.'; mydayList.appendChild(d); return; }
    tasks.forEach(t => mydayList.appendChild(createTaskItem(t)));
  }

  function renderPriorities() {
    prioritiesList.innerHTML = '';
    const tasks = data.tasks.filter(t => t.focus);
    if (!tasks.length) { const d = document.createElement('div'); d.className = 'card'; d.textContent = 'Pas de priorités hebdo.'; prioritiesList.appendChild(d); return; }
    tasks.forEach(t => prioritiesList.appendChild(createTaskItem(t)));
  }

  let calendar = null;
  function renderCalendar() {
    const container = document.getElementById('calendar-container');
    if (!calendar) {
      calendar = new FullCalendar.Calendar(container, {
        initialView: 'dayGridMonth', height: 600, editable: false,
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,listWeek' },
        events: [],
      });
      calendar.render();
    }
    const events = data.tasks.filter(t => t.dueDate).map(t => ({ id: t.id, title: t.title, start: t.dueDate, extendedProps: { domain: t.domain, done: t.done } }));
    calendar.removeAllEvents(); calendar.addEventSource(events);
  }

  // ---------- Events / Actions (async) ----------
  async function onVote(e) {
    const idea = data.ideas.find(i => i.id === e.currentTarget.dataset.ideaId); if (!idea) return;
    const vote = e.currentTarget.dataset.vote; const uid = data.currentUser || 'anonymous';
    idea.votes[uid] = vote; idea.status = recalcIdeaStatus(idea);
    await logAction('vote', { ideaId: idea.id, vote }); await upsertIdea(idea); saveData(); render();
  }

  async function onPromoteIdea(e) {
    const idea = data.ideas.find(i => i.id === e.currentTarget.dataset.ideaId); if (!idea) return;
    const task = { id: uuid(), title: idea.title, desc: idea.desc, domain: idea.domain, done: false, dueDate: '', assignee: '', tags: [...(idea.tags||[])], priority: 'medium', focus: false, fromIdea: idea.id, createdAt: new Date().toISOString(), author: data.currentUser || '', subtasks: [] };
    data.tasks.push(task); await logAction('promote_idea', { ideaId: idea.id, taskId: task.id }); showToast('Tâche créée à partir de l’idée.'); await upsertTask(task); saveData(); render();
  }

  async function onToggleTask(e) {
    const task = data.tasks.find(t => t.id === e.currentTarget.dataset.taskId); if (!task) return;
    task.done = !task.done; await logAction('toggle_task', { taskId: task.id, done: task.done }); await upsertTask(task); saveData(); render();
  }

  async function onToggleFocus(e) {
    const task = data.tasks.find(t => t.id === e.currentTarget.dataset.taskId); if (!task) return;
    if (!task.focus && data.tasks.filter(t => t.focus).length >= 3) { showToast('Maximum 3 priorités hebdo.'); return; }
    task.focus = !task.focus; await logAction('toggle_focus', { taskId: task.id, focus: task.focus }); await upsertTask(task); saveData(); render();
  }

  async function onDelayTask(e) {
    const task = data.tasks.find(t => t.id === e.currentTarget.dataset.taskId); if (!task) return;
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    task.dueDate = tomorrow.toISOString().slice(0,10); showToast('Tâche reportée à demain.');
    await logAction('delay_task', { taskId: task.id, newDueDate: task.dueDate }); await upsertTask(task); saveData(); render();
  }

  function onNavClick(e) {
    const view = e.currentTarget.dataset.view; if (!view || view === currentView) return;
    navButtons.forEach(b => b.classList.remove('active')); e.currentTarget.classList.add('active');
    currentView = view; Object.keys(views).forEach(k => views[k].classList.toggle('active', k === view)); render();
  }

  function openModal(type, domain) {
    editingContext = { type, domain }; modalTitle.textContent = type === 'idea' ? 'Nouvelle idée' : 'Nouvelle tâche';
    modalTitleInput.value = ''; modalDescInput.value = ''; modalTagsInput.value = ''; modalDomainInput.value = domain || DOMAINS[0];
    modalPriorityWrapper.classList.toggle('hidden', type === 'idea'); modalPriorityInput.value = 'medium'; modalOverlay.classList.remove('hidden');
  }
  function closeModal() { modalOverlay.classList.add('hidden'); editingContext = null; }
  let editingContext = null;

  async function onModalSave() {
    const title = modalTitleInput.value.trim(); if (!title) { alert('Le titre est requis.'); return; }
    const desc = modalDescInput.value.trim(); const domain = modalDomainInput.value;
    const tags = modalTagsInput.value.split(',').map(s => s.trim().replace(/^#/, '')).filter(Boolean);
    if (!editingContext) return;

    if (editingContext.type === 'idea') {
      const newIdea = { id: uuid(), title, desc, domain, status: 'new', votes: {}, tags, createdAt: new Date().toISOString(), author: data.currentUser || '' };
      data.ideas.push(newIdea); await logAction('add_idea', { id: newIdea.id, title: newIdea.title }); showToast('Idée ajoutée.'); await upsertIdea(newIdea);
    } else {
      const priority = modalPriorityInput.value;
      const newTask = { id: uuid(), title, desc, domain, done: false, dueDate: '', assignee: data.currentUser || '', tags, priority, focus: false, createdAt: new Date().toISOString(), author: data.currentUser || '', subtasks: [] };
      data.tasks.push(newTask); await logAction('add_task', { id: newTask.id, title: newTask.title }); showToast('Tâche ajoutée.'); await upsertTask(newTask);
    }
    saveData(); closeModal(); render();
  }

  // ---------- Import/Export & SW ----------
  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'fp-ops-data.json'; a.click(); URL.revokeObjectURL(url);
  }
  function importData() {
    const input = document.createElement('input'); input.type = 'file'; input.accept = 'application/json';
    input.addEventListener('change', () => {
      const f = input.files[0]; if (!f) return; const r = new FileReader();
      r.onload = () => { try {
        const imported = JSON.parse(r.result);
        if (imported.ideas) imported.ideas.forEach(i => { if (!data.ideas.find(x => x.id === i.id)) data.ideas.push(i); });
        if (imported.tasks) imported.tasks.forEach(t => { if (!data.tasks.find(x => x.id === t.id)) data.tasks.push(t); });
        showToast('Données importées.'); saveData(); render();
      } catch { alert('Fichier invalide.'); } };
      r.readAsText(f);
    });
    input.click();
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      // en PWA via HTTPS seulement
      if (location.protocol.startsWith('http')) {
        navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW failed: ', err));
      }
    });
  }

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); globalSearch.focus(); }
    if (e.altKey && e.key.toLowerCase() === 'n') { e.preventDefault(); if (currentView === 'inbox') openModal('idea'); else if (currentView === 'checklist-entreprise') openModal('task','entreprise'); else if (currentView === 'checklist-dev') openModal('task','dev'); }
    if (e.altKey && e.key.toLowerCase() === 'e') { e.preventDefault(); exportData(); }
    if (e.altKey && e.key.toLowerCase() === 'i') { e.preventDefault(); importData(); }
  });

  // ---------- Backend helpers (v2-friendly) ----------
  async function logAction(type, payload) {
    const entry = { id: uuid(), type, payload, user: data.currentUser || '', timestamp: new Date().toISOString() };
    data.logs.push(entry); saveData();
    if (!supabaseClient) return;
    try { const { error } = await supabaseClient.from('logs').insert([entry]); if (error) console.warn('logs insert error', error); }
    catch (e) { console.warn('logs insert exception', e); }
  }

  async function upsertIdea(idea) {
    if (!supabaseClient) return;
    try { const { error } = await supabaseClient.from('ideas').upsert(idea).select(); if (error) console.warn('ideas upsert error', error); }
    catch (e) { console.warn('ideas upsert exception', e); }
  }

  async function upsertTask(task) {
    if (!supabaseClient) return;
    try { const { error } = await supabaseClient.from('tasks').upsert(task).select(); if (error) console.warn('tasks upsert error', error); }
    catch (e) { console.warn('tasks upsert exception', e); }
  }

  async function fetchFromBackend() {
    if (!supabaseClient) return;
    try {
      const { data: ideas, error: e1 } = await supabaseClient.from('ideas').select('*');
      const { data: tasks, error: e2 } = await supabaseClient.from('tasks').select('*');
      if (e1) console.warn('ideas select error', e1);
      if (e2) console.warn('tasks select error', e2);
      if (Array.isArray(ideas)) data.ideas = ideas;
      if (Array.isArray(tasks)) data.tasks = tasks;
      saveData(); render();
    } catch (e) { console.warn('fetch exception', e); }
  }

  function subscribeRealtime() {
    if (!supabaseClient) return;
    supabaseClient
      .channel('public:ideas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ideas' }, payload => {
        const row = payload.new; if (!row) return;
        const i = data.ideas.findIndex(x => x.id === row.id); if (i >= 0) data.ideas[i] = row; else data.ideas.push(row);
        saveData(); render();
      }).subscribe();

    supabaseClient
      .channel('public:tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, payload => {
        const row = payload.new; if (!row) return;
        const i = data.tasks.findIndex(x => x.id === row.id); if (i >= 0) data.tasks[i] = row; else data.tasks.push(row);
        saveData(); render();
      }).subscribe();
  }

  // ---------- Boot ----------
  navButtons.forEach(btn => btn.addEventListener('click', onNavClick));
  document.getElementById('btn-add-idea').addEventListener('click', () => openModal('idea'));
  document.getElementById('btn-add-task-entreprise').addEventListener('click', () => openModal('task', 'entreprise'));
  document.getElementById('btn-add-task-dev').addEventListener('click', () => openModal('task', 'dev'));
  modalCancelBtn.addEventListener('click', () => closeModal());
  modalSaveBtn.addEventListener('click', () => onModalSave());

  let initialized = false;
  (async () => {
    if (initialized) return; initialized = true;
    loadData(); buildDomainOptions();
    Object.keys(views).forEach(k => views[k].classList.remove('active'));
    views['inbox'].classList.add('active');
    document.querySelector(`#app-nav button[data-view="inbox"]`).classList.add('active');

    if (supabaseClient) {
      if (await ensureAuth()) {
        await fetchFromBackend(); subscribeRealtime();
      }
    }
    render();
  })();
})();
