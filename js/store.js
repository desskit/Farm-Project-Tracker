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

  function pad2(n) { return String(n).padStart(2, '0'); }
  function currentMonthKey() { return todayISO().slice(0, 7); }
  function shiftMonthKey(mk, delta) {
    var p = mk.split('-').map(Number);
    var d = new Date(p[0], p[1] - 1 + delta, 1);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1);
  }
  function monthLabel(mk) {
    var p = mk.split('-').map(Number);
    return new Date(p[0], p[1] - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
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
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); return true; }
    catch (e) { return false; }
  }

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
      { id: 'c_muck', name: 'Muck out the stalls', schedule: { type: 'daily' }, catchUp: 'skipToNext', assignedTo: 'u_jamie', nextDue: T, requirePhoto: true },
      { id: 'c_troughs', name: 'Check water troughs', schedule: { type: 'daily' }, catchUp: 'mustCatchUp', assignedTo: null, nextDue: T, open: true },
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
      { id: 'm_oil', assetId: 'a_tractor', name: 'Engine oil & filter', intervalType: 'usage', intervalValue: 50, lastDoneDate: addDays(T, -30), lastDoneReading: 470, dueAtReading: 520, nextDueDate: null, requirePhoto: true },
      { id: 'm_grease', assetId: 'a_tractor', name: 'Grease all fittings', intervalType: 'calendar', intervalValue: 1, intervalUnit: 'months', lastDoneDate: addDays(T, -40), lastDoneReading: null, dueAtReading: null, nextDueDate: addDays(T, -10) },
      { id: 'm_truckoil', assetId: 'a_truck', name: 'Oil change', intervalType: 'usage', intervalValue: 3000, lastDoneDate: addDays(T, -60), lastDoneReading: 81500, dueAtReading: 84500, nextDueDate: null },
      { id: 'm_well', assetId: 'a_well', name: 'Pressure & seal inspection', intervalType: 'calendar', intervalValue: 6, intervalUnit: 'months', lastDoneDate: addDays(T, -170), lastDoneReading: null, dueAtReading: null, nextDueDate: addDays(T, 10) }
    ];
    var maintenanceLogs = [
      { id: uid('ml'), itemId: 'm_truckoil', userId: 'u_sam', date: addDays(T, -5), reading: 82000, notes: 'Oil + filter', cost: 62, photo: null },
      { id: uid('ml'), itemId: 'm_grease', userId: 'u_jamie', date: addDays(T, -8), reading: null, notes: 'Greased all zerks', cost: 0, photo: null }
    ];
    var projects = [
      { id: 'p_shed', name: 'Build run-in shed for horses', description: 'A 12x24 three-sided run-in shed on the south pasture for weather shelter.', status: 'in_progress', targetDate: addDays(T, 45), createdBy: 'u_morgan', createdAt: addDays(T, -14) },
      { id: 'p_fence', name: 'Fence the north pasture', description: 'Run new woven-wire fence around the north 6 acres, with a gate by the lane.', status: 'planned', targetDate: addDays(T, 90), createdBy: 'u_morgan', createdAt: addDays(T, -6) },
      { id: 'p_irrig', name: 'Overhaul greenhouse irrigation', description: 'Replace hand-watering with a timed drip system.', status: 'idea', targetDate: null, createdBy: 'u_morgan', createdAt: addDays(T, -2) }
    ];
    var projectTasks = [
      { id: uid('t'), projectId: 'p_shed', title: 'Pour concrete footings', description: '', assignedTo: 'u_jamie', dueDate: addDays(T, -5), done: true, doneBy: 'u_jamie', doneAt: addDays(T, -4), sort: 0 },
      { id: uid('t'), projectId: 'p_shed', title: 'Frame the three walls', description: 'Pressure-treated posts, 2x6 girts.', assignedTo: 'u_sam', dueDate: addDays(T, 3), done: false, doneBy: null, doneAt: null, sort: 1 },
      { id: uid('t'), projectId: 'p_shed', title: 'Install the roof', description: '', assignedTo: 'u_jamie', dueDate: addDays(T, 12), done: false, doneBy: null, doneAt: null, sort: 2, requirePhoto: true },
      { id: uid('t'), projectId: 'p_shed', title: 'Hang the gate & trim', description: 'Anyone can grab this one.', assignedTo: null, dueDate: addDays(T, 14), done: false, doneBy: null, doneAt: null, sort: 3, open: true },
      { id: uid('t'), projectId: 'p_fence', title: 'Walk the line & mark corners', description: '', assignedTo: 'u_morgan', dueDate: addDays(T, 5), done: false, doneBy: null, doneAt: null, sort: 0 },
      { id: uid('t'), projectId: 'p_fence', title: 'Clear brush along the fence line', description: '', assignedTo: null, dueDate: addDays(T, 6), done: false, doneBy: null, doneAt: null, sort: 1, open: true }
    ];
    var activity = [
      { id: uid('act'), ts: Date.now() - 86400000 * 4, userId: 'u_jamie', text: 'completed task "Pour concrete footings" on Build run-in shed' },
      { id: uid('act'), ts: Date.now() - 86400000 * 2, userId: 'u_morgan', text: 'created project "Fence the north pasture"' }
    ];

    var notes = [
      { id: uid('n'), parentType: 'project', parentId: 'p_shed', userId: 'u_jamie', date: addDays(T, -4), ts: Date.now() - 86400000 * 4, body: 'Footings poured and cured — ready for framing.', photo: null }
    ];
    var mk = T.slice(0, 7);
    var lastMk = shiftMonthKey(mk, -1);
    var rentAssignments = [
      { userId: 'u_sam', amount: 500, dueDay: 1, active: true },
      { userId: 'u_jamie', amount: 450, dueDay: 1, active: true }
    ];
    var rentCharges = [
      { id: uid('rc'), userId: 'u_sam', month: lastMk, amount: 500, dueDate: lastMk + '-01', status: 'verified', markedAt: lastMk + '-01', markedBy: 'u_sam', verifiedAt: lastMk + '-02', verifiedBy: 'u_morgan', note: '' },
      { id: uid('rc'), userId: 'u_jamie', month: lastMk, amount: 450, dueDate: lastMk + '-01', status: 'verified', markedAt: lastMk + '-03', markedBy: 'u_jamie', verifiedAt: lastMk + '-03', verifiedBy: 'u_morgan', note: '' },
      { id: uid('rc'), userId: 'u_sam', month: mk, amount: 500, dueDate: mk + '-01', status: 'marked', markedAt: T, markedBy: 'u_sam', verifiedAt: null, verifiedBy: null, note: 'Left cash in the office' },
      { id: uid('rc'), userId: 'u_jamie', month: mk, amount: 450, dueDate: mk + '-01', status: 'unpaid', markedAt: null, markedBy: null, verifiedAt: null, verifiedBy: null, note: '' }
    ];
    var notificationPrefs = {};
    users.forEach(function (u) { notificationPrefs[u.id] = defaultPrefs(); });

    // Seeded completion history so streaks and the leaderboard are lively on first load.
    var choreCompletions = [
      { id: uid('cc'), choreId: 'c_feed', completedBy: 'u_sam', date: addDays(T, -1), notes: '', photo: null },
      { id: uid('cc'), choreId: 'c_feed', completedBy: 'u_sam', date: addDays(T, -2), notes: '', photo: null },
      { id: uid('cc'), choreId: 'c_feed', completedBy: 'u_sam', date: addDays(T, -3), notes: '', photo: null },
      { id: uid('cc'), choreId: 'c_water', completedBy: 'u_sam', date: addDays(T, -2), notes: 'Greenhouse watered', photo: null },
      { id: uid('cc'), choreId: 'c_muck', completedBy: 'u_jamie', date: addDays(T, -1), notes: '', photo: null },
      { id: uid('cc'), choreId: 'c_muck', completedBy: 'u_jamie', date: addDays(T, -2), notes: '', photo: null },
      { id: uid('cc'), choreId: 'c_troughs', completedBy: 'u_jamie', date: addDays(T, -2), notes: '', photo: null },
      { id: uid('cc'), choreId: 'c_cattle', completedBy: 'u_morgan', date: addDays(T, -3), notes: '', photo: null }
    ];

    return {
      version: CURRENT_VERSION,
      currentUserId: 'u_morgan',
      users: users,
      chores: chores,
      choreCompletions: choreCompletions,
      assets: assets,
      meterReadings: meterReadings,
      maintenanceItems: maintenanceItems,
      maintenanceLogs: maintenanceLogs,
      projects: projects,
      projectTasks: projectTasks,
      notes: notes,
      notificationPrefs: notificationPrefs,
      rentAssignments: rentAssignments,
      rentCharges: rentCharges,
      activity: activity
    };
  }

  var CURRENT_VERSION = 4;
  function defaultPrefs() { return { email: 'daily', push: true, digestHour: 6 }; }
  // Forward-migrate an older saved state so testers don't lose their data on upgrades.
  function migrate(s) {
    if (!Array.isArray(s.notes)) s.notes = [];
    if (!s.notificationPrefs || typeof s.notificationPrefs !== 'object') s.notificationPrefs = {};
    (s.users || []).forEach(function (u) { if (!s.notificationPrefs[u.id]) s.notificationPrefs[u.id] = defaultPrefs(); });
    if (!Array.isArray(s.rentAssignments)) s.rentAssignments = [];
    if (!Array.isArray(s.rentCharges)) s.rentCharges = [];
    s.version = CURRENT_VERSION;
    return s;
  }
  function init() {
    var s = null;
    try { var raw = localStorage.getItem(STORAGE_KEY); s = raw ? JSON.parse(raw) : null; } catch (e) { s = null; }
    if (!s || !Array.isArray(s.users) || !s.users.length) { state = seed(); save(); return; }
    state = migrate(s);
    save();
  }
  function reset() { state = seed(); save(); }

  /* ---------------- users / roles ---------------- */
  function users() { return state.users; }
  function userById(id) { for (var i = 0; i < state.users.length; i++) if (state.users[i].id === id) return state.users[i]; return null; }
  function currentUser() { return userById(state.currentUserId) || state.users[0]; }
  function setCurrentUser(id) { state.currentUserId = id; save(); }
  function userName(id) { var u = userById(id); return u ? u.name : 'Unassigned'; }
  function canCreateProject(user) { user = user || currentUser(); return user.role === 'admin' || user.role === 'manager'; }
  // Managers/admins create and edit work definitions (chores, assets, maintenance,
  // project tasks); workers complete them and log readings/notes.
  function isManager(user) { return canCreateProject(user); }

  function logActivity(text) {
    state.activity.unshift({ id: uid('act'), ts: Date.now(), userId: state.currentUserId, text: text });
    state.activity = state.activity.slice(0, 100);
  }

  /* ---------------- chores ---------------- */
  function listChores() {
    return state.chores.slice().sort(function (a, b) { return a.nextDue < b.nextDue ? -1 : 1; });
  }
  function choreById(id) { return state.chores.filter(function (c) { return c.id === id; })[0] || null; }
  function addChore(data) {
    if (!isManager()) return { error: 'Only managers and admins can add chores.' };
    var chore = {
      id: uid('c'), name: data.name, schedule: data.schedule,
      catchUp: data.catchUp || 'skipToNext',
      assignedTo: data.assignedTo || null,
      nextDue: data.nextDue || todayISO(),
      requirePhoto: !!data.requirePhoto,
      open: !!data.open
    };
    state.chores.push(chore);
    logActivity('added chore "' + chore.name + '"');
    save();
    return { chore: chore };
  }
  function updateChore(id, data) {
    if (!isManager()) return { error: 'Only managers and admins can edit chores.' };
    var chore = choreById(id); if (!chore) return { error: 'No such chore.' };
    if (data.name != null && String(data.name).trim()) chore.name = String(data.name).trim();
    if (data.schedule) chore.schedule = data.schedule;
    if (data.catchUp) chore.catchUp = data.catchUp;
    chore.assignedTo = data.assignedTo || null;
    if (data.nextDue) chore.nextDue = data.nextDue;
    chore.requirePhoto = !!data.requirePhoto;
    chore.open = !!data.open;
    logActivity('edited chore "' + chore.name + '"');
    save();
    return { chore: chore };
  }
  function choreCompletionsFor(choreId) {
    return state.choreCompletions.filter(function (c) { return c.choreId === choreId; })
      .sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  }
  // Consecutive-day streak (meaningful for daily chores): counts back from
  // today (or yesterday, so an as-yet-undone today doesn't break the run).
  function choreStreak(choreId) {
    var days = {};
    state.choreCompletions.forEach(function (c) { if (c.choreId === choreId) days[c.date] = true; });
    var d = todayISO();
    if (!days[d]) d = addDays(d, -1);
    var streak = 0;
    while (days[d]) { streak++; d = addDays(d, -1); }
    return streak;
  }
  function completeChore(id, notes, photo) {
    var chore = choreById(id);
    if (!chore) return { error: 'No such chore.' };
    if (chore.requirePhoto && !photo) return { error: 'This chore requires a photo to complete.' };
    var today = todayISO();
    var prevDue = chore.nextDue;
    state.choreCompletions.push({ id: uid('cc'), choreId: id, completedBy: state.currentUserId, date: today, notes: notes || '', photo: photo || null });
    if (chore.catchUp === 'mustCatchUp') {
      chore.nextDue = nextOccurrenceAfter(chore.schedule, chore.nextDue);
    } else {
      chore.nextDue = nextOccurrenceAfter(chore.schedule, today);
    }
    if (!save()) { state.choreCompletions.pop(); chore.nextDue = prevDue; return { error: 'Storage is full — could not save the photo.' }; }
    logActivity('completed chore "' + chore.name + '"');
    save();
    return { ok: true };
  }
  function deleteChore(id) {
    if (!isManager()) return { error: 'Only managers and admins can delete chores.' };
    state.chores = state.chores.filter(function (c) { return c.id !== id; });
    state.choreCompletions = state.choreCompletions.filter(function (c) { return c.choreId !== id; });
    save();
    return { ok: true };
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
    if (!isManager()) return { error: 'Only managers and admins can add assets.' };
    var asset = { id: uid('a'), name: data.name, category: data.category || 'Equipment', meterUnit: data.meterUnit || null, notes: data.notes || '' };
    state.assets.push(asset);
    logActivity('added asset "' + asset.name + '"');
    save();
    return { asset: asset };
  }
  function updateAsset(id, data) {
    if (!isManager()) return { error: 'Only managers and admins can edit assets.' };
    var a = assetById(id); if (!a) return { error: 'No such asset.' };
    if (data.name != null && String(data.name).trim()) a.name = String(data.name).trim();
    if (data.category != null) a.category = data.category || 'Equipment';
    a.notes = data.notes || '';
    logActivity('edited asset "' + a.name + '"');
    save();
    return { asset: a };
  }
  function deleteAsset(id) {
    if (!isManager()) return { error: 'Only managers and admins can delete assets.' };
    var itemIds = state.maintenanceItems.filter(function (m) { return m.assetId === id; }).map(function (m) { return m.id; });
    state.maintenanceItems = state.maintenanceItems.filter(function (m) { return m.assetId !== id; });
    state.maintenanceLogs = state.maintenanceLogs.filter(function (l) { return itemIds.indexOf(l.itemId) === -1; });
    state.meterReadings = state.meterReadings.filter(function (r) { return r.assetId !== id; });
    state.assets = state.assets.filter(function (a) { return a.id !== id; });
    save();
    return { ok: true };
  }
  function latestReading(assetId) {
    var rs = state.meterReadings.filter(function (r) { return r.assetId === assetId; });
    if (!rs.length) return null;
    return rs.reduce(function (m, r) { return r.reading > m ? r.reading : m; }, rs[0].reading);
  }
  function readingsFor(assetId) {
    return state.meterReadings.filter(function (r) { return r.assetId === assetId; })
      .sort(function (a, b) { return a.date < b.date ? 1 : -1; });
  }
  function lastReadingDate(assetId) {
    var rs = readingsFor(assetId);
    return rs.length ? rs[0].date : null;
  }
  // Standalone reading entry (anyone) — keeps usage-based due dates honest
  // without requiring a service to be logged.
  function addReading(assetId, reading, date) {
    var a = assetById(assetId);
    if (!a || !a.meterUnit) return { error: 'This asset has no meter.' };
    var n = Number(reading);
    if (!isFinite(n) || n < 0) return { error: 'Enter a valid reading.' };
    var prev = latestReading(assetId);
    if (prev != null && n < prev) return { error: 'Reading is below the latest (' + prev + ' ' + a.meterUnit + ').' };
    state.meterReadings.push({ id: uid('mr'), assetId: assetId, reading: n, userId: state.currentUserId, date: date || todayISO() });
    logActivity('logged ' + n + ' ' + a.meterUnit + ' on ' + a.name);
    save();
    return { ok: true };
  }
  function listMaintenance() { return state.maintenanceItems.slice(); }
  function maintenanceForAsset(assetId) { return state.maintenanceItems.filter(function (m) { return m.assetId === assetId; }); }
  function addMaintenance(data) {
    if (!isManager()) return { error: 'Only managers and admins can add maintenance items.' };
    var today = todayISO();
    var item = {
      id: uid('m'), assetId: data.assetId, name: data.name,
      intervalType: data.intervalType, intervalValue: Number(data.intervalValue),
      intervalUnit: data.intervalUnit || 'months',
      lastDoneDate: today, lastDoneReading: null, dueAtReading: null, nextDueDate: null,
      requirePhoto: !!data.requirePhoto
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
    return { item: item };
  }
  function maintenanceById(id) { return state.maintenanceItems.filter(function (m) { return m.id === id; })[0] || null; }
  function updateMaintenance(id, data) {
    if (!isManager()) return { error: 'Only managers and admins can edit maintenance items.' };
    var item = maintenanceById(id); if (!item) return { error: 'No such item.' };
    if (data.name != null && String(data.name).trim()) item.name = String(data.name).trim();
    item.requirePhoto = !!data.requirePhoto;
    var v = Number(data.intervalValue);
    if (isFinite(v) && v > 0) item.intervalValue = v;
    if (item.intervalType === 'calendar') {
      if (data.intervalUnit) item.intervalUnit = data.intervalUnit;
      item.nextDueDate = item.intervalUnit === 'days'
        ? addDays(item.lastDoneDate, item.intervalValue)
        : addMonths(item.lastDoneDate, item.intervalValue);
    } else {
      item.dueAtReading = (item.lastDoneReading || 0) + item.intervalValue;
    }
    logActivity('edited maintenance "' + item.name + '"');
    save();
    return { item: item };
  }
  function deleteMaintenance(id) {
    if (!isManager()) return { error: 'Only managers and admins can delete maintenance items.' };
    state.maintenanceItems = state.maintenanceItems.filter(function (m) { return m.id !== id; });
    state.maintenanceLogs = state.maintenanceLogs.filter(function (l) { return l.itemId !== id; });
    save();
    return { ok: true };
  }
  function itemCostTotal(itemId) {
    return state.maintenanceLogs.reduce(function (sum, l) { return l.itemId === itemId ? sum + (l.cost || 0) : sum; }, 0);
  }
  function assetCostTotal(assetId) {
    var ids = state.maintenanceItems.filter(function (m) { return m.assetId === assetId; }).map(function (m) { return m.id; });
    return state.maintenanceLogs.reduce(function (sum, l) { return ids.indexOf(l.itemId) !== -1 ? sum + (l.cost || 0) : sum; }, 0);
  }
  function logService(itemId, data) {
    var item = state.maintenanceItems.filter(function (m) { return m.id === itemId; })[0];
    if (!item) return { error: 'No such item.' };
    if (item.requirePhoto && !data.photo) return { error: 'This item requires a photo of the completed work.' };
    var date = data.date || todayISO();
    var reading = (data.reading === '' || data.reading == null) ? null : Number(data.reading);
    state.maintenanceLogs.push({ id: uid('ml'), itemId: itemId, userId: state.currentUserId, date: date, reading: reading, notes: data.notes || '', cost: data.cost ? Number(data.cost) : 0, photo: data.photo || null });
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
    if (!save()) return { error: 'Storage is full — could not save.' };
    return { ok: true };
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
  function updateProject(id, data) {
    if (!canCreateProject()) return { error: 'Only managers and admins can edit projects.' };
    var p = getProject(id); if (!p) return { error: 'No such project.' };
    if (data.name != null && String(data.name).trim()) p.name = String(data.name).trim();
    p.description = data.description || '';
    p.targetDate = data.targetDate || null;
    logActivity('edited project "' + p.name + '"');
    save();
    return { project: p };
  }
  function updateProjectStatus(id, status) {
    if (!canCreateProject()) return { error: 'Only managers and admins can change status.' };
    var p = getProject(id); if (!p) return;
    p.status = status; save();
  }
  function deleteProject(id) {
    if (!canCreateProject()) return { error: 'Only managers and admins can delete projects.' };
    state.projects = state.projects.filter(function (p) { return p.id !== id; });
    state.projectTasks = state.projectTasks.filter(function (t) { return t.projectId !== id; });
    state.notes = state.notes.filter(function (n) { return !(n.parentType === 'project' && n.parentId === id); });
    save();
  }
  function addTask(projectId, data) {
    if (!canCreateProject()) return { error: 'Only managers and admins can add tasks.' };
    var existing = projectTasks(projectId);
    var task = {
      id: uid('t'), projectId: projectId, title: data.title, description: data.description || '',
      assignedTo: data.assignedTo || null, dueDate: data.dueDate || null,
      done: false, doneBy: null, doneAt: null, sort: existing.length,
      requirePhoto: !!data.requirePhoto, open: !!data.open
    };
    state.projectTasks.push(task);
    save();
    return { task: task };
  }
  function addTasksBulk(projectId, items) {
    if (!canCreateProject()) return { error: 'Only managers and admins can add tasks.' };
    var existing = projectTasks(projectId).length;
    items.forEach(function (it, i) {
      state.projectTasks.push({
        id: uid('t'), projectId: projectId, title: it.title, description: it.description || '',
        assignedTo: null, dueDate: null, done: false, doneBy: null, doneAt: null, sort: existing + i
      });
    });
    logActivity('added ' + items.length + ' suggested step(s) to a project');
    save();
    return { ok: true };
  }
  function toggleTask(taskId, photo) {
    var t = state.projectTasks.filter(function (x) { return x.id === taskId; })[0];
    if (!t) return { error: 'No such task.' };
    if (!t.done && t.requirePhoto && !photo) return { error: 'This task requires a photo to complete.' };
    t.done = !t.done;
    t.doneBy = t.done ? state.currentUserId : null;
    t.doneAt = t.done ? todayISO() : null;
    t.donePhoto = t.done ? (photo || null) : null;
    save();
    return { ok: true, task: t };
  }
  function taskById(id) { return state.projectTasks.filter(function (t) { return t.id === id; })[0] || null; }
  function updateTask(taskId, data) {
    if (!isManager()) return { error: 'Only managers and admins can edit tasks.' };
    var t = taskById(taskId); if (!t) return { error: 'No such task.' };
    if (data.title != null && String(data.title).trim()) t.title = String(data.title).trim();
    t.description = data.description || '';
    t.assignedTo = data.assignedTo || null;
    t.dueDate = data.dueDate || null;
    t.requirePhoto = !!data.requirePhoto;
    t.open = !!data.open;
    save();
    return { task: t };
  }
  // Claiming: an "open" item with no assignee can be accepted by any worker.
  function claimableChore(c) { return !!c.open && !c.assignedTo; }
  function claimableTask(t) { return !!t.open && !t.assignedTo && !t.done; }
  function claimItem(kind, id) {
    var me = state.currentUserId;
    if (kind === 'chore') {
      var c = choreById(id); if (!c) return { error: 'No such chore.' };
      if (!claimableChore(c)) return { error: 'This chore is not open to claim.' };
      c.assignedTo = me; logActivity('claimed chore "' + c.name + '"'); save();
      return { ok: true };
    }
    if (kind === 'task') {
      var t = taskById(id); if (!t) return { error: 'No such task.' };
      if (!claimableTask(t)) return { error: 'This task is not open to claim.' };
      t.assignedTo = me; logActivity('claimed task "' + t.title + '"'); save();
      return { ok: true };
    }
    return { error: 'Unknown item.' };
  }
  function releaseItem(kind, id) {
    var me = state.currentUserId;
    var owner, obj;
    if (kind === 'chore') { obj = choreById(id); owner = obj && obj.assignedTo; }
    else if (kind === 'task') { obj = taskById(id); owner = obj && obj.assignedTo; }
    else return { error: 'Unknown item.' };
    if (!obj) return { error: 'Not found.' };
    if (!obj.open) return { error: 'This item is not an open item.' };
    if (owner !== me && !isManager()) return { error: 'Only the current owner or a manager can release it.' };
    obj.assignedTo = null; save();
    return { ok: true };
  }
  // Claimable work across chores and project tasks, for the "up for grabs" section.
  function openItems() {
    var list = [];
    listChores().forEach(function (c) {
      if (!claimableChore(c)) return;
      var due = bucketForDate(c.nextDue);
      list.push({ kind: 'chore', id: c.id, title: c.name,
        subtitle: describeSchedule(c.schedule) + (due !== 'later' ? ' · due ' + relativeLabel(c.nextDue) : ''),
        bucket: due, sortKey: c.nextDue });
    });
    state.projectTasks.forEach(function (t) {
      if (!claimableTask(t)) return;
      var proj = getProject(t.projectId);
      list.push({ kind: 'task', id: t.id, title: t.title,
        subtitle: (proj ? proj.name : 'Project') + (t.dueDate ? ' · due ' + relativeLabel(t.dueDate) : ''),
        bucket: t.dueDate ? bucketForDate(t.dueDate) : 'later', sortKey: t.dueDate || '9999-99-99' });
    });
    list.sort(function (a, b) { return a.sortKey < b.sortKey ? -1 : 1; });
    return list;
  }
  function deleteTask(taskId) {
    if (!isManager()) return { error: 'Only managers and admins can delete tasks.' };
    state.projectTasks = state.projectTasks.filter(function (t) { return t.id !== taskId; });
    save();
    return { ok: true };
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

  /* ---------------- proof photos ---------------- */
  function proofPhoto(kind, id) {
    if (kind === 'chore') { var c = state.choreCompletions.filter(function (x) { return x.id === id; })[0]; return c ? c.photo : null; }
    if (kind === 'service') { var l = state.maintenanceLogs.filter(function (x) { return x.id === id; })[0]; return l ? l.photo : null; }
    if (kind === 'task') { var t = taskById(id); return t ? t.donePhoto : null; }
    return null;
  }

  /* ---------------- rent ---------------- */
  function rentAssignmentFor(userId) {
    return state.rentAssignments.filter(function (a) { return a.userId === userId; })[0] || null;
  }
  function setRent(userId, amount, dueDay) {
    if (!isManager()) return { error: 'Only managers and admins can assign rent.' };
    var amt = Number(amount);
    var day = Math.min(28, Math.max(1, Number(dueDay) || 1));
    if (!isFinite(amt) || amt <= 0) return { error: 'Enter a valid monthly amount.' };
    if (!userById(userId)) return { error: 'No such person.' };
    var a = rentAssignmentFor(userId);
    if (a) { a.amount = amt; a.dueDay = day; a.active = true; }
    else state.rentAssignments.push({ userId: userId, amount: amt, dueDay: day, active: true });
    // Keep this month's still-unpaid charge in sync with the new terms.
    var mk = currentMonthKey();
    var ch = state.rentCharges.filter(function (c) { return c.userId === userId && c.month === mk; })[0];
    if (ch && ch.status === 'unpaid') { ch.amount = amt; ch.dueDate = mk + '-' + pad2(day); }
    logActivity('set rent for ' + userName(userId) + ' to $' + amt + '/mo');
    save();
    return { ok: true };
  }
  function stopRent(userId) {
    if (!isManager()) return { error: 'Only managers and admins can stop rent.' };
    var a = rentAssignmentFor(userId);
    if (a) a.active = false;
    var mk = currentMonthKey();
    state.rentCharges = state.rentCharges.filter(function (c) {
      return !(c.userId === userId && c.month === mk && c.status === 'unpaid');
    });
    logActivity('stopped rent for ' + userName(userId));
    save();
    return { ok: true };
  }
  // Lazily create this month's charge for every active assignment.
  function ensureRentCharges() {
    var mk = currentMonthKey();
    var changed = false;
    state.rentAssignments.forEach(function (a) {
      if (!a.active) return;
      var exists = state.rentCharges.some(function (c) { return c.userId === a.userId && c.month === mk; });
      if (!exists) {
        state.rentCharges.push({
          id: uid('rc'), userId: a.userId, month: mk, amount: a.amount,
          dueDate: mk + '-' + pad2(a.dueDay), status: 'unpaid',
          markedAt: null, markedBy: null, verifiedAt: null, verifiedBy: null, note: ''
        });
        changed = true;
      }
    });
    if (changed) save();
  }
  function rentChargesForMonth(mk) {
    ensureRentCharges();
    return state.rentCharges.filter(function (c) { return c.month === mk; })
      .sort(function (a, b) { return userName(a.userId) < userName(b.userId) ? -1 : 1; });
  }
  function rentChargeById(id) { return state.rentCharges.filter(function (c) { return c.id === id; })[0] || null; }
  function rentHistoryFor(userId) {
    return state.rentCharges.filter(function (c) { return c.userId === userId; })
      .sort(function (a, b) { return a.month < b.month ? 1 : -1; });
  }
  function markRentPaid(chargeId, note) {
    var c = rentChargeById(chargeId); if (!c) return { error: 'No such charge.' };
    if (c.userId !== state.currentUserId && !isManager()) return { error: 'Only ' + userName(c.userId) + ' or a manager can mark this paid.' };
    if (c.status === 'verified') return { error: 'Already verified.' };
    c.status = 'marked';
    c.markedAt = todayISO();
    c.markedBy = state.currentUserId;
    if (note != null) c.note = note;
    logActivity('marked rent paid for ' + userName(c.userId) + ' (' + monthLabel(c.month) + ')');
    save();
    return { ok: true };
  }
  function verifyRent(chargeId) {
    if (!isManager()) return { error: 'Only managers and admins can verify rent.' };
    var c = rentChargeById(chargeId); if (!c) return { error: 'No such charge.' };
    if (c.status === 'verified') return { error: 'Already verified.' };
    if (c.status === 'unpaid') { c.markedAt = todayISO(); c.markedBy = state.currentUserId; }
    c.status = 'verified';
    c.verifiedAt = todayISO();
    c.verifiedBy = state.currentUserId;
    logActivity('verified rent from ' + userName(c.userId) + ' (' + monthLabel(c.month) + ')');
    save();
    return { ok: true };
  }
  function reopenRent(chargeId) {
    if (!isManager()) return { error: 'Only managers and admins can reopen a charge.' };
    var c = rentChargeById(chargeId); if (!c) return { error: 'No such charge.' };
    c.status = 'unpaid';
    c.markedAt = null; c.markedBy = null; c.verifiedAt = null; c.verifiedBy = null;
    logActivity('reopened rent charge for ' + userName(c.userId));
    save();
    return { ok: true };
  }
  function rentSummary(mk) {
    var charges = rentChargesForMonth(mk);
    var s = { count: charges.length, unpaid: 0, marked: 0, verified: 0, due: 0, collected: 0 };
    charges.forEach(function (c) {
      s.due += c.amount;
      if (c.status === 'verified') { s.verified++; s.collected += c.amount; }
      else if (c.status === 'marked') s.marked++;
      else s.unpaid++;
    });
    return s;
  }

  /* ---------------- team workload ---------------- */
  function userWorkload(userId) {
    var w = { choresOverdue: 0, choresToday: 0, choresUpcoming: 0, tasksOpen: 0, tasksOverdue: 0 };
    state.chores.forEach(function (c) {
      if (c.assignedTo !== userId) return;
      var b = bucketForDate(c.nextDue);
      if (b === 'overdue') w.choresOverdue++;
      else if (b === 'today') w.choresToday++;
      else if (b === 'upcoming') w.choresUpcoming++;
    });
    state.projectTasks.forEach(function (t) {
      if (t.done || t.assignedTo !== userId) return;
      w.tasksOpen++;
      if (t.dueDate && bucketForDate(t.dueDate) === 'overdue') w.tasksOverdue++;
    });
    return w;
  }

  /* ---------------- leaderboard ---------------- */
  // Personal "days active" streak: consecutive days (ending today or yesterday)
  // on which the user completed at least one chore.
  function userStreak(userId) {
    var days = {};
    state.choreCompletions.forEach(function (c) { if (c.completedBy === userId) days[c.date] = true; });
    var d = todayISO();
    if (!days[d]) d = addDays(d, -1);
    var streak = 0;
    while (days[d]) { streak++; d = addDays(d, -1); }
    return streak;
  }
  function inWindow(date, win) {
    if (win === 'all') return true;
    return !!date && date.slice(0, 7) === currentMonthKey();
  }
  // Points: chore +2, task +5, service +4; a verifying photo adds a bonus.
  var PTS = { chore: 2, task: 5, service: 4, chorePhoto: 1, taskPhoto: 2, servicePhoto: 2 };
  function leaderboard(win) {
    var stats = {};
    function ensure(id) {
      if (!stats[id]) stats[id] = { userId: id, points: 0, chores: 0, tasks: 0, services: 0, verified: 0 };
      return stats[id];
    }
    state.users.forEach(function (u) { ensure(u.id); });
    state.choreCompletions.forEach(function (c) {
      if (!userById(c.completedBy) || !inWindow(c.date, win)) return;
      var s = ensure(c.completedBy);
      s.chores++; s.points += PTS.chore;
      if (c.photo) { s.points += PTS.chorePhoto; s.verified++; }
    });
    state.projectTasks.forEach(function (t) {
      if (!t.done || !t.doneBy || !userById(t.doneBy) || !inWindow(t.doneAt, win)) return;
      var s = ensure(t.doneBy);
      s.tasks++; s.points += PTS.task;
      if (t.donePhoto) { s.points += PTS.taskPhoto; s.verified++; }
    });
    state.maintenanceLogs.forEach(function (l) {
      if (!userById(l.userId) || !inWindow(l.date, win)) return;
      var s = ensure(l.userId);
      s.services++; s.points += PTS.service;
      if (l.photo) { s.points += PTS.servicePhoto; s.verified++; }
    });
    var arr = Object.keys(stats).map(function (k) {
      var s = stats[k];
      s.name = userName(k);
      s.role = (userById(k) || {}).role || '';
      s.streak = userStreak(k);
      s.total = s.chores + s.tasks + s.services;
      return s;
    });
    arr.sort(function (a, b) {
      if (b.points !== a.points) return b.points - a.points;
      if (b.total !== a.total) return b.total - a.total;
      return a.name < b.name ? -1 : 1;
    });
    var rank = 0, prev = null;
    arr.forEach(function (s, i) { if (s.points !== prev) { rank = i + 1; prev = s.points; } s.rank = rank; });
    return arr;
  }
  function userPoints(userId, win) {
    var row = leaderboard(win).filter(function (r) { return r.userId === userId; })[0];
    return row ? row.points : 0;
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

    rentChargesForMonth(currentMonthKey()).forEach(function (c) {
      if (c.status === 'verified') return;
      if (scope === 'mine' && (c.userId !== me || c.status === 'marked')) return;
      var b = bucketForDate(c.dueDate);
      if (b === 'later') return;
      push({
        kind: 'rent', id: c.id, title: 'Rent · $' + c.amount,
        subtitle: userName(c.userId) + ' · ' + (c.status === 'marked' ? 'awaiting verification' : 'unpaid'),
        dueDate: c.dueDate, sortKey: c.dueDate, bucket: b,
        action: 'open-rent-charge', actionLabel: c.status === 'marked' ? 'Review' : 'Pay'
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

  /* ---------------- notes & photos ---------------- */
  function notesFor(parentType, parentId) {
    return state.notes.filter(function (n) { return n.parentType === parentType && n.parentId === parentId; })
      .sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
  }
  function noteById(id) { return state.notes.filter(function (n) { return n.id === id; })[0] || null; }
  function addNote(parentType, parentId, data) {
    var note = {
      id: uid('n'), parentType: parentType, parentId: parentId, userId: state.currentUserId,
      date: todayISO(), ts: Date.now(), body: data.body || '', photo: data.photo || null
    };
    state.notes.unshift(note);
    // Photos can blow the localStorage quota — roll back if the write fails.
    if (!save()) { state.notes.shift(); return { error: 'Storage is full — use a smaller photo or remove old notes.' }; }
    logActivity('added a progress note');
    save();
    return { note: note };
  }
  function deleteNote(id) { state.notes = state.notes.filter(function (n) { return n.id !== id; }); save(); }

  /* ---------------- user management (admin) ---------------- */
  function canManageUsers(user) { user = user || currentUser(); return user.role === 'admin'; }
  function adminCount() { return state.users.filter(function (u) { return u.role === 'admin'; }).length; }
  function addUser(data) {
    if (!canManageUsers()) return { error: 'Only admins can manage users.' };
    var name = (data.name || '').trim();
    if (!name) return { error: 'Name is required.' };
    var u = { id: uid('u'), name: name, role: data.role || 'worker' };
    state.users.push(u);
    state.notificationPrefs[u.id] = defaultPrefs();
    logActivity('added user "' + u.name + '"');
    save();
    return { user: u };
  }
  function updateUserRole(id, role) {
    if (!canManageUsers()) return { error: 'Only admins can manage users.' };
    var u = userById(id); if (!u) return { error: 'No such user.' };
    if (u.role === 'admin' && role !== 'admin' && adminCount() <= 1) return { error: 'There must be at least one admin.' };
    u.role = role; save(); return { user: u };
  }
  function removeUser(id) {
    if (!canManageUsers()) return { error: 'Only admins can manage users.' };
    var u = userById(id); if (!u) return { error: 'No such user.' };
    if (id === state.currentUserId) return { error: 'Switch to another user before removing this one.' };
    if (u.role === 'admin' && adminCount() <= 1) return { error: 'Cannot remove the last admin.' };
    state.users = state.users.filter(function (x) { return x.id !== id; });
    delete state.notificationPrefs[id];
    logActivity('removed user "' + u.name + '"');
    save(); return { ok: true };
  }

  /* ---------------- notification preferences ---------------- */
  function getPrefs(userId) { return state.notificationPrefs[userId] || defaultPrefs(); }
  function setPrefs(userId, prefs) {
    state.notificationPrefs[userId] = { email: prefs.email || 'off', push: !!prefs.push, digestHour: Number(prefs.digestHour) || 0 };
    save();
  }

  /* ---------------- backup / restore ---------------- */
  function exportState() { return JSON.stringify(state, null, 2); }
  function importState(json) {
    var s;
    try { s = JSON.parse(json); } catch (e) { return { error: 'Could not read that file (invalid JSON).' }; }
    if (!s || !Array.isArray(s.users) || !Array.isArray(s.chores)) return { error: 'That does not look like a Farm Tracker backup.' };
    state = migrate(s);
    if (!save()) return { error: 'Storage is full — cannot import.' };
    return { ok: true };
  }

  /* ---------------- exports ---------------- */
  window.Store = {
    init: init, reset: reset, save: save,
    // dates
    todayISO: todayISO, fmtDate: fmtDate, relativeLabel: relativeLabel, addDays: addDays, diffDays: diffDays,
    // users & roles
    users: users, userById: userById, userName: userName, currentUser: currentUser,
    setCurrentUser: setCurrentUser, canCreateProject: canCreateProject, isManager: isManager, canManageUsers: canManageUsers,
    addUser: addUser, updateUserRole: updateUserRole, removeUser: removeUser,
    // notification prefs & backup
    getPrefs: getPrefs, setPrefs: setPrefs, exportState: exportState, importState: importState,
    // chores
    listChores: listChores, choreById: choreById, addChore: addChore, updateChore: updateChore,
    completeChore: completeChore, deleteChore: deleteChore,
    choreCompletionsFor: choreCompletionsFor, choreStreak: choreStreak,
    describeSchedule: describeSchedule, bucketForDate: bucketForDate,
    // assets & maintenance
    listAssets: listAssets, assetById: assetById, addAsset: addAsset, updateAsset: updateAsset, deleteAsset: deleteAsset,
    latestReading: latestReading, readingsFor: readingsFor, lastReadingDate: lastReadingDate, addReading: addReading,
    listMaintenance: listMaintenance, maintenanceById: maintenanceById, maintenanceForAsset: maintenanceForAsset,
    addMaintenance: addMaintenance, updateMaintenance: updateMaintenance, deleteMaintenance: deleteMaintenance,
    logService: logService, maintenanceLogsFor: maintenanceLogsFor, maintenanceStatus: maintenanceStatus,
    itemCostTotal: itemCostTotal, assetCostTotal: assetCostTotal,
    // projects
    STATUS_LABELS: STATUS_LABELS, listProjects: listProjects, getProject: getProject, projectTasks: projectTasks,
    addProject: addProject, updateProject: updateProject, updateProjectStatus: updateProjectStatus, deleteProject: deleteProject,
    addTask: addTask, addTasksBulk: addTasksBulk, toggleTask: toggleTask,
    taskById: taskById, updateTask: updateTask, deleteTask: deleteTask, suggestSteps: suggestSteps,
    // open / claimable work
    claimItem: claimItem, releaseItem: releaseItem, openItems: openItems,
    // leaderboard
    leaderboard: leaderboard, userPoints: userPoints, userStreak: userStreak,
    // notes & photos
    notesFor: notesFor, noteById: noteById, addNote: addNote, deleteNote: deleteNote, proofPhoto: proofPhoto,
    // rent
    currentMonthKey: currentMonthKey, monthLabel: monthLabel,
    rentAssignmentFor: rentAssignmentFor, setRent: setRent, stopRent: stopRent,
    rentChargesForMonth: rentChargesForMonth, rentChargeById: rentChargeById, rentHistoryFor: rentHistoryFor,
    markRentPaid: markRentPaid, verifyRent: verifyRent, reopenRent: reopenRent, rentSummary: rentSummary,
    // dashboard / activity
    dashboard: dashboard, counts: counts, listActivity: listActivity, userWorkload: userWorkload
  };
})();
