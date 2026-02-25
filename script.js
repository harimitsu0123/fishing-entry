const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwKGvpC2o--sb7nmiLl-6fEaJlVaKbXqRjB7tGe8LU1UBUETWuVI63S23MDK2WSm3og/exec";

// State Management
let state = {
    entries: [],
    settings: {
        competitionName: "第1回 釣り大会",
        capacityGeneral: 100,
        capacityMintsuri: 100,
        capacitySuiho: 50,
        capacityHarimitsu: 50,
        capacityObservers: 100,
        startTime: "",
        deadline: "",
        adminPassword: "admin"
    },
    lastUpdated: 0 // Unix timestamp for sync merging
};

let isAdminAuth = sessionStorage.getItem('isAdminAuth') === 'true'; // Persistent session
let currentViewId = sessionStorage.getItem('currentViewId') || 'registration-view'; // Persistent view
let currentAdminTab = sessionStorage.getItem('currentAdminTab') || 'tab-list'; // Persistent tab
let dashboardFilter = 'all';
let currentReceptionId = null;
let isAdminAuthAction = false; // Flag for admin-led edits
let activeReceptionEntryId = null; // Currently selected in reception desk

// Age labels map
const ageLabels = {
    "10s": "10代以下", "20s": "20代", "30s": "30代", "40s": "40代",
    "50s": "50代", "60s": "60代", "70s": "70代", "80s": "80代以上"
};

/// Admin Registration Helper
window.startAdminRegistration = function (source) {
    resetForm();
    switchView(null, 'registration-view');

    // Add temp radio for this admin source
    const selector = document.getElementById('main-source-selector');
    const badgeClass = source === '水宝' ? 'badge-suiho' : 'badge-harimitsu';
    const label = document.createElement('label');
    label.className = 'source-option admin-only temp-option';
    label.innerHTML = `
        <input type="radio" name="reg-source" value="${source}" checked>
        <span class="source-label">
            <span class="badge ${badgeClass}">${source}</span>
            ${source}一括登録
        </span>
    `;
    selector.appendChild(label);

    // Smooth scroll to form start
    window.scrollTo({ top: 0, behavior: 'smooth' });
};
// Initialization
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    initApp();

    // If persistent login is true, reveal admin parts
    if (isAdminAuth) {
        document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
    }
});

async function loadData() {
    // 1. Try to load from Cloud (GAS) first for synchronization
    updateSyncStatus('syncing');
    try {
        const response = await fetch(`${GAS_WEB_APP_URL}?action=get`);
        if (response.ok) {
            const cloudData = await response.json();
            if (cloudData && cloudData.entries) {
                const localData = localStorage.getItem('fishing_app_v3_data');
                if (localData) {
                    const parsedLocal = JSON.parse(localData);
                    // Compare timestamps and counts for merging
                    const localTime = parsedLocal.lastUpdated || 0;
                    const cloudTime = cloudData.lastUpdated || 0;
                    const localCount = (parsedLocal.entries || []).length;
                    const cloudCount = (cloudData.entries || []).length;

                    // Priority: Newer time, or more entries if times match (e.g. 0 vs 0)
                    let useLocal = false;
                    if (localTime > cloudTime) {
                        useLocal = true;
                    } else if (localTime === cloudTime && localCount > cloudCount) {
                        useLocal = true;
                    }

                    if (useLocal) {
                        console.log('Local data is newer/larger. Syncing to cloud...');
                        state = parsedLocal;
                        syncToCloud(); // Push local to cloud
                    } else {
                        console.log('Cloud data is newer/loaded.');
                        state = cloudData;
                    }
                } else {
                    state = cloudData;
                }

                console.log('Cloud sync: data loaded');
                updateSyncStatus('success');
                finalizeLoad();
                return;
            }
        }
    } catch (e) {
        console.warn('Cloud load failed, falling back to local:', e);
        updateSyncStatus('error');
    }

    // 2. Fallback to LocalStorage
    const savedData = localStorage.getItem('fishing_app_v3_data');
    if (savedData) {
        state = JSON.parse(savedData);
    } else {
        // Migration from V2
        const oldData = localStorage.getItem('fishing_app_v2_data');
        if (oldData) {
            const parsedOld = JSON.parse(oldData);
            state.entries = parsedOld.entries.map(e => ({
                ...e,
                participants: e.participants.map(p => ({
                    ...p,
                    nickname: p.nickname || "",
                    status: p.status || 'pending'
                })),
                status: e.status || (e.checkedIn ? 'checked-in' : 'pending')
            }));
            state.settings = { ...state.settings, ...parsedOld.settings };
        }
    }
    finalizeLoad();
}

function finalizeLoad() {
    // Ensure settings are merged with defaults
    state.settings = {
        ...{
            competitionName: "第1回 釣り大会",
            capacityGeneral: 100,
            capacityMintsuri: 100,
            capacitySuiho: 50,
            capacityHarimitsu: 50,
            capacityObservers: 100,
            startTime: "",
            deadline: "",
            adminPassword: "admin"
        }, ...state.settings
    };

    checkTimeframe();
    updateDashboard();
    updateReceptionList();
    updateSourceAvailability();
    syncSettingsUI();
}

function saveData() {
    state.lastUpdated = Date.now(); // Update timestamp on every save
    localStorage.setItem('fishing_app_v3_data', JSON.stringify(state));
    // Also sync to cloud
    syncToCloud();
}

async function syncToCloud() {
    updateSyncStatus('syncing');
    try {
        const payload = {
            action: 'save',
            data: state
        };
        await fetch(GAS_WEB_APP_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload)
        });
        console.log('Cloud sync: data saved');
        updateSyncStatus('success');
    } catch (e) {
        console.error('Cloud sync error:', e);
        updateSyncStatus('error');
    }
}

function updateSyncStatus(type) {
    const badge = document.getElementById('sync-status');
    const text = badge.querySelector('.sync-text');
    const icon = badge.querySelector('.sync-icon');

    badge.classList.remove('hidden', 'syncing', 'success', 'error');

    if (type === 'syncing') {
        badge.classList.add('syncing');
        text.textContent = '同期中...';
        icon.textContent = '🔄';
    } else if (type === 'success') {
        badge.classList.add('success');
        text.textContent = '同期完了';
        icon.textContent = '✅';
        setTimeout(() => badge.classList.add('hidden'), 2000);
    } else if (type === 'error') {
        badge.classList.add('error');
        text.textContent = '同期失敗';
        icon.textContent = '⚠️';
    }
}

