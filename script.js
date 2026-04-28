const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbyGmFH8-GXlWes9GHH-uELyT1NQNDAcK3JatxOSw331-Wd928ZHP9xKAcQFnnekHNLy/exec";

let state = {
    entries: [],
    deletedIds: [], // v7.9.3: Tracking local hard-deletions
    settings: {
        competitionName: "隨ｬ1蝗・驥｣繧雁､ｧ莨・,
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
            ...Array.from({length: 6}, (_, i) => ({ id: `small-${i+1}`, name: `蟆・{i+1}`, capacity: 6 })),
            { id: 'small-7', name: '蟆・', capacity: 6 },
            { id: 'small-7n', name: '蟆・蛹・, capacity: 6 },
            ...Array.from({length: 4}, (_, i) => ({ id: `small-${i+8}`, name: `蟆・{i+8}`, capacity: 6 })),
            ...Array.from({length: 10}, (_, i) => ({ id: `med-${i+1}`, name: `荳ｭ${i+1}`, capacity: 8 })),
            ...Array.from({length: 3}, (_, i) => ({ id: `large-${i+1}`, name: `螟ｧ${i+1}`, capacity: 12 })),
            ...Array.from({length: 3}, (_, i) => ({ id: `dep-${i+1}`, name: `縺ｧ縺｣縺ｱ繧・{i+1}`, capacity: 12 })),
            ...Array.from({length: 8}, (_, i) => ({ id: `south-${i+1}`, name: `蜊・{i+1}`, capacity: 12 }))
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

/**
 * v8.2.12: Unified Bypass Authorization Helper (Promoted to Top)
 */
function isBypassAllowed() {
    const editId = document.getElementById('edit-entry-id')?.value || '';
    return isAdminAuth || isAdminAuthAction || !!editId || currentViewId.includes('coordinator-view');
}

/**
 * v8.2.12: Core Global Handlers (Promoted to Top)
 */
window.showConfirmation = function() {
    console.log("BORIJIN: showConfirmation started");
    const editId = document.getElementById('edit-entry-id')?.value || '';
    const isAdmin = isBypassAllowed();
    
    // v8.2.10: Force clear timeframe overlay
    const overlay = document.getElementById('timeframe-overlay');
    if (overlay) overlay.classList.add('hidden');

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

    if (participants.length === 0) {
        showStatus("蜿ょ刈閠・ｒ1蜷堺ｻ･荳顔匳骭ｲ縺励※縺上□縺輔＞縲・, "error");
        return;
    }

    const groupName = document.getElementById('group-name').value;
    const repName = document.getElementById('representative-name').value;
    const repPhone = document.getElementById('rep-phone').value;
    const repEmail = document.getElementById('rep-email').value;
    const repEmailConfirm = document.getElementById('rep-email-confirm').value;

    if (repEmail !== repEmailConfirm) {
        showStatus("繝｡繝ｼ繝ｫ繧｢繝峨Ξ繧ｹ縺御ｸ閾ｴ縺励∪縺帙ｓ縲ゅｂ縺・ｸ蠎ｦ縺皮｢ｺ隱阪￥縺縺輔＞縲・, "error");
        return;
    }

    const sourceEl = document.querySelector('input[name="reg-source"]:checked');
    const source = sourceEl ? sourceEl.value : '荳闊ｬ';
    const fisherCount = participants.filter(p => p.type === 'fisher').length;

    // v8.2.27: Capacity check in confirmation disabled per user request
    if (false) {
        const currentCategoryFishers = state.entries
            .filter(en => en.id !== editId && en.source === source && en.status !== 'cancelled')
            .reduce((sum, en) => sum + en.fishers, 0);

        let capacityLimit = 0;
        if (source === '荳闊ｬ') capacityLimit = state.settings.capacityGeneral;
        else if (source === '縺ｿ繧馴・繧・) capacityLimit = state.settings.capacityMintsuri;
        else if (source === '豌ｴ螳・) capacityLimit = state.settings.capacitySuiho;
        else if (source === '繝上Μ繝溘ヤ') capacityLimit = state.settings.capacityHarimitsu;

        if (currentCategoryFishers + fisherCount > capacityLimit) {
            showStatus(`螟ｧ螟臥筏縺苓ｨｳ縺ゅｊ縺ｾ縺帙ｓ縲ゅ％縺ｮ譫・・{source}・峨・螳壼藤縺ｫ驕斐＠縺溘◆繧√∫樟蝨ｨ蜿嶺ｻ倥ｒ蛛懈ｭ｢縺励※縺翫ｊ縺ｾ縺吶Ａ, "error");
            return;
        }
    }

    document.getElementById('conf-source').textContent = source;
    document.getElementById('conf-group').textContent = groupName;
    document.getElementById('conf-rep-name').textContent = repName;
    document.getElementById('conf-rep-phone').textContent = repPhone;
    document.getElementById('conf-rep-email').textContent = repEmail;

    const summaryList = document.getElementById('conf-participant-summary');
    summaryList.innerHTML = '';
    participants.forEach((p, idx) => {
        const li = document.createElement('li');
        li.textContent = `${p.name} (${p.nickname || '繝九ャ繧ｯ繝阪・繝縺ｪ縺・}) - ${p.type === 'fisher' ? '驥｣繧・ : '隕句ｭｦ'}`;
        summaryList.appendChild(li);
    });

    document.getElementById('registration-form').classList.add('hidden');
    document.getElementById('confirmation-section').classList.remove('hidden');
    document.getElementById('app-title').textContent = "逋ｻ骭ｲ蜀・ｮｹ縺ｮ遒ｺ隱・;
    window.scrollTo(0, 0);
}

window.handleRegistration = async function() {
    const submitBtn = document.getElementById('submit-registration');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = "菫晏ｭ倅ｸｭ... 縺昴・縺ｾ縺ｾ縺雁ｾ・■縺上□縺輔＞";

    const now = new Date();
    const editId = document.getElementById('edit-entry-id')?.value || '';
    const isPowerUser = isBypassAllowed();
    
    // v8.2.19: Forced clear timeframe overlay removed in v8.2.26

    // v8.2.19: All guards disabled per user request
    if (false) { }

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
    const source = sourceEl ? sourceEl.value : '荳闊ｬ';
    const fisherCount = participants.filter(p => p.type === 'fisher').length;
    const observerCount = participants.filter(p => p.type === 'observer').length;

    // v8.2.19: Capacity check disabled per user request
    if (false) {
        const currentCategoryFishers = state.entries
            .filter(en => en.id !== editId && en.source === source && en.status !== 'cancelled')
            .reduce((sum, en) => sum + en.fishers, 0);
        const totalNow = state.entries
            .filter(en => en.id !== editId && en.status !== 'cancelled')
            .reduce((sum, en) => sum + en.fishers, 0);

        let capacityLimit = 0;
        if (source === '荳闊ｬ') capacityLimit = state.settings.capacityGeneral;
        else if (source === '縺ｿ繧馴・繧・) capacityLimit = state.settings.capacityMintsuri;
        else if (source === '豌ｴ螳・) capacityLimit = state.settings.capacitySuiho;
        else if (source === '繝上Μ繝溘ヤ') capacityLimit = state.settings.capacityHarimitsu;

        if (currentCategoryFishers + fisherCount > capacityLimit || totalNow + fisherCount > state.settings.capacityTotal) {
            alert('螳壼藤繧ｪ繝ｼ繝舌・縺ｮ縺溘ａ逋ｻ骭ｲ縺ｧ縺阪∪縺帙ｓ縲・);
            return;
        }
    }

    const existingEntry = editId ? state.entries.find(en => en.id === editId) : null;
    const finalParticipants = participants.map((p, idx) => {
        const oldP = existingEntry && existingEntry.participants[idx];
        if (oldP && oldP.name === p.name) {
            return { ...p, ikesuId: oldP.ikesuId || null, isLeader: oldP.isLeader || false, status: oldP.status || 'pending' };
        }
        return { ...p, ikesuId: null, isLeader: false, status: 'pending' };
    });

    const entryData = {
        id: editId || null,
        groupName: document.getElementById('group-name').value,
        representativeName: document.getElementById('representative-name').value,
        repPhone: document.getElementById('rep-phone').value,
        repEmail: document.getElementById('rep-email').value,
        source: source,
        fishers: fisherCount,
        observers: observerCount,
        participants: finalParticipants,
        status: existingEntry ? existingEntry.status : 'pending',
        timestamp: existingEntry ? existingEntry.timestamp : new Date().toLocaleString('ja-JP'),
        lastModified: existingEntry ? new Date().toLocaleString('ja-JP') : null
    };

    // v8.2.18: Removed undefined showLoading()
    try {
        // v8.2.25: Using 'no-cors' to force transmission through browser security
        await fetch(GAS_WEB_APP_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: editId ? 'edit' : 'register', entry: entryData })
        });

        // In no-cors mode, we can't check result.status, so we assume success if no exception
        showToast(editId ? "菫ｮ豁｣繧帝∽ｿ｡縺励∪縺励◆縲・ : "逋ｻ骭ｲ繧帝∽ｿ｡縺励∪縺励◆縲・, "success");
        
        // Show result screen immediately
        showResult(entryData);
        
        // Refresh data in background if possible (this might still fail if loadData also has CORS issues)
        setTimeout(() => loadData(), 1000); 

    } catch (error) {
        console.error('Registration error:', error);
        showStatus('騾壻ｿ｡繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆縲ょ・蠎ｦ縺願ｩｦ縺励￥縺縺輔＞縲・[' + error.toString() + ']', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    } finally {
        // v8.2.18: Removed undefined hideLoading()
    }
}

window.finalizeAdminEdit = async function() {
    await window.handleRegistration();
}

// Age labels map - v4.8 Updated
const ageLabels = {
    "elementary": "蟆丞ｭｦ逕滉ｻ･荳・,
    "middle_high": "荳ｭ繝ｻ鬮俶｡逕・,
    "19_20s": "19豁ｳ縲・0莉｣",
    "30s": "30莉｣", "40s": "40莉｣", "50s": "50莉｣",
    "60s": "60莉｣", "70s": "70莉｣", "80s": "80豁ｳ莉･荳・
};

const genderLabels = {
    "male": "逕ｷ諤ｧ",
    "female": "螂ｳ諤ｧ",
    "other": "縺昴・莉・
};

const tshirtSizes = ['140', '150', 'S', 'M', 'L', 'XL・・L・・, '2XL・・L・・, '3XL・・L・・, '4XL・・L・・];

/// Admin Registration Helper
window.startAdminRegistration = function (source) {
    resetForm();
    isAdminAuthAction = true; // v8.1.99: Set action flag to allow bypass during this session
    switchView(null, 'registration-view');

    // v8.2.02: Correct badge class and auto-fill password
    const badgeClassMap = { '荳闊ｬ': 'badge-ippan', '縺ｿ繧馴・繧・: 'badge-mintsuri', '豌ｴ螳・: 'badge-suiho', '繝上Μ繝溘ヤ': 'badge-harimitsu' };
    const badgeClass = badgeClassMap[source] || 'badge-ippan';
    
    const label = document.createElement('label');
    label.className = 'source-option admin-only temp-option';
    label.innerHTML = `
        <input type="radio" name="reg-source" value="${source}" checked>
        <span class="source-label">
            <span class="badge ${badgeClass}">${source}</span>
            ${source}荳諡ｬ逋ｻ骭ｲ
        </span>
    `;
    selector.appendChild(label);

    // v8.2.02: Auto-fill password for admin-led registrations to pass validation
    const passInput = document.getElementById('edit-password');
    if (passInput) passInput.value = '0000';

    // Smooth scroll to form start
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Ensure selector is visible for admin
    const selectorGroup = document.getElementById('source-selector-group');
    if (selectorGroup) selectorGroup.classList.remove('hidden');
};
// Initialization
document.addEventListener('DOMContentLoaded', () => {
    try {
        console.log("BORIJIN APP v8.2.12: HANDLERS PROMOTED");

        // v8.1.30: Priority 1 - Restore UI State immediately
        restoreUIState();

        // v8.1.30: Priority 2 - Load data
        loadData().catch(e => console.error("BORIJIN APP: loadData background error", e));

        // v8.1.30: Priority 3 - Register event listeners and initial UI components
        initApp();

        if (isAdminAuth) {
            startAutoSync();
        }

        console.log("BORIJIN APP: Initialization Sequence Finished successfully.");
    } catch (e) {
        console.error("BORIJIN APP: FATAL INITIALIZATION ERROR", e);
        // Alert the user so we know exactly why it's failing
        alert("繧ｷ繧ｹ繝・Β襍ｷ蜍墓凾縺ｫ繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆: " + e.message + "\n逕ｻ髱｢諠・ｱ繧貞・隱ｭ縺ｿ霎ｼ縺ｿ縺励※縺上□縺輔＞縲・);
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

    // v8.1.31: If 'view' or 'src' exists in URL, do NOT restore from session
    if (viewParam || params.get('src')) return;

    if (currentViewId && currentViewId !== 'registration-view') {
        // v8.1.55: Use a small delay to ensure elements are ready
        setTimeout(() => {
            const lastBtn = document.querySelector(`.nav-btn[data-target="${currentViewId}"]`);
            switchView(lastBtn, currentViewId, true); // true = skip pushState
        }, 10);
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
        // 繧ｿ繧､繝繧｢繧ｦ繝・5遘偵ｒ險ｭ螳夲ｼ磯壻ｿ｡迺ｰ蠅・∈縺ｮ驟肴・・・
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
                            ...Array.from({length: 6}, (_, i) => ({ id: `small-${i+1}`, name: `蟆・{i+1}`, capacity: 6 })),
                            { id: 'small-7', name: '蟆・', capacity: 6 },
                            { id: 'small-7n', name: '蟆・蛹・, capacity: 6 },
                            ...Array.from({length: 4}, (_, i) => ({ id: `small-${i+8}`, name: `蟆・{i+8}`, capacity: 6 })),
                            ...Array.from({length: 10}, (_, i) => ({ id: `med-${i+1}`, name: `荳ｭ${i+1}`, capacity: 8 })),
                            ...Array.from({length: 3}, (_, i) => ({ id: `large-${i+1}`, name: `螟ｧ${i+1}`, capacity: 12 })),
                            ...Array.from({length: 3}, (_, i) => ({ id: `dep-${i+1}`, name: `縺ｧ縺｣縺ｱ繧・{i+1}`, capacity: 12 })),
                            ...Array.from({length: 8}, (_, i) => ({ id: `south-${i+1}`, name: `蜊・{i+1}`, capacity: 12 }))
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
                finalizeLoad(true); // v8.1.52: Identify as refresh to skip redundant resets
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
        // 笘・繝ｭ繝ｼ繧ｫ繝ｫ繝・・繧ｿ繧定ｪｭ縺ｿ霎ｼ繧縺後√け繝ｩ繧ｦ繝峨∈縺ｯ蜍晄焔縺ｫ騾√ｉ縺ｪ縺・ｼ井ｸ頑嶌縺埼亟豁｢・・
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
 * v6.5 鬮伜ｺｦ繝槭・繧ｸ繝ｭ繧ｸ繝・け: ID蜊倅ｽ・+ 蛟句挨繧ｿ繧､繝繧ｹ繧ｿ繝ｳ繝・lastModified)縺ｧ豈碑ｼ・
 */
function mergeData(local, cloud) {
    // 蟶ｸ縺ｫ繧ｯ繝ｩ繧ｦ繝峨ｒ譛譁ｰ縺ｮ迥ｶ諷九・繝吶・繧ｹ縺ｨ縺吶ｋ
    const merged = { ...cloud }; 
    const localMap = new Map(local.entries.map(e => [e.id, e]));
    const cloudMap = new Map(cloud.entries.map(e => [e.id, e]));

    // --- 1. 繝ｭ繝ｼ繧ｫ繝ｫ蝗ｺ譛会ｼ域悴蜷梧悄・峨・繝・・繧ｿ繧偵・繝ｼ繧ｸ ---
    local.entries.forEach(lEntry => {
        const isServerId = /^[AMSH]-\d{3}$/.test(lEntry.id);
        
        if (!cloudMap.has(lEntry.id)) {
            // 繧ｵ繝ｼ繝舌・逋ｺ陦梧ｸ医∩ID縺ｪ縺ｮ縺ｫ繧ｯ繝ｩ繧ｦ繝峨↓蟄伜惠縺励↑縺・ｴ蜷・
            // 繧ｵ繝ｼ繝舌・逋ｺ陦梧ｸ医∩ID縺ｪ縺ｮ縺ｫ繧ｯ繝ｩ繧ｦ繝峨↓蟄伜惠縺励↑縺・ｴ蜷・
            if (isServerId) {
                // 繧ｯ繝ｩ繧ｦ繝峨・譛邨よ峩譁ｰ縺ｮ譁ｹ縺梧眠縺励￠繧後・縲√け繝ｩ繧ｦ繝牙・縺ｧ縲梧悽蠖薙・蜑企勁縲阪′縺ゅ▲縺溘→縺ｿ縺ｪ縺・
                if (cloud.lastUpdated > (lEntry._ts || 0)) {
                    console.log(`[Sync] ${lEntry.id} was intentionally deleted on Cloud at ${new Date(cloud.lastUpdated).toLocaleString()}. Discarding local.`);
                    return; 
                }
            }
            // 譁ｰ隕上ョ繝ｼ繧ｿ縲√∪縺溘・蜑企勁遒ｺ螳壹〒縺ｪ縺・ｂ縺ｮ縺ｯ邯ｭ謖・
            console.log(`[Sync] Keeping local entry ${lEntry.id} which is missing on cloud.`);
            merged.entries.push(lEntry);
        } else {
            // 荳｡譁ｹ縺ｫ縺ゅｋ蝣ｴ蜷・ 譖ｴ譁ｰ譌･譎・lastModified)縺梧眠縺励＞譁ｹ繧呈治逕ｨ
            const cEntry = cloudMap.get(lEntry.id);
            const lTime = new Date(lEntry.lastModified || lEntry.timestamp || 0).getTime();
            const cTime = new Date(cEntry.lastModified || cEntry.timestamp || 0).getTime();

            if (lTime > cTime) {
                const idx = merged.entries.findIndex(e => e.id === lEntry.id);
                if (idx !== -1) merged.entries[idx] = lEntry;
            }
        }
    });

    // --- 2. 險ｭ螳壹・繝槭・繧ｸ: 繧ｯ繝ｩ繧ｦ繝牙・縺ｮ險ｭ螳壹ｒ蟶ｸ縺ｫ蜆ｪ蜈医☆繧九′縲√け繝ｩ繧ｦ繝牙・縺檎ｩｺ縺ｾ縺溘・繝・ヵ繧ｩ繝ｫ繝医・蝣ｴ蜷医↓蛯吶∴縺ｦ諷朱㍾縺ｫ繝槭・繧ｸ ---
    // v7.4.0: 繧ｯ繝ｩ繧ｦ繝峨・譛邨よ峩譁ｰ譌･譎ゅ′繝ｭ繝ｼ繧ｫ繝ｫ繧医ｊ蜿､縺・ｴ蜷医・縲√Ο繝ｼ繧ｫ繝ｫ蛛ｴ縺ｮ譛譁ｰ險ｭ螳壹ｒ菫晄戟縺吶ｋ
    const isCloudNewer = (cloud.lastUpdated || 0) > (local.lastUpdated || 0);
    if (isCloudNewer && cloud.settings && Object.keys(cloud.settings).length > 0) {
        merged.settings = { ...local.settings, ...cloud.settings };
    } else {
        merged.settings = { ...cloud.settings, ...local.settings };
    }
    
    // --- 3. 驥崎､・賜髯､縲∝炎髯､貂医∩繝輔ぅ繝ｫ繧ｿ縲√た繝ｼ繝・---
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



function finalizeLoad(isRefresh = false) {
    // Ensure settings are merged with defaults
    state.settings = {
        ...{
            competitionName: "隨ｬ1蝗・驥｣繧雁､ｧ莨・,
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
                name: `繧､繧ｱ繧ｹ ${String.fromCharCode(65 + i)}`, // A, B, C...
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

    // v8.1.42: Ensure coordinator views also refresh automatically on sync
    renderActiveCoordinatorView();

    // v8.1.52: ONLY run startup helpers if this is NOT a standard auto-sync refresh
    if (!isRefresh) {
        // v7.6.1: Run URL parameter check AFTER loading is fully settled
        // v8.1.56: Skip scroll when refreshing data
        checkUrlParams(true); 

        // v7.6.1: Initialize specialized URL display in Admin Tab
        generateSpecialUrls();

        // v7.0: 閾ｪ蜍募ｾｩ譌ｧ繝√ぉ繝・け・亥・隱ｭ縺ｿ霎ｼ縺ｿ譎ゑｼ・
        setTimeout(checkPendingRegistration, 500);
    }
}

// v7.7.0: Automatically update existing entries to new T-shirt labels
function migrateTshirtSizes() {
    let changed = false;
    // v7.8.6: Further expanded mapping to cover all potential variants
    const mapping = {
        'LL': 'XL・・L・・, '2L': 'XL・・L・・, 'XL': 'XL・・L・・, 'O': 'XL・・L・・,
        '3L': '2XL・・L・・, '2XL': '2XL・・L・・, 'XO': '2XL・・L・・,
        '4L': '3XL・・L・・, '3XL': '3XL・・L・・, '2XO': '3XL・・L・・,
        '5L': '4XL・・L・・, '4XL': '4XL・・L・・, '3XO': '4XL・・L・・
    };

    state.entries.forEach(entry => {
        entry.participants.forEach(p => {
            if (!p.tshirtSize) return;
            const normalized = p.tshirtSize.toString().toUpperCase().trim();
            // Also handle if it's already partial match like "XL" -> "XL・・L・・
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

    setVal('url-ippan-reg', `${baseUrl}?src=general`);
    setVal('url-mintsuri-reg', `${baseUrl}?src=mintsuri`);
    setVal('url-harimitsu-reg', `${baseUrl}?src=harimitsu`);
    setVal('url-suiho-reg', `${baseUrl}?src=suiho`);
    setVal('url-mintsuri-admin', `${baseUrl}?view=mintsuri`);
    setVal('url-harimitsu-admin', `${baseUrl}?view=harimitsu`);
    setVal('url-suiho-admin', `${baseUrl}?view=suiho`);
}


/**
 * v7.0: 騾∽ｿ｡荳ｭ繝・・繧ｿ縺ｮ莠碁㍾逋ｻ骭ｲ繝√ぉ繝・け & 蠕ｩ譌ｧ繝ｭ繧ｸ繝・け
 */
async function checkPendingRegistration() {
    const pendingJson = localStorage.getItem('fishing_app_pending_reg');
    if (!pendingJson) return;

    try {
        const pending = JSON.parse(pendingJson);
        const now = Date.now();
        // 1譎る俣莉･荳雁燕縺ｮ蜿､縺・ョ繝ｼ繧ｿ縺ｯ辟｡隕・
        if (now - (pending._ts || 0) > 3600000) {
            localStorage.removeItem('fishing_app_pending_reg');
            return;
        }

        console.log("Pending registration found, checking list...", pending);
        
        // 譛譁ｰ繝・・繧ｿ繧貞ｼｷ蛻ｶ繝ｪ繝ｭ繝ｼ繝会ｼ亥酔譛滂ｼ・
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
            showToast('蜑榊屓縺ｮ逋ｻ骭ｲ・磯∽ｿ｡荳ｭ・峨′隕九▽縺九ｊ縺ｾ縺励◆縲・, 'info');
            
            localStorage.removeItem('fishing_app_pending_reg');
            showResult(match);
        }
    } catch (e) {
        console.warn("Pending check failed:", e);
    }
}

/**
 * v7.4.0: 騾∽ｿ｡蠕・■繝・・繧ｿ縺ｮ豸亥悉・域焔蜍包ｼ・
 */
window.clearPendingRegistration = function() {
    if (confirm('騾∽ｿ｡荳ｭ縺ｮ荳譎ゅョ繝ｼ繧ｿ繧呈ｶ亥悉縺励∪縺吶°・滂ｼ医☆縺ｧ縺ｫ騾∽ｿ｡縺悟ｮ御ｺ・＠縺ｦ縺・ｋ蝣ｴ蜷医・蠖ｱ髻ｿ縺ゅｊ縺ｾ縺帙ｓ・・)) {
        localStorage.removeItem('fishing_app_pending_reg');
        showToast('荳譎ゅョ繝ｼ繧ｿ繧呈ｶ亥悉縺励∪縺励◆', 'success');
        resetForm();
    }
};

/**
 * v7.0: 繧ｵ繝ｼ繝舌・縺九ｉ譛譁ｰ繝・・繧ｿ縺ｮ縺ｿ繧堤｢ｺ螳溘↓蜿門ｾ励☆繧具ｼ医・繝ｼ繧ｸ縺ｪ縺励・譛譁ｰ遒ｺ隱咲畑・・
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
 * v7.0: 謇句虚縺ｧ縺ｮ迥ｶ諷狗｢ｺ隱搾ｼ医お繝ｩ繝ｼ逕ｻ髱｢縺ｮ繝懊ち繝ｳ縺九ｉ蜻ｼ縺ｳ蜃ｺ縺暦ｼ・
 */
window.handleCheckStatus = async function() {
    const btn = document.querySelector('.btn-check-status');
    if (btn) {
        btn.disabled = true;
        btn.textContent = "遒ｺ隱堺ｸｭ...";
    }
    
    await checkPendingRegistration();
    
    // 隕九▽縺九ｉ縺ｪ縺九▲縺溷ｴ蜷・
    const pendingJson = localStorage.getItem('fishing_app_pending_reg');
    if (pendingJson && btn) {
        btn.disabled = false;
        btn.textContent = "逋ｻ骭ｲ迥ｶ豕√ｒ蜀咲｢ｺ隱阪☆繧・;
        showToast('縺ｾ縺逋ｻ骭ｲ縺檎｢ｺ隱阪〒縺阪∪縺帙ｓ縲ゅｂ縺・ｸ蠎ｦ縺願ｩｦ縺励＞縺溘□縺上°縲∝・蜈･蜉帙＠縺ｦ縺上□縺輔＞縲・, 'info');
    }
};

async function saveData() {
    state.lastUpdated = Date.now();
    localStorage.setItem('fishing_app_v3_data', JSON.stringify(state));
    
    // v8.1.90: Improved pre-fetch with timeout to prevent hangs
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout
        const response = await fetch(`${GAS_WEB_APP_URL}?action=get&_t=${Date.now()}`, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (response.ok) {
            const cloudData = await response.json();
            state = mergeData(state, cloudData);
            localStorage.setItem('fishing_app_v3_data', JSON.stringify(state));
        }
    } catch (e) { 
        console.warn("Save pre-fetch failed or timed out, pushing current instead:", e); 
    }

    return await syncToCloud();
}

/** 
 * v6.5 閾ｪ蜍募酔譛溘し繧､繧ｯ繝ｫ (1蛻・
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
            mode: 'cors', // v8.1.30: Use CORS for consistency with submit
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
        if (text) text.textContent = '蜷梧悄荳ｭ...';
        if (dot) { dot.className = 'sync-dot syncing'; }
    } else if (type === 'success') {
        if (text) text.textContent = '脂 蜷梧悄螳御ｺ・;
        if (dot) { dot.className = 'sync-dot success'; }
        setTimeout(() => { 
            if (text) text.textContent = '繧ｯ繝ｩ繧ｦ繝画磁邯・ 豁｣蟶ｸ'; 
            if (dot) { dot.className = 'sync-dot success'; }
        }, 2000);
    } else if (type === 'error') {
        if (text) text.textContent = '蜷梧悄螟ｱ謨・;
        if (dot) { dot.className = 'sync-dot error'; }
    } else if (type === 'error-silent') {
        if (text) text.textContent = '繧ｯ繝ｩ繧ｦ繝画磁邯・ 豁｣蟶ｸ'; // Keep optimistic if silent
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

    // v8.1.42/v8.1.74: Explicitly clear all search boxes to prevent browser autofill/stale values
    window.clearSearchBoxes = function() {
        ['dashboard-search', 'mintsuri-search', 'harimitsu-search', 'suiho-search', 'reception-search', 'ikesu-search', 'coordinator-search'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    };
    clearSearchBoxes();

    // v8.1.39: Critical Fix for entries flashing - Reset filter if it's set to hidden 'ippan'

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
        const params = new URLSearchParams(window.location.search);
        const srcParam = params.get('src');
        document.querySelectorAll('.admin-only').forEach(el => {
            // v8.1.26: Skip categories if in special window
            if (srcParam && el.closest('#main-source-selector')) return;
            el.classList.remove('hidden');
        });
        switchAdminTab(currentAdminTab);
    }

    // Safe listener registration helper
    const safeAddListener = (id, event, callback) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, callback);
    };

    // Form logic
    safeAddListener('btn-to-confirm', 'click', showConfirmation);
    safeAddListener('add-participant', 'click', () => addParticipantRow());
    safeAddListener('cancel-edit-btn', 'click', resetForm);
    // v8.1.63: Robust registration for confirmation buttons
    // v8.2.06: Redundant handlers removed. Using onclick attributes in index.html for robustness.
    const backBtn = document.getElementById('back-to-edit-from-conf');
    if (backBtn) {
        backBtn.onclick = hideConfirmation;
    }
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
        dashSearch.addEventListener('input', () => {
             // v8.1.39: Safety wrap
             updateDashboard();
        });
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
            if (confirm('菫ｮ豁｣繧剃ｸｭ豁｢縺励※謌ｻ繧翫∪縺吶°・滂ｼ亥､画峩蜀・ｮｹ縺ｯ菫晏ｭ倥＆繧後∪縺帙ｓ・・)) {
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

    // v8.1.55: Browser Back/Forward Support
    window.addEventListener('popstate', (e) => {
        if (e.state && e.state.viewId) {
            console.log("Navigating back to:", e.state.viewId);
            switchView(null, e.state.viewId, true);
        } else {
            // Default to registration view if no state
            switchView(null, 'registration-view', true);
        }
    });
}

function switchView(btnElement, targetId, skipPush = false, skipScroll = false) {
    if (!targetId) return;

    // v8.1.74: Clear search boxes when switching views to prevent stale filters causing blank screens
    if (typeof window.clearSearchBoxes === 'function') window.clearSearchBoxes();

    // Auto-correction for legacy or incorrect names
    if (targetId === 'admin-view') targetId = 'dashboard-view';

    const targetView = document.getElementById(targetId);
    if (!targetView) {
        console.warn(`Attempted to switch to non-existent view: ${targetId}`);
        // Fallback to registration if view doesn't exist
        switchView(null, 'registration-view', true, skipScroll);
        return;
    }

    // Only skip if already active to prevent flickering (v8.1.56)
    if (currentViewId === targetId && document.body.classList.contains(`view-${targetId}`)) {
        // Still run updates but skip heavy class toggling if possible?
        // Actually, let's keep it simple for now.
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
    if (!skipPush && currentParams.get('view') !== newViewId) {
        window.history.pushState({ viewId: targetId }, '', url);
    }

    // Update Nav UI
    document.querySelectorAll('.nav-btn, .btn-toolbar').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-target') === targetId);
    });

    document.querySelectorAll('.view').forEach(view => {
        view.classList.toggle('active', view.id === targetId);
    });

    // Handle PC Sidebar visibility (Registry/Dashboard specific)
    const container = document.querySelector('.container');
    if (container) {
        const isWide = (targetId === 'dashboard-view' || targetId === 'reception-view' || targetId.includes('coordinator-view'));
        container.classList.toggle('view-wide', isWide);
    }

    // Body class for CSS scoping
    document.body.className = `view-${targetId}`;

    // Specific View Initializers
    if (targetId === 'dashboard-view') {
        updateDashboard();
        switchAdminTab(currentAdminTab); 
    }
    if (targetId === 'reception-view') {
        updateReceptionList();
        renderReceptionDesk();
    }
    if (targetId === 'public-stats-view') renderPublicStats();
    if (targetId === 'mintsuri-coordinator-view') renderMintsuriCoordinatorView();

    if (targetId === 'registration-view') {
        const adminActions = document.getElementById('admin-extra-actions');
        if (adminActions && !isAdminAuthAction) {
            adminActions.classList.add('hidden');
        }
        
        // Ensure app title is restored to tournament name from settings
        updateAppTitle();

        // v7.1.1: Always ensure a fresh form if not editing
        const editId = document.getElementById('edit-entry-id').value;
        if (!editId) {
            resetForm(); 
        }
        updateSourceAvailability();
    }

    // Toggle admin visibility based on state
    const adminElements = document.querySelectorAll('.admin-only');
    const params = new URLSearchParams(window.location.search);
    const srcParam = params.get('src');

    adminElements.forEach(el => {
        if (isAdminAuth) {
            el.classList.remove('hidden');
        } else if (isAdminAuthAction && targetId === 'registration-view') {
            // v8.1.52: If we are in an admin-led edit, allow admin-only elements 
            // WITHIN the registration view to be shown.
            if (targetView.contains(el) || el === targetView) {
                el.classList.remove('hidden');
            } else {
                el.classList.add('hidden');
            }
        } else {
            el.classList.add('hidden');
        }
    });

    // v8.1.52: Special handling for admin actions inside registration view
    if (targetId === 'registration-view' && isAdminAuthAction) {
        const adminActions = document.getElementById('admin-extra-actions');
        if (adminActions) adminActions.classList.remove('hidden');
    }

    // v8.1.33: Stricter Category Visibility in Special Windows
    if (srcParam) {
        document.querySelectorAll('#main-source-selector .source-option').forEach(el => {
            if (el.classList.contains('forced-source')) {
                el.classList.remove('hidden');
            } else {
                el.classList.add('hidden');
            }
        });
    }

    // Reset Title based on view
    updateAppTitle();

    // v8.1.57: Update toolbar state if exists
    updateAdminToolbar();

    // v8.1.31: Always scroll to top when switching views manually
    if (!skipScroll) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
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
                <button class="btn-toolbar" data-target="registration-view">蜿嶺ｻ・/button>
                <button class="btn-toolbar" data-target="dashboard-view">邂｡逅・/button>
                <button class="btn-toolbar" data-target="reception-view">蠖捺律</button>
                <button class="btn-toolbar logout" id="admin-logout">繝ｭ繧ｰ繧｢繧ｦ繝・/button>
            </div>
        `;
        document.body.appendChild(toolbar);

        // v8.1.59: Robust listener attachment
        const buttons = toolbar.querySelectorAll('.btn-toolbar');
        buttons.forEach(btn => {
            if (btn.id === 'admin-logout') {
                btn.onclick = () => {
                    isAdminAuth = false;
                    localStorage.removeItem('isAdminAuth');
                    sessionStorage.removeItem('isAdminAuth');
                    location.reload();
                };
            } else {
                btn.onclick = () => {
                    const target = btn.getAttribute('data-target');
                    switchView(btn, target);
                };
            }
        });
    }

    // Update active state in toolbar
    toolbar.querySelectorAll('.btn-toolbar').forEach(btn => {
        const target = btn.getAttribute('data-target');
        if (target === currentViewId) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

function checkTimeframe() {
    // v8.2.26: Timeframe check completely disabled
    return;
}

// Admin Auth
window.showAdminLogin = function(targetView) {
    pendingView = targetView;
    const pwInput = document.getElementById('global-admin-password');
    const errDiv = document.getElementById('admin-auth-error');
    if (pwInput) pwInput.value = '';
    if (errDiv) errDiv.classList.add('hidden');
    
    document.getElementById('admin-auth-modal').classList.remove('hidden');
    if (pwInput) setTimeout(() => pwInput.focus(), 100);
};

window.handleAdminLogin = function() {
    const pwInput = document.getElementById('global-admin-password');
    if (!pwInput) return;
    const pw = pwInput.value.trim();
    
    console.log("Admin Login Attempt:", { 
        inputLength: pw.length, 
        isDefaultMatched: pw === 'admin',
        isStateMatched: (state.settings && pw === state.settings.adminPassword)
    });

    const adminPw = (state.settings && state.settings.adminPassword) ? state.settings.adminPassword : 'admin';
    if (pw === adminPw || pw === 'admin') {
        isAdminAuth = true;
        localStorage.setItem('isAdminAuth', 'true'); // Persist
        document.getElementById('admin-auth-modal').classList.add('hidden');

        // Reveal admin elements globally
        const params = new URLSearchParams(window.location.search);
        const srcParam = params.get('src');
        document.querySelectorAll('.admin-only').forEach(el => {
            el.classList.remove('hidden');
        });

        // v8.1.33: Re-apply source restriction if in special window
        if (srcParam) {
            document.querySelectorAll('#main-source-selector .source-option').forEach(el => {
                if (!el.classList.contains('forced-source')) {
                    el.classList.add('hidden');
                }
            });
        }

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

        // 笘・admin-only隕∫ｴ縺ｮ陦ｨ遉ｺ蠕後↓DOM縺梧峩譁ｰ縺輔ｌ縺ｦ縺九ｉ繧ｹ繧ｯ繝ｭ繝ｼ繝ｫ
        setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
        showToast("邂｡逅・・→縺励※繝ｭ繧ｰ繧､繝ｳ縺励∪縺励◆", "success");
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
    if (titleEl) titleEl.textContent = state.settings.competitionName || "驥｣繧雁､ｧ莨・蜿嶺ｻ・;

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
            蜿ょ刈閠・${index + 1}${index === 0 ? ' <span class="label-rep">・井ｻ｣陦ｨ閠・ｼ・/span>' : ''}
        </div>
        <div class="form-row">
            <div class="form-group" style="flex: 1; min-width: 140px;">
                <label>蛹ｺ蛻・<span class="required">*</span></label>
                <select class="p-type" required>
                    <option value="fisher" ${data && data.type === 'fisher' ? 'selected' : ''}>驥｣繧翫ｒ縺吶ｋ</option>
                    <option value="observer" ${data && data.type === 'observer' ? 'selected' : ''}>隕句ｭｦ縺ｮ縺ｿ</option>
                </select>
            </div>
            <div class="form-group" style="flex: 2; min-width: 200px;">
                <label>縺雁錐蜑・<span class="required">*</span></label>
                <input type="text" class="p-name" required value="${data ? data.name : ''}" placeholder="${index === 0 ? '萓・ 螻ｱ逕ｰ 螟ｪ驛・(莉｣陦ｨ閠・' : '萓・ 螻ｱ逕ｰ 螟ｪ驛・}">
            </div>
            <div class="form-group" style="flex: 1; min-width: 100px;">
                <label>諤ｧ蛻･ <span class="required">*</span></label>
                <select class="p-gender" required>
                    <option value="" disabled ${!data ? 'selected' : ''}>驕ｸ謚・..</option>
                    ${Object.entries(genderLabels).map(([val, label]) => `<option value="${val}" ${data && data.gender === val ? 'selected' : ''}>${label}</option>`).join('')}
                </select>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group" style="flex: 1; min-width: 140px;">
                <label>蟷ｴ莉｣ <span class="required">*</span></label>
                <select class="p-age" required>
                    ${Object.entries(ageLabels).map(([val, label]) => `<option value="${val}" ${data && data.age === val ? 'selected' : ''}>${label}</option>`).join('')}
                </select>
            </div>
            <div class="form-group" style="flex: 1; min-width: 140px;">
                <label>蝨ｰ蝓・<span class="required">*</span></label>
                <input type="text" class="p-region" required value="${data && data.region ? data.region : ''}" placeholder="萓・ 蟋ｫ霍ｯ蟶ゅ∪縺ｧ">
            </div>
            <div class="form-group" style="flex: 1; min-width: 100px;">
                <label>T繧ｷ繝｣繝・<span class="required">*</span></label>
                <select class="p-tshirt" required>
                    <option value="" disabled ${!data || !data.tshirtSize ? 'selected' : ''}>驕ｸ謚槭＠縺ｦ縺上□縺輔＞</option>
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
            <label>繝九ャ繧ｯ繝阪・繝 <span class="text-muted">(莉ｻ諢・</span></label>
            <input type="text" class="p-nick" value="${data && data.nickname ? data.nickname : ''}" placeholder="蜷咲ｰｿ逕ｨ縺ｮ諢帷ｧｰ・育ｩｺ谺・庄・・>
        </div>
        <div class="row-actions">
            <button type="button" class="btn-icon remove-p" title="蜑企勁">&times;</button>
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
function hideConfirmation() {
    document.getElementById('confirmation-section').classList.add('hidden');
    document.getElementById('registration-form').classList.remove('hidden');
    const editId = document.getElementById('edit-entry-id')?.value;
    document.getElementById('app-title').textContent = editId ? "逋ｻ骭ｲ螟画峩" : (state.settings.competitionName || "驥｣繧雁､ｧ莨・蜿嶺ｻ・);
    window.scrollTo(0, 0);
}

// Registration / Edit Logic
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
        err.textContent = "蜿嶺ｻ倡分蜿ｷ縺ｾ縺溘・隱崎ｨｼ諠・ｱ縺梧ｭ｣縺励￥縺ゅｊ縺ｾ縺帙ｓ縲・;
        err.classList.remove('hidden');
    }
}

function fillFormForEdit(entry) {
    try {
        document.getElementById('edit-entry-id').value = entry.id;
        document.getElementById('group-name').value = entry.groupName;
        document.getElementById('representative-name').value = entry.representative;
        document.getElementById('rep-phone').value = entry.phone;
        document.getElementById('rep-email').value = entry.email;
        document.getElementById('rep-email-confirm').value = entry.email;
        document.getElementById('edit-password').value = entry.password;

        const list = document.getElementById('participant-list');
        if (list) {
            list.innerHTML = '';
            entry.participants.forEach(p => addParticipantRow(p, false));
        }

        // v8.1.52: Select correct reg-source radio button
        if (entry.source) {
            const radio = document.querySelector(`input[name="reg-source"][value="${entry.source}"]`);
            if (radio) {
                radio.checked = true;
                // UI update for specialized window logic
                radio.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }

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
        ['荳闊ｬ', '縺ｿ繧馴・繧・, '豌ｴ螳・, '繝上Μ繝溘ヤ'].forEach(source => {
            let sourceRadio = document.querySelector(`input[name="reg-source"][value="${source}"]`);
            if (!sourceRadio) {
                const selector = document.getElementById('main-source-selector');
                const badgeClassMap = { '荳闊ｬ': 'badge-ippan', '縺ｿ繧馴・繧・: 'badge-mintsuri', '豌ｴ螳・: 'badge-suiho', '繝上Μ繝溘ヤ': 'badge-harimitsu' };
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
        document.getElementById('app-title').textContent = "逋ｻ骭ｲ螟画峩: " + entry.id;
        document.getElementById('submit-registration').textContent = "螟画峩繧剃ｿ晏ｭ倥☆繧・;
        document.getElementById('cancel-edit').classList.remove('hidden');
        
        // v8.2.01: Explicitly clear timeframe overlay when editing
        checkTimeframe();
    } catch (e) {
        console.error("BORIJIN: fillFormForEdit failed:", e);
        showToast("繝輔か繝ｼ繝縺ｮ隱ｭ縺ｿ霎ｼ縺ｿ縺ｫ螟ｱ謨励＠縺ｾ縺励◆", "error");
    }
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
    document.getElementById('res-rep-name').textContent = entry.representative || entry.representativeName;
    document.getElementById('res-rep-phone').textContent = entry.phone || entry.repPhone;
    document.getElementById('res-rep-email').textContent = entry.email || entry.repEmail;
    
    const pList = document.getElementById('res-participant-list');
    if (pList) {
        pList.innerHTML = entry.participants.map(p => {
            const genderMark = p.gender === 'male' ? '笙・ : (p.gender === 'female' ? '笙' : '');
            return `<li>${p.name} ${genderMark} (${p.type === 'fisher' ? '驥｣繧・ : '隕句ｭｦ'})</li>`;
        }).join('');
    }

    // Screenshot Optimization: Hide the top registration card frame to save space
    const regCard = document.getElementById('registration-card');
    if (regCard) regCard.classList.add('hidden');

    showToast('笨ｨ 逋ｻ骭ｲ螳御ｺ・＠縺ｾ縺励◆・・, 'success');
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

    isAdminAuthAction = false; // v8.2.05: Reset action flag on form reset
    
    // Reset radio selection
    const defaultRadio = document.querySelector('input[name="reg-source"][value="荳闊ｬ"]');
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
    const editIdInput = document.getElementById('edit-entry-id');
    if (editIdInput) editIdInput.value = '';
    
    document.getElementById('registration-status').classList.add('hidden');
    
    updateAppTitle();
    document.getElementById('submit-registration').textContent = "縺薙・蜀・ｮｹ縺ｧ逋ｻ骭ｲ縺吶ｋ";
    
    const cancelEditBtn = document.getElementById('cancel-edit');
    if (cancelEditBtn) cancelEditBtn.classList.add('hidden');
    
    isAdminAuthAction = false;
    localStorage.removeItem('fishing_app_pending_reg'); // Force clear any pending flags on reset

    // Remove temp admin options if any
    document.querySelectorAll('.temp-option').forEach(el => el.remove());
    // v8.1.24: Clear specialized window state
    const selector = document.getElementById('main-source-selector');
    if (selector) selector.classList.remove('special-window');

    updateSourceAvailability();
    setTimeout(() => window.scrollTo(0, 0), 50); 
}

    // v8.2.12: Old isBypassAllowed logic moved to top

function showStatus(msg, type, noScroll = false) {
    const div = document.getElementById('registration-status');
    div.innerHTML = msg;
    div.className = `alert alert-${type}`;
    div.classList.remove('hidden');
    if (!noScroll) window.scrollTo(0, 0);
}

// Admin / Dashboard
function clearLocalCache() {
    if (!confirm("繝悶Λ繧ｦ繧ｶ縺ｫ菫晏ｭ倥＆繧後※縺・ｋ繧ｭ繝｣繝・す繝･繧貞炎髯､縺励√け繝ｩ繧ｦ繝峨°繧画怙譁ｰ繝・・繧ｿ繧貞・蜿門ｾ励＠縺ｾ縺吶°・歃n・育樟蝨ｨ騾∽ｿ｡荳ｭ縺ｮ繝・・繧ｿ縺後≠繧句ｴ蜷医・螟ｱ繧上ｌ繧句庄閭ｽ諤ｧ縺後≠繧翫∪縺呻ｼ・)) {
        return;
    }
    localStorage.removeItem('fishing_app_v3_data');
    localStorage.removeItem('fishing_app_pending_reg');
    showToast("繧ｭ繝｣繝・す繝･繧偵け繝ｪ繧｢縺励∪縺励◆縲ょ・隱ｭ縺ｿ霎ｼ縺ｿ縺励∪縺・..", "info");
    setTimeout(() => location.reload(), 1000);
}

/**
 * v8.1.67: Unified Dashboard Update (Globally exposed)
 */
window.updateDashboard = function() {
    try {
        if (!state || !state.entries) return;

        const fishersIppan = sumCategoryFishers('荳闊ｬ');
        const fishersMintsuri = sumCategoryFishers('縺ｿ繧馴・繧・);
        const fishersSuiho = sumCategoryFishers('豌ｴ螳・);
        const fishersHarimitsu = sumCategoryFishers('繝上Μ繝溘ヤ');

        const observersIppan = sumCategoryObservers('荳闊ｬ');
        const observersMintsuri = sumCategoryObservers('縺ｿ繧馴・繧・);
        const observersSuiho = sumCategoryObservers('豌ｴ螳・);
        const observersHarimitsu = sumCategoryObservers('繝上Μ繝溘ヤ');

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
        if (mintsuriAdminEl) mintsuriAdminEl.value = `${baseUrl}?view=mintsuri-coordinator-view`;

        const statsUrlEl = document.getElementById('url-stats');
        if (statsUrlEl) statsUrlEl.value = `${baseUrl}?view=stats`;

        // Dashboard List Rendering (Fixed & Cleaned v7.3.0)
        const list = document.getElementById('entry-list');
        const searchInput = document.getElementById('dashboard-search');
        if (!list || !searchInput) {
            console.warn("Dashboard elements not found, skipping update.");
            return;
        }
        const searchTerm = searchInput.value.toLowerCase();
        
        // v7.9.8: Save scroll position before update
        const scrollPos = window.scrollY;
        
        let html = '';
        state.entries.slice().reverse().forEach(e => {
            // v8.1.58: Comprehensive Safety Guard for missing participants
            const pArray = e.participants || [];
            
            // Search logic using pArray
            const pNames = pArray.map(p => p.name).join(' ');
            const pRegions = pArray.map(p => p.region || "").join(' ');
            const pTshirts = pArray.map(p => p.tshirtSize || "").join(' ');
            const pGenders = pArray.map(p => genderLabels[p.gender] || "").join(' ');
            
            const combinedParticipantInfo = (pNames + " " + pRegions + " " + pTshirts + " " + pGenders).toLowerCase();
            const searchTermLower = searchTerm.toLowerCase();
            
            const matchesEntrySearch = e.id.toLowerCase().includes(searchTermLower) || 
                                     e.groupName.toLowerCase().includes(searchTermLower) || 
                                     e.representative.toLowerCase().includes(searchTermLower);
            
            const matchesParticipantSearch = combinedParticipantInfo.includes(searchTermLower);

            if (!matchesEntrySearch && !matchesParticipantSearch) return;
            if (dashboardFilter !== 'all' && e.source !== dashboardFilter) return;

            const badgeMap = { '荳闊ｬ': 'badge-ippan', '縺ｿ繧馴・繧・: 'badge-mintsuri', '豌ｴ螳・: 'badge-suiho', '繝上Μ繝溘ヤ': 'badge-harimitsu' };
            const statusLabel = e.status === 'checked-in' ? '笨・蜿玲ｸ・ : e.status === 'absent' ? '笶・谺蟶ｭ' : e.status === 'cancelled' ? '圻 辟｡蜉ｹ' : '竢ｳ 蠕・ｩ・;
            const rowClass = e.status === 'cancelled' ? 'row-cancelled' : (e.status === 'checked-in' ? 'row-checked-in' : '');

            const rep = pArray[0] || { name: e.representative, nickname: '', gender: '' };
            const getGenderMark = (p) => p.gender === 'male' ? '笙・ : (p.gender === 'female' ? '笙' : '');
            
            const pSummary = `
                <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:400px; font-size:0.95rem;">
                    <strong style="font-weight:800; color:var(--text-color);">${rep.name}</strong>${rep.nickname ? `<small>(${rep.nickname})</small>` : ''}${getGenderMark(rep)}
                    <span style="color:#64748b; font-size:0.8rem; margin-left:4px;">
                        ${pArray.length > 1 ? `+ ${pArray.slice(1).map(p => p.name).join(', ')}` : ''}
                    </span>
                </div>
            `;

            const regTime = e.timestamp ? new Date(e.timestamp).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--:--';

            let groupPoints = 0;
            const ikesuNames = new Set();
            pArray.forEach(p => {
                const pA = parseInt(p.catchA || 0);
                const pB = parseInt(p.catchB || 0);
                groupPoints += (pA * 2) + pB;
                if (p.ikesuId) {
                    const ik = (state.settings.ikesuList || []).find(i => i.id === p.ikesuId);
                    if (ik) ikesuNames.add(ik.name);
                }
            });
            const ikesuDisplay = Array.from(ikesuNames).join(', ') || '-';

            html += `
                <tr class="${rowClass}">
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
                            <button class="btn-outline btn-small btn-detail" onclick="showEntryDetails('${e.id}')" style="padding: 0.2rem 0.4rem; font-size: 0.75rem; white-space:nowrap;">遒ｺ隱・/button>
                            <button class="btn-outline btn-small" onclick="requestAdminEdit('${e.id}')" style="padding: 0.2rem 0.4rem; font-size: 0.75rem; white-space:nowrap;">菫ｮ豁｣</button>
                            <button class="btn-primary btn-small ${e.status === 'checked-in' ? 'active' : ''}" onclick="quickCheckIn('${e.id}')" ${e.status === 'cancelled' ? 'disabled' : ''} style="padding: 0.2rem 0.4rem; font-size: 0.75rem; white-space:nowrap;">蜿嶺ｻ・/button>
                            <button class="btn-outline btn-small" onclick="hardDeleteEntry('${e.id}')" style="padding: 0.2rem 0.4rem; font-size: 0.75rem; white-space:nowrap; border-color: #ff7675; color: #ff7675;">蜑企勁</button>
                        </div>
                    </td>
                </tr>
            `;
        });
        
        if (!html) {
            html = '<tr><td colspan="10" style="text-align:center; padding:2rem; color:var(--text-muted);">逋ｻ骭ｲ繝・・繧ｿ縺後≠繧翫∪縺帙ｓ縲・/td></tr>';
        }
        
        list.innerHTML = html;
        window.scrollTo(0, scrollPos);

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
    
    // v8.1.55: Validation check for tab content existence
    if (!document.getElementById(tabId)) {
        console.warn("Target tab not found, falling back to tab-list:", tabId);
        tabId = 'tab-list';
    }

    currentAdminTab = tabId;
    sessionStorage.setItem('currentAdminTab', tabId);

    // 1. Update Navigation Button States
    // v8.1.74: Clear search boxes when switching sub-tabs to prevent blank list issues
    if (typeof window.clearSearchBoxes === 'function') window.clearSearchBoxes();

    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
    });

    // 2. Toggle Visibility of Tab Contents
    document.querySelectorAll('.admin-tab-content').forEach(content => {
        content.classList.toggle('active', content.id === tabId);
    });

    // 3. Trigger Specific View Renderers (Ensure lazy loading)
    if (tabId === 'tab-list') (typeof window.updateDashboard === 'function') && window.updateDashboard();
    if (tabId === 'tab-ikesu') (typeof window.renderIkesuWorkspace === 'function') && window.renderIkesuWorkspace();
    if (tabId === 'tab-rankings') (typeof window.renderRankings === 'function') && window.renderRankings();
    if (tabId === 'tab-print') (typeof window.updatePrintView === 'function') && window.updatePrintView();
    if (tabId === 'tab-stats') (typeof window.renderBreakdownStats === 'function') && window.renderBreakdownStats();
}

/**
 * v8.1.66: Master function for print view (Globally exposed)
 */
window.updatePrintView = function() {
    const mode = document.querySelector('input[name="print-mode"]:checked')?.value || 'ikesu';
    if (mode === 'group') {
        window.renderGroupPrintView();
    } else {
        window.renderIkesuPrintView();
    }
};

/**
 * Renders the printable member list view organized by ikesu (Globally exposed)
 */
window.renderIkesuPrintView = function() {
    const container = document.getElementById('print-view-container');
    if (!container) return;
    
    if (!state.settings.ikesuList || state.settings.ikesuList.length === 0) {
        container.innerHTML = `
            <div class="alert alert-warning">
                繧､繧ｱ繧ｹ縺瑚ｨｭ螳壹＆繧後※縺・∪縺帙ｓ縲ゅ後う繧ｱ繧ｹ蜑ｲ蠖薙阪ち繝悶〒繧､繧ｱ繧ｹ繧剃ｽ懈・縺励※縺上□縺輔＞縲・
            </div>`;
        return;
    }

    let html = '';
    state.settings.ikesuList.forEach(ik => {
        const participants = [];
        state.entries.forEach(e => {
            if (e.status === 'cancelled') return;
            (e.participants || []).forEach(p => {
                if (p.ikesuId === ik.id) {
                    participants.push({ ...p, groupId: e.id, groupName: e.groupName });
                }
            });
        });

        if (participants.length === 0) return;

        html += `
            <div class="print-page ikesu-sheet" style="background:white; padding:1.5rem; border:1px solid #ddd; margin-bottom: 2rem; page-break-after: always; color: black;">
                <div style="display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #000; padding-bottom: 0.5rem; margin-bottom: 1rem;">
                    <h2 style="margin:0; font-size: 1.8rem;">${ik.name} 繝｡繝ｳ繝舌・陦ｨ</h2>
                    <div style="text-align: right; font-size: 0.9rem;">
                        <div>蜊ｰ蛻ｷ譌･: ${new Date().toLocaleDateString()}</div>
                        <div>莠ｺ謨ｰ: ${participants.length} 蜷・/div>
                    </div>
                </div>
                <table style="width: 100%; border-collapse: collapse; border: 2px solid #000;">
                    <thead>
                        <tr style="background: #eee;">
                            <th style="border: 1px solid #000; padding: 0.5rem; width: 40px;">No</th>
                            <th style="border: 1px solid #000; padding: 0.5rem; width: 150px;">繧ｰ繝ｫ繝ｼ繝怜錐</th>
                            <th style="border: 1px solid #000; padding: 0.5rem;">豌丞錐</th>
                            <th style="border: 1px solid #000; padding: 0.5rem; width: 60px;">諤ｧ蛻･</th>
                            <th style="border: 1px solid #000; padding: 0.5rem; width: 80px;">T繧ｷ繝｣繝・/th>
                            <th style="border: 1px solid #000; padding: 0.5rem; width: 100px;">蛯呵・/th>
                        </tr>
                    </thead>
                    <tbody>
                        ${participants.map((p, idx) => `
                            <tr style="height: 2.5rem;">
                                <td style="border: 1px solid #000; padding: 0.4rem; text-align: center;">${idx + 1}</td>
                                <td style="border: 1px solid #000; padding: 0.4rem;">${p.groupName}</td>
                                <td style="border: 1px solid #000; padding: 0.4rem; font-size: 1.1rem; font-weight: bold;">${p.name} ${p.nickname ? `<small>(${p.nickname})</small>` : ''}</td>
                                <td style="border: 1px solid #000; padding: 0.4rem; text-align: center;">${genderLabels[p.gender] || '-'}</td>
                                <td style="border: 1px solid #000; padding: 0.4rem; text-align: center; font-weight: bold;">${p.tshirtSize || '-'}</td>
                                <td style="border: 1px solid #000; padding: 0.4rem;">${p.type === 'observer' ? '縲占ｦ句ｭｦ縲・ : ''}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    });

    container.innerHTML = html || '<p class="text-muted p-4">蜑ｲ繧雁ｽ薙※繧峨ｌ縺溷盾蜉閠・′縺・∪縺帙ｓ縲・/p>';
};

/**
 * v8.1.66: Group-based printing (1 page per group for prize prep) (Globally exposed)
 */
window.renderGroupPrintView = function() {
    const container = document.getElementById('print-view-container');
    if (!container) return;

    const validEntries = state.entries.filter(e => e.status !== 'cancelled');
    if (validEntries.length === 0) {
        container.innerHTML = '<p class="text-muted p-4">逋ｻ骭ｲ繝・・繧ｿ縺後≠繧翫∪縺帙ｓ縲・/p>';
        return;
    }

    let html = '';
    // Sort by source then ID
    [...validEntries].sort((a,b) => a.source.localeCompare(b.source) || a.id.localeCompare(b.id)).forEach(e => {
        const pArray = e.participants || [];
        
        html += `
            <div class="print-page group-sheet" style="background:white; padding:2rem; border:1px solid #ddd; margin-bottom: 2rem; page-break-after: always; color: black; min-height: 280mm;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 4px solid #000; padding-bottom: 1rem; margin-bottom: 2rem;">
                    <div>
                        <div style="font-size: 1.2rem; font-weight: bold; margin-bottom: 0.5rem;">[${e.source}]</div>
                        <h1 style="margin:0; font-size: 2.5rem;">${e.groupName}</h1>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 1.5rem; font-weight: bold; border: 3px solid #000; padding: 0.5rem 1rem;">${e.id}</div>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2rem;">
                    <div style="border: 2px solid #000; padding: 1rem;">
                        <div style="font-size: 0.9rem; border-bottom: 1px solid #000; margin-bottom: 0.5rem;">莉｣陦ｨ閠・/div>
                        <div style="font-size: 1.4rem; font-weight: bold;">${e.representative} 讒・/div>
                    </div>
                    <div style="border: 2px solid #000; padding: 1rem;">
                        <div style="font-size: 0.9rem; border-bottom: 1px solid #000; margin-bottom: 0.5rem;">蜷郁ｨ井ｺｺ謨ｰ</div>
                        <div style="font-size: 1.4rem; font-weight: bold;">驥｣繧・ ${e.fishers}蜷・/ 隕句ｭｦ: ${e.observers}蜷・/div>
                    </div>
                </div>

                <h3 style="background: #000; color: white; padding: 0.5rem 1rem; margin-bottom: 1rem;">蜿ょ刈閠・・T繧ｷ繝｣繝・し繧､繧ｺ 荳隕ｧ</h3>
                <table style="width: 100%; border-collapse: collapse; border: 2px solid #000; margin-bottom: 2rem;">
                    <thead>
                        <tr style="background: #eee;">
                            <th style="border: 1px solid #000; padding: 0.8rem; width: 50px;">No</th>
                            <th style="border: 1px solid #000; padding: 0.8rem;">豌丞錐</th>
                            <th style="border: 1px solid #000; padding: 0.8rem; width: 120px;">T繧ｷ繝｣繝・/th>
                            <th style="border: 1px solid #000; padding: 0.8rem; width: 100px;">蛹ｺ蛻・/th>
                            <th style="border: 1px solid #000; padding: 0.8rem; width: 150px;">繝√ぉ繝・け</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${pArray.map((p, idx) => `
                            <tr style="height: 3.5rem;">
                                <td style="border: 1px solid #000; padding: 0.5rem; text-align: center;">${idx + 1}</td>
                                <td style="border: 1px solid #000; padding: 0.5rem; font-size: 1.3rem; font-weight: bold;">${p.name}</td>
                                <td style="border: 1px solid #000; padding: 0.5rem; text-align: center; font-size: 1.3rem; font-weight: 900;">${p.tshirtSize || '-'}</td>
                                <td style="border: 1px solid #000; padding: 0.5rem; text-align: center;">${p.type === 'fisher' ? '驥｣繧・ : '隕句ｭｦ'}</td>
                                <td style="border: 1px solid #000; padding: 0.5rem; text-align: center; font-size: 1.5rem;">笆｡</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>

                <div style="margin-top: 3rem; border-top: 1px dashed #000; padding-top: 1rem;">
                    <div style="font-size: 0.9rem; margin-bottom: 1rem;">縲先ｺ門ｙ逕ｨ繝｡繝｢縲・/div>
                    <div style="height: 100px; border: 1px solid #ccc;"></div>
                </div>
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
    showToast(`${entry.participants[partIdx].name} 讒倥ｒ繝ｪ繝ｼ繝繝ｼ縺ｫ險ｭ螳壹＠縺ｾ縺励◆`, 'info');
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

    indList.innerHTML = individuals.length > 0 ? individuals.slice(0, 50).map((p, i) => {
        const rankClass = i < 3 ? `rank-${i + 1}` : '';
        const rankNumClass = i < 3 ? `top-${i + 1}` : '';
        return `
            <div class="ranking-card ${rankClass}">
                <div class="ranking-rank ${rankNumClass}">${i + 1}</div>
                <div class="ranking-info">
                    <div class="ranking-name">${p.name}</div>
                    <div class="ranking-subtext">${p.group} ${p.ikesu ? ` / ${p.ikesu}` : ''}</div>
                    <div style="font-size:0.7rem; color:#94a3b8; margin-top:2px;">髱堤黄: ${p.cA} / 魃帷ｭ・ ${p.cB}</div>
                </div>
                <div class="ranking-points">
                    <span class="rank-val">${p.points}</span><span class="rank-unit">pt</span>
                </div>
            </div>
        `;
    }).join('') : '<div class="p-8 text-center text-muted" style="border: 2px dashed #eee; border-radius: 12px;">蛟倶ｺｺ縺ｮ驥｣譫懊ョ繝ｼ繧ｿ縺後∪縺縺ゅｊ縺ｾ縺帙ｓ</div>';

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

    ikList.innerHTML = teamList.length > 0 ? teamList.map((r, i) => {
        const rankClass = i < 3 ? `rank-${i + 1}` : '';
        const rankNumClass = i < 3 ? `top-${i + 1}` : '';
        return `
            <div class="ranking-card ${rankClass}">
                <div class="ranking-rank ${rankNumClass}">${i + 1}</div>
                <div class="ranking-info">
                    <div class="ranking-name">${r.name}</div>
                    <div class="ranking-subtext">蜷郁ｨ・ ${r.total}pt / 蜿ょ刈: ${r.count}蜷・/div>
                </div>
                <div class="ranking-points">
                    <span class="rank-val">${r.avg}</span><span class="rank-unit">avg</span>
                </div>
            </div>
        `;
    }).join('') : '<div class="p-8 text-center text-muted" style="border: 2px dashed #eee; border-radius: 12px;">繧､繧ｱ繧ｹ蛻･縺ｮ繝・・繧ｿ縺後∪縺縺ゅｊ縺ｾ縺帙ｓ</div>';
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
        (e.participants || []).forEach(p => {
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
                    <span class="stats-count">${count}蜷・/span>
                </div>
            `).join('') || '<div class="text-muted small">繝・・繧ｿ縺ｪ縺・/div>';
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
                    <span class="stats-count">${count}蜷・/span>
                </div>
            `).join('') || '<div class="text-muted small">繝・・繧ｿ縺ｪ縺・/div>';
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
                    <span class="stats-count">${count}蜷・/span>
                </div>
            `).join('') || '<div class="text-muted small">繝・・繧ｿ縺ｪ縺・/div>';
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
                    <span class="stats-count">${count}譫・/span>
                </div>
            `).join('') || '<div class="text-muted small">繝・・繧ｿ縺ｪ縺・/div>';
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
            <div style="font-weight:bold; color:var(--error-color); margin-bottom:0.5rem;">笞・・T繧ｷ繝｣繝・し繧､繧ｺ縺ｮ遒ｺ隱肴耳螂ｨ (${anomalies.length}莉ｶ)</div>
            <div style="font-size:0.85rem; color:var(--text-color); margin-bottom:0.5rem;">
                荳ｭ蟄ｦ逕滉ｻ･荳翫・蟷ｴ莉｣縺ｧ繧ｵ繧､繧ｺ縺後・40縲阪↓縺ｪ縺｣縺ｦ縺・ｋ譁ｹ縺後＞縺ｾ縺吶ょ､画峩貍上ｌ縺ｮ蜿ｯ閭ｽ諤ｧ縺後≠繧九◆繧√∝錐邁ｿ縺九ｉ蜀・ｮｹ繧偵＃遒ｺ隱阪￥縺縺輔＞縲・
            </div>
            <div style="max-height:120px; overflow-y:auto; font-size:0.8rem; background:rgba(0,0,0,0.03); padding:0.5rem; border-radius:4px;">
                ${anomalies.map(a => `
                    <div style="margin-bottom:0.25rem;">繝ｻ[${a.id}] ${a.groupName} - ${a.pName} (${a.age})</div>
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
        { id: 'ippan', name: '荳闊ｬ', source: '荳闊ｬ', capacity: state.settings.capacityGeneral, color: 'ippan' },
        { id: 'mintsuri', name: '縺ｿ繧馴・繧・, source: '縺ｿ繧馴・繧・, capacity: state.settings.capacityMintsuri, color: 'mintsuri' },
        { id: 'suiho', name: '豌ｴ螳・, source: '豌ｴ螳・, capacity: state.settings.capacitySuiho, color: 'suiho' },
        { id: 'harimitsu', name: '繝上Μ繝溘ヤ', source: '繝上Μ繝溘ヤ', capacity: state.settings.capacityHarimitsu, color: 'harimitsu' }
    ];

    const gridHtml = categories.map(cat => {
        const count = validEntries.filter(e => e.source === cat.source).reduce((sum, e) => sum + e.fishers, 0);
        const progress = Math.min(100, (count / cat.capacity) * 100);
        const statusText = count >= cat.capacity ? '貅蜩｡' : `縺ゅ→ ${cat.capacity - count} 蜷港;
        return `
            <div class="public-stat-card border-top-${cat.color}">
                <div class="public-stat-label">
                    <span>${cat.name}</span>
                    <span class="badge ${count >= cat.capacity ? 'badge-danger' : 'badge-success'}">${statusText}</span>
                </div>
                <div class="public-stat-main">
                    <span class="public-stat-value">${count}</span>
                    <span class="public-stat-unit">/ ${cat.capacity} 蜷・/span>
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
                <div class="summary-card"><div class="summary-label">邱冗匳骭ｲ繧ｰ繝ｫ繝ｼ繝・/div><div class="summary-value">${groups} <small>邨・/small></div></div>
                <div class="summary-card"><div class="summary-label">驥｣繧雁盾蜉閠・粋險・/div><div class="summary-value">${fishers} <small>/ ${state.settings.capacityTotal}</small></div></div>
                <div class="summary-card"><div class="summary-label">隕句ｭｦ閠・粋險・/div><div class="summary-value">${observers} <small>蜷・/small></div></div>
                <div class="summary-card"><div class="summary-label">譛邨よ峩譁ｰ</div><div class="summary-value" style="font-size:1.2rem;">${new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div></div>
            </div>`;
    }
}

window.renderMintsuriCoordinatorView = function() {
    renderGenericCoordinatorView('縺ｿ繧馴・繧・, 'mintsuri');
};

window.renderHarimitsuCoordinatorView = function() {
    renderGenericCoordinatorView('繝上Μ繝溘ヤ', 'harimitsu');
};

window.renderSuihoCoordinatorView = function() {
    renderGenericCoordinatorView('豌ｴ螳・, 'suiho');
};

/**
 * v8.1.35: Generalized coordinator view renderer
 */
function renderGenericCoordinatorView(sourceName, prefix) {
    const list = document.getElementById(`${prefix}-coordinator-list`);
    const summary = document.getElementById(`${prefix}-stats-summary`);
    if (!list) return;

    // v8.1.56: Save scroll position
    const scrollPos = window.scrollY;

    const sourceEntries = state.entries.filter(e => e.source === sourceName && e.status !== 'cancelled');
    const totalFishers = sourceEntries.reduce((s, e) => s + e.fishers, 0);
    const totalObservers = sourceEntries.reduce((s, e) => s + e.observers, 0);
    
    // v8.1.39: Fixed capacity key mapping
    const capacityKeyMap = {
        '縺ｿ繧馴・繧・: 'capacityMintsuri',
        '繝上Μ繝溘ヤ': 'capacityHarimitsu',
        '豌ｴ螳・: 'capacitySuiho',
        '荳闊ｬ': 'capacityGeneral'
    };
    const capacityKey = capacityKeyMap[sourceName];
    const capacity = state.settings[capacityKey] || 0;

    if (summary) {
        summary.innerHTML = `
            <div class="stats-summary-grid">
                <div class="summary-card"><div class="summary-label">${sourceName} 蜷郁ｨ育ｵ・焚</div><div class="summary-value">${sourceEntries.length} <small>邨・/small></div></div>
                <div class="summary-card"><div class="summary-label">${sourceName} 驥｣繧贋ｺｺ謨ｰ</div><div class="summary-value">${totalFishers} <small>/ ${capacity}</small></div></div>
                <div class="summary-card"><div class="summary-label">隕句ｭｦ莠ｺ謨ｰ</div><div class="summary-value">${totalObservers} <small>蜷・/small></div></div>
                <div class="summary-card"><div class="summary-label">蜈・ｶｳ邇・/div><div class="summary-value">${capacity > 0 ? Math.round((totalFishers/capacity)*100) : 0}%</div></div>
            </div>`;
    }

    const searchTerm = (document.getElementById(`${prefix}-search`)?.value || "").toLowerCase();

    list.innerHTML = sourceEntries.slice().reverse()
        .filter(e => {
            if (!searchTerm) return true;
            // v8.1.41: Safety Guard
            const pArray = e.participants || [];
            const pNames = pArray.map(p => p.name).join(' ');
            const combined = `${e.id} ${e.groupName} ${e.representative} ${pNames}`.toLowerCase();
            return combined.includes(searchTerm);
        })
        .map(e => {
            const regTime = e.timestamp ? new Date(e.timestamp).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--:--';
            const repInfo = (e.participants && e.participants[0]) || { name: e.representative, nickname: '' };
            return `
            <tr>
                <td><span class="id-badge">${e.id}</span></td>
                <td><strong>${e.groupName}</strong></td>
                <td>${e.representative}${repInfo.nickname ? ` <small>(${repInfo.nickname})</small>` : ''}</td>
                <td>${e.fishers} / ${e.observers}</td>
                <td><small>${regTime}</small></td>
                <td>
                    <div style="display:flex; gap:0.3rem;">
                        <button class="btn-outline btn-small" onclick="showEntryDetails('${e.id}')">遒ｺ隱・/button>
                        ${prefix === 'harimitsu' ? `<button class="btn-primary btn-small" onclick="requestAdminEdit('${e.id}')">菫ｮ豁｣</button>` : ''}
                    </div>
                </td>
            </tr>
        `;
        }).join('') || '<tr><td colspan="6" style="text-align:center; padding:2rem;">隧ｲ蠖薙☆繧狗匳骭ｲ縺ｯ縺ゅｊ縺ｾ縺帙ｓ</td></tr>';

    renderBreakdownStats(sourceName, `${prefix}-`);
    window.scrollTo(0, scrollPos);
}

/**
 * v8.1.42: Detect and refresh whichever admin/coordinator view is currently active
 */
function renderActiveCoordinatorView() {
    // 1. Dashboard
    updateDashboard();
    
    // 2. Reception
    updateReceptionList();

    // 3. Coordinator Views
    if (document.getElementById('mintsuri-coordinator-view')?.classList.contains('active')) {
        renderMintsuriCoordinatorView();
    }
    if (document.getElementById('harimitsu-coordinator-view')?.classList.contains('active')) {
        renderHarimitsuCoordinatorView();
    }
    if (document.getElementById('suiho-coordinator-view')?.classList.contains('active')) {
        renderSuihoCoordinatorView();
    }
}

window.exportMintsuriCSV = function() {
    exportGenericCSV('縺ｿ繧馴・繧・, 'mintsuri_export');
}

window.exportHarimitsuCSV = function() {
    exportGenericCSV('繝上Μ繝溘ヤ', 'harimitsu_export');
}

window.exportSuihoCSV = function() {
    exportGenericCSV('豌ｴ螳・, 'suiho_export');
}

function exportGenericCSV(sourceName, fileName) {
    const targetEntries = state.entries.filter(e => e.source === sourceName && e.status !== 'cancelled');
    if (targetEntries.length === 0) return alert('繝・・繧ｿ縺後≠繧翫∪縺帙ｓ');

    const headers = ['蜿嶺ｻ倡分蜿ｷ', '繧ｰ繝ｫ繝ｼ繝怜錐', '莉｣陦ｨ閠・錐', '髮ｻ隧ｱ逡ｪ蜿ｷ', '繝｡繝ｼ繝ｫ', '驥｣繧贋ｺｺ謨ｰ', '隕句ｭｦ莠ｺ謨ｰ', '逋ｻ骭ｲ譎る俣'];
    const rows = targetEntries.map(e => [
        e.id, e.groupName, e.representative, e.phone, e.email, e.fishers, e.observers, formatDateForCSV(e.timestamp)
    ]);
    downloadCSV(fileName, headers, rows);
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
                <div class="summary-label">驥｣繧雁盾蜉閠・粋險・/div>
                <div class="summary-value"><span class="current-fishers">${fishers}</span> <small>/ ${state.settings.capacityTotal}</small></div>
            </div>
            <div class="summary-card">
                <div class="summary-label">邱冗匳骭ｲ繧ｰ繝ｫ繝ｼ繝・/div>
                <div class="summary-value">${groups} <small>邨・/small></div>
            </div>
            <div class="summary-card">
                <div class="summary-label">隕句ｭｦ閠・粋險・/div>
                <div class="summary-value">${observers} <small>蜷・/small></div>
            </div>
            <div class="summary-card" style="border-top: 5px solid #10b981;">
                <div class="summary-label">蠖捺律蜿嶺ｻ倡憾豕・/div>
                <div class="summary-value" style="font-size: 1.1rem; line-height: 1.4;">
                    <span style="color: var(--primary-color)">譚･蝣ｴ: <span class="checked-in-count">${checkedIn}</span></span> / 
                    <span style="color: var(--error-color)">谺蟶ｭ: <span class="absent-count">${absent}</span></span>
                </div>
                <div style="font-size: 0.7rem; color: #64748b; margin-top: 4px;">蜈ｨ <span class="total-groups-count">${groups}</span> 邨・/div>
            </div>
        </div>
    `;

    containers.forEach(c => { c.innerHTML = html; });
}

// Admin Debug Methods
async function testEmailFeature() {
    const testEmail = prompt("繝・せ繝医Γ繝ｼ繝ｫ縺ｮ騾∽ｿ｡蜈医ｒ蜈･蜉帙＠縺ｦ縺上□縺輔＞:", "test@example.com");
    if (!testEmail) return;
    showToast('繝・せ繝医Γ繝ｼ繝ｫ騾∽ｿ｡荳ｭ...', 'info');
    try {
        await sendEmailViaGAS({
            action: 'sendEmail', id: 'TEST-000', groupName: '繝・せ繝・,
            email: testEmail, representative: '繝・せ繝域ｰ丞錐',
            fishers: 1, observers: 0, source: '荳闊ｬ', participants: [{name: '繝・せ繝亥盾蜉閠・, type: 'fisher'}]
        });
        alert("騾∽ｿ｡繝ｪ繧ｯ繧ｨ繧ｹ繝亥ｮ御ｺ・りｨｭ螳啅RL: " + GAS_WEB_APP_URL);
    } catch (e) { alert("繧ｨ繝ｩ繝ｼ: " + e.message); }
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
    if (!list) return;

    const searchTerm = document.getElementById('reception-search').value.toLowerCase();
    const showCompleted = document.getElementById('show-completed-toggle').checked;

    // v8.1.56: Save scroll position of the sidebar
    const scrollPos = list.scrollTop;

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

    let html = '';
    processedEntries.forEach(e => {
        // Search Filter (v8.1.58: Safety guarded)
        const pArray = e.participants || [];
        const pNames = pArray.map(p => p.name).join(' ');
        const pNicks = pArray.map(p => p.nickname || "").join(' ');
        const pTshirts = pArray.map(p => p.tshirtSize || "").join(' ');
        const pGenders = pArray.map(p => genderLabels[p.gender] || "").join(' ');
        const combined = `${e.id} ${e.groupName} ${e.representative} ${pNames} ${pNicks} ${pTshirts} ${pGenders}`.toLowerCase();
        
        if (searchTerm && !combined.includes(searchTerm)) return;

        // Completion Filter
        if (!showCompleted && e.isCompleted) return;

        const badgeClass = e.source === '縺ｿ繧馴・繧・ ? 'badge-mintsuri' : e.source === '荳闊ｬ' ? 'badge-ippan' : e.source === '繝上Μ繝溘ヤ' ? 'badge-harimitsu' : 'badge-suiho';
        
        html += `
            <div class="reception-group-item ${activeReceptionEntryId === e.id ? 'active' : ''} ${e.isCompleted ? 'completed' : ''}" 
                 onclick="selectReceptionEntry('${e.id}')">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.3rem;">
                    <strong style="font-size:1.1rem; color:#2d3436;">${e.id} | ${e.groupName}</strong>
                    <span class="badge ${badgeClass}" style="font-size:0.7rem; padding:0.1rem 0.4rem;">${e.source}</span>
                </div>
                <div class="item-meta" style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="font-size:1rem; color:#636e72;">${e.representative}</div>
                    <div style="display:flex; align-items:center; gap:0.5rem;">
                        <span style="font-size:0.9rem; font-weight:700; color: #0984e3;">${e.isCompleted ? '笨・蜿嶺ｻ俶ｸ・ : `${e.finishedCount}/${e.totalCount}`}</span>
                        ${!e.isCompleted ? `<button onclick="event.stopPropagation(); updateGroupStatus('${e.id}', 'checked-in')" style="padding: 0.2rem 0.5rem; font-size: 0.7rem; background: var(--primary-color); border: none; border-radius: 4px; color: white; cursor: pointer;">蜈ｨ蜩｡蜿嶺ｻ・/button>` : ''}
                    </div>
                </div>
            </div>
        `;
    });
    
    list.innerHTML = html;
    list.scrollTop = scrollPos;
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
                <i class="icon-search">剥</i>
                <p>蟾ｦ蛛ｴ縺ｮ繝ｪ繧ｹ繝医°繧峨げ繝ｫ繝ｼ繝励ｒ驕ｸ謚槭＠縺ｦ縺上□縺輔＞縲・/p>
            </div>
        `;
        return;
    }

    desk.innerHTML = `
        <div class="desk-header" style="background: #eef2ff; border-bottom: 2px solid var(--primary-color); padding: 1.5rem; border-radius: 8px 8px 0 0;">
            <div class="desk-title-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                <div class="desk-group-name" style="font-size: 1.8rem; font-weight: 900; color: var(--primary-color);">${entry.groupName}</div>
                <div class="badge ${entry.source === '縺ｿ繧馴・繧・ ? 'badge-mintsuri' : entry.source === '荳闊ｬ' ? 'badge-ippan' : entry.source === '繝上Μ繝溘ヤ' ? 'badge-harimitsu' : 'badge-suiho'}" style="font-size: 1.2rem; padding: 0.5rem 1rem;">${entry.source}</div>
            </div>
            <div class="desk-meta" style="font-size: 1rem; color: #475569; font-weight: 600;">
                <span style="background: white; padding: 2px 8px; border-radius: 4px; border: 1px solid #cbd5e1;">ID: ${entry.id}</span>
                <span style="margin-left: 1rem;">莉｣陦ｨ閠・ ${entry.representative}</span>
                <span style="margin-left: 1rem;">TEL: ${entry.phone}</span>
            </div>
        </div>

        <div class="participant-check-list" style="padding: 1.5rem; background: white;">
            <div class="section-title" style="margin-top: 0; margin-bottom: 1rem; font-size: 1.1rem; border-left-width: 4px;">蜿ょ刈繝｡繝ｳ繝舌・蛟句挨縺ｮ蜿嶺ｻ倡憾豕・/div>
            
            ${entry.participants.map((p, idx) => {
                const typeClass = p.type === 'fisher' ? 'p-badge-fisher' : 'p-badge-observer';
                const typeLabel = p.type === 'fisher' ? '驥｣繧・ : '隕句ｭｦ';
                const rowStatusClass = p.status === 'checked-in' ? 'checked-in' : (p.status === 'absent' ? 'absent' : '');
                
                return `
                <div class="participant-check-row ${rowStatusClass}" style="margin-bottom: 12px; padding: 1rem; border-radius: 12px; border: 2px solid ${p.status === 'checked-in' ? '#10b981' : (p.status === 'absent' ? '#ef4444' : '#e2e8f0')}; display: flex; align-items: center; justify-content: space-between; background: ${p.status === 'checked-in' ? '#f0fdf4' : (p.status === 'absent' ? '#fef2f2' : 'white')}; transition: all 0.2s;">
                    <div class="p-info" style="display: flex; align-items: center; gap: 1rem; flex: 1;">
                        <div style="font-size: 1.5rem; width: 40px; text-align: center;">${p.status === 'checked-in' ? '笨・ : (p.status === 'absent' ? '笶・ : '筮・)}</div>
                        <div>
                            <div class="p-name" style="font-size: 1.25rem; font-weight: 800; color: #1e293b;">
                                <span class="badge ${p.type === 'fisher' ? 'badge-ippan' : 'badge-secondary'}" style="margin-right: 8px;">${typeLabel}</span>
                                ${p.name} <small style="font-weight: normal; color: #64748b;">(${p.nickname || '繝九ャ繧ｯ繝阪・繝辟｡'})</small>
                            </div>
                            <div class="p-meta" style="font-size: 0.9rem; color: #64748b; margin-top: 4px;">
                                ${p.region || '蝨ｰ蝓滉ｸ肴・'} | ${genderLabels[p.gender] || '-'} | ${ageLabels[p.age] || '-'} | T繧ｷ繝｣繝・ [<strong>${p.tshirtSize || '荳肴・'}</strong>]
                            </div>
                        </div>
                    </div>
                    <div class="p-status-actions" style="display: flex; gap: 8px;">
                        <button class="btn-status in ${p.status === 'checked-in' ? 'active' : ''}" onclick="updateParticipantStatus('${entry.id}', ${idx}, 'checked-in')" style="padding: 1rem 1.5rem; font-size: 1rem; font-weight: 800; border-radius: 8px; cursor: pointer; border: 2px solid #10b981; background: ${p.status === 'checked-in' ? '#10b981' : 'white'}; color: ${p.status === 'checked-in' ? 'white' : '#10b981'}; min-width: 100px;">譚･蝣ｴ</button>
                        <button class="btn-status out ${p.status === 'absent' ? 'active' : ''}" onclick="updateParticipantStatus('${entry.id}', ${idx}, 'absent')" style="padding: 1rem 1.5rem; font-size: 1rem; font-weight: 800; border-radius: 8px; cursor: pointer; border: 2px solid #ef4444; background: ${p.status === 'absent' ? '#ef4444' : 'white'}; color: ${p.status === 'absent' ? 'white' : '#ef4444'}; min-width: 100px;">谺蟶ｭ</button>
                    </div>
                </div>
                `;
            }).join('')}
        </div>

        <div class="desk-footer" style="padding: 1.5rem; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; align-items: center; border-radius: 0 -0 8px 8px; gap: 1rem;">
            <button class="btn-primary btn-large" onclick="window.updateGroupStatus('${entry.id}', 'checked-in')" style="padding: 1rem 2rem; font-size: 1.2rem; white-space: nowrap;">蜈ｨ蜩｡縺ｾ縺ｨ繧√※蜿嶺ｻ・/button>
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
        const statusLabel = status === 'checked-in' ? '蜿嶺ｻ俶ｸ・ : status === 'absent' ? '谺蟶ｭ' : '譛ｪ蜿嶺ｻ・;
        showToast(`${entry.participants[pIdx].name} 讒倥ｒ縲・{statusLabel}縲阪↓譖ｴ譁ｰ縺励∪縺励◆`, 'info');
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
        // status縺・'checked-in' 縺ｮ蝣ｴ蜷医∵里縺ｫ 'absent' 縺ｮ莠ｺ縺ｯ荳頑嶌縺阪＠縺ｪ縺・
        if (status === 'checked-in' && p.status === 'absent') {
            return;
        }
        p.status = status;
    });
    syncGroupStatusFromParticipants(entry);

    if (status === 'checked-in') {
        showToast('繧ｰ繝ｫ繝ｼ繝怜・蜩｡繧貞女莉倥＠縺ｾ縺励◆', 'success');
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
            document.getElementById('ikesu-modal-title').textContent = "繧､繧ｱ繧ｹ縺ｮ邱ｨ髮・;
            document.getElementById('ikesu-edit-id').value = ikesu.id;
            document.getElementById('ikesu-name').value = ikesu.name;
            document.getElementById('ikesu-capacity').value = ikesu.capacity;
            const passEl = document.getElementById('ikesu-passcode');
            if (passEl) passEl.value = ikesu.passcode || "";
            return;
        }
    }
    document.getElementById('ikesu-modal-title').textContent = "繧､繧ｱ繧ｹ縺ｮ霑ｽ蜉";
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
        alert("蜷榊燕縺ｨ螳壼藤・・莉･荳奇ｼ峨ｒ豁｣縺励￥蜈･蜉帙＠縺ｦ縺上□縺輔＞縲・);
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
    if (!confirm('譛ｬ蠖薙↓縺薙・繧､繧ｱ繧ｹ繧貞炎髯､縺励∪縺吶°・歃n蜑ｲ繧雁ｽ薙※繧峨ｌ縺ｦ縺・◆莠ｺ縺ｯ譛ｪ蜑ｲ繧雁ｽ薙※縺ｫ謌ｻ繧翫∪縺吶・)) return;
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
                   const sourceClass = `source-${e.source === '一般' ? 'ippan' : e.source === 'みん釣り' ? 'mintsuri' : e.source === '水宝' ? 'suiho' : e.source === 'ハリミツ' ? 'harimitsu' : 'default'}`;
                   let html = `
                       <div class="drag-item-group ${sourceClass} ${isFull ? 'draggable' : ''}" 
                            ${isFull ? `draggable="true" ondragstart="dragGroup(event, '${e.id}')"` : ''}>
                           <div class="drag-item-header">
                               <div><strong>[${e.id}] ${e.groupName}</strong></div>
                               <button class="btn-expand" onclick="toggleGroupExpand('${e.id}')">竏ｨ</button>
                           </div>
                           <div class="drag-item-participants" id="drag-parts-${e.id}">
                               ${unassignedParts.map(item => `
                                   <div class="drag-item-person draggable" draggable="true" ondragstart="dragPerson(event, '${e.id}', ${item.idx})">
                                       <span>${item.p.name}</span>
                                       <span class="badge ${item.p.type==='fisher'?'':'badge-observer'}">${item.p.type==='fisher'?'驥｣繧・:'隕句ｭｦ'}</span>
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
                <button class="btn-text" onclick="window.openIkesuModal('${ik.id}')">笨擾ｸ・/button>
            </div>
            <div class="ikesu-capacity">驥｣繧・ ${data.fishers}/${ik.capacity} (隕句ｭｦ: ${data.observers})</div>
            <div class="ikesu-drop-area">
                ${Object.values(data.items.reduce((acc, item) => {
                    if (!acc[item.entry.id]) acc[item.entry.id] = { entry: item.entry, parts: [] };
                    acc[item.entry.id].parts.push(item);
                    return acc;
                }, {})).map(group => {
                    const sc = `source-${group.entry.source === '一般' ? 'ippan' : group.entry.source === 'みん釣り' ? 'mintsuri' : group.entry.source === '水宝' ? 'suiho' : group.entry.source === 'ハリミツ' ? 'harimitsu' : 'default'}`;
                    return `
                    <div class="drag-item-group ${sc}">
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
                `;
                }).join('')}
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
        showToast('隱崎ｨｼ謌仙粥', 'success');
        document.getElementById('leader-step-1').classList.add('hidden');
        document.getElementById('leader-step-2').classList.remove('hidden');
        renderLeaderEntryTable();
    } else {
        showToast('證苓ｨｼ逡ｪ蜿ｷ縺碁＆縺・∪縺・, 'error');
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
            <thead><tr><th>豌丞錐</th><th>髱堤黄(2pt)</th><th>魃帷ｭ・1pt)</th><th>蟆剰ｨ・/th></tr></thead>
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
    showToast('菫晏ｭ倥＠縺ｾ縺励◆', 'success');
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
                    <span>${ik.name} 繝｡繝ｳ繝舌・陦ｨ</span>
                    <span style="font-size:1rem; background:#eee; padding:5px 10px; border-radius:4px;">繝ｪ繝ｼ繝繝ｼ逕ｨ 證苓ｨｼ逡ｪ蜿ｷ: <strong>${ik.passcode}</strong></span>
                </h2>
                <table class="print-table" style="width:100%; border-collapse:collapse; margin-top:20px;">
                    <thead><tr style="background:#f0f0f0;"><th>繧ｰ繝ｫ繝ｼ繝・/th><th>豌丞錐</th><th>蛹ｺ蛻・/th><th>蛯呵・/th></tr></thead>
                    <tbody>
                        ${members.map(m => `<tr><td>${m.e.groupName}</td><td>${m.p.name}</td><td>${m.p.type==='fisher'?'驥｣繧・:'隕句ｭｦ'}</td><td>${m.p.isLeader?'笘・Μ繝ｼ繝繝ｼ':''}</td></tr>`).join('')}
                    </tbody>
                </table>
            </div>
        `;
    });
    container.innerHTML = html || "繝・・繧ｿ縺ｪ縺・;
};

/* --- SYSTEM STABILIZATION FUNCTIONS RESTORED v8.0.7 --- */

function updateAppTitle() {
    const titleEl = document.getElementById('app-title');
    const competitionName = state.settings.competitionName || "驥｣繧雁､ｧ莨・蜿嶺ｻ・;
    if (titleEl) {
        if (currentViewId === 'dashboard-view') titleEl.textContent = `邂｡逅・・ ${competitionName}`;
        else if (currentViewId === 'reception-view') titleEl.textContent = `蠖捺律蜿嶺ｻ・ ${competitionName}`;
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
    showToast('螟ｧ莨夊ｨｭ螳壹ｒ縺吶∋縺ｦ菫晏ｭ倥＠縺ｾ縺励◆', 'success');
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
    if (confirm('蜈ｨ縺ｦ縺ｮ蜷咲ｰｿ繝・・繧ｿ繧貞炎髯､縺励∪縺吶よ悽蠖薙↓繧医ｍ縺励＞縺ｧ縺吶°・・)) {
        state.entries = [];
        state.lastUpdated = Date.now();
        showToast('繝ｪ繧ｻ繝・ヨ荳ｭ...', 'info');
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
        container.innerHTML = "<p style='font-size:0.8rem; color:var(--text-muted);'>QR繧ｳ繝ｼ繝峨Λ繧､繝悶Λ繝ｪ隱ｭ縺ｿ霎ｼ縺ｿ荳ｭ...</p>";
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
    const searchVal = prompt("縺雁錐蜑搾ｼ井ｻ｣陦ｨ閠・ｼ峨ｒ蜈･蜉帙＠縺ｦ縺上□縺輔＞縲・);
    if (!searchVal) return;
    
    dashboardFilter = 'all';
    const matches = state.entries.filter(e => e.representative.includes(searchVal));
    if (matches.length > 0) {
        alert(`${matches.length} 莉ｶ隕九▽縺九ｊ縺ｾ縺励◆縲よ怙譁ｰ縺ｮ逡ｪ蜿ｷ縺ｯ ${matches[0].id} 縺ｧ縺吶Ａ);
        location.reload();
    } else {
        alert("隕九▽縺九ｊ縺ｾ縺帙ｓ縺ｧ縺励◆縲ゅｂ縺・ｸ蠎ｦ隧ｦ縺吶°縲∽ｺ句漁螻縺ｸ縺雁撫縺・粋繧上○縺上□縺輔＞縲・);
    }
}

/**
 * v8.1.20: Restore Hard Delete for Test Data Management
 */
window.hardDeleteEntry = async function (id) {
    if (!isAdminAuth) return;
    if (!confirm(`繧ｨ繝ｳ繝医Μ繝ｼ ${id} 繧貞ｮ悟・縺ｫ蜑企勁縺励∪縺吶°・歃n(騾∽ｿ｡蠕後√し繝ｼ繝舌・縺九ｉ繧ょｮ悟・縺ｫ蜑企勁縺輔ｌ縺ｾ縺吶ゅユ繧ｹ繝亥・蜉帙・謨ｴ逅・↓菴ｿ逕ｨ縺励※縺上□縺輔＞)`)) return;

    try {
        const idx = state.entries.findIndex(e => e.id === id);
        if (idx === -1) {
            showToast('繧ｨ繝ｳ繝医Μ繝ｼ縺瑚ｦ九▽縺九ｊ縺ｾ縺帙ｓ', 'error');
            return;
        }

        // v7.9.3 logic: Track for cloud deletion
        if (!state.deletedIds) state.deletedIds = [];
        state.deletedIds.push(id);

        state.entries.splice(idx, 1);
        showToast('繧ｨ繝ｳ繝医Μ繝ｼ繧貞炎髯､縺励∪縺励◆', 'success');

        // Refresh UI
        updateDashboard();
        updateReceptionList();

        // Immediate sync to server
        await saveData();
    } catch (err) {
        console.error("Deletion failed:", err);
        showToast('蜑企勁縺ｫ螟ｱ謨励＠縺ｾ縺励◆', 'error');
    }
};

/**
 * v8.1.48: Restored Entry Details Modal rendering
 */
window.showEntryDetails = function (id) {
    window.currentDetailId = id; // Store for modal edit button
    const entry = state.entries.find(e => e.id === id);
    if (!entry) return;

    const modal = document.getElementById('detail-modal');
    const body = document.getElementById('detail-modal-body');
    const title = document.getElementById('detail-modal-title');
    const editBtn = document.getElementById('modal-edit-btn');

    if (!modal || !body) {
        console.error("Modal elements not found!");
        return;
    }

    // v8.1.95: Restore restriction - Hide edit button for Mintsuri/Suiho coordinators
    if (editBtn) {
        if (currentViewId === 'mintsuri-coordinator-view' || currentViewId === 'suiho-coordinator-view') {
            editBtn.classList.add('hidden');
        } else {
            editBtn.classList.remove('hidden');
        }
    }

    if (title) title.textContent = `[${entry.id}] ${entry.groupName} 隧ｳ邏ｰ`;

    // Calculate Scores for display
    let groupPoints = 0;
    (entry.participants || []).forEach(p => {
        const pA = parseInt(p.catchA || 0);
        const pB = parseInt(p.catchB || 0);
        groupPoints += (pA * 2) + pB;
    });

    let participantsHtml = entry.participants.map((p, idx) => `
        <div style="padding: 10px; border: 1px solid #eee; border-radius: 8px; margin-bottom: 8px; background: ${p.type === 'observer' ? '#f8f9fa' : '#fff'}">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <strong>${p.name} ${p.nickname ? `<small>(${p.nickname})</small>` : ''}${p.gender === 'male' ? '笙・ : (p.gender === 'female' ? '笙' : '')}</strong>
                <span class="badge ${p.type === 'fisher' ? 'badge-ippan' : 'badge-secondary'}">${p.type === 'fisher' ? '驥｣繧・ : '隕句ｭｦ'}</span>
            </div>
            <div style="font-size: 0.85rem; color: #64748b; margin-top: 5px;">
                ${genderLabels[p.gender] || '-'} / ${ageLabels[p.age] || '-'} / ${p.region || '蝨ｰ蝓滉ｸ肴・'} / T繧ｷ繝｣繝・ ${p.tshirtSize || '縺ｪ縺・}
            </div>
            ${p.type === 'fisher' ? `
            <div style="margin-top: 5px; font-weight: bold; color: var(--primary-color);">
                ${p.catchA || 0}蛹ｹ (螟ｧ迚ｩ) / ${p.catchB || 0}蛹ｹ (縺昴・莉・
            </div>` : ''}
        </div>
    `).join('');

    body.innerHTML = `
        <div style="margin-bottom: 1.5rem; padding: 1rem; background: #f1f5f9; border-radius: 8px;">
            <p><strong>莉｣陦ｨ閠・</strong> ${entry.representative}</p>
            <p><strong>髮ｻ隧ｱ逡ｪ蜿ｷ:</strong> ${entry.phone}</p>
            <p><strong>繝｡繝ｼ繝ｫ:</strong> ${entry.email}</p>
            <p><strong>逋ｻ骭ｲ蛹ｺ蛻・</strong> <span class="badge ${entry.source === '縺ｿ繧馴・繧・ ? 'badge-mintsuri' : entry.source === '荳闊ｬ' ? 'badge-ippan' : entry.source === '繝上Μ繝溘ヤ' ? 'badge-harimitsu' : 'badge-suiho'}">${entry.source}</span></p>
            <p><strong>迴ｾ蝨ｨ縺ｮ迥ｶ諷・</strong> ${entry.status === 'checked-in' ? '笨・蜿嶺ｻ俶ｸ・ : entry.status === 'cancelled' ? '圻 繧ｭ繝｣繝ｳ繧ｻ繝ｫ' : '竢ｳ 蠕・ｩ・}</p>
            <p><strong>蠕礼せ蜷郁ｨ・</strong> <span style="font-size: 1.2rem; font-weight: 900; color: var(--primary-color);">${groupPoints} pt</span></p>
        </div>
        <h4 style="margin-bottom: 0.8rem; font-size: 1rem; color: #475569;">蜿ょ刈閠・・險ｳ (${entry.participants.length}蜷・</h4>
        <div>${participantsHtml}</div>
    `;

    modal.classList.remove('hidden');
};

/**
 * v8.1.48: Close detail modal
 */
window.closeDetailModal = function () {
    const modal = document.getElementById('detail-modal');
    if (modal) modal.classList.add('hidden');
};

/**
 * v8.1.48: Request Admin-led Editing (Redirects to form)
 */
window.requestAdminEdit = function (id) {
    try {
        const entry = state.entries.find(e => e.id === id);
        if (!entry) {
            showToast('繧ｨ繝ｳ繝医Μ繝ｼ縺瑚ｦ九▽縺九ｊ縺ｾ縺帙ｓ', 'error');
            return;
        }
        
        // Ensure we are in admin mode for the form
        isAdminAuthAction = true;
        
        // 1. Fill the form
        fillFormForEdit(entry);
        
        // 2. Switch view to registration
        switchView(null, 'registration-view');
        
        // 3. UI refinements
        window.scrollTo({ top: 0, behavior: 'smooth' });
        const titleEl = document.getElementById('app-title');
        if (titleEl) titleEl.textContent = "逋ｻ骭ｲ螟画峩: " + entry.id;
        
        // 4. Close modal if open
        const modal = document.getElementById('detail-modal');
        if (modal) modal.classList.add('hidden');
        
    } catch (e) {
        console.error("BORIJIN: requestAdminEdit failed:", e);
        showToast("邱ｨ髮・判髱｢縺ｸ縺ｮ驕ｷ遘ｻ縺ｫ螟ｱ謨励＠縺ｾ縺励◆", "error");
    }
};

/**
 * v8.1.48: Quick Toggle Status from Dashboard
 */
window.quickCheckIn = async function (id) {
    const entry = state.entries.find(e => e.id === id);
    if (!entry) return;

    if (entry.status === 'cancelled') {
        showToast('繧ｭ繝｣繝ｳ繧ｻ繝ｫ貂医∩縺ｮ繧ｨ繝ｳ繝医Μ繝ｼ縺ｯ蜿嶺ｻ倥〒縺阪∪縺帙ｓ', 'error');
        return;
    }

    const newStatus = entry.status === 'checked-in' ? 'pending' : 'checked-in';
    entry.status = newStatus;
    
    // Also update all individual participants
    entry.participants.forEach(p => {
        if (newStatus === 'checked-in' && p.status === 'absent') return;
        p.status = newStatus;
    });

    entry.lastModified = new Date().toLocaleString('ja-JP');
    if (newStatus === 'checked-in') entry.checkedIn = true;
    
    showToast(`${entry.groupName} 縺ｮ迥ｶ諷九ｒ縲・{newStatus === 'checked-in' ? '蜿嶺ｻ俶ｸ・ : '譛ｪ蜿嶺ｻ・}縲阪↓譖ｴ譁ｰ荳ｭ...`, 'info');
    
    await saveData();
    updateDashboard();
    updateReceptionList();
    showToast(`${entry.groupName} 縺ｮ迥ｶ諷九ｒ譖ｴ譁ｰ縺励∪縺励◆`, 'success');
};

/**
 * v8.1.48: Admin Email Resend
 */
window.resendEmail = async function (id) {
    if (!confirm('縺薙・逕ｳ霎ｼ縺ｮ遒ｺ螳壹Γ繝ｼ繝ｫ繧貞・騾√＠縺ｾ縺吶°・・)) return;
    const entry = state.entries.find(e => e.id === id);
    if (!entry) return;

    showToast('繝｡繝ｼ繝ｫ蜀埼√さ繝槭Φ繝峨ｒ騾∽ｿ｡荳ｭ...', 'info');
    try {
        const payload = { action: 'resend_email', id: entry.id };
        const response = await fetch(GAS_WEB_APP_URL, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const res = await response.json();
        if (res.status === 'success') {
            showToast('笨・繝｡繝ｼ繝ｫ繧貞・騾√＠縺ｾ縺励◆', 'success');
        } else {
            throw new Error(res.message);
        }
    } catch (e) {
        console.error("Email resend failed:", e);
        showToast('笶・繝｡繝ｼ繝ｫ縺ｮ蜀埼√↓螟ｱ謨励＠縺ｾ縺励◆縲ゅし繝ｼ繝舌・蛛ｴ縺ｮ繝ｭ繧ｰ繧堤｢ｺ隱阪＠縺ｦ縺上□縺輔＞縲・, 'error');
    }
};

/**
 * v8.1.48: Entry Cancellation
 */
window.cancelEntry = async function (id) {
    if (!confirm('縺薙・繧ｨ繝ｳ繝医Μ繝ｼ繧偵檎┌蜉ｹ・医く繝｣繝ｳ繧ｻ繝ｫ・峨阪↓縺励∪縺吶°・歃n窶ｻ繝・・繧ｿ縺ｯ繝槭せ繧ｿ縺ｫ谿九ｊ縺ｾ縺吶′縲・寔險医ｄ蜿怜・縺九ｉ縺ｯ髯､螟悶＆繧後∪縺吶・)) return;
    const entry = state.entries.find(e => e.id === id);
    if (entry) {
        entry.status = 'cancelled';
        entry.lastModified = new Date().toLocaleString('ja-JP');
        await saveData();
        updateDashboard();
        showToast('繧ｨ繝ｳ繝医Μ繝ｼ繧堤┌蜉ｹ蛹悶＠縺ｾ縺励◆', 'info');
        resetForm(); // Clear the form if we were editing
        switchView(null, 'dashboard-view');
    }
};

/**
 * v8.1.48: Restore Entry from Cancellation
 */
window.restoreEntry = async function (id) {
    const entry = state.entries.find(e => e.id === id);
    if (entry) {
        entry.status = 'pending';
        entry.lastModified = new Date().toLocaleString('ja-JP');
        await saveData();
        updateDashboard();
        showToast('繧ｨ繝ｳ繝医Μ繝ｼ繧呈怏蜉ｹ縺ｪ迥ｶ諷具ｼ亥ｾ・ｩ滂ｼ峨↓蠕ｩ蜈・＠縺ｾ縺励◆', 'success');
        fillFormForEdit(entry); // Refresh the edit view if active
    }
};

async function exportGroupsCSV() {
    const headers = ["ID", "蛹ｺ蛻・, "繧ｰ繝ｫ繝ｼ繝怜錐", "莉｣陦ｨ閠・, "髮ｻ隧ｱ逡ｪ蜿ｷ", "莠ｺ謨ｰ(驥｣繧・", "莠ｺ謨ｰ(隕句ｭｦ)", "繧ｹ繝・・繧ｿ繧ｹ", "譌･譎・];
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
    const headers = ["ID", "蛹ｺ蛻・, "繧ｰ繝ｫ繝ｼ繝怜錐", "豌丞錐", "繝九ャ繧ｯ繝阪・繝", "諤ｧ蛻･", "蟷ｴ莉｣", "蝨ｰ蝓・, "蛹ｺ蛻・驥｣/隕・", "繧ｵ繧､繧ｺ", "繧ｹ繝・・繧ｿ繧ｹ"];
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
                p.type === 'fisher' ? '驥｣繧・ : '隕句ｭｦ',
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

// Redundant renderRankings removed in v8.1.69

/* --- LEADER ENTRY LOGIC --- */
function renderLeaderEntryForm() {
    const container = document.getElementById('leader-entry-form-container');
    if (!container) return;
    container.innerHTML = '<p class="text-center p-4">隱ｭ縺ｿ霎ｼ縺ｿ荳ｭ...</p>';
    const searchHtml = `
        <div class="form-group">
            <label>蜈･蜉帙☆繧九メ繝ｼ繝繧帝∈謚・/label>
            <select id="leader-group-select" class="form-control" style="font-size:1.1rem; padding:0.8rem;">
                <option value="">-- 繝√・繝繧帝∈謚槭＠縺ｦ縺上□縺輔＞ --</option>
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
                    <p class="small text-muted">ID: ${entry.id} / 莉｣陦ｨ閠・ ${entry.representative}</p>
                    <div class="form-group mt-3">
                        <label style="font-weight:bold">驥｣譫懊・繧､繝ｳ繝・(蜷郁ｨ・</label>
                        <input type="number" id="leader-point-input" class="form-control" 
                               style="font-size:2rem; font-weight:900; text-align:center;" 
                               value="${entry.totalScore || 0}" min="0">
                    </div>
                </div>
                <button class="btn-primary w-100 p-3" style="font-size:1.2rem" onclick="window.commitLeaderResultsSave()">
                    遒ｺ螳壹＠縺ｦ菫晏ｭ・
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

    if (!id) { alert("繝√・繝繧帝∈謚槭＠縺ｦ縺上□縺輔＞縲・); return; }
    const entry = state.entries.find(e => e.id === id);
    if (!entry) return;
    if (!confirm(`${entry.groupName} 縺ｮ蠕礼せ繧・${score} pt 縺ｧ逋ｻ骭ｲ縺励∪縺吶°・歔)) return;

    entry.totalScore = score;
    entry.lastModified = new Date().toLocaleString('ja-JP');
    showToast("菫晏ｭ倅ｸｭ...", "info");
    const success = await syncToCloud();
    if (success) {
        showToast("笨・菫晏ｭ伜ｮ御ｺ・＠縺ｾ縺励◆", "success");
        renderLeaderEntryForm();
    } else {
        showToast("笶・蜷梧悄縺ｫ螟ｱ謨励＠縺ｾ縺励◆", "error");
    }
};

/* --- SYSTEM UTILITIES --- */
function updateBulkMailCount() {
    const el = document.getElementById('bulk-mail-recipient-count');
    if (el) el.textContent = new Set(state.entries.map(e => e.email.toLowerCase().trim()).filter(e => e)).size;
}

function updateSourceAvailability() {
    try {
        const fishersIppan = sumCategoryFishers('荳闊ｬ');
        const fishersMintsuri = sumCategoryFishers('縺ｿ繧馴・繧・);
        const fishersSuiho = sumCategoryFishers('豌ｴ螳・);
        const fishersHarimitsu = sumCategoryFishers('繝上Μ繝溘ヤ');
        
        // v8.1.18: Filter out cancelled for global capacity check
        const totalNow = state.entries.filter(e => e.status !== 'cancelled').reduce((sum, en) => sum + en.fishers, 0);

        const updateRadio = (val, current, max) => {
            const radio = document.querySelector(`input[name="reg-source"][value="${val}"]`);
            if (radio) {
                const label = radio.closest('label');
                // Block if Category Limit reached OR Global Limit reached
                // v8.1.30: Priority check - If Category is FULL but Admin is logged in, 
                // allow the choice ONLY if we ARE NOT in a "Special Window" (forced source).
                // If it's a forced source, we MUST keep it hidden/disabled for non-forced.
                
                const isSpecialWindow = document.getElementById('main-source-selector')?.classList.contains('special-window');
                const isFull = (max > 0 && current >= max) || totalNow >= state.settings.capacityTotal;

                if (isFull && !radio.checked && !isAdminAuthAction && !isAdminAuth) {
                    radio.disabled = true;
                    if (label) label.classList.add('hidden');
                } else {
                    // v8.1.24: Check if this source is being forced/locked by injectSpecialSource
                    const isForced = label.classList.contains('forced-source');

                    if (isSpecialWindow) {
                        // v8.1.36: If it's a special window, DON'T unhide others (including General)
                        if (isForced) {
                            radio.disabled = false;
                            label.classList.remove('hidden');
                        } else {
                            label.classList.add('hidden');
                            radio.disabled = true;
                        }
                    } else if (!isAdminAuthAction && !isAdminAuth) {
                        // Standard unhide logic
                        radio.disabled = false;
                        if (label) label.classList.remove('hidden');
                    }
                }
            }
        };

        updateRadio('荳闊ｬ', fishersIppan, state.settings.capacityGeneral);
        updateRadio('縺ｿ繧馴・繧・, fishersMintsuri, state.settings.capacityMintsuri);
        updateRadio('豌ｴ螳・, fishersSuiho, state.settings.capacitySuiho);
        updateRadio('繝上Μ繝溘ヤ', fishersHarimitsu, state.settings.capacityHarimitsu);
    } catch (e) {
        console.warn("Source availability check skipped:", e);
    }
}

async function handleBulkEmailSend() {
    const subject = document.getElementById('bulk-mail-subject').value.trim();
    const body = document.getElementById('bulk-mail-body').value.trim();
    if (!subject || !body) { alert("莉ｶ蜷阪→譛ｬ譁・ｒ蜈･蜉帙＠縺ｦ縺上□縺輔＞縲・); return; }
    const recipients = Array.from(new Set(state.entries.filter(e => e.status !== 'cancelled' && e.email).map(e => e.email.toLowerCase().trim())));
    if (recipients.length === 0) { alert("騾∽ｿ｡蟇ｾ雎｡縺瑚ｦ九▽縺九ｊ縺ｾ縺帙ｓ縲・); return; }
    if (!confirm(`${recipients.length} 蜷阪∈荳譁峨Γ繝ｼ繝ｫ繧帝∽ｿ｡縺励∪縺吶°・歔)) return;
    const btn = document.getElementById('btn-send-bulk-mail');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '騾∽ｿ｡荳ｭ...';
    try {
        const response = await fetch(GAS_WEB_APP_URL, { method: 'POST', body: JSON.stringify({ action: 'bulk_email', subject, body, recipients }) });
        const result = await response.json();
        if (result.status === 'success') {
            showToast('笨・荳譁峨Γ繝ｼ繝ｫ繧帝∽ｿ｡縺励∪縺励◆', 'success');
            document.getElementById('bulk-mail-subject').value = '';
            document.getElementById('bulk-mail-body').value = '';
        } else { throw new Error(result.message || '騾∽ｿ｡繧ｨ繝ｩ繝ｼ'); }
    } catch (error) {
        console.error("Bulk email error:", error);
        showToast('笶・繝｡繝ｼ繝ｫ縺ｮ騾∽ｿ｡縺ｫ螟ｱ謨励＠縺ｾ縺励◆', 'error');
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
    // v8.1.54: Increased interval to 1500ms for more stable multi-tap on mobile/slow devices
    if (now - lastClickTime < 1500) {
        clickCount++;
    } else {
        clickCount = 1;
    }
    lastClickTime = now;
    console.log(`Admin tap registered: ${clickCount}/5`); 
    if (clickCount >= 5) {
        clickCount = 0;
        if (typeof showAdminLogin === 'function') {
            showAdminLogin();
        } else {
            console.error("BORIJIN: showAdminLogin not found");
        }
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

    // v8.1.45: Unified URL Parameter Handler
    if (src || view) {
        console.log("BORIJIN: Handling deep-link parameters:", { src, view });
        
        // 1. Handle Source (Primary Context)
        if (src) {
            const validSources = { 'mintsuri': '縺ｿ繧馴・繧・, 'harimitsu': '繝上Μ繝溘ヤ', 'suiho': '豌ｴ螳・, 'general': '荳闊ｬ' };
            const decodedSrc = validSources[src.toLowerCase()];
            if (decodedSrc) injectSpecialSource(decodedSrc);
        }

        // 2. Handle View (Navigation)
        if (view) {
            // Mapping for aliases
            const viewAliases = { 'mintsuri': 'mintsuri-coordinator-view', 'harimitsu': 'harimitsu-coordinator-view', 'suiho': 'suiho-coordinator-view' };
            const targetView = viewAliases[view] || view;

            if (document.getElementById(targetView)) {
                // Security Check: Only protect core management views. Coordinator views are accessible via shared URL.
                const adminViews = ['dashboard-view', 'reception-view', 'settings-view'];
                if (adminViews.includes(targetView) && !isAdminAuth) {
                    console.log("BORIJIN: Redirecting to admin login for protected view:", targetView);
                    showAdminLogin(targetView);
                } else {
                    switchView(null, targetView);
                }
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
    const selectorGroup = document.getElementById('source-selector-group');
    if (!selector) return;

    // v8.1.24: Mark as special window to prevent updateSourceAvailability from unhiding others
    selector.classList.add('special-window');

    // v8.1.23: Hide selector entirely if it's 'General' (unless admin)
    if (sourceName === '荳闊ｬ' && !isAdminAuth) {
        if (selectorGroup) selectorGroup.classList.add('hidden');
        console.log("General window: hiding selector");
    } else {
        if (selectorGroup) selectorGroup.classList.remove('hidden');
    }

    // v8.1.22: Hide other categories in specialized view
    selector.querySelectorAll('.source-option').forEach(opt => {
        const input = opt.querySelector('input');
        opt.classList.add('hidden'); // Hide others
        opt.classList.remove('forced-source');
        input.disabled = true;
    });

    // Find our specific target radio
    let target = selector.querySelector(`input[name="reg-source"][value="${sourceName}"]`);
    
    if (!target) {
        // Create specialized radio if missing
        const badgeClassMap = { '豌ｴ螳・: 'badge-suiho', '繝上Μ繝溘ヤ': 'badge-harimitsu', '縺ｿ繧馴・繧・: 'badge-mintsuri' };
        const badgeClass = badgeClassMap[sourceName] || 'badge-ippan';
        const label = document.createElement('label');
        label.className = 'source-option forced-source'; // No hidden class here
        label.innerHTML = `
            <input type="radio" name="reg-source" value="${sourceName}" checked required>
            <span class="source-label">
                <span class="badge ${badgeClass}">${sourceName}</span>
            </span>
        `;
        selector.appendChild(label);
        target = label.querySelector('input');
    } else {
        target.checked = true; // Force check (v8.1.36)
        target.disabled = false;
        const label = target.closest('.source-option');
        label.classList.remove('hidden'); // Show target
        // v8.1.26: Remove admin-only mark so regular users see the label/text
        label.classList.remove('admin-only'); 
        label.classList.add('forced-source');
        
        // Ensure parent group is visible
        if (selectorGroup) selectorGroup.classList.remove('hidden');
    }

    // Trigger change event to update UI/capacity states
    if (target) {
        target.dispatchEvent(new Event('change', { bubbles: true }));
    }
    
    // v8.1.36: Explicitly ensure "荳闊ｬ" is hidden in ANY specialized window
    if (sourceName !== '荳闊ｬ') {
        const ippanRadio = selector.querySelector('input[value="荳闊ｬ"]');
        if (ippanRadio) {
            ippanRadio.disabled = true;
            ippanRadio.closest('.source-option')?.classList.add('hidden');
        }
    }
    
    console.log(`Special view applied for: ${sourceName}`);
}

/**
 * v8.1.44: Helper to open URLs in a new tab
 */
window.openShareUrl = function(inputId) {
    const el = document.getElementById(inputId);
    if (el && el.value) {
        window.open(el.value, '_blank');
    }
};

/**
 * v8.1.44: Helper to copy URL to clipboard
 */
window.copyShareUrl = function(inputId) {
    const el = document.getElementById(inputId);
    if (el && el.value) {
        navigator.clipboard.writeText(el.value).then(() => {
            showToast('繧ｳ繝斐・縺励∪縺励◆', 'success');
        }).catch(err => {
            console.error('Copy failed:', err);
            showToast('繧ｳ繝斐・縺ｫ螟ｱ謨励＠縺ｾ縺励◆', 'error');
        });
    }
};

// v8.1.68: Safe global exports - Only export if the local name exists as a function
(function exportGlobals() {
    const globals = {
        'updateDashboard': typeof updateDashboard !== 'undefined' ? updateDashboard : window.updateDashboard,
        'switchView': typeof switchView !== 'undefined' ? switchView : window.switchView,
        'switchAdminTab': typeof switchAdminTab !== 'undefined' ? switchAdminTab : window.switchAdminTab
    };
    // Note: Most functions are already defined on window. We don't need redundant assignments.
})();

function showLoading() { console.log("BORIJIN: Loading started..."); }
function hideLoading() { console.log("BORIJIN: Loading finished."); }
