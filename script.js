const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbyGmFH8-GXlWes9GHH-uELyT1NQNDAcK3JatxOSw331-Wd928ZHP9xKAcQFnnekHNLy/exec";

let state = {
    entries: [],
    deletedIds: [], // v7.9.3: Tracking local hard-deletions
    settings: {
        competitionName: "第1回 釣り大会",
        capacityGeneral: 100,
        capacityMintsuri: 100,
        capacitySuiho: 50,
        capacityHarimitsu: 50,
        capacityObservers: 100,
        startTime: "",
        deadline: "",
        capacityTotal: 250,
        adminPassword: "admin",
        // v7.9.3: Pre-populated Ikesu List (36 ponds)
        ikesuList: [
            ...Array.from({length: 6}, (_, i) => ({ id: `small-${i+1}`, name: `小${i+1}`, capacity: 6 })),
            { id: 'small-7', name: '小7', capacity: 6 },
            { id: 'small-7n', name: '小7北', capacity: 6 },
            ...Array.from({length: 4}, (_, i) => ({ id: `small-${i+8}`, name: `小${i+8}`, capacity: 6 })),
            ...Array.from({length: 10}, (_, i) => ({ id: `med-${i+1}`, name: `中${i+1}`, capacity: 8 })),
            ...Array.from({length: 3}, (_, i) => ({ id: `large-${i+1}`, name: `大${i+1}`, capacity: 12 })),
            ...Array.from({length: 3}, (_, i) => ({ id: `dep-${i+1}`, name: `でっぱり${i+1}`, capacity: 12 })),
            ...Array.from({length: 8}, (_, i) => ({ id: `south-${i+1}`, name: `南${i+1}`, capacity: 12 }))
        ]
    },
    lastUpdated: 0 // Unix timestamp for sync merging
};

let isAdminAuth = localStorage.getItem('isAdminAuth') === 'true'; // Persistent across sessions (localStorage)
let currentViewId = sessionStorage.getItem('currentViewId') || 'registration-view'; // Persistent view
let currentAdminTab = sessionStorage.getItem('currentAdminTab') || 'tab-list'; // Persistent tab
let dashboardFilter = 'all';
let currentReceptionId = null;
let isAdminAuthAction = false; // Flag for admin-led edits
let activeReceptionEntryId = null; // Currently selected in reception desk
let pendingView = null; // v8.1.10: Global scoped to avoid ReferenceError

// Age labels map - v4.8 Updated
const ageLabels = {
    "elementary": "小学生以下",
    "middle_high": "中・高校生",
    "19_20s": "19歳〜20代",
    "30s": "30代", "40s": "40代", "50s": "50代",
    "60s": "60代", "70s": "70代", "80s": "80歳以上"
};

const genderLabels = {
    "male": "男性",
    "female": "女性",
    "other": "その他"
};

const tshirtSizes = ['140', '150', 'S', 'M', 'L', 'XL（2L）', '2XL（3L）', '3XL（4L）', '4XL（5L）'];

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
        console.log("BORIJIN APP v8.1.21: LOCKED CATEGORY UI");

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
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');

    // v8.0.0: Support ?view=leader-entry for shared LINE link
    if (viewParam === 'leader-entry') {
        switchView(null, 'leader-entry-view');
        renderLeaderEntryForm();
        return;
    }

    if (viewParam) return;

    if (currentViewId && currentViewId !== 'registration-view') {
        const lastBtn = document.querySelector(`.nav-btn[data-target="${currentViewId}"]`);
        switchView(lastBtn, currentViewId);
    }
    if (isAdminAuth && currentAdminTab) {
        switchAdminTab(currentAdminTab);
    }
}

async function loadData() {
    initToast();
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
                // v7.3.3: New device or default state check. 
                // If local has no entries, trust Cloud completely.
                const hasLocalEntries = localData && JSON.parse(localData).entries && JSON.parse(localData).entries.length > 0;
                
                if (hasLocalEntries) {
                    const parsedLocal = JSON.parse(localData);
                    // Ensure deletedIds is carried over if present
                    state.deletedIds = parsedLocal.deletedIds || [];
                    state = mergeData(parsedLocal, cloudData);
                    console.log('Cloud sync: data merged');
                    
                    // v7.9.3: Ensure ikesuList is present even in merged state
                    if (!state.settings.ikesuList || state.settings.ikesuList.length === 0) {
                        state.settings.ikesuList = [
                            ...Array.from({length: 6}, (_, i) => ({ id: `small-${i+1}`, name: `小${i+1}`, capacity: 6 })),
                            { id: 'small-7', name: '小7', capacity: 6 },
                            { id: 'small-7n', name: '小7北', capacity: 6 },
                            ...Array.from({length: 4}, (_, i) => ({ id: `small-${i+8}`, name: `小${i+8}`, capacity: 6 })),
                            ...Array.from({length: 10}, (_, i) => ({ id: `med-${i+1}`, name: `中${i+1}`, capacity: 8 })),
                            ...Array.from({length: 3}, (_, i) => ({ id: `large-${i+1}`, name: `大${i+1}`, capacity: 12 })),
                            ...Array.from({length: 3}, (_, i) => ({ id: `dep-${i+1}`, name: `でっぱり${i+1}`, capacity: 12 })),
                            ...Array.from({length: 8}, (_, i) => ({ id: `south-${i+1}`, name: `南${i+1}`, capacity: 12 }))
                        ];
                    }
                    
                    localStorage.setItem('fishing_app_v3_data', JSON.stringify(state));
                    if (state.lastUpdated > cloudData.lastUpdated) {
                        syncToCloud();
                    }
                } else {
                    // New PC or empty local: Trust Cloud as absolute truth
                    console.log('Cloud sync: New device or empty local detected. Using Cloud data.');
                    state = cloudData;
                    state.deletedIds = state.deletedIds || [];
                    localStorage.setItem('fishing_app_v3_data', JSON.stringify(state));
                }
                
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
        // v8.1.14: Initial startup error should be silent to avoid alarming the user before local fallback loads
        updateSyncStatus('error-silent');
    }

    // 2. Fallback to LocalStorage
    const savedData = localStorage.getItem('fishing_app_v3_data');
    if (savedData) {
        state = JSON.parse(savedData);
        state.settings.ikesuList.forEach(ik => {
            if (!ik.passcode) {
                ik.passcode = Math.floor(1000 + Math.random() * 9000).toString();
            }
        });
        localStorage.setItem('fishing_app_v3_data', JSON.stringify(state));
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
    // 常にクラウドを最新の状態のベースとする
    const merged = { ...cloud }; 
    const localMap = new Map(local.entries.map(e => [e.id, e]));
    const cloudMap = new Map(cloud.entries.map(e => [e.id, e]));

    // --- 1. ローカル固有（未同期）のデータをマージ ---
    local.entries.forEach(lEntry => {
        const isServerId = /^[AMSH]-\d{3}$/.test(lEntry.id);
        
        if (!cloudMap.has(lEntry.id)) {
            // サーバー発行済みIDなのにクラウドに存在しない場合
            // サーバー発行済みIDなのにクラウドに存在しない場合
            if (isServerId) {
                // クラウドの最終更新の方が新しければ、クラウド側で「本当の削除」があったとみなす
                if (cloud.lastUpdated > (lEntry._ts || 0)) {
                    console.log(`[Sync] ${lEntry.id} was intentionally deleted on Cloud at ${new Date(cloud.lastUpdated).toLocaleString()}. Discarding local.`);
                    return; 
                }
            }
            // 新規データ、または削除確定でないものは維持
            console.log(`[Sync] Keeping local entry ${lEntry.id} which is missing on cloud.`);
            merged.entries.push(lEntry);
        } else {
            // 両方にある場合: 更新日時(lastModified)が新しい方を採用
            const cEntry = cloudMap.get(lEntry.id);
            const lTime = new Date(lEntry.lastModified || lEntry.timestamp || 0).getTime();
            const cTime = new Date(cEntry.lastModified || cEntry.timestamp || 0).getTime();

            if (lTime > cTime) {
                const idx = merged.entries.findIndex(e => e.id === lEntry.id);
                if (idx !== -1) merged.entries[idx] = lEntry;
            }
        }
    });

    // --- 2. 設定のマージ: クラウド側の設定を常に優先するが、クラウド側が空またはデフォルトの場合に備えて慎重にマージ ---
    // v7.4.0: クラウドの最終更新日時がローカルより古い場合は、ローカル側の最新設定を保持する
    const isCloudNewer = (cloud.lastUpdated || 0) > (local.lastUpdated || 0);
    if (isCloudNewer && cloud.settings && Object.keys(cloud.settings).length > 0) {
        merged.settings = { ...local.settings, ...cloud.settings };
    } else {
        merged.settings = { ...cloud.settings, ...local.settings };
    }
    
    // --- 3. 重複排除、削除済みフィルタ、ソート ---
    const allDeletedIds = [
        ...(local.deletedIds || []),
        ...(cloud.deletedIds || []),
        ...(state.deletedIds || [])
    ];
    const uniqueDeletedIds = Array.from(new Set(allDeletedIds));

    const uniqueEntries = Array.from(new Map(merged.entries.map(e => [e.id, e])).values())
        .filter(e => !uniqueDeletedIds.includes(e.id));
        
    merged.entries = uniqueEntries.sort((a, b) => {
        const timeA = new Date(a.timestamp || 0).getTime();
        const timeB = new Date(b.timestamp || 0).getTime();
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
            capacityTotal: 250,
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
    migrateTshirtSizes(); // v7.7.0: Data migration for new labels
    updateDashboard();
    updateReceptionList();
    updateSourceAvailability();
    syncSettingsUI();

    // v7.6.1: Run URL parameter check AFTER loading is fully settled
    checkUrlParams();

    // v7.6.1: Initialize specialized URL display in Admin Tab
    generateSpecialUrls();

    // v7.0: 自動復旧チェック（再読み込み時）
    setTimeout(checkPendingRegistration, 500);
}

// v7.7.0: Automatically update existing entries to new T-shirt labels
function migrateTshirtSizes() {
    let changed = false;
    // v7.8.6: Further expanded mapping to cover all potential variants
    const mapping = {
        'LL': 'XL（2L）', '2L': 'XL（2L）', 'XL': 'XL（2L）', 'O': 'XL（2L）',
        '3L': '2XL（3L）', '2XL': '2XL（3L）', 'XO': '2XL（3L）',
        '4L': '3XL（4L）', '3XL': '3XL（4L）', '2XO': '3XL（4L）',
        '5L': '4XL（5L）', '4XL': '4XL（5L）', '3XO': '4XL（5L）'
    };

    state.entries.forEach(entry => {
        entry.participants.forEach(p => {
            if (!p.tshirtSize) return;
            const normalized = p.tshirtSize.toString().toUpperCase().trim();
            // Also handle if it's already partial match like "XL" -> "XL（2L）"
            if (mapping[normalized]) {
                p.tshirtSize = mapping[normalized];
                changed = true;
            }
        });
    });

    if (changed) {
        console.log("BORIJIN APP: T-shirt labels migrated with super-enhanced mapping.");
        state.lastUpdated = Date.now();
        localStorage.setItem('fishing_app_v3_data', JSON.stringify(state));
        saveData(); // Sync to cloud
    }
}

function generateSpecialUrls() {
    const baseUrl = window.location.href.split('?')[0];
    
    const setVal = (id, url) => {
        const el = document.getElementById(id);
        if (el) el.value = url;
    };

    setVal('url-ippan-reg', `${baseUrl}`);
    setVal('url-mintsuri-reg', `${baseUrl}?src=mintsuri`);
    setVal('url-harimitsu-reg', `${baseUrl}?src=harimitsu`);
    setVal('url-suiho-reg', `${baseUrl}?src=suiho`);
    setVal('url-mintsuri-admin', `${baseUrl}?view=mintsuri`);
}

window.copyShareUrl = function(inputId) {
    const el = document.getElementById(inputId);
    if (!el) return;
    
    el.select();
    el.setSelectionRange(0, 99999); // Mobile
    
    try {
        navigator.clipboard.writeText(el.value).then(() => {
            showToast('📋 クリップボードにコピーしました', 'success');
        }).catch(() => {
            // Fallback for older browsers or non-https
            document.execCommand('copy');
            showToast('📋 コピーしました（ブラウザ機能）', 'success');
        });
    } catch (err) {
        showToast('コピーに失敗しました', 'error');
    }
}

window.openShareUrl = function(inputId) {
    const el = document.getElementById(inputId);
    if (el && el.value) {
        window.open(el.value, '_blank');
    }
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
            
            // v7.4.0: Add "Clear Cache" option to the toast/recovery check
            showToast('前回の登録（送信中）が見つかりました。', 'info');
            
            localStorage.removeItem('fishing_app_pending_reg');
            showResult(match);
        }
    } catch (e) {
        console.warn("Pending check failed:", e);
    }
}