function initApp() {
    initToast(); // Add toast container helper if needed
    // Navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-target');
            const isSecure = btn.getAttribute('data-secure') === 'true';

            if (isSecure && !isAdminAuth) {
                showAdminLogin(target);
                return;
            }

            switchView(btn, target);
        });
    });

    // Restore and re-apply current Admin Tab if we are in admin mode
    if (isAdminAuth) {
        switchAdminTab(currentAdminTab);
    }

    // Restore Last View
    if (currentViewId !== 'registration-view') {
        const lastBtn = document.querySelector(`.nav-btn[data-target="${currentViewId}"]`);
        switchView(lastBtn, currentViewId);
    }

    // Form logic
    document.getElementById('add-participant').addEventListener('click', () => addParticipantRow());
    document.getElementById('btn-to-confirm').addEventListener('click', showConfirmation);
    document.getElementById('back-to-edit').addEventListener('click', hideConfirmation);
    document.getElementById('submit-registration').addEventListener('click', handleRegistration);
    document.getElementById('back-to-form').addEventListener('click', resetForm);
    document.getElementById('reset-data').addEventListener('click', confirmReset);

    // Auth logic
    document.getElementById('show-edit-login').addEventListener('click', () => {
        document.getElementById('registration-form').classList.add('hidden');
        document.getElementById('edit-auth-section').classList.remove('hidden');
    });
    document.getElementById('hide-edit-login').addEventListener('click', () => {
        document.getElementById('registration-form').classList.remove('hidden');
        document.getElementById('edit-auth-section').classList.add('hidden');
    });
    document.getElementById('verify-edit').addEventListener('click', handleEditAuth);
    document.getElementById('cancel-edit').addEventListener('click', resetForm);

    // Admin Auth Logic
    document.getElementById('verify-admin').addEventListener('click', handleAdminLogin);
    document.getElementById('cancel-admin').addEventListener('click', () => {
        document.getElementById('admin-auth-modal').classList.add('hidden');
    });

    // Export logic
    document.getElementById('export-csv').addEventListener('click', exportGroupsCSV);
    document.getElementById('export-participants-csv').addEventListener('click', exportParticipantsCSV);

    // Dashboard Search & Filters
    const dashSearch = document.getElementById('dashboard-search');
    if (dashSearch) {
        dashSearch.addEventListener('input', updateDashboard);
    }
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            dashboardFilter = btn.getAttribute('data-filter');
            updateDashboard();
        });
    });

    // Reception Modal Events (Removed modal refs, using View logic)
    // Reception View Events
    const recSearch = document.getElementById('reception-search');
    if (recSearch) {
        recSearch.addEventListener('input', updateReceptionList);
    }
    const recToggle = document.getElementById('show-completed-toggle');
    if (recToggle) {
        recToggle.addEventListener('change', updateReceptionList);
    }

    // Check timeframe periodically
    setInterval(checkTimeframe, 60000); // Check every minute

    // Admin Tabs
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            switchAdminTab(btn.getAttribute('data-tab'));
        });
    });

    // Bulk Email logic
    const btnSendBulk = document.getElementById('btn-send-bulk-mail');
    if (btnSendBulk) {
        btnSendBulk.addEventListener('click', handleBulkEmailSend);
    }
    updateBulkMailCount(); // Initial count

    // Admin Quota inputs live sum
    ['cap-ippan', 'cap-mintsuri', 'cap-suiho', 'cap-harimitsu'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateCapacityTotal);
    });

    // Hidden Admin Reveal in Footer
    const revealAdmin = document.getElementById('reveal-admin');
    if (revealAdmin) {
        revealAdmin.addEventListener('click', () => {
            const pw = prompt("管理者パスワードを入力してください");
            if (pw === state.settings.adminPassword || pw === 'admin') {
                isAdminAuth = true;
                document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
                showToast('✨ 管理者メニューを表示しました', 'success');
            } else if (pw !== null) {
                showToast('パスワードが違います', 'error');
            }
        });
    }
}

function switchView(btnElement, targetId) {
    currentViewId = targetId;
    sessionStorage.setItem('currentViewId', targetId);

    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

    // Always scroll to top when changing view
    window.scrollTo(0, 0);

    if (btnElement) btnElement.classList.add('active');
    else {
        const activeNav = document.querySelector(`.nav-btn[data-target="${targetId}"]`);
        if (activeNav) activeNav.classList.add('active');
    }

    document.getElementById(targetId).classList.add('active');

    // Reset Title based on view
    if (targetId === 'dashboard-view') {
        document.getElementById('app-title').textContent = "管理者ダッシュボード";
    } else if (targetId === 'reception-view') {
        document.getElementById('app-title').textContent = "当日受付管理";
    } else {
        document.getElementById('app-title').textContent = state.settings.competitionName;
    }

    if (targetId === 'registration-view') {
        resetForm();
        updateSourceAvailability();
    }
    if (targetId === 'dashboard-view') {
        updateDashboard();
        switchAdminTab(currentAdminTab); // Use stored tab instead of hardcoding 'tab-list'
    }
    if (targetId === 'reception-view') {
        updateReceptionList();
    }

    // Toggle admin visibility based on state
    const adminElements = document.querySelectorAll('.admin-only');
    adminElements.forEach(el => {
        if (isAdminAuth) el.classList.remove('hidden');
        else el.classList.add('hidden');
    });
}

function checkTimeframe() {
    const overlay = document.getElementById('timeframe-overlay');
    const title = document.getElementById('timeframe-title');
    const desc = document.getElementById('timeframe-desc');
    const now = new Date();

    if (state.settings.startTime && now < new Date(state.settings.startTime)) {
        title.textContent = "受付開始前です";
        desc.textContent = `${new Date(state.settings.startTime).toLocaleString('ja-JP')} から受付を開始します。`;
        overlay.classList.remove('hidden');
    } else if (state.settings.deadline && now > new Date(state.settings.deadline)) {
        title.textContent = "受付終了しました";
        desc.textContent = "本大会の受付は終了いたしました。";
        overlay.classList.remove('hidden');
    } else {
        overlay.classList.add('hidden');
    }
}

// Admin Auth
let pendingView = null;
function showAdminLogin(targetView) {
    pendingView = targetView;
    document.getElementById('global-admin-password').value = '';
    document.getElementById('admin-auth-error').classList.add('hidden');
    document.getElementById('admin-auth-modal').classList.remove('hidden');
}

function handleAdminLogin() {
    const pw = document.getElementById('global-admin-password').value.trim();
    if (pw === state.settings.adminPassword || pw === 'admin') {
        isAdminAuth = true;
        sessionStorage.setItem('isAdminAuth', 'true'); // Persist
        document.getElementById('admin-auth-modal').classList.add('hidden');

        // Reveal admin elements globally
        document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));

        if (pendingView) {
            switchView(null, pendingView);
            pendingView = null;
        }
    } else {
        document.getElementById('admin-auth-error').classList.remove('hidden');
    }
}

function syncSettingsUI() {
    // Only update if the user isn't currently typing in the field
    const updateIfInactive = (id, value) => {
        const el = document.getElementById(id);
        if (el && document.activeElement !== el) {
            el.value = value;
        }
    };

    updateIfInactive('competition-name', state.settings.competitionName);
    updateIfInactive('cap-ippan', state.settings.capacityGeneral);
    updateIfInactive('cap-mintsuri', state.settings.capacityMintsuri);
    updateIfInactive('cap-suiho', state.settings.capacitySuiho);
    updateIfInactive('cap-harimitsu', state.settings.capacityHarimitsu || 50);
    updateIfInactive('capacity-observers', state.settings.capacityObservers);
    updateIfInactive('registration-start', state.settings.startTime);
    updateIfInactive('registration-deadline', state.settings.deadline);
    updateIfInactive('admin-password-set', state.settings.adminPassword);

    document.getElementById('app-title').textContent = state.settings.competitionName;
    updateCapacityTotal();
}

