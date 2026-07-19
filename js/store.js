/* Farm Project Tracker — data layer, persistence, and business logic.
 * Static prototype: everything lives in the browser via localStorage.
 * Exposes a global `Store`. No build step, no server. */
(function () {
  'use strict';

  var STORAGE_KEY = 'fpt_state_v2';
  var state = null;

  /* ---------------- date helpers (date-only, local) ---------------- */
  function iso(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  }
  function todayISO() { return iso(new Date()); }
  function parseISO(s) { var p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function addDays(s, n) { var d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); }
  function addMonths(s, n) { var d = parseISO(s); d.setMonth(d.getMonth() + n); return iso(d); }
  function diffDays(a, b) { return Math.round((parseISO(a) - parseISO(b)) / 86400000); }
  function weekday(s) { return parseISO(s).getDay(); }

  function fmtDate(s) {
    var d = parseISO(s);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  function relativeLabel(s) {
    var n = diffDays(s, todayISO());
    if (n === 0) return 'today';
    if (n === 1) return 'tomorrow';
    if (n === -1) return 'yesterday';
    if (n > 1) return 'in ' + n + ' days';
    return -n + ' days ago';
  }

  /* ---------------- misc ---------------- */
  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

  /* ---------------- recurrence ---------------- */
  function mdOf(s) { return s.slice(5); }
  function isActiveSeason(season, s) {
    var md = mdOf(s);
    if (season.start <= season.end) return md >= season.start && md <= season.end;
    return md >= season.start || md <= season.end; // wraps the new year
  }
  function nextSeasonStart(season, s) {
    var year = parseISO(s).getFullYear();
    var cand = year + '-' + season.start;
    if (cand < s) cand = (year + 1) + '-' + season.start;
    return cand;
  }
  function clampToSeason(schedule, s) {
    if (!schedule.season) return s;
    if (isActiveSeason(schedule.season, s)) return s;
    return nextSeasonStart(schedule.season, s);
  }
  // Smallest date strictly after `from` that matches the schedule.
  function nextOccurrenceAfter(schedule, from) {
    var d;
    switch (schedule.type) {
      case 'daily': d = addDays(from, 1); break;
      case 'everyNDays': d = addDays(from, Math.max(1, schedule.n || 1)); break;
      case 'weekly': {
        var wds = (schedule.weekdays && schedule.weekdays.length) ? schedule.weekdays : [weekday(from)];
        d = addDays(from, 1);
        for (var i = 1; i <= 7; i++) { var c = addDays(from, i); if (wds.indexOf(weekday(c)) !== -1) { d = c; break; } }
        break;
      }
      case 'monthly': {
        var base = parseISO(from);
        var day = schedule.day || 1;
        var cand = new Date(base.getFullYear(), base.getMonth(), day);
        if (iso(cand) <= from) cand = new Date(base.getFullYear(), base.getMonth() + 1, day);
        d = iso(cand);
        break;
      }
      default: d = addDays(from, 1);
    }
    return clampToSeason(schedule, d);
  }
  function describeSchedule(schedule) {
    var base;
    switch (schedule.type) {
      case 'daily': base = 'Every day'; break;
      case 'everyNDays': base = 'Every ' + (schedule.n || 1) + ' days'; break;
      case 'weekly': {
        var names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        var ds = (schedule.weekdays || []).slice().sort().map(function (w) { return names[w]; });
        base = ds.length ? 'Weekly · ' + ds.join(', ') : 'Weekly';
        break;
      }
      case 'monthly': base = 'Monthly · day ' + (schedule.day || 1); break;
      default: base = 'Recurring';
    }
    if (schedule.season) base += ' (seasonal)';
    return base;
  }

  /* ---------------- seed data ---------------- */
  function seed() {
    var T = todayISO();
    var users = [
      { id: 'u_dale', name: 'Dale', role: 'admin' },
      { id: 'u_morgan', name: 'Morgan', role: 'manager' },
      { id: 'u_sam', name: 'Sam', role: 'worker' },
      { id: 'u_jamie', name: 'Jamie', role: 'worker' }
    ];
    var chores = [
      { id: 'c_feed', name: 'Feed the chickens', schedule: { type: 'daily' }, catchUp: 'mustCatchUp', assignedTo: 'u_sam', nextDue: addDays(T, -1) },
      { id: 'c_muck', name: 'Muck out the stalls', schedule: { type: 'daily' }, catchUp: 'skipToNext', assignedTo: 'u_jamie', nextDue: T },
      { id: 'c_troughs', name: 'Check water troughs', schedule: { type: 'daily' }, catchUp: 'mustCatchUp', assignedTo: null, nextDue: T },
      { id: 'c_water', name: 'Water the greenhouse', schedule: { type: 'everyNDays', n: 2 }, catchUp: 'skipToNext', assignedTo: 'u_sam', nextDue: addDays(T, 1) },
      { id: 'c_cattle', name: 'Move cattle to fresh paddock', schedule: { type: 'weekly', weekdays: [1, 4] }, catchUp: 'skipToNext', assignedTo: 'u_morgan', nextDue: addDays(T, 2) },
      { id: 'c_mow', name: 'Mow the orchard', schedule: { type: 'weekly', weekdays: [6], season: { start: '05-01', end: '09-30' } }, catchUp: 'skipToNext', assignedTo: 'u_jamie', nextDue: addDays(T, 4) }
    ];
    var assets = [
      { id: 'a_tractor', name: 'Kubota L2501 tractor', category: 'Equipment', meterUnit: 'hours', notes: '' },
      { id: 'a_truck', name: 'Ford F-250', category: 'Vehicle', meterUnit: 'miles', notes: '' },
      { id: 'a_well', name: 'Well pump', category: 'Infrastructure', meterUnit: null, notes: '' },
      { id: 'a_coop', name: 'Chicken coop', category: 'Structure', meterUnit: null, notes: '' }
    ];
    var meterReadings = [
      { id: uid('mr'), assetId: 'a_tractor', reading: 512, userId: 'u_morgan', date: addDays(T, -3) },
      { id: uid('mr'), assetId: 'a_truck', reading: 84230, userId: 'u_sam', date: addDays(T, -2) }
    ];
    var maintenanceItems = [
      { id: 'm_oil', assetId: 'a_tractor', name: 'Engine oil & filter', intervalType: 'usage', intervalValue: 50, lastDoneDate: addDays(T, -30), lastDoneReading: 470, dueAtReading: 520, nextDueDate: null },
      { id: 'm_grease', assetId: 'a_tractor', name: 'Grease all fittings', intervalType: 'calendar', intervalValue: 1, intervalUnit: 'months', lastDoneDate: addDays(T, -40), lastDoneReading: null, dueAtReading: null, nextDueDate: addDays(T, -10) },
      { id: 'm_truckoil', assetId: 'a_truck', name: 'Oil change', intervalType: 'usage', intervalValue: 3000, lastDoneDate: addDays(T, -60), lastDoneReading: 81500, dueAtReading: 84500, nextDueDate: null },
      { id: 'm_well', assetId: 'a_well', name: 'Pressure & seal inspection', intervalType: 'calendar', intervalValue: 6, intervalUnit: 'months', lastDoneDate: addDays(T, -170), lastDoneReading: null, dueAtReading: null, nextDueDate: addDays(T, 10) }
    ];
    var maintenanceLogs = [];
    var projects = [
      { id: 'p_shed', name: 'Build run-in shed for horses', description: 'A 12x24 three-sided run-in shed on the south pasture for weather shelter.', status: 'in_progress', targetDate: addDays(T, 45), createdBy: 'u_morgan', createdAt: addDays(T, -14) },
      { id: 'p_fence', name: 'Fence the north pasture', description: 'Run new woven-wire fence around the north 6 acres, with a gate by the lane.', status: 'planned', targetDate: addDays(T, 90), createdBy: 'u_morgan', createdAt: addDays(T, -6) },
      { id: 'p_irrig', name: 'Overhaul greenhouse irrigation', description: 'Replace hand-watering with a timed drip system.', status: 'idea', targetDate: null, createdBy: 'u_morgan', createdAt: addDays(T, -2) }
    ];
    var projectTasks = [
      { id: uid('t'), projectId: 'p_shed', title: 'Pour concrete footings', description: '', assignedTo: 'u_jamie', dueDate: addDays(T, -5), done: true, doneBy: 'u_jamie', doneAt: addDays(T, -4), sort: 0 },
      { id: uid('t'), projectId: 'p_shed', title: 'Frame the three walls', description: 'Pressure-treated posts, 2x6 girts.', assignedTo: 'u_sam', dueDate: addDays(T, 3), done: false, doneBy: null, doneAt: null, sort: 1 },
      { id: uid('t'), projectId: 'p_shed', title: 'Install the roof', description: '', assignedTo: 'u_jamie', dueDate: addDays(T, 12), done: false, doneBy: null, doneAt: null, sort: 2 },
      { id: uid('t'), projectId: 'p_shed', title: 'Hang the gate & trim', description: '', assignedTo: null, dueDate: null, done: false, doneBy: null, doneAt: null, sort: 3 },
      { id: uid('t'), projectId: 'p_fence', title: 'Walk the line & mark corners', description: '', assignedTo: 'u_morgan', dueDate: addDays(T, 5), done: false, doneBy: null, doneAt: null, sort: 0 }
    ];
    var activity = [
      { id: uid('act'), ts: Date.now() - 86400000 * 4, userId: 'u_jamie', text: 'completed task "Pour concrete footings" on Build run-in shed' },
      { id: uid('act'), ts: Date.now() - 86400000 * 2, userId: 'u_morgan', text: 'created project "Fence the north pasture"' }
    ];

    return {
      version: 2,
      currentUserId: 'u_morgan',
      users: users,
      chores: chores,
      choreCompletions: [],
      assets: assets,
      meterReadings: meterReadings,
      maintenanceItems: maintenanceItems,
      maintenanceLogs: maintenanceLogs,
      projects: projects,
      projectTasks: projectTasks,
      notes: [],
      activity: activity
    };
  }

  function init() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      state = raw ? JSON.parse(raw) : null;
    } catch (e) { state = null; }
    if (!state || state.version !== 2) { state = seed(); save(); }
  }
  function reset() { state = seed(); save(); }

  /* ---------------- users / roles ---------------- */
  function users() { return state.users; }
  function userById(id) { for (var i = 0; i < state.users.length; i++) if (state.users[i].id === id) return state.users[i]; return null; }
  function currentUser() { return userById(state.currentUserId) || state.users[0]; }
  function setCurrentUser(id) { state.currentUserId = id; save(); }
  function userName(id) { var u = userById(id); return u ? u.name : 'Unassigned'; }
  function canCreateProject(user) { user = user || currentUser(); return user.role === 'admin' || user.role === 'manager'; }

  function logActivity(text) {
    state.activity.unshift({ id: uid('act'), ts: Date.now(), userId: state.currentUserId, text: text });
    state.activity = state.activity.slice(0, 100);
  }

  /* ---------------- chores ---------------- */
  function listChores() {
    return state.chores.slice().sort(function (a, b) { return a.nextDue < b.nextDue ? -1 : 1; });
  }
  function addChore(data) {
    var chore = {
      id: uid('c'), name: data.name, schedule: data.schedule,
      catchUp: data.catchUp || 'skipToNext',
      assignedTo: data.assignedTo || null,
      nextDue: data.nextDue || todayISO()
    };
    state.chores.push(chore);
    logActivity('added chore "' + chore.name + '"');
    save();
    return chore;
  }
  function completeChore(id, notes) {
    var chore = state.chores.filter(function (c) { return c.id === id; })[0];
    if (!chore) return;
    var today = todayISO();
    state.choreCompletions.push({ id: uid('cc'), choreId: id, completedBy: state.currentUserId, date: today, notes: notes || '' });
    if (chore.catchUp === 'mustCatchUp') {
      chore.nextDue = nextOccurrenceAfter(chore.schedule, chore.nextDue);
    } else {
      chore.nextDue = nextOccurrenceAfter(chore.schedule, today);
    }
    logActivity('completed chore "' + chore.name + '"');
    save();
  }
  function deleteChore(id) {
    state.chores = state.chores.filter(function (c) { return c.id !== id; });
    save();
  }
  function bucketForDate(dueDate) {
    var n = diffDays(dueDate, todayISO());
    if (n < 0) return 'overdue';
    if (n === 0) return 'today';
    if (n <= 7) return 'upcoming';
    return 'later';
  }

  /* ---------------- assets & maintenance ---------------- */
  function listAssets() { return state.assets.slice(); }
  function assetById(id) { return state.assets.filter(function (a) { return a.id === id; })[0] || null; }
  function addAsset(data) {
    var asset = { id: uid('a'), name: data.name, category: data.category || 'Equipment', meterUnit: data.meterUnit || null, notes: data.notes || '' };
    state.assets.push(asset);
    logActivity('added asset "' + asset.name + '"');
    save();
    return asset;
  }
  function latestReading(assetId) {
    var rs = state.meterReadings.filter(function (r) { return r.assetId === assetId; });
    if (!rs.length) return null;
    return rs.reduce(function (m, r) { return r.reading > m ? r.reading : m; }, rs[0].reading);
  }
  function listMaintenance() { return state.maintenanceItems.slice(); }
  function maintenanceForAsset(assetId) { return state.maintenanceItems.filter(function (m) { return m.assetId === assetId; }); }
  function addMaintenance(data) {
    var today = todayISO();
    var item = {
      id: uid('m'), assetId: data.assetId, name: data.name,
      intervalType: data.intervalType, intervalValue: Number(data.intervalValue),
      intervalUnit: data.intervalUnit || 'months',
      lastDoneDate: today, lastDoneReading: null, dueAtReading: null, nextDueDate: null
    };
    if (item.intervalType === 'calendar') {
      item.nextDueDate = item.intervalUnit === 'days' ? addDays(today, item.intervalValue) : addMonths(today, item.intervalValue);
    } else {
      var cur = latestReading(data.assetId);
      item.lastDoneReading = (cur != null) ? cur : 0;
      item.dueAtReading = item.lastDoneReading + item.intervalValue;
    }
    state.maintenanceItems.push(item);
    var asset = assetById(data.assetId);
    logActivity('added maintenance "' + item.name + '" on ' + (asset ? asset.name : 'asset'));
    save();
    return item;
  }
  function logService(itemId, data) {
    var item = state.maintenanceItems.filter(function (m) { return m.id === itemId; })[0];
    if (!item) return;
    var date = data.date || todayISO();
    var reading = (data.reading === '' || data.reading == null) ? null : Number(data.reading);
    state.maintenanceLogs.push({ id: uid('ml'), itemId: itemId, userId: state.currentUserId, date: date, reading: reading, notes: data.notes || '', cost: data.cost ? Number(data.cost) : 0 });
    if (reading != null && assetById(item.assetId) && assetById(item.assetId).meterUnit) {
      state.meterReadings.push({ id: uid('mr'), assetId: item.assetId, reading: reading, userId: state.currentUserId, date: date });
    }
    item.lastDoneDate = date;
    if (item.intervalType === 'calendar') {
      item.nextDueDate = item.intervalUnit === 'days' ? addDays(date, item.intervalValue) : addMonths(date, item.intervalValue);
    } else {
      if (reading != null) item.lastDoneReading = reading;
      item.dueAtReading = (item.lastDoneReading || 0) + item.intervalValue;
    }
    var asset = assetById(item.assetId);
    logActivity('logged "' + item.name + '" on ' + (asset ? asset.name : 'asset'));
    save();
  }
  function maintenanceLogsFor(itemId) {
    return state.maintenanceLogs.filter(function (l) { return l.itemId === itemId; })
      .sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  }
  function maintenanceStatus(item) {
    if (item.intervalType === 'calendar') {
      var bucket = bucketForDate(item.nextDueDate);
      return { mode: 'date', dueDate: item.nextDueDate, bucket: bucket, detail: 'Due ' + fmtDate(item.nextDueDate) + ' · ' + relativeLabel(item.nextDueDate) };
    }
    var asset = assetById(item.assetId);
    var unit = asset ? asset.meterUnit : 'units';
    var current = latestReading(item.assetId);
    if (current == null) current = item.lastDoneReading || 0;
    var remaining = item.dueAtReading - current;
    var soonThreshold = Math.max(1, Math.round(item.intervalValue * 0.15));
    var bucket2 = remaining <= 0 ? 'overdue' : (remaining <= soonThreshold ? 'upcoming' : 'later');
    var detail = remaining <= 0
      ? 'Overdue by ' + (-remaining) + ' ' + unit + ' (at ' + current + ')'
      : remaining + ' ' + unit + ' left (due at ' + item.dueAtReading + ')';
    return { mode: 'usage', current: current, due: item.dueAtReading, remaining: remaining, bucket: bucket2, detail: detail, unit: unit };
  }

  /* ---------------- projects ---------------- */
  var STATUS_LABELS = { idea: 'Idea', planned: 'Planned', in_progress: 'In progress', on_hold: 'On hold', done: 'Done' };
  function listProjects() { return state.projects.slice().sort(function (a, b) { return b.createdAt < a.createdAt ? -1 : 1; }); }
  function getProject(id) { return state.projects.filter(function (p) { return p.id === id; })[0] || null; }
  function projectTasks(projectId) {
    return state.projectTasks.filter(function (t) { return t.projectId === projectId; })
      .sort(function (a, b) { return a.sort - b.sort; });
  }
  function addProject(data) {
    if (!canCreateProject()) { return { error: 'Only farm managers and admins can create projects.' }; }
    var project = {
      id: uid('p'), name: data.name, description: data.description || '',
      status: data.status || 'idea', targetDate: data.targetDate || null,
      createdBy: state.currentUserId, createdAt: todayISO()
    };
    state.projects.push(project);
    logActivity('created project "' + project.name + '"');
    save();
    return { project: project };
  }
  function updateProjectStatus(id, status) {
    var p = getProject(id); if (!p) return;
    p.status = status; save();
  }
  function deleteProject(id) {
    state.projects = state.projects.filter(function (p) { return p.id !== id; });
    state.projectTasks = state.projectTasks.filter(function (t) { return t.projectId !== id; });
    save();
  }
  function addTask(projectId, data) {
    var existing = projectTasks(projectId);
    var task = {
      id: uid('t'), projectId: projectId, title: data.title, description: data.description || '',
      assignedTo: data.assignedTo || null, dueDate: data.dueDate || null,
      done: false, doneBy: null, doneAt: null, sort: existing.length
    };
    state.projectTasks.push(task);
    save();
    return task;
  }
  function addTasksBulk(projectId, items) {
    var existing = projectTasks(projectId).length;
    items.forEach(function (it, i) {
      state.projectTasks.push({
        id: uid('t'), projectId: projectId, title: it.title, description: it.description || '',
        assignedTo: null, dueDate: null, done: false, doneBy: null, doneAt: null, sort: existing + i
      });
    });
    logActivity('added ' + items.length + ' suggested step(s) to a project');
    save();
  }
  function toggleTask(taskId) {
    var t = state.projectTasks.filter(function (x) { return x.id === taskId; })[0];
    if (!t) return;
    t.done = !t.done;
    t.doneBy = t.done ? state.currentUserId : null;
    t.doneAt = t.done ? todayISO() : null;
    save();
  }

  /* Offline placeholder for the future Claude API "suggest steps" call.
   * The real integration (server-side @anthropic-ai/sdk → claude-opus-4-8) arrives
   * with the server phase; this keyword-based stand-in lets the review/accept UX be
   * tested now. */
  function suggestSteps(name, description) {
    var text = ((name || '') + ' ' + (description || '')).toLowerCase();
    var rules = [
      { k: ['shed', 'barn', 'build', 'construct', 'lean-to', 'structure'], steps: [
        { title: 'Confirm size, location, and permits', description: 'Check setbacks and whether a permit is required.' },
        { title: 'Draw up a materials list & budget', description: '' },
        { title: 'Prepare and level the site', description: '' },
        { title: 'Pour footings / set posts', description: '' },
        { title: 'Frame the walls', description: '' },
        { title: 'Install roof and sheathing', description: '' },
        { title: 'Add doors, trim, and finish', description: '' },
        { title: 'Final walkthrough & cleanup', description: '' }
      ] },
      { k: ['fence', 'fencing', 'paddock', 'pasture'], steps: [
        { title: 'Walk the line and mark corners', description: '' },
        { title: 'Call to locate underground utilities', description: '' },
        { title: 'Order posts, wire, and gates', description: '' },
        { title: 'Set corner and gate posts in concrete', description: '' },
        { title: 'Set line posts', description: '' },
        { title: 'Stretch and attach wire', description: '' },
        { title: 'Hang gates and test', description: '' }
      ] },
      { k: ['irrigation', 'drip', 'water', 'plumbing'], steps: [
        { title: 'Map zones and water needs', description: '' },
        { title: 'Choose emitters, tubing, and a timer', description: '' },
        { title: 'Order parts', description: '' },
        { title: 'Lay mainline and run tubing to zones', description: '' },
        { title: 'Install the timer and test each zone', description: '' },
        { title: 'Tune run-times and check coverage', description: '' }
      ] }
    ];
    for (var i = 0; i < rules.length; i++) {
      for (var j = 0; j < rules[i].k.length; j++) {
        if (text.indexOf(rules[i].k[j]) !== -1) return rules[i].steps;
      }
    }
    return [
      { title: 'Define the goal and scope', description: '' },
      { title: 'List materials and estimate the budget', description: '' },
      { title: 'Schedule the work and assign helpers', description: '' },
      { title: 'Do the work in stages', description: '' },
      { title: 'Review the result and note follow-ups', description: '' }
    ];
  }

  /* ---------------- dashboard ---------------- */
  function dashboard(scope) {
    var me = state.currentUserId;
    var buckets = { overdue: [], today: [], upcoming: [] };
    function push(item) { if (buckets[item.bucket]) buckets[item.bucket].push(item); }

    listChores().forEach(function (c) {
      var b = bucketForDate(c.nextDue);
      if (b === 'later') return;
      if (scope === 'mine' && c.assignedTo !== me) return;
      push({
        kind: 'chore', id: c.id, title: c.name,
        subtitle: describeSchedule(c.schedule) + ' · ' + userName(c.assignedTo),
        dueDate: c.nextDue, sortKey: c.nextDue, bucket: b,
        action: 'complete-chore', actionLabel: 'Done'
      });
    });

    state.maintenanceItems.forEach(function (m) {
      var st = maintenanceStatus(m);
      if (st.bucket === 'later') return; // maintenance is shared → shown in both scopes
      var asset = assetById(m.assetId);
      push({
        kind: 'maintenance', id: m.id, title: m.name,
        subtitle: (asset ? asset.name : '') + ' · ' + st.detail,
        dueDate: st.mode === 'date' ? st.dueDate : todayISO(),
        sortKey: st.mode === 'date' ? st.dueDate : '0000-' + String(st.remaining).padStart(6, '0'),
        bucket: st.bucket, action: 'open-log-service', actionLabel: 'Log'
      });
    });

    state.projectTasks.forEach(function (t) {
      if (t.done || !t.dueDate) return;
      var b = bucketForDate(t.dueDate);
      if (b === 'later') return;
      if (scope === 'mine' && t.assignedTo !== me) return;
      var proj = getProject(t.projectId);
      push({
        kind: 'task', id: t.id, title: t.title,
        subtitle: (proj ? proj.name : 'Project') + ' · ' + userName(t.assignedTo),
        dueDate: t.dueDate, sortKey: t.dueDate, bucket: b,
        action: 'toggle-task', actionLabel: 'Done'
      });
    });

    ['overdue', 'today', 'upcoming'].forEach(function (k) {
      buckets[k].sort(function (a, b) { return a.sortKey < b.sortKey ? -1 : 1; });
    });
    return buckets;
  }

  function listActivity() { return state.activity.slice(0, 40); }
  function counts() {
    var b = dashboard('all');
    return { overdue: b.overdue.length, today: b.today.length, upcoming: b.upcoming.length };
  }

  /* ---------------- exports ---------------- */
  window.Store = {
    init: init, reset: reset, save: save,
    // dates
    todayISO: todayISO, fmtDate: fmtDate, relativeLabel: relativeLabel, addDays: addDays, diffDays: diffDays,
    // users
    users: users, userById: userById, userName: userName, currentUser: currentUser,
    setCurrentUser: setCurrentUser, canCreateProject: canCreateProject,
    // chores
    listChores: listChores, addChore: addChore, completeChore: completeChore, deleteChore: deleteChore,
    describeSchedule: describeSchedule, bucketForDate: bucketForDate,
    // assets & maintenance
    listAssets: listAssets, assetById: assetById, addAsset: addAsset, latestReading: latestReading,
    listMaintenance: listMaintenance, maintenanceForAsset: maintenanceForAsset, addMaintenance: addMaintenance,
    logService: logService, maintenanceLogsFor: maintenanceLogsFor, maintenanceStatus: maintenanceStatus,
    // projects
    STATUS_LABELS: STATUS_LABELS, listProjects: listProjects, getProject: getProject, projectTasks: projectTasks,
    addProject: addProject, updateProjectStatus: updateProjectStatus, deleteProject: deleteProject,
    addTask: addTask, addTasksBulk: addTasksBulk, toggleTask: toggleTask, suggestSteps: suggestSteps,
    // dashboard / activity
    dashboard: dashboard, counts: counts, listActivity: listActivity
  };
})();