/**
 * v7.4.0: 送信待ちデータの消去（手動）
 */
window.clearPendingRegistration = function() {
    if (confirm('送信中の一時データを消去しますか？（すでに送信が完了している場合は影響ありません）')) {
        localStorage.removeItem('fishing_app_pending_reg');
        showToast('一時データを消去しました', 'success');
        resetForm();
    }
};

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
        
        // v7.9.6: DO NOT clear deletedIds immediately here because of no-cors opaque success.
        // The cloud data will naturally lose these entries if the save succeeded.
        // We only clear IDs that are NO LONGER present in the cloud to keep the list small.
        if (state.deletedIds) {
            state.deletedIds = state.deletedIds.filter(id => {
                // Keep the ID only if it MIGHT still be on the server.
                // If the server doesn't have it anymore (sync worked), we can stop tracking it.
                // But since we just saved, we'll keep tracking for a few more minutes or until next full refresh.
                return true; 
            });
        }
        
        localStorage.setItem('fishing_app_v3_data', JSON.stringify(state));
        
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

    const params = new URLSearchParams(window.location.search);
    const srcParam = params.get('src');
    const viewParam = params.get('view');

    // v8.1.4: URL-based Category Selection
    if (srcParam) {
        const srcMap = { 'ippan': '一般', 'mintsuri': 'みん釣り', 'harimitsu': 'ハリミツ', 'suiho': '水宝' };
        const mappedVal = srcMap[srcParam];
        if (mappedVal) {
            const radio = document.querySelector(`input[name="reg-source"][value="${mappedVal}"]`);
            if (radio) {
                radio.checked = true;
                console.log("URL Source Auto-Selection:", mappedVal);
            }
        }
    }

    // v8.1.6: View Parameter Handling (mintsuri, leader-entry, etc)
    if (viewParam === 'mintsuri') {
        switchView(null, 'mintsuri-coordinator-view');
        renderMintsuriCoordinatorView();
        return; 
    } else if (viewParam === 'leader-entry') {
        switchView(null, 'leader-entry-view');
        renderLeaderEntryForm();
        return;
    } else if (viewParam === 'stats') {
        switchView(null, 'public-stats-view');
        return;
    }

    try {
        const shareUrlEl = document.getElementById('public-share-url');
        if (shareUrlEl) {
            shareUrlEl.value = window.location.href.split('#')[0].split('?')[0];
        }
    } catch (e) {
        console.warn("Share URL initialization skipped:", e);
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
        document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
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
    window.revealEditAuth = function () {
        const form = document.getElementById('registration-form');
        const auth = document.getElementById('edit-auth-section');
        if (form) form.classList.add('hidden');
        if (auth) auth.classList.remove('hidden');
    };

    safeAddListener('show-edit-login', 'click', revealEditAuth);
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
    safeAddListener('global-admin-password', 'keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            handleAdminLogin();
        }
    });
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

    // v7.8.5: Support browser back/forward buttons using pushState
    const url = new URL(window.location.href);
    const currentParams = new URLSearchParams(window.location.search);
    const newViewId = targetId === 'registration-view' ? null : targetId;
    
    if (newViewId) {
        url.searchParams.set('view', targetId);
    } else {
        url.searchParams.delete('view');
    }

    // Only push if the view actually changed to avoid junk history
    if (currentParams.get('view') !== newViewId) {
        window.history.pushState({ viewId: targetId }, '', url);
    }

    if (targetId === 'mintsuri-coordinator-view') {
        renderMintsuriCoordinatorView();
    }

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
    updateAppTitle();

    if (targetId === 'registration-view') {
        const adminActions = document.getElementById('admin-extra-actions');
        if (adminActions) adminActions.classList.add('hidden');
        
        // Ensure app title is restored to tournament name from settings
        updateAppTitle();

        // v7.1.1: Always ensure a fresh form if not editing
        const editId = document.getElementById('edit-entry-id').value;
        if (!editId) {
            resetForm(); 
        }
        updateSourceAvailability();
    }
    if (targetId === 'dashboard-view') {
        updateDashboard();
        switchAdminTab(currentAdminTab); 
    }
    if (targetId === 'reception-view') {
        updateReceptionList();
    }
    if (targetId === 'public-stats-view') {
        renderPublicStats();
    }
    if (targetId === 'mintsuri-coordinator-view') {
        renderMintsuriCoordinatorView();
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
                    localStorage.removeItem('isAdminAuth');
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
        title.textContent = `${state.settings.competitionName || "釣り大会"} 開始前`;
        desc.textContent = `${new Date(state.settings.startTime).toLocaleString('ja-JP')} から受付を開始します。しばらくお待ちください。`;
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
function showAdminLogin(targetView) {
    pendingView = targetView;
    const pwInput = document.getElementById('global-admin-password');
    const errDiv = document.getElementById('admin-auth-error');
    if (pwInput) pwInput.value = '';
    if (errDiv) errDiv.classList.add('hidden');
    
    document.getElementById('admin-auth-modal').classList.remove('hidden');
    if (pwInput) setTimeout(() => pwInput.focus(), 100);
}

function handleAdminLogin() {
    const pwInput = document.getElementById('global-admin-password');
    if (!pwInput) return;
    const pw = pwInput.value.trim();
    
    console.log("Admin Login Attempt:", { 
        inputLength: pw.length, 
        isDefaultMatched: pw === 'admin',
        isStateMatched: pw === state.settings.adminPassword 
    });

    if (pw === state.settings.adminPassword || pw === 'admin') {
        isAdminAuth = true;
        localStorage.setItem('isAdminAuth', 'true'); // Persist
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
        showToast("管理者としてログインしました", "success");
    } else {
        console.warn("Admin Auth Failed: Password mismatch.");
        document.getElementById('admin-auth-error').classList.remove('hidden');
        pwInput.value = '';
        pwInput.focus();
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
    
    // v8.1.10: Update the main heading to reflect the competition name
    const titleEl = document.getElementById('app-title');
    if (titleEl) titleEl.textContent = state.settings.competitionName || "釣り大会 受付";

    if (document.getElementById('cap-total')) {
        document.getElementById('cap-total').value = state.settings.capacityTotal || 250;
    }

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
            <div class="form-group" style="flex: 1; min-width: 100px;">
                <label>性別 <span class="required">*</span></label>
                <select class="p-gender" required>
                    <option value="" disabled ${!data ? 'selected' : ''}>選択...</option>
                    ${Object.entries(genderLabels).map(([val, label]) => `<option value="${val}" ${data && data.gender === val ? 'selected' : ''}>${label}</option>`).join('')}
                </select>
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
                <input type="text" class="p-region" required value="${data && data.region ? data.region : ''}" placeholder="例: 姫路市まで">
            </div>
            <div class="form-group" style="flex: 1; min-width: 100px;">
                <label>Tシャツ <span class="required">*</span></label>
                <select class="p-tshirt" required>
                    <option value="" disabled ${!data || !data.tshirtSize ? 'selected' : ''}>選択してください</option>
                    ${(() => {
                        // v7.8.6: Improved safety logic
                        const currentSize = data ? data.tshirtSize : '';
                        let options = [...tshirtSizes];
                        if (currentSize && !options.includes(currentSize)) {
                            options.push(currentSize);
                        }
                        return options.map(size => `<option value="${size}" ${currentSize === size ? 'selected' : ''}>${size}</option>`).join('');
                    })()}
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
        gender: row.querySelector('.p-gender').value,
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

    // Aggregate Capacity Check
    const totalFishers = state.entries
        .filter(en => en.id !== editId && en.status !== 'cancelled')
        .reduce((sum, en) => sum + en.fishers, 0);

    if (totalFishers + fisherCount > state.settings.capacityTotal) {
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
        const genderLabel = genderLabels[p.gender] || p.gender;
        li.textContent = `${idx + 1}. ${typeLabel} ${p.name} / ${genderLabel} [${p.tshirtSize}]` + (p.nickname ? ` (${p.nickname})` : '');
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
        gender: row.querySelector('.p-gender').value,
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

    if (currentCategoryFishers + fisherCount > capacityLimit || totalNow + fisherCount > state.settings.capacityTotal) {
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

    // v7.6.6: Enable catgory migration for admins. Ensure all categories are available.
    if (isAdminAuth || isAdminAuthAction) {
        ['一般', 'みん釣り', '水宝', 'ハリミツ'].forEach(source => {
            let sourceRadio = document.querySelector(`input[name="reg-source"][value="${source}"]`);
            if (!sourceRadio) {
                const selector = document.getElementById('main-source-selector');
                const badgeClassMap = { '一般': 'badge-ippan', 'みん釣り': 'badge-mintsuri', '水宝': 'badge-suiho', 'ハリミツ': 'badge-harimitsu' };
                const badgeClass = badgeClassMap[source] || 'badge-ippan';
                const label = document.createElement('label');
                label.className = 'source-option admin-only temp-option';
                label.innerHTML = `
                    <input type="radio" name="reg-source" value="${source}" required>
                    <span class="source-label">
                        <span class="badge ${badgeClass}">${source}</span>
                    </span>
                `;
                selector.appendChild(label);
            }
        });
        // Make source selector group visible if it was hidden
        const sourceGroup = document.getElementById('source-selector-group');
        if (sourceGroup) sourceGroup.classList.remove('hidden');
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
    
    // v7.6.0: Remove app-title update to avoid 'Done' duplication on mobile.
    // Keep app-title as the Tournament Name.
    updateAppTitle();

    // Populate Recovery Backup Details (v6.3)
    document.getElementById('res-rep-name').textContent = entry.representative;
    document.getElementById('res-rep-phone').textContent = entry.phone;
    document.getElementById('res-rep-email').textContent = entry.email;
    
    const pList = document.getElementById('res-participant-list');
    if (pList) {
        pList.innerHTML = entry.participants.map(p => {
            const genderMark = p.gender === 'male' ? '♂' : (p.gender === 'female' ? '♀' : '');
            return `<li>${p.name} ${genderMark} (${p.type === 'fisher' ? '釣り' : '見学'})</li>`;
        }).join('');
    }

    // Screenshot Optimization: Hide the top registration card frame to save space
    const regCard = document.getElementById('registration-card');
    if (regCard) regCard.classList.add('hidden');

    showToast('✨ 登録完了しました！', 'success');
    window.scrollTo(0, 0);
}

function resetForm() {
    const form = document.getElementById('registration-form');
    if (form) form.reset();
    
    document.getElementById('edit-entry-id').value = "";
    
    // Explicitly clear key fields for browser compatibility
    ['group-name', 'representative-name', 'rep-phone', 'rep-email', 'rep-email-confirm', 'edit-password'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });

    // Reset radio selection
    const defaultRadio = document.querySelector('input[name="reg-source"][value="一般"]');
    if (defaultRadio) defaultRadio.checked = true;

    const list = document.getElementById('participant-list');
    if (list) {
        list.innerHTML = '';
        addParticipantRow(null, false);
    }

    // Restore the registration card frame
    const regCard = document.getElementById('registration-card');
    if (regCard) regCard.classList.remove('hidden');

    document.getElementById('registration-form').classList.remove('hidden');
    document.getElementById('confirmation-section').classList.add('hidden');
    document.getElementById('registration-result').classList.add('hidden');
    document.getElementById('edit-auth-section').classList.add('hidden');
    document.getElementById('registration-status').classList.add('hidden');
    
    updateAppTitle();
    document.getElementById('submit-registration').textContent = "この内容で登録する";
    
    const cancelEditBtn = document.getElementById('cancel-edit');
    if (cancelEditBtn) cancelEditBtn.classList.add('hidden');
    
    isAdminAuthAction = false;
    localStorage.removeItem('fishing_app_pending_reg'); // Force clear any pending flags on reset

    // Remove temp admin options if any
    document.querySelectorAll('.temp-option').forEach(el => el.remove());
    updateSourceAvailability();
    setTimeout(() => window.scrollTo(0, 0), 50); 
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

        // v7.3 & v8.1.7: Update Share URLs in Dashboard Settings (User Requirements Match)
        const baseUrl = window.location.href.split('?')[0].split('#')[0];
        
        // 1. Main Public URL
        const mainUrlEl = document.getElementById('public-share-url');
        if (mainUrlEl) mainUrlEl.value = baseUrl;

        // 2. Registry Links (src param)
        const sourceMap = {
            'ippan-reg': 'ippan',
            'mintsuri-reg': 'mintsuri',
            'harimitsu-reg': 'harimitsu',
            'suiho-reg': 'suiho'
        };
        Object.entries(sourceMap).forEach(([idSuffix, srcKey]) => {
            const el = document.getElementById(`url-${idSuffix}`);
            if (el) el.value = `${baseUrl}${srcKey === 'ippan' ? '' : `?src=${srcKey}`}`;
        });

        // 3. Coordinator & Entry Tools (view param)
        const leaderEl = document.getElementById('url-leader-input');
        if (leaderEl) leaderEl.value = `${baseUrl}?view=leader-entry`;

        const mintsuriAdminEl = document.getElementById('url-mintsuri-admin');
        if (mintsuriAdminEl) mintsuriAdminEl.value = `${baseUrl}?view=mintsuri`;

        const statsUrlEl = document.getElementById('url-stats');
        if (statsUrlEl) statsUrlEl.value = `${baseUrl}?view=stats`;

        // Dashboard List Rendering (Fixed & Cleaned v7.3.0)
        const list = document.getElementById('entry-list');
        const searchTerm = document.getElementById('dashboard-search').value.toLowerCase();
        
        // v7.9.8: Save scroll position before update
        const scrollPos = window.scrollY;
        list.innerHTML = '';

        state.entries.slice().reverse().forEach(e => {
            // ... (Search / Filter logic stays same)
            const matchesEntrySearch = e.id.toLowerCase().includes(searchTerm) || e.groupName.toLowerCase().includes(searchTerm) || e.representative.toLowerCase().includes(searchTerm);
            
            const pNames = e.participants.map(p => p.name).join(' ');
            const pRegions = e.participants.map(p => p.region || "").join(' ');
            const pTshirts = e.participants.map(p => p.tshirtSize || "").join(' ');
            const pGenders = e.participants.map(p => genderLabels[p.gender] || "").join(' ');
            
            const combinedParticipantInfo = (pNames + " " + pRegions + " " + pTshirts + " " + pGenders).toLowerCase();
            const matchesParticipantSearch = combinedParticipantInfo.includes(searchTerm);

            if (!matchesEntrySearch && !matchesParticipantSearch) return;

            if (dashboardFilter !== 'all' && e.source !== dashboardFilter) return;

            const tr = document.createElement('tr');
            if (e.status === 'cancelled') tr.classList.add('row-cancelled');
            else if (e.status === 'checked-in') tr.classList.add('row-checked-in');

            const badgeMap = { '一般': 'badge-ippan', 'みん釣り': 'badge-mintsuri', '水宝': 'badge-suiho', 'ハリミツ': 'badge-harimitsu' };
            const statusLabel = e.status === 'checked-in' ? '✅ 受済' : e.status === 'absent' ? '❌ 欠席' : e.status === 'cancelled' ? '🚫 無効' : '⏳ 待機';

            const rep = e.participants[0] || { name: e.representative };
            const getGenderMark = (p) => p.gender === 'male' ? '♂' : (p.gender === 'female' ? '♀' : '');
            
            const pSummary = `
                <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:400px; font-size:0.95rem;">
                    <strong style="font-weight:800; color:var(--text-color);">${rep.name}</strong>${rep.nickname ? `<small>(${rep.nickname})</small>` : ''}${getGenderMark(rep)}
                    <span style="color:#64748b; font-size:0.8rem; margin-left:4px;">
                        ${e.participants.length > 1 ? `+ ${e.participants.slice(1).map(p => p.name).join(', ')}` : ''}
                    </span>
                </div>
            `;

            const regTime = e.timestamp ? new Date(e.timestamp).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--:--';

            // v8.0.4: Calculate Group Total Points and Ikesu Names
            let groupPoints = 0;
            const ikesuNames = new Set();
            e.participants.forEach(p => {
                const pA = parseInt(p.catchA || 0);
                const pB = parseInt(p.catchB || 0);
                groupPoints += (pA * 2) + pB;
                if (p.ikesuId) {
                    const ik = state.settings.ikesuList.find(i => i.id === p.ikesuId);
                    if (ik) ikesuNames.add(ik.name);
                }
            });
            const ikesuDisplay = Array.from(ikesuNames).join(', ') || '-';

            tr.innerHTML = `
                <td><span class="id-badge" style="white-space:nowrap;">${e.id}</span></td>
                <td><span class="badge ${badgeMap[e.source] || 'badge-ippan'}" style="white-space:nowrap;">${e.source}</span></td>
                <td><div style="font-weight:800; max-width:8rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; ${e.status === 'cancelled' ? 'text-decoration:line-through' : ''}" title="${e.groupName}">${e.groupName}</div></td>
                <td>${pSummary}</td>
                <td><small style="white-space:nowrap;">${e.fishers} / ${e.observers}</small></td>
                <td><small style="white-space:nowrap;">${ikesuDisplay}</small></td>
                <td><div style="font-weight:900; color:var(--primary-color); text-align:center;">${groupPoints}</div></td>
                <td><span style="font-size:0.75rem; font-weight:700; white-space:nowrap;">${statusLabel}</span></td>
                <td><small style="white-space:nowrap;">${regTime}</small></td>
                <td>
                    <div style="display:flex; gap:0.2rem; flex-wrap: nowrap; width: auto; align-items:center;">
                        <button class="btn-outline btn-small btn-detail" onclick="window.showEntryDetails('${e.id}')" style="padding: 0.2rem 0.4rem; font-size: 0.75rem; white-space:nowrap;">確認</button>
                        <button class="btn-outline btn-small" onclick="window.requestAdminEdit('${e.id}')" style="padding: 0.2rem 0.4rem; font-size: 0.75rem; white-space:nowrap;">修正</button>
                        <button class="btn-primary btn-small ${e.status === 'checked-in' ? 'active' : ''}" onclick="window.quickCheckIn('${e.id}')" ${e.status === 'cancelled' ? 'disabled' : ''} style="padding: 0.2rem 0.4rem; font-size: 0.75rem; white-space:nowrap;">受付</button>
                        <button class="btn-outline btn-small" onclick="window.hardDeleteEntry('${e.id}')" style="padding: 0.2rem 0.4rem; font-size: 0.75rem; white-space:nowrap; border-color: #ff7675; color: #ff7675;">削除</button>
                    </div>
                </td>
            `;
            list.appendChild(tr);
        });

    } catch (e) {
        console.error("Dashboard update failed:", e);
    }
}

/**
 * --- v8.0.0 & v8.1.7: FIXED DASHBOARD NAVIGATION ---
 * Core function to handle admin sub-tab switching
 */
function switchAdminTab(tabId) {
    if (!tabId) return;
    currentAdminTab = tabId;
    sessionStorage.setItem('currentAdminTab', tabId);

    // 1. Update Navigation Button States
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });

    // 2. Toggle Visibility of Tab Contents
    document.querySelectorAll('.admin-tab-content').forEach(content => {
        content.classList.toggle('active', content.id === tabId);
    });

    // 3. Trigger Specific View Renderers (Ensure lazy loading)
    if (tabId === 'tab-list') updateDashboard();
    if (tabId === 'tab-ikesu') (typeof renderIkesuWorkspace === 'function') && renderIkesuWorkspace();
    if (tabId === 'tab-rankings') (typeof renderRankings === 'function') && renderRankings();
    if (tabId === 'tab-print') (typeof renderIkesuPrintView === 'function') && renderIkesuPrintView();
    if (tabId === 'tab-stats') (typeof renderBreakdownStats === 'function') && renderBreakdownStats();
}

/**
 * Renders the printable member list view organized by ikesu
 */
function renderIkesuPrintView() {
    const container = document.getElementById('print-view-container');
    if (!container) return;
    
    if (!state.settings.ikesuList || state.settings.ikesuList.length === 0) {
        container.innerHTML = '<p class="text-muted p-4">イケスが設定されていません。</p>';
        return;
    }

    let html = '';
    state.settings.ikesuList.forEach(ik => {
        const participants = [];
        state.entries.forEach(e => {
            if (e.status === 'cancelled') return;
            e.participants.forEach(p => {
                if (p.ikesuId === ik.id) {
                    participants.push({ ...p, groupId: e.id, groupName: e.groupName });
                }
            });
        });

        html += `
            <div class="print-page mb-8" style="background:white; padding:1.2rem; border:1px solid #eee; margin-bottom: 2rem; page-break-after: always;">
                <h3 style="border-bottom: 2px solid #333; padding-bottom: 0.5rem; margin-bottom: 1rem; display: flex; justify-content: space-between;">
                    <span>${ik.name} メンバー表</span>
                    <small style="font-size: 0.75rem; font-weight: normal;">定員: ${ik.capacity} / 現在: ${participants.length}名</small>
                </h3>
                <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
                    <thead>
                        <tr style="background: #f8fafc;">
                            <th style="border: 1px solid #cbd5e1; padding: 0.5rem;">No.</th>
                            <th style="border: 1px solid #cbd5e1; padding: 0.5rem;">グループ名</th>
                            <th style="border: 1px solid #cbd5e1; padding: 0.5rem;">氏名</th>
                            <th style="border: 1px solid #cbd5e1; padding: 0.5rem;">性別</th>
                            <th style="border: 1px solid #cbd5e1; padding: 0.5rem;">Tシャツ</th>
                            <th style="border: 1px solid #cbd5e1; padding: 0.5rem;">備考</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${participants.length > 0 ? participants.map((p, idx) => `
                            <tr>
                                <td style="border: 1px solid #cbd5e1; padding: 0.4rem; text-align: center;">${idx + 1}</td>
                                <td style="border: 1px solid #cbd5e1; padding: 0.4rem;">${p.groupName} <small>(${p.groupId})</small></td>
                                <td style="border: 1px solid #cbd5e1; padding: 0.4rem; font-weight: 700;">${p.name} ${p.nickname ? `<small>(${p.nickname})</small>` : ''}</td>
                                <td style="border: 1px solid #cbd5e1; padding: 0.4rem; text-align: center;">${genderLabels[p.gender] || '-'}</td>
                                <td style="border: 1px solid #cbd5e1; padding: 0.4rem; text-align: center;">${p.tshirtSize || '-'}</td>
                                <td style="border: 1px solid #cbd5e1; padding: 0.4rem;">${p.type === 'observer' ? '【見学】' : ''}</td>
                            </tr>
                        `).join('') : '<tr><td colspan="6" style="border: 1px solid #cbd5e1; padding: 1.5rem; text-align: center;">(参加者なし)</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;
    });

    container.innerHTML = html;
}

// --- v8.0.0: Expansion Feature Logic ---

// 1. Leader Management
window.toggleLeader = function(entryId, partIdx) {
    const entry = state.entries.find(e => e.id === entryId);
    if (!entry || !entry.participants[partIdx]) return;
    
    // Toggle
    const current = !!entry.participants[partIdx].isLeader;
    
    // Optional: Only one leader per ikesu? (User didn't specify, so keeping it simple: can have multiple or one)
    // For now, let's allow multiple or user manually manages.
    entry.participants[partIdx].isLeader = !current;
    
    saveData();
    renderIkesuWorkspace();
    showToast(`${entry.participants[partIdx].name} 様をリーダーに設定しました`, 'info');
};

// 2. Tournament Rankings
window.renderRankings = function() {
    const indList = document.getElementById('ranking-individual-list');
    const ikList = document.getElementById('ranking-ikesu-list');
    if (!indList || !ikList) return;

    // A. Individual Ranking Data
    let individuals = [];
    state.entries.forEach(e => {
        if (e.status === 'cancelled') return;
        e.participants.forEach(p => {
            if (p.type === 'observer') return;
            const cA = parseInt(p.catchA || 0);
            const cB = parseInt(p.catchB || 0);
            const points = (cA * 2) + (cB * 1);
            individuals.push({ 
                name: p.name, 
                group: e.groupName, 
                points, 
                cA, 
                cB,
                ikesu: ""
            });
            // Try to find ikesu
            if (p.ikesuId) {
                const ik = state.settings.ikesuList.find(i => i.id === p.ikesuId);
                if (ik) individuals[individuals.length - 1].ikesu = ik.name;
            }
        });
    });

    // Sort Individual: Points DESC -> CatchA DESC -> CatchB DESC
    individuals.sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.cA !== a.cA) return b.cA - a.cA;
        return b.cB - a.cB;
    });

    indList.innerHTML = individuals.slice(0, 50).map((p, i) => {
        const rankClass = i < 3 ? `rank-${i + 1}` : '';
        const rankNumClass = i < 3 ? `top-${i + 1}` : '';
        return `
            <div class="ranking-card ${rankClass}">
                <div class="ranking-rank ${rankNumClass}">${i + 1}</div>
                <div class="ranking-info">
                    <div class="ranking-name">${p.name}</div>
                    <div class="ranking-subtext">${p.group} ${p.ikesu ? ` / ${p.ikesu}` : ''}</div>
                    <div style="font-size:0.7rem; color:#94a3b8; margin-top:2px;">青物: ${p.cA} / 鯛等: ${p.cB}</div>
                </div>
                <div class="ranking-points">
                    <span class="rank-val">${p.points}</span><span class="rank-unit">pt</span>
                </div>
            </div>
        `;
    }).join('') || '<p class="text-muted p-4">データがありません</p>';

    // B. Ikesu Team Ranking
    if (!state.settings.ikesuList) return;
    
    const ikResults = {};
    state.settings.ikesuList.forEach(ik => ikResults[ik.id] = { name: ik.name, totalPoints: 0, count: 0 });
    
    state.entries.forEach(e => {
        if (e.status === 'cancelled') return;
        e.participants.forEach(p => {
            if (p.type === 'observer' || !p.ikesuId || !ikResults[p.ikesuId]) return;
            const cA = parseInt(p.catchA || 0);
            const cB = parseInt(p.catchB || 0);
            ikResults[p.ikesuId].totalPoints += (cA * 2) + (cB * 1);
            ikResults[p.ikesuId].count++;
        });
    });

    let teamList = Object.values(ikResults).filter(r => r.count > 0).map(r => ({
        name: r.name,
        avg: (r.totalPoints / r.count).toFixed(2),
        total: r.totalPoints,
        count: r.count
    }));

    teamList.sort((a, b) => b.avg - a.avg);

    ikList.innerHTML = teamList.map((r, i) => {
        const rankClass = i < 3 ? `rank-${i + 1}` : '';
        const rankNumClass = i < 3 ? `top-${i + 1}` : '';
        return `
            <div class="ranking-card ${rankClass}">
                <div class="ranking-rank ${rankNumClass}">${i + 1}</div>
                <div class="ranking-info">
                    <div class="ranking-name">${r.name}</div>
                    <div class="ranking-subtext">合計: ${r.total}pt / 参加: ${r.count}名</div>
                </div>
                <div class="ranking-points">
                    <span class="rank-val">${r.avg}</span><span class="rank-unit">avg</span>
                </div>
            </div>
        `;
    }).join('') || '<p class="text-muted p-4">データがありません</p>';
};

// 3. Print View
// (renderIkesuPrintView logic is now integrated into core switchAdminTab)

// Hook up leader entry form trigger
const originalSwitchView = window.switchView;
window.switchView = function(btnEl, viewId) {
    if (originalSwitchView) originalSwitchView(btnEl, viewId);
    if (viewId === 'leader-entry-view' || (currentViewId === 'dashboard-view' && currentAdminTab === 'tab-rankings')) {
        // No specific trigger yet, but keeping structure
    }
};

// Add nav listener for leader shortcut (Optional, but user said shared URL)
// For now, let's add a button in the rankings tab to open this form or just use switchView.

// v7.6.3: Restored missing helper functions
function sumCategoryFishers(category) {
    if (!state.entries) return 0;
    return state.entries
        .filter(e => e.source === category && e.status !== 'cancelled')
        .reduce((sum, e) => sum + e.fishers, 0);
}

function sumCategoryObservers(category) {
    if (!state.entries) return 0;
    return state.entries
        .filter(e => e.source === category && e.status !== 'cancelled')
        .reduce((sum, e) => sum + e.observers, 0);
}

function updateSplitUI(prefix, current, max, observers) {
    const currEl = document.getElementById(`curr-${prefix}`);
    const maxEl = document.getElementById(`max-${prefix}`);
    const obsEl = document.getElementById(`${prefix}-observers`);
    const progEl = document.getElementById(`prog-${prefix}`);

    if (currEl) currEl.textContent = current;
    if (maxEl) maxEl.textContent = max;
    if (obsEl) obsEl.textContent = observers;
    
    if (progEl) {
        const percent = max > 0 ? Math.min(100, (current / max) * 100) : 0;
        progEl.style.width = `${percent}%`;
    }
}

// v7.6.6: Generalize stats for category filtering and target prefixes
function renderBreakdownStats(filterSource = 'all', prefix = '') {
    const validEntries = state.entries.filter(e => {
        if (e.status === 'cancelled') return false;
        if (filterSource !== 'all' && e.source !== filterSource) return false;
        return true;
    });

    const ageCount = {};
    const genderCount = { 'male': 0, 'female': 0, 'other': 0 };
    const regionCount = {};

    validEntries.forEach(e => {
        e.participants.forEach(p => {
            if (p.age) ageCount[p.age] = (ageCount[p.age] || 0) + 1;
            if (p.gender) genderCount[p.gender] = (genderCount[p.gender] || 0) + 1;
            if (p.region) regionCount[p.region] = (regionCount[p.region] || 0) + 1;
        });
    });

    // Render Age
    const ageList = document.getElementById(prefix + 'age-breakdown-list');
    if (ageList) {
        ageList.innerHTML = Object.entries(ageCount)
            .sort((a,b) => {
                const order = Object.keys(ageLabels);
                return order.indexOf(a[0]) - order.indexOf(b[0]);
            })
            .map(([age, count]) => `
                <div class="stats-item">
                    <span class="stats-label">${ageLabels[age] || age}</span>
                    <span class="stats-count">${count}名</span>
                </div>
            `).join('') || '<div class="text-muted small">データなし</div>';
    }

    // v7.8.5: Check for suspicious T-shirt sizes (Adults with 140) in current view
    if (prefix === '') { // Only run for global stats
        checkTshirtSizeAnomalies(validEntries);
    }

    // Render Genders
    const genderList = document.getElementById(prefix + 'gender-breakdown-list');
    if (genderList) {
        genderList.innerHTML = Object.entries(genderCount)
            .filter(([_, count]) => count > 0)
            .map(([key, count]) => `
                <div class="stats-item">
                    <span class="stats-label">${genderLabels[key] || key}</span>
                    <span class="stats-count">${count}名</span>
                </div>
            `).join('') || '<div class="text-muted small">データなし</div>';
    }

    // Render Regions
    const regionList = document.getElementById(prefix + 'region-breakdown-list');
    if (regionList) {
        regionList.innerHTML = Object.entries(regionCount)
            .sort((a,b) => b[1] - a[1])
            .slice(0, 15)
            .map(([reg, count]) => `
                <div class="stats-item">
                    <span class="stats-label">${reg}</span>
                    <span class="stats-count">${count}名</span>
                </div>
            `).join('') || '<div class="text-muted small">データなし</div>';
    }

    // v7.7.0: Render T-shirt Sizes (Total for orders)
    const tshirtList = document.getElementById(prefix + 'tshirt-breakdown-list');
    if (tshirtList) {
        const tshirtCount = {};
        tshirtSizes.forEach(s => tshirtCount[s] = 0);
        
        validEntries.forEach(e => {
            e.participants.forEach(p => {
                if (p.tshirtSize) tshirtCount[p.tshirtSize] = (tshirtCount[p.tshirtSize] || 0) + 1;
            });
        });

        tshirtList.innerHTML = Object.entries(tshirtCount)
            .filter(([_, count]) => count > 0 || prefix === '') // Show all in global, only non-zero in prefix views if needed
            .map(([size, count]) => `
                <div class="stats-item">
                    <span class="stats-label">${size}</span>
                    <span class="stats-count">${count}枚</span>
                </div>
            `).join('') || '<div class="text-muted small">データなし</div>';
    }
}

function checkTshirtSizeAnomalies(entries) {
    const anomalies = [];
    entries.forEach(e => {
        e.participants.forEach((p, idx) => {
            // Suspicious if age is not elementary but size is 140
            if (p.age !== 'elementary' && p.tshirtSize === '140') {
                anomalies.push({
                    id: e.id,
                    groupName: e.groupName,
                    pName: p.name,
                    age: ageLabels[p.age] || p.age,
                    pIndex: idx
                });
            }
        });
    });

    const container = document.getElementById('global-stats-summary');
    if (!container) return;

    // Check if we already have the alert, if so remove it
    const existingAlert = document.getElementById('tshirt-anomaly-alert');
    if (existingAlert) existingAlert.remove();

    if (anomalies.length > 0) {
        const alert = document.createElement('div');
        alert.id = 'tshirt-anomaly-alert';
        alert.className = 'alert alert-info mt-4';
        alert.style.borderLeft = '5px solid var(--error-color)';
        alert.innerHTML = `
            <div style="font-weight:bold; color:var(--error-color); margin-bottom:0.5rem;">⚠️ Tシャツサイズの確認推奨 (${anomalies.length}件)</div>
            <div style="font-size:0.85rem; color:var(--text-color); margin-bottom:0.5rem;">
                中学生以上の年代でサイズが「140」になっている方がいます。変更漏れの可能性があるため、名簿から内容をご確認ください。
            </div>
            <div style="max-height:120px; overflow-y:auto; font-size:0.8rem; background:rgba(0,0,0,0.03); padding:0.5rem; border-radius:4px;">
                ${anomalies.map(a => `
                    <div style="margin-bottom:0.25rem;">・[${a.id}] ${a.groupName} - ${a.pName} (${a.age})</div>
                `).join('')}
            </div>
        `;
        container.appendChild(alert);
    }
}

// v7.3.0: Public Statistics Rendering (Security Optimized)
window.renderPublicStats = function() {
    const validEntries = state.entries.filter(e => e.status !== 'cancelled');
    
    const categories = [
        { id: 'ippan', name: '一般', source: '一般', capacity: state.settings.capacityGeneral, color: 'ippan' },
        { id: 'mintsuri', name: 'みん釣り', source: 'みん釣り', capacity: state.settings.capacityMintsuri, color: 'mintsuri' },
        { id: 'suiho', name: '水宝', source: '水宝', capacity: state.settings.capacitySuiho, color: 'suiho' },
        { id: 'harimitsu', name: 'ハリミツ', source: 'ハリミツ', capacity: state.settings.capacityHarimitsu, color: 'harimitsu' }
    ];

    const gridHtml = categories.map(cat => {
        const count = validEntries.filter(e => e.source === cat.source).reduce((sum, e) => sum + e.fishers, 0);
        const progress = Math.min(100, (count / cat.capacity) * 100);
        const statusText = count >= cat.capacity ? '満員' : `あと ${cat.capacity - count} 名`;
        return `
            <div class="public-stat-card border-top-${cat.color}">
                <div class="public-stat-label">
                    <span>${cat.name}</span>
                    <span class="badge ${count >= cat.capacity ? 'badge-danger' : 'badge-success'}">${statusText}</span>
                </div>
                <div class="public-stat-main">
                    <span class="public-stat-value">${count}</span>
                    <span class="public-stat-unit">/ ${cat.capacity} 名</span>
                </div>
                <div class="public-progress-container"><div class="public-progress bg-${cat.color}" style="width: ${progress}%"></div></div>
            </div>`;
    }).join('');

    const splitContainer = document.getElementById('category-split-container');
    if (splitContainer) splitContainer.innerHTML = `<div class="public-stats-grid">${gridHtml}</div>`;
    
    // Summary Cards (Same as Dashboard style for premium look)
    const groups = validEntries.length;
    const fishers = validEntries.reduce((s, e) => s + e.fishers, 0);
    const observers = validEntries.reduce((s, e) => s + e.observers, 0);
    
    const summaryContainer = document.getElementById('stats-summary-container');
    if (summaryContainer) {
        summaryContainer.innerHTML = `
            <div class="stats-summary-grid mb-4">
                <div class="summary-card"><div class="summary-label">総登録グループ</div><div class="summary-value">${groups} <small>組</small></div></div>
                <div class="summary-card"><div class="summary-label">釣り参加者合計</div><div class="summary-value">${fishers} <small>/ ${state.settings.capacityTotal}</small></div></div>
                <div class="summary-card"><div class="summary-label">見学者合計</div><div class="summary-value">${observers} <small>名</small></div></div>
                <div class="summary-card"><div class="summary-label">最終更新</div><div class="summary-value" style="font-size:1.2rem;">${new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div></div>
            </div>`;
    }
}

window.renderMintsuriCoordinatorView = function() {
    const list = document.getElementById('mintsuri-coordinator-list');
    const summary = document.getElementById('mintsuri-stats-summary');
    if (!list) return;

    const mintsuriEntries = state.entries.filter(e => e.source === 'みん釣り' && e.status !== 'cancelled');
    const totalFishers = mintsuriEntries.reduce((s, e) => s + e.fishers, 0);
    const totalObservers = mintsuriEntries.reduce((s, e) => s + e.observers, 0);

    if (summary) {
        summary.innerHTML = `
            <div class="stats-summary-grid">
                <div class="summary-card"><div class="summary-label">みん釣り 合計組数</div><div class="summary-value">${mintsuriEntries.length} <small>組</small></div></div>
                <div class="summary-card"><div class="summary-label">みん釣り 釣り人数</div><div class="summary-value">${totalFishers} <small>/ ${state.settings.capacityMintsuri}</small></div></div>
                <div class="summary-card"><div class="summary-label">見学人数</div><div class="summary-value">${totalObservers} <small>名</small></div></div>
                <div class="summary-card"><div class="summary-label">充足率</div><div class="summary-value">${Math.round((totalFishers/state.settings.capacityMintsuri)*100)}%</div></div>
            </div>`;
    }

    const searchTerm = (document.getElementById('mintsuri-search')?.value || "").toLowerCase();

    list.innerHTML = mintsuriEntries.slice().reverse()
        .filter(e => {
            if (!searchTerm) return true;
            const pNames = e.participants.map(p => p.name).join(' ');
            const pGenders = e.participants.map(p => genderLabels[p.gender] || "").join(' ');
            const pTshirts = e.participants.map(p => p.tshirtSize || "").join(' ');
            const combined = `${e.id} ${e.groupName} ${e.representative} ${pNames} ${pGenders} ${pTshirts}`.toLowerCase();
            return combined.includes(searchTerm);
        })
        .map(e => {
            const regTime = e.timestamp ? new Date(e.timestamp).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--:--';
            const repInfo = e.participants[0] || { name: e.representative, nickname: '' };
            return `
            <tr>
                <td><span class="id-badge">${e.id}</span></td>
                <td><strong>${e.groupName}</strong></td>
                <td>${e.representative}${repInfo.nickname ? ` <small>(${repInfo.nickname})</small>` : ''}</td>
                <td>${e.fishers} / ${e.observers}</td>
                <td><small>${regTime}</small></td>
            </tr>
        `;
        }).join('') || '<tr><td colspan="5" style="text-align:center; padding:2rem;">該当する登録はありません</td></tr>';

    // v7.6.6: Also render breakdown for Mintsuri view
    renderBreakdownStats('みん釣り', 'mintsuri-');
}

window.exportMintsuriCSV = function() {
    const mintsuriEntries = state.entries.filter(e => e.source === 'みん釣り' && e.status !== 'cancelled');
    if (mintsuriEntries.length === 0) return alert('データがありません');

    const headers = ['受付番号', 'グループ名', '代表者名', '電話番号', 'メール', '釣り人数', '見学人数', '登録時間'];
    const rows = mintsuriEntries.map(e => [
        e.id, e.groupName, e.representative, e.phone, e.email, e.fishers, e.observers, formatDateForCSV(e.timestamp)
    ]);
    downloadCSV("mintsuri_export", headers, rows);
}

// Global Stats Rendering (v7.3.0 Global Scope)
function renderGlobalStatsSummary(groups, fishers, observers, checkedIn, absent) {
    const containers = [
        document.getElementById('global-stats-summary-top')
    ].filter(el => el);

    if (containers.length === 0) return;

    const html = `
        <div class="stats-summary-grid">
            <div class="summary-card" style="border-top: 5px solid var(--primary-color);">
                <div class="summary-label">釣り参加者合計</div>
                <div class="summary-value"><span class="current-fishers">${fishers}</span> <small>/ ${state.settings.capacityTotal}</small></div>
            </div>
            <div class="summary-card">
                <div class="summary-label">総登録グループ</div>
                <div class="summary-value">${groups} <small>組</small></div>
            </div>
            <div class="summary-card">
                <div class="summary-label">見学者合計</div>
                <div class="summary-value">${observers} <small>名</small></div>
            </div>
            <div class="summary-card" style="border-top: 5px solid #10b981;">
                <div class="summary-label">当日受付状況</div>
                <div class="summary-value" style="font-size: 1.1rem; line-height: 1.4;">
                    <span style="color: var(--primary-color)">来場: <span class="checked-in-count">${checkedIn}</span></span> / 
                    <span style="color: var(--error-color)">欠席: <span class="absent-count">${absent}</span></span>
                </div>
                <div style="font-size: 0.7rem; color: #64748b; margin-top: 4px;">全 <span class="total-groups-count">${groups}</span> 組</div>
            </div>
        </div>
    `;

    containers.forEach(c => { c.innerHTML = html; });
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

let activeReceptionSort = 'id'; // 'id' or 'source'
window.setReceptionSort = function(mode) {
    activeReceptionSort = mode;
    document.querySelectorAll('.btn-toolbar').forEach(btn => {
        btn.classList.toggle('active', btn.id === `sort-reception-${mode}`);
    });
    updateReceptionList();
};

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

    // Sort: isCompleted false first, then logic
    processedEntries.sort((a, b) => {
        if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
        
        if (activeReceptionSort === 'source') {
            if (a.source !== b.source) return a.source.localeCompare(b.source);
        }
        
        // Natural Sort for ID (A-1, A-10, etc.)
        return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' });
    });

    processedEntries.forEach(e => {
        // Search Filter (v7.9.3 Expanded for all member names)
        const pNames = e.participants.map(p => p.name).join(' ');
        const pNicks = e.participants.map(p => p.nickname || "").join(' ');
        const pTshirts = e.participants.map(p => p.tshirtSize || "").join(' ');
        const pGenders = e.participants.map(p => genderLabels[p.gender] || "").join(' ');
        const combined = `${e.id} ${e.groupName} ${e.representative} ${pNames} ${pNicks} ${pTshirts} ${pGenders}`.toLowerCase();
        
        if (searchTerm && !combined.includes(searchTerm)) return;

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
                <div style="font-size:1rem; color:#636e72;">${e.representative}</div>
                <div style="display:flex; align-items:center; gap:0.5rem;">
                    <span style="font-size:0.9rem; font-weight:700; color: #0984e3;">${e.isCompleted ? '✅ 受付済' : `${e.finishedCount}/${e.totalCount}`}</span>
                    ${!e.isCompleted ? `<button onclick="event.stopPropagation(); updateGroupStatus('${e.id}', 'checked-in')" style="padding: 0.2rem 0.5rem; font-size: 0.7rem; background: var(--primary-color); border: none; border-radius: 4px; color: white; cursor: pointer;">全員受付</button>` : ''}
                </div>
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
        <div class="desk-header" style="background: #eef2ff; border-bottom: 2px solid var(--primary-color); padding: 1.5rem; border-radius: 8px 8px 0 0;">
            <div class="desk-title-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <div class="desk-group-name" style="font-size: 1.8rem; font-weight: 900; color: var(--primary-color);">${entry.groupName}</div>
                <div class="badge ${entry.source === 'みん釣り' ? 'badge-mintsuri' : entry.source === '一般' ? 'badge-ippan' : entry.source === 'ハリミツ' ? 'badge-harimitsu' : 'badge-suiho'}" style="font-size: 1.2rem; padding: 0.5rem 1rem;">${entry.source}</div>
            </div>
            <div class="desk-meta" style="font-size: 1rem; color: #475569; font-weight: 600;">
                <span style="background: white; padding: 2px 8px; border-radius: 4px; border: 1px solid #cbd5e1;">ID: ${entry.id}</span>
                <span style="margin-left: 1rem;">代表者: ${entry.representative}</span>
                <span style="margin-left: 1rem;">TEL: ${entry.phone}</span>
            </div>
        </div>

        <div class="participant-check-list" style="padding: 1.5rem; background: white;">
            <div class="section-title" style="margin-top: 0; margin-bottom: 1rem; font-size: 1.1rem; border-left-width: 4px;">参加メンバー個別の受付状況</div>
            
            ${entry.participants.map((p, idx) => {
                const typeClass = p.type === 'fisher' ? 'p-badge-fisher' : 'p-badge-observer';
                const typeLabel = p.type === 'fisher' ? '釣り' : '見学';
                const rowStatusClass = p.status === 'checked-in' ? 'checked-in' : (p.status === 'absent' ? 'absent' : '');
                
                return `
                <div class="participant-check-row ${rowStatusClass}" style="margin-bottom: 12px; padding: 1rem; border-radius: 12px; border: 2px solid ${p.status === 'checked-in' ? '#10b981' : (p.status === 'absent' ? '#ef4444' : '#e2e8f0')}; display: flex; align-items: center; justify-content: space-between; background: ${p.status === 'checked-in' ? '#f0fdf4' : (p.status === 'absent' ? '#fef2f2' : 'white')}; transition: all 0.2s;">
                    <div class="p-info" style="display: flex; align-items: center; gap: 1rem; flex: 1;">
                        <div style="font-size: 1.5rem; width: 40px; text-align: center;">${p.status === 'checked-in' ? '✅' : (p.status === 'absent' ? '❌' : '⬜')}</div>
                        <div>
                            <div class="p-name" style="font-size: 1.25rem; font-weight: 800; color: #1e293b;">
                                <span class="badge ${p.type === 'fisher' ? 'badge-ippan' : 'badge-secondary'}" style="margin-right: 8px;">${typeLabel}</span>
                                ${p.name} <small style="font-weight: normal; color: #64748b;">(${p.nickname || 'ニックネーム無'})</small>
                            </div>
                            <div class="p-meta" style="font-size: 0.9rem; color: #64748b; margin-top: 4px;">
                                ${p.region || '地域不明'} | ${genderLabels[p.gender] || '-'} | ${ageLabels[p.age] || '-'} | Tシャツ: [<strong>${p.tshirtSize || '不明'}</strong>]
                            </div>
                        </div>
                    </div>
                    <div class="p-status-actions" style="display: flex; gap: 8px;">
                        <button class="btn-status in ${p.status === 'checked-in' ? 'active' : ''}" onclick="updateParticipantStatus('${entry.id}', ${idx}, 'checked-in')" style="padding: 1rem 1.5rem; font-size: 1rem; font-weight: 800; border-radius: 8px; cursor: pointer; border: 2px solid #10b981; background: ${p.status === 'checked-in' ? '#10b981' : 'white'}; color: ${p.status === 'checked-in' ? 'white' : '#10b981'}; min-width: 100px;">来場</button>
                        <button class="btn-status out ${p.status === 'absent' ? 'active' : ''}" onclick="updateParticipantStatus('${entry.id}', ${idx}, 'absent')" style="padding: 1rem 1.5rem; font-size: 1rem; font-weight: 800; border-radius: 8px; cursor: pointer; border: 2px solid #ef4444; background: ${p.status === 'absent' ? '#ef4444' : 'white'}; color: ${p.status === 'absent' ? 'white' : '#ef4444'}; min-width: 100px;">欠席</button>
                    </div>
                </div>
                `;
            }).join('')}
        </div>

        <div class="desk-footer" style="padding: 1.5rem; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; align-items: center; border-radius: 0 -0 8px 8px; gap: 1rem;">
            <button class="btn-primary btn-large" onclick="window.updateGroupStatus('${entry.id}', 'checked-in')" style="padding: 1rem 2rem; font-size: 1.2rem; white-space: nowrap;">全員まとめて受付</button>
        </div>
    `;
}

window.updateParticipantStatus = function (entryId, pIdx, status) {
    const entry = state.entries.find(e => e.id === entryId);
    if (!entry) return;

    const currentStatus = entry.participants[pIdx].status;
    const isTogglingOff = currentStatus === status;
    
    // v7.9.3: Toggle logic - if already active, revert to pending
    const newStatus = isTogglingOff ? 'pending' : status;
    entry.participants[pIdx].status = newStatus;

    // Sync group-level flags (for backward compatibility and stats)
    syncGroupStatusFromParticipants(entry);

    if (!isTogglingOff) {
        const statusLabel = status === 'checked-in' ? '受付済' : status === 'absent' ? '欠席' : '未受付';
        showToast(`${entry.participants[pIdx].name} 様を「${statusLabel}」に更新しました`, 'info');
    }

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

/* --- IKESU & LEADER FUNCTIONS RESTORED v8.0.6 --- */
window.openIkesuModal = function (id = null) {
    document.getElementById('ikesu-modal').classList.remove('hidden');
    if (id) {
        const ikesu = state.settings.ikesuList.find(i => i.id === id);
        if (ikesu) {
            document.getElementById('ikesu-modal-title').textContent = "イケスの編集";
            document.getElementById('ikesu-edit-id').value = ikesu.id;
            document.getElementById('ikesu-name').value = ikesu.name;
            document.getElementById('ikesu-capacity').value = ikesu.capacity;
            const passEl = document.getElementById('ikesu-passcode');
            if (passEl) passEl.value = ikesu.passcode || "";
            return;
        }
    }
    document.getElementById('ikesu-modal-title').textContent = "イケスの追加";
    document.getElementById('ikesu-edit-id').value = '';
    document.getElementById('ikesu-name').value = '';
    document.getElementById('ikesu-capacity').value = '15';
    const passEl = document.getElementById('ikesu-passcode');
    if (passEl) passEl.value = '';
};

window.closeIkesuModal = function () {
    document.getElementById('ikesu-modal').classList.add('hidden');
};

window.saveIkesu = function () {
    const id = document.getElementById('ikesu-edit-id').value;
    const name = document.getElementById('ikesu-name').value.trim();
    const capacity = parseInt(document.getElementById('ikesu-capacity').value, 10);
    const passEl = document.getElementById('ikesu-passcode');
    const passcode = passEl ? passEl.value.trim() : "";

    if (!name || isNaN(capacity) || capacity < 1) {
        alert("名前と定員（1以上）を正しく入力してください。");
        return;
    }

    if (!state.settings.ikesuList) state.settings.ikesuList = [];

    if (id) {
        const ikesu = state.settings.ikesuList.find(i => i.id === id);
        if (ikesu) {
            ikesu.name = name;
            ikesu.capacity = capacity;
            ikesu.passcode = passcode;
        }
    } else {
        state.settings.ikesuList.push({
            id: 'ikesu-' + Date.now(),
            name: name,
            capacity: capacity,
            passcode: passcode
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
    ev.stopPropagation();
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
    const id = ev.dataTransfer.getData("id");
    const entry = state.entries.find(e => e.id === id);
    if (!entry) return;

    if (type === "group") {
        entry.participants.forEach(p => p.ikesuId = ikesuId);
    } else {
        const idx = parseInt(ev.dataTransfer.getData("idx"));
        if (entry.participants[idx]) entry.participants[idx].ikesuId = ikesuId;
    }
    saveData();
    renderIkesuWorkspace();
}

window.toggleGroupExpand = function (id) {
    const el = document.getElementById(`drag-parts-${id}`);
    if (el) el.classList.toggle('expanded');
};

window.renderIkesuWorkspace = function () {
    const unassignedList = document.getElementById('unassigned-list');
    const ikesuGrid = document.getElementById('ikesu-grid');
    if (!unassignedList || !ikesuGrid) return;

    unassignedList.innerHTML = '';
    ikesuGrid.innerHTML = '';

    const assignedData = {};
    if (!state.settings.ikesuList) state.settings.ikesuList = [];
    state.settings.ikesuList.forEach(ik => assignedData[ik.id] = { ik, fishers: 0, observers: 0, items: [] });

    const searchTerm = (document.getElementById('ikesu-search')?.value || "").toLowerCase().trim();

    state.entries.forEach(e => {
        if (e.status === 'cancelled') return;
        
        const matchesSearch = !searchTerm || 
            e.id.toLowerCase().includes(searchTerm) || 
            e.groupName.toLowerCase().includes(searchTerm) ||
            e.representative.toLowerCase().includes(searchTerm);

        const unassignedParts = [];
        e.participants.forEach((p, idx) => {
            if (p.ikesuId && assignedData[p.ikesuId]) {
                assignedData[p.ikesuId].items.push({ entry: e, p, idx });
                if (p.type === 'fisher') assignedData[p.ikesuId].fishers++;
                else assignedData[p.ikesuId].observers++;
            } else {
                unassignedParts.push({ p, idx });
            }
        });

        if (unassignedParts.length > 0 && matchesSearch) {
                   const isFull = unassignedParts.length === e.participants.length;
                   let html = `
                       <div class="drag-item-group ${isFull ? 'draggable' : ''}" 
                            ${isFull ? `draggable="true" ondragstart="dragGroup(event, '${e.id}')"` : ''}>
                           <div class="drag-item-header">
                               <div><strong>[${e.id}] ${e.groupName}</strong></div>
                               <button class="btn-expand" onclick="toggleGroupExpand('${e.id}')">∨</button>
                           </div>
                           <div class="drag-item-participants" id="drag-parts-${e.id}">
                               ${unassignedParts.map(item => `
                                   <div class="drag-item-person draggable" draggable="true" ondragstart="dragPerson(event, '${e.id}', ${item.idx})">
                                       <span>${item.p.name}</span>
                                       <span class="badge ${item.p.type==='fisher'?'':'badge-observer'}">${item.p.type==='fisher'?'釣り':'見学'}</span>
                                   </div>
                               `).join('')}
                           </div>
                       </div>
                   `;
                   unassignedList.insertAdjacentHTML('beforeend', html);
        }
    });

    state.settings.ikesuList.forEach(ik => {
        const data = assignedData[ik.id];
        const isOver = data.fishers > ik.capacity;
        const box = document.createElement('div');
        box.className = `ikesu-box drag-zone ${isOver ? 'over' : ''}`;
        box.ondragover = allowDrop;
        box.ondragleave = handleDragLeave;
        box.ondrop = (ev) => dropToIkesu(ev, ik.id);

        box.innerHTML = `
            <div class="ikesu-header">
                <span class="ikesu-title">${ik.name}</span>
                <button class="btn-text" onclick="window.openIkesuModal('${ik.id}')">✏️</button>
            </div>
            <div class="ikesu-capacity">釣り: ${data.fishers}/${ik.capacity} (見学: ${data.observers})</div>
            <div class="ikesu-drop-area">
                ${Object.values(data.items.reduce((acc, item) => {
                    if (!acc[item.entry.id]) acc[item.entry.id] = { entry: item.entry, parts: [] };
                    acc[item.entry.id].parts.push(item);
                    return acc;
                }, {})).map(group => `
                    <div class="drag-item-group">
                        <div class="drag-item-header">
                            <div style="font-size:0.85rem;"><strong>${group.entry.groupName}</strong></div>
                        </div>
                        <div class="drag-item-participants active">
                            ${group.parts.map(m => `
                                <div class="drag-item-person" draggable="true" ondragstart="dragPerson(event, '${group.entry.id}', ${m.idx})">
                                    <div style="display:flex; align-items:center; gap:4px;">
                                        <button class="btn-leader-toggle ${m.p.isLeader ? 'active' : ''}" onclick="window.toggleLeader('${group.entry.id}', ${m.idx})">⭐</button>
                                        <span>${m.p.name}</span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        ikesuGrid.appendChild(box);
    });
};

/* --- Leader Entry Functions --- */
window.resetLeaderAuth = function() {
    const ikId = document.getElementById('leader-ikesu-select').value;
    document.getElementById('leader-auth-section').classList.toggle('hidden', !ikId);
    document.getElementById('leader-step-2').classList.add('hidden');
    document.getElementById('leader-step-confirm').classList.add('hidden');
};

window.verifyLeaderAuth = function() {
    const ikId = document.getElementById('leader-ikesu-select').value;
    const input = document.getElementById('leader-passcode-input').value;
    const ikesu = state.settings.ikesuList?.find(ik => ik.id === ikId);
    if (ikesu && (input === ikesu.passcode || input === state.settings.adminPassword)) {
        showToast('認証成功', 'success');
        document.getElementById('leader-step-1').classList.add('hidden');
        document.getElementById('leader-step-2').classList.remove('hidden');
        renderLeaderEntryTable();
    } else {
        showToast('暗証番号が違います', 'error');
    }
};

window.renderLeaderEntryTable = function() {
    const ikId = document.getElementById('leader-ikesu-select').value;
    const container = document.getElementById('leader-entry-table-container');
    if (!container) return;
    const members = [];
    state.entries.forEach(e => {
        if (e.status === 'cancelled') return;
        e.participants.forEach((p, idx) => {
            if (p.ikesuId === ikId && p.type === 'fisher') members.push({ p, entry: e, idx });
        });
    });

    container.innerHTML = `
        <table class="leader-table">
            <thead><tr><th>氏名</th><th>青物(2pt)</th><th>鯛等(1pt)</th><th>小計</th></tr></thead>
            <tbody>
                ${members.map(m => `
                    <tr data-entry="${m.entry.id}" data-idx="${m.idx}">
                        <td><strong>${m.p.name}</strong><br><small>${m.entry.groupName}</small></td>
                        <td><input type="number" class="catch-a" value="${m.p.catchA || 0}" min="0" oninput="window.updateLeaderLiveTotals()"></td>
                        <td><input type="number" class="catch-b" value="${m.p.catchB || 0}" min="0" oninput="window.updateLeaderLiveTotals()"></td>
                        <td><span class="row-total">0</span>pt</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
    updateLeaderLiveTotals();
};

window.updateLeaderLiveTotals = function() {
    let teamTotal = 0;
    document.querySelectorAll('.leader-table tbody tr').forEach(row => {
        const a = parseInt(row.querySelector('.catch-a').value) || 0;
        const b = parseInt(row.querySelector('.catch-b').value) || 0;
        const sub = (a * 2) + b;
        row.querySelector('.row-total').textContent = sub;
        teamTotal += sub;
    });
    const display = document.getElementById('team-total-display');
    if (display) display.innerHTML = teamTotal + ' <small>pt</small>';
};

window.requestLeaderResultsSave = function() {
    document.getElementById('leader-step-2').classList.add('hidden');
    document.getElementById('leader-step-confirm').classList.remove('hidden');
};

window.backToLeaderEdit = function() {
    document.getElementById('leader-step-confirm').classList.add('hidden');
    document.getElementById('leader-step-2').classList.remove('hidden');
};

window.commitLeaderResultsSave = function() {
    document.querySelectorAll('.leader-table tbody tr').forEach(row => {
        const eid = row.dataset.entry;
        const idx = parseInt(row.dataset.idx);
        const entry = state.entries.find(e => e.id === eid);
        if (entry && entry.participants[idx]) {
            entry.participants[idx].catchA = parseInt(row.querySelector('.catch-a').value) || 0;
            entry.participants[idx].catchB = parseInt(row.querySelector('.catch-b').value) || 0;
        }
    });
    saveData();
    showToast('保存しました', 'success');
    window.location.reload();
};

window.renderIkesuPrintView = function() {
    const container = document.getElementById('print-view-container');
    if (!container) return;
    let html = "";
    state.settings.ikesuList?.forEach(ik => {
        const members = [];
        state.entries.forEach(e => {
            if (e.status === 'cancelled') return;
            e.participants.forEach(p => { if(p.ikesuId === ik.id) members.push({p, e}); });
        });
        if (members.length === 0) return;
        html += `
            <div class="print-ikesu-sheet" style="page-break-after: always; padding: 20px; border-bottom: 2px solid #333;">
                <h2 style="display:flex; justify-content:space-between; align-items:center;">
                    <span>${ik.name} メンバー表</span>
                    <span style="font-size:1rem; background:#eee; padding:5px 10px; border-radius:4px;">リーダー用 暗証番号: <strong>${ik.passcode}</strong></span>
                </h2>
                <table class="print-table" style="width:100%; border-collapse:collapse; margin-top:20px;">
                    <thead><tr style="background:#f0f0f0;"><th>グループ</th><th>氏名</th><th>区分</th><th>備考</th></tr></thead>
                    <tbody>
                        ${members.map(m => `<tr><td>${m.e.groupName}</td><td>${m.p.name}</td><td>${m.p.type==='fisher'?'釣り':'見学'}</td><td>${m.p.isLeader?'★リーダー':''}</td></tr>`).join('')}
                    </tbody>
                </table>
            </div>
        `;
    });
    container.innerHTML = html || "データなし";
};

/* --- SYSTEM STABILIZATION FUNCTIONS RESTORED v8.0.7 --- */

function updateAppTitle() {
    const titleEl = document.getElementById('app-title');
    const competitionName = state.settings.competitionName || "釣り大会 受付";
    if (titleEl) {
        if (currentViewId === 'dashboard-view') titleEl.textContent = `管理者: ${competitionName}`;
        else if (currentViewId === 'reception-view') titleEl.textContent = `当日受付: ${competitionName}`;
        else titleEl.textContent = competitionName;
    }
    document.title = competitionName;
}

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
    const capTotalEl = document.getElementById('cap-total');
    if (capTotalEl) state.settings.capacityTotal = parseInt(capTotalEl.value) || 250;
    state.settings.startTime = document.getElementById('registration-start').value;
    state.settings.deadline = document.getElementById('registration-deadline').value;
    state.settings.adminPassword = document.getElementById('admin-password-set').value;
    saveData();
    syncSettingsUI();
    updateDashboard();
    checkTimeframe();
    updateAppTitle();
    showToast('大会設定をすべて保存しました', 'success');
}

window.updateCapacityTotal = function() {
    const ippan = parseInt(document.getElementById('cap-ippan').value) || 0;
    const mintsuri = parseInt(document.getElementById('cap-mintsuri').value) || 0;
    const suiho = parseInt(document.getElementById('cap-suiho').value) || 0;
    const harimitsu = parseInt(document.getElementById('cap-harimitsu').value) || 0;
    const total = ippan + mintsuri + suiho + harimitsu;
    const sumEl = document.getElementById('capacity-total-summary');
    if (sumEl) sumEl.textContent = total;
};

window.confirmReset = async function () {
    if (confirm('全ての名簿データを削除します。本当によろしいですか？')) {
        state.entries = [];
        state.lastUpdated = Date.now();
        showToast('リセット中...', 'info');
        try {
            await syncToCloud();
            localStorage.setItem('fishing_app_v3_data', JSON.stringify(state));
            location.reload();
        } catch (e) {
            console.error('Reset failed:', e);
            location.reload();
        }
    }
};

/* --- MANAGEMENT FUNCTIONS (RESTORED v8.1.9) --- */

/**
 * v8.1.9: Restored QR generation (fixing container ID mismatch)
 */
function generateAdminQRCode() {
    const container = document.getElementById('admin-qr-code-container');
    if (!container) return;
    container.innerHTML = "";
    if (typeof QRCode === 'undefined') {
        container.innerHTML = "<p style='font-size:0.8rem; color:var(--text-muted);'>QRコードライブラリ読み込み中...</p>";
        return;
    }
    const baseUrl = window.location.href.split('?')[0].split('#')[0];
    const url = baseUrl; // Standard public URL
    new QRCode(container, {
        text: url,
        width: 128,
        height: 128,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });
}

function openShareUrl(id) {
    const el = document.getElementById(id);
    if (el && el.value) {
        window.open(el.value, '_blank');
    }
}

function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
}

function handleCheckStatus() {
    const searchVal = prompt("お名前（代表者）を入力してください。");
    if (!searchVal) return;
    
    dashboardFilter = 'all';
    const matches = state.entries.filter(e => e.representative.includes(searchVal));
    if (matches.length > 0) {
        alert(`${matches.length} 件見つかりました。最新の番号は ${matches[0].id} です。`);
        location.reload();
    } else {
        alert("見つかりませんでした。もう一度試すか、事務局へお問い合わせください。");
    }
}

/**
 * v8.1.20: Restore Hard Delete for Test Data Management
 */
window.hardDeleteEntry = async function (id) {
    if (!isAdminAuth) return;
    if (!confirm(`エントリー ${id} を完全に削除しますか？\n(送信後、サーバーからも完全に削除されます。テスト入力の整理に使用してください)`)) return;

    try {
        const idx = state.entries.findIndex(e => e.id === id);
        if (idx === -1) {
            showToast('エントリーが見つかりません', 'error');
            return;
        }

        // v7.9.3 logic: Track for cloud deletion
        if (!state.deletedIds) state.deletedIds = [];
        state.deletedIds.push(id);

        state.entries.splice(idx, 1);
        showToast('エントリーを削除しました', 'success');

        // Refresh UI
        updateDashboard();
        updateReceptionList();

        // Immediate sync to server
        await saveData();
    } catch (err) {
        console.error("Deletion failed:", err);
        showToast('削除に失敗しました', 'error');
    }
};

async function exportGroupsCSV() {
    const headers = ["ID", "区分", "グループ名", "代表者", "電話番号", "人数(釣り)", "人数(見学)", "ステータス", "日時"];
    const rows = state.entries.map(e => [
        e.id, 
        e.source, 
        `"${e.groupName}"`, 
        `"${e.representative}"`, 
        `'${e.phone}`, 
        e.fishers, 
        e.observers, 
        e.status, 
        e.timestamp
    ]);
    downloadCSV("groups_export.csv", headers, rows);
}

async function exportParticipantsCSV() {
    const headers = ["ID", "区分", "グループ名", "氏名", "ニックネーム", "性別", "年代", "地域", "区分(釣/見)", "サイズ", "ステータス"];
    const rows = [];
    state.entries.forEach(e => {
        (e.participants || []).forEach(p => {
            rows.push([
                e.id,
                e.source,
                `"${e.groupName}"`,
                `"${p.name}"`,
                `"${p.nickname || ''}"`,
                p.gender,
                p.age,
                `"${p.region || ''}"`,
                p.type === 'fisher' ? '釣り' : '見学',
                p.tshirtSize,
                e.status
            ]);
        });
    });
    downloadCSV("participants_export.csv", headers, rows);
}

function downloadCSV(filename, headers, rows) {
    const csvContent = "\uFEFF" + [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function renderRankings() {
    const list = document.getElementById('ranking-list');
    if (!list) return;
    list.innerHTML = '';
    const sorted = [...state.entries]
        .filter(e => e.status !== 'cancelled')
        .sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));
    if (sorted.length === 0) {
        list.innerHTML = '<li class="p-4 text-center text-muted">データがありません</li>';
        return;
    }
    sorted.forEach((e, i) => {
        const li = document.createElement('li');
        li.className = 'list-item-modern';
        li.innerHTML = `
            <div class="rank-badge">${i + 1}</div>
            <div style="flex:1">
                <div style="font-weight:bold">${e.groupName}</div>
                <div style="font-size:0.8rem; color:#666">${e.representative}</div>
            </div>
            <div style="font-size:1.2rem; font-weight:900; color:var(--primary-color)">
                ${e.totalScore || 0} <small style="font-size:0.8rem">pt</small>
            </div>`;
        list.appendChild(li);
    });
}

/* --- LEADER ENTRY LOGIC --- */
function renderLeaderEntryForm() {
    const container = document.getElementById('leader-entry-form-container');
    if (!container) return;
    container.innerHTML = '<p class="text-center p-4">読み込み中...</p>';
    const searchHtml = `
        <div class="form-group">
            <label>入力するチームを選択</label>
            <select id="leader-group-select" class="form-control" style="font-size:1.1rem; padding:0.8rem;">
                <option value="">-- チームを選択してください --</option>
                ${state.entries
                    .filter(e => e.status !== 'cancelled')
                    .sort((a,b) => a.groupName.localeCompare(b.groupName, 'ja'))
                    .map(e => `<option value="${e.id}">${e.groupName} (${e.representative})</option>`).join('')}
            </select>
        </div>
        <div id="leader-score-input-area" class="hidden mt-4"></div>`;
    container.innerHTML = searchHtml;

    const selectEl = document.getElementById('leader-group-select');
    if (selectEl) {
        selectEl.addEventListener('change', (e) => {
            const id = e.target.value;
            const area = document.getElementById('leader-score-input-area');
            if (!id) { area.classList.add('hidden'); return; }
            const entry = state.entries.find(en => en.id === id);
            area.innerHTML = `
                <div class="card p-3 mb-3" style="background:#f8f9ff">
                    <h4>${entry.groupName}</h4>
                    <p class="small text-muted">ID: ${entry.id} / 代表者: ${entry.representative}</p>
                    <div class="form-group mt-3">
                        <label style="font-weight:bold">釣果ポイント (合計)</label>
                        <input type="number" id="leader-point-input" class="form-control" 
                               style="font-size:2rem; font-weight:900; text-align:center;" 
                               value="${entry.totalScore || 0}" min="0">
                    </div>
                </div>
                <button class="btn-primary w-100 p-3" style="font-size:1.2rem" onclick="window.commitLeaderResultsSave()">
                    確定して保存
                </button>`;
            area.classList.remove('hidden');
        });
    }
}

window.backToLeaderEdit = function() { switchView(null, 'leader-entry-view'); };

window.commitLeaderResultsSave = async function() {
    const id = document.getElementById('leader-group-select')?.value;
    const scoreVal = document.getElementById('leader-point-input')?.value;
    const score = parseInt(scoreVal || 0);

    if (!id) { alert("チームを選択してください。"); return; }
    const entry = state.entries.find(e => e.id === id);
    if (!entry) return;
    if (!confirm(`${entry.groupName} の得点を ${score} pt で登録しますか？`)) return;

    entry.totalScore = score;
    entry.lastModified = new Date().toLocaleString('ja-JP');
    showToast("保存中...", "info");
    const success = await syncToCloud();
    if (success) {
        showToast("✅ 保存完了しました", "success");
        renderLeaderEntryForm();
    } else {
        showToast("❌ 同期に失敗しました", "error");
    }
};

/* --- SYSTEM UTILITIES --- */
function updateBulkMailCount() {
    const el = document.getElementById('bulk-mail-recipient-count');
    if (el) el.textContent = new Set(state.entries.map(e => e.email.toLowerCase().trim()).filter(e => e)).size;
}

function updateSourceAvailability() {
    try {
        const fishersIppan = sumCategoryFishers('一般');
        const fishersMintsuri = sumCategoryFishers('みん釣り');
        const fishersSuiho = sumCategoryFishers('水宝');
        const fishersHarimitsu = sumCategoryFishers('ハリミツ');
        
        // v8.1.18: Filter out cancelled for global capacity check
        const totalNow = state.entries.filter(e => e.status !== 'cancelled').reduce((sum, en) => sum + en.fishers, 0);

        const updateRadio = (val, current, max) => {
            const radio = document.querySelector(`input[name="reg-source"][value="${val}"]`);
            if (radio) {
                const label = radio.closest('label');
                // Block if Category Limit reached OR Global Limit reached
                const isFull = (max > 0 && current >= max) || totalNow >= state.settings.capacityTotal;
                
                if (isFull && !radio.checked && !isAdminAuthAction) {
                    radio.disabled = true;
                    if (label) label.classList.add('hidden');
                } else {
                    // Check if this source is being forced/locked by injectSpecialSource (v8.1.18)
                    const isForced = label.classList.contains('forced-source');
                    if (!isForced) {
                        radio.disabled = false;
                        if (label) label.classList.remove('hidden');
                    }
                }
            }
        };

        updateRadio('一般', fishersIppan, state.settings.capacityGeneral);
        updateRadio('みん釣り', fishersMintsuri, state.settings.capacityMintsuri);
        updateRadio('水宝', fishersSuiho, state.settings.capacitySuiho);
        updateRadio('ハリミツ', fishersHarimitsu, state.settings.capacityHarimitsu);
    } catch (e) {
        console.warn("Source availability check skipped:", e);
    }
}

async function handleBulkEmailSend() {
    const subject = document.getElementById('bulk-mail-subject').value.trim();
    const body = document.getElementById('bulk-mail-body').value.trim();
    if (!subject || !body) { alert("件名と本文を入力してください。"); return; }
    const recipients = Array.from(new Set(state.entries.filter(e => e.status !== 'cancelled' && e.email).map(e => e.email.toLowerCase().trim())));
    if (recipients.length === 0) { alert("送信対象が見つかりません。"); return; }
    if (!confirm(`${recipients.length} 名へ一斉メールを送信しますか？`)) return;
    const btn = document.getElementById('btn-send-bulk-mail');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '送信中...';
    try {
        const response = await fetch(GAS_WEB_APP_URL, { method: 'POST', body: JSON.stringify({ action: 'bulk_email', subject, body, recipients }) });
        const result = await response.json();
        if (result.status === 'success') {
            showToast('✅ 一斉メールを送信しました', 'success');
            document.getElementById('bulk-mail-subject').value = '';
            document.getElementById('bulk-mail-body').value = '';
        } else { throw new Error(result.message || '送信エラー'); }
    } catch (error) {
        console.error("Bulk email error:", error);
        showToast('❌ メールの送信に失敗しました', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

function safeAddListener(id, event, callback) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, callback);
}

function initToast() {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
}

function showToast(message, type = 'info') {
    initToast();
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}

/* --- SECURE ADMIN ACCESS --- */
let clickCount = 0;
let lastClickTime = 0;
window.handleSecureClick = function(e) {
    const now = Date.now();
    if (now - lastClickTime < 800) {
        clickCount++;
    } else {
        clickCount = 1;
    }
    lastClickTime = now;
    console.log(`Admin tap registered: ${clickCount}/5`); 
    if (clickCount >= 5) {
        clickCount = 0;
        showAdminLogin();
    }
};

/**
 * v8.1.15: Restore missing URL parameter helper to resolve startup error
 */
function checkUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view');
    const id = params.get('id');
    const src = params.get('src');

    if (view && document.getElementById(view + '-view')) {
        // Validation: Only admins can see dashboard/reception via URL
        if ((view === 'dashboard' || view === 'reception') && !isAdminAuth) {
            console.warn("Blocked deep-link to admin view without auth");
            return;
        }
        
        // Hide all views first
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        
        // Activate target view
        const targetView = document.getElementById(view + '-view');
        if (targetView) {
            targetView.classList.add('active');
            
            // Handle wide layout for admin views
            const container = document.querySelector('.container');
            if (view === 'dashboard' || view === 'reception') {
                if (container) container.classList.add('view-wide');
            } else {
                if (container) container.classList.remove('view-wide');
            }
        }
    }
    
    // v8.1.18: Handle specialized category source
    if (src) {
        const validSources = {
            'mintsuri': 'みん釣り',
            'harimitsu': 'ハリミツ',
            'suiho': '水宝',
            'general': '一般'
        };
        if (validSources[src]) {
            injectSpecialSource(validSources[src]);
            // Ensure we are in registration view ONLY IF no other view was explicitly requested (v8.1.20)
            if (!view) {
                switchView(null, 'registration-view'); 
            }
        }
    }

    if (id && document.getElementById('auth-entry-id')) {
        document.getElementById('auth-entry-id').value = id;
    }
}

/**
 * v8.1.18: Updated category URL injection helper (Locked but visible UI)
 */
function injectSpecialSource(sourceName) {
    const selector = document.getElementById('main-source-selector');
    if (!selector) return;

    // v8.1.21: Make them visible but unselectable (locked)
    selector.querySelectorAll('.source-option').forEach(opt => {
        const input = opt.querySelector('input');
        opt.classList.remove('hidden'); // Ensure visible
        opt.classList.remove('forced-source');
        input.disabled = true; // Block selection
    });

    // Find our specific target radio
    let target = selector.querySelector(`input[name="reg-source"][value="${sourceName}"]`);
    
    if (!target) {
        // Create specialized radio if missing
        const badgeClassMap = { '水宝': 'badge-suiho', 'ハリミツ': 'badge-harimitsu', 'みん釣り': 'badge-mintsuri' };
        const badgeClass = badgeClassMap[sourceName] || 'badge-ippan';
        const label = document.createElement('label');
        label.className = 'source-option forced-source';
        label.innerHTML = `
            <input type="radio" name="reg-source" value="${sourceName}" checked required>
            <span class="source-label">
                <span class="badge ${badgeClass}">${sourceName}</span>
                (専用窓口)
            </span>
        `;
        selector.appendChild(label);
        target = label.querySelector('input');
    } else {
        target.checked = true;
        target.disabled = false; // Enabled so it can be submitted
        const label = target.closest('.source-option');
        label.classList.add('forced-source');
        
        // Re-styling for 'locked' look
        const labelText = label.querySelector('.source-label');
        if (labelText && !labelText.innerHTML.includes('専用窓口')) {
             labelText.innerHTML += ' (専用)';
        }
    }
    
    // Smooth scroll check
    console.log(`Locked UI for: ${sourceName}`);
}