// Participant Row Management
function addParticipantRow(data = null) {
    const list = document.getElementById('participant-list');
    const index = list.children.length;
    const row = document.createElement('div');
    row.className = 'participant-row';
    row.dataset.index = index;
    row.innerHTML = `
        <div class="form-group">
            <label>区分</label>
            <select class="p-type">
                <option value="fisher" ${data && data.type === 'fisher' ? 'selected' : ''}>釣り</option>
                <option value="observer" ${data && data.type === 'observer' ? 'selected' : ''}>見学</option>
            </select>
        </div>
        <div class="form-group">
            <label>氏名</label>
            <input type="text" class="p-name" required value="${data ? data.name : ''}" placeholder="参加者${index + 1}">
        </div>
        <div class="form-group">
            <label>ニックネーム <span class="text-muted">(任意)</span></label>
            <input type="text" class="p-nick" value="${data && data.nickname ? data.nickname : ''}" placeholder="無記名可">
        </div>
        <div class="form-group">
            <label>地域（市まで）</label>
            <input type="text" class="p-region" required value="${data ? data.region : ''}" placeholder="例：姫路市">
        </div>
        <div class="form-group">
            <label>年代</label>
            <select class="p-age">
                ${Object.entries(ageLabels).map(([val, label]) => `<option value="${val}" ${data && data.age === val ? 'selected' : ''}>${label}</option>`).join('')}
            </select>
        </div>
        <div class="row-actions">
            <button type="button" class="btn-icon remove-p">&times;</button>
        </div>
    `;
    list.appendChild(row);
    row.querySelector('.remove-p').addEventListener('click', () => {
        if (list.children.length > 1) {
            row.remove();
            updateRemoveButtons();
        }
    });
    updateRemoveButtons();
}

function updateRemoveButtons() {
    const rows = document.getElementById('participant-list').children;
    for (let row of rows) {
        row.querySelector('.remove-p').disabled = (rows.length <= 1);
    }
}

// Registration / Edit Logic
function showConfirmation() {
    checkTimeframe(); // Double check
    if (!document.getElementById('timeframe-overlay').classList.contains('hidden')) {
        return;
    }
    const editId = document.getElementById('edit-entry-id').value;
    const pRows = document.querySelectorAll('.participant-row');
    const participants = Array.from(pRows).map(row => ({
        type: row.querySelector('.p-type').value,
        name: row.querySelector('.p-name').value,
        nickname: row.querySelector('.p-nick').value,
        region: row.querySelector('.p-region').value,
        age: row.querySelector('.p-age').value
    }));

    // Basic Validation Check (HTML5 Native)
    if (!document.getElementById('registration-form').reportValidity()) {
        return;
    }

    const groupName = document.getElementById('group-name').value;
    const repName = document.getElementById('representative-name').value;
    const repPhone = document.getElementById('rep-phone').value;
    const repEmail = document.getElementById('rep-email').value;
    const repEmailConfirm = document.getElementById('rep-email-confirm').value;

    if (repEmail !== repEmailConfirm) {
        showStatus("メールアドレスが一致しません。もう一度ご確認ください。", "error");
        return;
    }

    const sourceEl = document.querySelector('input[name="reg-source"]:checked');
    const source = sourceEl ? sourceEl.value : '一般';

    const fisherCount = participants.filter(p => p.type === 'fisher').length;
    const observerCount = participants.filter(p => p.type === 'observer').length;

    // Category Capacity Check
    const currentCategoryFishers = state.entries
        .filter(en => en.id !== editId && en.source === source)
        .reduce((sum, en) => sum + en.fishers, 0);

    let capacityLimit = 0;
    if (source === '一般') capacityLimit = state.settings.capacityGeneral;
    else if (source === 'みん釣り') capacityLimit = state.settings.capacityMintsuri;
    else if (source === '水宝') capacityLimit = state.settings.capacitySuiho;
    else if (source === 'ハリミツ') capacityLimit = state.settings.capacityHarimitsu;

    if (currentCategoryFishers + fisherCount > capacityLimit) {
        showStatus(`【${source}枠】の定員（${capacityLimit}名）を超えています。残り：${capacityLimit - currentCategoryFishers}名`, "error");
        return;
    }

    // Aggregate Capacity Check (Total 250)
    const totalFishers = state.entries
        .filter(en => en.id !== editId)
        .reduce((sum, en) => sum + en.fishers, 0);

    if (totalFishers + fisherCount > 250) {
        showStatus(`大会全体の定員（250名）を超えています。現在の合計：${totalFishers}名、残り：${250 - totalFishers}名`, "error");
        return;
    }

    // Populate confirmation screen
    document.getElementById('conf-source').textContent = source;
    document.getElementById('conf-group').textContent = groupName;
    document.getElementById('conf-rep-name').textContent = repName;
    document.getElementById('conf-rep-phone').textContent = repPhone;
    document.getElementById('conf-rep-email').textContent = repEmail;

    // Populate Participant Summary
    const summaryList = document.getElementById('conf-participant-summary');
    summaryList.innerHTML = '';
    participants.forEach((p, idx) => {
        const li = document.createElement('li');
        const typeLabel = p.type === 'fisher' ? '【釣り】' : '【見学】';
        li.textContent = `${idx + 1}. ${typeLabel} ${p.name}` + (p.nickname ? ` (${p.nickname})` : '');
        summaryList.appendChild(li);
    });

    // Switch Views
    document.getElementById('registration-form').classList.add('hidden');
    document.getElementById('confirmation-section').classList.remove('hidden');
    document.getElementById('app-title').textContent = "登録内容の確認";
    window.scrollTo(0, 0);
}

function hideConfirmation() {
    document.getElementById('confirmation-section').classList.add('hidden');
    document.getElementById('registration-form').classList.remove('hidden');
    document.getElementById('app-title').textContent = document.getElementById('edit-entry-id').value ? "登録変更" : state.settings.competitionName;
    window.scrollTo(0, 0);
}

