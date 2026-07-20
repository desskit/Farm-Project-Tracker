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

  /* ---------------- views ---------------- */
  function viewDashboard() {
    var isMgr = S.isManager();
    if (ui.scope === 'team' && !isMgr) ui.scope = 'mine';
    var html = '' +
      '<div class="view-head">' +
        '<div><h1>Today</h1><p class="subtle">' + S.fmtDate(S.todayISO()) + ' · ' + esc(S.currentUser().name) + '</p></div>' +
        '<div class="segmented">' +
          '<button class="' + (ui.scope === 'mine' ? 'active' : '') + '" data-action="set-scope" data-scope="mine">Mine</button>' +
          '<button class="' + (ui.scope === 'all' ? 'active' : '') + '" data-action="set-scope" data-scope="all">All</button>' +
          (isMgr ? '<button class="' + (ui.scope === 'team' ? 'active' : '') + '" data-action="set-scope" data-scope="team">Team</button>' : '') +
        '</div>' +
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
    var histHtml = history.length ? history.slice(0, 15).map(function (h) {
      return '<div class="hist-row"><span>' + esc(S.fmtDate(h.date)) + ' · ' + esc(S.userName(h.completedBy)) +
        (h.notes ? ' · ' + esc(h.notes) : '') + (h.photo ? ' ' + proofBtn('chore', h.id) : '') + '</span></div>';
    }).join('') : '<p class="subtle">Never completed yet.</p>';

    openModal(c.name,
      '<p class="subtle">' + esc(S.describeSchedule(c.schedule)) + ' · ' + esc(S.userName(c.assignedTo)) +
        ' · next due ' + esc(S.fmtDate(c.nextDue)) + ' (' + esc(S.relativeLabel(c.nextDue)) + ')</p>' +
      '<div class="chips" style="margin:8px 0 4px">' +
        '<span class="chip">' + history.length + ' completion' + (history.length === 1 ? '' : 's') + '</span>' +
        (streak >= 2 ? '<span class="chip">🔥 ' + streak + '-day streak</span>' : '') +
        '<span class="chip">' + (c.catchUp === 'mustCatchUp' ? 'must catch up if missed' : 'skips if missed') + '</span>' +
      '</div>' +
      '<form data-form="complete-chore" data-id="' + id + '" style="margin-top:10px">' +
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
      catchUp: fd.get('catchUp'), nextDue: fd.get('nextDue'), requirePhoto: fd.get('requirePhoto') === 'on'
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
    openModal('Complete: ' + c.name,
      '<div class="notice">📷 A manager set this chore to require photo proof.</div>' +
      '<form data-form="complete-chore" data-id="' + id + '">' +
        photoProofField('Photo proof') +
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

    var body = '<p class="subtle">' + esc(a.category) + ' · total maintenance spend <strong>$' + cost.toFixed(2) + '</strong></p>';

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
            '<div class="check-row ' + (t.done ? 'done' : '') + '">' +
              '<input type="checkbox" ' + (t.done ? 'checked' : '') + ' data-action="toggle-task" data-id="' + t.id + '" />' +
              '<div class="item-main">' +
                '<p class="item-title c-title">' + esc(t.title) + '</p>' +
                (t.description ? '<p class="item-sub">' + esc(t.description) + '</p>' : '') +
                '<div class="chips">' +
                  '<span class="chip">' + esc(S.userName(t.assignedTo)) + '</span>' +
                  (t.dueDate ? '<span class="chip">due ' + esc(S.fmtDate(t.dueDate)) + '</span>' : '') +
                  (t.requirePhoto && !t.done ? '<span class="chip">📷 proof required</span>' : '') +
                  (t.done ? '<span class="chip">done ' + esc(S.fmtDate(t.doneAt)) + ' by ' + esc(S.userName(t.doneBy)) + '</span>' : '') +
                  (t.done && t.donePhoto ? proofBtn('task', t.id) : '') +
                '</div>' +
              '</div>' +
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

  function viewMore() {
    var me = S.currentUser();
    var isAdmin = S.canManageUsers(me);
    var prefs = S.getPrefs(me.id);
    var acts = S.listActivity();
    var html = '<div class="view-head"><h1>More</h1></div>';

    // Notification preferences (preview)
    html += '<div class="section-title">Notifications</div>' +
      '<div class="card">' +
        '<div class="notice">Preview — email &amp; push activate with the server phase. Choices are saved per person.</div>' +
        '<form data-form="save-prefs">' +
          '<div class="field"><label>Email digest</label><select name="email">' +
            optTag('off', 'Off', prefs.email) + optTag('daily', 'Daily', prefs.email) + optTag('weekly', 'Weekly', prefs.email) +
          '</select></div>' +
          '<div class="field"><label>Digest time</label><select name="digestHour">' + hourOptions(prefs.digestHour) + '</select></div>' +
          '<label class="inline-check"><input type="checkbox" name="push" ' + (prefs.push ? 'checked' : '') + ' /> Push notifications</label>' +
          '<button class="btn primary block" type="submit" style="margin-top:12px">Save preferences</button>' +
        '</form>' +
      '</div>';

    // Rent
    var mk = S.currentMonthKey();
    var isMgr = S.isManager(me);
    var charges = S.rentChargesForMonth(mk).filter(function (c) { return isMgr || c.userId === me.id; });
    var rs = S.rentSummary(mk);
    html += '<div class="section-title">Rent · ' + esc(S.monthLabel(mk)) + '</div>';
    if (isMgr) {
      html += '<button class="btn block" data-action="open-rent-assign" style="margin-bottom:8px">+ Assign / edit rent</button>';
      if (rs.count) {
        html += '<div class="notice">$' + rs.collected.toFixed(0) + ' of $' + rs.due.toFixed(0) + ' verified · ' +
          rs.unpaid + ' unpaid · ' + rs.marked + ' awaiting verification</div>';
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

    // People / admin
    html += '<div class="section-title">People' + (isAdmin ? '' : ' · view only') + '</div>';
    if (isAdmin) html += '<button class="btn block" data-action="open-add-user" style="margin-bottom:8px">+ Add person</button>';
    html += S.users().map(function (u) {
      var isMe = u.id === me.id;
      var roleCtrl = (isAdmin && !isMe)
        ? '<select data-action="set-user-role" data-id="' + u.id + '">' + roleOpts(u.role) + '</select>'
        : '<p class="item-sub">' + esc(u.role) + (isMe ? ' · you' : '') + '</p>';
      var actions = (isMe ? '<span class="badge upcoming">You</span>' :
        '<button class="btn small" data-action="switch-to-user" data-id="' + u.id + '">Act as</button>') +
        (isAdmin && !isMe ? '<button class="btn small ghost danger" data-action="remove-user" data-id="' + u.id + '">Remove</button>' : '');
      return '<div class="card"><div class="item"><div class="item-main">' +
        '<p class="item-title">' + esc(u.name) + '</p>' + roleCtrl +
        '</div><div class="row-actions">' + actions + '</div></div></div>';
    }).join('');
    if (!isAdmin) html += '<p class="subtle">Only admins can add or change people — switch to Dale (admin) to try it.</p>';

    // Recent activity
    html += '<div class="section-title">Recent activity</div><div class="card">';
    if (!acts.length) { html += '<p class="subtle">Nothing yet.</p>'; }
    else {
      html += acts.map(function (a) {
        var when = new Date(a.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        return '<div class="hist-row"><span>' + esc(S.userName(a.userId)) + ' ' + esc(a.text) + '</span><span class="subtle">' + when + '</span></div>';
      }).join('');
    }
    html += '</div>';

    // Data / backup
    html += '<div class="section-title">Data</div>' +
      '<div class="stack">' +
        '<button class="btn block" data-action="export-data">⬇︎ Export backup (JSON)</button>' +
        '<label class="btn block" style="text-align:center;cursor:pointer">⬆︎ Import backup' +
          '<input type="file" accept="application/json,.json" data-action="import-file" hidden /></label>' +
        '<button class="btn block danger" data-action="reset-data">Reset demo data</button>' +
      '</div>' +
      '<div class="notice" style="margin-top:10px">Data lives in this browser only. Export to back it up or move it to another device.</div>';
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
    var overdue = S.counts().overdue;
    var badge = $('#nav-badge');
    badge.hidden = overdue === 0;
    badge.textContent = overdue > 9 ? '9+' : String(overdue);
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
        '<div class="form-actions"><button type="button" class="btn" data-action="close-modal">Cancel</button>' +
        '<button type="submit" class="btn primary">Add chore</button></div>' +
      '</form>');
  }
  function submitAddChore(form) {
    var fd = new FormData(form);
    var schedule = scheduleFromForm(fd);
    var name = (fd.get('name') || '').trim();
    if (!name) return;
    if (schedule.type === 'weekly' && !schedule.weekdays.length) { toast('Pick at least one weekday'); return; }
    var res = S.addChore({ name: name, schedule: schedule, assignedTo: fd.get('assignedTo') || null, catchUp: fd.get('catchUp'), nextDue: fd.get('firstDue') || S.todayISO(), requirePhoto: fd.get('requirePhoto') === 'on' });
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
    var histHtml = logs.length ? logs.map(function (l) {
      return '<div class="hist-row"><span>' + esc(S.fmtDate(l.date)) + ' · ' + esc(S.userName(l.userId)) +
        (l.reading != null ? ' · ' + l.reading : '') + (l.cost ? ' · $' + l.cost : '') +
        (l.notes ? ' · ' + esc(l.notes) : '') + (l.photo ? ' ' + proofBtn('service', l.id) : '') + '</span></div>';
    }).join('') : '<p class="subtle">No history yet.</p>';

    var totalCost = S.itemCostTotal(itemId);
    openModal('Log: ' + item.name,
      '<p class="subtle">' + esc(asset ? asset.name : '') + ' · ' + esc(st.detail) + '</p>' +
      '<div class="chips" style="margin:6px 0 4px">' +
        '<span class="chip">' + logs.length + ' service' + (logs.length === 1 ? '' : 's') + ' logged</span>' +
        '<span class="chip">$' + totalCost.toFixed(2) + ' total</span>' +
        (S.isManager() ? '<button type="button" class="btn small ghost" data-action="edit-maintenance" data-id="' + itemId + '">Edit item</button>' : '') +
      '</div>' +
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
        '<div class="form-actions"><button type="button" class="btn" data-action="close-modal">Cancel</button>' +
        '<button type="submit" class="btn primary">Add task</button></div>' +
      '</form>');
  }
  function submitAddTask(form) {
    var fd = new FormData(form);
    var projectId = form.getAttribute('data-id');
    var title = (fd.get('title') || '').trim();
    if (!title) return;
    var res = S.addTask(projectId, { title: title, description: fd.get('description'), assignedTo: fd.get('assignedTo') || null, dueDate: fd.get('dueDate') || null, requirePhoto: fd.get('requirePhoto') === 'on' });
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
      requirePhoto: fd.get('requirePhoto') === 'on'
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
      case 'switch-view': ui.view = el.getAttribute('data-view'); ui.projectId = null; render(); break;
      case 'set-scope': ui.scope = el.getAttribute('data-scope'); render(); break;
      case 'close-modal': closeModal(); break;

      case 'complete-chore': {
        var ch = S.choreById(id);
        if (ch && ch.requirePhoto) { formCompleteChore(id); break; }
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
