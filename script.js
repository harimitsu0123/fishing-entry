const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbyGmFH8-GXlWes9GHH-uELyT1NQNDAcK3JatxOSw331-Wd928ZHP9xKAcQFnnekHNLy/exec";

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

// Age labels map - v4.8 Updated
const ageLabels = {
    "elementary": "小学生以下",
    "middle_high": "中・高校生",
    "19_20s": "19歳〜20代",
    "30s": "30代", "40s": "40代", "50s": "50代",
    "60s": "60代", "70s": "70代", "80s": "80歳以上"
};

const tshirtSizes = ['150', 'S', 'M', 'L', 'XL', '3L', '4L', '5L'];

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
    try {
        console.log("BORIJIN APP v7.3.2: TIMEFRAME ENFORCEMENT & UI FIX");

        // v6.5: Start Background Auto-Sync if Admin
        if (isAdminAuth) {
            startAutoSync();
        }


        // --- STEP 1: UI INITIALIZATION (CRITICAL) ---
        // Ensure the registration form has at least one participant row 
        // immediately so the user sees something even if loading is slow.
        resetForm();
        console.log("BORIJIN APP: Initial resetForm() called.");

        // --- STEP 2: LOAD DATA (ASYNC) ---
        loadData().catch(e => console.error("BORIJIN APP: loadData background error", e));

        // --- STEP 3: APP LISTENERS & STATE ---
        initApp();

        // If persistent login is true, reveal admin parts
        if (isAdminAuth) {
            document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
        }
        restoreUIState();

        console.log("BORIJIN APP: Initialization Sequence Finished successfully.");
    } catch (e) {
        console.error("BORIJIN APP: FATAL INITIALIZATION ERROR", e);
        // Alert the user so we know exactly why it's failing
        alert("システム起動時にエラーが発生しました: " + e.message + "\n画面情報を再読み込みしてください。");
    }
});

function restoreUIState() {
    if (currentViewId && currentViewId !== 'registration-view') {
        const lastBtn = document.querySelector(`.nav-btn[data-target="${currentViewId}"]`);
        switchView(lastBtn, currentViewId);
    }
    if (isAdminAuth && currentAdminTab) {
        switchAdminTab(currentAdminTab);
    }
}