function handleRegistration() {
    // Re-gather data (already validated)
    const editId = document.getElementById('edit-entry-id').value;
    const pRows = document.querySelectorAll('.participant-row');
    const participants = Array.from(pRows).map(row => ({
        type: row.querySelector('.p-type').value,
        name: row.querySelector('.p-name').value,
        nickname: row.querySelector('.p-nick').value,
        region: row.querySelector('.p-region').value,
        age: row.querySelector('.p-age').value
    }));

    const sourceEl = document.querySelector('input[name="reg-source"]:checked');
    const source = sourceEl ? sourceEl.value : '一般';
    const fisherCount = participants.filter(p => p.type === 'fisher').length;
    const observerCount = participants.filter(p => p.type === 'observer').length;

    // Final Capacity Check (Double guard)
    const currentCategoryFishers = state.entries
        .filter(en => en.id !== editId && en.source === source)
        .reduce((sum, en) => sum + en.fishers, 0);
    const totalNow = state.entries
        .filter(en => en.id !== editId)
        .reduce((sum, en) => sum + en.fishers, 0);

    let capacityLimit = 0;
    if (source === '一般') capacityLimit = state.settings.capacityGeneral;
    else if (source === 'みん釣り') capacityLimit = state.settings.capacityMintsuri;
    else if (source === '水宝') capacityLimit = state.settings.capacitySuiho;
    else if (source === 'ハリミツ') capacityLimit = state.settings.capacityHarimitsu;

    if (currentCategoryFishers + fisherCount > capacityLimit || totalNow + fisherCount > 250) {
        showStatus("定員エラー：登録直前に定員に達しました。内容を確認し、再度お試しください。", "error");
        return;
    }

    const entryData = {
        source: source,
        groupName: document.getElementById('group-name').value,
        representative: document.getElementById('representative-name').value,
        phone: document.getElementById('rep-phone').value,
        email: document.getElementById('rep-email').value,
        password: document.getElementById('edit-password').value,
        participants: participants.map(p => ({ ...p, status: 'pending' })), // Initialize status
        fishers: fisherCount,
        observers: observerCount,
        status: editId ? (state.entries.find(en => en.id === editId).status || 'pending') : 'pending',
        checkedIn: editId ? (state.entries.find(en => en.id === editId).checkedIn || false) : false,
        checkInTime: editId ? (state.entries.find(en => en.id === editId).checkInTime || null) : null,
        timestamp: editId ? state.entries.find(en => en.id === editId).timestamp : new Date().toLocaleString('ja-JP'),
        lastModified: editId ? new Date().toLocaleString('ja-JP') : null
    };

    if (editId) {
        entryData.id = editId;
        const idx = state.entries.findIndex(en => en.id === editId);
        state.entries[idx] = entryData;
        showToast('登録内容を更新しました', 'success');
        // If editing from dashboard, jumping back is better
        switchView(null, 'dashboard-view');
    } else {
        // Determine prefix based on source
        const prefixMap = { '一般': 'A', 'みん釣り': 'M', '水宝': 'S', 'ハリミツ': 'H' };
        const prefix = prefixMap[source] || 'A';

        // Find existing entries with this prefix and get the max number
        const samePrefixEntries = state.entries.filter(e => e.id.startsWith(prefix + '-'));
        const nextNum = (samePrefixEntries.length > 0)
            ? Math.max(...samePrefixEntries.map(e => parseInt(e.id.split('-')[1]))) + 1
            : 1;

        entryData.id = `${prefix}-${String(nextNum).padStart(3, '0')}`;
        state.entries.push(entryData);
    }
    // Save and Sync
    saveData();
    updateDashboard();

    // Send automated email via GAS (fire and forget / async)
    sendEmailViaGAS(entryData);

    if (isAdminAuthAction) {
        // If it was an admin edit, go back to dashboard instead of result page
        switchView(null, 'dashboard-view');
        showToast('修正を保存しました', 'success');
    } else {
        // Show result view for normal registrations
        showResult(entryData);
    }
}

async function sendEmailViaGAS(entryData) {
    try {
        const payload = {
            id: entryData.id,
            groupName: entryData.groupName,
            email: entryData.email,
            phone: entryData.phone,
            representative: entryData.representative,
            fishers: entryData.fishers,
            observers: entryData.observers,
            source: entryData.source,
            timestamp: entryData.timestamp,
            participants: entryData.participants // 全参加者リストを追加
        };

        // Use fetch with 'no-cors' if GAS doesn't handle CORS, but GAS Web App typically handles it
        // Or send as a form submission to avoid CORS issues if necessary
        await fetch(GAS_WEB_APP_URL, {
            method: 'POST',
            mode: 'no-cors', // GAS Web App works better with no-cors if not returning JSON
            headers: {
                'Content-Type': 'text/plain',
            },
            body: JSON.stringify(payload)
        });
        console.log('Email request sent to GAS');
    } catch (error) {
        console.error('Error sending email via GAS:', error);
    }
}

function handleEditAuth() {
    const entryId = document.getElementById('auth-entry-id').value.toUpperCase();
    const cred = document.getElementById('auth-credential').value;
    const entry = state.entries.find(e => e.id === entryId);

    if (entry && (entry.password === cred || entry.phone === cred || entry.email === cred)) {
        fillFormForEdit(entry);
    } else {
        const err = document.getElementById('auth-error');
        err.textContent = "受付番号または認証情報が正しくありません。";
        err.classList.remove('hidden');
    }
}

function fillFormForEdit(entry) {
    resetForm(); // Start fresh

    document.getElementById('edit-entry-id').value = entry.id;
    // For admin categories, show all possible sources if admin
    if (isAdminAuth || isAdminAuthAction) {
        ['水宝', 'ハリミツ'].forEach(source => {
            let sourceRadio = document.querySelector(`input[name="reg-source"][value="${source}"]`);
            if (!sourceRadio) {
                const selector = document.getElementById('main-source-selector');
                const badgeClass = source === '水宝' ? 'badge-suiho' : 'badge-harimitsu';
                const label = document.createElement('label');
                label.className = 'source-option admin-only temp-option';
                label.innerHTML = `
                    <input type="radio" name="reg-source" value="${source}" required>
                    <span class="source-label">
                        <span class="badge ${badgeClass}">${source}</span>
                        ${source}受付
                    </span>
                `;
                selector.appendChild(label);
            }
        });
    }

    let sourceRadio = document.querySelector(`input[name="reg-source"][value="${entry.source}"]`);
    if (sourceRadio) sourceRadio.checked = true;

    document.getElementById('group-name').value = entry.groupName;
    document.getElementById('representative-name').value = entry.representative;
    document.getElementById('rep-phone').value = entry.phone;
    document.getElementById('rep-email').value = entry.email;
    document.getElementById('rep-email-confirm').value = entry.email;
    document.getElementById('edit-password').value = entry.password;

    const list = document.getElementById('participant-list');
    list.innerHTML = '';
    entry.participants.forEach(p => addParticipantRow(p));

    document.getElementById('edit-auth-section').classList.add('hidden');
    document.getElementById('registration-form').classList.remove('hidden');
    document.getElementById('app-title').textContent = "登録変更: " + entry.id;
    document.getElementById('submit-registration').textContent = "変更を保存する";
    document.getElementById('cancel-edit').classList.remove('hidden');
}

function showResult(entry) {
    document.getElementById('registration-form').classList.add('hidden');
    document.getElementById('confirmation-section').classList.add('hidden');
    document.getElementById('registration-result').classList.remove('hidden');
    document.getElementById('result-number').textContent = entry.id;
    document.getElementById('result-group').textContent = entry.groupName;
    document.getElementById('result-fishers').textContent = entry.fishers;
    document.getElementById('result-source').textContent = entry.source;
    document.getElementById('app-title').textContent = "受付完了";

    showToast('✨ 登録完了しました！', 'success');
    window.scrollTo(0, 0);
}

function resetForm() {
    document.getElementById('registration-form').reset();
    document.getElementById('edit-entry-id').value = "";
    // Reset radio selection
    const defaultRadio = document.querySelector('input[name="reg-source"][value="一般"]');
    if (defaultRadio) defaultRadio.checked = true;

    document.getElementById('participant-list').innerHTML = '';
    addParticipantRow();
    document.getElementById('registration-form').classList.remove('hidden');
    document.getElementById('confirmation-section').classList.add('hidden');
    document.getElementById('registration-result').classList.add('hidden');
    document.getElementById('edit-auth-section').classList.add('hidden');
    document.getElementById('registration-status').classList.add('hidden');
    document.getElementById('app-title').textContent = state.settings.competitionName;
    document.getElementById('submit-registration').textContent = "この内容で登録する";
    document.getElementById('cancel-edit').classList.add('hidden');
    isAdminAuthAction = false;

    // Remove temp admin options if any
    document.querySelectorAll('.temp-option').forEach(el => el.remove());
    updateSourceAvailability();
    window.scrollTo(0, 0);
}

