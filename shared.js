'use strict';
// Only the employee list is shared; printing choices remain personal.
const sharedEndpoint = window.WMS_SHARED_EMPLOYEES_URL || '';
const importBackupKey = 'wms-timesheet-printer-import-v1';
const existingBrowserNames = (() => {
  try {
    const backup = JSON.parse(localStorage.getItem(importBackupKey));
    if (Array.isArray(backup) && backup.length && backup.every(n => typeof n === 'string' && n.trim())) return backup;
    localStorage.setItem(importBackupKey, JSON.stringify(state.names));
  } catch {}
  return [...state.names];
})();
let sharedReady = false;
let sharedRevision = 0;
let editorRevision = 0;
let savingShared = false;
let loadingShared = null;
const localJobs = jobs;
jobs = () => sharedReady ? localJobs() : [];
const localRender = render;
render = function () { localRender(); $('print').disabled = !sharedReady || !jobs().length; };
state.names = []; state.selected = [];
renderEmployees(); render();
function sharedMessage(message) { $('sharedStatus').textContent = message; }
async function employeeRequest(method, body) {
  if (!sharedEndpoint) throw new Error('Shared saving has not been connected yet.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(sharedEndpoint, { method, cache: 'no-store', signal: controller.signal,
      headers: body ? {'Content-Type': 'application/json'} : {},
      ...(body ? {body: JSON.stringify(body)} : {}) });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error || 'Unable to connect to the shared list.');
      error.status = response.status; error.data = data; throw error;
    }
    if (!Number.isInteger(data.revision) || data.revision < 0 || !Array.isArray(data.names) ||
        data.names.length > 250 || data.names.some(n => typeof n !== 'string' || !n.trim() || n.length > 100)) {
      throw new Error('The shared list could not be read.');
    }
    return data;
  } finally { clearTimeout(timeout); }
}
function applyShared(data) {
  const previous = new Set(state.names);
  const selected = new Set(state.selected);
  const firstLoad = !sharedReady;
  state.names = data.names;
  state.selected = data.names.filter(name => firstLoad ? existingBrowserNames.includes(name) ?
    existingSelections.includes(name) : true : selected.has(name) || !previous.has(name));
  sharedRevision = data.revision;
  sharedReady = data.revision > 0 && data.names.length > 0;
  page = 0; renderEmployees(); save(); render();
  sharedMessage(sharedReady ? 'Shared employee list is up to date.' :
    `No shared list has been published yet. Use Edit list to publish your saved ${existingBrowserNames.length} names for everyone.`);
}
const existingSelections = (() => {
  try { const saved = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(saved?.selected) ? saved.selected : existingBrowserNames; }
  catch { return existingBrowserNames; }
})();
function loadShared() {
  if (loadingShared) return loadingShared;
  loadingShared = (async () => {
    try {
      const data = await employeeRequest('GET');
      if (!sharedReady || data.revision !== sharedRevision) applyShared(data);
      else sharedMessage('Shared employee list is up to date.');
      return data;
    } catch (error) {
      sharedMessage(sharedReady ? 'Cannot check for updates. The last shared list is shown. Try again when connected.' :
        'Cannot load the shared employee list. Check your connection and try again.');
      throw error;
    } finally { loadingShared = null; }
  })();
  return loadingShared;
}
$('manage').onclick = () => {
  editorRevision = sharedRevision;
  $('names').value = (sharedReady ? state.names : existingBrowserNames).join('\n');
  $('editError').textContent = '';
  $('editor').showModal();
};
$('editForm').onsubmit = async event => {
  event.preventDefault();
  if (savingShared) return;
  const names = $('names').value.split(/\r?\n/).map(n => n.trim()).filter(Boolean);
  if (!names.length || names.length > 250 || names.some(n => n.length > 100)) {
    $('editError').textContent = 'Enter 1–250 names, each no longer than 100 characters.'; return;
  }
  if (new Set(names.map(n => n.toLowerCase())).size !== names.length) {
    $('editError').textContent = 'Each name must be unique. Please remove duplicates.'; return;
  }
  savingShared = true;
  const button = $('editForm').querySelector('[type="submit"]');
  button.disabled = true; $('cancel').disabled = true;
  $('editError').textContent = 'Saving the list for everyone…';
  try {
    const data = await employeeRequest('PUT', {names, revision: editorRevision});
    applyShared(data); $('editor').close();
    sharedMessage('Employee list saved for everyone. Other open screens update within 15 seconds.');
  } catch (error) {
    if (error.status === 409) {
      try {
        const latest = await loadShared();
        editorRevision = latest.revision;
        $('editError').textContent = 'Someone else changed the list. Your draft is still here. Close this window to review the latest list, or save again to replace it with your draft.';
      } catch { $('editError').textContent = 'The list changed elsewhere. Your draft is kept. Reconnect and reopen Edit list before saving.'; }
    } else { $('editError').textContent = 'Could not save the shared list. Your draft is kept. Check your connection and try again.'; }
  } finally { savingShared = false; button.disabled = false; $('cancel').disabled = false; }
};
$('retryShared').onclick = () => loadShared().catch(() => {});
loadShared().catch(() => {});
setInterval(() => { if (!document.hidden && !$('editor').open && !savingShared) loadShared().catch(() => {}); }, 15000);
window.addEventListener('focus', () => { if (!$('editor').open && !savingShared) loadShared().catch(() => {}); });

