/* Farm Project Tracker — UI layer (static prototype).
 * Renders views from `Store`, handles interaction via event delegation. */
(function () {
  'use strict';

  var S = window.Store;
  var ui = { view: 'dashboard', scope: 'mine', projectId: null, lbWindow: 'month', dashMode: 'list', calMonth: null, calDay: null, searchQ: '', moreSection: null };

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
  function optTag(value, label, sel) {
    return '<option value="' + value + '"' + (value === sel ? ' selected' : '') + '>' + esc(label) + '</option>';
  }
  function roleOpts(sel) {
    return ['admin', 'manager', 'worker'].map(function (r) { return optTag(r, r.charAt(0).toUpperCase() + r.slice(1), sel); }).join('');
  }
  function hourOptions(sel) {
    var s = '';
    for (var h = 0; h < 24; h++) {
      var lbl = h === 0 ? '12 AM' : h < 12 ? h + ' AM' : h === 12 ? '12 PM' : (h - 12) + ' PM';
      s += '<option value="' + h + '"' + (h === sel ? ' selected' : '') + '>' + lbl + '</option>';
    }
    return s;
  }
  function requirePhotoCheckbox(checked) {
    return '<div class="field"><label class="inline-check"><input type="checkbox" name="requirePhoto"' +
      (checked ? ' checked' : '') + ' /> 📷 Require photo proof to complete</label></div>';
  }
  function photoProofField(label) {
    return '<div class="field"><label>' + esc(label || 'Photo proof (required)') + '</label>' +
      '<input type="file" name="photo" accept="image/*" capture="environment" required /></div>';
  }
  function proofBtn(kind, id) {
    return '<span class="chip chip-link" data-action="view-proof" data-kind="' + kind + '" data-id="' + id + '">📷 proof</span>';
  }
  // Downscale a selected image (max longest edge) to a JPEG data URL for localStorage.
  function fileToDataURL(file, maxDim, cb) {
    if (!file) { cb(null); return; }
    var reader = new FileReader();
    reader.onload = function () {
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        var cw = Math.max(1, Math.round(img.width * scale));
        var ch = Math.max(1, Math.round(img.height * scale));
        var canvas = document.createElement('canvas');
        canvas.width = cw; canvas.height = ch;
        canvas.getContext('2d').drawImage(img, 0, 0, cw, ch);
        try { cb(canvas.toDataURL('image/jpeg', 0.7)); } catch (e) { cb(reader.result); }
      };
      img.onerror = function () { cb(null); };
      img.src = reader.result;
    };
    reader.onerror = function () { cb(null); };
    reader.readAsDataURL(file);
  }
  function exportData() {
    var blob = new Blob([S.exportState()], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'farm-tracker-backup.json';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    toast('Backup downloaded');
  }
  function handleImportFile(input) {
    var f = input.files && input.files[0];
    if (!f) return;
    if (!confirm('Import this backup? It replaces all data in this browser.')) { input.value = ''; return; }
    var reader = new FileReader();
    reader.onload = function () {
      var res = S.importState(String(reader.result));
      if (res.error) { toast(res.error); }
      else { ui.projectId = null; ui.view = 'dashboard'; toast('Backup imported'); render(); }
    };
    reader.onerror = function () { toast('Could not read that file'); };
    reader.readAsText(f);
    input.value = '';
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
      '<button class="icon-btn topbar-icon" data-action="open-search" aria-label="Search">🔍</button>' +
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
  function kindLabel(k) { return k === 'chore' ? 'Chore' : k === 'maintenance' ? 'Upkeep' : k === 'rent' ? 'Rent' : 'Project task'; }
  function openItemCard(it) {
    return '<div class="card"><div class="item">' +
      '<div class="left-rail ' + (it.bucket || 'later') + '"></div>' +
      '<div class="item-main">' +
        '<p class="item-title">' + esc(it.title) + '</p>' +
        '<p class="item-sub">' + esc(it.subtitle) + '</p>' +
        '<div class="item-badges">' + bucketBadge(it.bucket) +
          '<span class="badge neutral">' + esc(kindLabel(it.kind)) + '</span>' +
          '<span class="badge upcoming">🙌 Open</span>' +
        '</div>' +
      '</div>' +
      '<button class="btn small primary" data-action="claim-item" data-kind="' + it.kind + '" data-id="' + it.id + '">Claim</button>' +
    '</div></div>';
  }
  function openCheckbox(checked) {
    return '<div class="field"><label class="inline-check"><input type="checkbox" name="open"' +
      (checked ? ' checked' : '') + ' /> 🙌 Open — any worker can claim it</label></div>';
  }
  function medal(rank) { return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '#' + rank; }

  /* ---------------- views ---------------- */
  function viewDashboard() {
    var isMgr = S.isManager();
    if (ui.scope === 'team' && !isMgr) ui.scope = 'mine';
    var calMode = ui.dashMode === 'calendar';
    var html = '' +
      '<div class="view-head">' +
        '<div><h1>Today</h1><p class="subtle">' + S.fmtDate(S.todayISO()) + ' · ' + esc(S.currentUser().name) + '</p></div>' +
        '<button class="btn small ghost" data-action="toggle-dashmode" title="Toggle calendar">' + (calMode ? '☰ List' : '📅 Calendar') + '</button>' +
      '</div>';

    html += weatherCard() + activeTimersStrip();

    if (calMode) return html + calendarView();

    html += '<div class="segmented" style="margin-bottom:12px">' +
      '<button class="' + (ui.scope === 'mine' ? 'active' : '') + '" data-action="set-scope" data-scope="mine">Mine</button>' +
      '<button class="' + (ui.scope === 'all' ? 'active' : '') + '" data-action="set-scope" data-scope="all">All</button>' +
      (isMgr ? '<button class="' + (ui.scope === 'team' ? 'active' : '') + '" data-action="set-scope" data-scope="team">Team</button>' : '') +
      '</div>';

    if (ui.scope === 'team') return html + teamDashboard();

    var b = S.dashboard(ui.scope);
    var total = b.overdue.length + b.today.length + b.upcoming.length;
    if (total === 0) {
      html += '<div class="empty">Nothing due in the next 7 days' + (ui.scope === 'mine' ? ' for you' : '') + '. 🎉</div>';
    } else {
      html += section('Overdue', b.overdue);
      html += section('Due today', b.today);
      html += section('Coming up', b.upcoming);
    }
    var open = S.openItems();
    if (open.length) {
      html += '<div class="section-title">🙌 Up for grabs<span class="count-pill">' + open.length + '</span></div>';
      html += open.map(openItemCard).join('');
    }
    return html;

    function section(label, items) {
      if (!items.length) return '';
      return '<div class="section-title">' + label + '<span class="count-pill">' + items.length + '</span></div>' +
        items.map(dashItemCard).join('');
    }
  }

  // Manager-only quick-status view: farm-wide tiles, per-person workload,
  // project progress, and this month's rent at a glance.
  function teamDashboard() {
    var b = S.dashboard('all');
    var mk = S.currentMonthKey();
    var rs = S.rentSummary(mk);
    var html = '' +
      '<div class="tiles">' +
        '<div class="tile ' + (b.overdue.length ? 'bad' : 'good') + '"><div class="t-num">' + b.overdue.length + '</div><div class="t-lbl">Overdue</div></div>' +
        '<div class="tile ' + (b.today.length ? 'warn' : 'good') + '"><div class="t-num">' + b.today.length + '</div><div class="t-lbl">Due today</div></div>' +
        '<div class="tile"><div class="t-num">' + b.upcoming.length + '</div><div class="t-lbl">Next 7 days</div></div>' +
      '</div>';

    html += '<div class="section-title">People</div>';
    html += S.users().map(function (u) {
      var w = S.userWorkload(u.id);
      var chips = '';
      if (w.choresOverdue || w.tasksOverdue) chips += '<span class="badge overdue">' + (w.choresOverdue + w.tasksOverdue) + ' overdue</span>';
      if (w.choresToday) chips += '<span class="badge today">' + w.choresToday + ' due today</span>';
      if (w.tasksOpen) chips += '<span class="badge neutral">' + w.tasksOpen + ' open task' + (w.tasksOpen === 1 ? '' : 's') + '</span>';
      if (!chips) chips = '<span class="badge upcoming">All clear</span>';
      var pts = S.userPoints(u.id, 'month');
      if (pts) chips += '<span class="badge neutral">🏆 ' + pts + ' pts</span>';
      var rentChip = '';
      var charge = S.rentChargesForMonth(mk).filter(function (c) { return c.userId === u.id; })[0];
      if (charge) {
        rentChip = charge.status === 'verified' ? '<span class="badge upcoming">Rent ✓</span>' :
          charge.status === 'marked' ? '<span class="badge today">Rent: verify</span>' :
          '<span class="badge overdue">Rent unpaid</span>';
      }
      return '<div class="card"><div class="item"><div class="item-main">' +
        '<p class="item-title">' + esc(u.name) + '</p>' +
        '<p class="item-sub">' + esc(u.role) + '</p>' +
        '<div class="item-badges">' + chips + rentChip + '</div>' +
        '</div></div></div>';
    }).join('');

    var projects = S.listProjects().filter(function (p) { return p.status !== 'done'; });
    html += '<div class="section-title">Projects</div>';
    if (!projects.length) html += '<div class="empty">No active projects.</div>';
    else html += projects.map(function (p) {
      var tasks = S.projectTasks(p.id);
      var done = tasks.filter(function (t) { return t.done; }).length;
      var pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
      return '<div class="card tap" data-action="open-project" data-id="' + p.id + '">' +
        '<div class="item"><div class="item-main">' +
          '<p class="item-title">' + esc(p.name) + '</p>' +
          '<p class="item-sub">' + esc(S.STATUS_LABELS[p.status] || p.status) + ' · ' + done + '/' + tasks.length + ' tasks' +
            (p.targetDate ? ' · target ' + esc(S.fmtDate(p.targetDate)) : '') + '</p>' +
          '<div class="progress"><span style="width:' + pct + '%"></span></div>' +
        '</div></div></div>';
    }).join('');

    html += '<div class="section-title">Rent · ' + esc(S.monthLabel(mk)) + '</div>' +
      '<div class="card tap" data-action="switch-view" data-view="more">' +
        '<div class="item"><div class="item-main">' +
          '<p class="item-title">$' + rs.collected.toFixed(0) + ' of $' + rs.due.toFixed(0) + ' verified</p>' +
          '<div class="item-badges">' +
            (rs.unpaid ? '<span class="badge overdue">' + rs.unpaid + ' unpaid</span>' : '') +
            (rs.marked ? '<span class="badge today">' + rs.marked + ' to verify</span>' : '') +
            (rs.verified ? '<span class="badge upcoming">' + rs.verified + ' verified</span>' : '') +
            (!rs.count ? '<span class="badge neutral">No rent assigned</span>' : '') +
          '</div>' +
          '<p class="subtle" style="margin-top:6px">Manage in More ›</p>' +
        '</div></div></div>';
    return html;
  }

  function viewChores() {
    var chores = S.listChores();
    var canEdit = S.isManager();
    var html = '' +
      '<div class="view-head"><h1>Chores</h1>' +
      (canEdit ? '<button class="btn primary small" data-action="open-add-chore">+ Add</button>' : '') +
      '</div>';
    if (!canEdit) html += '<div class="notice">Workers complete chores; managers and admins define them.</div>';
    if (!chores.length) { html += '<div class="empty">No chores yet.</div>'; return html; }
    html += chores.map(function (c) {
      var bucket = S.bucketForDate(c.nextDue);
      var streak = c.schedule.type === 'daily' ? S.choreStreak(c.id) : 0;
      return '' +
        '<div class="card tap" data-action="open-chore" data-id="' + c.id + '">' +
          '<div class="item">' +
            '<div class="left-rail ' + bucket + '"></div>' +
            '<div class="item-main">' +
              '<p class="item-title">' + esc(c.name) + '</p>' +
              '<p class="item-sub">' + esc(S.describeSchedule(c.schedule)) + ' · ' + esc(S.userName(c.assignedTo)) + '</p>' +
              '<div class="item-badges">' +
                (bucket !== 'later' ? bucketBadge(bucket) : '') +
                '<span class="badge neutral">Due ' + esc(S.fmtDate(c.nextDue)) + ' · ' + esc(S.relativeLabel(c.nextDue)) + '</span>' +
                '<span class="badge neutral">' + (c.catchUp === 'mustCatchUp' ? 'Must catch up' : 'Skips if missed') + '</span>' +
                (c.requirePhoto ? '<span class="badge neutral">📷 proof</span>' : '') +
                (c.steps && c.steps.length ? '<span class="badge neutral">📋 ' + c.steps.length + '-step</span>' : '') +
                (c.sentBack ? '<span class="badge overdue">↩ redo</span>' : '') +
                (c.open && !c.assignedTo ? '<span class="badge upcoming">🙌 Open</span>' : '') +
                (streak >= 2 ? '<span class="badge upcoming">🔥 ' + streak + '-day streak</span>' : '') +
              '</div>' +
            '</div>' +
            '<button class="btn small primary" data-action="complete-chore" data-id="' + c.id + '">Done</button>' +
          '</div>' +
        '</div>';
    }).join('');
    html += '<p class="subtle" style="margin-top:6px">Tap a chore for history, notes, and editing.</p>';
    return html;
  }

  function formChoreDetail(id) {
    var c = S.choreById(id); if (!c) return;
    var canEdit = S.isManager();
    var history = S.choreCompletionsFor(id);
    var streak = c.schedule.type === 'daily' ? S.choreStreak(id) : 0;
    var meId = S.currentUser().id;
    var claimable = c.open && !c.assignedTo;
    var mineOpen = c.open && c.assignedTo === meId;
    var histHtml = history.length ? history.slice(0, 15).map(function (h) {
      return '<div class="hist-row"><span>' + esc(S.fmtDate(h.date)) + ' · ' + esc(S.userName(h.completedBy)) +
        (h.notes ? ' · ' + esc(h.notes) : '') + (h.photo ? ' ' + proofBtn('chore', h.id) : '') + '</span>' +
        (canEdit ? '<button class="btn small ghost danger" data-action="send-back-chore" data-id="' + h.id + '" title="Send back">↩</button>' : '') + '</div>';
    }).join('') : '<p class="subtle">Never completed yet.</p>';

    openModal(c.name,
      '<p class="subtle">' + esc(S.describeSchedule(c.schedule)) + ' · ' + esc(S.userName(c.assignedTo)) +
        ' · next due ' + esc(S.fmtDate(c.nextDue)) + ' (' + esc(S.relativeLabel(c.nextDue)) + ')</p>' +
      '<div class="chips" style="margin:8px 0 4px">' +
        '<span class="chip">' + history.length + ' completion' + (history.length === 1 ? '' : 's') + '</span>' +
        (streak >= 2 ? '<span class="chip">🔥 ' + streak + '-day streak</span>' : '') +
        '<span class="chip">' + (c.catchUp === 'mustCatchUp' ? 'must catch up if missed' : 'skips if missed') + '</span>' +
      '</div>' +
      sentBackBanner(c.sentBack) +
      timerButton('chore', id) +
      (claimable ? '<button class="btn primary block" data-action="claim-item" data-kind="chore" data-id="' + id + '" style="margin:8px 0">🙌 Claim this chore</button>' : '') +
      (mineOpen ? '<button class="btn ghost small" data-action="release-item" data-kind="chore" data-id="' + id + '" style="margin:8px 0">Release back to open</button>' : '') +
      '<form data-form="complete-chore" data-id="' + id + '" style="margin-top:10px">' +
        choreChecklist(c) +
        (c.requirePhoto ? photoProofField('Photo proof (required by manager)') : '') +
        '<div class="field"><label>Note (optional)</label><input type="text" name="note" placeholder="e.g. water was low, refilled" /></div>' +
        '<button type="submit" class="btn primary block">Mark done' + (c.schedule.type === 'daily' ? ' for today' : '') + '</button>' +
      '</form>' +
      (canEdit ? '<div class="row-actions" style="margin-top:10px">' +
        '<button class="btn small" data-action="edit-chore" data-id="' + id + '">Edit</button>' +
        '<button class="btn small ghost danger" data-action="delete-chore" data-id="' + id + '">Delete</button>' +
      '</div>' : '') +
      '<div class="section-title">History</div><div class="card">' + histHtml + '</div>');
  }

  function scheduleFields(schedule) {
    var s = schedule || { type: 'daily' };
    var wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(function (n, i) {
      var checked = s.type === 'weekly' && (s.weekdays || []).indexOf(i) !== -1 ? ' checked' : '';
      return '<label><input type="checkbox" name="weekdays" value="' + i + '"' + checked + ' />' + n + '</label>';
    }).join('');
    function sel(v) { return s.type === v ? ' selected' : ''; }
    return '' +
      '<div class="field"><label>Repeats</label><select name="schedType">' +
        '<option value="daily"' + sel('daily') + '>Every day</option>' +
        '<option value="everyNDays"' + sel('everyNDays') + '>Every N days</option>' +
        '<option value="weekly"' + sel('weekly') + '>Weekly (choose days)</option>' +
        '<option value="monthly"' + sel('monthly') + '>Monthly (choose day)</option>' +
      '</select></div>' +
      '<div class="field" data-show-when="schedType=everyNDays"><label>N (days)</label><input type="number" name="n" min="1" value="' + (s.n || 2) + '" /></div>' +
      '<div class="field" data-show-when="schedType=weekly"><label>Days</label><div class="weekday-row">' + wd + '</div></div>' +
      '<div class="field" data-show-when="schedType=monthly"><label>Day of month</label><input type="number" name="monthDay" min="1" max="28" value="' + (s.day || 1) + '" /></div>';
  }
  function scheduleFromForm(fd) {
    var type = fd.get('schedType');
    var schedule = { type: type };
    if (type === 'everyNDays') schedule.n = Number(fd.get('n')) || 1;
    if (type === 'weekly') schedule.weekdays = fd.getAll('weekdays').map(Number);
    if (type === 'monthly') schedule.day = Number(fd.get('monthDay')) || 1;
    return schedule;
  }

  function formEditChore(id) {
    var c = S.choreById(id); if (!c) return;
    openModal('Edit chore',
      '<form data-form="edit-chore" data-id="' + id + '">' +
        '<div class="field"><label>Name</label><input type="text" name="name" required value="' + esc(c.name) + '" /></div>' +
        scheduleFields(c.schedule) +
        '<div class="field"><label>Next due</label><input type="date" name="nextDue" value="' + esc(c.nextDue) + '" /></div>' +
        '<div class="field"><label>Assign to</label><select name="assignedTo">' + userOptions(c.assignedTo, true) + '</select></div>' +
        '<div class="field"><label>If missed</label><select name="catchUp">' +
          '<option value="skipToNext"' + (c.catchUp === 'skipToNext' ? ' selected' : '') + '>Skip to next occurrence</option>' +
          '<option value="mustCatchUp"' + (c.catchUp === 'mustCatchUp' ? ' selected' : '') + '>Must catch up (stays overdue)</option>' +
        '</select></div>' +
        requirePhotoCheckbox(c.requirePhoto) +
        openCheckbox(c.open) +
        stepsField((c.steps || []).join('\n')) +
        '<div class="form-actions"><button type="button" class="btn" data-action="close-modal">Cancel</button>' +
        '<button type="submit" class="btn primary">Save</button></div>' +
      '</form>');
  }
  function submitEditChore(form) {
    var fd = new FormData(form);
    var schedule = scheduleFromForm(fd);
    if (schedule.type === 'weekly' && !schedule.weekdays.length) { toast('Pick at least one weekday'); return; }
    var res = S.updateChore(form.getAttribute('data-id'), {
      name: fd.get('name'), schedule: schedule, assignedTo: fd.get('assignedTo') || null,
      catchUp: fd.get('catchUp'), nextDue: fd.get('nextDue'), requirePhoto: fd.get('requirePhoto') === 'on',
      open: fd.get('open') === 'on', steps: stepsFromForm(fd)
    });
    if (res.error) { toast(res.error); return; }
    closeModal(); toast('Chore updated'); render();
  }
  function submitCompleteChoreWithNote(form) {
    var id = form.getAttribute('data-id');
    var chore = S.choreById(id);
    var note = (new FormData(form).get('note') || '').trim();
    var fileInput = form.querySelector('input[name="photo"]');
    var file = fileInput && fileInput.files[0];
    if (!checklistComplete(form, chore)) { toast('Tick every checklist step first'); return; }
    if (chore && chore.requirePhoto && !file) { toast('A photo is required for this chore'); return; }
    fileToDataURL(file, 900, function (dataUrl) {
      var res = S.completeChore(id, note, dataUrl);
      if (res.error) { toast(res.error); return; }
      closeModal(); toast('Nice — done'); render();
    });
  }
  // Quick-complete for a photo-required chore (from the card/dashboard Done button).
  function formCompleteChore(id) {
    var c = S.choreById(id); if (!c) return;
    var reqs = [];
    if (c.steps && c.steps.length) reqs.push('a checklist');
    if (c.requirePhoto) reqs.push('📷 photo proof');
    openModal('Complete: ' + c.name,
      (reqs.length ? '<div class="notice">This chore requires ' + reqs.join(' and ') + ' to complete.</div>' : '') +
      '<form data-form="complete-chore" data-id="' + id + '">' +
        choreChecklist(c) +
        (c.requirePhoto ? photoProofField('Photo proof') : '') +
        '<div class="field"><label>Note (optional)</label><input type="text" name="note" /></div>' +
        '<div class="form-actions"><button type="button" class="btn" data-action="close-modal">Cancel</button>' +
        '<button type="submit" class="btn primary">Mark done</button></div>' +
      '</form>');
  }
  // Photo-required task completion.
  function formCompleteTask(taskId) {
    var t = S.taskById(taskId); if (!t) return;
    openModal('Complete: ' + t.title,
      '<div class="notice">📷 A manager set this task to require photo proof.</div>' +
      '<form data-form="complete-task" data-id="' + taskId + '">' +
        photoProofField('Photo proof') +
        '<div class="form-actions"><button type="button" class="btn" data-action="close-modal">Cancel</button>' +
        '<button type="submit" class="btn primary">Mark done</button></div>' +
      '</form>');
  }
  function submitCompleteTask(form) {
    var id = form.getAttribute('data-id');
    var fileInput = form.querySelector('input[name="photo"]');
    var file = fileInput && fileInput.files[0];
    if (!file) { toast('A photo is required for this task'); return; }
    fileToDataURL(file, 900, function (dataUrl) {
      var res = S.toggleTask(id, dataUrl);
      if (res.error) { toast(res.error); return; }
      closeModal(); toast('Task done'); render();
    });
  }

  function viewMaintenance() {
    var assets = S.listAssets();
    var canEdit = S.isManager();
    var html = '' +
      '<div class="view-head"><h1>Upkeep</h1>' +
      (canEdit ? '<button class="btn primary small" data-action="open-add-asset">+ Asset</button>' : '') +
      '</div>' +
      '<div class="notice">Maintenance is grouped by <strong>asset</strong>. Due by calendar interval or by usage (meter readings). Tap an asset name for readings, costs, and editing.</div>';

    if (!assets.length) { html += '<div class="empty">No assets yet.</div>'; return html; }

    html += assets.map(function (a) {
      var reading = S.latestReading(a.id);
      var lastDate = S.lastReadingDate(a.id);
      var stale = a.meterUnit && lastDate && S.diffDays(S.todayISO(), lastDate) > 14;
      var meter = a.meterUnit ? (' · ' + (reading != null ? reading + ' ' + a.meterUnit : 'no readings yet')) : '';
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
                  (m.requirePhoto ? '<span class="badge neutral">📷 proof</span>' : '') +
                '</div>' +
              '</div>' +
              '<button class="btn small primary" data-action="open-log-service" data-id="' + m.id + '">Log</button>' +
            '</div>' +
          '</div>';
      }).join('') : '<p class="subtle" style="margin:8px 0 0">No maintenance items yet.</p>';

      return '' +
        '<div class="card">' +
          '<div class="item tap" data-action="open-asset" data-id="' + a.id + '">' +
            '<div class="item-main">' +
              '<p class="item-title">' + esc(a.name) + ' <span class="subtle" style="font-weight:400">›</span></p>' +
              '<p class="item-sub">' + esc(a.category) + esc(meter) +
                (stale ? ' · <span class="stale">reading is ' + S.diffDays(S.todayISO(), lastDate) + ' days old</span>' : '') + '</p>' +
            '</div>' +
            (canEdit ? '<button class="btn small" data-action="open-add-maintenance" data-id="' + a.id + '">+ Item</button>' : '') +
          '</div>' +
          itemsHtml +
        '</div>';
    }).join('');
    return html;
  }

  function formAssetDetail(assetId) {
    var a = S.assetById(assetId); if (!a) return;
    var canEdit = S.isManager();
    var readings = S.readingsFor(assetId);
    var cost = S.assetCostTotal(assetId);
    var readingsHtml = readings.length ? readings.slice(0, 10).map(function (r) {
      return '<div class="hist-row"><span>' + r.reading + ' ' + esc(a.meterUnit) + ' · ' + esc(S.userName(r.userId)) + '</span><span class="subtle">' + esc(S.fmtDate(r.date)) + '</span></div>';
    }).join('') : '<p class="subtle">No readings yet.</p>';

    var body = '<p class="subtle">' + esc(a.category) + ' · total maintenance spend <strong>$' + cost.toFixed(2) + '</strong></p>' +
      '<div class="row-actions" style="margin-bottom:6px"><button class="btn small" data-action="asset-qr" data-id="' + assetId + '">🔳 QR code</button></div>';

    if (a.meterUnit) {
      body += '<form data-form="add-reading" data-id="' + assetId + '" style="margin-top:10px">' +
        '<div class="field"><label>New meter reading (' + esc(a.meterUnit) + ')</label>' +
        '<div style="display:flex;gap:8px"><input type="number" name="reading" step="any" min="0" required placeholder="' + (S.latestReading(assetId) != null ? 'latest: ' + S.latestReading(assetId) : 'e.g. 520') + '" style="flex:1" />' +
        '<button type="submit" class="btn primary">Log</button></div></div>' +
        '</form>' +
        '<div class="section-title">Reading history</div><div class="card">' + readingsHtml + '</div>';
    }

    if (canEdit) {
      body += '<div class="section-title">Edit asset</div>' +
        '<form data-form="edit-asset" data-id="' + assetId + '">' +
          '<div class="field"><label>Name</label><input type="text" name="name" required value="' + esc(a.name) + '" /></div>' +
          '<div class="field"><label>Category</label><input type="text" name="category" value="' + esc(a.category) + '" /></div>' +
          '<div class="field"><label>Notes</label><textarea name="notes">' + esc(a.notes || '') + '</textarea></div>' +
          '<div class="form-actions">' +
            '<button type="button" class="btn danger" data-action="delete-asset" data-id="' + assetId + '">Delete asset</button>' +
            '<button type="submit" class="btn primary">Save</button>' +
          '</div>' +
        '</form>';
    } else if (a.notes) {
      body += '<div class="section-title">Notes</div><div class="card"><p class="subtle">' + esc(a.notes) + '</p></div>';
    }

    body += assetDocsSection(assetId);

    openModal(a.name, body);
  }
  function submitEditAsset(form) {
    var fd = new FormData(form);
    var res = S.updateAsset(form.getAttribute('data-id'), { name: fd.get('name'), category: fd.get('category'), notes: fd.get('notes') });
    if (res.error) { toast(res.error); return; }
    closeModal(); toast('Asset updated'); render();
  }
  function submitAddReading(form) {
    var fd = new FormData(form);
    var assetId = form.getAttribute('data-id');
    var res = S.addReading(assetId, fd.get('reading'));
    if (res.error) { toast(res.error); return; }
    toast('Reading logged');
    formAssetDetail(assetId); // refresh the open modal
    render();
  }

  function formEditMaintenance(itemId) {
    var item = S.maintenanceById(itemId); if (!item) return;
    var asset = S.assetById(item.assetId);
    var isUsage = item.intervalType === 'usage';
    openModal('Edit maintenance',
      '<form data-form="edit-maintenance" data-id="' + itemId + '">' +
        '<div class="field"><label>What needs doing</label><input type="text" name="name" required value="' + esc(item.name) + '" /></div>' +
        (isUsage
          ? '<div class="field"><label>Every (' + esc(asset ? asset.meterUnit : 'units') + ')</label><input type="number" name="intervalValue" min="1" value="' + item.intervalValue + '" /></div>'
          : '<div class="field"><label>Every</label><div style="display:flex;gap:8px">' +
            '<input type="number" name="intervalValue" min="1" value="' + item.intervalValue + '" style="flex:1" />' +
            '<select name="intervalUnit" style="flex:1">' +
              '<option value="months"' + (item.intervalUnit !== 'days' ? ' selected' : '') + '>months</option>' +
              '<option value="days"' + (item.intervalUnit === 'days' ? ' selected' : '') + '>days</option>' +
            '</select></div></div>') +
        requirePhotoCheckbox(item.requirePhoto) +
        '<p class="subtle">The next due point is recalculated from the last completed service.</p>' +
        '<div class="form-actions">' +
          '<button type="button" class="btn danger" data-action="delete-maintenance" data-id="' + itemId + '">Delete</button>' +
          '<button type="submit" class="btn primary">Save</button>' +
        '</div>' +
      '</form>');
  }
  function submitEditMaintenance(form) {
    var fd = new FormData(form);
    var res = S.updateMaintenance(form.getAttribute('data-id'), { name: fd.get('name'), intervalValue: fd.get('intervalValue'), intervalUnit: fd.get('intervalUnit'), requirePhoto: fd.get('requirePhoto') === 'on' });
    if (res.error) { toast(res.error); return; }
    closeModal(); toast('Maintenance updated'); render();
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
    var canEdit = S.canCreateProject();
    var tasks = S.projectTasks(id);
    var done = tasks.filter(function (t) { return t.done; }).length;
    var pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;

    var statusOpts = Object.keys(S.STATUS_LABELS).map(function (k) {
      return '<option value="' + k + '"' + (k === p.status ? ' selected' : '') + '>' + esc(S.STATUS_LABELS[k]) + '</option>';
    }).join('');
    var statusControl = canEdit
      ? '<div class="field" style="margin-top:10px"><label>Status</label><select data-action="set-project-status" data-id="' + p.id + '">' + statusOpts + '</select></div>'
      : '<p class="subtle" style="margin-top:10px">Status: <strong>' + esc(S.STATUS_LABELS[p.status] || p.status) + '</strong></p>';

    var html = '' +
      '<div class="view-head">' +
        '<button class="btn small ghost" data-action="back-to-projects">‹ Projects</button>' +
        (canEdit ? '<div class="row-actions">' +
          '<button class="btn small ghost" data-action="edit-project" data-id="' + p.id + '">Edit</button>' +
          '<button class="btn small ghost danger" data-action="delete-project" data-id="' + p.id + '">Delete</button></div>' : '') +
      '</div>' +
      '<div class="card">' +
        '<h1 style="font-size:20px">' + esc(p.name) + '</h1>' +
        (p.description ? '<p class="subtle">' + esc(p.description) + '</p>' : '') +
        statusControl +
        '<div class="progress"><span style="width:' + pct + '%"></span></div>' +
        '<p class="subtle">' + done + ' / ' + tasks.length + ' tasks done' +
          (p.targetDate ? ' · target ' + esc(S.fmtDate(p.targetDate)) : '') + '</p>' +
      '</div>' +

      '<div class="section-title">Tasks<span class="count-pill">' + tasks.length + '</span></div>';

    if (tasks.length) {
      html += tasks.map(function (t) {
        return '' +
          '<div class="card">' +
            sentBackBanner(t.sentBack) +
            '<div class="check-row ' + (t.done ? 'done' : '') + '">' +
              '<input type="checkbox" ' + (t.done ? 'checked' : '') + ' data-action="toggle-task" data-id="' + t.id + '" />' +
              '<div class="item-main">' +
                '<p class="item-title c-title">' + esc(t.title) + '</p>' +
                (t.description ? '<p class="item-sub">' + esc(t.description) + '</p>' : '') +
                '<div class="chips">' +
                  '<span class="chip">' + esc(S.userName(t.assignedTo)) + '</span>' +
                  (t.open && !t.assignedTo && !t.done ? '<span class="chip">🙌 open</span>' : '') +
                  (t.dueDate ? '<span class="chip">due ' + esc(S.fmtDate(t.dueDate)) + '</span>' : '') +
                  (t.requirePhoto && !t.done ? '<span class="chip">📷 proof required</span>' : '') +
                  (t.done ? '<span class="chip">done ' + esc(S.fmtDate(t.doneAt)) + ' by ' + esc(S.userName(t.doneBy)) + '</span>' : '') +
                  (t.done && t.donePhoto ? proofBtn('task', t.id) : '') +
                '</div>' +
                (t.done ? '' : timerButton('task', t.id)) +
              '</div>' +
              (t.open && !t.assignedTo && !t.done ? '<button class="btn small primary" data-action="claim-item" data-kind="task" data-id="' + t.id + '">Claim</button>' : '') +
              (canEdit && t.done ? '<button class="icon-btn" data-action="send-back-task" data-id="' + t.id + '" aria-label="Send back" title="Send back">↩</button>' : '') +
              (canEdit ? '<button class="icon-btn" data-action="edit-task" data-id="' + t.id + '" aria-label="Edit task">✎</button>' : '') +
            '</div>' +
          '</div>';
      }).join('');
    } else {
      html += '<div class="empty">No tasks yet' + (canEdit ? '. Add one, or let AI suggest a plan.' : '.') + '</div>';
    }

    if (canEdit) {
      html += '<div class="stack" style="margin-top:14px">' +
        '<button class="btn primary block" data-action="open-add-task" data-id="' + p.id + '">+ Add task</button>' +
        '<button class="btn block" data-action="suggest-steps" data-id="' + p.id + '">✨ Suggest steps (AI)</button>' +
        '</div>' +
        '<p class="subtle" style="margin-top:8px">“Suggest steps” uses an offline placeholder in this prototype. The real Claude API breakdown arrives with the server phase.</p>';
    }

    // Progress log — notes + photos. Everyone (workers included) can comment.
    var notes = S.notesFor('project', p.id);
    html += '<div class="section-title">Progress log<span class="count-pill">' + notes.length + '</span></div>' +
      '<button class="btn block" data-action="open-add-note" data-id="' + p.id + '" style="margin-bottom:10px">+ Add note / photo</button>';
    if (notes.length) {
      html += notes.map(function (n) {
        var canDelete = n.userId === S.currentUser().id || canEdit;
        return '<div class="card"><div class="item"><div class="item-main">' +
          '<p class="item-sub"><strong>' + esc(S.userName(n.userId)) + '</strong> · ' + esc(S.fmtDate(n.date)) + '</p>' +
          (n.body ? '<p style="margin:6px 0 0">' + esc(n.body) + '</p>' : '') +
          (n.photo ? '<img class="note-photo" src="' + n.photo + '" alt="progress photo" data-action="view-photo" data-id="' + n.id + '" />' : '') +
          '</div>' +
          (canDelete ? '<button class="icon-btn" data-action="delete-note" data-id="' + n.id + '" aria-label="Delete note">🗑</button>' : '') +
          '</div></div>';
      }).join('');
    } else {
      html += '<div class="empty">No progress notes yet.</div>';
    }
    return html;
  }

  /* ---------------- More: hub of tiles + subsections ---------------- */
  function viewMore() {
    if (ui.moreSection) return moreSubsection(ui.moreSection);
    return moreHub();
  }

  // A single launcher tile. `badge` (optional) shows a small count/status pill.
  function moreTile(section, icon, label, sub, badge, cls) {
    return '<button class="more-tile ' + (cls || '') + '" data-action="more-open" data-section="' + section + '">' +
      (badge ? '<span class="more-tile-badge">' + badge + '</span>' : '') +
      '<span class="more-tile-ico">' + icon + '</span>' +
      '<span class="more-tile-lbl">' + esc(label) + '</span>' +
      (sub ? '<span class="more-tile-sub">' + esc(sub) + '</span>' : '') +
      '</button>';
  }

  function moreHub() {
    var me = S.currentUser();
    var isAdmin = S.canManageUsers(me);
    var isMgr = S.isManager(me);
    var mk = S.currentMonthKey();

    // Contextual counts for tile badges.
    var low = S.lowStockItems().length;
    var rs = S.rentSummary(mk);
    var myUnpaid = S.rentChargesForMonth(mk).filter(function (c) { return c.userId === me.id && c.status !== 'verified'; }).length;
    var rentBadge = isMgr ? (rs.unpaid ? String(rs.unpaid) : '') : (myUnpaid ? String(myUnpaid) : '');
    var myPts = S.userPoints ? S.userPoints(me.id, S.currentMonthKey()) : null;

    var html = '<div class="view-head"><div><h1>More</h1>' +
      '<p class="subtle">Everything beyond today’s work</p></div></div>';

    // Who am I — quick identity card.
    html += '<div class="card who-card"><div class="who-avatar">' + esc((me.name || '?').charAt(0)) + '</div>' +
      '<div class="who-main"><p class="who-name">' + esc(me.name) + '</p>' +
      '<p class="who-role">' + esc(me.role) + '</p></div>' +
      '<button class="btn small ghost" data-action="more-open" data-section="people">Switch</button></div>';

    // Primary work tiles.
    html += '<div class="section-title">Farm</div><div class="tile-grid">';
    html += moreTile('supplies', '📦', 'Supplies', 'Feed, fuel & parts', low ? String(low) : '', low ? 'warn' : '');
    html += moreTile('board', '🏆', 'Leaderboard', myPts != null ? myPts + ' pts this month' : 'Points & streaks', '');
    html += moreTile('rent', '💵', 'Rent', isMgr ? 'Collect & verify' : 'Your charges', rentBadge, rentBadge ? 'warn' : '');
    if (isMgr) html += moreTile('team', '👥', 'Team', 'Farm-wide status', '');
    html += '</div>';

    // People & settings tiles.
    html += '<div class="section-title">People &amp; settings</div><div class="tile-grid">';
    html += moreTile('people', '🧑‍🌾', 'People', isAdmin ? 'Manage the crew' : 'The crew', '');
    html += moreTile('activity', '🕙', 'Activity', 'Recent history', '');
    html += moreTile('notifications', '🔔', 'Notifications', 'Digests & push', '');
    html += moreTile('weather', '🌤️', 'Weather', 'Forecast location', '');
    html += moreTile('data', '💾', 'Data', 'Backup & reset', '');
    html += '</div>';

    return html;
  }

  var MORE_TITLES = {
    supplies: 'Supplies', board: 'Leaderboard', rent: 'Rent', team: 'Team',
    people: 'People', activity: 'Activity', notifications: 'Notifications', data: 'Data & backup'
  };
  function moreSubHead(section) {
    return '<div class="sub-head"><button class="btn small ghost back-btn" data-action="more-back">‹ More</button>' +
      '<h1>' + esc(MORE_TITLES[section] || 'More') + '</h1></div>';
  }
  function moreSubsection(section) {
    if (section === 'supplies') return moreSubHead(section) + inventoryBody();
    if (section === 'board') return moreSubHead(section) + leaderboardBody();
    if (section === 'team') return moreSubHead(section) + teamDashboard();
    if (section === 'rent') return moreSubHead(section) + rentBody();
    if (section === 'people') return moreSubHead(section) + peopleBody();
    if (section === 'activity') return moreSubHead(section) + activityBody();
    if (section === 'notifications') return moreSubHead(section) + notificationsBody();
    if (section === 'data') return moreSubHead(section) + dataBody();
    // Fallback
    ui.moreSection = null; return moreHub();
  }

  function rentBody() {
    var me = S.currentUser();
    var mk = S.currentMonthKey();
    var isMgr = S.isManager(me);
    var charges = S.rentChargesForMonth(mk).filter(function (c) { return isMgr || c.userId === me.id; });
    var rs = S.rentSummary(mk);
    var html = '<p class="subtle" style="margin:-4px 0 10px">' + esc(S.monthLabel(mk)) + '</p>';
    if (isMgr) {
      html += '<button class="btn block primary" data-action="open-rent-assign" style="margin-bottom:10px">+ Assign / edit rent</button>';
      if (rs.count) {
        html += '<div class="stat-row">' +
          statTile('$' + rs.collected.toFixed(0), 'collected') +
          statTile('$' + rs.due.toFixed(0), 'due') +
          statTile(String(rs.unpaid), 'unpaid', rs.unpaid ? 'warn' : '') +
          statTile(String(rs.marked), 'to verify', rs.marked ? 'today' : '') + '</div>';
      }
    }
    if (!charges.length) {
      html += '<div class="empty">' + (isMgr ? 'No rent assigned yet.' : 'No rent is assigned to you.') + '</div>';
    } else {
      html += charges.map(function (c) {
        var badge = c.status === 'verified'
          ? '<span class="badge upcoming">Verified ' + esc(S.fmtDate(c.verifiedAt)) + '</span>'
          : c.status === 'marked'
            ? '<span class="badge today">Marked paid ' + esc(S.fmtDate(c.markedAt)) + ' — awaiting verification</span>'
            : '<span class="badge overdue">Unpaid · due ' + esc(S.fmtDate(c.dueDate)) + '</span>';
        return '<div class="card tap" data-action="open-rent-charge" data-id="' + c.id + '">' +
          '<div class="item"><div class="item-main">' +
            '<p class="item-title">' + esc(S.userName(c.userId)) + ' · $' + c.amount + '</p>' +
            '<div class="item-badges">' + badge + '</div>' +
            (c.note ? '<p class="item-sub" style="margin-top:6px">“' + esc(c.note) + '”</p>' : '') +
          '</div></div></div>';
      }).join('');
    }
    return html;
  }

  function peopleBody() {
    var me = S.currentUser();
    var isAdmin = S.canManageUsers(me);
    var html = '';
    if (isAdmin) html += '<button class="btn block primary" data-action="open-add-user" style="margin-bottom:10px">+ Add person</button>';
    html += S.users().map(function (u) {
      var isMe = u.id === me.id;
      var roleCtrl = (isAdmin && !isMe)
        ? '<select data-action="set-user-role" data-id="' + u.id + '">' + roleOpts(u.role) + '</select>'
        : '<p class="item-sub">' + esc(u.role) + (isMe ? ' · you' : '') + '</p>';
      var actions = (isMe ? '<span class="badge upcoming">You</span>' :
        '<button class="btn small" data-action="switch-to-user" data-id="' + u.id + '">Act as</button>') +
        (isAdmin && !isMe ? '<button class="btn small ghost danger" data-action="remove-user" data-id="' + u.id + '">Remove</button>' : '');
      return '<div class="card"><div class="item">' +
        '<div class="who-avatar sm">' + esc((u.name || '?').charAt(0)) + '</div>' +
        '<div class="item-main">' +
        '<p class="item-title">' + esc(u.name) + '</p>' + roleCtrl +
        '</div><div class="row-actions">' + actions + '</div></div></div>';
    }).join('');
    if (!isAdmin) html += '<p class="subtle">Only admins can add or change people — switch to Dale (admin) to try it.</p>';
    return html;
  }

  function activityBody() {
    var acts = S.listActivity();
    if (!acts.length) return '<div class="empty">Nothing yet.</div>';
    return '<div class="card">' + acts.map(function (a) {
      var when = new Date(a.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      return '<div class="hist-row"><span>' + esc(S.userName(a.userId)) + ' ' + esc(a.text) + '</span><span class="subtle">' + when + '</span></div>';
    }).join('') + '</div>';
  }

  function notificationsBody() {
    var me = S.currentUser();
    var prefs = S.getPrefs(me.id);
    return '<div class="notice">Preview — email &amp; push activate with the server phase. Choices are saved per person.</div>' +
      '<form data-form="save-prefs">' +
        '<div class="field"><label>Email digest</label><select name="email">' +
          optTag('off', 'Off', prefs.email) + optTag('daily', 'Daily', prefs.email) + optTag('weekly', 'Weekly', prefs.email) +
        '</select></div>' +
        '<div class="field"><label>Digest time</label><select name="digestHour">' + hourOptions(prefs.digestHour) + '</select></div>' +
        '<label class="inline-check"><input type="checkbox" name="push" ' + (prefs.push ? 'checked' : '') + ' /> Push notifications</label>' +
        '<button class="btn primary block" type="submit" style="margin-top:12px">Save preferences</button>' +
      '</form>';
  }

  function dataBody() {
    return '<div class="stack">' +
        '<button class="btn block" data-action="export-data">⬇︎ Export backup (JSON)</button>' +
        '<label class="btn block" style="text-align:center;cursor:pointer">⬆︎ Import backup' +
          '<input type="file" accept="application/json,.json" data-action="import-file" hidden /></label>' +
        '<button class="btn block danger" data-action="reset-data">Reset demo data</button>' +
      '</div>' +
      '<div class="notice" style="margin-top:10px">Data lives in this browser only. Export to back it up or move it to another device.</div>';
  }

  // Small labeled stat tile used in headers/summaries.
  function statTile(value, label, cls) {
    return '<div class="stat-tile ' + (cls || '') + '"><span class="stat-val">' + value + '</span>' +
      '<span class="stat-lbl">' + esc(label) + '</span></div>';
  }

  function leaderboardBody() {
    var win = ui.lbWindow || 'month';
    var rows = S.leaderboard(win);
    var meId = S.currentUser().id;
    var top = rows[0];
    var anyPoints = rows.some(function (r) { return r.points > 0; });
    var html = '' +
      '<p class="subtle" style="margin:-4px 0 10px">Celebrating great work · ' +
        (win === 'month' ? esc(S.monthLabel(S.currentMonthKey())) : 'all time') + '</p>' +
      '<div class="segmented" style="margin-bottom:12px">' +
        '<button class="' + (win === 'month' ? 'active' : '') + '" data-action="set-lb" data-win="month">Month</button>' +
        '<button class="' + (win === 'all' ? 'active' : '') + '" data-action="set-lb" data-win="all">All time</button>' +
      '</div>';

    if (!anyPoints) {
      return html + '<div class="empty">No completed work yet' + (win === 'month' ? ' this month' : '') + '. Get out there! 🌱</div>';
    }

    if (top && top.points > 0) {
      html += '<div class="champ">' +
        '<div class="champ-emoji">🥇</div>' +
        '<div><div class="champ-name">' + esc(top.name) + (top.userId === meId ? ' (you)' : '') + '</div>' +
        '<div class="champ-sub">' + top.points + ' pts · ' + top.total + ' job' + (top.total === 1 ? '' : 's') + ' done' +
          (top.streak >= 2 ? ' · 🔥 ' + top.streak + '-day streak' : '') + '</div></div>' +
      '</div>';
    }

    html += rows.map(function (r) {
      var isMe = r.userId === meId;
      var parts = [];
      if (r.chores) parts.push(r.chores + ' chore' + (r.chores === 1 ? '' : 's'));
      if (r.tasks) parts.push(r.tasks + ' task' + (r.tasks === 1 ? '' : 's'));
      if (r.services) parts.push(r.services + ' service' + (r.services === 1 ? '' : 's'));
      var breakdown = parts.length ? parts.join(' · ') : 'no completions yet';
      return '<div class="card lb-row' + (r.rank === 1 ? ' lb-first' : '') + (isMe ? ' lb-me' : '') + '">' +
        '<div class="lb-rank">' + medal(r.rank) + '</div>' +
        '<div class="item-main">' +
          '<p class="item-title">' + esc(r.name) + (isMe ? ' <span class="chip">you</span>' : '') + '</p>' +
          '<p class="item-sub">' + esc(breakdown) + '</p>' +
          (r.streak >= 2 || r.verified ? '<div class="item-badges">' +
            (r.streak >= 2 ? '<span class="badge upcoming">🔥 ' + r.streak + '-day streak</span>' : '') +
            (r.verified ? '<span class="badge neutral">📷 ' + r.verified + ' verified</span>' : '') +
          '</div>' : '') +
        '</div>' +
        '<div class="lb-pts">' + r.points + '<span>pts</span></div>' +
      '</div>';
    }).join('');

    html += '<p class="subtle" style="margin-top:10px">Points: chore +2 · project task +5 · maintenance +4, plus a bonus for photo-verified work. 📷</p>';
    return html;
  }

  /* ---------------- time tracking ---------------- */
  function timerButton(kind, refId) {
    var active = S.activeTimerFor(kind, refId);
    var total = S.totalSeconds(kind, refId);
    if (active) {
      return '<div class="timer-line"><button class="btn small danger" data-action="stop-timer" data-kind="' + kind + '" data-id="' + refId + '">⏹ Stop</button>' +
        '<span class="timer-live" data-elapsed-start="' + active.start + '">' + esc(S.fmtDur((Date.now() - active.start) / 1000)) + '</span>' +
        (total ? '<span class="subtle">' + esc(S.fmtDur(total)) + ' logged</span>' : '') + '</div>';
    }
    return '<div class="timer-line"><button class="btn small" data-action="start-timer" data-kind="' + kind + '" data-id="' + refId + '">▶ Start timer</button>' +
      (total ? '<span class="subtle">' + esc(S.fmtDur(total)) + ' logged</span>' : '') + '</div>';
  }
  function activeTimersStrip() {
    var timers = S.activeTimersForUser();
    if (!timers.length) return '';
    return '<div class="timers-strip">' + timers.map(function (e) {
      return '<div class="timer-chip"><span>⏱ ' + esc(S.timerLabel(e.kind, e.refId)) + '</span>' +
        '<span class="timer-live" data-elapsed-start="' + e.start + '">' + esc(S.fmtDur((Date.now() - e.start) / 1000)) + '</span>' +
        '<button class="btn small danger" data-action="stop-timer" data-kind="' + e.kind + '" data-id="' + e.refId + '">Stop</button></div>';
    }).join('') + '</div>';
  }
  function tickTimers() {
    document.querySelectorAll('[data-elapsed-start]').forEach(function (el) {
      var start = Number(el.getAttribute('data-elapsed-start'));
      el.textContent = S.fmtDur((Date.now() - start) / 1000);
    });
  }

  /* ---------------- send back ---------------- */
  function sentBackBanner(sb) {
    if (!sb) return '';
    return '<div class="sb-banner">↩ Sent back' + (sb.by ? ' by ' + esc(S.userName(sb.by)) : '') +
      (sb.reason ? ': “' + esc(sb.reason) + '”' : '') + ' — please redo.</div>';
  }
  function sendBack(kind, id) {
    var reason = prompt('Send this work back to be redone. Reason (optional):', '');
    if (reason === null) return; // cancelled
    var res = kind === 'task' ? S.sendBackTask(id, reason)
      : kind === 'chore' ? S.sendBackChore(id, reason)
        : S.sendBackService(id, reason);
    if (res.error) { toast(res.error); return; }
    closeModal(); toast('Sent back'); render();
  }

  /* ---------------- checklist steps ---------------- */
  function choreChecklist(chore) {
    if (!chore.steps || !chore.steps.length) return '';
    return '<div class="field"><label>Checklist — tick each step</label>' +
      chore.steps.map(function (s, i) {
        return '<label class="inline-check" style="margin-bottom:6px"><input type="checkbox" name="step" value="' + i + '" /> ' + esc(s) + '</label>';
      }).join('') + '</div>';
  }
  function checklistComplete(form, chore) {
    if (!chore || !chore.steps || !chore.steps.length) return true;
    var checked = form.querySelectorAll('input[name="step"]:checked').length;
    return checked >= chore.steps.length;
  }

  /* ---------------- weather ---------------- */
  function weatherEmoji(code) {
    if (code === 0) return '☀️';
    if (code <= 2) return '🌤️';
    if (code === 3) return '☁️';
    if (code >= 45 && code <= 48) return '🌫️';
    if (code >= 51 && code <= 67) return '🌧️';
    if (code >= 71 && code <= 77) return '❄️';
    if (code >= 80 && code <= 82) return '🌦️';
    if (code >= 85 && code <= 86) return '🌨️';
    if (code >= 95) return '⛈️';
    return '🌡️';
  }
  // Fosberg Fire Weather Index (FFWI) from temperature (°F), relative
  // humidity (%), and wind (mph) — a standard keyless estimate of fire danger.
  // Returns null when inputs are missing (older/partial forecasts).
  var FIRE_RANK = { low: 0, mod: 1, high: 2, vhigh: 3, extreme: 4 };
  function fireDanger(t, h, u) {
    if (t == null || h == null || u == null) return null;
    var m;
    if (h <= 10) m = 0.03229 + 0.281073 * h - 0.000578 * h * t;
    else if (h <= 50) m = 2.22749 + 0.160107 * h - 0.014784 * t;
    else m = 21.0606 + 0.005565 * h * h - 0.00035 * h * t - 0.483199 * h;
    var mr = m / 30;
    var eta = 1 - 2 * mr + 1.5 * mr * mr - 0.5 * mr * mr * mr;
    var idx = Math.round(eta * Math.sqrt(1 + u * u) / 0.3002);
    idx = Math.max(0, Math.min(100, idx));
    var lv = idx < 15 ? { key: 'low', label: 'Low' }
      : idx < 30 ? { key: 'mod', label: 'Moderate' }
        : idx < 45 ? { key: 'high', label: 'High' }
          : idx < 60 ? { key: 'vhigh', label: 'Very High' }
            : { key: 'extreme', label: 'Extreme' };
    return { index: idx, key: lv.key, label: lv.label, rank: FIRE_RANK[lv.key] };
  }
  function weatherCard() {
    var w = S.getWeather();
    if (!w.lat || !w.forecast) {
      return '<div class="card"><div class="item"><div class="item-main">' +
        '<p class="item-title">🌤️ Weather</p>' +
        '<p class="item-sub">Add your farm location for a 7-day forecast.</p></div>' +
        '<button class="btn small primary" data-action="weather-setup">Set location</button></div></div>';
    }
    var fires = [];
    var days = w.forecast.slice(0, 7).map(function (d) {
      var fire = fireDanger(d.hi, d.rh, d.wind);
      fires.push(fire);
      return '<div class="wx-day"><div class="wx-dow">' + esc(d.dow) + '</div>' +
        '<div class="wx-emoji">' + weatherEmoji(d.code) + '</div>' +
        '<div class="wx-hi">' + Math.round(d.hi) + '°</div>' +
        '<div class="wx-lo">' + Math.round(d.lo) + '°</div>' +
        (d.precip != null ? '<div class="wx-precip">💧' + Math.round(d.precip) + '%</div>' : '') +
        (fire ? '<div class="wx-fire fire-' + fire.key + '" title="Fire danger: ' + fire.label + '"></div>' : '') +
        '</div>';
    }).join('');

    // Fire-danger banner: today's level, plus a heads-up if the week peaks higher.
    var fireBanner = '';
    var today = fires[0];
    if (today) {
      var peak = today, peakIdx = 0;
      fires.forEach(function (f, i) { if (f && f.rank > peak.rank) { peak = f; peakIdx = i; } });
      var peakNote = (peak.rank > today.rank && w.forecast[peakIdx])
        ? ' · <strong>' + peak.label + '</strong> by ' + esc(w.forecast[peakIdx].dow) : '';
      fireBanner = '<div class="wx-fire-banner fire-' + today.key + '">' +
        '<span>🔥 Fire danger: <strong>' + today.label + '</strong>' + peakNote + '</span>' +
        '<span class="wx-fire-est" title="Estimated from temperature, humidity &amp; wind (Fosberg index). Not an official warning.">est.</span></div>';
    }

    var ago = w.fetchedAt ? Math.round((Date.now() - w.fetchedAt) / 3600000) : null;
    return '<div class="card wx-card">' +
      '<div class="wx-head"><span>🌤️ ' + esc(w.label || '7-day forecast') + '</span>' +
      '<button class="btn small ghost" data-action="weather-refresh" aria-label="Refresh">↻</button></div>' +
      '<div class="wx-row">' + days + '</div>' +
      fireBanner +
      '<p class="subtle" style="margin-top:6px">' + (ago != null ? 'Updated ' + (ago === 0 ? 'just now' : ago + 'h ago') : '') +
      ' · <span class="chip-link" data-action="weather-setup">change location</span></p></div>';
  }
  function refreshWeather() {
    var w = S.getWeather();
    if (!w.lat) { formWeatherSetup(); return; }
    toast('Fetching forecast…');
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + w.lat + '&longitude=' + w.lon +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
      '&hourly=relative_humidity_2m,wind_speed_10m' +
      '&timezone=auto&forecast_days=7&temperature_unit=fahrenheit&wind_speed_unit=mph';
    fetch(url).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.daily) throw new Error('bad');
      // Aggregate hourly humidity/wind into each day's fire-relevant extremes:
      // the day's lowest humidity and highest wind drive the fire index.
      var hr = j.hourly || {};
      function dayExtremes(dateStr) {
        var minRH = null, maxW = null;
        if (hr.time) {
          for (var k = 0; k < hr.time.length; k++) {
            if (hr.time[k].indexOf(dateStr) !== 0) continue;
            var rh = hr.relative_humidity_2m ? hr.relative_humidity_2m[k] : null;
            var wd = hr.wind_speed_10m ? hr.wind_speed_10m[k] : null;
            if (rh != null && (minRH === null || rh < minRH)) minRH = rh;
            if (wd != null && (maxW === null || wd > maxW)) maxW = wd;
          }
        }
        return { rh: minRH, wind: maxW };
      }
      var dd = j.daily, out = [];
      for (var i = 0; i < dd.time.length; i++) {
        var ext = dayExtremes(dd.time[i]);
        out.push({
          dow: new Date(dd.time[i] + 'T00:00').toLocaleDateString(undefined, { weekday: 'short' }),
          code: dd.weather_code[i], hi: dd.temperature_2m_max[i], lo: dd.temperature_2m_min[i],
          precip: dd.precipitation_probability_max ? dd.precipitation_probability_max[i] : null,
          rh: ext.rh, wind: ext.wind
        });
      }
      S.setForecast(out); toast('Forecast updated'); render();
    }).catch(function () { toast('Could not fetch weather (offline?)'); });
  }
  function formWeatherSetup() {
    var w = S.getWeather();
    openModal('Farm location',
      '<div class="notice">Used only to fetch your local forecast from open-meteo.com (no API key, no account). Nothing is stored on a server.</div>' +
      '<button class="btn block primary" data-action="weather-geo" style="margin-bottom:10px">📍 Use my current location</button>' +
      '<form data-form="weather-loc">' +
        '<div class="field"><label>Label (optional)</label><input type="text" name="label" value="' + esc(w.label || '') + '" placeholder="Home farm" /></div>' +
        '<div class="field"><label>Latitude</label><input type="number" name="lat" step="any" value="' + (w.lat != null ? w.lat : '') + '" placeholder="e.g. 44.56" /></div>' +
        '<div class="field"><label>Longitude</label><input type="number" name="lon" step="any" value="' + (w.lon != null ? w.lon : '') + '" placeholder="e.g. -123.26" /></div>' +
        '<div class="form-actions"><button type="button" class="btn" data-action="close-modal">Cancel</button><button type="submit" class="btn primary">Save &amp; fetch</button></div>' +
      '</form>');
  }
  function submitWeatherLoc(form) {
    var fd = new FormData(form);
    if (fd.get('lat') === '' || fd.get('lon') === '') { toast('Enter latitude and longitude'); return; }
    S.setWeatherLocation(fd.get('lat'), fd.get('lon'), fd.get('label'));
    closeModal(); refreshWeather();
  }
  function weatherGeo() {
    if (!navigator.geolocation) { toast('Geolocation not available'); return; }
    toast('Getting location…');
    navigator.geolocation.getCurrentPosition(function (pos) {
      S.setWeatherLocation(pos.coords.latitude, pos.coords.longitude, S.getWeather().label || 'My location');
      closeModal(); refreshWeather();
    }, function () { toast('Location permission denied'); });
  }

  /* ---------------- calendar ---------------- */
  function calendarView() {
    var mk = ui.calMonth || S.currentMonthKey();
    var parts = mk.split('-').map(Number);
    var first = new Date(parts[0], parts[1] - 1, 1);
    var startDow = first.getDay();
    var daysInMonth = new Date(parts[0], parts[1], 0).getDate();
    var fromISO = mk + '-01', toISO = mk + '-' + String(daysInMonth).padStart(2, '0');
    var byDate = {};
    S.calendarItems(fromISO, toISO).forEach(function (it) { (byDate[it.date] = byDate[it.date] || []).push(it); });
    var today = S.todayISO();
    var monthLbl = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    var html = '<div class="cal-nav"><button class="btn small ghost" data-action="cal-prev">‹</button>' +
      '<strong>' + esc(monthLbl) + '</strong>' +
      '<button class="btn small ghost" data-action="cal-next">›</button></div>';
    html += '<div class="cal-grid">';
    ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach(function (d) { html += '<div class="cal-dow">' + d + '</div>'; });
    for (var i = 0; i < startDow; i++) html += '<div class="cal-cell empty"></div>';
    for (var day = 1; day <= daysInMonth; day++) {
      var dISO = mk + '-' + String(day).padStart(2, '0');
      var items = byDate[dISO] || [];
      var kinds = {}; items.forEach(function (it) { kinds[it.kind] = true; });
      var dots = Object.keys(kinds).map(function (k) { return '<span class="cal-dot ' + k + '"></span>'; }).join('');
      html += '<div class="cal-cell' + (dISO === today ? ' today' : '') + (items.length ? ' has' : '') +
        (ui.calDay === dISO ? ' sel' : '') + '" data-action="cal-day" data-date="' + dISO + '">' +
        '<span class="cal-num">' + day + '</span><div class="cal-dots">' + dots + '</div></div>';
    }
    html += '</div>';

    var selDate = ui.calDay || (byDate[today] ? today : null);
    if (selDate) {
      var list = byDate[selDate] || [];
      html += '<div class="section-title">' + esc(S.fmtDate(selDate)) + '<span class="count-pill">' + list.length + '</span></div>';
      if (list.length) {
        html += list.map(function (it) {
          return '<div class="card tap" data-action="cal-open" data-kind="' + it.kind + '" data-id="' + it.id + '">' +
            '<div class="item"><div class="item-main"><p class="item-title">' + esc(it.title) + '</p>' +
            '<p class="item-sub">' + esc(kindLabel(it.kind)) + '</p></div></div></div>';
        }).join('');
      } else html += '<div class="empty">Nothing due.</div>';
    }
    return html;
  }

  /* ---------------- inventory ---------------- */
  function invCard(i) {
    var low = i.qty <= i.reorderAt;
    return '<div class="card tap" data-action="open-inventory" data-id="' + i.id + '"><div class="item">' +
      '<div class="left-rail ' + (low ? 'overdue' : 'upcoming') + '"></div>' +
      '<div class="item-main"><p class="item-title">' + esc(i.name) + '</p>' +
      '<p class="item-sub">' + esc(i.category) + ' · reorder at ' + i.reorderAt + ' ' + esc(i.unit) + '</p>' +
      (low ? '<div class="item-badges"><span class="badge overdue">Low — reorder</span></div>' : '') + '</div>' +
      '<div class="inv-qty">' + i.qty + '<span>' + esc(i.unit) + '</span></div></div></div>';
  }
  function inventoryBody() {
    var items = S.listInventory();
    var canEdit = S.isManager();
    var low = S.lowStockItems();
    var html = canEdit ? '<button class="btn primary block" data-action="open-add-inventory" style="margin-bottom:10px">+ Add supply</button>' : '';
    if (low.length) {
      html += '<div class="section-title">⚠️ Reorder list<span class="count-pill">' + low.length + '</span></div>';
      html += low.map(invCard).join('');
    }
    html += '<div class="section-title">All supplies<span class="count-pill">' + items.length + '</span></div>';
    html += items.length ? items.map(invCard).join('') : '<div class="empty">No inventory yet.</div>';
    return html;
  }
  function formInventoryDetail(id) {
    var it = S.inventoryById(id); if (!it) return;
    var canEdit = S.isManager();
    var log = S.inventoryLogFor(id);
    var logHtml = log.length ? log.slice(0, 12).map(function (l) {
      return '<div class="hist-row"><span>' + (l.delta > 0 ? '+' : '') + l.delta + ' ' + esc(it.unit) + ' · ' +
        esc(S.userName(l.userId)) + (l.reason ? ' · ' + esc(l.reason) : '') + '</span><span class="subtle">' + esc(S.fmtDate(l.date)) + '</span></div>';
    }).join('') : '<p class="subtle">No changes yet.</p>';
    openModal(it.name,
      '<p class="subtle">' + esc(it.category) + (it.notes ? ' · ' + esc(it.notes) : '') + '</p>' +
      '<p style="font-size:26px;font-weight:800;margin:4px 0">' + it.qty + ' <span style="font-size:15px;font-weight:600;color:var(--muted)">' + esc(it.unit) + '</span>' +
      (it.qty <= it.reorderAt ? ' <span class="badge overdue">Low</span>' : '') + '</p>' +
      '<form data-form="adjust-stock" data-id="' + id + '">' +
        '<div class="field"><label>Log usage or restock</label><div style="display:flex;gap:8px;align-items:center">' +
          '<button type="button" class="btn" data-action="stock-minus">−1</button>' +
          '<input type="number" name="delta" step="any" placeholder="+/- amount" style="flex:1" />' +
          '<button type="button" class="btn" data-action="stock-plus">+1</button></div></div>' +
        '<div class="field"><label>Note (optional)</label><input type="text" name="reason" placeholder="e.g. fed the flock, bought 5 bags" /></div>' +
        '<button type="submit" class="btn primary block">Apply change</button>' +
      '</form>' +
      (canEdit ? '<div class="row-actions" style="margin-top:10px">' +
        '<button class="btn small" data-action="edit-inventory" data-id="' + id + '">Edit item</button>' +
        '<button class="btn small ghost danger" data-action="delete-inventory" data-id="' + id + '">Delete</button></div>' : '') +
      '<div class="section-title">History</div><div class="card">' + logHtml + '</div>');
  }
  function submitAdjustStock(form) {
    var fd = new FormData(form);
    var id = form.getAttribute('data-id');
    var res = S.adjustStock(id, fd.get('delta'), fd.get('reason'));
    if (res.error) { toast(res.error); return; }
    toast('Updated · now ' + res.qty);
    formInventoryDetail(id); render();
  }
  function invFields(it) {
    it = it || {};
    return '<div class="field"><label>Name</label><input type="text" name="name" required value="' + esc(it.name || '') + '" placeholder="e.g. Chick starter" /></div>' +
      '<div class="field"><label>Category</label><input type="text" name="category" value="' + esc(it.category || 'Supplies') + '" /></div>' +
      '<div class="field"><label>Unit</label><input type="text" name="unit" value="' + esc(it.unit || 'count') + '" placeholder="bags, gal, count…" /></div>' +
      (it.id ? '' : '<div class="field"><label>On hand</label><input type="number" name="qty" step="any" value="0" /></div>') +
      '<div class="field"><label>Reorder at</label><input type="number" name="reorderAt" step="any" value="' + (it.reorderAt != null ? it.reorderAt : 0) + '" /></div>' +
      '<div class="field"><label>Notes</label><input type="text" name="notes" value="' + esc(it.notes || '') + '" /></div>';
  }
  function formAddInventory() {
    openModal('Add inventory', '<form data-form="add-inventory">' + invFields(null) +
      '<div class="form-actions"><button type="button" class="btn" data-action="close-modal">Cancel</button><button type="submit" class="btn primary">Add</button></div></form>');
  }
  function submitAddInventory(form) {
    var fd = new FormData(form);
    if (!(fd.get('name') || '').trim()) return;
    var res = S.addInventoryItem({ name: fd.get('name'), category: fd.get('category'), unit: fd.get('unit'), qty: fd.get('qty'), reorderAt: fd.get('reorderAt'), notes: fd.get('notes') });
    if (res.error) { toast(res.error); return; }
    closeModal(); toast('Inventory added'); render();
  }
  function formEditInventory(id) {
    var it = S.inventoryById(id); if (!it) return;
    openModal('Edit inventory', '<form data-form="edit-inventory" data-id="' + id + '">' + invFields(it) +
      '<div class="form-actions"><button type="button" class="btn" data-action="close-modal">Cancel</button><button type="submit" class="btn primary">Save</button></div></form>');
  }
  function submitEditInventory(form) {
    var fd = new FormData(form);
    var res = S.updateInventoryItem(form.getAttribute('data-id'), { name: fd.get('name'), category: fd.get('category'), unit: fd.get('unit'), reorderAt: fd.get('reorderAt'), notes: fd.get('notes') });
    if (res.error) { toast(res.error); return; }
    closeModal(); toast('Inventory updated'); render();
  }

  /* ---------------- search ---------------- */
  function searchResultsHtml(q) {
    if (!q || !q.trim()) return '<p class="subtle">Type to search chores, assets, upkeep, projects, tasks, inventory, and people.</p>';
    var res = S.search(q);
    if (!res.length) return '<div class="empty">No matches for “' + esc(q) + '”.</div>';
    return res.map(function (r) {
      return '<div class="card tap" data-action="search-open" data-type="' + r.type + '" data-id="' + r.id + '"' +
        (r.projectId ? ' data-project="' + r.projectId + '"' : '') + '>' +
        '<div class="item"><div class="item-main"><p class="item-title">' + esc(r.title) + '</p>' +
        '<p class="item-sub">' + esc(r.sub) + '</p></div></div></div>';
    }).join('');
  }
  function viewSearch() {
    return '<div class="view-head"><h1>Search</h1>' +
      '<button class="btn small ghost" data-action="switch-view" data-view="dashboard">Close</button></div>' +
      '<div class="field"><input type="text" id="search-input" data-action="search-input" ' +
      'value="' + esc(ui.searchQ || '') + '" placeholder="Search everything…" autocomplete="off" /></div>' +
      '<div id="search-results">' + searchResultsHtml(ui.searchQ || '') + '</div>';
  }
  function searchOpen(el) {
    var type = el.getAttribute('data-type'), id = el.getAttribute('data-id');
    if (type === 'chore') { ui.view = 'chores'; render(); formChoreDetail(id); }
    else if (type === 'asset') { ui.view = 'maintenance'; render(); formAssetDetail(id); }
    else if (type === 'maintenance') { ui.view = 'maintenance'; render(); formLogService(id); }
    else if (type === 'project') { ui.projectId = id; ui.view = 'projects'; render(); }
    else if (type === 'task') { ui.projectId = el.getAttribute('data-project'); ui.view = 'projects'; render(); }
    else if (type === 'inventory') { ui.view = 'more'; ui.moreSection = 'supplies'; render(); formInventoryDetail(id); }
    else if (type === 'user') { ui.view = 'more'; ui.moreSection = 'people'; render(); }
  }

  /* ---------------- asset docs & QR ---------------- */
  function assetDocsSection(assetId) {
    var docs = S.assetDocsFor(assetId);
    var canDelAll = S.isManager();
    var html = '<div class="section-title">Documents<span class="count-pill">' + docs.length + '</span></div>' +
      '<label class="btn block" style="text-align:center;cursor:pointer;margin-bottom:8px">+ Add receipt / manual' +
        '<input type="file" accept="image/*,application/pdf" data-action="add-doc" data-asset="' + assetId + '" hidden /></label>';
    if (!docs.length) return html + '<p class="subtle">No documents yet.</p>';
    return html + docs.map(function (d) {
      var icon = d.mime.indexOf('pdf') !== -1 ? '📄' : '🧾';
      return '<div class="card"><div class="item"><div class="item-main tap" data-action="view-doc" data-id="' + d.id + '">' +
        '<p class="item-title">' + icon + ' ' + esc(d.name) + '</p>' +
        '<p class="item-sub">' + esc(S.userName(d.uploadedBy)) + ' · ' + esc(S.fmtDate(d.date)) +
        (d.size ? ' · ' + Math.round(d.size / 1024) + ' KB' : '') + '</p></div>' +
        (d.uploadedBy === S.currentUser().id || canDelAll ? '<button class="icon-btn" data-action="delete-doc" data-id="' + d.id + '" aria-label="Delete">🗑</button>' : '') +
        '</div></div>';
    }).join('');
  }
  function addDocFromFile(input) {
    var assetId = input.getAttribute('data-asset');
    var f = input.files && input.files[0];
    input.value = '';
    if (!f) return;
    var isImg = f.type.indexOf('image') === 0;
    var isPdf = f.type.indexOf('pdf') !== -1;
    if (!isImg && !isPdf) { toast('Only images or PDFs'); return; }
    if (f.size > 3 * 1024 * 1024 && isPdf) { toast('PDF too large (max 3 MB)'); return; }
    var docType = isPdf ? 'manual' : 'receipt';
    function store(dataUrl, size) {
      var res = S.addAssetDoc(assetId, { name: f.name || 'Document', docType: docType, mime: f.type, dataUrl: dataUrl, size: size });
      if (res.error) { toast(res.error); return; }
      toast('Document added'); formAssetDetail(assetId); render();
    }
    if (isImg) { fileToDataURL(f, 1400, function (u) { store(u, u.length); }); }
    else { var reader = new FileReader(); reader.onload = function () { store(String(reader.result), f.size); }; reader.readAsDataURL(f); }
  }
  function viewDoc(id) {
    var d = S.assetDocById ? S.assetDocById(id) : null;
    // assetDocById not exported for read; fetch via list is heavy — use a small lookup
    if (!d) { d = findDoc(id); }
    if (!d) { toast('Not found'); return; }
    if (d.mime.indexOf('pdf') !== -1) {
      var w = window.open(); if (w) { w.document.write('<iframe src="' + d.dataUrl + '" style="border:0;width:100%;height:100%"></iframe>'); }
      else toast('Allow pop-ups to view the PDF');
      return;
    }
    openModal(d.name, '<img src="' + d.dataUrl + '" alt="' + esc(d.name) + '" style="width:100%;border-radius:10px" />');
  }
  function findDoc(id) {
    var found = null;
    S.listAssets().forEach(function (a) { S.assetDocsFor(a.id).forEach(function (d) { if (d.id === id) found = d; }); });
    return found;
  }
  function assetDeepLink(assetId) { return location.origin + location.pathname + '#asset=' + assetId; }
  function formAssetQR(assetId) {
    var a = S.assetById(assetId); if (!a) return;
    var link = assetDeepLink(assetId);
    var svg = (window.QR ? window.QR.svg(link) : '');
    openModal('QR · ' + a.name,
      '<div class="notice">Print this and stick it on the asset. Scanning it opens this asset in the app.</div>' +
      '<div class="qr-wrap">' + svg + '</div>' +
      '<p class="subtle" style="word-break:break-all;text-align:center">' + esc(link) + '</p>' +
      '<button class="btn block" onclick="window.print()">🖨 Print</button>');
  }

  /* ---------------- render ---------------- */
  function render() {
    renderUserArea();
    var main = $('#view');
    // Legacy view ids now live inside the More hub.
    if (ui.view === 'inventory') { ui.view = 'more'; ui.moreSection = 'supplies'; }
    else if (ui.view === 'leaderboard') { ui.view = 'more'; ui.moreSection = 'board'; }
    var v = ui.view;
    if (v === 'dashboard') main.innerHTML = viewDashboard();
    else if (v === 'chores') main.innerHTML = viewChores();
    else if (v === 'maintenance') main.innerHTML = viewMaintenance();
    else if (v === 'projects') main.innerHTML = viewProjects();
    else if (v === 'search') main.innerHTML = viewSearch();
    else if (v === 'more') main.innerHTML = viewMore();
    document.querySelectorAll('.nav-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-view') === v);
    });
    var overdue = S.counts().overdue;
    var badge = $('#nav-badge');
    badge.hidden = overdue === 0;
    badge.textContent = overdue > 9 ? '9+' : String(overdue);
    // "More" badge: sum of things needing attention that live under More.
    var mBadge = $('#more-badge');
    if (mBadge) {
      var mk = S.currentMonthKey();
      var me = S.currentUser();
      var attn = S.lowStockItems().length;
      attn += S.isManager(me)
        ? S.rentSummary(mk).unpaid
        : S.rentChargesForMonth(mk).filter(function (c) { return c.userId === me.id && c.status === 'unpaid'; }).length;
      mBadge.hidden = attn === 0;
      mBadge.textContent = attn > 9 ? '9+' : String(attn);
    }
    window.scrollTo(0, 0);
  }

  /* ---------------- modal forms ---------------- */
  function formAddChore() {
    openModal('Add chore',
      '<form data-form="add-chore">' +
        '<div class="field"><label>Name</label><input type="text" name="name" required placeholder="e.g. Collect eggs" /></div>' +
        scheduleFields(null) +
        '<div class="field"><label>First due</label><input type="date" name="firstDue" value="' + S.todayISO() + '" /></div>' +
        '<div class="field"><label>Assign to</label><select name="assignedTo">' + userOptions(S.currentUser().id, true) + '</select></div>' +
        '<div class="field"><label>If missed</label><select name="catchUp">' +
          '<option value="skipToNext">Skip to next occurrence</option>' +
          '<option value="mustCatchUp">Must catch up (stays overdue)</option>' +
        '</select></div>' +
        requirePhotoCheckbox(false) +
        openCheckbox(false) +
        stepsField('') +
        '<div class="form-actions"><button type="button" class="btn" data-action="close-modal">Cancel</button>' +
        '<button type="submit" class="btn primary">Add chore</button></div>' +
      '</form>');
  }
  function stepsField(val) {
    return '<div class="field"><label>Checklist steps (one per line, optional)</label>' +
      '<textarea name="steps" placeholder="Lock the coop&#10;Water off&#10;Lights out">' + esc(val) + '</textarea></div>';
  }
  function stepsFromForm(fd) {
    return (fd.get('steps') || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function submitAddChore(form) {
    var fd = new FormData(form);
    var schedule = scheduleFromForm(fd);
    var name = (fd.get('name') || '').trim();
    if (!name) return;
    if (schedule.type === 'weekly' && !schedule.weekdays.length) { toast('Pick at least one weekday'); return; }
    var res = S.addChore({ name: name, schedule: schedule, assignedTo: fd.get('assignedTo') || null, catchUp: fd.get('catchUp'), nextDue: fd.get('firstDue') || S.todayISO(), requirePhoto: fd.get('requirePhoto') === 'on', open: fd.get('open') === 'on', steps: stepsFromForm(fd) });
    if (res.error) { toast(res.error); return; }
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
    var res = S.addAsset({ name: name, category: fd.get('category') || 'Equipment', meterUnit: fd.get('meterUnit') || null });
    if (res.error) { toast(res.error); return; }
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
        requirePhotoCheckbox(false) +
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
    var data = { assetId: assetId, name: name, intervalType: type, requirePhoto: fd.get('requirePhoto') === 'on' };
    if (type === 'calendar') { data.intervalValue = fd.get('calValue'); data.intervalUnit = fd.get('calUnit'); }
    else { data.intervalValue = fd.get('usageValue'); }
    var res = S.addMaintenance(data);
    if (res.error) { toast(res.error); return; }
    closeModal(); toast('Maintenance item added'); render();
  }

  function formLogService(itemId) {
    var item = S.listMaintenance().filter(function (m) { return m.id === itemId; })[0];
    if (!item) return;
    var asset = S.assetById(item.assetId);
    var st = S.maintenanceStatus(item);
    var logs = S.maintenanceLogsFor(itemId);
    var canSb = S.isManager();
    var histHtml = logs.length ? logs.map(function (l, idx) {
      return '<div class="hist-row"><span>' + esc(S.fmtDate(l.date)) + ' · ' + esc(S.userName(l.userId)) +
        (l.reading != null ? ' · ' + l.reading : '') + (l.cost ? ' · $' + l.cost : '') +
        (l.notes ? ' · ' + esc(l.notes) : '') + (l.photo ? ' ' + proofBtn('service', l.id) : '') + '</span>' +
        (canSb && idx === 0 ? '<button class="btn small ghost danger" data-action="send-back-service" data-id="' + l.id + '" title="Send back / undo">↩</button>' : '') +
        '</div>';
    }).join('') : '<p class="subtle">No history yet.</p>';

    var totalCost = S.itemCostTotal(itemId);
    openModal('Log: ' + item.name,
      '<p class="subtle">' + esc(asset ? asset.name : '') + ' · ' + esc(st.detail) + '</p>' +
      '<div class="chips" style="margin:6px 0 4px">' +
        '<span class="chip">' + logs.length + ' service' + (logs.length === 1 ? '' : 's') + ' logged</span>' +
        '<span class="chip">$' + totalCost.toFixed(2) + ' total</span>' +
        (S.isManager() ? '<button type="button" class="btn small ghost" data-action="edit-maintenance" data-id="' + itemId + '">Edit item</button>' : '') +
      '</div>' +
      timerButton('maintenance', itemId) +
      '<form data-form="log-service" data-id="' + itemId + '">' +
        '<div class="field"><label>Date</label><input type="date" name="date" value="' + S.todayISO() + '" /></div>' +
        (asset && asset.meterUnit ? '<div class="field"><label>Meter reading (' + asset.meterUnit + ')</label><input type="number" name="reading" placeholder="current ' + asset.meterUnit + '" /></div>' : '') +
        '<div class="field"><label>Cost ($, optional)</label><input type="number" name="cost" min="0" step="0.01" /></div>' +
        (item.requirePhoto ? photoProofField('Photo of completed work (required by manager)') : '') +
        '<div class="field"><label>Notes</label><textarea name="notes" placeholder="Parts used, observations…"></textarea></div>' +
        '<div class="form-actions"><button type="button" class="btn" data-action="close-modal">Cancel</button>' +
        '<button type="submit" class="btn primary">Mark serviced</button></div>' +
      '</form>' +
      '<div class="section-title">Service history</div><div class="card">' + histHtml + '</div>');
  }
  function submitLogService(form) {
    var fd = new FormData(form);
    var itemId = form.getAttribute('data-id');
    var item = S.maintenanceById(itemId);
    var fileInput = form.querySelector('input[name="photo"]');
    var file = fileInput && fileInput.files[0];
    if (item && item.requirePhoto && !file) { toast('A photo of the completed work is required'); return; }
    fileToDataURL(file, 900, function (dataUrl) {
      var res = S.logService(itemId, { date: fd.get('date'), reading: fd.get('reading'), cost: fd.get('cost'), notes: fd.get('notes'), photo: dataUrl });
      if (res.error) { toast(res.error); return; }
      closeModal(); toast('Service logged'); render();
    });
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
        requirePhotoCheckbox(false) +
        openCheckbox(false) +
        '<div class="form-actions"><button type="button" class="btn" data-action="close-modal">Cancel</button>' +
        '<button type="submit" class="btn primary">Add task</button></div>' +
      '</form>');
  }
  function submitAddTask(form) {
    var fd = new FormData(form);
    var projectId = form.getAttribute('data-id');
    var title = (fd.get('title') || '').trim();
    if (!title) return;
    var res = S.addTask(projectId, { title: title, description: fd.get('description'), assignedTo: fd.get('assignedTo') || null, dueDate: fd.get('dueDate') || null, requirePhoto: fd.get('requirePhoto') === 'on', open: fd.get('open') === 'on' });
    if (res && res.error) { toast(res.error); return; }
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
    var res = S.addTasksBulk(cache.projectId, chosen);
    if (res && res.error) { toast(res.error); return; }
    closeModal(); toast('Added ' + chosen.length + ' step(s)'); render();
  }

  function formEditProject(id) {
    var p = S.getProject(id); if (!p) return;
    openModal('Edit project',
      '<form data-form="edit-project" data-id="' + p.id + '">' +
        '<div class="field"><label>Name</label><input type="text" name="name" required value="' + esc(p.name) + '" /></div>' +
        '<div class="field"><label>Description</label><textarea name="description">' + esc(p.description) + '</textarea></div>' +
        '<div class="field"><label>Target date</label><input type="date" name="targetDate" value="' + esc(p.targetDate || '') + '" /></div>' +
        '<div class="form-actions"><button type="button" class="btn" data-action="close-modal">Cancel</button>' +
        '<button type="submit" class="btn primary">Save</button></div>' +
      '</form>');
  }
  function submitEditProject(form) {
    var fd = new FormData(form);
    var res = S.updateProject(form.getAttribute('data-id'), { name: fd.get('name'), description: fd.get('description'), targetDate: fd.get('targetDate') || null });
    if (res.error) { toast(res.error); return; }
    closeModal(); toast('Project updated'); render();
  }

  function formAddNote(projectId) {
    openModal('Add progress note',
      '<form data-form="add-note" data-id="' + projectId + '">' +
        '<div class="field"><label>Note</label><textarea name="body" placeholder="What happened? What&#39;s next?"></textarea></div>' +
        '<div class="field"><label>Photo (optional)</label><input type="file" name="photo" accept="image/*" capture="environment" /></div>' +
        '<div class="form-actions"><button type="button" class="btn" data-action="close-modal">Cancel</button>' +
        '<button type="submit" class="btn primary">Add note</button></div>' +
      '</form>');
  }
  function submitAddNote(form) {
    var projectId = form.getAttribute('data-id');
    var body = (new FormData(form).get('body') || '').trim();
    var fileInput = form.querySelector('input[name="photo"]');
    var file = fileInput && fileInput.files[0];
    if (!body && !file) { toast('Add a note or a photo'); return; }
    var btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Saving…';
    fileToDataURL(file, 1024, function (dataUrl) {
      var res = S.addNote('project', projectId, { body: body, photo: dataUrl });
      if (res.error) { toast(res.error); btn.disabled = false; btn.textContent = 'Add note'; return; }
      closeModal(); toast('Note added'); render();
    });
  }
  function viewPhoto(noteId) {
    var n = S.noteById(noteId);
    if (!n || !n.photo) return;
    openModal('Photo', '<img src="' + n.photo + '" alt="progress photo" style="width:100%;border-radius:10px" />');
  }

  function formAddUser() {
    openModal('Add person',
      '<form data-form="add-user">' +
        '<div class="field"><label>Name</label><input type="text" name="name" required placeholder="e.g. Riley" /></div>' +
        '<div class="field"><label>Role</label><select name="role">' + roleOpts('worker') + '</select></div>' +
        '<div class="form-actions"><button type="button" class="btn" data-action="close-modal">Cancel</button>' +
        '<button type="submit" class="btn primary">Add person</button></div>' +
      '</form>');
  }
  function submitAddUser(form) {
    var fd = new FormData(form);
    var res = S.addUser({ name: fd.get('name'), role: fd.get('role') });
    if (res.error) { toast(res.error); return; }
    closeModal(); toast('Added ' + res.user.name); render();
  }

  function formEditTask(taskId) {
    var t = S.taskById(taskId); if (!t) return;
    openModal('Edit task',
      '<form data-form="edit-task" data-id="' + taskId + '">' +
        '<div class="field"><label>Title</label><input type="text" name="title" required value="' + esc(t.title) + '" /></div>' +
        '<div class="field"><label>Details</label><textarea name="description">' + esc(t.description || '') + '</textarea></div>' +
        '<div class="field"><label>Assign to</label><select name="assignedTo">' + userOptions(t.assignedTo, true) + '</select></div>' +
        '<div class="field"><label>Due date</label><input type="date" name="dueDate" value="' + esc(t.dueDate || '') + '" /></div>' +
        requirePhotoCheckbox(t.requirePhoto) +
        openCheckbox(t.open) +
        '<div class="form-actions">' +
          '<button type="button" class="btn danger" data-action="delete-task" data-id="' + taskId + '">Delete</button>' +
          '<button type="submit" class="btn primary">Save</button>' +
        '</div>' +
      '</form>');
  }
  function submitEditTask(form) {
    var fd = new FormData(form);
    var res = S.updateTask(form.getAttribute('data-id'), {
      title: fd.get('title'), description: fd.get('description'),
      assignedTo: fd.get('assignedTo') || null, dueDate: fd.get('dueDate') || null,
      requirePhoto: fd.get('requirePhoto') === 'on', open: fd.get('open') === 'on'
    });
    if (res.error) { toast(res.error); return; }
    closeModal(); toast('Task updated'); render();
  }

  /* ---------------- rent modals ---------------- */
  function formRentCharge(chargeId) {
    var c = S.rentChargeById(chargeId); if (!c) return;
    var me = S.currentUser();
    var isMgr = S.isManager();
    var mine = c.userId === me.id;
    var statusLine = c.status === 'verified'
      ? 'Verified by ' + S.userName(c.verifiedBy) + ' on ' + S.fmtDate(c.verifiedAt)
      : c.status === 'marked'
        ? 'Marked paid by ' + S.userName(c.markedBy) + ' on ' + S.fmtDate(c.markedAt) + ' — awaiting verification'
        : 'Unpaid · due ' + S.fmtDate(c.dueDate);

    var body = '<p class="subtle">' + esc(S.userName(c.userId)) + ' · ' + esc(S.monthLabel(c.month)) + '</p>' +
      '<p style="font-size:26px;font-weight:800;margin:4px 0">$' + c.amount + '</p>' +
      '<p class="subtle">' + esc(statusLine) + '</p>' +
      (c.note ? '<p class="subtle">Note: “' + esc(c.note) + '”</p>' : '');

    if (c.status === 'unpaid' && (mine || isMgr)) {
      body += '<form data-form="mark-rent" data-id="' + c.id + '" style="margin-top:10px">' +
        '<div class="field"><label>Payment note (optional)</label><input type="text" name="note" placeholder="e.g. cash, check #204, Venmo" /></div>' +
        '<button type="submit" class="btn primary block">Mark as paid</button>' +
      '</form>';
    }
    if (isMgr) {
      body += '<div class="row-actions" style="margin-top:10px">' +
        (c.status !== 'verified' ? '<button class="btn small primary" data-action="verify-rent" data-id="' + c.id + '">✓ Verify received</button>' : '') +
        (c.status !== 'unpaid' ? '<button class="btn small ghost danger" data-action="reopen-rent" data-id="' + c.id + '">Reopen</button>' : '') +
      '</div>';
    }

    var hist = S.rentHistoryFor(c.userId);
    if (hist.length > 1) {
      body += '<div class="section-title">History</div><div class="card">' +
        hist.map(function (h) {
          var label = h.status === 'verified' ? '✓ verified' : h.status === 'marked' ? 'awaiting verification' : 'unpaid';
          return '<div class="hist-row"><span>' + esc(S.monthLabel(h.month)) + ' · $' + h.amount + '</span><span class="subtle">' + esc(label) + '</span></div>';
        }).join('') + '</div>';
    }
    openModal('Rent', body);
  }
  function submitMarkRent(form) {
    var note = (new FormData(form).get('note') || '').trim();
    var res = S.markRentPaid(form.getAttribute('data-id'), note);
    if (res.error) { toast(res.error); return; }
    closeModal(); toast('Marked as paid — a manager will verify'); render();
  }

  function formRentAssign() {
    var opts = S.users().map(function (u) {
      var a = S.rentAssignmentFor(u.id);
      var suffix = a && a.active ? ' — currently $' + a.amount + '/mo' : '';
      return '<option value="' + u.id + '">' + esc(u.name + suffix) + '</option>';
    }).join('');
    openModal('Assign monthly rent',
      '<form data-form="assign-rent">' +
        '<div class="field"><label>Person</label><select name="userId">' + opts + '</select></div>' +
        '<div class="field"><label>Monthly amount ($)</label><input type="number" name="amount" min="1" step="0.01" required placeholder="e.g. 500" /></div>' +
        '<div class="field"><label>Due on day of month</label><input type="number" name="dueDay" min="1" max="28" value="1" /></div>' +
        '<p class="subtle">A charge is created automatically each month. To stop charging someone, use “Stop rent”.</p>' +
        '<div class="form-actions">' +
          '<button type="button" class="btn danger" data-action="stop-rent">Stop rent</button>' +
          '<button type="submit" class="btn primary">Save</button>' +
        '</div>' +
      '</form>');
  }
  function submitAssignRent(form) {
    var fd = new FormData(form);
    var res = S.setRent(fd.get('userId'), fd.get('amount'), fd.get('dueDay'));
    if (res.error) { toast(res.error); return; }
    closeModal(); toast('Rent saved'); render();
  }

  function viewProof(kind, id) {
    var photo = S.proofPhoto(kind, id);
    if (!photo) { toast('No photo attached'); return; }
    openModal('Photo proof', '<img src="' + photo + '" alt="photo proof" style="width:100%;border-radius:10px" />');
  }

  function submitSavePrefs(form) {
    var fd = new FormData(form);
    S.setPrefs(S.currentUser().id, { email: fd.get('email'), push: fd.get('push') === 'on', digestHour: fd.get('digestHour') });
    toast('Preferences saved');
  }

  /* ---------------- event wiring ---------------- */
  function handleAction(action, el) {
    var id = el.getAttribute('data-id');
    switch (action) {
      case 'switch-view': ui.view = el.getAttribute('data-view'); ui.projectId = null; ui.moreSection = null; render(); break;
      case 'more-open': {
        var sec = el.getAttribute('data-section');
        if (sec === 'weather') { formWeatherSetup(); break; }
        ui.moreSection = sec; render(); break;
      }
      case 'more-back': ui.moreSection = null; render(); break;
      case 'set-scope': ui.scope = el.getAttribute('data-scope'); render(); break;
      case 'set-lb': ui.lbWindow = el.getAttribute('data-win'); render(); break;
      case 'close-modal': closeModal(); break;

      case 'claim-item': { var ci = S.claimItem(el.getAttribute('data-kind'), id); if (ci.error) toast(ci.error); else { closeModal(); toast('Claimed — it\'s yours'); render(); } break; }
      case 'release-item': { var rel = S.releaseItem(el.getAttribute('data-kind'), id); if (rel.error) toast(rel.error); else { closeModal(); toast('Released back to open'); render(); } break; }

      case 'complete-chore': {
        var ch = S.choreById(id);
        if (ch && (ch.requirePhoto || (ch.steps && ch.steps.length))) { formCompleteChore(id); break; }
        var cr = S.completeChore(id);
        if (cr.error) toast(cr.error); else { toast('Nice — done'); render(); }
        break;
      }
      case 'open-chore': formChoreDetail(id); break;
      case 'edit-chore': formEditChore(id); break;
      case 'delete-chore': if (confirm('Delete this chore and its history?')) { var dc = S.deleteChore(id); if (dc.error) toast(dc.error); else { closeModal(); render(); } } break;
      case 'open-add-chore': formAddChore(); break;

      case 'open-add-asset': formAddAsset(); break;
      case 'open-asset': formAssetDetail(id); break;
      case 'delete-asset': if (confirm('Delete this asset, its maintenance items, and history?')) { var da = S.deleteAsset(id); if (da.error) toast(da.error); else { closeModal(); toast('Asset deleted'); render(); } } break;
      case 'open-add-maintenance': formAddMaintenance(id); break;
      case 'open-log-service': formLogService(id); break;
      case 'edit-maintenance': formEditMaintenance(id); break;
      case 'delete-maintenance': if (confirm('Delete this maintenance item and its history?')) { var dm = S.deleteMaintenance(id); if (dm.error) toast(dm.error); else { closeModal(); toast('Item deleted'); render(); } } break;

      case 'open-project': ui.projectId = id; ui.view = 'projects'; render(); break;
      case 'back-to-projects': ui.projectId = null; render(); break;
      case 'open-add-project': formAddProject(); break;
      case 'edit-project': formEditProject(id); break;
      case 'open-add-task': formAddTask(id); break;
      case 'edit-task': formEditTask(id); break;
      case 'delete-task': if (confirm('Delete this task?')) { var dt = S.deleteTask(id); if (dt.error) toast(dt.error); else { closeModal(); toast('Task deleted'); render(); } } break;
      case 'toggle-task': {
        var tk = S.taskById(id);
        if (tk && !tk.done && tk.requirePhoto) { formCompleteTask(id); break; }
        var tr = S.toggleTask(id);
        if (tr.error) toast(tr.error);
        render();
        break;
      }
      case 'view-proof': viewProof(el.getAttribute('data-kind'), id); break;

      case 'open-rent-charge': formRentCharge(id); break;
      case 'open-rent-assign': formRentAssign(); break;
      case 'verify-rent': { var vr = S.verifyRent(id); if (vr.error) toast(vr.error); else { closeModal(); toast('Rent verified'); render(); } break; }
      case 'reopen-rent': if (confirm('Reopen this charge as unpaid?')) { var rr2 = S.reopenRent(id); if (rr2.error) toast(rr2.error); else { closeModal(); toast('Charge reopened'); render(); } } break;
      case 'stop-rent': {
        var f = el.closest('form');
        var uid2 = f && f.querySelector('select[name="userId"]') ? f.querySelector('select[name="userId"]').value : null;
        if (uid2 && confirm('Stop charging ' + S.userName(uid2) + ' rent?')) {
          var sr2 = S.stopRent(uid2);
          if (sr2.error) toast(sr2.error); else { closeModal(); toast('Rent stopped'); render(); }
        }
        break;
      }
      case 'suggest-steps': suggestSteps(id); break;
      case 'delete-project': if (confirm('Delete this project and its tasks?')) { var dp = S.deleteProject(id); if (dp && dp.error) toast(dp.error); else { ui.projectId = null; render(); } } break;

      case 'open-add-note': formAddNote(id); break;
      case 'view-photo': viewPhoto(id); break;
      case 'delete-note': if (confirm('Delete this note?')) { S.deleteNote(id); render(); } break;

      case 'open-add-user': formAddUser(); break;
      case 'remove-user': if (confirm('Remove this person?')) { var ru = S.removeUser(id); if (ru.error) toast(ru.error); else { toast('Removed'); render(); } } break;
      case 'export-data': exportData(); break;

      case 'switch-to-user': S.setCurrentUser(id); toast('Now acting as ' + S.userName(id)); render(); break;
      case 'reset-data': if (confirm('Reset all demo data in this browser?')) { S.reset(); ui.projectId = null; ui.view = 'dashboard'; render(); toast('Demo data reset'); } break;

      /* dashboard calendar toggle */
      case 'toggle-dashmode': ui.dashMode = ui.dashMode === 'calendar' ? 'list' : 'calendar'; ui.calDay = null; render(); break;

      /* global search */
      case 'open-search': ui.searchQ = ui.searchQ || ''; ui.view = 'search'; render(); setTimeout(function () { var si = $('#search-input'); if (si) si.focus(); }, 0); break;
      case 'search-open': searchOpen(el); break;

      /* calendar */
      case 'cal-prev': ui.calMonth = shiftMonth(ui.calMonth || S.currentMonthKey(), -1); ui.calDay = null; render(); break;
      case 'cal-next': ui.calMonth = shiftMonth(ui.calMonth || S.currentMonthKey(), 1); ui.calDay = null; render(); break;
      case 'cal-day': ui.calDay = el.getAttribute('data-date'); render(); break;
      case 'cal-open': {
        var ck = el.getAttribute('data-kind'), cid = id;
        if (ck === 'chore') formChoreDetail(cid);
        else if (ck === 'maintenance') formLogService(cid);
        else if (ck === 'task') { var tt = S.taskById(cid); if (tt) { ui.projectId = tt.projectId; ui.view = 'projects'; render(); } }
        else if (ck === 'rent') { ui.view = 'more'; render(); }
        break;
      }

      /* time tracking */
      case 'start-timer': { var sk = el.getAttribute('data-kind'); var sres = S.startTimer(sk, id); if (sres.error) toast(sres.error); else { toast('Timer started'); refreshTimerUI(el, sk, id); } break; }
      case 'stop-timer': { var xk = el.getAttribute('data-kind'); var xres = S.stopTimer(xk, id); if (xres.error) toast(xres.error); else { toast('Logged ' + S.fmtDur(xres.entry.seconds)); refreshTimerUI(el, xk, id); } break; }

      /* send back */
      case 'send-back-chore': sendBack('chore', id); break;
      case 'send-back-task': sendBack('task', id); break;
      case 'send-back-service': sendBack('service', id); break;

      /* weather */
      case 'weather-setup': formWeatherSetup(); break;
      case 'weather-refresh': refreshWeather(); break;
      case 'weather-geo': weatherGeo(); break;

      /* inventory */
      case 'open-inventory': formInventoryDetail(id); break;
      case 'open-add-inventory': formAddInventory(); break;
      case 'edit-inventory': formEditInventory(id); break;
      case 'delete-inventory': if (confirm('Delete this inventory item and its history?')) { var din = S.deleteInventoryItem(id); if (din.error) toast(din.error); else { closeModal(); toast('Deleted'); render(); } } break;
      case 'stock-plus': stockNudge(el, 1); break;
      case 'stock-minus': stockNudge(el, -1); break;

      /* asset QR + documents */
      case 'asset-qr': formAssetQR(id); break;
      case 'view-doc': viewDoc(id); break;
      case 'delete-doc': if (confirm('Delete this document?')) { var dd2 = S.deleteAssetDoc(id); if (dd2.error) toast(dd2.error); else { toast('Deleted'); render(); } } break;
    }
  }

  // After a timer start/stop, refresh the background view and, if the button
  // lived inside a detail modal, re-open that modal so its button flips state.
  function refreshTimerUI(el, kind, refId) {
    var inModal = !!el.closest('#modal-body');
    render();
    if (!inModal) return;
    if (kind === 'chore') formChoreDetail(refId);
    else if (kind === 'maintenance') formLogService(refId);
  }
  function stockNudge(el, dir) {
    var input = el.parentNode.querySelector('input[name="delta"]');
    if (!input) return;
    var cur = Number(input.value) || 0;
    input.value = cur + dir;
  }
  // Shift a YYYY-MM month key by n months.
  function shiftMonth(mk, n) {
    var p = mk.split('-').map(Number);
    var d = new Date(p[0], p[1] - 1 + n, 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
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
    if (action === 'toggle-task') {
      var tid = el.getAttribute('data-id');
      var task = S.taskById(tid);
      if (task && !task.done && task.requirePhoto) { formCompleteTask(tid); render(); return; }
      var tres = S.toggleTask(tid);
      if (tres.error) toast(tres.error);
      render(); return;
    }
    if (action === 'set-project-status') { var sr = S.updateProjectStatus(el.getAttribute('data-id'), el.value); if (sr && sr.error) toast(sr.error); else toast('Status updated'); render(); return; }
    if (action === 'set-user-role') { var rr = S.updateUserRole(el.getAttribute('data-id'), el.value); if (rr.error) toast(rr.error); render(); return; }
    if (action === 'import-file') { handleImportFile(el); return; }
    if (action === 'add-doc') { addDocFromFile(el); return; }
  });

  // Live global search — update results in place without a full re-render so
  // the input keeps focus and the caret position.
  document.addEventListener('input', function (e) {
    var el = e.target.closest('[data-action="search-input"]');
    if (!el) return;
    ui.searchQ = el.value;
    var box = $('#search-results');
    if (box) box.innerHTML = searchResultsHtml(ui.searchQ);
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
      case 'edit-chore': submitEditChore(form); break;
      case 'complete-chore': submitCompleteChoreWithNote(form); break;
      case 'edit-asset': submitEditAsset(form); break;
      case 'add-reading': submitAddReading(form); break;
      case 'edit-maintenance': submitEditMaintenance(form); break;
      case 'add-project': submitAddProject(form); break;
      case 'edit-project': submitEditProject(form); break;
      case 'add-task': submitAddTask(form); break;
      case 'edit-task': submitEditTask(form); break;
      case 'accept-steps': submitAcceptSteps(form); break;
      case 'complete-task': submitCompleteTask(form); break;
      case 'mark-rent': submitMarkRent(form); break;
      case 'assign-rent': submitAssignRent(form); break;
      case 'add-note': submitAddNote(form); break;
      case 'add-user': submitAddUser(form); break;
      case 'save-prefs': submitSavePrefs(form); break;
      case 'weather-loc': submitWeatherLoc(form); break;
      case 'add-inventory': submitAddInventory(form); break;
      case 'edit-inventory': submitEditInventory(form); break;
      case 'adjust-stock': submitAdjustStock(form); break;
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('#modal').hidden) closeModal();
  });

  /* ---------------- boot ---------------- */
  // QR deep link: opening #asset=ID jumps straight to that asset.
  function openDeepLink() {
    var m = /(?:^|#|&)asset=([A-Za-z0-9_]+)/.exec(location.hash || '');
    if (!m) return;
    var a = S.assetById(m[1]);
    if (!a) { toast('Asset not found'); return; }
    ui.view = 'maintenance'; render(); formAssetDetail(m[1]);
  }

  S.init();
  render();
  openDeepLink();
  window.addEventListener('hashchange', openDeepLink);

  // Live-update running timers once a second.
  setInterval(tickTimers, 1000);

  // Register the service worker for offline/PWA (skipped on file://).
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').catch(function () {});
    });
  }
})();