function showStatus(msg, type) {
    const div = document.getElementById('registration-status');
    div.textContent = msg;
    div.className = `alert alert-${type}`;
    div.classList.remove('hidden');
    window.scrollTo(0, 0);
}

// Admin / Dashboard
function updateDashboard() {
    try {
        const fishersIppan = sumCategoryFishers('一般');
        const fishersMintsuri = sumCategoryFishers('みん釣り');
        const fishersSuiho = sumCategoryFishers('水宝');
        const fishersHarimitsu = sumCategoryFishers('ハリミツ');

        const observersIppan = sumCategoryObservers('一般');
        const observersMintsuri = sumCategoryObservers('みん釣り');
        const observersSuiho = sumCategoryObservers('水宝');
        const observersHarimitsu = sumCategoryObservers('ハリミツ');

        const totalFishers = fishersIppan + fishersMintsuri + fishersSuiho + fishersHarimitsu;
        const totalObservers = state.entries.reduce((s, e) => s + e.observers, 0);
        const checkedInCount = state.entries.filter(e => e.status === 'checked-in').length;
        const absentCount = state.entries.filter(e => e.status === 'absent').length;

        document.getElementById('total-registrations').textContent = state.entries.length;
        document.getElementById('current-fishers').textContent = totalFishers;
        document.getElementById('current-observers').textContent = totalObservers;

        // Reception stats
        document.getElementById('checked-in-count').textContent = checkedInCount;
        document.getElementById('absent-count').textContent = absentCount;
        document.getElementById('total-groups-count').textContent = state.entries.length;

        // Also update the reception view stats header if it exists
        const recCheck = document.getElementById('rec-check-in-count');
        const recAbs = document.getElementById('rec-absent-count');
        if (recCheck) recCheck.textContent = checkedInCount;
        if (recAbs) recAbs.textContent = absentCount;

        // Email count
        updateBulkMailCount();

        // Splits
        updateSplitUI('ippan', fishersIppan, state.settings.capacityGeneral, observersIppan);
        updateSplitUI('mintsuri', fishersMintsuri, state.settings.capacityMintsuri, observersMintsuri);
        updateSplitUI('suiho', fishersSuiho, state.settings.capacitySuiho, observersSuiho);
        updateSplitUI('harimitsu', fishersHarimitsu, state.settings.capacityHarimitsu, observersHarimitsu);

        // Breakdown stats
        renderBreakdownStats();

        const list = document.getElementById('entry-list');
        const searchTerm = document.getElementById('dashboard-search').value.toLowerCase();

        list.innerHTML = '';

        // Filter and display
        state.entries.slice().reverse().forEach(e => {
            // Search Filter
            const matchesSearch =
                e.id.toLowerCase().includes(searchTerm) ||
                e.groupName.toLowerCase().includes(searchTerm) ||
                e.representative.toLowerCase().includes(searchTerm);

            if (!matchesSearch) return;

            // Category Filter
            if (dashboardFilter !== 'all' && e.source !== dashboardFilter) return;

            const badgeMap = { '一般': 'badge-ippan', 'みん釣り': 'badge-mintsuri', '水宝': 'badge-suiho', 'ハリミツ': 'badge-harimitsu' };
            const badgeClass = badgeMap[e.source] || 'badge-ippan';
            const tr = document.createElement('tr');
            if (e.status === 'checked-in') tr.classList.add('row-checked-in');
            if (e.status === 'absent') tr.classList.add('row-absent');

            const statusIcon = e.status === 'checked-in' ? '✅' : e.status === 'absent' ? '❌' : '⏳';
            const statusLabel = e.status === 'checked-in' ? '受済' : e.status === 'absent' ? '欠席' : '受付';

            tr.innerHTML = `
            <td><strong>${e.id}</strong></td>
            <td><span class="badge ${badgeClass}">${e.source}</span></td>
            <td>${e.groupName}</td>
            <td>${e.representative}</td>
            <td>${e.fishers}名</td>
            <td>${e.observers}</td>
            <td><small>${e.status === 'checked-in' ? '✅ ' + e.checkInTime : e.timestamp}</small></td>
            <td>
                <button class="btn-check-in ${e.status !== 'pending' ? 'active' : ''} ${e.status === 'absent' ? 'absent' : ''}" onclick="jumpToReception('${e.id}')">
                    ${statusIcon} ${statusLabel}
                </button>
                <button class="btn-text" onclick="requestAdminEdit('${e.id}')">修正</button>
            </td>
        `;
            list.appendChild(tr);
        });
    } catch (e) {
        console.error('updateDashboard error:', e);
    }
}

// --- Reception View Logic ---

function updateReceptionList() {
    const list = document.getElementById('reception-group-list');
    const searchTerm = document.getElementById('reception-search').value.toLowerCase();
    const showCompleted = document.getElementById('show-completed-toggle').checked;

    list.innerHTML = '';

    const processedEntries = state.entries.map(e => {
        const finishedCount = e.participants.filter(p => p.status === 'checked-in' || p.status === 'absent').length;
        const totalCount = e.participants.length;
        const isCompleted = finishedCount === totalCount && totalCount > 0;
        return { ...e, isCompleted, finishedCount, totalCount };
    });

    // Sort: isCompleted false first, then by ID or timestamp
    processedEntries.sort((a, b) => {
        if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
        return b.id.localeCompare(a.id); // Reverse ID sort (newest roughly first)
    });

    processedEntries.forEach(e => {
        // Search Filter
        const matchesSearch = e.id.toLowerCase().includes(searchTerm) ||
            e.groupName.toLowerCase().includes(searchTerm) ||
            e.representative.toLowerCase().includes(searchTerm);
        if (!matchesSearch) return;

        // Completion Filter
        if (!showCompleted && e.isCompleted) return;

        const item = document.createElement('div');
        item.className = `reception-group-item ${activeReceptionEntryId === e.id ? 'active' : ''} ${e.isCompleted ? 'completed' : ''}`;
        item.onclick = () => selectReceptionEntry(e.id);

        item.innerHTML = `
            <strong>${e.id} | ${e.groupName}</strong>
            <div class="item-meta">
                <span>${e.representative}</span>
                <span>${e.isCompleted ? '✅ 受付済' : `確認: ${e.finishedCount} / ${e.totalCount}`}</span>
            </div>
        `;
        list.appendChild(item);
    });
}

function selectReceptionEntry(id) {
    activeReceptionEntryId = id;
    updateReceptionList();
    renderReceptionDesk();
}

