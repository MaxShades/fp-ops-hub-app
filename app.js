// FP OPS HUB – PWA stand‑alone application
// Data structures stored in localStorage
// Ideas: {id, title, desc, domain, status, votes: {user: vote}, tags: [], createdAt}
// Tasks: {id, title, desc, domain, done, dueDate, assignee, tags: [], priority: low|medium|high, focus}

(() => {
  // Names of domains
  const DOMAINS = ['entreprise', 'dev', 'production', 'marketing', 'legal', 'social'];
  // Names of statuses for ideas
  const IDEA_STATUSES = {
    new: 'Nouvelles',
    in_discussion: 'En discussion',
    approved: 'Approuvées',
    rejected: 'Rejetées',
  };

  // Storage keys
  const STORAGE_KEY = 'fpOpsData';
  // Data model now includes logs for auditing user actions
  let data = { ideas: [], tasks: [], logs: [], currentUser: '' };

  // ========================================================================
  // Real‑time backend (Supabase)
  //
  // To enable real‑time collaboration, create a Supabase project at
  // https://supabase.com, then replace SUPABASE_URL and SUPABASE_ANON_KEY below
  // with your project's URL and anonymous API key. If no credentials are
  // provided, the app will fall back to localStorage only.
  // -----------------------------------------------------------------------
  // Configure your Supabase project here. Replace YOUR_PROJECT_REF with the
  // identifier of your Supabase project (for example "yhupytjyahcgfohvrmjp")
  // and YOUR_ANON_KEY with the anonymous key from your project's API section.
  // If these values are left unchanged, the application will operate in
  // offline‑only mode using localStorage. Once configured, the app will
  // sync ideas and tasks across devices in realtime.
  const SUPABASE_URL = 'https://supabase.com/dashboard/project/yhupytjyahcgfohvrmjp';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlodXB5dGp5YWhjZ2ZvaHZybWpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYxMDc4MTksImV4cCI6MjA3MTY4MzgxOX0.XXfNG9h6M2QsA61YTdOpVKR5H6IJY9vZvpzOQtAPIl0';
  let supabase = null;
  if (typeof window !== 'undefined' && window.supabase && SUPABASE_URL && SUPABASE_URL !== 'https://supabase.com/dashboard/project/yhupytjyahcgfohvrmjp') {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }

  // Current view
  let currentView = 'inbox';

  // DOM elements
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

  // For editing context
  let editingContext = null; // {type: 'idea'|'task', domain: 'entreprise', editId: optional}

  // Utility functions
  function uuid() {
    return '_' + Math.random().toString(36).substr(2, 9);
  }

  function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function loadData() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (stored && typeof stored === 'object') {
        data.ideas = stored.ideas || [];
        data.tasks = stored.tasks || [];
        data.logs = stored.logs || [];
        data.currentUser = stored.currentUser || '';
      }
    } catch (e) {
      console.error('Error loading data', e);
    }
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('toast-show');
    setTimeout(() => toast.classList.remove('toast-show'), 3000);
  }

  // Prompt user for name once (stored in data.currentUser)
  function promptForUser() {
    let name = data.currentUser;
    if (!name) {
      name = prompt('Quel est votre nom/prénom (pour l’assignation et les votes) ?');
      if (name) {
        data.currentUser = name.trim();
        saveData();
      }
    }
  }

  // Build domain select options
  function buildDomainOptions() {
    // Reset existing options before populating. For the filter select,
    // preserve the first option ("Domaine : Tous") and remove any
    // previously appended options. This avoids duplicate entries if
    // buildDomainOptions() is called multiple times (for example after
    // fetching domains from a backend).
    const firstOpt = filterDomain.querySelector('option');
    filterDomain.innerHTML = '';
    if (firstOpt) filterDomain.appendChild(firstOpt);
    // Clear the modal domain input entirely before adding options.
    modalDomainInput.innerHTML = '';
    // Populate both selects with the list of domains.
    DOMAINS.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d;
      filterDomain.appendChild(opt.cloneNode(true));
      modalDomainInput.appendChild(opt.cloneNode(true));
    });
  }

  // Helpers to count votes
  function countVotes(votes) {
    const counts = { yes: 0, no: 0, maybe: 0 };
    for (const k in votes) {
      const v = votes[k];
      if (counts[v] !== undefined) counts[v]++;
    }
    return counts;
  }

  function recalcIdeaStatus(idea) {
    const counts = countVotes(idea.votes);
    if (counts.yes >= 3) return 'approved';
    if (counts.no >= 3) return 'rejected';
    const total = counts.yes + counts.no + counts.maybe;
    if (total > 0) return 'in_discussion';
    return 'new';
  }

  // Render functions
  function render() {
    // Determine filter values
    const searchVal = globalSearch.value.trim().toLowerCase();
    const domainFilter = filterDomain.value;
    const statusFilter = filterStatus.value;
    // Render by view
    switch (currentView) {
      case 'inbox':
        renderInbox(searchVal, domainFilter, statusFilter);
        break;
      case 'checklist-entreprise':
        renderChecklist('entreprise');
        break;
      case 'checklist-dev':
        renderChecklist('dev');
        break;
      case 'meeting':
        renderMeeting();
        break;
      case 'myday':
        renderMyDay();
        break;
      case 'priorities':
        renderPriorities();
        break;
      case 'calendar':
        renderCalendar();
        break;
    }
  }

  function renderInbox(searchVal, domainFilter, statusFilter) {
    // Clear columns
    inboxColumns.innerHTML = '';
    // Build columns for statuses
    for (const statusKey in IDEA_STATUSES) {
      // Filter if statusFilter is set
      if (statusFilter && statusFilter !== statusKey) continue;
      const column = document.createElement('div');
      column.className = 'column';
      const h = document.createElement('h3');
      h.textContent = IDEA_STATUSES[statusKey];
      column.appendChild(h);
      // Filter ideas accordingly
      const filtered = data.ideas.filter(idea => {
        if (idea.status !== statusKey) return false;
        if (domainFilter && idea.domain !== domainFilter) return false;
        if (searchVal) {
          const target = `${idea.title} ${idea.desc}`.toLowerCase();
          if (!target.includes(searchVal)) return false;
        }
        return true;
      });
      if (filtered.length === 0) {
        const none = document.createElement('div');
        none.className = 'card';
        none.textContent = 'Aucune idée.';
        column.appendChild(none);
      } else {
        filtered.forEach(idea => {
          const card = createIdeaCard(idea);
          column.appendChild(card);
        });
      }
      inboxColumns.appendChild(column);
    }
  }

  function createIdeaCard(idea) {
    const card = document.createElement('div');
    card.className = 'card';
    // Title
    const title = document.createElement('p');
    title.className = 'card-title';
    title.textContent = idea.title;
    card.appendChild(title);
    // Meta
    const meta = document.createElement('p');
    meta.className = 'card-meta';
    const author = idea.author ? `${idea.author} • ` : '';
    meta.textContent = `${author}${idea.domain} • ${new Date(idea.createdAt).toLocaleDateString('fr-FR')}`;
    card.appendChild(meta);
    // Tags
    if (idea.tags && idea.tags.length) {
      const tagContainer = document.createElement('div');
      tagContainer.className = 'card-tags';
      idea.tags.forEach(tag => {
        const span = document.createElement('span');
        span.className = 'tag';
        span.textContent = `#${tag}`;
        tagContainer.appendChild(span);
      });
      card.appendChild(tagContainer);
    }
    // Votes counts
    const counts = countVotes(idea.votes);
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    // Vote buttons
    ['yes', 'maybe', 'no'].forEach(v => {
      const btn = document.createElement('button');
      btn.className = 'vote-btn';
      btn.dataset.ideaId = idea.id;
      btn.dataset.vote = v;
      btn.textContent = (v === 'yes' ? '👍' : v === 'maybe' ? '❓' : '👎') + ' ' + counts[v];
      btn.addEventListener('click', onVote);
      actions.appendChild(btn);
    });
    // Promote button (if approved)
    if (idea.status === 'approved') {
      const promote = document.createElement('button');
      promote.className = 'promote-btn';
      promote.dataset.ideaId = idea.id;
      promote.textContent = '→ Promouvoir';
      promote.addEventListener('click', onPromoteIdea);
      actions.appendChild(promote);
    }
    // WhatsApp share
    const waBtn = document.createElement('button');
    waBtn.className = 'whatsapp-btn';
    waBtn.textContent = 'Partager WA';
    waBtn.addEventListener('click', () => {
      const text = `[FP OPS] Idée : ${idea.title} → ` + location.href;
      const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(url, '_blank');
    });
    actions.appendChild(waBtn);

    card.appendChild(actions);
    return card;
  }

  function renderChecklist(domain) {
    const container = domain === 'entreprise' ? listEntreprise : listDev;
    container.innerHTML = '';
    const tasks = data.tasks.filter(t => t.domain === domain);
    if (tasks.length === 0) {
      const none = document.createElement('div');
      none.className = 'card';
      none.textContent = 'Aucune tâche.';
      container.appendChild(none);
      return;
    }
    // Separate undone and done tasks
    const undone = tasks.filter(t => !t.done);
    const done = tasks.filter(t => t.done);
    // Render undone tasks
    undone.forEach(task => {
      const item = createTaskItem(task);
      container.appendChild(item);
    });
    // Done tasks collapsible
    if (done.length > 0) {
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = `Fait (${done.length})`;
      details.appendChild(summary);
      done.forEach(task => {
        const item = createTaskItem(task);
        // disable interactions on done tasks
        item.querySelector('input[type="checkbox"]').disabled = true;
        details.appendChild(item);
      });
      container.appendChild(details);
    }
  }

  function createTaskItem(task) {
    const div = document.createElement('div');
    div.className = 'task-item';
    // checkbox
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.done;
    checkbox.dataset.taskId = task.id;
    checkbox.addEventListener('change', onToggleTask);
    div.appendChild(checkbox);
    // title
    const spanTitle = document.createElement('span');
    spanTitle.className = 'task-title';
    spanTitle.textContent = task.title;
    if (task.done) {
      spanTitle.style.textDecoration = 'line-through';
      spanTitle.style.opacity = '0.6';
    }
    div.appendChild(spanTitle);
    // author
    if (task.author) {
      const authorSpan = document.createElement('span');
      authorSpan.className = 'task-author';
      authorSpan.textContent = task.author;
      authorSpan.style.fontSize = '12px';
      authorSpan.style.opacity = '0.8';
      div.appendChild(authorSpan);
    }
    // tags
    if (task.tags && task.tags.length) {
      const tagsDiv = document.createElement('div');
      tagsDiv.className = 'task-tags';
      task.tags.forEach(tag => {
        const span = document.createElement('span');
        span.className = 'tag';
        span.textContent = `#${tag}`;
        tagsDiv.appendChild(span);
      });
      div.appendChild(tagsDiv);
    }
    // priority dot indicator
    const priorityDot = document.createElement('span');
    priorityDot.className = `tag priority-${task.priority || 'low'}`;
    priorityDot.textContent = task.priority === 'high' ? '●●●' : task.priority === 'medium' ? '●●' : '●';
    div.appendChild(priorityDot);
    // actions
    const actions = document.createElement('div');
    actions.className = 'task-actions';
    // focus star
    const focusBtn = document.createElement('button');
    focusBtn.className = 'focus-btn';
    focusBtn.innerHTML = task.focus ? '★' : '☆';
    if (task.focus) focusBtn.classList.add('active');
    focusBtn.dataset.taskId = task.id;
    focusBtn.addEventListener('click', onToggleFocus);
    actions.appendChild(focusBtn);
    // delay button
    const delayBtn = document.createElement('button');
    delayBtn.className = 'delay-btn';
    delayBtn.dataset.taskId = task.id;
    delayBtn.textContent = 'Reporter à demain';
    delayBtn.addEventListener('click', onDelayTask);
    actions.appendChild(delayBtn);
    // share WA
    const waBtn = document.createElement('button');
    waBtn.className = 'whatsapp-btn';
    waBtn.textContent = 'Partager WA';
    waBtn.addEventListener('click', () => {
      const text = `[FP OPS] Tâche : ${task.title} → ` + location.href;
      const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(url, '_blank');
    });
    actions.appendChild(waBtn);
    div.appendChild(actions);
    return div;
  }

  function renderMeeting() {
    meetingCard.innerHTML = '';
    const nextIdea = data.ideas.find(i => i.status === 'new');
    if (!nextIdea) {
      const div = document.createElement('div');
      div.className = 'card';
      div.textContent = 'Aucune nouvelle idée à décider.';
      meetingCard.appendChild(div);
      return;
    }
    const card = document.createElement('div');
    card.className = 'card';
    // Title
    const title = document.createElement('p');
    title.className = 'card-title';
    title.textContent = nextIdea.title;
    card.appendChild(title);
    // Description
    const desc = document.createElement('p');
    desc.className = 'card-meta';
    desc.textContent = nextIdea.desc;
    card.appendChild(desc);
    // Domain / date
    const meta = document.createElement('p');
    meta.className = 'card-meta';
    meta.textContent = `${nextIdea.domain} • ${new Date(nextIdea.createdAt).toLocaleDateString('fr-FR')}`;
    card.appendChild(meta);
    // Tags
    if (nextIdea.tags && nextIdea.tags.length) {
      const tagsDiv = document.createElement('div');
      tagsDiv.className = 'card-tags';
      nextIdea.tags.forEach(tag => {
        const span = document.createElement('span');
        span.className = 'tag';
        span.textContent = `#${tag}`;
        tagsDiv.appendChild(span);
      });
      card.appendChild(tagsDiv);
    }
    // Votes & actions
    const counts = countVotes(nextIdea.votes);
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    ['yes', 'maybe', 'no'].forEach(v => {
      const btn = document.createElement('button');
      btn.className = 'vote-btn';
      btn.dataset.ideaId = nextIdea.id;
      btn.dataset.vote = v;
      btn.textContent = (v === 'yes' ? '👍 Oui' : v === 'maybe' ? '❓ À discuter' : '👎 Non') + ' (' + counts[v] + ')';
      btn.addEventListener('click', onVote);
      actions.appendChild(btn);
    });
    // Comments button (open in card) - for simplicity we treat description as comment; we skip separate comments.
    // Share
    const waBtn = document.createElement('button');
    waBtn.className = 'whatsapp-btn';
    waBtn.textContent = 'Partager WA';
    waBtn.addEventListener('click', () => {
      const text = `[FP OPS] Idée : ${nextIdea.title} → ` + location.href;
      const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
      window.open(url, '_blank');
    });
    actions.appendChild(waBtn);
    // Promote if approved
    if (nextIdea.status === 'approved') {
      const promote = document.createElement('button');
      promote.className = 'promote-btn';
      promote.dataset.ideaId = nextIdea.id;
      promote.textContent = '→ Promouvoir en tâche';
      promote.addEventListener('click', onPromoteIdea);
      actions.appendChild(promote);
    }
    card.appendChild(actions);
    meetingCard.appendChild(card);
  }

  function renderMyDay() {
    mydayList.innerHTML = '';
    const tasks = data.tasks.filter(t => !t.done && (!t.assignee || t.assignee === data.currentUser));
    if (tasks.length === 0) {
      const div = document.createElement('div');
      div.className = 'card';
      div.textContent = 'Aucune tâche pour aujourd’hui.';
      mydayList.appendChild(div);
      return;
    }
    tasks.forEach(task => {
      const item = createTaskItem(task);
      mydayList.appendChild(item);
    });
  }

  function renderPriorities() {
    prioritiesList.innerHTML = '';
    const tasks = data.tasks.filter(t => t.focus);
    if (tasks.length === 0) {
      const div = document.createElement('div');
      div.className = 'card';
      div.textContent = 'Pas de priorités hebdo.';
      prioritiesList.appendChild(div);
      return;
    }
    tasks.forEach(task => {
      const item = createTaskItem(task);
      prioritiesList.appendChild(item);
    });
  }

  // Calendar rendering
  let calendar = null;
  function renderCalendar() {
    const container = document.getElementById('calendar-container');
    // Initialize calendar once
    if (!calendar) {
      calendar = new FullCalendar.Calendar(container, {
        initialView: 'dayGridMonth',
        height: 600,
        editable: false,
        headerToolbar: {
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,timeGridWeek,listWeek'
        },
        events: [],
      });
      calendar.render();
    }
    // Build event list from tasks with dueDate
    const events = data.tasks
      .filter(t => t.dueDate)
      .map(t => ({ id: t.id, title: t.title, start: t.dueDate, extendedProps: { domain: t.domain, done: t.done } }));
    calendar.removeAllEvents();
    calendar.addEventSource(events);
  }

  // Event handlers
  function onVote(e) {
    const btn = e.currentTarget;
    const ideaId = btn.dataset.ideaId;
    const vote = btn.dataset.vote;
    const idea = data.ideas.find(i => i.id === ideaId);
    if (!idea) return;
    // assign vote for current user
    const uid = data.currentUser || 'anonymous';
    idea.votes[uid] = vote;
    // recalc status
    idea.status = recalcIdeaStatus(idea);
    logAction('vote', { ideaId: idea.id, vote });
    upsertIdea(idea);
    saveData();
    render();
  }

  function onPromoteIdea(e) {
    const ideaId = e.currentTarget.dataset.ideaId;
    const idea = data.ideas.find(i => i.id === ideaId);
    if (!idea) return;
    // Create task from idea
    const task = {
      id: uuid(),
      title: idea.title,
      desc: idea.desc,
      domain: idea.domain,
      done: false,
      dueDate: '',
      assignee: '',
      tags: [...(idea.tags || [])],
      priority: 'medium',
      focus: false,
      fromIdea: idea.id,
      createdAt: new Date().toISOString(),
      author: data.currentUser || '',
      subtasks: [],
    };
    data.tasks.push(task);
    logAction('promote_idea', { ideaId: idea.id, taskId: task.id });
    showToast('Tâche créée à partir de l’idée.');
    upsertTask(task);
    saveData();
    render();
  }

  function onToggleTask(e) {
    const taskId = e.currentTarget.dataset.taskId;
    const task = data.tasks.find(t => t.id === taskId);
    if (!task) return;
    task.done = !task.done;
    logAction('toggle_task', { taskId: task.id, done: task.done });
    upsertTask(task);
    saveData();
    render();
  }

  function onToggleFocus(e) {
    const taskId = e.currentTarget.dataset.taskId;
    const task = data.tasks.find(t => t.id === taskId);
    if (!task) return;
    if (!task.focus) {
      // Check max 3
      const currentFocus = data.tasks.filter(t => t.focus);
      if (currentFocus.length >= 3) {
        showToast('Maximum 3 priorités hebdo.');
        return;
      }
    }
    task.focus = !task.focus;
    logAction('toggle_focus', { taskId: task.id, focus: task.focus });
    upsertTask(task);
    saveData();
    render();
  }

  function onDelayTask(e) {
    const taskId = e.currentTarget.dataset.taskId;
    const task = data.tasks.find(t => t.id === taskId);
    if (!task) return;
    // Set dueDate to tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    task.dueDate = tomorrow.toISOString().slice(0, 10);
    showToast('Tâche reportée à demain.');
    logAction('delay_task', { taskId: task.id, newDueDate: task.dueDate });
    upsertTask(task);
    saveData();
    render();
  }

  function onNavClick(e) {
    const view = e.currentTarget.dataset.view;
    if (!view || view === currentView) return;
    navButtons.forEach(btn => btn.classList.remove('active'));
    e.currentTarget.classList.add('active');
    currentView = view;
    // Show the selected view, hide others
    Object.keys(views).forEach(k => {
      views[k].classList.toggle('active', k === view);
    });
    render();
  }

  // Modal open function
  function openModal(type, domain) {
    editingContext = { type, domain };
    modalTitle.textContent = type === 'idea' ? 'Nouvelle idée' : 'Nouvelle tâche';
    modalTitleInput.value = '';
    modalDescInput.value = '';
    modalTagsInput.value = '';
    modalDomainInput.value = domain || DOMAINS[0];
    modalPriorityWrapper.classList.toggle('hidden', type === 'idea');
    modalPriorityInput.value = 'medium';
    modalOverlay.classList.remove('hidden');
  }

  function closeModal() {
    modalOverlay.classList.add('hidden');
    editingContext = null;
  }

  function onModalSave() {
    const title = modalTitleInput.value.trim();
    if (!title) {
      alert('Le titre est requis.');
      return;
    }
    const desc = modalDescInput.value.trim();
    const domain = modalDomainInput.value;
    const tags = modalTagsInput.value.split(',').map(s => s.trim().replace(/^#/, '')).filter(Boolean);
    if (!editingContext) return;
    if (editingContext.type === 'idea') {
      const newIdea = {
        id: uuid(),
        title,
        desc,
        domain,
        status: 'new',
        votes: {},
        tags,
        createdAt: new Date().toISOString(),
        author: data.currentUser || '',
      };
      data.ideas.push(newIdea);
      logAction('add_idea', { id: newIdea.id, title: newIdea.title });
      showToast('Idée ajoutée.');
      // Persist to backend
      upsertIdea(newIdea);
    } else {
      // task
      const priority = modalPriorityInput.value;
      const newTask = {
        id: uuid(),
        title,
        desc,
        domain,
        done: false,
        dueDate: '',
        assignee: data.currentUser || '',
        tags,
        priority,
        focus: false,
        createdAt: new Date().toISOString(),
        author: data.currentUser || '',
        subtasks: [],
      };
      data.tasks.push(newTask);
      logAction('add_task', { id: newTask.id, title: newTask.title });
      showToast('Tâche ajoutée.');
      upsertTask(newTask);
    }
    saveData();
    closeModal();
    render();
  }

  // Add event listeners
  navButtons.forEach(btn => btn.addEventListener('click', onNavClick));
  document.getElementById('btn-add-idea').addEventListener('click', () => openModal('idea'));
  document.getElementById('btn-add-task-entreprise').addEventListener('click', () => openModal('task', 'entreprise'));
  document.getElementById('btn-add-task-dev').addEventListener('click', () => openModal('task', 'dev'));
  modalCancelBtn.addEventListener('click', closeModal);
  modalSaveBtn.addEventListener('click', onModalSave);

  // Search & Filter events (debounced)
  globalSearch.addEventListener('input', () => {
    render();
  });
  filterDomain.addEventListener('change', () => {
    render();
  });
  filterStatus.addEventListener('change', () => {
    render();
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl+K / Cmd+K for search focus
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      globalSearch.focus();
    }
    // Alt+N to open new item modal for current view
    if (e.altKey && e.key.toLowerCase() === 'n') {
      e.preventDefault();
      if (currentView === 'inbox') {
        openModal('idea');
      } else if (currentView === 'checklist-entreprise') {
        openModal('task', 'entreprise');
      } else if (currentView === 'checklist-dev') {
        openModal('task', 'dev');
      }
    }
  });

  // Service worker registration for offline
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(err => {
        console.warn('ServiceWorker registration failed: ', err);
      });
    });
  }

  // Data import/export functionality (for collab without server)
  // We'll add hidden file input triggered by keyboard: Alt+E for export, Alt+I for import
  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fp-ops-data.json';
    a.click();
    URL.revokeObjectURL(url);
  }
  function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const imported = JSON.parse(reader.result);
          // merge imported data with existing data (shallow merge for arrays)
          if (imported.ideas) {
            imported.ideas.forEach(impIdea => {
              if (!data.ideas.find(i => i.id === impIdea.id)) {
                data.ideas.push(impIdea);
              }
            });
          }
          if (imported.tasks) {
            imported.tasks.forEach(impTask => {
              if (!data.tasks.find(t => t.id === impTask.id)) {
                data.tasks.push(impTask);
              }
            });
          }
          showToast('Données importées.');
          saveData();
          render();
        } catch (err) {
          alert('Fichier invalide.');
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }
  document.addEventListener('keydown', e => {
    if (e.altKey && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      exportData();
    }
    if (e.altKey && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      importData();
    }
  });

  // -------------------------------------------------------------------------
  // Backend integration helpers
  // -------------------------------------------------------------------------
  // Record an action in logs; persists to backend if configured
  function logAction(type, payload) {
    const entry = {
      id: uuid(),
      type,
      payload,
      user: data.currentUser || '',
      timestamp: new Date().toISOString(),
    };
    data.logs.push(entry);
    saveData();
    if (supabase) {
      supabase.from('logs').insert(entry).catch(() => {});
    }
  }

  // Insert/update idea in Supabase
  async function upsertIdea(idea) {
    if (!supabase) return;
    try {
      const { error } = await supabase.from('ideas').upsert(idea, { onConflict: 'id' });
      if (error) console.warn('Supabase idea upsert error:', error);
    } catch (e) {
      console.warn('Supabase idea upsert failed', e);
    }
  }

  // Insert/update task in Supabase
  async function upsertTask(task) {
    if (!supabase) return;
    try {
      const { error } = await supabase.from('tasks').upsert(task, { onConflict: 'id' });
      if (error) console.warn('Supabase task upsert error:', error);
    } catch (e) {
      console.warn('Supabase task upsert failed', e);
    }
  }

  // Fetch initial data from Supabase
  async function fetchFromBackend() {
    if (!supabase) return;
    try {
      const [ideasRes, tasksRes] = await Promise.all([
        supabase.from('ideas').select('*'),
        supabase.from('tasks').select('*'),
      ]);
      if (!ideasRes.error) {
        data.ideas = ideasRes.data;
      }
      if (!tasksRes.error) {
        data.tasks = tasksRes.data;
      }
      saveData();
      render();
    } catch (e) {
      console.warn('Supabase fetch failed', e);
    }
  }

  // Subscribe to realtime changes from Supabase
  function subscribeRealtime() {
    if (!supabase) return;
    supabase
      .channel('public:ideas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ideas' }, payload => {
        const newIdea = payload.new;
        const idx = data.ideas.findIndex(i => i.id === newIdea.id);
        if (idx >= 0) {
          data.ideas[idx] = newIdea;
        } else {
          data.ideas.push(newIdea);
        }
        saveData();
        render();
      })
      .subscribe();
    supabase
      .channel('public:tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, payload => {
        const newTask = payload.new;
        const idx = data.tasks.findIndex(t => t.id === newTask.id);
        if (idx >= 0) {
          data.tasks[idx] = newTask;
        } else {
          data.tasks.push(newTask);
        }
        saveData();
        render();
      })
      .subscribe();
  }

  // Kick off realtime fetch & subscribe if supabase is configured
  if (supabase) {
    fetchFromBackend().then(() => {
      subscribeRealtime();
    });
  }

  // Initialization
  function init() {
    loadData();
    promptForUser();
    buildDomainOptions();
    // Show the first view by default
    Object.keys(views).forEach(k => views[k].classList.remove('active'));
    views[currentView].classList.add('active');
    document.querySelector(`#app-nav button[data-view="${currentView}"]`).classList.add('active');
    render();
  }

  init();
})();