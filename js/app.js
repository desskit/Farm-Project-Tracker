/* Farm Project Tracker — UI layer (static prototype).
 * Renders views from `Store`, handles interaction via event delegation. */
(function () {
  'use strict';

  var S = window.Store;
  var ui = { view: 'dashboard', scope: 'mine', projectId: null };

  /* ---------------- helpers ---------------- */
  function $(sel) { return document.querySelector(sel); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function bucketBadge(bucket) {
    if (bucket === 'overdue') return '<span class="badge overdue">Overdue</span>';
    if (bucket === 'today') return '<span class="badge today">Due today</span>';
    if (bucket === 'upcoming') return '<span class="badge upcoming">Coming up</span>';
    return '';
  }
  function userOptions(selected, includeUnassigned) {
    var html = includeUnassigned ? '<option value="">Unassigned</option>' : '';
    S.users().forEach(function (u) {
      html += '<option value="' + u.id + '"' + (u.id === selected ? ' selected' : '') + '>' + esc(u.name) + '</option>';
    });
    return html;
  }
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 2200);
  }

  /* ---------------- top bar ---------------- */
  function renderUserArea() {
    var u = S.currentUser();
    var opts = S.users().map(function (x) {
      return '<option value="' + x.id + '"' + (x.id === u.id ? ' selected' : '') + '>' + esc(x.name) + '</option>';
    }).join('');
    $('#user-area').innerHTML =
      '<span class="role-badge">' + esc(u.role) + '</span>' +
      '<select data-action="set-user" aria-label="Current user">' + opts + '</select>';
  }

  /* ---------------- modal ---------------- */
  function openModal(title, bodyHTML) {
    $('#modal-title').textContent = title;
    $('#modal-body').innerHTML = bodyHTML;
    $('#modal').hidden = false;
    applyConditionalFields($('#modal-body'));
  }
  function closeModal() { $('#modal').hidden = true; $('#modal-body').innerHTML = ''; }

  // Show/hide [data-show-when="field=value"] groups based on a form's control value.
  function applyConditionalFields(root) {
    var groups = root.querySelectorAll('[data-show-when]');
    groups.forEach(function (g) {
      var cond = g.getAttribute('data-show-when');
      var parts = cond.split('=');
      var field = parts[0], val = parts[1];
      var ctrl = root.querySelector('[name="' + field + '"]');
      var current = ctrl ? ctrl.value : '';
      // Explicit 'block' — '' would fall back to the [data-show-when]{display:none} rule.
      g.style.display = (current === val) ? 'block' : 'none';
    });
  }

  /* ---------------- item card ---------------- */
  function dashItemCard(it) {
    return '' +
      '<div class="card">' +
        '<div class="item">' +
          '<div class="left-rail ' + it.bucket + '"></div>' +
          '<div class="item-main">' +
            '<p class="item-title">' + esc(it.title) + '</p>' +
            '<p class="item-sub">' + esc(it.subtitle) + '</p>' +
            '<div class="item-badges">' + bucketBadge(it.bucket) +
              '<span class="badge neutral">' + esc(kindLabel(it.kind)) + '</span>' +
            '</div>' +
          '</div>' +
          '<button class="btn small primary" data-action="' + it.action + '" data-id="' + it.id + '">' + esc(it.actionLabel) + '</button>' +
        '</div>' +
      '</div>';
  }
  function kindLabel(k) { return k === 'chore' ? 'Chore' : k === 'maintenance' ? 'Upkeep' : 'Project task'; }

  /* ---------------- views ---------------- */
  function viewDashboard() {
    var b = S.dashboard(ui.scope);
    var total = b.overdue.length + b.today.length + b.upcoming.length;
    var html = '' +
      '<div class="view-head">' +
        '<div><h1>Today</h1><p class="subtle">' + S.fmtDate(S.todayISO()) + ' · ' + esc(S.currentUser().name) + '</p></div>' +
        '<div class="segmented">' +
          '<button class="' + (ui.scope === 'mine' ? 'active' : '') + '" data-action="set-scope" data-scope="mine">Mine</button>' +
          '<button class="' + (ui.scope === 'all' ? 'active' : '') + '" data-action="set-scope" data-scope="all">Everything</button>' +
        '</div>' +
      '</div>';

    if (total === 0) {
      html += '<div class="empty">Nothing due in the next 7 days' + (ui.scope === 'mine' ? ' for you' : '') + '. 🎉</div>';
    } else {
      html += section('Overdue', b.overdue);
      html += section('Due today', b.today);
      html += section('Coming up', b.upcoming);
    }
    return html;

    function section(label, items) {
      if (!items.length) return '';
      return '<div class="section-title">' + label + '<span class="count-pill">' + items.length + '</span></div>' +
        items.map(dashItemCard).join('');
    }
  }

  function viewChores() {
    var chores = S.listChores();
    var html = '' +
      '<div class="view-head"><h1>Chores</h1>' +
      '<button class="btn primary small" data-action="open-add-chore">+ Add</button></div>';
    if (!chores.length) { html += '<div class="empty">No chores yet.</div>'; return html; }
    html += chores.map(function (c) {
      var bucket = S.bucketForDate(c.nextDue);
      return '' +
        '<div class="card">' +
          '<div class="item">' +
            '<div class="left-rail ' + bucket + '"></div>' +
            '<div class="item-main">' +
              '<p class="item-title">' + esc(c.name) + '</p>' +
              '<p class="item-sub">' + esc(S.describeSchedule(c.schedule)) + ' · ' + esc(S.userName(c.assignedTo)) + '</p>' +
              '<div class="item-badges">' +
                (bucket !== 'later' ? bucketBadge(bucket) : '') +
                '<span class="badge neutral">Due ' + esc(S.fmtDate(c.nextDue)) + ' · ' + esc(S.relativeLabel(c.nextDue)) + '</span>' +
                '<span class="badge neutral">' + (c.catchUp === 'mustCatchUp' ? 'Must catch up' : 'Skips if missed') + '</span>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="row-actions" style="margin-top:12px">' +
            '<button class="btn small primary" data-action="complete-chore" data-id="' + c.id + '">Mark done</button>' +
            '<button class="btn small ghost danger" data-action="delete-chore" data-id="' + c.id + '">Delete</button>' +
          '</div>' +
        '</div>';
    }).join('');
    return html;
  }

  function viewMaintenance() {
    var assets = S.listAssets();
    var html = '' +
      '<div class="view-head"><h1>Upkeep</h1>' +
      '<button class="btn primary small" data-action="open-add-asset">+ Asset</button></div>' +
      '<div class="notice">Maintenance is grouped by <strong>asset</strong>. Due by calendar interval or by usage (meter readings).</div>';

    if (!assets.length) { html += '<div class="empty">No assets yet.</div>'; return html; }

    html += assets.map(function (a) {
      var reading = S.latestReading(a.id);
      var meter = a.meterUnit ? (' · ' + (reading != null ? reading + ' ' + a.meterUnit : 'no readings')) : '';
      var items = S.maintenanceForAsset(a.id);
      var itemsHtml = items.length ? items.map(function (m) {
        var st = S.maintenanceStatus(m);
        return '' +
          '<div class="card tap" data-action="open-log-service" data-id="' + m.id + '" style="margin:8px 0 0">' +
            '<div class="item">' +
              '<div class="left-rail ' + st.bucket + '"></div>' +
              '<div class="item-main">' +
                '<p class="item-title">' + esc(m.name) + '</p>' +
                '<p class="item-sub">' + esc(st.detail) + '</p>' +
                '<div class="item-badges">' + (st.bucket !== 'later' ? bucketBadge(st.bucket) : '<span class="badge neutral">On track</span>') +
                  '<span class="badge neutral">' + (m.intervalType === 'usage' ? 'Every ' + m.intervalValue + ' ' + (st.unit || '') : 'Every ' + m.intervalValue + ' ' + m.intervalUnit) + '</span>' +
                '</div>' +
              '</div>' +
              '<button class="btn small primary" data-action="open-log-service" data-id="' + m.id + '">Log</button>' +
            '</div>' +
          '</div>';
      }).join('') : '<p class="subtle" style="margin:8px 0 0">No maintenance items yet.</p>';

      return '' +
        '<div class="card">' +
          '<div class="item">' +
            '<div class="item-main">' +
              '<p class="item-title">' + esc(a.name) + '</p>' +
              '<p class="item-sub">' + esc(a.category) + esc(meter) + '</p>' +
            '</div>' +
            '<button class="btn small" data-action="open-add-maintenance" data-id="' + a.id + '">+ Item</button>' +
          '</div>' +
          itemsHtml +
        '</div>';
    }).join('');
    return html;
  }

  function viewProjects() {
    if (ui.projectId) return viewProjectDetail(ui.projectId);
    var projects = S.listProjects();
    var canCreate = S.canCreateProject();
    var html = '<div class="view-head"><h1>Projects</h1>' +
      (canCreate ? '<button class="btn primary small" data-action="open-add-project">+ New</button>' : '') +
      '</div>';
    if (!canCreate) {
      html += '<div class="notice">You are signed in as a <strong>worker</strong>. Only farm managers and admins can create projects — switch the user in the top bar to try it.</div>';
    }
    if (!projects.length) { html += '<div class="empty">No projects yet.</div>'; return html; }
    html += projects.map(function (p) {
      var tasks = S.projectTasks(p.id);
      var done = tasks.filter(function (t) { return t.done; }).length;
      var pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
      return '' +
        '<div class="card tap" data-action="open-project" data-id="' + p.id + '">' +
          '<div class="item"><div class="item-main">' +
            '<p class="item-title">' + esc(p.name) + '</p>' +
            '<p class="item-sub">' + esc(S.STATUS_LABELS[p.status] || p.status) +
              (p.targetDate ? ' · target ' + esc(S.fmtDate(p.targetDate)) : '') +
              ' · by ' + esc(S.userName(p.createdBy)) + '</p>' +
            '<div class="progress"><span style="width:' + pct + '%"></span></div>' +
            '<p class="subtle">' + done + ' / ' + tasks.length + ' tasks done</p>' +
          '</div></div>' +
        '</div>';
    }).join('');
    return html;
  }

  function viewProjectDetail(id) {
    var p = S.getProject(id);
    if (!p) { ui.projectId = null; return viewProjects(); }
    var tasks = S.projectTasks(id);
    var done = tasks.filter(function (t) { return t.done; }).length;
    var pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;

    var statusOpts = Object.keys(S.STATUS_LABELS).map(function (k) {
      return '<option value="' + k + '"' + (k === p.status ? ' selected' : '') + '>' + esc(S.STATUS_LABELS[k]) + '</option>';
    }).join('');

    var html = '' +
      '<div class="view-head">' +
        '<button class="btn small ghost" data-action="back-to-projects">‹ Projects</button>' +
        '<button class="btn small ghost danger" data-action="delete-project" data-id="' + p.id + '">Delete</button>' +
      '</div>' +
      '<div class="card">' +
        '<h1 style="font-size:20px">' + esc(p.name) + '</h1>' +
        (p.description ? '<p class="subtle">' + esc(p.description) + '</p>' : '') +
        '<div class="field" style="margin-top:10px"><label>Status</label>' +
          '<select data-action="set-project-status" data-id="' + p.id + '">' + statusOpts + '</select></div>' +
        '<div class="progress"><span style="width:' + pct + '%"></span></div>' +
        '<p class="subtle">' + done + ' / ' + tasks.length + ' tasks done' +
          (p.targetDate ? ' · target ' + esc(S.fmtDate(p.targetDate)) : '') + '</p>' +
      '</div>' +

      '<div class="section-title">Tasks<span class="count-pill">' + tasks.length + '</span></div>';

    if (tasks.length) {
      html += tasks.map(function (t) {
        return '' +
          '<div class="card">' +
            '<div class="check-row ' + (t.done ? 'done' : '') + '">' +
              '<input type="checkbox" ' + (t.done ? 'checked' : '') + ' data-action="toggle-task" data-id="' + t.id + '" />' +
              '<div class="item-main">' +
                '<p class="item-title c-title">' + esc(t.title) + '</p>' +
                (t.description ? '<p class="item-sub">' + esc(t.description) + '</p>' : '') +
                '<div class="chips">' +
                  '<span class="chip">' + esc(S.userName(t.assignedTo)) + '</span>' +
                  (t.dueDate ? '<span class="chip">due ' + esc(S.fmtDate(t.dueDate)) + '</span>' : '') +
                  (t.done ? '<span class="chip">done ' + esc(S.fmtDate(t.doneAt)) + '</span>' : '') +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>';
      }).join('');
    } else {
      html += '<div class="empty">No tasks yet. Add one, or let AI suggest a plan.</div>';
    }

    html += '<div class="stack" style="margin-top:14px">' +
      '<button class="btn primary block" data-action="open-add-task" data-id="' + p.id + '">+ Add task</button>' +
      '<button class="btn block" data-action="suggest-steps" data-id="' + p.id + '">✨ Suggest steps (AI)</button>' +
      '</div>' +
      '<p class="subtle" style="margin-top:8px">“Suggest steps” uses an offline placeholder in this prototype. The real Claude API breakdown arrives with the server phase.</p>';
    return html;
  }

  function viewMore() {
    var acts = S.listActivity();
    var html = '<div class="view-head"><h1>More</h1></div>';

    html += '<div class="section-title">People</div>';
    html += S.users().map(function (u) {
      return '<div class="card"><div class="item"><div class="item-main">' +
        '<p class="item-title">' + esc(u.name) + '</p>' +
        '<p class="item-sub">' + esc(u.role) + (u.id === S.currentUser().id ? ' · current' : '') + '</p>' +
        '</div>' +
        (u.id === S.currentUser().id ? '<span class="badge upcoming">You</span>' :
          '<button class="btn small" data-action="switch-to-user" data-id="' + u.id + '">Switch</button>') +
        '</div></div>';
    }).join('');

    html += '<div class="section-title">Recent activity</div><div class="card">';
    if (!acts.length) { html += '<p class="subtle">Nothing yet.</p>'; }
    else {
      html += acts.map(function (a) {
        var when = new Date(a.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        return '<div class="hist-row"><span>' + esc(S.userName(a.userId)) + ' ' + esc(a.text) + '</span><span class="subtle">' + when + '</span></div>';
      }).join('');
    }
    html += '</div>';

    html += '<div class="section-title">Prototype</div>' +
      '<div class="notice">This is a client-side prototype. Data is stored in this browser only (localStorage) — nothing is sent to a server.</div>' +
      '<button class="btn block danger" data-action="reset-data">Reset demo data</button>';
    return html;
  }

  /* ---------------- render ---------------- */
  function render() {
    renderUserArea();
    var main = $('#view');
    var v = ui.view;
    if (v === 'dashboard') main.innerHTML = viewDashboard();
    else if (v === 'chores') main.innerHTML = viewChores();
    else if (v === 'maintenance') main.innerHTML = viewMaintenance();
    else if (v === 'projects') main.innerHTML = viewProjects();
    else if (v === 'more') main.innerHTML = viewMore();
    document.querySelectorAll('.nav-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-view') === v);
    });
    window.scrollTo(0, 0);
  }

  /* ---------------- modal forms ---------------- */
  function formAddChore() {
    var wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(function (n, i) {
      return '<label><input type="checkbox" name="weekdays" value="' + i + '" />' + n + '</label>';
    }).join('');
    openModal('Add chore',
      '<form data-form="add-chore">' +
        '<div class="field"><label>Name</label><input type="text" name="name" required placeholder="e.g. Collect eggs" /></div>' +
        '<div class="field"><label>Repeats</label><select name="schedType">' +
          '<option value="daily">Every day</option>' +
          '<option value="everyNDays">Every N days</option>' +
          '<option value="weekly">Weekly (choose days)</option>' +
          '<option value="monthly">Monthly (choose day)</option>' +
        '</select></div>' +
        '<div class="field" data-show-when="schedType=everyNDays"><label>N (days)</label><input type="number" name="n" min="1" value="2" /></div>' +
        '<div class="field" data-show-when="schedType=weekly"><label>Days</label><div class="weekday-row">' + wd + '</div></div>' +
        '<div class="field" data-show-when="schedType=monthly"><label>Day of month</label><input type="number" name="monthDay" min="1" max="28" value="1" /></div>' +
        '<div class="field"><label>First due</label><input type="date" name="firstDue" value="' + S.todayISO() + '" /></div>' +
        '<div class="field"><label>Assign to</label><select name="assignedTo">' + userOptions(S.currentUser().id, true) + '</select></div>' +
        '<div class="field"><label>If missed</label><select name="catchUp">' +
          '<option value="skipToNext">Skip to next occurrence</option>' +
          '<option value="mustCatchUp">Must catch up (stays overdue)</option>' +
        '</select></div>' +
        '<div class="form-actions"><button type="button" class="btn" data-action="close-modal">Cancel</button>' +
        '<button type="submit" class="btn primary">Add chore</button></div>' +
      '</form>');
  }
  function submitAddChore(form) {
    var fd = new FormData(form);
    var type = fd.get('schedType');
    var schedule = { type: type };
    if (type === 'everyNDays') schedule.n = Number(fd.get('n')) || 1;
    if (type === 'weekly') schedule.weekdays = fd.getAll('weekdays').map(Number);
    if (type === 'monthly') schedule.day = Number(fd.get('monthDay')) || 1;
    var name = (fd.get('name') || '').trim();
    if (!name) return;
    if (type === 'weekly' && !schedule.weekdays.length) { toast('Pick at least one weekday'); return; }
    S.addChore({ name: name, schedule: schedule, assignedTo: fd.get('assignedTo') || null, catchUp: fd.get('catchUp'), nextDue: fd.get('firstDue') || S.todayISO() });
    closeModal(); toast('Chore added'); render();
  }

  function formAddAsset() {
    openModal('Add asset',
      '<form data-form="add-asset">' +
        '<div class="field"><label>Name</label><input type="text" name="name" required placeholder="e.g. Zero-turn mower" /></div>' +
        '<div class="field"><label>Category</label><input type="text" name="category" value="Equipment" /></div>' +
        '<div class="field"><label>Meter</label><select name="meterUnit">' +
          '<option value="">None</option><option value="hours">Engine hours</option><option value="miles">Miles</option>' +
        '</select></div>' +
        '<div class="form-actions"><button type="button" class="btn" data-action="close-modal">Cancel</button>' +
        '<button type="submit" class="btn primary">Add asset</button></div>' +
      '</form>');
  }
  function submitAddAsset(form) {
    var fd = new FormData(form);
    var name = (fd.get('name') || '').trim();
    if (!name) return;
    S.addAsset({ name: name, category: fd.get('category') || 'Equipment', meterUnit: fd.get('meterUnit') || null });
    closeModal(); toast('Asset added'); render();
  }

  function formAddMaintenance(assetId) {
    var asset = S.assetById(assetId);
    var usageAllowed = asset && asset.meterUnit;
    openModal('Maintenance on ' + (asset ? asset.name : 'asset'),
      '<form data-form="add-maintenance" data-asset="' + assetId + '">' +
        '<div class="field"><label>What needs doing</label><input type="text" name="name" required placeholder="e.g. Replace air filter" /></div>' +
        '<div class="field"><label>Due by</label><select name="intervalType">' +
          '<option value="calendar">Calendar time</option>' +
          (usageAllowed ? '<option value="usage">Usage (' + asset.meterUnit + ')</option>' : '') +
        '</select></div>' +
        '<div class="field" data-show-when="intervalType=calendar"><label>Every</label>' +
          '<div style="display:flex;gap:8px"><input type="number" name="calValue" min="1" value="6" style="flex:1" />' +
          '<select name="calUnit" style="flex:1"><option value="months">months</option><option value="days">days</option></select></div></div>' +
        (usageAllowed ? '<div class="field" data-show-when="intervalType=usage"><label>Every (' + asset.meterUnit + ')</label><input type="number" name="usageValue" min="1" value="50" /></div>' : '') +
        '<div class="form-actions"><button type="button" class="btn" data-action="close-modal">Cancel</button>' +
        '<button type="submit" class="btn primary">Add item</button></div>' +
      '</form>');
  }
  function submitAddMaintenance(form) {
    var fd = new FormData(form);
    var assetId = form.getAttribute('data-asset');
    var name = (fd.get('name') || '').trim();
    if (!name) return;
    var type = fd.get('intervalType');
    var data = { assetId: assetId, name: name, intervalType: type };
    if (type === 'calendar') { data.intervalValue = fd.get('calValue'); data.intervalUnit = fd.get('calUnit'); }
    else { data.intervalValue = fd.get('usageValue'); }
    S.addMaintenance(data);
    closeModal(); toast('Maintenance item added'); render();
  }

  function formLogService(itemId) {
    var item = S.listMaintenance().filter(function (m) { return m.id === itemId; })[0];
    if (!item) return;
    var asset = S.assetById(item.assetId);
    var st = S.maintenanceStatus(item);
    var logs = S.maintenanceLogsFor(itemId);
    var histHtml = logs.length ? logs.map(function (l) {
      return '<div class="hist-row"><span>' + esc(S.fmtDate(l.date)) + ' · ' + esc(S.userName(l.userId)) +
        (l.reading != null ? ' · ' + l.reading : '') + (l.cost ? ' · $' + l.cost : '') +
        (l.notes ? ' · ' + esc(l.notes) : '') + '</span></div>';
    }).join('') : '<p class="subtle">No history yet.</p>';

    openModal('Log: ' + item.name,
      '<p class="subtle">' + esc(asset ? asset.name : '') + ' · ' + esc(st.detail) + '</p>' +
      '<form data-form="log-service" data-id="' + itemId + '">' +
        '<div class="field"><label>Date</label><input type="date" name="date" value="' + S.todayISO() + '" /></div>' +
        (asset && asset.meterUnit ? '<div class="field"><label>Meter reading (' + asset.meterUnit + ')</label><input type="number" name="reading" placeholder="current ' + asset.meterUnit + '" /></div>' : '') +
        '<div class="field"><label>Cost ($, optional)</label><input type="number" name="cost" min="0" step="0.01" /></div>' +
        '<div class="field"><label>Notes</label><textarea name="notes" placeholder="Parts used, observations…"></textarea></div>' +
        '<div class="form-actions"><button type="button" class="btn" data-action="close-modal">Cancel</button>' +
        '<button type="submit" class="btn primary">Mark serviced</button></div>' +
      '</form>' +
      '<div class="section-title">Service history</div><div class="card">' + histHtml + '</div>');
  }
  function submitLogService(form) {
    var fd = new FormData(form);
    var itemId = form.getAttribute('data-id');
    S.logService(itemId, { date: fd.get('date'), reading: fd.get('reading'), cost: fd.get('cost'), notes: fd.get('notes') });
    closeModal(); toast('Service logged'); render();
  }

  function formAddProject() {
    openModal('New project',
      '<form data-form="add-project">' +
        '<div class="field"><label>Name</label><input type="text" name="name" required placeholder="e.g. Rebuild the barn ramp" /></div>' +
        '<div class="field"><label>Description</label><textarea name="description" placeholder="What is this project about?"></textarea></div>' +
        '<div class="field"><label>Status</label><select name="status">' +
          Object.keys(S.STATUS_LABELS).map(function (k) { return '<option value="' + k + '">' + esc(S.STATUS_LABELS[k]) + '</option>'; }).join('') +
        '</select></div>' +
        '<div class="field"><label>Target date (optional)</label><input type="date" name="targetDate" /></div>' +
        '<div class="form-actions"><button type="button" class="btn" data-action="close-modal">Cancel</button>' +
        '<button type="submit" class="btn primary">Create project</button></div>' +
      '</form>');
  }
  function submitAddProject(form) {
    var fd = new FormData(form);
    var name = (fd.get('name') || '').trim();
    if (!name) return;
    var res = S.addProject({ name: name, description: fd.get('description'), status: fd.get('status'), targetDate: fd.get('targetDate') || null });
    if (res.error) { toast(res.error); return; }
    closeModal(); toast('Project created'); ui.projectId = res.project.id; render();
  }

  function formAddTask(projectId) {
    openModal('Add task',
      '<form data-form="add-task" data-id="' + projectId + '">' +
        '<div class="field"><label>Title</label><input type="text" name="title" required placeholder="e.g. Order lumber" /></div>' +
        '<div class="field"><label>Details (optional)</label><textarea name="description"></textarea></div>' +
        '<div class="field"><label>Assign to</label><select name="assignedTo">' + userOptions('', true) + '</select></div>' +
        '<div class="field"><label>Due date (optional)</label><input type="date" name="dueDate" /></div>' +
        '<div class="form-actions"><button type="button" class="btn" data-action="close-modal">Cancel</button>' +
        '<button type="submit" class="btn primary">Add task</button></div>' +
      '</form>');
  }
  function submitAddTask(form) {
    var fd = new FormData(form);
    var projectId = form.getAttribute('data-id');
    var title = (fd.get('title') || '').trim();
    if (!title) return;
    S.addTask(projectId, { title: title, description: fd.get('description'), assignedTo: fd.get('assignedTo') || null, dueDate: fd.get('dueDate') || null });
    closeModal(); toast('Task added'); render();
  }

  function suggestSteps(projectId) {
    var p = S.getProject(projectId);
    if (!p) return;
    var steps = S.suggestSteps(p.name, p.description);
    var list = steps.map(function (s, i) {
      return '<li><input type="checkbox" name="pick" value="' + i + '" checked />' +
        '<div><div class="s-title">' + esc(s.title) + '</div>' +
        (s.description ? '<div class="s-desc">' + esc(s.description) + '</div>' : '') + '</div></li>';
    }).join('');
    openModal('Suggested steps',
      '<div class="notice">✨ <strong>Offline placeholder.</strong> In the finished app this comes from the Claude API (server-side). Review, uncheck any you don’t want, then add them.</div>' +
      '<form data-form="accept-steps" data-id="' + projectId + '">' +
        '<ul class="suggest-list">' + list + '</ul>' +
        '<div class="form-actions"><button type="button" class="btn" data-action="close-modal">Cancel</button>' +
        '<button type="submit" class="btn primary">Add selected</button></div>' +
      '</form>');
    // stash for accept
    suggestSteps._cache = { projectId: projectId, steps: steps };
  }
  function submitAcceptSteps(form) {
    var fd = new FormData(form);
    var picks = fd.getAll('pick').map(Number);
    var cache = suggestSteps._cache;
    if (!cache) { closeModal(); return; }
    var chosen = cache.steps.filter(function (_, i) { return picks.indexOf(i) !== -1; });
    if (!chosen.length) { toast('Nothing selected'); return; }
    S.addTasksBulk(cache.projectId, chosen);
    closeModal(); toast('Added ' + chosen.length + ' step(s)'); render();
  }

  /* ---------------- event wiring ---------------- */
  function handleAction(action, el) {
    var id = el.getAttribute('data-id');
    switch (action) {
      case 'switch-view': ui.view = el.getAttribute('data-view'); ui.projectId = null; render(); break;
      case 'set-scope': ui.scope = el.getAttribute('data-scope'); render(); break;
      case 'close-modal': closeModal(); break;

      case 'complete-chore': S.completeChore(id); toast('Nice — done'); render(); break;
      case 'delete-chore': if (confirm('Delete this chore?')) { S.deleteChore(id); render(); } break;
      case 'open-add-chore': formAddChore(); break;

      case 'open-add-asset': formAddAsset(); break;
      case 'open-add-maintenance': formAddMaintenance(id); break;
      case 'open-log-service': formLogService(id); break;

      case 'open-project': ui.projectId = id; ui.view = 'projects'; render(); break;
      case 'back-to-projects': ui.projectId = null; render(); break;
      case 'open-add-project': formAddProject(); break;
      case 'open-add-task': formAddTask(id); break;
      case 'toggle-task': S.toggleTask(id); render(); break;
      case 'suggest-steps': suggestSteps(id); break;
      case 'delete-project': if (confirm('Delete this project and its tasks?')) { S.deleteProject(id); ui.projectId = null; render(); } break;

      case 'switch-to-user': S.setCurrentUser(id); toast('Now acting as ' + S.userName(id)); render(); break;
      case 'reset-data': if (confirm('Reset all demo data in this browser?')) { S.reset(); ui.projectId = null; ui.view = 'dashboard'; render(); toast('Demo data reset'); } break;
    }
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    // Let the checkbox toggle itself fire natively via change; ignore its click here.
    if (el.tagName === 'INPUT' || el.tagName === 'SELECT') return;
    var action = el.getAttribute('data-action');
    e.preventDefault();
    handleAction(action, el);
  });

  document.addEventListener('change', function (e) {
    // Conditional form fields (schedule type, interval type) — these controls
    // carry no data-action, so handle them before the data-action dispatch.
    if (e.target.name === 'schedType' || e.target.name === 'intervalType') {
      applyConditionalFields($('#modal-body'));
    }
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var action = el.getAttribute('data-action');
    if (action === 'set-user') { S.setCurrentUser(el.value); ui.projectId = null; render(); return; }
    if (action === 'toggle-task') { S.toggleTask(el.getAttribute('data-id')); render(); return; }
    if (action === 'set-project-status') { S.updateProjectStatus(el.getAttribute('data-id'), el.value); toast('Status updated'); render(); return; }
  });

  document.addEventListener('submit', function (e) {
    var form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    switch (form.getAttribute('data-form')) {
      case 'add-chore': submitAddChore(form); break;
      case 'add-asset': submitAddAsset(form); break;
      case 'add-maintenance': submitAddMaintenance(form); break;
      case 'log-service': submitLogService(form); break;
      case 'add-project': submitAddProject(form); break;
      case 'add-task': submitAddTask(form); break;
      case 'accept-steps': submitAcceptSteps(form); break;
    }
  });

  /* ---------------- boot ---------------- */
  S.init();
  render();

  // Register the service worker for offline/PWA (skipped on file://).
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').catch(function () {});
    });
  }
})();