function renderReceptionDesk() {
    const desk = document.getElementById('reception-detail-area');
    const entry = state.entries.find(e => e.id === activeReceptionEntryId);

    if (!entry) {
        desk.innerHTML = `
            <div class="reception-placeholder">
                <i>🔍</i>
                <p>左側のリストからグループを選択してください、E/p>
            </div>
        `;
        return;
    }

    desk.innerHTML = `
        <div class="desk-header">
            <div class="desk-title-row">
                <div class="desk-group-name">${entry.groupName}</div>
                <div class="badge ${entry.source === 'みん釣り' ? 'badge-mintsuri' : entry.source === '一般' ? 'badge-ippan' : entry.source === 'ハリミツ' ? 'badge-harimitsu' : 'badge-suiho'}">${entry.source}</div>
            </div>
            <div class="desk-meta">
                ID: ${entry.id} | 代表者: ${entry.representative} | TEL: ${entry.phone}
            </div>
        </div>

        <div class="participant-check-list">
            ${entry.participants.map((p, idx) => `
                <div class="participant-check-row ${p.status === 'checked-in' ? 'checked-in' : ''} ${p.status === 'absent' ? 'absent' : ''}">
                    <div class="p-info">
                        <span class="p-name">${p.name} ${p.nickname ? `<small>(${p.nickname})</small>` : ''}</span>
                        <span class="p-meta">${p.type === 'fisher' ? '釣り' : '見学'} | ${p.region} | ${ageLabels[p.age] || p.age}</span>
                    </div>
                    <div class="p-status-actions">
                        <button class="btn-status in ${p.status === 'checked-in' ? 'active' : ''}" onclick="updateParticipantStatus('${entry.id}', ${idx}, 'checked-in')">受付</button>
                        <button class="btn-status out ${p.status === 'absent' ? 'active' : ''}" onclick="updateParticipantStatus('${entry.id}', ${idx}, 'absent')">欠席</button>
                        <button class="btn-status" onclick="updateParticipantStatus('${entry.id}', ${idx}, 'pending')">ー</button>
                    </div>
                </div>
            `).join('')}
        </div>

        <div class="desk-footer">
            <button class="btn-primary btn-large" onclick="updateGroupStatus('${entry.id}', 'checked-in')">全員チェックイン</button>
        </div>
    `;
}

window.updateParticipantStatus = function (entryId, pIdx, status) {
    const entry = state.entries.find(e => e.id === entryId);
    if (!entry) return;

    entry.participants[pIdx].status = status;

    // Sync group-level flags (for backward compatibility and stats)
    syncGroupStatusFromParticipants(entry);

    const statusLabel = status === 'checked-in' ? '受付済' : status === 'absent' ? '欠席' : '未受付';
    showToast(`${entry.participants[pIdx].name} 様を「${statusLabel}」に更新しました`, 'info');

    saveData();
    renderReceptionDesk();
    updateReceptionList();
    updateDashboard();
};

window.updateGroupStatus = function (entryId, status) {
    const entry = state.entries.find(e => e.id === entryId);
    if (!entry) return;

    entry.participants.forEach(p => {
        // statusが 'checked-in' の場合、既に 'absent' の人は上書きしない
        if (status === 'checked-in' && p.status === 'absent') {
            return;
        }
        p.status = status;
    });
    syncGroupStatusFromParticipants(entry);

    if (status === 'checked-in') {
        showToast('グループ全員を受付しました', 'success');
    }

    saveData();
    renderReceptionDesk();
    updateReceptionList();
    updateDashboard();
};

function syncGroupStatusFromParticipants(entry) {
    const hasCheckedIn = entry.participants.some(p => p.status === 'checked-in');
    const allAbsent = entry.participants.every(p => p.status === 'absent');

    if (hasCheckedIn) {
        entry.status = 'checked-in';
        entry.checkedIn = true;
        if (!entry.checkInTime) {
            entry.checkInTime = new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
        }
    } else if (allAbsent) {
        entry.status = 'absent';
        entry.checkedIn = false;
        entry.checkInTime = null;
    } else {
        entry.status = 'pending';
        entry.checkedIn = false;
        entry.checkInTime = null;
    }
}


function sumCategoryFishers(category) {
    return state.entries.filter(e => e.source === category).reduce((s, e) => s + e.fishers, 0);
}

function sumCategoryObservers(category) {
    return state.entries.filter(e => e.source === category).reduce((s, e) => s + e.observers, 0);
}

function updateSplitUI(prefix, current, max, observers) {
    const currEl = document.getElementById(`curr-${prefix}`);
    const maxEl = document.getElementById(`max-${prefix}`);
    const obsEl = document.getElementById(`${prefix}-observers`);

    if (currEl) {
        currEl.textContent = current;
        currEl.style.color = (max > 0 && current > max) ? 'var(--error-color)' : '';
        currEl.style.fontWeight = (max > 0 && current > max) ? 'bold' : '';
    }
    if (maxEl) maxEl.textContent = max;
    if (obsEl) obsEl.textContent = observers || 0;

    const pct = max > 0 ? Math.min(100, (current / max) * 100) : 0;
    const progEl = document.getElementById(`prog-${prefix}`);
    if (progEl) progEl.style.width = pct + '%';
}

function renderBreakdownStats() {
    const ageCount = {};
    const regionCount = {};

    // Initialize ages
    Object.keys(ageLabels).forEach(key => ageCount[key] = 0);

    state.entries.forEach(e => {
        e.participants.forEach(p => {
            // Ages - count everyone
            if (ageCount[p.age] !== undefined) {
                ageCount[p.age]++;
            }
            // Regions - count by group representative location (or each participant if preferred)
            // Let's count per participant since the request was "region counts"
            if (p.region) {
                const reg = p.region.trim();
                regionCount[reg] = (regionCount[reg] || 0) + 1;
            }
        });
    });

    // Render Ages
    const ageList = document.getElementById('age-breakdown-list');
    if (ageList) {
        ageList.innerHTML = Object.entries(ageCount)
            .filter(([_, count]) => count > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([key, count]) => `
                <div class="stats-item">
                    <span class="stats-label">${ageLabels[key]}</span>
                    <span class="stats-count">${count}名</span>
                </div>
            `).join('') || '<div class="text-muted small">データなし</div>';
    }

    // Render Regions
    const regionList = document.getElementById('region-breakdown-list');
    if (regionList) {
        regionList.innerHTML = Object.entries(regionCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 15) // Top 15
            .map(([reg, count]) => `
                <div class="stats-item">
                    <span class="stats-label">${reg}</span>
                    <span class="stats-count">${count}名</span>
                </div>
            `).join('') || '<div class="text-muted small">データなし</div>';
    }
}

window.requestEdit = function (id) {
    const btn = document.querySelector('.nav-btn[data-target="registration-view"]');
    btn.click();
    document.getElementById('show-edit-login').click();
    document.getElementById('auth-entry-id').value = id;
};

window.requestAdminEdit = function (id) {
    const entry = state.entries.find(e => e.id === id);
    if (!entry) return;

    // First switch view, then fill form
    switchView(null, 'registration-view');

    isAdminAuthAction = true; // Set flag BEFORE filling form
    fillFormForEdit(entry);
    // Overwrite title for Admin context
    document.getElementById('app-title').innerHTML = `<span class="badge badge-ippan" style="background:#e67e22">管理者修正</span> 管理番号: ${entry.id}`;
};