async function loadData() {
    // 1. Try to load from Cloud (GAS) first for synchronization
    updateSyncStatus('syncing');
    try {
        // タイムアウト15秒を設定（通信環境への配慮）
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(`${GAS_WEB_APP_URL}?action=get&_t=${Date.now()}`, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (response.ok) {
            const cloudData = await response.json();
            if (cloudData && cloudData.entries) {
                const localData = localStorage.getItem('fishing_app_v3_data');
                if (localData) {
                    const parsedLocal = JSON.parse(localData);
                    // v6.5: ID + lastModified単位での高度マージ
                    state = mergeData(parsedLocal, cloudData);
                    console.log('Cloud sync: data merged');
                    
                    localStorage.setItem('fishing_app_v3_data', JSON.stringify(state));
                    // もしクラウドよりローカルが新しければ（マージによって新しくなれば）同期
                    if (state.lastUpdated > cloudData.lastUpdated) {
                        syncToCloud();
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
        if (e.name === 'AbortError') {
            console.warn('Cloud load timed out, falling back to local');
        } else {
            console.warn('Cloud load failed, falling back to local:', e);
        }
        updateSyncStatus('error');
    }

    // 2. Fallback to LocalStorage
    const savedData = localStorage.getItem('fishing_app_v3_data');
    if (savedData) {
        state = JSON.parse(savedData);
        // ★ ローカルデータを読み込むが、クラウドへは勝手に送らない（上書き防止）
        console.log('Loaded from local storage (no automatic sync)');
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

/**
 * v6.5 高度マージロジック: ID単位 + 個別タイムスタンプ(lastModified)で比較
 */
function mergeData(local, cloud) {
    const merged = { ...cloud }; 
    const localMap = new Map(local.entries.map(e => [e.id, e]));
    const cloudMap = new Map(cloud.entries.map(e => [e.id, e]));

    // 1. ローカル固有、またはローカルの方が新しいデータをマージ
    local.entries.forEach(lEntry => {
        if (!cloudMap.has(lEntry.id)) {
            // v7.2: サーバー発行済みIDを持ち、かつクラウドの最終更新の方が新しい場合、
            // それは「サーバーで削除された」とみなし、マージ（復活）させない。
            const isServerId = /^[AMSH]-\d{3}$/.test(lEntry.id);
            if (isServerId) {
                const lTime = lEntry._ts || new Date(lEntry.lastModified || lEntry.timestamp || 0).getTime();
                if (cloud.lastUpdated > lTime) {
                    console.log(`[Sync] ${lEntry.id} is missing from server (deleted). Skipping.`);
                    return;
                }
            }
            merged.entries.push(lEntry);
            merged.lastUpdated = Date.now();
        } else {
            const cEntry = cloudMap.get(lEntry.id);
            const lTime = new Date(lEntry.lastModified || lEntry.timestamp || 0).getTime();
            const cTime = new Date(cEntry.lastModified || cEntry.timestamp || 0).getTime();

            // ローカルの方が更新が新しい場合、そのエントリーを差し替える
            if (lTime > cTime) {
                const idx = merged.entries.findIndex(e => e.id === lEntry.id);
                if (idx !== -1) {
                    merged.entries[idx] = lEntry;
                    merged.lastUpdated = Date.now();
                }
            }
        }
    });

    merged.settings = { ...local.settings, ...cloud.settings };
    const uniqueEntries = Array.from(new Map(merged.entries.map(e => [e.id, e])).values());
    merged.entries = uniqueEntries.sort((a, b) => {
        const timeA = new Date(a.timestamp || 0).getTime();
        const timeB = new Date(b.timestamp || 0).getTime();
        // Fallback to ID if timestamps are equal
        if (timeA === timeB) {
            if (a.id && b.id) return a.id.localeCompare(b.id);
            return 0;
        }
        return timeA - timeB;
    });


    return merged;
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
            adminPassword: "admin",
            ikesuList: Array.from({ length: 10 }, (_, i) => ({
                id: `ikesu-default-${i + 1}`,
                name: `イケス ${String.fromCharCode(65 + i)}`, // A, B, C...
                capacity: 15
            }))
        }, ...state.settings
    };

    checkTimeframe();
    updateDashboard();
    updateReceptionList();
    updateSourceAvailability();
    syncSettingsUI();

    // v7.3.0: Update public stats if visible
    const publicStatsView = document.getElementById('public-stats-view');
    if (publicStatsView && publicStatsView.style.display !== 'none') {
        renderPublicStats();
    }

    // v7.0: 自動復旧チェック（再読み込み時）
    setTimeout(checkPendingRegistration, 500);
}

/**
 * v7.0: 送信中データの二重登録チェック & 復旧ロジック
 */
async function checkPendingRegistration() {
    const pendingJson = localStorage.getItem('fishing_app_pending_reg');
    if (!pendingJson) return;

    try {
        const pending = JSON.parse(pendingJson);
        const now = Date.now();
        // 1時間以上前の古いデータは無視
        if (now - (pending._ts || 0) > 3600000) {
            localStorage.removeItem('fishing_app_pending_reg');
            return;
        }

        console.log("Pending registration found, checking list...", pending);
        
        // 最新データを強制リロード（同期）
        await loadDataFromCloudOnly();

        const match = state.entries.find(e => 
            e.representative === pending.representative && 
            e.phone === pending.phone && 
            e.groupName === pending.groupName &&
            e.status !== 'cancelled'
        );

        if (match) {
            console.log("Match found! Restoring success screen.", match);
            localStorage.removeItem('fishing_app_pending_reg');
            showResult(match);
            showToast('前回の登録が確認できました✨', 'success');
        }
    } catch (e) {
        console.warn("Pending check failed:", e);
    }
}

/**
 * v7.0: サーバーから最新データのみを確実に取得する（マージなしの最新確認用）
 */
async function loadDataFromCloudOnly() {
    try {
        const response = await fetch(`${GAS_WEB_APP_URL}?action=get&_t=${Date.now()}`);
        if (response.ok) {
            const cloudData = await response.json();
            if (cloudData && cloudData.entries) {
                state.entries = cloudData.entries;
                state.settings = { ...state.settings, ...cloudData.settings };
                state.lastUpdated = cloudData.lastUpdated;
                localStorage.setItem('fishing_app_v3_data', JSON.stringify(state));
            }
        }
    } catch (e) {
        console.error("Cloud fetch failed:", e);
    }
}

/**
 * v7.0: 手動での状態確認（エラー画面のボタンから呼び出し）
 */
window.handleCheckStatus = async function() {
    const btn = document.querySelector('.btn-check-status');
    if (btn) {
        btn.disabled = true;
        btn.textContent = "確認中...";
    }
    
    await checkPendingRegistration();
    
    // 見つからなかった場合
    const pendingJson = localStorage.getItem('fishing_app_pending_reg');
    if (pendingJson && btn) {
        btn.disabled = false;
        btn.textContent = "登録状況を再確認する";
        showToast('まだ登録が確認できません。もう一度お試しいただくか、再入力してください。', 'info');
    }
};

async function saveData() {
    state.lastUpdated = Date.now();
    localStorage.setItem('fishing_app_v3_data', JSON.stringify(state));
    
    // v6.5: 同期前に最新を一度取得してマージする「Fetch-First」方式
    try {
        const response = await fetch(`${GAS_WEB_APP_URL}?action=get&_t=${Date.now()}`);
        if (response.ok) {
            const cloudData = await response.json();
            state = mergeData(state, cloudData);
            localStorage.setItem('fishing_app_v3_data', JSON.stringify(state));
        }
    } catch (e) { console.warn("Save pre-fetch failed, pushing current instead."); }

    return await syncToCloud();
}

/** 
 * v6.5 自動同期サイクル (1分)
 */
function startAutoSync() {
    if (window._autoSyncTimer) return;
    window._autoSyncTimer = setInterval(() => {
        if (!isAdminAuth) return;
        console.log("Auto-Syncing...");
        loadData();
    }, 60000); 
}


async function syncToCloud() {
    updateSyncStatus('syncing');
    try {
        const payload = {
            action: 'save',
            data: state
        };
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        await fetch(GAS_WEB_APP_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        console.log('Cloud sync: data saved');
        localStorage.removeItem('fishing_sync_pending');
        updateSyncStatus('success');
    } catch (e) {
        if (e.name === 'AbortError') console.warn('Cloud save timed out');
        else console.error('Cloud sync error:', e);
        localStorage.setItem('fishing_sync_pending', '1');
        updateSyncStatus('error-silent');
    }
}

function updateSyncStatus(type) {
    const text = document.getElementById('sync-text');
    const dot = document.getElementById('sync-dot');
    const containerFooter = document.getElementById('sync-status-footer');
    
    // Update Footer Indicator
    if (containerFooter) containerFooter.classList.remove('hidden');

    if (type === 'syncing') {
        if (text) text.textContent = '同期中...';
        if (dot) { dot.className = 'sync-dot syncing'; }
    } else if (type === 'success') {
        if (text) text.textContent = '🎉 同期完了';
        if (dot) { dot.className = 'sync-dot success'; }
        setTimeout(() => { 
            if (text) text.textContent = 'クラウド接続: 正常'; 
            if (dot) { dot.className = 'sync-dot success'; }
        }, 2000);
    } else if (type === 'error') {
        if (text) text.textContent = '同期失敗';
        if (dot) { dot.className = 'sync-dot error'; }
    } else if (type === 'error-silent') {
        if (text) text.textContent = 'クラウド接続: 正常'; // Keep optimistic if silent
        if (dot) { dot.className = 'sync-dot success'; }
    }
}



// Helper: 24-hour JST date formatting
function formatDate(dateStr) {
    if (!dateStr) return "-";
    // If it's already a cleaner string, try to re-parse it
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');

    return `${year}/${month}/${day} ${hours}:${minutes}`;
}

function initApp() {
    initToast(); // Add toast container helper if needed

    // Set Public Share URL
    const shareUrlEl = document.getElementById('public-share-url');
    if (shareUrlEl) {
        shareUrlEl.value = window.location.href.split('#')[0];
    }

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

    if (isAdminAuth) {
        switchAdminTab(currentAdminTab);
    }

    // Safe listener registration helper
    const safeAddListener = (id, event, callback) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, callback);
    };

    // Form logic
    safeAddListener('add-participant', 'click', () => addParticipantRow());
    safeAddListener('btn-to-confirm', 'click', showConfirmation);
    safeAddListener('submit-registration', 'click', handleRegistration);
    safeAddListener('back-to-form', 'click', resetForm);
    safeAddListener('reset-data', 'click', () => {
        if (typeof window.confirmReset === 'function') window.confirmReset();
        else if (typeof confirmReset === 'function') confirmReset();
    });

    // Auth logic
    safeAddListener('show-edit-login', 'click', () => {
        const form = document.getElementById('registration-form');
        const auth = document.getElementById('edit-auth-section');
        if (form) form.classList.add('hidden');
        if (auth) auth.classList.remove('hidden');
    });
    safeAddListener('hide-edit-login', 'click', () => {
        const form = document.getElementById('registration-form');
        const auth = document.getElementById('edit-auth-section');
        if (form) form.classList.remove('hidden');
        if (auth) auth.classList.add('hidden');
    });
    safeAddListener('verify-edit', 'click', handleEditAuth);
    safeAddListener('cancel-edit', 'click', resetForm);

    // Admin Auth Logic
    safeAddListener('verify-admin', 'click', handleAdminLogin);
    safeAddListener('cancel-admin', 'click', () => {
        const modal = document.getElementById('admin-auth-modal');
        if (modal) modal.classList.add('hidden');
    });

    // Export logic
    safeAddListener('export-csv', 'click', exportGroupsCSV);
    safeAddListener('export-participants-csv', 'click', exportParticipantsCSV);

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

    // Admin Reveal (5-Tap on Footer Copyright) - v5.7 Simplified
    const footerReveal = document.getElementById('footer-reveal');
    let tapCount = 0;
    let tapTimer;

    if (footerReveal) {
        footerReveal.addEventListener('click', (e) => {
            tapCount++;
            clearTimeout(tapTimer);

            if (tapCount >= 5) {
                tapCount = 0;
                const pw = prompt("管理者パスワードを入力してください");
                if (pw === state.settings.adminPassword || pw === 'admin') {
                    isAdminAuth = true;
                    sessionStorage.setItem('isAdminAuth', 'true');
                    document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
                    showToast('✨ 管理者ログイン完了', 'success');
                    currentAdminTab = 'tab-list';
                    switchView(null, 'dashboard-view');
                } else if (pw !== null) {
                    showToast('パスワードが違います', 'error');
                }
            } else {
                tapTimer = setTimeout(() => { tapCount = 0; }, 3000); // 3s window for 5 taps
            }
        });
        // Block context menu
        footerReveal.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    // --- NEW: Cancel Edit functionality ---
    const cancelEditBtn = document.getElementById('cancel-edit-btn');
    if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', () => {
            if (confirm('修正を中止して戻りますか？（変更内容は保存されません）')) {
                resetForm();
                switchView(null, isAdminAuth ? 'dashboard-view' : 'registration-view');
                isAdminAuthAction = false;
                updateAppTitle();
            }
        });
    }

    // --- NEW: Back to Edit from Confirmation ---
    const backToEditFromConf = document.getElementById('back-to-edit-from-conf');
    if (backToEditFromConf) {
        backToEditFromConf.addEventListener('click', hideConfirmation);
    }

    // Check URL Parameters for special sources
    checkUrlParams();
}

function switchView(btnElement, targetId) {
    if (!targetId) return;

    // Auto-correction for legacy or incorrect names
    if (targetId === 'admin-view') targetId = 'dashboard-view';

    const targetView = document.getElementById(targetId);
    if (!targetView) {
        console.warn(`Attempted to switch to non-existent view: ${targetId}`);
        return;
    }

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

    targetView.classList.add('active');

    // Reset Title based on view
    if (targetId === 'dashboard-view') {
        document.getElementById('app-title').textContent = "管理者ダッシュボード";
    } else if (targetId === 'reception-view') {
        document.getElementById('app-title').textContent = "当日受付管理";
    } else {
        updateAppTitle();
    }

    if (targetId === 'registration-view') {
        const adminActions = document.getElementById('admin-extra-actions');
        if (adminActions) adminActions.classList.add('hidden');
        
        // v7.1.1: Always ensure a fresh form if not editing
        const editId = document.getElementById('edit-entry-id').value;
        if (!editId) {
            resetForm(); 
        }
        updateSourceAvailability();
    }
    if (targetId === 'dashboard-view') {
        updateDashboard();
        switchAdminTab(currentAdminTab); // Use stored tab instead of hardcoding 'tab-list'
    }
    if (targetId === 'reception-view') {
        updateReceptionList();
    }

    // v6.6: Dynamic Width Control
    const container = document.querySelector('.container');
    if (container) {
        if (targetId === 'dashboard-view' || targetId === 'reception-view' || targetId === 'public-stats-view') {
            container.classList.add('view-wide');
            document.body.classList.add('view-wide');
        } else {
            container.classList.remove('view-wide');
            document.body.classList.remove('view-wide');
        }
    }

    // Toggle admin visibility based on state
    const adminElements = document.querySelectorAll('.admin-only');
    adminElements.forEach(el => {
        if (isAdminAuth) el.classList.remove('hidden');
        else el.classList.add('hidden');
    });

    // Handle body class for toolbar space (v4.6)
    document.body.className = document.body.className.replace(/view-\S+/g, '').trim();
    document.body.classList.add('view-' + targetId);

    // Ensure Admin toolbar is handled separately if needed
    updateAdminToolbar();
}

function updateAdminToolbar() {
    let toolbar = document.getElementById('admin-toolbar');
    if (!isAdminAuth) {
        if (toolbar) toolbar.remove();
        return;
    }

    if (!toolbar) {
        toolbar = document.createElement('div');
        toolbar.id = 'admin-toolbar';
        toolbar.className = 'admin-toolbar';
        toolbar.innerHTML = `
            <div class="toolbar-content">
                <button class="btn-toolbar active" data-target="registration-view">受付</button>
                <button class="btn-toolbar" data-target="dashboard-view">管理</button>
                <button class="btn-toolbar" data-target="reception-view">当日</button>
                <button class="btn-toolbar logout" id="admin-logout">ログアウト</button>
            </div>
        `;
        document.body.appendChild(toolbar);

        toolbar.querySelectorAll('.btn-toolbar').forEach(btn => {
            if (btn.id === 'admin-logout') {
                btn.addEventListener('click', () => {
                    isAdminAuth = false;
                    sessionStorage.removeItem('isAdminAuth');
                    location.reload();
                });
                return;
            }
            btn.addEventListener('click', () => {
                const target = btn.getAttribute('data-target');
                switchView(btn, target);
                toolbar.querySelectorAll('.btn-toolbar').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });
    }

    // Update active state in toolbar
    toolbar.querySelectorAll('.btn-toolbar').forEach(btn => {
        if (btn.getAttribute('data-target') === currentViewId) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

function checkTimeframe() {
    const overlay = document.getElementById('timeframe-overlay');
    if (!overlay) return;

    // Admins bypass timeframe checks to allow setup and proxy registrations
    if (isAdminAuth) {
        overlay.classList.add('hidden');
        return;
    }

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

        // Always go to dashboard-view / tab-list unless it's a specific pending view that isn't dashboard
        currentAdminTab = 'tab-list';
        sessionStorage.setItem('currentAdminTab', 'tab-list');

        if (pendingView && pendingView !== 'dashboard-view') {
            switchView(null, pendingView);
        } else {
            switchView(null, 'dashboard-view');
            switchAdminTab('tab-list');
        }
        pendingView = null;

        // ★ admin-only要素の表示後にDOMが更新されてからスクロール
        setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
    } else {
        document.getElementById('admin-auth-error').classList.remove('hidden');
    }
}

function syncSettingsUI() {
    // Only update if the user isn't currently typing in the field
    const updateIfInactive = (id, value) => {
        const el = document.getElementById(id);
        if (el && document.activeElement !== el) {
            el.value = value || "";
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

    updateCapacityTotal();
    updateAppTitle();
    generateAdminQRCode(); // Ensure QR is generated when UI syncs
}



// Participant Row Management
function addParticipantRow(data = null, shouldFocus = true) {
    const list = document.getElementById('participant-list');
    if (!list) {
        console.error("Critical: 'participant-list' element not found during addParticipantRow");
        return;
    }
    const index = list.children.length;
    const row = document.createElement('div');
    row.className = 'participant-row';
    row.dataset.index = index;
    row.innerHTML = `
        <div class="participant-label">
            参加者 ${index + 1}${index === 0 ? ' <span class="label-rep">（代表者）</span>' : ''}
        </div>
        <div class="form-row">
            <div class="form-group" style="flex: 1; min-width: 140px;">
                <label>区分 <span class="required">*</span></label>
                <select class="p-type" required>
                    <option value="fisher" ${data && data.type === 'fisher' ? 'selected' : ''}>釣りをする</option>
                    <option value="observer" ${data && data.type === 'observer' ? 'selected' : ''}>見学のみ</option>
                </select>
            </div>
            <div class="form-group" style="flex: 2; min-width: 200px;">
                <label>お名前 <span class="required">*</span></label>
                <input type="text" class="p-name" required value="${data ? data.name : ''}" placeholder="${index === 0 ? '例: 山田 太郎 (代表者)' : '例: 山田 太郎'}">
            </div>
        </div>
        <div class="form-row">
            <div class="form-group" style="flex: 1; min-width: 140px;">
                <label>年代 <span class="required">*</span></label>
                <select class="p-age" required>
                    ${Object.entries(ageLabels).map(([val, label]) => `<option value="${val}" ${data && data.age === val ? 'selected' : ''}>${label}</option>`).join('')}
                </select>
            </div>
            <div class="form-group" style="flex: 1; min-width: 140px;">
                <label>地域 <span class="required">*</span></label>
                <input type="text" class="p-region" required value="${data && data.region ? data.region : ''}" placeholder="例: 大阪市">
            </div>
            <div class="form-group" style="flex: 1; min-width: 100px;">
                <label>Tシャツ <span class="required">*</span></label>
                <select class="p-tshirt" required>
                    ${tshirtSizes.map(size => `<option value="${size}" ${data && data.tshirtSize === size ? 'selected' : ''}>${size}</option>`).join('')}
                </select>
            </div>
        </div>
        <div class="form-group">
            <label>ニックネーム <span class="text-muted">(任意)</span></label>
            <input type="text" class="p-nick" value="${data && data.nickname ? data.nickname : ''}" placeholder="名簿用の愛称（空欄可）">
        </div>
        <div class="row-actions">
            <button type="button" class="btn-icon remove-p" title="削除">&times;</button>
        </div>
    `;
    list.appendChild(row);

    // v7.2.2: Auto-focus control to prevent unwanted scrolling on load
    if (index === 0 && shouldFocus) {
        setTimeout(() => {
            const nameInput = row.querySelector('.p-name');
            if (nameInput) nameInput.focus();
        }, 100);
    }
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
        age: row.querySelector('.p-age').value,
        tshirtSize: row.querySelector('.p-tshirt').value
    }));

    // Basic Validation Check (HTML5 Native)
    if (!document.getElementById('registration-form').reportValidity()) {
        showStatus("入力内容に不備があります。赤枠の部分をご確認ください。", "error", true);
        return;
    }

    // Minimum 1 participant validation
    if (participants.length === 0) {
        showStatus("参加者を1名以上登録してください。", "error");
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
        .filter(en => en.id !== editId && en.source === source && en.status !== 'cancelled')
        .reduce((sum, en) => sum + en.fishers, 0);

    let capacityLimit = 0;
    if (source === '一般') capacityLimit = state.settings.capacityGeneral;
    else if (source === 'みん釣り') capacityLimit = state.settings.capacityMintsuri;
    else if (source === '水宝') capacityLimit = state.settings.capacitySuiho;
    else if (source === 'ハリミツ') capacityLimit = state.settings.capacityHarimitsu;

    if (currentCategoryFishers + fisherCount > capacityLimit) {
        showStatus(`大変申し訳ありません。この枠（${source}）は定員に達したため、現在受付を停止しております。`, "error");
        return;
    }

    // Aggregate Capacity Check (Total 250)
    const totalFishers = state.entries
        .filter(en => en.id !== editId && en.status !== 'cancelled')
        .reduce((sum, en) => sum + en.fishers, 0);

    if (totalFishers + fisherCount > 250) {
        showStatus("大変申し訳ありません。大会全体の定員に達したため、受付を終了いたしました。", "error");
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
        li.textContent = `${idx + 1}. ${typeLabel} ${p.name} [${p.tshirtSize}]` + (p.nickname ? ` (${p.nickname})` : '');
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

async function handleRegistration() {
    // v7.3.2: Submission Timeframe Guard
    const now = new Date();
    if (!isAdminAuth) {
        if (state.settings.startTime && now < new Date(state.settings.startTime)) {
            alert('受付開始前です。まだ申し込みはできません。');
            return;
        }
        if (state.settings.deadline && now > new Date(state.settings.deadline)) {
            alert('受付は終了しました。');
            return;
        }
    }

    // Re-gather data (already validated)
    const editId = document.getElementById('edit-entry-id').value;
    const pRows = document.querySelectorAll('.participant-row');
    const participants = Array.from(pRows).map(row => ({
        type: row.querySelector('.p-type').value,
        name: row.querySelector('.p-name').value,
        nickname: row.querySelector('.p-nick').value,
        region: row.querySelector('.p-region').value,
        age: row.querySelector('.p-age').value,
        tshirtSize: row.querySelector('.p-tshirt').value
    }));

    const sourceEl = document.querySelector('input[name="reg-source"]:checked');
    const source = sourceEl ? sourceEl.value : '一般';
    const fisherCount = participants.filter(p => p.type === 'fisher').length;
    const observerCount = participants.filter(p => p.type === 'observer').length;

    // Final Capacity Check (Double guard)
    const currentCategoryFishers = state.entries
        .filter(en => en.id !== editId && en.source === source && en.status !== 'cancelled')
        .reduce((sum, en) => sum + en.fishers, 0);
    const totalNow = state.entries
        .filter(en => en.id !== editId && en.status !== 'cancelled')
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

    let entryData = {
        transactionId: Date.now() + Math.random().toString(36).substring(2, 10), // Unique ID for deduplication
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

    // Loading state for UX
    const submitBtn = document.getElementById('submit-registration');
    const originalBtnText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = "送信中... そのままお待ちください";

    // v7.0: 二重登録防止のため、送信開始時に内容を一時保存
    try {
        entryData._ts = Date.now();
        localStorage.setItem('fishing_app_pending_reg', JSON.stringify(entryData));
        
        // v6.9: Random jitter (0-500ms) to spread initial burst load
        await new Promise(r => setTimeout(r, Math.random() * 500));

        if (editId) {
            entryData.id = editId;
            const idx = state.entries.findIndex(en => en.id === editId);
            state.entries[idx] = entryData;
            showToast('登録内容を更新しました', 'success');
            await saveData();
        } else {
            // v6.9: Robust Retry Loop for atomic submission
            let attempts = 0;
            let success = false;
            while (attempts < 3 && !success) {
                try {
                    const submitPayload = { action: 'submit', entry: entryData };
                    const response = await fetch(GAS_WEB_APP_URL, {
                        method: 'POST',
                        mode: 'cors',
                        headers: { 'Content-Type': 'text/plain' },
                        body: JSON.stringify(submitPayload)
                    });

                    if (!response.ok) throw new Error("Server busy");
                    const result = await response.json();
                    if (result.status === 'success' && result.entry) {
                        entryData = result.entry;
                        state.entries.push(entryData);
                        localStorage.setItem('fishing_app_v3_data', JSON.stringify(state));
                        localStorage.removeItem('fishing_app_pending_reg'); // 成功したので一時データを削除
                        showToast('登録が完了しました！', 'success');
                        success = true;
                    } else {
                        throw new Error(result.message || "Unknown error");
                    }
                } catch (err) {
                    attempts++;
                    if (attempts >= 3) throw err;
                    submitBtn.textContent = `混雑しています... 再試行中 (${attempts}/3)`;
                    // Exponential backoff: 1s, 2s, 4s... with random jitter
                    const waitTime = Math.pow(2, attempts) * 1000 + (Math.random() * 1000);
                    await new Promise(r => setTimeout(r, waitTime));
                }
            }
        }

        updateDashboard();
        showToast('送信中... 少々お待ちください', 'info');
        await sendEmailViaGAS(entryData);

        if (isAdminAuthAction) {
            switchView(null, 'dashboard-view');
            showToast('修正を保存しました', 'success');
        } else {
            showResult(entryData);
        }
    } catch (e) {
        console.error("Registration error:", e);
        const errorHtml = `
            <div style="font-weight:bold; margin-bottom:0.5rem;">通信エラー（または混雑）が発生しました。</div>
            <p style="font-size:0.9rem; margin-bottom:1rem;">
                データが送信されている可能性があります。<strong>何度もボタンを押さず</strong>、
                まずは下の「確認ボタン」を押して番号が出るか試してください。<br>
                （または数分待ってからページを再読み込みしてください）
            </p>
            <button type="button" class="btn-primary btn-check-status" onclick="handleCheckStatus()" 
                style="background:#00b894; border:none; padding:8px 15px; border-radius:8px;">✅ 登録されたか確認する</button>
        `;
        showStatus(errorHtml, "error");
        
        // showStatusがテキストのみを想定している場合があるため、innerHTMLを許容するように修正が必要かも
        // 手動でHTMLを流し込む
        const statusDiv = document.getElementById('registration-status');
        if (statusDiv) statusDiv.innerHTML = errorHtml;

        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText;
    } finally {
        // v6.9: Guarantee sync status cleanup
        updateSyncStatus('success'); 
    }
}

async function sendEmailViaGAS(entryData) {
    if (!entryData.email) return;
    try {
        const payload = {
            action: 'sendEmail',
            id: entryData.id,
            groupName: entryData.groupName,
            email: entryData.email,
            phone: entryData.phone,
            representative: entryData.representative,
            fishers: entryData.fishers,
            observers: entryData.observers,
            source: entryData.source,
            timestamp: entryData.timestamp,
            participants: entryData.participants || []
        };

        // Added keepalive for survival through potential lifecycle changes
        await fetch(GAS_WEB_APP_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(payload),
            keepalive: true 
        });
        console.log('Email request sent to GAS (awaited)');
    } catch (err) {
        console.error('Email fetch error:', err);
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
    document.getElementById('edit-entry-id').value = entry.id;
    document.getElementById('group-name').value = entry.groupName;
    document.getElementById('representative-name').value = entry.representative;
    document.getElementById('rep-phone').value = entry.phone;
    document.getElementById('rep-email').value = entry.email;
    document.getElementById('rep-email-confirm').value = entry.email;
    document.getElementById('edit-password').value = entry.password;

    const list = document.getElementById('participant-list');
    list.innerHTML = '';
    entry.participants.forEach(p => addParticipantRow(p, false));

    // UI Adjustments for Edit Mode
    const cancelBtn = document.getElementById('cancel-edit-btn');
    if (cancelBtn) cancelBtn.classList.remove('hidden');

    // Ensure all success/confirm sections are hidden, and FORM is shown
    document.getElementById('registration-form').classList.remove('hidden');
    document.getElementById('confirmation-section').classList.add('hidden');
    document.getElementById('registration-result').classList.add('hidden');
    
    const regCard = document.getElementById('registration-card');
    if (regCard) regCard.classList.remove('hidden');
    
    // Switch to registration-view if not already there (safety)
    // switchView(null, 'registration-view'); 
    
    // Show Admin Actions if triggered from dashboard
    const adminActions = document.getElementById('admin-extra-actions');
    if (adminActions && (isAdminAuth || isAdminAuthAction)) {
        adminActions.classList.remove('hidden');

        // Connect buttons to global functions
        document.getElementById('admin-resend-email').onclick = () => window.resendEmail(entry.id);
        document.getElementById('admin-cancel-entry').onclick = () => window.cancelEntry(entry.id);
        document.getElementById('admin-restore-entry').onclick = () => window.restoreEntry(entry.id);

        // Toggle cancel/restore visibility
        document.getElementById('admin-cancel-entry').classList.toggle('hidden', entry.status === 'cancelled');
        document.getElementById('admin-restore-entry').classList.toggle('hidden', entry.status !== 'cancelled');
    }

    // Show cancel edit button
    const cancelEditBtn = document.getElementById('cancel-edit');
    if (cancelEditBtn) cancelEditBtn.classList.remove('hidden');

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

    // Populate Recovery Backup Details (v6.3)
    document.getElementById('res-rep-name').textContent = entry.representative;
    document.getElementById('res-rep-phone').textContent = entry.phone;
    document.getElementById('res-rep-email').textContent = entry.email;
    
    const pList = document.getElementById('res-participant-list');
    if (pList) {
        pList.innerHTML = entry.participants.map(p => 
            `<li>${p.name} (${p.type === 'fisher' ? '釣り' : '見学'})</li>`
        ).join('');
    }

    // Screenshot Optimization: Hide the top registration card frame to save space
    const regCard = document.getElementById('registration-card');
    if (regCard) regCard.classList.add('hidden');

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
    addParticipantRow(null, false);

    // Restore the registration card frame
    const regCard = document.getElementById('registration-card');
    if (regCard) regCard.classList.remove('hidden');

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
    setTimeout(() => window.scrollTo(0, 0), 50); // Delayed to ensure focus scroll is countered
}

function showStatus(msg, type, noScroll = false) {
    const div = document.getElementById('registration-status');
    div.innerHTML = msg;
    div.className = `alert alert-${type}`;
    div.classList.remove('hidden');
    if (!noScroll) window.scrollTo(0, 0);
}

// Admin / Dashboard
function clearLocalCache() {
    if (!confirm("ブラウザに保存されているキャッシュを削除し、クラウドから最新データを再取得しますか？\n（現在送信中のデータがある場合は失われる可能性があります）")) {
        return;
    }
    localStorage.removeItem('fishing_app_v3_data');
    localStorage.removeItem('fishing_app_pending_reg');
    showToast("キャッシュをクリアしました。再読み込みします...", "info");
    setTimeout(() => location.reload(), 1000);
}

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
        const totalObservers = state.entries.filter(e => e.status !== 'cancelled').reduce((s, e) => s + e.observers, 0);
        const checkedInCount = state.entries.filter(e => e.status === 'checked-in').length;
        const absentCount = state.entries.filter(e => e.status === 'absent').length;
        const validEntriesCount = state.entries.filter(e => e.status !== 'cancelled').length;

        // Global Stats Summary Cards (v5.4 Compact)
        renderGlobalStatsSummary(validEntriesCount, totalFishers, totalObservers, checkedInCount, absentCount);

        // Email count
        updateBulkMailCount();

        // Splits
        updateSplitUI('ippan', fishersIppan, state.settings.capacityGeneral, observersIppan);
        updateSplitUI('mintsuri', fishersMintsuri, state.settings.capacityMintsuri, observersMintsuri);
        updateSplitUI('suiho', fishersSuiho, state.settings.capacitySuiho, observersSuiho);
        updateSplitUI('harimitsu', fishersHarimitsu, state.settings.capacityHarimitsu, observersHarimitsu);

        // v7.3: Individual special URLs
        ['mintsuri', 'harimitsu', 'stats'].forEach(key => {
            const el = document.getElementById(`url-${key}`);
            if (el) {
                const baseUrl = window.location.href.split('?')[0];
                if (key === 'stats') {
                    el.value = `${baseUrl}?view=stats`;
                } else {
                    el.value = `${baseUrl}?src=${encodeURIComponent(key)}`;
                }
            }
        });

        // Dashboard List Rendering (Fixed & Cleaned v7.3.0)
        const list = document.getElementById('entry-list');
        const searchTerm = document.getElementById('dashboard-search').value.toLowerCase();
        list.innerHTML = '';

        state.entries.slice().reverse().forEach(e => {
            // Search / Filter logic
            const matchesEntrySearch = e.id.toLowerCase().includes(searchTerm) || e.groupName.toLowerCase().includes(searchTerm) || e.representative.toLowerCase().includes(searchTerm);
            const pNames = e.participants.map(p => p.name).join(', ');
            const matchesParticipantSearch = pNames.toLowerCase().includes(searchTerm);
            if (!matchesEntrySearch && !matchesParticipantSearch) return;

            if (dashboardFilter !== 'all' && e.source !== dashboardFilter) return;

            const tr = document.createElement('tr');
            if (e.status === 'cancelled') tr.classList.add('row-cancelled');
            else if (e.status === 'checked-in') tr.classList.add('row-checked-in');

            const badgeMap = { '一般': 'badge-ippan', 'みん釣り': 'badge-mintsuri', '水宝': 'badge-suiho', 'ハリミツ': 'badge-harimitsu' };
            const statusLabel = e.status === 'checked-in' ? '✅ 受済' : e.status === 'absent' ? '❌ 欠席' : e.status === 'cancelled' ? '🚫 無効' : '⏳ 待機';

            const rep = e.participants[0] || { name: e.representative };
            const pSummary = `
                <div style="font-weight:700;">${rep.name}</div>
                <div style="font-size: 0.75rem; color: #64748b; white-space:normal; overflow:visible; max-width:100%;">
                    ${e.participants.slice(1).map(p => p.name).join(', ')}
                </div>
            `;


            const regTime = e.registeredAt ? new Date(e.registeredAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--:--';

            tr.innerHTML = `
                <td><span class="id-badge">${e.id}</span></td>
                <td><span class="badge ${badgeMap[e.source] || 'badge-ippan'}">${e.source}</span></td>
                <td><div style="font-weight:800; ${e.status === 'cancelled' ? 'text-decoration:line-through' : ''}">${e.groupName}</div></td>
                <td>${pSummary}</td>
                <td><small>${e.fishers}/${e.observers}</small></td>
                <td><span style="font-size:0.75rem; font-weight:700;">${statusLabel}</span></td>
                <td><small>${regTime}</small></td>
                <td>
                    <div style="display:flex; gap:0.3rem;">
                        <button class="btn-check-in ${e.status !== 'pending' && e.status !== 'cancelled' ? 'active' : ''}" onclick="jumpToReception('${e.id}')" ${e.status === 'cancelled' ? 'disabled' : ''}>受付</button>
                        <button class="btn-text" onclick="requestAdminEdit('${e.id}')" style="font-size:0.7rem">修正</button>
                    </div>
                </td>
            `;
            list.appendChild(tr);
        });

        renderIkesuWorkspace();
    } catch (e) {
        console.error("Dashboard update failed:", e);
    }
}

// v7.3.0: Public Statistics Rendering (Security Optimized)
function renderPublicStats() {
    const container = document.getElementById('public-stats-container');
    if (!container) return;

    const validEntries = state.entries.filter(e => e.status !== 'cancelled');
    
    const categories = [
        { id: 'ippan', name: '一般', source: '一般', capacity: state.settings.capacityGeneral, color: 'ippan' },
        { id: 'mintsuri', name: 'みん釣り', source: 'みん釣り', capacity: state.settings.capacityMintsuri, color: 'mintsuri' },
        { id: 'suiho', name: '水宝', source: '水宝', capacity: state.settings.capacitySuiho, color: 'suiho' },
        { id: 'harimitsu', name: 'ハリミツ', source: 'ハリミツ', capacity: state.settings.capacityHarimitsu, color: 'harimitsu' }
    ];

    let html = `<div class="public-stats-grid">`;

    categories.forEach(cat => {
        const catEntries = validEntries.filter(e => e.source === cat.source);
        const count = catEntries.reduce((sum, e) => sum + e.fishers, 0);
        const remaining = Math.max(0, cat.capacity - count);
        const progress = Math.min(100, (count / cat.capacity) * 100);
        const statusText = remaining === 0 ? '満員' : `あと ${remaining} 名`;

        html += `
            <div class="public-stat-card bg-light border-top-${cat.color}">
                <div class="public-stat-label">
                    <span>${cat.name}</span>
                    <span class="badge ${count >= cat.capacity ? 'badge-danger' : 'badge-success'}">${statusText}</span>
                </div>
                <div class="public-stat-main">
                    <span class="public-stat-value">${count}</span>
                    <span class="public-stat-unit">名</span>
                </div>
                <div class="public-progress-container">
                    <div class="public-progress bg-${cat.color}" style="width: ${progress}%"></div>
                </div>
                <div class="public-stat-capacity mt-3">
                    <span>定員: ${cat.capacity} 名</span>
                    <span>充足率: <strong>${Math.round(progress)}%</strong></span>
                </div>
            </div>
        `;
    });

    html += `</div>`;
    
    // Total Summary
    const totalCount = validEntries.reduce((sum, e) => sum + e.fishers, 0);
    const totalCapacity = state.settings.capacityGeneral + state.settings.capacityMintsuri + state.settings.capacitySuiho + state.settings.capacityHarimitsu;
    
    html += `
        <div class="card mt-4" style="background:#2c3e50; color:white; border:none;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <div style="font-size:0.9rem; opacity:0.8;">全てのカテゴリー 合計</div>
                    <div style="font-size:2.5rem; font-weight:900;">${totalCount} <small style="font-size:1rem; opacity:0.8;">/ ${totalCapacity} 名</small></div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:0.8rem; opacity:0.7;">最終更新: ${new Date().toLocaleTimeString()}</div>
                    <div style="font-size:1.2rem; font-weight:700; color:#3498db;">${totalCapacity - totalCount} 名 空きあり</div>
                </div>
            </div>
        </div>
    `;

    container.innerHTML = html;
}

// Global Stats Rendering (v7.3.0 Global Scope)
function renderGlobalStatsSummary(groups, fishers, observers, checkedIn, absent) {
    const container = document.getElementById('global-stats-summary');
    if (!container) return;

    container.innerHTML = `
        <div class="stats-summary-grid">
            <div class="summary-card">
                <div class="summary-label">総登録グループ</div>
                <div class="summary-value" id="total-registrations">${groups} <small>組</small></div>
            </div>
            <div class="summary-card">
                <div class="summary-label">釣り参加者合計</div>
                <div class="summary-value"><span id="current-fishers">${fishers}</span> <small>/ 250</small></div>
            </div>
            <div class="summary-card">
                <div class="summary-label">見学者合計</div>
                <div class="summary-value" id="current-observers">${observers} <small>名</small></div>
            </div>
            <div class="summary-card" style="border-top: 5px solid #10b981;">
                <div class="summary-label">当日受付状況</div>
                <div class="summary-value" style="font-size: 1.1rem; line-height: 1.4;">
                    <span style="color: var(--primary-color)">来場: <span id="checked-in-count">${checkedIn}</span></span> / 
                    <span style="color: var(--error-color)">欠席: <span id="absent-count">${absent}</span></span>
                </div>
                <div style="font-size: 0.7rem; color: #64748b; margin-top: 4px;">全 <span id="total-groups-count">${groups}</span> 組</div>
            </div>
        </div>
    `;
}

// Admin Debug Methods
async function testEmailFeature() {
    const testEmail = prompt("テストメールの送信先を入力してください:", "test@example.com");
    if (!testEmail) return;
    showToast('テストメール送信中...', 'info');
    try {
        await sendEmailViaGAS({
            action: 'sendEmail', id: 'TEST-000', groupName: 'テスト',
            email: testEmail, representative: 'テスト氏名',
            fishers: 1, observers: 0, source: '一般', participants: [{name: 'テスト参加者', type: 'fisher'}]
        });
        alert("送信リクエスト完了。設定URL: " + GAS_WEB_APP_URL);
    } catch (e) { alert("エラー: " + e.message); }
}


// --- Reception View Logic ---

function updateReceptionList() {
    const list = document.getElementById('reception-group-list');
    const searchTerm = document.getElementById('reception-search').value.toLowerCase();
    const showCompleted = document.getElementById('show-completed-toggle').checked;

    list.innerHTML = '';

    const processedEntries = state.entries.filter(e => e.status !== 'cancelled').map(e => {
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

        const badgeClass = e.source === 'みん釣り' ? 'badge-mintsuri' : e.source === '一般' ? 'badge-ippan' : e.source === 'ハリミツ' ? 'badge-harimitsu' : 'badge-suiho';
        
        item.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.3rem;">
                <strong style="font-size:1.1rem; color:#2d3436;">${e.id} | ${e.groupName}</strong>
                <span class="badge ${badgeClass}" style="font-size:0.7rem; padding:0.1rem 0.4rem;">${e.source}</span>
            </div>
            <div class="item-meta" style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:1rem; color:#636e72;">${e.representative}</span>
                <span style="font-size:0.9rem; font-weight:700; color: #0984e3;">${e.isCompleted ? '✅ 受付済' : `確認: ${e.finishedCount} / ${e.totalCount}`}</span>
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
                <i class="icon-search">🔍</i>
                <p>左側のリストからグループを選択してください。</p>
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
                <!-- Representative is always included first -->
                <div class="participant-check-row ${entry.status === 'checked-in' ? 'checked-in' : ''} ${entry.status === 'absent' ? 'absent' : ''}" style="border-left: 4px solid var(--primary-color);">
                    <div class="p-info">
                        <span class="p-name">代表者: ${entry.representative}</span>
                        <span class="p-meta">一括受付ステータス</span>
                    </div>
                    <div class="p-status-actions">
                        <button class="btn-status in ${entry.status === 'checked-in' ? 'active' : ''}" onclick="updateGroupStatus('${entry.id}', 'checked-in')">受付</button>
                        <button class="btn-status out ${entry.status === 'absent' ? 'active' : ''}" onclick="updateGroupStatus('${entry.id}', 'absent')">欠席</button>
                    </div>
                </div>

            ${entry.participants.map((p, idx) => {
        const typeClass = p.type === 'fisher' ? 'p-badge-fisher' : 'p-badge-observer';
        const typeLabel = p.type === 'fisher' ? '釣り' : '見学';
        return `
                <div class="participant-check-row ${p.status === 'checked-in' ? 'checked-in' : ''} ${p.status === 'absent' ? 'absent' : ''}">
                    <div class="p-info">
                        <span class="p-name">
                            <span class="p-badge ${typeClass}">${typeLabel}</span>
                            ${p.name} ${p.nickname ? `<small>(${p.nickname})</small>` : ''}
                        </span>
                        <span class="p-meta">${p.region} | ${ageLabels[p.age] || p.age} | [${p.tshirtSize || '不明'}]</span>
                    </div>
                    <div class="p-status-actions">
                        <button class="btn-status in ${p.status === 'checked-in' ? 'active' : ''}" onclick="updateParticipantStatus('${entry.id}', ${idx}, 'checked-in')">受付</button>
                        <button class="btn-status out ${p.status === 'absent' ? 'active' : ''}" onclick="updateParticipantStatus('${entry.id}', ${idx}, 'absent')">欠席</button>
                        <button class="btn-status" onclick="updateParticipantStatus('${entry.id}', ${idx}, 'pending')">ー</button>
                    </div>
                </div>
                `;
    }).join('')}
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

    entry.lastModified = new Date().toLocaleString('ja-JP');
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

    entry.lastModified = new Date().toLocaleString('ja-JP');
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
    return state.entries.filter(e => e.source === category && e.status !== 'cancelled').reduce((s, e) => s + e.fishers, 0);
}

function sumCategoryObservers(category) {
    return state.entries.filter(e => e.source === category && e.status !== 'cancelled').reduce((s, e) => s + e.observers, 0);
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
        if (e.status === 'cancelled') return;
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

window.cancelEntry = function (id) {
    const entry = state.entries.find(e => e.id === id);
    if (!entry) return;

    if (entry.status === 'cancelled') {
        if (confirm(`受付番号「${id}」を元の状態に復元しますか？`)) {
            entry.status = 'pending';
            entry.lastModified = new Date().toLocaleString('ja-JP');
            saveData();
            updateDashboard();
            showToast(`受付番号 「${id}」 を復元しました`, 'success');
        }
    } else {
        if (confirm(`本当に受付番号「${id}」をキャンセル（辞退扱い）にしますか？\n消去はされず、記録として残ります。`)) {
            entry.status = 'cancelled';
            entry.lastModified = new Date().toLocaleString('ja-JP');
            saveData();
            updateDashboard();
            showToast(`受付番号 「${id}」 をキャンセルしました`, 'success');
        }
    }
};

window.copyShareUrl = function (id = 'public-share-url') {
    const urlInput = document.getElementById(id);
    if (!urlInput) return;
    urlInput.select();
    document.execCommand('copy');
    showToast('コピーしました！', 'success');
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


// Settings
window.triggerSettingsSave = function () {
    handleSettingsUpdate({ preventDefault: () => { } });
};

function updateAppTitle() {
    const titleEl = document.getElementById('app-title');
    if (titleEl) {
        titleEl.textContent = state.settings.competitionName || "釣り大会 受付";
    }
}

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
    checkTimeframe(); // Instant refresh of lock screen status
    updateAppTitle();
    showToast('大会設定をすべて保存しました', 'success');
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

window.confirmReset = async function () {
    if (confirm('全ての名簿データを削除します。本当によろしいですか？（設定内容は維持されます）')) {
        state.entries = [];
        state.lastUpdated = Date.now();

        showToast('リセット中...', 'info');

        try {
            // v6.8.1: Bypass saveData's "Fetch-First & Merge" logic to force-clear cloud
            await syncToCloud();
            localStorage.setItem('fishing_app_v3_data', JSON.stringify(state));
            location.reload();
        } catch (e) {
            console.error('Reset failed:', e);
            showToast('クラウドの消去に失敗しました。', 'error');
            setTimeout(() => location.reload(), 2000);
        }
    }
};

// Exports
function exportGroupsCSV() {
    if (state.entries.length === 0) return alert('データがありません');
    const headers = ['受付番号', '区分', 'グループ名', '代表者名', '電話番号', 'メール', '釣り人数', '見学人数', '登録時間'];
    const rows = state.entries.map(e => [
        e.id,
        e.source,
        e.groupName,
        e.representative,
        e.phone,
        e.email,
        e.fishers,
        e.observers,
        formatDateForCSV(e.timestamp)
    ]);
    downloadCSV("groups", headers, rows);
}

function exportParticipantsCSV() {
    if (state.entries.length === 0) return alert('データがありません');
    const headers = ['受付番号', '区分', 'グループ名', '代表者名', '参加区分', '参加者名', 'ニックネーム', 'Tシャツ', '地域', '年代', '登録時間'];
    const rows = [];
    state.entries.forEach(e => {
        e.participants.forEach(p => {
            const partType = p.type === 'observer' ? '見学' : '釣り';
            rows.push([
                e.id,
                e.source,
                e.groupName,
                e.representative,
                partType,
                p.name,
                p.nickname,
                p.tshirtSize || "",
                p.region,
                ageLabels[p.age] || p.age,
                formatDateForCSV(e.timestamp)
            ]);
        });
    });
    downloadCSV("participants", headers, rows);
}

function downloadCSV(name, headers, rows) {
    let csv = "\uFEFF" + headers.join(",") + "\n";
    rows.forEach(row => csv += row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",") + "\n");
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const dateStr = new Date().toLocaleDateString('ja-JP').replace(/\//g, '');
    link.href = URL.createObjectURL(blob);
    link.download = `fishing_${name}_${dateStr}.csv`;
    link.click();
    showToast(`${name} CSVを出力しました`, 'info');
}

function formatDateForCSV(dateStr) {
    if (!dateStr) return "";
    try {
        // Remove 000Z and other ISO noise if present, or just use the string if it's already JST
        return dateStr.split('.')[0].replace('T', ' ').replace('Z', '');
    } catch (e) {
        return dateStr;
    }
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

    if (tabId === 'tab-settings' || tabId === 'tab-capacity') {
        syncSettingsUI(); // Ensure settings fields are populated
        generateAdminQRCode();
    }
    if (tabId === 'tab-ikesu') renderIkesuWorkspace();
    if (tabId === 'tab-stats') renderBreakdownStats();

    // Scroll to top
    window.scrollTo(0, 0);
}

function generateAdminQRCode() {
    const container = document.getElementById('admin-qr-code-container');
    const urlDisplay = document.getElementById('admin-url-display');
    if (!container) return;

    // Use Public URL (Share URL). If local, fallback to GitHub Pages URL
    let baseUrl = window.location.href.split('#')[0].split('?')[0];
    const isLocal = baseUrl.startsWith('file://') || baseUrl.includes('127.0.0.1') || baseUrl.includes('localhost');

    if (isLocal) {
        baseUrl = "https://harimitsu0123.github.io/fishing-entry/";
    }

    urlDisplay.textContent = baseUrl;
    document.getElementById('public-share-url').value = baseUrl;

    // Populate Specialized URLs
    const mintsuriUrl = `${baseUrl}?src=mintsuri`;
    const harimitsuUrl = `${baseUrl}?src=harimitsu`;
    const suihoUrl = `${baseUrl}?src=suiho`;

    if (document.getElementById('url-mintsuri')) document.getElementById('url-mintsuri').value = mintsuriUrl;
    if (document.getElementById('url-harimitsu')) document.getElementById('url-harimitsu').value = harimitsuUrl;
    if (document.getElementById('url-suiho')) document.getElementById('url-suiho').value = suihoUrl;

    if (isLocal) {
        container.innerHTML = `
            <div style="font-size: 0.7rem; color: #2ecc71; line-height: 1.2; margin-bottom: 5px;">
                ✅ 公開版のQRを表示中<br>
                (ローカル環境)
            </div>
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(baseUrl)}" alt="Registration QR code" style="max-width: 100%; height: auto;" onload="this.parentElement.style.background='white'">
        `;
        return;
    }

    // Generate QR using QRServer API
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(baseUrl)}`;

    container.innerHTML = `
        <img src="${qrUrl}" alt="Registration QR code" style="max-width: 100%; height: auto;" onload="this.parentElement.style.background='white'">
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
    if (totalCurrent >= 240) {
        showToast('すでに定員に近いため、これ以上生成できません。', 'error');
        return;
    }

    if (!confirm('各枠の定員を守りつつ、10組分（最大40名程度）のテストデータを追加します。よろしいですか？')) return;

    const sources = ['一般', 'みん釣り', '水宝', 'ハリミツ'];
    const names = ['田中', '佐藤', '鈴木', '高橋', '渡辺', '伊藤', '山本', '中村', '小林', '加藤'];
    const groups = ['チーム海', '釣りキチ同盟', '波止場会', '大漁祈願', 'フィッシングクラブ'];
    const regions = ['大阪市', '堺市', '姫路市', '明石市', '神戸市', '西宮市'];
    const ages = ['10s', '20s', '30s', '40s', '50s', '60s', '70s', '80s'];

    let entriesAdded = 0;
    let fishersAddedTotal = 0;

    // Loop for 10 entries
    for (let i = 0; i < 10; i++) {
        const totalNow = state.entries.reduce((s, e) => s + e.fishers, 0);
        if (totalNow >= 245) break;


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
        const numObservers = Math.floor(Math.random() * 3); // 0-2 observers
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
        for (let j = 0; j < numObservers; j++) {
            participants.push({
                type: 'observer',
                name: repName + 'の見学' + (j + 1),
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
            observers: numObservers,
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

function checkUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const src = params.get('src');

    const view = params.get('view');

    // v7.3.0: Handle Public Stats View
    if (view === 'stats') {
        switchView('public-stats-view');
        // Initial fetch will trigger render
        return;
    }

    if (src) {
        const validSources = {
            'mintsuri': 'みん釣り',
            'harimitsu': 'ハリミツ',
            'suiho': '水宝'
        };

        if (validSources[src]) {
            injectSpecialSource(validSources[src]);
            // v7.2.2: Force top scroll for category links
            setTimeout(() => window.scrollTo(0, 0), 100);
        }
    }
}

function injectSpecialSource(sourceName) {
    const selector = document.getElementById('main-source-selector');
    if (!selector) return;

    // Clear existing
    selector.innerHTML = '';

    const badgeClassMap = {
        'みん釣り': 'badge-mintsuri',
        'ハリミツ': 'badge-harimitsu',
        '水宝': 'badge-suiho'
    };

    const badgeClass = badgeClassMap[sourceName] || 'badge-ippan';
    const label = document.createElement('label');
    label.className = 'source-option';
    label.innerHTML = `
        <input type="radio" name="reg-source" value="${sourceName}" checked required>
        <span class="source-label">
            <span class="badge ${badgeClass}">${sourceName}</span>
        </span>
    `;
    selector.appendChild(label);

    // 特別URLの場合のみ受付区分欄を表示
    const group = document.getElementById('source-selector-group');
    if (group) group.classList.remove('hidden');

    // Update availability logic for this new radio
    updateSourceAvailability();
}

// ==========================================
// IKESU ASSIGNMENT LOGIC (Drag & Drop, Modals)
// ==========================================

window.openIkesuModal = function (id = null) {
    document.getElementById('ikesu-modal').classList.remove('hidden');
    if (id) {
        const ikesu = state.settings.ikesuList.find(i => i.id === id);
        if (ikesu) {
            document.getElementById('ikesu-modal-title').textContent = "イケスの編集";
            document.getElementById('ikesu-edit-id').value = ikesu.id;
            document.getElementById('ikesu-name').value = ikesu.name;
            document.getElementById('ikesu-capacity').value = ikesu.capacity;
            return;
        }
    }
    document.getElementById('ikesu-modal-title').textContent = "イケスの追加";
    document.getElementById('ikesu-edit-id').value = '';
    document.getElementById('ikesu-name').value = '';
    document.getElementById('ikesu-capacity').value = '15';
};

window.closeIkesuModal = function () {
    document.getElementById('ikesu-modal').classList.add('hidden');
};

window.saveIkesu = function () {
    const id = document.getElementById('ikesu-edit-id').value;
    const name = document.getElementById('ikesu-name').value.trim();
    const capacity = parseInt(document.getElementById('ikesu-capacity').value, 10);

    if (!name || isNaN(capacity) || capacity < 1) {
        alert("名前と定員（1以上）を正しく入力してください。");
        return;
    }

    if (!state.settings.ikesuList) state.settings.ikesuList = [];

    if (id) {
        // Edit
        const ikesu = state.settings.ikesuList.find(i => i.id === id);
        if (ikesu) {
            ikesu.name = name;
            ikesu.capacity = capacity;
        }
    } else {
        // Add
        state.settings.ikesuList.push({
            id: 'ikesu-' + Date.now(),
            name: name,
            capacity: capacity
        });
    }

    state.lastUpdated = Date.now();
    saveData();


    closeIkesuModal();
    renderIkesuWorkspace();
};

window.deleteIkesu = function (id) {
    if (!confirm('本当にこのイケスを削除しますか？\n割り当てられていた人は未割り当てに戻ります。')) return;

    state.settings.ikesuList = state.settings.ikesuList.filter(i => i.id !== id);

    // Clear ikesuId for assigned participants
    state.entries.forEach(e => {
        e.participants.forEach(p => {
            if (p.ikesuId === id) p.ikesuId = null;
        });
    });

    state.lastUpdated = Date.now();
    saveData();


    renderIkesuWorkspace();
};

window.allowDrop = function (ev) {
    ev.preventDefault();
    ev.currentTarget.classList.add('drag-over');
};

window.handleDragLeave = function (ev) {
    ev.currentTarget.classList.remove('drag-over');
};

window.dragGroup = function (ev, entryId) {
    ev.dataTransfer.setData("type", "group");
    ev.dataTransfer.setData("id", entryId);
};

window.dragPerson = function (ev, entryId, personIdx) {
    ev.dataTransfer.setData("type", "person");
    ev.dataTransfer.setData("id", entryId);
    ev.dataTransfer.setData("idx", personIdx);
    ev.stopPropagation(); // Prevent group dragging if child dragged
};

window.dropToUnassigned = function (ev) {
    ev.preventDefault();
    ev.currentTarget.classList.remove('drag-over');
    processDrop(ev, null);
};

window.dropToIkesu = function (ev, ikesuId) {
    ev.preventDefault();
    ev.currentTarget.classList.remove('drag-over');
    processDrop(ev, ikesuId);
};

function processDrop(ev, ikesuId) {
    const type = ev.dataTransfer.getData("type");
    const entryId = ev.dataTransfer.getData("id");

    const entry = state.entries.find(e => e.id === entryId);
    if (!entry) return;

    if (type === "group") {
        // Move all participants of the group to the Target Ikesu
        entry.participants.forEach(p => p.ikesuId = ikesuId);
    } else if (type === "person") {
        const idx = parseInt(ev.dataTransfer.getData("idx"), 10);
        if (entry.participants[idx]) {
            entry.participants[idx].ikesuId = ikesuId;
        }
    }

    entry.lastModified = new Date().toLocaleString('ja-JP');
    saveData();

    renderIkesuWorkspace();
}

window.toggleGroupExpand = function (targetId) {
    const el = document.getElementById(`drag-parts-${targetId}`);
    if (el) {
        el.classList.toggle('expanded');
    }
};

window.renderIkesuWorkspace = function () {
    const unassignedList = document.getElementById('unassigned-list');
    const ikesuGrid = document.getElementById('ikesu-grid');
    if (!unassignedList || !ikesuGrid) return;

    unassignedList.innerHTML = '';
    ikesuGrid.innerHTML = '';

    if (!state.settings.ikesuList) state.settings.ikesuList = [];

    const assignedData = {};
    state.settings.ikesuList.forEach(i => assignedData[i.id] = { ikesu: i, fishers: 0, observers: 0, items: [] });

    const unassignedGroups = [];

    const searchTerm = document.getElementById('ikesu-search') ? document.getElementById('ikesu-search').value.toLowerCase().trim() : '';

    const validEntries = state.entries.filter(e => e.status !== 'cancelled');

    validEntries.forEach(entry => {
        const participantIkesus = entry.participants.map(p => p.ikesuId);
        const allUnassigned = participantIkesus.every(id => !id);

        if (allUnassigned) {
            unassignedGroups.push(entry);
        } else {
            let hasUnassignedChild = false;
            entry.participants.forEach((p, idx) => {
                if (p.ikesuId && assignedData[p.ikesuId]) {
                    assignedData[p.ikesuId].items.push({ entry, p, idx });
                    if (p.type === 'fisher') assignedData[p.ikesuId].fishers++;
                    else assignedData[p.ikesuId].observers++;
                } else {
                    hasUnassignedChild = true;
                }
            });
            if (hasUnassignedChild) {
                unassignedGroups.push(entry);
            }
        }
    });

    // -- 1. Render Unassigned Area --
    let unassignedCount = 0;
    unassignedGroups.forEach(entry => {
        const unassignedParts = entry.participants.map((p, i) => ({ p, i })).filter(x => !x.p.ikesuId);
        if (unassignedParts.length === 0) return;

        if (searchTerm) {
            const matchesGroup = entry.groupName.toLowerCase().includes(searchTerm) ||
                entry.representative.toLowerCase().includes(searchTerm) ||
                String(unassignedParts.length) === searchTerm;
            const matchesAnyPerson = unassignedParts.some(x => x.p.name.toLowerCase().includes(searchTerm));
            if (!matchesGroup && !matchesAnyPerson) return;
        }

        unassignedCount += unassignedParts.length;
        const isFullGroup = unassignedParts.length === entry.participants.length;

        let html = `
        <div class="drag-item-group ${isFullGroup ? 'draggable' : ''}" 
             ${isFullGroup ? `draggable="true" ondragstart="dragGroup(event, '${entry.id}')"` : ''}>
            <div class="drag-item-header">
                <div>
                    <strong>[${entry.id}] ${entry.groupName}</strong>
                    <div style="font-size: 0.8rem; color: var(--text-muted);">
                        ${isFullGroup ? '全員' : '一部メンバー'} (${unassignedParts.length}名)
                    </div>
                </div>
                <button class="btn-expand" onclick="toggleGroupExpand('${entry.id}')">∨ 展開</button>
            </div>
            <div class="drag-item-participants" id="drag-parts-${entry.id}">
        `;

        unassignedParts.forEach(item => {
            const isFisher = item.p.type === 'fisher';
            html += `
                <div class="drag-item-person draggable" draggable="true" ondragstart="dragPerson(event, '${entry.id}', ${item.i})">
                    <span>${item.p.name}</span>
                    <span class="badge ${isFisher ? '' : 'badge-observer'}">${isFisher ? '釣り' : '見学'}</span>
                </div>
            `;
        });

        html += `</div></div>`;
        unassignedList.insertAdjacentHTML('beforeend', html);
    });

    const unassignSpan = document.getElementById('unassigned-count');
    if (unassignSpan) unassignSpan.textContent = unassignedCount;

    // -- 2. Render Ikesu Grid --
    state.settings.ikesuList.forEach(ikesu => {
        const data = assignedData[ikesu.id];
        const isOver = data.fishers > ikesu.capacity;

        const box = document.createElement('div');
        box.className = 'ikesu-box drag-zone';
        box.ondragover = allowDrop;
        box.ondragleave = handleDragLeave;
        box.ondrop = (ev) => dropToIkesu(ev, ikesu.id);

        let html = `
            <div class="ikesu-header">
                <span class="ikesu-title">${ikesu.name}</span>
                <div class="ikesu-actions">
                    <button class="btn-text" style="font-size:0.75rem; color:#666;" onclick="openIkesuModal('${ikesu.id}')">✏️</button>
                    <button class="btn-text" style="font-size:0.75rem; color:var(--error-color);" onclick="deleteIkesu('${ikesu.id}')">🗑️</button>
                </div>
            </div>
            <div class="ikesu-capacity ${isOver ? 'over' : ''}">
                釣り: ${data.fishers} / ${ikesu.capacity} 名
                <span style="position: absolute; right: 10px; bottom: 5px; opacity: 0.5; font-size: 0.6rem;">v7.3.2</span>
                <span style="color:var(--text-muted); font-weight:normal; margin-left: 0.5rem;">(見学: ${data.observers})</span>
            </div>
            <div class="ikesu-drop-area mt-2">
        `;

        const groupedItems = {};
        data.items.forEach(item => {
            if (!groupedItems[item.entry.id]) groupedItems[item.entry.id] = { entry: item.entry, parts: [] };
            groupedItems[item.entry.id].parts.push(item);
        });

        Object.values(groupedItems).forEach(group => {
            const entry = group.entry;

            if (searchTerm) {
                const matchesGroup = entry.groupName.toLowerCase().includes(searchTerm) ||
                    entry.representative.toLowerCase().includes(searchTerm) ||
                    String(group.parts.length) === searchTerm;
                const matchesAnyPerson = group.parts.some(x => x.p.name.toLowerCase().includes(searchTerm));
                if (!matchesGroup && !matchesAnyPerson) return;
            }

            const isFullGroup = group.parts.length === entry.participants.length;
            const expandId = `ikesu-${ikesu.id}-${entry.id}`;

            html += `
            <div class="drag-item-group ${isFullGroup ? 'draggable' : ''}" 
                 ${isFullGroup ? `draggable="true" ondragstart="dragGroup(event, '${entry.id}')"` : ''}>
                <div class="drag-item-header">
                    <div style="font-size: 0.9rem;">
                        <strong>[${entry.id}] ${entry.groupName}</strong>
                    </div>
                    <button class="btn-expand" onclick="toggleGroupExpand('${expandId}')">∨</button>
                </div>
                <div class="drag-item-participants" id="drag-parts-${expandId}">
            `;

            group.parts.forEach(item => {
                const isFisher = item.p.type === 'fisher';
                html += `
                    <div class="drag-item-person draggable" draggable="true" ondragstart="dragPerson(event, '${entry.id}', ${item.idx})">
                        <span>${item.p.name}</span>
                        <span style="font-size: 0.7rem; color: var(--text-muted);">${isFisher ? '釣り' : '見学'}</span>
                    </div>
                `;
            });
            html += `</div></div>`;
        });

        html += `</div>`;
        box.innerHTML = html;
        ikesuGrid.appendChild(box);
    });
};