window.resendEmail = async function (id) {
    const entry = state.entries.find(e => e.id === id);
    if (!entry) return;

    if (confirm(`${entry.groupName} 様へ受付完了メールを再送しますか？\n送信先: ${entry.email}`)) {
        await sendEmailViaGAS(entry);
        showToast('再送リクエストを送信しました', 'info');
    }
};

window.jumpToReception = function (id) {
    const btn = document.querySelector('.nav-btn[data-target="reception-view"]');
    if (btn) btn.click();
    selectReceptionEntry(id);
};

window.openReceptionModal = function (id) {
    // This is now handled by jumpToReception for a full-view experience
    window.jumpToReception(id);
};

function closeReceptionModal() {
    document.getElementById('reception-modal').classList.add('hidden');
    currentReceptionId = null;
}

function updateEntryStatus(status) {
    // This function is deprecated in favor of updateParticipantStatus/updateGroupStatus
    // but kept just in case of stale refs.
}

// Settings
window.triggerSettingsSave = function () {
    handleSettingsUpdate({ preventDefault: () => { } });
};

function handleSettingsUpdate(e) {
    if (e && e.preventDefault) e.preventDefault();
    state.settings.competitionName = document.getElementById('competition-name').value;
    state.settings.capacityGeneral = parseInt(document.getElementById('cap-ippan').value) || 0;
    state.settings.capacityMintsuri = parseInt(document.getElementById('cap-mintsuri').value) || 0;
    state.settings.capacitySuiho = parseInt(document.getElementById('cap-suiho').value) || 0;
    state.settings.capacityHarimitsu = parseInt(document.getElementById('cap-harimitsu').value) || 0;
    state.settings.capacityObservers = parseInt(document.getElementById('capacity-observers').value) || 0;
    state.settings.startTime = document.getElementById('registration-start').value;
    state.settings.deadline = document.getElementById('registration-deadline').value;
    state.settings.adminPassword = document.getElementById('admin-password-set').value;

    saveData();
    syncSettingsUI();
    updateDashboard();
    checkTimeframe();
    showToast('大会設定を保存しました', 'success');
}

function updateCapacityTotal() {
    const ippan = parseInt(document.getElementById('cap-ippan').value) || 0;
    const mintsuri = parseInt(document.getElementById('cap-mintsuri').value) || 0;
    const suiho = parseInt(document.getElementById('cap-suiho').value) || 0;
    const harimitsu = parseInt(document.getElementById('cap-harimitsu').value) || 0;

    const total = ippan + mintsuri + suiho + harimitsu;
    const sumEl = document.getElementById('capacity-total-summary');
    const warnEl = document.getElementById('capacity-warning-msg');

    if (sumEl) {
        sumEl.textContent = total;
        sumEl.style.color = total > 250 ? 'var(--error-color)' : 'var(--primary-color)';
    }
    if (warnEl) {
        warnEl.classList.toggle('hidden', total <= 250);
    }
}

function confirmReset() {
    if (confirm('全てのデータを削除します。本当によろしいですか？')) {
        localStorage.removeItem('fishing_app_v3_data');
        state.entries = [];
        saveData();
        location.reload();
    }
}

// Exports
function exportGroupsCSV() {
    if (state.entries.length === 0) return alert('データがありません');
    const headers = ['受付番号', '区分', 'グループ名', '代表者名', '電話番号', 'メール', '釣り人数', '見学人数', '登録時間'];
    const rows = state.entries.map(e => [e.id, e.source, e.groupName, e.representative, e.phone, e.email, e.fishers, e.observers, e.timestamp]);
    downloadCSV("groups", headers, rows);
}

function exportParticipantsCSV() {
    if (state.entries.length === 0) return alert('データがありません');
    const headers = ['受付番号', '区分', 'グループ名', '代表者名', '参加区分', '参加者名', 'ニックネーム', '地域', '年代', '登録時間'];
    const rows = [];
    state.entries.forEach(e => {
        e.participants.forEach(p => {
            const partType = p.type === 'observer' ? '見学' : '釣り';
            rows.push([e.id, e.source, e.groupName, e.representative, partType, p.name, p.nickname, p.region, ageLabels[p.age] || p.age, e.timestamp]);
        });
    });
    downloadCSV("participants", headers, rows);
}

function downloadCSV(name, headers, rows) {
    let csv = "\uFEFF" + headers.join(",") + "\n";
    rows.forEach(row => csv += row.map(c => `"${c}"`).join(",") + "\n");
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `fishing_${name}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    showToast(`${name} CSVを出力しました`, 'info');
}

// Bulk Email
function updateBulkMailCount() {
    const el = document.getElementById('bulk-mail-recipient-count');
    if (!el) return;
    const uniqueEmails = new Set(state.entries.map(e => e.email.toLowerCase().trim()).filter(e => e));
    el.textContent = uniqueEmails.size;
}

async function handleBulkEmailSend() {
    const subject = document.getElementById('bulk-mail-subject').value.trim();
    const body = document.getElementById('bulk-mail-body').value.trim();
    const uniqueEmails = Array.from(new Set(state.entries.map(e => e.email.toLowerCase().trim()).filter(e => e)));

    if (uniqueEmails.length === 0) {
        showToast('送信対象のメールアドレスがありません', 'error');
        return;
    }
    if (!subject || !body) {
        showToast('件名と本文を入力してください', 'error');
        return;
    }

    if (!confirm(`${uniqueEmails.length} 名の代表者へ一斉送信します。よろしいですか？`)) {
        return;
    }

    try {
        const payload = {
            type: 'bulk',
            subject: subject,
            message: body,
            recipients: uniqueEmails,
            timestamp: new Date().toLocaleString('ja-JP')
        };

        const btn = document.getElementById('btn-send-bulk-mail');
        btn.disabled = true;
        btn.textContent = '送信中...';

        await fetch(GAS_WEB_APP_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload)
        });

        showToast('一括送信リクエストを送信しました', 'success');
        document.getElementById('bulk-mail-subject').value = '';
        document.getElementById('bulk-mail-body').value = '';
    } catch (error) {
        console.error('Bulk email error:', error);
        showToast('送信中にエラーが発生しました', 'error');
    } finally {
        const btn = document.getElementById('btn-send-bulk-mail');
        btn.disabled = false;
        btn.textContent = '送信する（一括送信）';
    }
}

// Admin Tab Switching
function switchAdminTab(tabId) {
    currentAdminTab = tabId; // Remember tab
    sessionStorage.setItem('currentAdminTab', tabId);

    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });
    document.querySelectorAll('.admin-tab-content').forEach(content => {
        content.classList.toggle('active', content.id === tabId);
    });

    if (tabId === 'tab-capacity') {
        generateAdminQRCode();
    }

    // Scroll to top
    window.scrollTo(0, 0);
}

function generateAdminQRCode() {
    const container = document.getElementById('admin-qr-code-container');
    const urlDisplay = document.getElementById('admin-url-display');
    if (!container) return;

    // Use current URL
    const currentUrl = window.location.href;
    urlDisplay.textContent = currentUrl;

    // Check if current URL is local (file:// or localhost)
    const isLocal = currentUrl.startsWith('file://') || currentUrl.includes('127.0.0.1') || currentUrl.includes('localhost');

    if (isLocal) {
        container.innerHTML = `
            <div class="alert alert-error" style="background:#fff5f5; border:1px solid #feb2b2; padding:1rem; border-radius:8px; margin-bottom:1rem;">
                <p style="color:#c53030; font-weight:bold; font-size:0.9rem;">
                    ⚠️ 注意：現在はPC内のファイルを表示しています。<br>
                    このQRコードでは携帯からアクセスできません。
                </p>
                <p style="font-size:0.8rem; margin-top:0.5rem;">
                    GitHub Pages のURL（https://...）をPCで開いてから、この画面を再度確認してください。
                </p>
            </div>
            <div style="opacity: 0.3; filter: blur(2px); pointer-events: none;">
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(currentUrl)}" alt="Local QR">
            </div>
        `;
        return;
    }

    // Generate QR using QRServer API
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(currentUrl)}`;

    container.innerHTML = `
        <img src="${qrUrl}" alt="Admin access QR code" onload="this.parentElement.style.background='white'">
    `;
}


// --- Toast System ---
function initToast() {
    // Placeholder if any dynamic setup is needed
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// --- Test Data Generator ---
window.generateBulkTestData = function () {
    const totalCurrent = state.entries.reduce((s, e) => s + e.fishers, 0);
    if (totalCurrent > 200) {
        if (!confirm('すでに多くのデータがあります。さらに関係なく生成しますか？（「全データをリセット」してから行うのがおすすめです）')) return;
    } else {
        if (!confirm('各枠の定員を守りつつ、合計240名程度になるまでテストデータを生成します。よろしいですか？')) return;
    }

    const sources = ['一般', 'みん釣り', '水宝', 'ハリミツ'];
    const names = ['田中', '佐藤', '鈴木', '高橋', '渡辺', '伊藤', '山本', '中村', '小林', '加藤'];
    const groups = ['チーム海', '釣りキチ同盟', '波止場会', '大漁祈願', 'フィッシングクラブ'];
    const regions = ['大阪市', '堺市', '姫路市', '明石市', '神戸市', '西宮市'];
    const ages = ['10s', '20s', '30s', '40s', '50s', '60s', '70s', '80s'];

    let entriesAdded = 0;
    let fishersAddedTotal = 0;

    // Loop until we are close to 250 or run out of category space
    for (let i = 0; i < 150; i++) { // Max 150 attempts to avoid infinite loop
        const totalNow = state.entries.reduce((s, e) => s + e.fishers, 0);
        if (totalNow >= 240) break; // Stop at 240 to let user test the last 10

        // Pick a source that still has room
        const availableSources = sources.filter(s => {
            const current = sumCategoryFishers(s);
            let limit = 0;
            if (s === '一般') limit = state.settings.capacityGeneral;
            else if (s === 'みん釣り') limit = state.settings.capacityMintsuri;
            else if (s === '水宝') limit = state.settings.capacitySuiho;
            else if (s === 'ハリミツ') limit = state.settings.capacityHarimitsu;
            return current < limit;
        });

        if (availableSources.length === 0) break;
        const source = availableSources[Math.floor(Math.random() * availableSources.length)];

        // Calculate remaining room in this category
        let categoryLimit = 0;
        if (source === '一般') categoryLimit = state.settings.capacityGeneral;
        else if (source === 'みん釣り') categoryLimit = state.settings.capacityMintsuri;
        else if (source === '水宝') categoryLimit = state.settings.capacitySuiho;
        else if (source === 'ハリミツ') categoryLimit = state.settings.capacityHarimitsu;

        const categoryCurrent = sumCategoryFishers(source);
        const categoryRoom = categoryLimit - categoryCurrent;
        const totalRoom = 240 - totalNow;
        const maxRoom = Math.min(categoryRoom, totalRoom, 4); // Max 4 per team

        if (maxRoom <= 0) continue;

        const numFishers = Math.max(1, Math.floor(Math.random() * maxRoom) + 1);
        const groupName = groups[Math.floor(Math.random() * groups.length)] + (state.entries.length + 1);
        const repName = names[Math.floor(Math.random() * names.length)] + (state.entries.length + 1);

        const participants = [];
        for (let j = 0; j < numFishers; j++) {
            participants.push({
                type: 'fisher',
                name: repName + (j === 0 ? '' : 'の連れ' + j),
                nickname: '',
                region: regions[Math.floor(Math.random() * regions.length)],
                age: ages[Math.floor(Math.random() * ages.length)],
                status: 'pending'
            });
        }

        const prefixMap = { '一般': 'A', 'みん釣り': 'M', '水宝': 'S', 'ハリミツ': 'H' };
        const prefix = prefixMap[source] || 'A';
        const samePrefixEntries = state.entries.filter(e => e.id.startsWith(prefix + '-'));
        const nextNum = (samePrefixEntries.length > 0)
            ? Math.max(...samePrefixEntries.map(e => parseInt(e.id.split('-')[1]))) + 1
            : 1;

        const entry = {
            id: `${prefix}-${String(nextNum).padStart(3, '0')}`,
            source: source,
            groupName: groupName,
            representative: repName,
            phone: '090-0000-' + String(state.entries.length).padStart(4, '0'),
            email: 'test' + state.entries.length + '@example.com',
            password: 'pass',
            participants: participants,
            fishers: numFishers,
            observers: 0,
            status: 'pending',
            checkedIn: false,
            timestamp: new Date().toLocaleString('ja-JP')
        };

        state.entries.push(entry);
        fishersAddedTotal += numFishers;
        entriesAdded++;
    }

    saveData();
    updateDashboard();
    updateReceptionList();
    showToast(`${entriesAdded}件（釣り人計 ${fishersAddedTotal}名）のテストデータを作成しました。合計 ${state.entries.reduce((s, e) => s + e.fishers, 0)}名となり、定員(250)まで残りわずかです。`, 'success');
};

function updateSourceAvailability() {
    const selector = document.getElementById('main-source-selector');
    if (!selector) return;

    const radios = selector.querySelectorAll('input[name="reg-source"]');
    const totalFishers = state.entries.reduce((sum, en) => sum + en.fishers, 0);

    radios.forEach(radio => {
        const source = radio.value;
        const current = sumCategoryFishers(source);
        let limit = 0;
        if (source === '一般') limit = state.settings.capacityGeneral;
        else if (source === 'みん釣り') limit = state.settings.capacityMintsuri;
        else if (source === '水宝') limit = state.settings.capacitySuiho;
        else if (source === 'ハリミツ') limit = state.settings.capacityHarimitsu;

        const label = radio.closest('.source-option');
        if (!label) return;

        // Full if category limit is reached OR total 250 limit is reached
        const isFull = (limit > 0 && current >= limit) || totalFishers >= 250;

        // Bypassed if admin is editing
        const isDisabled = isFull && !isAdminAuthAction;

        radio.disabled = isDisabled;
        label.classList.toggle('is-full', isFull);
        label.classList.toggle('disabled', isDisabled); // Optional style tag

        // If current is disabled, uncheck it
        if (isDisabled && radio.checked) {
            radio.checked = false;
        }
    });

    // Final fallback selection
    const checked = selector.querySelector('input[name="reg-source"]:checked');
    if (!checked) {
        const available = selector.querySelector('input[name="reg-source"]:not(:disabled)');
        if (available) available.checked = true;
    }
}
