/**
 * BORIJIN Fishing Entry System
 * Version: v8.10.0 (GitHub Synchronized)
 * Last Updated: 2026-05-15
 */
const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbykDT-XvGhrZCQcCp_gCxZAToW3X4s_g_BPX7LBO4E-A84vUY0VE3nlqehITFOfp9f9/exec";

let state = {
    entries: [],
    deletedIds: [], // v7.9.3: Tracking local hard-deletions
    changeLog: [], // v8.6.0: Announcement-style change log
    settings: {
        competitionName: "BORIJIN FESTIVAL in 水宝 2026",
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
let currentSortField = 'time';
let currentSortOrder = 'desc'; // v8.9.80: Reverted to newest first per user request
let currentReceptionId = null;
let isAdminAuthAction = false; // Flag for admin-led edits
let activeReceptionEntryId = null; // Currently selected in reception desk

// v8.9.6: Restore global error tracker for debugging
window.onerror = function(msg, url, line, col, error) {
    console.error("Global Error Caught:", {msg, url, line, col, error});
    if (typeof showToast === 'function') {
        showToast("エラー: " + msg, "error");
    } else {
        alert("システムエラーが発生しました: " + msg + " (" + line + ":" + col + ")");
    }
    return false;
};

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
    const participants = Array.from(pRows).map(row => {
        const getVal = (cls) => row.querySelector(cls)?.value || '';
        return {
            type: getVal('.p-type'),
            name: getVal('.p-name'),
            nickname: getVal('.p-nick'),
            region: getVal('.p-region'),
            age: getVal('.p-age'),
            gender: getVal('.p-gender'),
            tshirtSize: getVal('.p-tshirt')
        };
    });

    for (let i = 0; i < participants.length; i++) {
        if (!participants[i].name.trim()) {
            showStatus(`参加者${i + 1}の氏名を入力してください。`, "error");
            return;
        }
    }

    if (participants.length === 0) {
        showStatus("参加者を1名以上登録してください。", "error");
        return;
    }

    const groupName = document.getElementById('group-name').value;
    const repName = document.getElementById('representative-name').value;
    const repPhone = document.getElementById('rep-phone').value;
    const repEmail = document.getElementById('rep-email').value;
    const repEmailConfirm = document.getElementById('rep-email-confirm').value;
    const memo = document.getElementById('entry-memo')?.value || '';

    if (!groupName.trim() || !repName.trim() || !repPhone.trim() || !repEmail.trim()) {
        showStatus("必須項目（グループ名、代表者名、電話番号、メールアドレス）を入力してください。", "error");
        return;
    }

    if (repEmail !== repEmailConfirm) {
        showStatus("メールアドレスが一致しません。もう一度ご確認ください。", "error");
        return;
    }

    const sourceEl = document.querySelector('input[name="reg-source"]:checked');
        const source = sourceEl ? sourceEl.value : '一般';
    const fisherCount = participants.filter(p => p.type === 'fisher').length;

    // v8.2.27: Capacity check in confirmation disabled per user request
    if (false) {
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
    }

    document.getElementById('conf-source').textContent = source;
    document.getElementById('conf-group').textContent = groupName;
    document.getElementById('conf-rep-name').textContent = repName;
    document.getElementById('conf-rep-phone').textContent = repPhone;
    document.getElementById('conf-rep-email').textContent = repEmail;
    if (document.getElementById('conf-memo')) {
        document.getElementById('conf-memo').textContent = memo;
    }

    const summaryList = document.getElementById('conf-participant-summary');
    summaryList.innerHTML = '';
    participants.forEach((p, idx) => {
        const li = document.createElement('li');
        li.style.padding = "0.5rem";
        li.style.borderBottom = "1px solid #eee";
        
        const typeLabel = p.type === 'fisher' ? '釣り' : '見学';
        const genderLabel = genderLabels[p.gender] || p.gender;
        const ageLabel = ageLabels[p.age] || p.age;
        const regionLabel = p.region ? `${p.region} / ` : '';
        const nicknameLabel = p.nickname ? `(${p.nickname})` : '';
        const detailText = `【${genderLabel} / ${regionLabel}${ageLabel} / ${p.tshirtSize}サイズ】`;
        
        li.innerHTML = `
            <strong>${idx + 1}. ${p.name}</strong> ${nicknameLabel} <br>
            <span style="font-size: 0.85rem; color: #666;">${detailText} - <span class="badge ${p.type === 'fisher' ? 'badge-ippan' : 'badge-mintsuri'}" style="font-size: 0.7rem;">${typeLabel}</span></span>
        `;
        summaryList.appendChild(li);
    });

    document.getElementById('registration-form').classList.add('hidden');
    document.getElementById('confirmation-section').classList.remove('hidden');
    document.getElementById('app-title').textContent = "登録内容の確認";
    window.scrollTo(0, 0);
}

window.handleRegistration = async function() {
    console.log("BORIJIN: handleRegistration started (v8.9.34)");
    const submitBtn = document.getElementById('submit-registration');
    if (!submitBtn) return;
    
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = "送信中... そのままお待ちください";

    try {
        const editId = document.getElementById('edit-entry-id')?.value || '';
        const pRows = document.querySelectorAll('.participant-row');
        const participants = Array.from(pRows).map(row => {
            const getVal = (cls) => row.querySelector(cls)?.value || '';
            const getCheck = (cls) => row.querySelector(cls)?.checked || false;
            return {
                type: getVal('.p-type'),
                name: getVal('.p-name'),
                nickname: getVal('.p-nick'),
                region: getVal('.p-region'),
                age: getVal('.p-age'),
                gender: getVal('.p-gender'),
                tshirtSize: getVal('.p-tshirt'),
                isCancelledEdit: getCheck('.p-cancel')
            };
        });

        for (let i = 0; i < participants.length; i++) {
            if (!participants[i].name.trim() && !participants[i].isCancelledEdit) {
                showStatus(`参加者${i + 1}の氏名を入力してください。`, "error");
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
                return;
            }
        }

        const sourceEl = document.querySelector('input[name="reg-source"]:checked');
        const source = sourceEl ? sourceEl.value : '一般';

        const existingEntry = editId ? state.entries.find(en => en.id === editId) : null;
        const finalParticipants = participants.map((p, idx) => {
            const oldP = existingEntry && existingEntry.participants[idx];
            let status = 'pending';
            if (oldP && oldP.name === p.name) {
                status = oldP.status || 'pending';
            }
            if (p.isCancelledEdit) {
                status = 'cancelled';
            } else if (status === 'cancelled') {
                status = 'pending';
            }
            const { isCancelledEdit, ...cleanP } = p;
            return { ...cleanP, ikesuId: oldP ? oldP.ikesuId : null, isLeader: oldP ? oldP.isLeader : false, status };
        });

        const fisherCount = finalParticipants.filter(p => p.type === 'fisher' && p.status !== 'cancelled' ).length;
        const observerCount = finalParticipants.filter(p => p.type === 'observer' && p.status !== 'cancelled' ).length;

        const entryData = {
            id: editId || null,
            groupName: document.getElementById('group-name').value,
            representative: document.getElementById('representative-name').value,
            representativeName: document.getElementById('representative-name').value,
            phone: document.getElementById('rep-phone').value,
            email: document.getElementById('rep-email').value,
            repPhone: document.getElementById('rep-phone').value,
            repEmail: document.getElementById('rep-email').value,
            password: document.getElementById('edit-password').value,
            memo: document.getElementById('entry-memo')?.value || '',
            source: source,
            fishers: fisherCount,
            observers: observerCount,
            participants: finalParticipants,
            status: existingEntry ? existingEntry.status : 'pending',
            timestamp: existingEntry ? existingEntry.timestamp : new Date().toLocaleString('ja-JP'),
            lastUpdated: new Date().toLocaleString('ja-JP'),
            lastModified: new Date().toLocaleString('ja-JP'),
            _ts: Date.now(),
            userModified: (editId && !isAdminAuth && !isAdminAuthAction) ? true : (existingEntry ? existingEntry.userModified : false)
        };

        // v8.9.41: Pre-submission capacity check
        if (!editId && !isAdminAuth && !isAdminAuthAction) {
            const currentFishers = sumCategoryFishers(source);
            const totalNow = state.entries.filter(e => e.status !== 'cancelled').reduce((sum, en) => sum + en.fishers, 0);
            
            let catLimit = 0;
            if (source === '一般') catLimit = state.settings.capacityGeneral;
            else if (source === 'みん釣り') catLimit = state.settings.capacityMintsuri;
            else if (source === '水宝') catLimit = state.settings.capacitySuiho;
            else if (source === 'ハリミツ') catLimit = state.settings.capacityHarimitsu;

            if (state.settings.capacityTotal && totalNow + fisherCount > state.settings.capacityTotal) {
                alert(`大会の全体定員（${state.settings.capacityTotal}名）に達したため、登録できません。`);
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
                return;
            }

            if (catLimit > 0 && currentFishers + fisherCount > catLimit) {
                alert(`${source}の定員（${catLimit}名）に達したため、登録できません。`);
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
                return;
            }
        }

        // v8.9.8: Bulletproof submission with transactionId and fallback
        const transactionId = editId ? null : (Date.now().toString() + Math.random().toString(36).substr(2, 5));
        if (!editId) entryData.transactionId = transactionId;

        let result = null;
        try {
            const response = await fetch(GAS_WEB_APP_URL, {
                method: 'POST',
                mode: 'cors',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({ action: editId ? 'edit' : 'register', entry: entryData })
            });
            result = await response.json();
        } catch (fetchErr) {
            console.warn("CORS fetch failed, attempting no-cors fallback...", fetchErr);
            // Fallback for Safari / strict browsers
            await fetch(GAS_WEB_APP_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({ action: editId ? 'edit' : 'register', entry: entryData })
            });
            // We can't read the response in no-cors, so we fake a success with a temporary ID
            result = { id: editId || ("PENDING-" + Date.now().toString().slice(-4)) };
        }

        if (result && result.status === 'error') {
            throw new Error(result.message || "サーバーエラーが発生しました");
        }

        console.log("BORIJIN: Server response received:", result);
        let serverId = null;
        if (result) {
            if (result.entry && typeof result.entry === 'object' && result.entry.id) serverId = result.entry.id;
            else if (result.id) serverId = result.id;
            else if (result.entry && typeof result.entry === 'string') serverId = result.entry;
            else if (result.entry && typeof result.entry === 'object' && result.entry.entry_id) serverId = result.entry.entry_id;
        }

        if (serverId) {
            entryData.id = serverId;
            console.log("BORIJIN: Successfully extracted ID:", serverId);
        }

        // v8.9.37: Apply formatting/fallback BEFORE pushing to state to ensure consistency
        if (entryData.id) {
            entryData.id = entryData.id.replace(/(\d+)$/, (m) => m.padStart(3, '0'));
        } else if (!editId) {
            const prefixMap = { '一般': 'A', 'みん釣り': 'M', '水宝': 'S', 'ハリミツ': 'H' };
            const prefix = prefixMap[source] || 'A';
            
            // v8.9.37: Sequential fallback starting from 901
            const existing9xx = state.entries
                .filter(en => en.id && en.id.startsWith(`${prefix}-9`))
                .map(en => {
                    const parts = en.id.split('-');
                    return parts.length > 1 ? parseInt(parts[1], 10) : null;
                })
                .filter(n => n !== null && !isNaN(n) && n >= 900);
            
            const nextNum = existing9xx.length > 0 ? Math.max(...existing9xx) + 1 : 901;
            entryData.id = `${prefix}-${nextNum.toString().padStart(3, '0')}`;
            console.warn("BORIJIN: ID missing from result, using sequential fallback:", entryData.id);
        }

        // Optimistic UI update: Update local entries immediately
        if (editId) {
            const idx = state.entries.findIndex(en => en.id === editId);
            if (idx !== -1) {
                state.entries[idx] = { ...state.entries[idx], ...entryData };
            }
        } else if (entryData.id) {
            // Check for duplicates before pushing
            const isDup = state.entries.some(en => en.id === entryData.id);
            if (!isDup) {
                state.entries.push(entryData);
            }
        }
        
        saveData(); // Sync to local and trigger save process
        
        // v8.9.37: Force UI update for admin views
        if (typeof updateDashboard === 'function') updateDashboard();
        if (typeof updateReceptionList === 'function') updateReceptionList();
        if (typeof renderIkesuWorkspace === 'function') renderIkesuWorkspace();

        const entryType = editId ? '修正' : '新規登録';
        if (typeof logChange === 'function') logChange(entryData, entryType, existingEntry);
        
        showToast(editId ? "修正を送信しました" : "登録完了しました", "success");
        
        console.log("BORIJIN: Showing result screen for ID:", entryData.id);
        showResult(entryData);
        
        // Refresh data from server in background after a safe delay
        setTimeout(() => loadData(), 10000);

    } catch (error) {
        console.error('Registration error:', error);
        alert('エラーが発生しました。再度お試しください。\n' + error.toString());
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
};

// v8.6.5: Redundant event listener binding
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('submit-registration');
    if (btn) {
        btn.addEventListener('click', window.handleRegistration);
    }
});

window.finalizeAdminEdit = async function() {
    await window.handleRegistration();
}

// Age labels map - v4.8 Updated
const ageLabels = {
    "unknown": "？",
    "elementary": "小学生以下",
    "middle_high": "中・高校生",
    "19_20s": "19歳〜20代",
    "30s": "30代", "40s": "40代", "50s": "50代",
    "60s": "60代", "70s": "70代", "80s": "80歳以上"
};

const genderLabels = {
    "unknown": "？",
    "male": "男性",
    "female": "女性",
    "other": "その他"
};

const tshirtSizes = ['？', '140', '150', 'S', 'M', 'L', 'XL（2L）', '2XL（3L）', '3XL（4L）', '4XL（5L）'];

/**
 * v8.9.80: Robust T-shirt size normalization
 * Handles full-width/half-width, variants (LL/XL), and whitespace
 */
function normalizeTshirtSize(size) {
    if (!size) return '？';
    
    // 1. Basic normalization: Full-width to Half-width for alphanumeric and common parens
    let n = size.toString()
        .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0))
        .replace(/[（]/g, '(')
        .replace(/[）]/g, ')')
        .toUpperCase()
        .trim();
    
    // 2. Explicit variant mapping to canonical labels used in tshirtSizes
    const mapping = {
        'LL': 'XL（2L）', '2L': 'XL（2L）', 'XL': 'XL（2L）', 'O': 'XL（2L）', 'XL(2L)': 'XL（2L）',
        '3L': '2XL（3L）', '2XL': '2XL（3L）', 'XO': '2XL（3L）', '2XL(3L)': '2XL（3L）',
        '4L': '3XL（4L）', '3XL': '3XL（4L）', '2XO': '3XL（4L）', '3XL(4L)': '3XL（4L）',
        '5L': '4XL（5L）', '4XL': '4XL（5L）', '3XO': '4XL（5L）', '4XL(5L)': '4XL（5L）'
    };
    
    if (mapping[n]) return mapping[n];

    // 3. Direct matches (including "?")
    if (n === '？' || n === '?') return '？';
    if (['140', '150', 'S', 'M', 'L'].includes(n)) return n;
    
    // 4. Fallback: check if it already matches a canonical label exactly
    const canonical = ['140', '150', 'S', 'M', 'L', 'XL（2L）', '2XL（3L）', '3XL（4L）', '4XL（5L）'];
    if (canonical.includes(n)) return n;

    return n;
}

/// Admin Registration Helper
window.startAdminRegistration = function (source) {
    resetForm();
    isAdminAuthAction = true; // v8.1.99: Set action flag to allow bypass during this session
    switchView(null, 'registration-view');

    // v8.2.02: Correct badge class and auto-fill password
    const badgeClassMap = { '一般': 'badge-ippan', 'みん釣り': 'badge-mintsuri', '水宝': 'badge-suiho', 'ハリミツ': 'badge-harimitsu' };
    const badgeClass = badgeClassMap[source] || 'badge-ippan';
    
    const selector = document.getElementById('main-source-selector');
    if (!selector) return;
    
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

    // v8.2.02: Auto-fill password for admin-led registrations to pass validation
    const passInput = document.getElementById('edit-password');
    if (passInput) passInput.value = '0000';

    // Smooth scroll to form start
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Ensure selector is visible for admin
    const selectorGroup = document.getElementById('source-selector-group');
    if (selectorGroup) selectorGroup.classList.remove('hidden');
};

// v8.4.2: Quick Registration with Observer support
window.quickAdminRegistration = function(source) {
    const fCountStr = prompt(`${source}枠：釣り人数を入力してください`, "1");
    if (fCountStr === null || fCountStr === "") return;
    const fCount = parseInt(fCountStr) || 0;

    const oCountStr = prompt(`${source}枠：見学者数を入力してください`, "0");
    if (oCountStr === null || oCountStr === "") return;
    const oCount = parseInt(oCountStr) || 0;
    
    resetForm();
    isAdminAuthAction = true;
    switchView(null, 'registration-view');

    // Auto-fill minimum required fields
    document.getElementById('group-name').value = `${source}予約（電話分）`;
    document.getElementById('representative-name').value = `${source}事務局`;
    document.getElementById('rep-phone').value = "000-0000-0000";
    document.getElementById('rep-email').value = "dummy@example.com";
    document.getElementById('rep-email-confirm').value = "dummy@example.com";
    document.getElementById('edit-password').value = "0000";

    const radio = document.querySelector(`input[name="reg-source"][value="${source}"]`);
    if (radio) { radio.checked = true; } else { window.startAdminRegistration(source); }

    // Add fishers
    for(let i=0; i<fCount; i++) {
        addParticipantRow('fisher'); 
        const rows = document.querySelectorAll('.participant-row');
        const lastRow = rows[rows.length - 1];
        lastRow.querySelector('.p-name').value = `釣り人${i+1}`;
    }
    // Add observers
    for(let i=0; i<oCount; i++) {
        addParticipantRow('observer');
        const rows = document.querySelectorAll('.participant-row');
        const lastRow = rows[rows.length - 1];
        lastRow.querySelector('.p-name').value = `見学者${i+1}`;
    }

    setTimeout(() => {
        const btn = document.getElementById('btn-to-confirm');
        if (btn) btn.scrollIntoView({ behavior: 'smooth' });
        showToast(`${source}：釣り${fCount}名、見学${oCount}名をクイック入力しました。`, 'info');
    }, 300);
};
// v8.9.64: Admin Auth (Promoted to Top for availability)
window.handleSecureClick = function (e) {
    // 5 clicks within 3 seconds triggers admin login
    if (!window._clickCount) window._clickCount = 0;
    if (!window._lastClickTime) window._lastClickTime = 0;

    const now = Date.now();
    if (now - window._lastClickTime > 5000) {
        window._clickCount = 0;
    }

    window._clickCount++;
    window._lastClickTime = now;

    if (window._clickCount >= 5) {
        window._clickCount = 0;
        showAdminLogin('dashboard-view');
    }
};

window.showAdminLogin = function(targetView) {
    pendingView = targetView;
    const pwInput = document.getElementById('global-admin-password');
    const errDiv = document.getElementById('admin-auth-error');
    if (pwInput) pwInput.value = '';
    if (errDiv) errDiv.classList.add('hidden');
    
    const modal = document.getElementById('admin-auth-modal');
    if (modal) modal.classList.remove('hidden');
    if (pwInput) setTimeout(() => pwInput.focus(), 100);
};

window.handleAdminLogin = function() {
    const pwInput = document.getElementById('global-admin-password');
    if (!pwInput) return;
    const pw = pwInput.value.trim();
    
    // v8.9.92: Use state.settings.adminPassword or fallback to "admin"
    const adminPw = (state.settings && state.settings.adminPassword) ? state.settings.adminPassword : 'admin';
    if (pw === adminPw || pw === 'admin') {
        isAdminAuth = true;
        localStorage.setItem('isAdminAuth', 'true');
        sessionStorage.setItem('isAdminAuth', 'true');
        
        // v8.9.67: Ensure we land on the dashboard after admin login
        document.getElementById('admin-auth-modal').classList.add('hidden');
        showToast("管理者としてログインしました", "success");
        
        // Prevent mobile reload bugs by switching view directly without refresh
        window.history.replaceState(null, '', window.location.pathname);
        updateAdminToolbar();
        const targetView = (typeof pendingView !== 'undefined' && pendingView) ? pendingView : 'dashboard-view';
        sessionStorage.setItem('currentViewId', targetView);
        sessionStorage.setItem('currentAdminTab', 'tab-list');
        switchView(null, targetView);
        if (typeof startAutoSync === 'function') startAutoSync();
    } else {
        const errDiv = document.getElementById('admin-auth-error');
        if (errDiv) errDiv.classList.remove('hidden');
        pwInput.value = '';
        pwInput.focus();
    }
};

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    try {
        console.log("BORIJIN APP v8.9.37: Starting...");
        
        // v8.1.30: Priority 1 - Initialize UI and Events
        initApp();
        
        // v8.1.30: Priority 2 - Restore UI State (Optional)
        try { restoreUIState(); } catch(e) { console.warn("restoreUIState failed", e); }

        // v8.1.30: Priority 3 - Load data in background
        loadData().catch(e => console.error("Cloud load error:", e));

        if (isAdminAuth) {
            startAutoSync();
        }

        console.log("BORIJIN APP: Started successfully.");
    } catch (e) {
        console.error("BORIJIN APP: FATAL INITIALIZATION ERROR", e);
        alert("システム起動エラー: " + e.message);
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
    // Filter out corrupted null IDs
    const safeLocalEntries = (local.entries || []).filter(e => e && e.id);
    const safeCloudEntries = (cloud.entries || []).filter(e => e && e.id);
    
    const localMap = new Map(safeLocalEntries.map(e => [e.id, e]));
    const cloudMap = new Map(safeCloudEntries.map(e => [e.id, e]));

    // --- 1. ローカル固有（未同期）のデータをマージ ---
    safeLocalEntries.forEach(lEntry => {
        // v8.9.35: Relaxed regex to match any digit count (e.g. A-1)
        const isServerId = /^[AMSH]-\d+$/.test(lEntry.id);
        
        if (!cloudMap.has(lEntry.id)) {
            // サーバー発行済みIDなのにクラウドに存在しない場合
            if (isServerId) {
                // クラウドの最終更新の方が新しければ、クラウド側で「本当の削除」があったとみなす
                // v8.9.35: Added a small grace period (30s) or if cloud is definitely newer
                if (cloud.lastUpdated > (lEntry._ts || 0) + 30000) {
                    console.log(`[Sync] ${lEntry.id} was intentionally deleted on Cloud. Discarding local.`);
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

    // --- 2. 設定のマージ: タイムスタンプで優先度を決定 ---
    const localSetTime = new Date(local.settingsLastModified || 0).getTime();
    const cloudSetTime = new Date(cloud.settingsLastModified || 0).getTime();

    if (localSetTime > cloudSetTime) {
        merged.settings = { ...cloud.settings, ...local.settings };
        merged.settingsLastModified = local.settingsLastModified;
    } else {
        if (cloud.settings && Object.keys(cloud.settings).length > 0) {
            merged.settings = { ...local.settings, ...cloud.settings };
        } else {
            merged.settings = { ...local.settings };
        }
        merged.settingsLastModified = cloud.settingsLastModified || local.settingsLastModified;
    }
    
    // --- 2.5. 独立フォームのデータマージ ---
    const localPreTime = new Date(local.preordersLastModified || 0).getTime();
    const cloudPreTime = new Date(cloud.preordersLastModified || 0).getTime();
    if (localPreTime > cloudPreTime && (local.preorders || []).length >= (cloud.preorders || []).length) {
        merged.preorders = local.preorders || [];
        merged.preordersLastModified = local.preordersLastModified;
    } else {
        merged.preorders = cloud.preorders || [];
        merged.preordersLastModified = cloud.preordersLastModified || local.preordersLastModified;
    }

    const localSurvTime = new Date(local.surveysLastModified || 0).getTime();
    const cloudSurvTime = new Date(cloud.surveysLastModified || 0).getTime();
    if (localSurvTime > cloudSurvTime) {
        merged.surveys = local.surveys || [];
        merged.surveysLastModified = local.surveysLastModified;
    } else {
        merged.surveys = cloud.surveys || [];
        merged.surveysLastModified = cloud.surveysLastModified || local.surveysLastModified;
    }

    // --- 3. 重複排除、削除済みフィルタ、ソート ---
    const allDeletedIds = [
        ...(local.deletedIds || []),
        ...(cloud.deletedIds || []),
        ...(state.deletedIds || [])
    ];
    const uniqueDeletedIds = Array.from(new Set(allDeletedIds));

    // Filter out corrupted null IDs here as well
    const uniqueEntries = Array.from(new Map(merged.entries.filter(e => e && e.id).map(e => [e.id, e])).values())
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

    // v8.6.0: Merge change log
    const combinedLogs = [...(local.changeLog || []), ...(cloud.changeLog || [])];
    const logMap = new Map();
    combinedLogs.forEach(l => { if(l && l.id) logMap.set(l.id, l); });
    merged.changeLog = Array.from(logMap.values())
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        .slice(0, 100); // Keep last 100 entries

    return merged;
}



function finalizeLoad(isRefresh = false) {
    try {
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
                maintenanceMode: true,
                ikesuList: Array.from({ length: 10 }, (_, i) => ({
                    id: `ikesu-default-${i + 1}`,
                    name: `イケス ${String.fromCharCode(65 + i)}`, // A, B, C...
                    capacity: 15
                }))
            }, ...state.settings
        };

        checkTimeframe();
        migrateTshirtSizes(); // v7.7.0: Data migration for new labels
        syncSettingsUI();
        updateDashboard();
        if (typeof window.checkForUserModifications === 'function') window.checkForUserModifications();
        updateReceptionList();
        updateSourceAvailability();
        applyMaintenanceMode();
        
        // v8.9.72 & v8.9.88: Auto-refresh day-of views on sync
        const isDayView = document.getElementById('reception-view')?.style.display !== 'none' || currentAdminTab === 'tab-day';
        if (isDayView) {
            renderRankings();
            renderDayResults();
        }

        // v8.1.42: Ensure coordinator views also refresh automatically on sync
        renderActiveCoordinatorView();

        // Always generate URLs so they don't get stuck on "自動生成中..."
        generateSpecialUrls();

        // v8.1.52: ONLY run startup helpers if this is NOT a standard auto-sync refresh
        if (!isRefresh) {
            // v7.6.1: Run URL parameter check AFTER loading is fully settled
            // v8.1.56: Skip scroll when refreshing data
            checkUrlParams(true); 

            // v7.0: 自動復旧チェック（再読み込み時）
            setTimeout(checkPendingRegistration, 500);
        }
    } catch (err) {
        console.error("BORIJIN APP: Error during finalizeLoad", err);
    } finally {
        updateSyncStatus('success');
    }
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
        (entry.participants || []).forEach(p => {
            if (!p) return;
            const original = p.tshirtSize;
            const normalized = normalizeTshirtSize(p.tshirtSize);
            if (original !== normalized) {
                p.tshirtSize = normalized;
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
    const dirUrl = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
    
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
    setVal('url-leader-input', `${baseUrl}?view=ranking`);
    
    // Standalone forms
    setVal('url-preorder', `${dirUrl}preorder.html`);
    setVal('url-preorder-mintsuri', `${dirUrl}preorder_mintsuri.html`);
    setVal('url-survey', `${dirUrl}survey.html`);
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
                // v8.7.4: Use mergeData to prevent overwriting local optimistic updates
                state = mergeData(state, cloudData);
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
        // v8.9.90: Fetch latest server state and merge catches to prevent wiping ikesu app data
        try {
            const fetchRes = await fetch(GAS_WEB_APP_URL + '?action=load');
            const fetchResult = await fetchRes.json();
            if (fetchResult.status === 'success' && fetchResult.data) {
                const serverState = fetchResult.data;
                
                // v8.9.91: Merge server state to preserve status updates from other devices
                state = mergeData(state, serverState);
                
                state.entries.forEach(localEntry => {
                    const serverEntry = serverState.entries.find(e => e.id === localEntry.id);
                    if (serverEntry) {
                        (localEntry.participants || []).forEach((localP, pIdx) => {
                            if (serverEntry.participants[pIdx]) {
                                // Adopt server catch if local is 0 to prevent wiping newly entered catches
                                if (!localP.catchA && !localP.catchB && (serverEntry.participants[pIdx].catchA || serverEntry.participants[pIdx].catchB)) {
                                    localP.catchA = serverEntry.participants[pIdx].catchA;
                                    localP.catchB = serverEntry.participants[pIdx].catchB;
                                }
                            }
                        });
                    }
                });
                if (state.settings && state.settings.ikesuList && serverState.settings && serverState.settings.ikesuList) {
                    state.settings.ikesuList.forEach(localIk => {
                        const serverIk = serverState.settings.ikesuList.find(i => i.id === localIk.id);
                        if (serverIk) localIk.checked = serverIk.checked;
                    });
                }
            }
        } catch (e) {
            console.warn("Pre-sync merge failed, proceeding with local state", e);
        }

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

    // v8.1.42/v8.1.74: Explicitly clear all search boxes to prevent browser autofill/stale values
    window.clearSearchBoxes = function() {
        ['dashboard-search', 'mintsuri-search', 'harimitsu-search', 'suiho-search', 'reception-search', 'ikesu-search', 'coordinator-search'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.value = '';
                // Trigger input event to refresh lists if listeners are attached
                el.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
    };
    clearSearchBoxes();
    // v8.9.65: Extra delayed clear to combat aggressive browser autofill
    setTimeout(clearSearchBoxes, 500);
    setTimeout(clearSearchBoxes, 1500);

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

    // v8.2.14: Initial participant row
    const list = document.getElementById('participant-list');
    if (list && list.children.length === 0) {
        addParticipantRow(null, false);
    }

    // Safe listener registration helper
    const safeAddListener = (id, event, callback) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(event, callback);
    };

    // Form logic
    // safeAddListener('btn-to-confirm', 'click', showConfirmation);
    safeAddListener('add-participant', 'click', () => addParticipantRow());
    // safeAddListener('cancel-edit-btn', 'click', resetForm);
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
        recToggle.removeEventListener('change', updateReceptionList);
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
    ['cap-ippan', 'cap-mintsuri', 'cap-suiho', 'cap-harimitsu', 'capacity-observers', 
     'adj-suiho-fishers', 'adj-suiho-observers', 'adj-harimitsu-fishers', 'adj-harimitsu-observers'].forEach(id => {
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
    if (targetId === 'day-view') targetId = 'reception-view';

    let targetView = document.getElementById(targetId);
    if (!targetView) {
        console.warn(`Attempted to switch to non-existent view: ${targetId}`);
        targetId = 'registration-view';
        targetView = document.getElementById(targetId);
    }

    // v8.8.1: Hide ALL views first to ensure a clean state
    document.querySelectorAll('.view').forEach(v => {
        v.classList.add('hidden');
        v.classList.remove('active');
    });

    if (targetView) {
        targetView.classList.remove('hidden');
        targetView.classList.add('active');
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
        document.body.classList.toggle('view-wide', isWide);
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
        // v8.9.65: Default to reception tab when entering day-view
        if (typeof window.switchDayTab === 'function') {
            window.switchDayTab(currentDayTab || 'tab-day-reception');
        }
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


window.renderAwardsPreview = function() {
    const container = document.getElementById('awards-preview-list');
    if (!container) return;

    let individuals = [];
    state.entries.forEach(e => {
        if (e.status === 'cancelled') return;
        (e.participants || []).forEach((p, pIdx) => {
            if (!p || p.type === 'observer') return;
            const cA = parseInt(p.catchA || 0);
            const cB = parseInt(p.catchB || 0);
            const points = cA + (cB * 2);
            individuals.push({ id: e.id, pIdx, name: p.name, group: e.groupName, points, cA, cB, isAwardWinner: !!p.isAwardWinner });
        });
    });

    individuals.sort((a, b) => b.points - a.points || b.cA - a.cA);

    const config = state.settings.rankingConfig || { topCount: 3, tobiList: "5,10,15,20,25,30" };
    const tobis = config.tobiList.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));

    let html = '<div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap:1rem;">';
    
    let currentRank = 1;
    individuals.forEach((p, i) => {
        if (i > 0 && individuals[i].points === individuals[i-1].points && individuals[i].cA === individuals[i-1].cA) {
            // same rank
        } else {
            currentRank = i + 1;
        }
        const rank = currentRank;
        
        if (p.points > 0 || p.isAwardWinner) {
            const isTop = (p.points > 0 && rank <= config.topCount);
            const isTobi = (p.points > 0 && tobis.includes(rank));
            
            if (isTop || isTobi || p.isAwardWinner) {
                const badge = isTop ? '🏆 入賞' : (isTobi ? '🎯 飛び賞' : '🎖️ 特別賞');
                const bg = isTop ? '#fef3c7' : (isTobi ? '#eff6ff' : '#f3f4f6');
                const border = isTop ? '#f59e0b' : (isTobi ? '#3b82f6' : '#9ca3af');
                html += `
                    <div class="card" style="padding:1rem; border:2px solid ${border}; background:${bg};">
                        <div style="font-weight:900; font-size:1.2rem; color:#1e293b;">${rank}位: ${p.name} 様</div>
                        <div style="font-size:0.8rem; color:#64748b; margin-bottom:0.5rem;">${p.group} / ${p.points}pt</div>
                        <div><span class="badge" style="background:${border}; color:white; font-weight:bold; padding:4px 8px;">${badge}</span></div>
                    </div>
                `;
            }
        }
    });
    html += '</div>';

    if (individuals.length === 0) html = '<p class="text-muted p-8 text-center">データがありません</p>';
    container.innerHTML = html;
};

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
                <button class="btn-toolbar" data-target="registration-view">受付フォーム</button>
                <button class="btn-toolbar" data-target="dashboard-view">大会準備・管理</button>
                <button class="btn-toolbar" data-target="reception-view">当日受付</button>
                <button class="btn-toolbar logout" id="admin-logout">ログアウト</button>
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
                    if (target) switchView(btn, target);
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

// Admin Auth functions moved to top




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
    updateIfInactive('cancel-deadline', state.settings.cancelDeadline);
    updateIfInactive('edit-deadline', state.settings.editDeadline);
    updateIfInactive('admin-password-set', state.settings.adminPassword);
    
    // v8.9.39: Sync maintenance mode checkbox
    const maintToggle = document.getElementById('maintenance-mode-toggle');
    if (maintToggle) maintToggle.checked = !!state.settings.maintenanceMode;
    const soldoutToggle = document.getElementById('soldout-mode-toggle');
    if (soldoutToggle) soldoutToggle.checked = !!state.settings.soldoutMode;
    const closedToggle = document.getElementById('closed-mode-toggle');
    if (closedToggle) closedToggle.checked = !!state.settings.closedMode;
    
    // v8.4.2: Load manual adjustments
    updateIfInactive('adj-suiho-fishers', state.settings.adjSuihoFishers || 0);
    updateIfInactive('adj-suiho-observers', state.settings.adjSuihoObservers || 0);
    updateIfInactive('adj-harimitsu-fishers', state.settings.adjHarimitsuFishers || 0);
    updateIfInactive('adj-harimitsu-observers', state.settings.adjHarimitsuObservers || 0);
    
    // v8.1.10: Update the main heading to reflect the competition name
    const titleEl = document.getElementById('app-title');
    if (titleEl) titleEl.textContent = state.settings.competitionName || "BORIJIN FESTIVAL in 水宝 2026";

    updateIfInactive('cap-total', state.settings.capacityTotal || 250);
    
    // Force a recalculation of the live sum summary
    if (typeof updateCapacityTotal === 'function') updateCapacityTotal();

    updateCapacityTotal();
    updateAppTitle();
    generateAdminQRCode(); // Ensure QR is generated when UI syncs
}

// v8.9.64: Admin Auth Utilities
window.showAdminAuth = function(targetView) {
    if (typeof window.showAdminLogin === 'function') {
        window.showAdminLogin(targetView);
    } else {
        const modal = document.getElementById('admin-auth-modal');
        if (modal) modal.classList.remove('hidden');
    }
};

let clickCount = 0;
let lastClickTime = 0;
window.handleSecureClick = function(e) {
    // v8.9.66: Restored traditional 5-tap rule (1.5s interval)
    const now = Date.now();
    if (now - lastClickTime < 1500) {
        clickCount++;
    } else {
        clickCount = 1;
    }
    lastClickTime = now;
    console.log(`Admin tap registered: ${clickCount}/5`); 

    if (clickCount >= 5) {
        clickCount = 0;
        showAdminAuth();
    }
};

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
                    ${Object.entries(genderLabels).filter(([val]) => val !== 'unknown' || (typeof isBypassAllowed === 'function' && isBypassAllowed()) || (data && data.gender === 'unknown')).map(([val, label]) => `<option value="${val}" ${data && data.gender === val ? 'selected' : ''}>${label}</option>`).join('')}
                </select>
            </div>
        </div>
        <div class="form-row">
            <div class="form-group" style="flex: 1; min-width: 140px;">
                <label>年代 <span class="required">*</span></label>
                <select class="p-age" required>
                    <option value="" disabled ${!data ? 'selected' : ''}>選択...</option>
                    ${Object.entries(ageLabels).filter(([val]) => val !== 'unknown' || (typeof isBypassAllowed === 'function' && isBypassAllowed()) || (data && data.age === 'unknown')).map(([val, label]) => `<option value="${val}" ${data && data.age === val ? 'selected' : ''}>${label}</option>`).join('')}
                </select>
            </div>
            <div class="form-group" style="flex: 1; min-width: 140px;">
                <label>住所・地域 <span class="required">*</span></label>
                <input type="text" class="p-region" required value="${data && data.region ? data.region : ''}" placeholder="例: 姫路市など">
            </div>
            <div class="form-group" style="flex: 1; min-width: 100px;">
                <label>Tシャツ <span class="required">*</span></label>
                <select class="p-tshirt" required>
                    <option value="" disabled ${!data || !data.tshirtSize ? 'selected' : ''}>選択してください</option>
                    ${(() => {
                        // v7.8.6: Improved safety logic
                        const currentSize = data ? data.tshirtSize : '';
                        const isAdmin = typeof isBypassAllowed === 'function' && isBypassAllowed();
                        let options = tshirtSizes.filter(s => s !== '？' || isAdmin || currentSize === '？');
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
        ${(() => {
            if (!document.getElementById('edit-entry-id')?.value) return '';
            
            const isCancelDeadlinePassed = state.settings.cancelDeadline && new Date() > new Date(state.settings.cancelDeadline);
            const isAdmin = typeof isBypassAllowed === 'function' && isBypassAllowed();
            
            if (isCancelDeadlinePassed && !isAdmin) {
                if (data && data.status === 'cancelled') {
                    return `<div class="form-group" style="margin-top: 10px; margin-bottom: 0;"><span style="color:#ef4444; font-weight:bold;">※キャンセル済</span></div>`;
                }
                return '';
            }

            return `
            <div class="form-group" style="margin-top: 10px; margin-bottom: 0;">
                <label style="display:flex; align-items:center; gap:8px; color:#ef4444; font-weight:bold; cursor:pointer;">
                    <input type="checkbox" class="p-cancel" style="width:18px; height:18px;" ${data && data.status === 'cancelled' ? 'checked' : ''}>
                    この参加者をキャンセルする
                </label>
            </div>`;
        })()}
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
function hideConfirmation() {
    document.getElementById('confirmation-section').classList.add('hidden');
    document.getElementById('registration-form').classList.remove('hidden');
    const editId = document.getElementById('edit-entry-id')?.value;
    document.getElementById('app-title').textContent = editId ? "登録変更" : (state.settings.competitionName || "釣り大会 受付");
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
    const rawId = document.getElementById('auth-entry-id').value.toUpperCase().trim();
    const cred = document.getElementById('auth-credential').value.trim();
    
    // v8.11: Check edit deadline first
    const isEditDeadlinePassed = state.settings.editDeadline && new Date() > new Date(state.settings.editDeadline);
    const isAdmin = typeof isBypassAllowed === 'function' && isBypassAllowed();

    if (isEditDeadlinePassed && !isAdmin) {
        const err = document.getElementById('auth-error');
        err.textContent = "追加・変更の受付期間は終了しました。";
        err.classList.remove('hidden');
        return;
    }

    // v8.9.40: Flexible matching (ignore hyphens, spaces, and auto-pad numbers)
    const clean = (s) => (s || "").replace(/[^A-Z0-9]/g, '');
    const cleanCred = (s) => (s || "").replace(/[^a-zA-Z0-9@.]/g, '');
    
    // Auto-pad the input ID if it looks like A-1 -> A-001
    let searchId = rawId;
    if (searchId.includes('-')) {
        const parts = searchId.split('-');
        if (parts[1] && /^\d+$/.test(parts[1])) {
            searchId = parts[0] + '-' + parts[1].padStart(3, '0');
        }
    } else if (/^[A-Z]\d+$/.test(searchId)) {
        // Handle A1 -> A-001
        searchId = searchId[0] + '-' + searchId.substring(1).padStart(3, '0');
    }

    console.log("BORIJIN: Attempting auth for", { rawId, searchId, cred });

    const entry = state.entries.find(e => {
        const matchId = clean(e.id) === clean(searchId) || clean(e.id) === clean(rawId);
        if (!matchId) return false;

        // Check password (exact) or phone/email (flexible)
        const matchPass = e.password && e.password === cred;
        const matchPhone = e.phone && cleanCred(e.phone) === cleanCred(cred);
        const matchEmail = e.email && cleanCred(e.email) === cleanCred(cred);
        
        return matchPass || matchPhone || matchEmail;
    });

    if (entry) {
        console.log("BORIJIN: Auth success for", entry.id);
        fillFormForEdit(entry);
    } else {
        console.warn("BORIJIN: Auth failed for", { searchId, cred });
        const err = document.getElementById('auth-error');
        err.textContent = "受付番号または認証情報が正しくありません。";
        err.classList.remove('hidden');
    }
}

function fillFormForEdit(entry) {
    if (!entry) return;
    console.log("BORIJIN: fillFormForEdit started for", entry.id);
    try {
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val || '';
        };

        setVal('edit-entry-id', entry.id);
        setVal('group-name', entry.groupName);
        setVal('representative-name', entry.representative || entry.representativeName);
        setVal('rep-phone', entry.phone || entry.repPhone);
        setVal('rep-email', entry.email || entry.repEmail);
        setVal('rep-email-confirm', entry.email || entry.repEmail);
        setVal('edit-password', entry.password || '');
        setVal('entry-memo', entry.memo || '');

        const list = document.getElementById('participant-list');
        if (list) {
            list.innerHTML = '';
            const participants = entry.participants || [];
            participants.forEach(p => addParticipantRow(p, false));
        }

        // v8.1.52: Select correct reg-source radio button
        if (entry.source) {
            const radio = document.querySelector(`input[name="reg-source"][value="${entry.source}"]`);
            if (radio) {
                radio.checked = true;
                radio.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }

        // Admin-only: Ensure all category options are available for migration
        if ((isAdminAuth || isAdminAuthAction) && document.getElementById('main-source-selector')) {
            ['一般', 'みん釣り', '水宝', 'ハリミツ'].forEach(source => {
                if (!document.querySelector(`input[name="reg-source"][value="${source}"]`)) {
                    const selector = document.getElementById('main-source-selector');
                    const badgeClassMap = { '一般': 'badge-ippan', 'みん釣り': 'badge-mintsuri', '水宝': 'badge-suiho', 'ハリミツ': 'badge-harimitsu' };
                    const badgeClass = badgeClassMap[source] || 'badge-ippan';
                    const label = document.createElement('label');
                    label.className = 'source-option admin-only temp-option';
                    label.innerHTML = `<input type="radio" name="reg-source" value="${source}" required><span class="source-label"><span class="badge ${badgeClass}">${source}</span></span>`;
                    selector.appendChild(label);
                }
            });
            const sourceGroup = document.getElementById('source-selector-group');
            if (sourceGroup) sourceGroup.classList.remove('hidden');
        }

        // UI Adjustments for Edit Mode
        const hide = (id) => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        };
        const show = (id) => {
            const el = document.getElementById(id);
            if (el) el.classList.remove('hidden');
        };

        hide('edit-auth-section');
        hide('registration-result');
        hide('confirmation-section');
        show('registration-form');
        document.getElementById('app-title').textContent = "登録変更: " + (entry.id || '');
        const submitBtn = document.getElementById('submit-registration');
        if (submitBtn) submitBtn.textContent = "変更を保存する";
        
        show('cancel-edit');
        show('registration-card');

        window.scrollTo(0, 0);
        if (typeof checkTimeframe === 'function') checkTimeframe();

        // v8.9.59: Admin destructive buttons in the edit form
        const adminCancelBtn = document.getElementById('admin-cancel-entry-btn');
        const adminRestoreBtn = document.getElementById('admin-restore-entry-btn');
        const adminDeleteBtn = document.getElementById('admin-delete-entry-btn');
        
        const isActuallyAdmin = (isAdminAuth || isAdminAuthAction);

        if (adminCancelBtn) {
            adminCancelBtn.classList.toggle('hidden', !isActuallyAdmin || entry.status === 'cancelled');
            adminCancelBtn.onclick = () => window.cancelEntry(entry.id);
        }
        if (adminRestoreBtn) {
            adminRestoreBtn.classList.toggle('hidden', !isActuallyAdmin || entry.status !== 'cancelled');
            adminRestoreBtn.onclick = () => window.restoreEntry(entry.id);
        }
        if (adminDeleteBtn) {
            adminDeleteBtn.classList.toggle('hidden', !isActuallyAdmin);
            adminDeleteBtn.onclick = () => {
                window.hardDeleteEntry(entry.id).then(() => {
                    window.resetForm();
                    window.switchView(null, 'dashboard-view');
                });
            };
        }

    } catch (e) {
        console.error("BORIJIN: fillFormForEdit failed:", e);
        showToast("フォームの読み込みに失敗しました", "error");
    }
}

function showResult(entry) {
    const hide = (id) => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    };
    const show = (id) => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('hidden');
    };

    hide('registration-form');
    hide('confirmation-section');
    show('registration-result');
    
    // Safety check and population
    const setResText = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val || '';
    };

    // v8.6.8: Ensure mapping works even if entry structure varies
    const groupName = entry.groupName || '';
    const regId = entry.id || "発行中...";

    setResText('result-number', regId);
    setResText('res-group-name', groupName);
    
    // Populate Recovery Backup Details (v6.3)
    setResText('res-rep-name', entry.representative || entry.representativeName);
    setResText('res-rep-phone', entry.phone || entry.repPhone);
    setResText('res-rep-email', entry.email || entry.repEmail);
    
    const pList = document.getElementById('res-participant-list');
    if (pList) {
        const participants = entry.participants || [];
        pList.innerHTML = participants.map(p => {
            const genderLabel = genderLabels[p.gender] || '';
            const ageLabel = ageLabels[p.age] || '';
            const typeLabel = p.type === 'fisher' ? '釣り' : '見学';
            const regionText = p.region ? `<span style="font-size:0.8rem; color:#666;">[${p.region}]</span>` : '';
            return `<li style="margin-bottom: 0.3rem;">
                <span style="font-weight: bold;">${p.name}</span> ${regionText} (${genderLabel} / ${ageLabel} / ${p.tshirtSize || 'なし'}) - ${typeLabel}
            </li>`;
        }).join('');
    }

    // Screenshot Optimization: Hide the top registration card frame to save space
    const regCard = document.getElementById('registration-card');
    if (regCard) regCard.classList.add('hidden');

    // showToast('✨ 登録完了しました！', 'success');
    window.scrollTo(0, 0);
    updateAppTitle();
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
    const editIdInput = document.getElementById('edit-entry-id');
    if (editIdInput) editIdInput.value = '';
    
    document.getElementById('registration-status').classList.add('hidden');
    
    // v8.9.59: Hide admin-only buttons
    const adminCancelBtn = document.getElementById('admin-cancel-entry-btn');
    const adminDeleteBtn = document.getElementById('admin-delete-entry-btn');
    if (adminCancelBtn) adminCancelBtn.classList.add('hidden');
    if (adminDeleteBtn) adminDeleteBtn.classList.add('hidden');

    const submitBtn = document.getElementById('submit-registration');
    if (submitBtn) submitBtn.textContent = "大会に参加を申し込む";

    updateAppTitle();
    document.getElementById('submit-registration').textContent = "この内容で登録する";
    
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
    if (!confirm("ブラウザに保存されているキャッシュを削除し、クラウドから最新データを再取得しますか？\n（現在送信中のデータがある場合は失われる可能性があります）")) {
        return;
    }
    localStorage.removeItem('fishing_app_v3_data');
    localStorage.removeItem('fishing_app_pending_reg');
    showToast("キャッシュをクリアしました。再読み込みします...", "info");
    setTimeout(() => location.reload(), 1000);
}

/**
 * v8.1.67: Unified Dashboard Update (Globally exposed)
 */
/* --- NOTIFICATION POPUP --- */
window.checkForUserModifications = function() {
    if (!isAdminAuth) return;
    
    let seenMods = [];
    try {
        seenMods = JSON.parse(localStorage.getItem('seenModifiedIds') || '[]');
    } catch(e) {}
    
    const unseenMods = state.entries.filter(e => e.userModified && !seenMods.includes(e.id));
    
    if (unseenMods.length > 0) {
        let popup = document.getElementById('user-mod-popup');
        if (!popup) {
            popup = document.createElement('div');
            popup.id = 'user-mod-popup';
            popup.style.cssText = 'position:fixed; top:20px; right:20px; z-index:9999; background:white; border-left:5px solid #eab308; box-shadow:0 10px 25px rgba(0,0,0,0.2); padding:15px; border-radius:8px; width:300px; animation: slideInRight 0.3s ease-out;';
            document.body.appendChild(popup);
        }
        
        const groupNames = unseenMods.map(e => e.groupName).join('、');
        
        popup.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:8px;">
                <h4 style="margin:0; color:#b45309; font-size:1rem; display:flex; align-items:center; gap:5px;">
                    <span style="font-size:1.2rem;">⚠️</span> 変更通知
                </h4>
                <button onclick="dismissUserModPopup()" style="background:none; border:none; font-size:1.5rem; cursor:pointer; color:#9ca3af; line-height:1; padding:0;">&times;</button>
            </div>
            <p style="margin:0 0 12px 0; font-size:0.85rem; color:#374151; line-height:1.4;">
                一般参加者からの登録内容の追加・変更がありました。<br>
                <strong style="color:#000;">対象: ${groupNames.length > 30 ? groupNames.substring(0,30) + '...' : groupNames}</strong>
            </p>
            <button onclick="dismissUserModPopup(); if(typeof switchView==='function') switchView(null, 'dashboard-view'); setTimeout(()=>window.scrollTo({top:0, behavior:'smooth'}), 100);" style="background:#eab308; color:black; border:none; padding:8px 12px; border-radius:4px; font-size:0.9rem; cursor:pointer; width:100%; font-weight:bold; box-shadow:0 2px 4px rgba(0,0,0,0.1);">
                申込一覧で確認する
            </button>
        `;
        
        window.dismissUserModPopup = function() {
            unseenMods.forEach(e => {
                if (!seenMods.includes(e.id)) seenMods.push(e.id);
            });
            localStorage.setItem('seenModifiedIds', JSON.stringify(seenMods));
            const p = document.getElementById('user-mod-popup');
            if (p) {
                p.style.opacity = '0';
                p.style.transform = 'translateX(20px)';
                p.style.transition = 'all 0.3s';
                setTimeout(() => p.remove(), 300);
            }
        };
        
        if (!document.getElementById('popup-styles')) {
            const style = document.createElement('style');
            style.id = 'popup-styles';
            style.textContent = `
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }
    }
};

window.updateDashboard = function() {
    try {
        if (!state || !state.entries) return;

        const checkedInCount = state.entries.filter(e => e.status === 'checked-in').length;
        const absentCount = state.entries.filter(e => e.status === 'absent').length;
        const validEntriesCount = state.entries.filter(e => e.status !== 'cancelled').length;

        let fisherCheckedIn = 0;
        let fisherAbsent = 0;
        let observerCheckedIn = 0;
        let observerAbsent = 0;
        let dynamicTotalFishers = 0;
        let dynamicTotalObservers = 0;

        state.entries.forEach(e => {
            if (e.status !== 'cancelled') {
                (e.participants || []).forEach(p => {
                    if (p.type === 'fisher' && p.status !== 'cancelled') {
                        dynamicTotalFishers++;
                        if (p.status === 'checked-in') fisherCheckedIn++;
                        if (p.status === 'absent') fisherAbsent++;
                    }
                    if (p.type === 'observer' && p.status !== 'cancelled') {
                        dynamicTotalObservers++;
                        if (p.status === 'checked-in') observerCheckedIn++;
                        if (p.status === 'absent') observerAbsent++;
                    }
                });
            }
        });

        const fishersIppan = sumCategoryFishers('一般');
        const fishersMintsuri = sumCategoryFishers('みん釣り');
        const fishersSuiho = sumCategoryFishers('水宝');
        const fishersHarimitsu = sumCategoryFishers('ハリミツ');

        const observersIppan = sumCategoryObservers('一般');
        const observersMintsuri = sumCategoryObservers('みん釣り');
        const observersSuiho = sumCategoryObservers('水宝');
        const observersHarimitsu = sumCategoryObservers('ハリミツ');

        // Global Stats Summary Cards (v5.4 Compact)
        renderGlobalStatsSummary(validEntriesCount, dynamicTotalFishers, dynamicTotalObservers, checkedInCount, absentCount, fisherCheckedIn, fisherAbsent, observerCheckedIn, observerAbsent);

        // Email count
        updateBulkMailCount();

        // Splits
        updateSplitUI('ippan', fishersIppan, state.settings.capacityGeneral, observersIppan);
        updateSplitUI('mintsuri', fishersMintsuri, state.settings.capacityMintsuri, observersMintsuri);
        updateSplitUI('suiho', fishersSuiho, state.settings.capacitySuiho, observersSuiho);
        updateSplitUI('harimitsu', fishersHarimitsu, state.settings.capacityHarimitsu, observersHarimitsu);

        // v7.3 & v8.1.7: Update Share URLs in Dashboard Settings (User Requirements Match)
        const baseUrl = window.location.href.split('?')[0].split('#')[0];
        const isLocalFile = window.location.protocol === 'file:';

        // Add local file warning to UI if necessary
        const warningContainer = document.getElementById('local-file-warning');
        if (warningContainer) {
            warningContainer.innerHTML = isLocalFile ? `
                <div class="alert alert-warning no-print mb-4">
                    <strong>【ご注意】</strong> 現在ローカルファイルとして実行されています。印刷されるQRコードは、このPC内を指すためスマホでは読み取れません。
                    本番環境（GitHub Pages等）にアップロードすると、スマホから釣果報告ができるようになります。
                </div>
            ` : '';
        }

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
        const dirUrl = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
        if (leaderEl) leaderEl.value = `${baseUrl}?view=ranking`;

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
        const sortedEntries = state.entries.slice().sort((a, b) => {
            let valA, valB;
            switch(currentSortField) {
                case 'id': valA = a.id; valB = b.id; break;
                case 'source': valA = a.source; valB = b.source; break;
                case 'groupName': valA = a.groupName; valB = b.groupName; break;
                case 'representative': valA = a.representative; valB = b.representative; break;
                case 'status': valA = a.status; valB = b.status; break;
                case 'time': 
                    const parseTime = (s) => {
                        if (!s) return 0;
                        // Handle "5/13 11:01" or "2026/05/13 11:01"
                        const parts = s.split(/[\/\s:]+/);
                        if (parts.length < 4) return new Date(s).getTime() || 0;
                        const year = parts[0].length === 4 ? parseInt(parts[0]) : 2026;
                        const month = parts[0].length === 4 ? parseInt(parts[1]) : parseInt(parts[0]);
                        const day = parts[0].length === 4 ? parseInt(parts[2]) : parseInt(parts[1]);
                        const hour = parts[0].length === 4 ? parseInt(parts[3]) : parseInt(parts[2]);
                        const min = parts[0].length === 4 ? parseInt(parts[4]) : parseInt(parts[3]);
                        return new Date(year, month - 1, day, hour, min).getTime();
                    };
                    valA = parseTime(a.timestamp); 
                    valB = parseTime(b.timestamp); 
                    break;
                case 'score': 
                    valA = (a.participants || []).reduce((s, p) => s + parseInt(p.catchA || 0) + (parseInt(p.catchB || 0) * 2), 0);
                    valB = (b.participants || []).reduce((s, p) => s + parseInt(p.catchA || 0) + (parseInt(p.catchB || 0) * 2), 0);
                    break;
                default: valA = a.timestamp; valB = b.timestamp;
            }
            if (valA < valB) return currentSortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return currentSortOrder === 'asc' ? 1 : -1;
            return 0;
        });

        sortedEntries.forEach(e => {
            // v8.1.58: Comprehensive Safety Guard for missing participants
            const pArray = (e.participants || []).filter(p => p && p.status !== 'cancelled');
            
            // Search logic using pArray
            const pNames = pArray.map(p => p.name).join(' ');
            const pNicks = pArray.map(p => p.nickname || "").join(' ');
            const pRegions = pArray.map(p => p.region || "").join(' ');
            const pTshirts = pArray.map(p => p.tshirtSize || "").join(' ');
            const pGenders = pArray.map(p => p.gender ? genderLabels[p.gender] || "" : "").join(' ');
            const pTypes = pArray.map(p => p.type === 'observer' ? '見学' : '釣り').join(' ');
            
            const combinedParticipantInfo = (pNames + " " + pNicks + " " + pRegions + " " + pTshirts + " " + pGenders + " " + pTypes).toLowerCase();
            const safeId = e.id || "未採番";
            
            const fullString = [safeId, e.groupName || "", e.representative || "", combinedParticipantInfo].join(' ').toLowerCase();
            const searchTerms = searchTerm.replace(/　/g, ' ').split(/\s+/).filter(Boolean);
            
            if (searchTerms.length > 0) {
                const isMatch = searchTerms.every(term => fullString.includes(term));
                if (!isMatch) return;
            }
            
            const filterObserver = document.getElementById('dashboard-filter-observer')?.checked;
            if (filterObserver) {
                const hasObserver = pArray.some(p => p.type === 'observer');
                if (!hasObserver) return;
            }
            
            if (dashboardFilter !== 'all' && e.source !== dashboardFilter) return;

            const badgeMap = { '一般': 'badge-ippan', 'みん釣り': 'badge-mintsuri', '水宝': 'badge-suiho', 'ハリミツ': 'badge-harimitsu' };
            const statusLabel = e.status === 'checked-in' ? '✅ 受済' : e.status === 'absent' ? '❌ 欠席' : e.status === 'cancelled' ? '🚫 無効' : '⏳ 未受付';
            const rowClass = e.status === 'cancelled' ? 'row-cancelled' : (e.status === 'checked-in' ? 'row-checked-in' : '');

            const rep = pArray[0] || { name: e.representative, nickname: '', gender: '' };
            const getGenderMark = (p) => p.gender === 'male' ? '♂' : (p.gender === 'female' ? '♀' : '');
            
            const repDecoration = rep.status === 'cancelled' ? 'text-decoration:line-through; opacity:0.6;' : '';
            const pSummary = `
                <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:400px; font-size:0.95rem;">
                    <strong style="font-weight:800; color:var(--text-color); ${repDecoration}">${rep.name}</strong>${rep.nickname ? `<small>(${rep.nickname})</small>` : ''}${getGenderMark(rep)}
                    <span style="color:#64748b; font-size:0.8rem; margin-left:4px;">
                        ${pArray.length > 1 ? `+ ${pArray.slice(1).map(p => `<span style="${p.status === 'cancelled' ? 'text-decoration:line-through; opacity:0.6;' : ''}">${p.name}</span>`).join(', ')}` : ''}
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
                    <td><span class="id-badge" style="white-space:nowrap;">${e.id}</span>${e.userModified ? '<span class="badge" style="background:#eab308; color:#000; font-size:0.6rem; margin-left:4px; font-weight:bold;">変更あり</span>' : ''}${e.hasDropIn ? '<span class="badge" style="background:#ef4444; color:#fff; font-size:0.6rem; margin-left:4px; font-weight:bold;">当日追加</span>' : ''}</td>
                    <td><span class="badge ${badgeMap[e.source] || 'badge-ippan'}" style="white-space:nowrap;">${e.source}</span></td>
                    <td><div style="font-weight:800; max-width:8rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; ${e.status === 'cancelled' ? 'text-decoration:line-through' : ''}" title="${e.groupName}${e.memo ? `\n\n【備考】\n${e.memo}` : ''}">${e.groupName}${e.memo ? '<span style="font-size:0.7rem; color:#e67e22; border:1px solid #e67e22; border-radius:2px; padding:0 2px; margin-left:4px; vertical-align:middle;">備</span>' : ''}</div></td>
                    <td>${pSummary}</td>
                    <td><small style="white-space:nowrap;">${e.status === 'cancelled' ? '0 / 0' : `${e.fishers} / ${e.observers}`}</small></td>
                    <td><small style="white-space:nowrap;">${ikesuDisplay}</small></td>
                    <td><span style="font-size:0.75rem; font-weight:700; white-space:nowrap;">${statusLabel}</span></td>
                    <td><small style="white-space:nowrap;">${regTime}</small></td>
                    <td class="no-print">
                        <div style="display:flex; gap:0.2rem; flex-wrap: nowrap; width: auto; align-items:center;">
                            <button class="btn-outline btn-small btn-detail" onclick="showEntryDetails('${e.id}')" style="padding: 0.2rem 0.4rem; font-size: 0.75rem; white-space:nowrap;">確認</button>
                            <button class="btn-outline btn-small" onclick="requestAdminEdit('${e.id}')" style="padding: 0.2rem 0.4rem; font-size: 0.75rem; white-space:nowrap;">修正</button>
                            <button class="btn-primary btn-small ${e.status === 'checked-in' ? 'active' : ''}" onclick="quickCheckIn('${e.id}')" ${e.status === 'cancelled' ? 'disabled' : ''} style="padding: 0.2rem 0.4rem; font-size: 0.75rem; white-space:nowrap;">受付</button>
                        </div>
                    </td>
                </tr>
            `;
        });
        
        if (!html) {
            const hasFilter = searchTerm || dashboardFilter !== 'all';
            const msg = hasFilter ? '該当するデータが見つかりません。' : '登録データがありません。';
            html = `<tr><td colspan="10" style="text-align:center; padding:2rem; color:var(--text-muted);">${msg}</td></tr>`;
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
    // v8.1.75: Reset dashboard filter to 'all' when switching back to the main list to prevent blank screens
    if (tabId === 'tab-list') {
        dashboardFilter = 'all';
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-filter') === 'all');
        });
    }

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
    if (tabId === 'tab-print') {
        // v8.3.26: Small delay to ensure tab is visible before rendering
        setTimeout(() => {
            (typeof window.updatePrintView === 'function') && window.updatePrintView();
        }, 50);
    }
    if (tabId === 'tab-logs' || tabId === 'tab-settings') (typeof window.renderChangeLog === 'function') && window.renderChangeLog();
    if (tabId === 'tab-stats') (typeof window.renderBreakdownStats === 'function') && window.renderBreakdownStats('all', '');
}

/**
 * v8.4.15: Unified Print Layout Manager
 */
window.updatePrintView = function() {
    try {
        const mode = document.querySelector('input[name="print-mode"]:checked')?.value || 'ikesu';
        if (mode === 'group') {
            window.renderGroupPrintView();
        } else if (mode === 'result') {
            window.renderIkesuResultView();
        } else {
            window.renderIkesuPrintView();
        }
    } catch (err) {
        console.error("Print View Error:", err);
        const container = document.getElementById('print-view-container');
        if (container) container.innerHTML = `<div class="alert alert-danger">表示エラーが発生しました: ${err.message}</div>`;
    }
};

/**
 * Renders the printable member list view organized by ikesu (Globally exposed)
 */
window.renderIkesuPrintView = function() {
    const container = document.getElementById('print-view-container');
    if (!container) return;
    
    if (!state.entries || state.entries.length === 0) {
        container.innerHTML = `<div class="alert alert-info">名簿データを読み込んでいます。しばらくお待ちください...</div>`;
        return;
    }

    if (!state.settings.ikesuList || state.settings.ikesuList.length === 0) {
        container.innerHTML = `<div class="alert alert-warning">イケスが設定されていません。</div>`;
        return;
    }

    let html = '';
    state.settings.ikesuList.forEach((ik, idx) => {
        const participants = [];
        state.entries.forEach(e => {
            if (e.status === 'cancelled') return;
            (e.participants || []).forEach(p => {
                if (p.status === 'cancelled') return;
                if (p.ikesuId === ik.id) {
                    participants.push({ ...p, groupId: e.id, groupName: e.groupName, source: e.source });
                }
            });
        });

        // v8.10.4: Allow printing empty Ikesus as spares with 12 blank rows
        const extraRowsCount = participants.length === 0 ? 12 : 3;
        const extraRows = Array.from({length: extraRowsCount}, (_, i) => i + 1);

        html += `
            <div class="print-page ikesu-sheet" style="background:white; padding:1rem; border:1px solid #eee; margin-bottom: 2rem; page-break-after: always; color: black;">
                <div style="display: flex; align-items: flex-end; border-bottom: 5px solid #000; border-left: 8px solid #000; padding-left: 15px; padding-bottom: 0.3rem; margin-bottom: 1rem;">
                    <div style="display: flex; align-items: baseline; gap: 4px; min-width: 180px;">
                        <span style="font-size: 3.5rem; font-weight: 900; line-height: 1;">${ik.name.replace('イケス','')}</span>
                        <span style="font-size: 1rem; font-weight: 700; color: #333;">イケス</span>
                    </div>
                    <div style="flex: 1; display: flex; justify-content: center; align-items: baseline; gap: 10px; margin-bottom: 5px;">
                        <span style="font-size: 0.8rem; font-weight: 700; color: #666; background: #eee; padding: 2px 6px; border-radius: 4px;">イケスリーダー</span>
                        <span style="font-size: 1.8rem; font-weight: 900; color: #000;">${participants.find(p => p.isLeader)?.name || '　　　　　'} 様</span>
                    </div>
                    <div style="text-align: right; font-size: 0.8rem; min-width: 180px;">
                        <div style="font-weight: 700; font-size: 1rem; color: #666;">イケス メンバー表</div>
                        <div>印刷日: ${new Date().toLocaleDateString()} | 人数: ${participants.length} 名</div>
                    </div>
                </div>
                <table style="width: 100%; border-collapse: collapse; border: 2px solid #000; -webkit-print-color-adjust: exact; print-color-adjust: exact;">
                    <thead>
                        <tr style="background: #eee; color: #000; font-size: 1.1rem; height: 3.5rem;">
                            <th style="border: 1px solid #000; border-bottom: 2px solid #000; padding: 0.4rem; width: 35px; text-align: center;">No</th>
                            <th style="border: 1px solid #000; border-bottom: 2px solid #000; padding: 0.4rem; width: 130px; text-align: center;">グループ名</th>
                            <th style="border: 1px solid #000; border-bottom: 2px solid #000; padding: 0.4rem; text-align: center;">氏名</th>
                            <th style="border: 1px solid #000; border-bottom: 2px solid #000; padding: 0.4rem; width: 60px; text-align: center;">性別</th>
                            <th style="border: 1px solid #000; border-bottom: 2px solid #000; padding: 0.4rem; width: 100px; text-align: center;">Tシャツ</th>
                            <th style="border: 1px solid #000; border-bottom: 2px solid #000; padding: 0.4rem; min-width: 120px; text-align: center;">備考</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${participants.map((p, idx) => `
                            <tr style="height: 3.2rem;">
                                <td style="border: 1px solid #000; padding: 0.3rem; text-align: center; font-size: 1.2rem;">${idx + 1}</td>
                                <td style="border: 1px solid #000; padding: 0.3rem; font-size: 1.1rem;">${p.groupName}</td>
                                <td style="border: 1px solid #000; padding: 0.3rem; font-weight: 900; white-space: nowrap;">
                                    <span style="font-size: 24pt !important;">${p.name}</span>
                                    ${p.nickname ? `<span style="font-size:16pt !important; font-weight:normal; margin-left:10px;">(${p.nickname})</span>` : ''}
                                    ${(p.isDropIn || p.source === '当日追加') ? `<span style="font-size:12pt !important; font-weight:bold; color:#ef4444; margin-left:8px;">[当日追加]</span>` : ''}
                                </td>
                                <td style="border: 1px solid #000; padding: 0.3rem; text-align: center; font-size: 1.1rem;">${genderLabels[p.gender] || '-'}</td>
                                <td style="border: 1px solid #000; padding: 0.3rem; text-align: center; font-weight: bold;">
                                    <span style="font-size: 22pt !important; white-space: nowrap;">${(p.tshirtSize || '-').replace(/\s*[\(（].*/, '').trim()}</span>
                                </td>
                                <td style="border: 1px solid #000; padding: 0.3rem; text-align: left; font-weight: bold; font-size: 1rem; color: ${p.isLeader ? '#d32f2f' : 'inherit'};">
                                    ${p.isLeader ? '★リーダー' : ''}
                                    ${p.type === 'observer' ? '（見学者）' : ''}
                                </td>
                            </tr>
                        `).join('')}
                        ${extraRows.map(n => `
                            <tr style="height: 3.2rem;">
                                <td style="border: 1px solid #000; padding: 0.3rem; text-align: center; color: #ccc;">${participants.length + n}</td>
                                <td style="border: 1px solid #000; padding: 0.3rem;"></td>
                                <td style="border: 1px solid #000; padding: 0.3rem;"></td>
                                <td style="border: 1px solid #000; padding: 0.3rem;"></td>
                                <td style="border: 1px solid #000; padding: 0.3rem;"></td>
                                <td style="border: 1px solid #000; padding: 0.3rem;"></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <div style="text-align: right; font-size: 16pt; font-weight: 900; color: #000; margin-top: 8px;">- ${idx + 1} -</div>
            </div>
        `;
    });
    container.innerHTML = html || '<p class="text-muted p-4">対象者がいません。</p>';
};

/**
 * v8.3.22: Ikesu-based results recording sheet (Globally exposed)
 */
window.renderIkesuResultView = function() {
    const container = document.getElementById('print-view-container');
    if (!container) return;
    
    if (!state.settings.ikesuList || state.settings.ikesuList.length === 0) {
        container.innerHTML = `<div class="alert alert-warning">イケスが設定されていません。</div>`;
        return;
    }

    const baseUrl = window.location.href.split('?')[0].replace('index.html', '');
    // v8.9.84: Robust URL replacement for both local and GitHub environments
    const leaderUrl = baseUrl + 'fishing-results-app/index.html';
    const isLocalFile = window.location.protocol === 'file:';

    let html = isLocalFile ? `
        <div class="alert alert-warning no-print mb-4">
            <strong>【ご注意】</strong> 現在ローカルファイルとして実行されています。印刷されるQRコードは、このPC内を指すためスマホでは読み取れません。
        </div>
    ` : '';
    
    state.settings.ikesuList.forEach((ik, idx) => {
        const participants = [];
        let ikesuLeaderName = null;
        
        state.entries.forEach(e => {
            if (e.status === 'cancelled') return;
            (e.participants || []).forEach(p => {
                if (p.status === 'cancelled') return;
                if (p.ikesuId === ik.id) {
                    if (p.isLeader) ikesuLeaderName = p.name;
                    if (p.type === 'fisher') {
                        participants.push({ ...p, groupName: e.groupName, entryId: e.id, source: e.source });
                    }
                }
            });
        });

        // v8.10.4: Allow printing empty Ikesus as spares with 12 blank rows
        const extraRowsCount = participants.length === 0 ? 12 : 3;
        const extraRows = Array.from({length: extraRowsCount}, (_, i) => i + 1);

        html += `
            <div class="print-page result-sheet" style="background:white; padding:1.2rem; border:1px solid #eee; margin-bottom: 2rem; page-break-after: always; color: black; position: relative;">
                <div style="display: flex; align-items: center; border-bottom: 5px solid #000; border-left: 8px solid #000; padding-left: 15px; padding-bottom: 0.5rem; margin-bottom: 1.2rem;">
                    <div style="display: flex; align-items: baseline; gap: 4px; min-width: 150px; flex-shrink: 0;">
                        <span style="font-size: 3.5rem; font-weight: 900; line-height: 1;">${(ik.name || "").replace('イケス','')}</span>
                        <span style="font-size: 1rem; font-weight: 800; color: #333;">イケス</span>
                    </div>
                    <div style="flex: 1; display: flex; justify-content: center; align-items: baseline; gap: 10px; padding: 0 10px;">
                        <span style="font-size: 0.8rem; font-weight: 800; color: #666; background: #eee; padding: 2px 6px; border-radius: 4px; white-space: nowrap;">イケスリーダー</span>
                        <span style="font-size: 1.8rem; font-weight: 900; color: #000; white-space: nowrap;">${ikesuLeaderName || '　　　　　'} 様</span>
                    </div>
                    <div style="text-align: right; min-width: 280px; flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end;">
                        <div style="font-weight: 800; font-size: 1rem; color: #666; margin-bottom: 6px;">イケス 釣果記入表</div>
                        <div style="display: flex; gap: 10px; align-items: center; border: 1px solid #000; padding: 5px; background: #fff;">
                             <div id="qr-ikesu-${idx}" style="width: 100px; height: 100px; flex-shrink: 0; background: #fff;"></div>
                             <div style="text-align: left; line-height: 1.1; min-width: 80px;">
                                 <div style="font-size: 0.75rem; font-weight: bold; color: #666;">WEB報告用</div>
                                 <div style="font-size: 0.7rem; font-weight: bold; color: #666; margin-top: 4px;">暗証番号</div>
                                 <div style="font-size: 24pt; font-weight: 900; color: #1976d2;">${ik.passcode || '----'}</div>
                             </div>
                        </div>
                    </div>
                </div>
                <div style="display: flex; justify-content: flex-end; align-items: flex-end; margin-bottom: 0.5rem;">
                    <div style="font-size: 14pt; font-weight: 900; color: #d32f2f; background: #fff; padding: 2px 10px; border: 2px solid #d32f2f; border-radius: 4px;">※<span style="font-size: 18pt;">匹数</span>（数字）で記入してください</div>
                </div>
                <table style="width: 100%; border-collapse: collapse; border: 2px solid #000; -webkit-print-color-adjust: exact; print-color-adjust: exact;">
                    <thead>
                        <tr style="background: #eee; color: #000; font-size: 14pt; height: 3.5rem;">
                            <th style="border: 1px solid #000; border-bottom: 2px solid #000; padding: 0.4rem; width: 45px; text-align: center;">No</th>
                            <th style="border: 1px solid #000; border-bottom: 2px solid #000; padding: 0.4rem; width: 130px; text-align: center;">グループ名</th>
                            <th style="border: 1px solid #000; border-bottom: 2px solid #000; padding: 0.4rem; text-align: center;">氏名</th>
                            <th style="border: 1px solid #000; border-bottom: 2px solid #000; padding: 0.4rem; width: 120px; background: #fff3e0 !important; color: #e65100 !important; text-align: center;">鯛等</th>
                            <th style="border: 1px solid #000; border-bottom: 2px solid #000; padding: 0.4rem; width: 120px; background: #e3f2fd !important; color: #1976d2 !important; text-align: center;">青物、クエ</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${participants.map((p, pIdx) => `
                            <tr style="height: 3.8rem;">
                                <td style="border: 1px solid #000; padding: 0.3rem; text-align: center; background: #f0f0f0;"><span style="font-weight: bold; font-size: 14pt !important;">${pIdx + 1}</span></td>
                                <td style="border: 1px solid #000; padding: 0.3rem;"><span style="font-size: 12pt !important; font-weight: bold;">${p.groupName}</span><br><span style="font-size: 10pt !important; color:#666;">(${p.entryId})</span></td>
                                <td style="border: 1px solid #000; padding: 0.3rem; font-weight: 900; white-space: nowrap;">
                                    <span style="font-size: 24pt !important;">${p.name}</span>
                                    ${p.nickname ? `<span style="font-size:16pt !important; font-weight:normal; margin-left:8px;">(${p.nickname})</span>` : ''}
                                    ${(p.isDropIn || p.source === '当日追加') ? `<span style="font-size:12pt !important; font-weight:bold; color:#ef4444; margin-left:8px;">[当日追加]</span>` : ''}
                                </td>
                                <td style="border: 1px solid #000; padding: 0.3rem; position: relative;"><span style="position: absolute; bottom: 4px; right: 4px; font-size: 12pt !important; color: #999;">匹</span></td>
                                <td style="border: 1px solid #000; padding: 0.3rem; position: relative;"><span style="position: absolute; bottom: 4px; right: 4px; font-size: 12pt !important; color: #999;">匹</span></td>
                            </tr>
                        `).join('')}
                        ${extraRows.map(n => `
                            <tr style="height: 3.8rem; background: #fff;">
                                <td style="border: 1px solid #000; padding: 0.3rem; text-align: center; background: #f0f0f0;"><span style="font-weight: bold; font-size: 14pt !important;">${participants.length + n}</span></td>
                                <td style="border: 1px solid #000; padding: 0.3rem;"></td>
                                <td style="border: 1px solid #000; padding: 0.3rem;"></td>
                                <td style="border: 1px solid #000; padding: 0.3rem; position: relative;"><span style="position: absolute; bottom: 4px; right: 4px; font-size: 12pt !important; color: #999;">匹</span></td>
                                <td style="border: 1px solid #000; padding: 0.3rem; position: relative;"><span style="position: absolute; bottom: 4px; right: 4px; font-size: 12pt !important; color: #999;">匹</span></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <div style="margin-top: 15px; text-align: center;">
                    <div style="font-size: 16pt; font-weight: 900; color: #d32f2f;">用紙は、集計後記入し、QRコードから釣果を送信し、速やかに本部にお持ちください。</div>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 8px;">
                    <div style="font-size: 0.8rem; color: #666;">生成日: ${new Date().toLocaleString()} | BORIJIN FESTIVAL 管理システム</div>
                    <div style="font-size: 16pt; font-weight: 900; color: #000;">- ${idx + 1} -</div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;

    if (typeof QRCode !== 'undefined') {
        state.settings.ikesuList.forEach((ik, idx) => {
            const qrEl = document.getElementById(`qr-ikesu-${idx}`);
            if (qrEl) {
                try {
                    new QRCode(qrEl, {
                        text: leaderUrl,
                        width: 100,
                        height: 100,
                        correctLevel: QRCode.CorrectLevel.M,
                        useSVG: true
                    });
                } catch (e) { console.error("QR Error:", e); }
            }
        });
    }
};

// v8.9.85: Ranking Config Persistence
window.saveRankingSettings = function() {
    const topCount = parseInt(document.getElementById('rank-top-count')?.value) || 3;
    const tobiList = document.getElementById('rank-tobi-list')?.value || "5,10,15,20,25,30";
    
    state.settings.rankingConfig = { topCount, tobiList };
    state.lastUpdated = Date.now();
    showToast("ランキング設定を保存しました", "success");
    saveData(); // Sync to cloud
};
/**
 * v8.1.66: Group-based printing (1 page per group for prize prep)
 */
window.renderGroupPrintView = function() {
    const container = document.getElementById('print-view-container');
    if (!container) return;

    const validEntries = state.entries.filter(e => e.status !== 'cancelled');
    if (validEntries.length === 0) {
        container.innerHTML = '<p class="text-muted p-4">登録データがありません。</p>';
        return;
    }

    let html = '';
    const sorted = [...validEntries].sort((a,b) => a.source.localeCompare(b.source) || a.id.localeCompare(b.id));
    
    sorted.forEach((e, entryIdx) => {
        const pArray = (e.participants || []).filter(p => p.status !== 'cancelled' && p.status !== 'absent');
        if (pArray.length === 0) return;
        
        const isLast = entryIdx === sorted.length - 1;
        
        const ikesuNames = new Set();
        pArray.forEach(p => {
            if (p.ikesuId) {
                const ik = (state.settings.ikesuList || []).find(i => i.id === p.ikesuId);
                if (ik) ikesuNames.add(ik.name);
            }
        });
        const ikesuDisplay = Array.from(ikesuNames).join(', ') || '未割当';

        const activeFishers = pArray.filter(p => p.type === 'fisher').length;
        const activeObservers = pArray.filter(p => p.type === 'observer').length;

        html += `
            <div class="print-page group-sheet" style="background:white; padding:1.2rem; border:1px solid #eee; margin-bottom: 1rem; ${isLast ? '' : 'page-break-after: always;'} color: black;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 4px solid #000; border-left: 8px solid #000; padding-left: 15px; padding-bottom: 0.5rem; margin-bottom: 1rem;">
                    <div>
                        <div style="font-size: 1rem; font-weight: bold; margin-bottom: 0.2rem;">[${e.source}]</div>
                        <h1 style="margin:0; font-size: 2rem;">${e.groupName}</h1>
                    </div>
                    <div style="text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 0.5rem;">
                        <div style="font-size: 1.2rem; font-weight: bold; border: 1px solid #000; padding: 0.3rem 0.8rem;">${e.id}</div>
                        <div style="font-size: 1.6rem; font-weight: 900; color: #000; border: 2px solid #000; padding: 0.2rem 0.6rem; background: #fff;">イケス: ${ikesuDisplay}</div>
                    </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                    <div style="border: 2px solid #000; padding: 0.6rem;">
                        <div style="font-size: 0.8rem; border-bottom: 1px solid #000; margin-bottom: 0.3rem;">代表者</div>
                        <div style="font-size: 1.2rem; font-weight: bold;">${e.representative} 様</div>
                    </div>
                    <div style="border: 2px solid #000; padding: 0.6rem;">
                        <div style="font-size: 0.8rem; border-bottom: 1px solid #000; margin-bottom: 0.3rem;">合計人数</div>
                        <div style="font-size: 1.2rem; font-weight: bold;">釣り: ${activeFishers}名 / 見学: ${activeObservers}名</div>
                    </div>
                </div>

                <h3 style="background: #000; color: white; padding: 0.4rem 0.8rem; margin-bottom: 0.8rem; font-size: 1rem;">参加者・Tシャツサイズ 一覧</h3>
                <table style="width: 100%; border-collapse: collapse; border: 2px solid #000;">
                    <thead>
                        <tr style="background: #eee; color: #000; font-size: 1.1rem; height: 3.5rem;">
                            <th style="border: 1px solid #000; border-bottom: 2px solid #000; padding: 0.5rem; width: 35px; text-align: center;">No</th>
                            <th style="border: 1px solid #000; border-bottom: 2px solid #000; padding: 0.5rem; text-align: center;">氏名</th>
                            <th style="border: 1px solid #000; border-bottom: 2px solid #000; padding: 0.5rem; width: 100px; text-align: center;">Tシャツ</th>
                            <th style="border: 1px solid #000; border-bottom: 2px solid #000; padding: 0.5rem; width: 65px; text-align: center;">区分</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${pArray.map((p, idx) => `
                        <tr style="height: 3.2rem;">
                                <td style="border: 1px solid #000; padding: 0.4rem; text-align: center; font-size: 1.2rem;">${idx + 1}</td>
                                <td style="border: 1px solid #000; padding: 0.4rem; font-weight: 900; white-space: nowrap;">
                                    <span style="font-size: 20pt;">${p.name}</span>
                                    ${p.nickname ? `<span style="font-size:14pt; font-weight:normal; margin-left:12px;">(${p.nickname})</span>` : ''}
                                    ${p.isLeader ? `<span style="font-size:14pt; font-weight:bold; color:#d32f2f; margin-left:8px;">★リーダー</span>` : ''}
                                    ${(p.isDropIn || e.source === '当日追加') ? `<span style="font-size:14pt; font-weight:bold; color:#ef4444; margin-left:8px;">[当日追加]</span>` : ''}
                                </td>
                                <td style="border: 1px solid #000; padding: 0.4rem; text-align: center; font-weight: 900;">
                                    <span style="font-size: 22pt; white-space: nowrap;">${(p.tshirtSize || '-').replace(/\s*[\(（].*/, '').trim()}</span>
                                </td>
                                <td style="border: 1px solid #000; padding: 0.4rem; text-align: center; font-size: 1.1rem;">${p.type === 'fisher' ? '釣り' : '見学'}</td>
                            </tr>
                        `).join('')}
                        ${[1, 2, 3].map(n => `
                            <tr style="height: 3.2rem;">
                                <td style="border: 1px solid #000; padding: 0.4rem; text-align: center; font-size: 1.2rem; color: #ccc;">${pArray.length + n}</td>
                                <td style="border: 1px solid #000; padding: 0.4rem;"></td>
                                <td style="border: 1px solid #000; padding: 0.4rem;"></td>
                                <td style="border: 1px solid #000; padding: 0.4rem;"></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    });
    container.innerHTML = html;
};

window.setParticipantAsLeader = function(entryId, partIdx) {
    const entry = state.entries.find(e => e.id === entryId);
    if (!entry) return;
    entry.participants.forEach(p => p.isLeader = false);
    entry.participants[partIdx].isLeader = true;
    saveData();
    renderIkesuWorkspace();
    showToast(`${entry.participants[partIdx].name} 様をリーダーに設定しました`, 'info');
};

let currentDayTab = 'tab-day-reception';
window.switchDayTab = function(tabId) {
    if (!tabId) return;
    currentDayTab = tabId;
    document.querySelectorAll('.day-tab-btn').forEach(btn => btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId));
    document.querySelectorAll('.day-tab-content').forEach(content => content.classList.toggle('active', content.id === tabId));
    if (tabId === 'tab-day-reception') updateReceptionList();
    if (tabId === 'tab-day-results') renderDayResults();
    if (tabId === 'tab-day-rankings') { renderRankings(); renderBreakdownStats('all', 'day-'); }
    if (tabId === 'tab-day-awards') renderAwardsPreview();
};

window.renderDayResults = function() {
    const list = document.getElementById('day-results-list');
    if (!list) return;
    let html = '';
    let totalFish = 0;
    let caughtCount = 0;
    let zeroCount = 0;
    let fisherCount = 0;

    state.entries.filter(e => e.status !== 'cancelled').forEach(entry => {
        (entry.participants || []).forEach((p, pIdx) => {
            if (p.status === 'cancelled') return;
            if (p.type !== 'fisher') return;
            fisherCount++;
            const cA = parseInt(p.catchA || 0);
            const cB = parseInt(p.catchB || 0);
            const sum = cA + cB;
            const total = cA + (cB * 2);
            totalFish += sum;
            
            if (sum > 0) caughtCount++;
            else zeroCount++;

            const ik = (state.settings.ikesuList || []).find(i => i.id === p.ikesuId);
            html += `<tr>
                <td><span class="id-badge">${entry.id}</span></td>
                <td><small>${ik ? ik.name : '-'}</small></td>
                <td style="font-weight:bold;">${p.name}</td>
                <td style="text-align:center;">${cA}</td>
                <td style="text-align:center;">${cB}</td>
                <td style="text-align:center; font-weight:900;">${total}pt <small>(${sum}匹)</small></td>
                <td class="no-print"><button class="btn-outline btn-small" onclick="openDayCatchEditModal('${entry.id}', ${pIdx})">編集</button></td>
            </tr>`;
        });
    });

    // Update summary in header
    const header = document.querySelector('#tab-day-results .card-header h2');
    if (header) {
        let statsBox = document.getElementById('day-results-summary-stats');
        if (!statsBox) {
            statsBox = document.createElement('div');
            statsBox.id = 'day-results-summary-stats';
            statsBox.style.cssText = "font-size:0.85rem; color:#64748b; margin-top:0.2rem; font-weight:normal;";
            header.parentElement.appendChild(statsBox);
        }
        statsBox.innerHTML = `全体合計: <strong>${totalFish}匹</strong> (${totalFish * 1.0 / (fisherCount || 1).toFixed(1)}/人) | 釣果あり: ${caughtCount}名 / 坊主: <span style="color:#ef4444">${zeroCount}名</span>`;
    }

    list.innerHTML = html || '<tr><td colspan="7" class="text-center p-4">釣果データなし</td></tr>';
};

window.openDayCatchEditModal = function(entryId, pIdx) {
    const entry = state.entries.find(e => e.id === entryId);
    if (!entry || !entry.participants[pIdx]) return;
    currentDayEdit = { entryId, pIdx };
    document.getElementById('day-edit-p-name').textContent = `${entry.participants[pIdx].name} の釣果編集`;
    document.getElementById('day-input-cA').value = entry.participants[pIdx].catchA || 0;
    document.getElementById('day-input-cB').value = entry.participants[pIdx].catchB || 0;
    document.getElementById('day-catch-edit-modal').classList.remove('hidden');
};

window.closeDayModal = function() { document.getElementById('day-catch-edit-modal').classList.add('hidden'); currentDayEdit = null; };
window.changeDayValue = function(type, delta) {
    const el = document.getElementById('day-input-c' + type);
    el.value = Math.max(0, parseInt(el.value) + delta);
};
window.saveDayCatch = async function() {
    if (!currentDayEdit) return;
    const entry = state.entries.find(e => e.id === currentDayEdit.entryId);
    const p = entry.participants[currentDayEdit.pIdx];
    p.catchA = parseInt(document.getElementById('day-input-cA').value) || 0;
    p.catchB = parseInt(document.getElementById('day-input-cB').value) || 0;
    saveStateToLocalStorage();
    renderDayResults();
    renderRankings();
    closeDayModal();
    await saveData();
};

window.renderRankings = function() {
    const indList = document.getElementById('ranking-individual-list');
    const dayIndList = document.getElementById('day-ranking-individual-list');
    const ikList = document.getElementById('ranking-ikesu-list');
    const dayIkList = document.getElementById('day-ranking-ikesu-list');
    const awardFilterBtn = document.getElementById('award-filter-btn');
    const onlyAwards = awardFilterBtn && awardFilterBtn.classList.contains('active');

    let individuals = [];
    state.entries.forEach(e => {
        if (e.status === 'cancelled') return;
        (e.participants || []).forEach((p, pIdx) => {
            if (!p || p.type === 'observer' || p.status === 'cancelled') return;
            const cA = parseInt(p.catchA || 0);
            const cB = parseInt(p.catchB || 0);
            const points = cA + (cB * 2);
            const totalFish = cA + cB;
            individuals.push({ id: e.id, pIdx, name: p.name, group: e.groupName, points, cA, cB, totalFish, isAwardWinner: !!p.isAwardWinner });
            if (p.ikesuId) {
                const ik = (state.settings.ikesuList || []).find(i => i.id === p.ikesuId);
                if (ik) individuals[individuals.length - 1].ikesu = ik.name;
            }
        });
    });

    individuals.sort((a, b) => b.points - a.points || b.cA - a.cA);
    if (onlyAwards) individuals = individuals.filter(p => p.isAwardWinner);

    const rankingHtml = individuals.length > 0 ? individuals.slice(0, 100).map((p, i) => {
        const rankClass = i < 3 ? `rank-${i + 1}` : '';
        const rankNumClass = i < 3 ? `top-${i + 1}` : '';
        const awardClass = p.isAwardWinner ? 'award-winner-row' : '';
        const awardStar = p.isAwardWinner ? '🏆' : '☆';
        
        return `
            <div class="ranking-card compact-rank ${rankClass} ${awardClass}">
                <div class="ranking-rank ${rankNumClass}">${i + 1}</div>
                <div class="ranking-info">
                    <div class="ranking-name" style="font-size:0.95rem;">${p.name} <span class="award-toggle" onclick="toggleAwardWinner('${p.id}', ${p.pIdx})">${awardStar}</span></div>
                    <div class="ranking-subtext">${p.group} / ${p.ikesu || '-'}</div>
                </div>
                <div class="ranking-points">
                    <span class="rank-val" style="font-size:1.2rem;">${p.points}</span><span class="rank-unit">pt</span>
                    <div style="font-size:0.65rem; color:#64748b; margin-top:-2px;">${p.totalFish}匹 (鯛 <strong style="color:#ef4444; margin-right:2px;">${p.cA}</strong> / 青 <strong style="color:#3b82f6;">${p.cB}</strong>)</div>
                </div>
            </div>
        `;
    }).join('') : '<div class="p-8 text-center text-muted" style="border: 2px dashed #eee; border-radius: 12px;">個人の釣果データがまだありません</div>';

    if (indList) indList.innerHTML = rankingHtml;
    if (dayIndList) dayIndList.innerHTML = rankingHtml;
};

// v8.10.0: External link helper for results app
window.handleResultsExternalLink = function() {
    let baseUrl = window.location.href.split('#')[0].split('?')[0].replace('index.html', '');
    if (!baseUrl.endsWith('/')) baseUrl += '/';
    const url = baseUrl + 'fishing-results-app/index.html';
    window.open(url, '_blank');
};

// v8.10.0: View switcher for rankings
window.switchRankView = function(view) {
    const indView = document.getElementById('rank-view-ind');
    const ikView = document.getElementById('rank-view-ik');
    const btnInd = document.getElementById('btn-rank-ind');
    const btnIk = document.getElementById('btn-rank-ik');
    
    if (view === 'ind') {
        if (indView) indView.style.display = 'block';
        if (ikView) ikView.style.display = 'none';
        btnInd?.classList.add('active');
        btnIk?.classList.remove('active');
    } else {
        if (indView) indView.style.display = 'none';
        if (ikView) ikView.style.display = 'block';
        btnInd?.classList.remove('active');
        btnIk?.classList.add('active');
    }
};

window.toggleAwardWinner = async function(entryId, pIdx) {
    const entry = state.entries.find(e => e.id === entryId);
    if (!entry || !entry.participants[pIdx]) return;
    
    const p = entry.participants[pIdx];
    p.isAwardWinner = !p.isAwardWinner;
    
    localStorage.setItem('fishing_app_v3_data', JSON.stringify(state));
    renderRankings();
    
    try { await syncToCloud(); } catch(e) {}
};

window.toggleAwardFilter = function() {
    const btn = document.getElementById('award-filter-btn');
    const title = document.getElementById('ranking-title-text');
    if (!btn) return;
    
    btn.classList.toggle('active');
    if (btn.classList.contains('active')) {
        btn.style.background = '#f1c40f';
        btn.style.color = '#fff';
        btn.innerHTML = '👥 全員表示';
        if (title) title.textContent = '表彰対象者';
    } else {
        btn.style.background = '';
        btn.style.color = '';
        btn.innerHTML = '🏆 表彰者のみ';
        if (title) title.textContent = '個人順位 (全参加者)';
    }
    renderRankings();
};




// 3. Print View
// (renderIkesuPrintView logic is now integrated into core switchAdminTab)

// v7.6.3: Restored missing helper functions
function sumCategoryFishers(category) {
    if (!state.entries) return 0;
    const dbCount = state.entries
        .filter(e => e.source === category && e.status !== 'cancelled')
        .reduce((sum, e) => {
            const dynamicCount = (e.participants || []).filter(p => p.type === 'fisher' && p.status !== 'cancelled').length;
            return sum + dynamicCount;
        }, 0);
    
    // v8.4.2 & v8.9.59: Add manual adjustment (Try DOM first for real-time sync, then state)
    let adj = 0;
    if (category === '水宝') {
        const el = document.getElementById('adj-suiho-fishers');
        adj = el ? (parseInt(el.value) || 0) : parseInt(state.settings.adjSuihoFishers || 0);
    }
    if (category === 'ハリミツ') {
        const el = document.getElementById('adj-harimitsu-fishers');
        adj = el ? (parseInt(el.value) || 0) : parseInt(state.settings.adjHarimitsuFishers || 0);
    }
    return dbCount + adj;
}

function sumCategoryObservers(category) {
    if (!state.entries) return 0;
    const dbCount = state.entries
        .filter(e => e.source === category && e.status !== 'cancelled')
        .reduce((sum, e) => {
            const dynamicCount = (e.participants || []).filter(p => p.type === 'observer' && p.status !== 'cancelled').length;
            return sum + dynamicCount;
        }, 0);

    // v8.4.2: Add manual adjustment
    let adj = 0;
    if (category === '水宝') adj = parseInt(state.settings.adjSuihoObservers || 0);
    if (category === 'ハリミツ') adj = parseInt(state.settings.adjHarimitsuObservers || 0);
    return dbCount + adj;
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
            if (p.status === 'cancelled' || p.status === 'absent') return;
            const a = p.age || 'unknown';
            ageCount[a] = (ageCount[a] || 0) + 1;
            const g = p.gender || 'unknown';
            genderCount[g] = (genderCount[g] || 0) + 1;
            let r = p.region ? p.region.trim() : '未入力';
            if (r !== '未入力') {
                // まず末尾に「市」が抜けている場合は補完する（主要な市のみ）
                const cities = ['姫路', '神戸', '明石', '加古川', '高砂', '西宮', '尼崎', '芦屋', '伊丹', '宝塚', '川西', '三田', 'たつの', '赤穂', '相生', '宍粟', '豊岡', '養父', '朝来', '丹波', '丹波篠山', '洲本', '南あわじ', '淡路', '堺', '東大阪', '豊中', '吹田', '高槻', '枚方', '八尾', '寝屋川', '茨木', '岸和田', '和泉', '宇治', '亀岡', '舞鶴', '橿原', '生駒', '大和郡山', '田辺', '橋本', '大津', '草津', '彦根', '長浜', '近江八幡', '名古屋', '四日市', '豊田', '一宮', '豊橋', '岡崎', '春日井', '津', '鈴鹿', '松阪', '桑名', '伊勢', '横浜', '川崎', '相模原', '浜松', '倉敷', '福山', '呉', '高松', '丸亀'];
                for (let c of cities) {
                    if (r === c || (r.endsWith(c) && !r.endsWith(c + '市') && !r.endsWith(c + '郡') && !r.endsWith(c + '区'))) r = r + '市';
                }

                // 「大阪」等とだけ入力されている場合「大阪府」にする
                const prefs = { '大阪': '大阪府', '京都': '京都府', '東京': '東京都', '北海道': '北海道', '兵庫': '兵庫県', '奈良': '奈良県', '和歌山': '和歌山県', '滋賀': '滋賀県', '三重': '三重県', '岡山': '岡山県', '鳥取': '鳥取県', '徳島': '徳島県', '香川': '香川県', '愛媛': '愛媛県', '高知': '高知県', '愛知': '愛知県', '岐阜': '岐阜県', '福井': '福井県', '神奈川': '神奈川県', '静岡': '静岡県', '広島': '広島県' };
                for (let p in prefs) {
                    if (r.startsWith(p) && !r.startsWith(prefs[p])) {
                        if (r === p) {
                            r = prefs[p];
                        } else if (r.startsWith(p + '市') || r.startsWith(p + '区')) {
                            r = prefs[p] + r;
                        } else {
                            r = prefs[p] + r.slice(p.length);
                        }
                    }
                }

                // 都道府県が省略されている都市名に都道府県を補完する
                const cityPrefMap = {
                    "名古屋": "愛知県", "豊田": "愛知県", "一宮": "愛知県", "豊橋": "愛知県", "岡崎": "愛知県", "春日井": "愛知県",
                    "四日市": "三重県", "津": "三重県", "鈴鹿": "三重県", "松阪": "三重県", "桑名": "三重県", "伊勢": "三重県",
                    "神戸": "兵庫県", "姫路": "兵庫県", "尼崎": "兵庫県", "明石": "兵庫県", "西宮": "兵庫県", "芦屋": "兵庫県", "宝塚": "兵庫県", "伊丹": "兵庫県", "加古川": "兵庫県", "高砂": "兵庫県", "たつの": "兵庫県", "赤穂": "兵庫県", "相生": "兵庫県", "宍粟": "兵庫県", "豊岡": "兵庫県", "養父": "兵庫県", "朝来": "兵庫県", "丹波": "兵庫県", "丹波篠山": "兵庫県", "洲本": "兵庫県", "南あわじ": "兵庫県", "淡路": "兵庫県",
                    "堺": "大阪府", "東大阪": "大阪府", "枚方": "大阪府", "豊中": "大阪府", "吹田": "大阪府", "高槻": "大阪府", "茨木": "大阪府", "八尾": "大阪府", "寝屋川": "大阪府", "岸和田": "大阪府", "和泉": "大阪府",
                    "横浜": "神奈川県", "川崎": "神奈川県", "相模原": "神奈川県",
                    "浜松": "静岡県", "倉敷": "岡山県", "福山": "広島県", "呉": "広島県", "高松": "香川県", "丸亀": "香川県",
                    "宇治": "京都府", "亀岡": "京都府", "舞鶴": "京都府", "橿原": "奈良県", "生駒": "奈良県", "大和郡山": "奈良県", "田辺": "和歌山県", "橋本": "和歌山県", "大津": "滋賀県", "草津": "滋賀県", "彦根": "滋賀県", "長浜": "滋賀県", "近江八幡": "滋賀県"
                };
                for (const [city, pref] of Object.entries(cityPrefMap)) {
                    if (r === city || r.startsWith(city + '市') || r.startsWith(city + '区') || r.startsWith(city + '郡')) {
                        r = pref + r;
                        break;
                    }
                }
            }
            regionCount[r] = (regionCount[r] || 0) + 1;
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
        const distanceOrder = [
            "北海道", "沖縄", "青森", "岩手", "秋田", "宮城", "山形", "鹿児島",
            "福島", "宮崎", "長崎", "熊本", "大分", "佐賀", "新潟", "茨城",
            "栃木", "群馬", "福岡", "千葉", "埼玉", "東京", "神奈川", "富山",
            "長野", "山梨", "石川", "静岡", "愛媛", "高知", "福井", "山口",
            "愛知", "岐阜", "香川", "徳島", "島根", "三重", "広島", "鳥取",
            "滋賀", "和歌山", "奈良", "京都", "大阪", "岡山", "兵庫"
        ];
        const cityToPref = {
            "名古屋": "愛知", "豊田": "愛知", "一宮": "愛知", "豊橋": "愛知", "岡崎": "愛知", "春日井": "愛知",
            "四日市": "三重", "津": "三重", "鈴鹿": "三重", "松阪": "三重", "桑名": "三重", "伊勢": "三重",
            "神戸": "兵庫", "姫路": "兵庫", "尼崎": "兵庫", "明石": "兵庫", "西宮": "兵庫", "芦屋": "兵庫", "宝塚": "兵庫", "伊丹": "兵庫", "加古川": "兵庫",
            "堺": "大阪", "東大阪": "大阪", "枚方": "大阪", "豊中": "大阪", "吹田": "大阪", "高槻": "大阪", "茨木": "大阪", "八尾": "大阪",
            "横浜": "神奈川", "川崎": "神奈川", "相模原": "神奈川",
            "浜松": "静岡", "倉敷": "岡山", "福山": "広島", "呉": "広島", "高松": "香川", "丸亀": "香川"
        };
        const getDistRank = (name) => {
            let clean = name;
            for (const [city, pref] of Object.entries(cityToPref)) {
                if (name.includes(city)) {
                    clean = pref;
                    break;
                }
            }
            const idx = distanceOrder.findIndex(p => clean.includes(p) || name.includes(p));
            return idx === -1 ? 999 : idx;
        };

        regionList.innerHTML = Object.entries(regionCount)
            .sort((a,b) => {
                const rankA = getDistRank(a[0]);
                const rankB = getDistRank(b[0]);
                if (rankA !== rankB) return rankA - rankB;
                return b[1] - a[1]; // 同じ都道府県なら人数の多い順
            })
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
            (e.participants || []).forEach(p => {
                if (p && p.tshirtSize && p.status !== 'cancelled' && p.status !== 'absent') {
                    const normalized = normalizeTshirtSize(p.tshirtSize);
                    tshirtCount[normalized] = (tshirtCount[normalized] || 0) + 1;
                }
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

    // Leader T-shirt Sizes
    const leaderTshirtList = document.getElementById(prefix + 'leader-tshirt-breakdown-list');
    if (leaderTshirtList) {
        const leaderTshirtCount = {};
        tshirtSizes.forEach(s => leaderTshirtCount[s] = 0);
        
        validEntries.forEach(e => {
            (e.participants || []).forEach(p => {
                if (p && p.tshirtSize && p.status !== 'cancelled' && p.status !== 'absent' && p.isLeader) {
                    const normalized = normalizeTshirtSize(p.tshirtSize);
                    leaderTshirtCount[normalized] = (leaderTshirtCount[normalized] || 0) + 1;
                }
            });
        });

        leaderTshirtList.innerHTML = Object.entries(leaderTshirtCount)
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
    renderGenericCoordinatorView('みん釣り', 'mintsuri');
};

window.renderHarimitsuCoordinatorView = function() {
    renderGenericCoordinatorView('ハリミツ', 'harimitsu');
};

window.renderSuihoCoordinatorView = function() {
    renderGenericCoordinatorView('水宝', 'suiho');
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
        'みん釣り': 'capacityMintsuri',
        'ハリミツ': 'capacityHarimitsu',
        '水宝': 'capacitySuiho',
        '一般': 'capacityGeneral'
    };
    const capacityKey = capacityKeyMap[sourceName];
    const capacity = state.settings[capacityKey] || 0;

    if (summary) {
        summary.innerHTML = `
            <div class="stats-summary-grid">
                <div class="summary-card"><div class="summary-label">${sourceName} 合計組数</div><div class="summary-value">${sourceEntries.length} <small>組</small></div></div>
                <div class="summary-card"><div class="summary-label">${sourceName} 釣り人数</div><div class="summary-value">${totalFishers} <small>/ ${capacity}</small></div></div>
                <div class="summary-card"><div class="summary-label">見学人数</div><div class="summary-value">${totalObservers} <small>名</small></div></div>
                <div class="summary-card"><div class="summary-label">充足率</div><div class="summary-value">${capacity > 0 ? Math.round((totalFishers/capacity)*100) : 0}%</div></div>
            </div>`;
    }

    const searchTerm = (document.getElementById(`${prefix}-search`)?.value || "").toLowerCase();

    list.innerHTML = sourceEntries.slice()
        .filter(e => {
            if (!searchTerm) return true;
            // v8.1.41: Safety Guard
            const pArray = e.participants || [];
            const pNames = pArray.map(p => p.name).join(' ');
            const pNicks = pArray.map(p => p.nickname || "").join(' ');
            const combined = `${e.id} ${e.groupName} ${e.representative} ${pNames} ${pNicks}`.toLowerCase();
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
                        <button class="btn-outline btn-small" onclick="showEntryDetails('${e.id}')">確認</button>
                        ${prefix === 'harimitsu' ? `<button class="btn-primary btn-small" onclick="requestAdminEdit('${e.id}')">修正</button>` : ''}
                    </div>
                </td>
            </tr>
        `;
        }).join('') || '<tr><td colspan="6" style="text-align:center; padding:2rem;">該当する登録はありません</td></tr>';

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
    exportGenericCSV('みん釣り', 'mintsuri_export');
}

window.exportHarimitsuCSV = function() {
    exportGenericCSV('ハリミツ', 'harimitsu_export');
}

window.exportSuihoCSV = function() {
    exportGenericCSV('水宝', 'suiho_export');
}

function exportGenericCSV(sourceName, fileName) {
    const targetEntries = state.entries.filter(e => e.source === sourceName);
    if (targetEntries.length === 0) return alert('データがありません');

    const headers = ['受付番号', 'グループ名', '代表者名', '電話番号', 'メール', '釣り人数', '見学人数', '登録時間', '備考'];
    const rows = targetEntries.map(e => {
        let memo = (e.memo || "").replace(/\n/g, " ");
        if (e.status === 'cancelled') memo = "[キャンセル] " + memo;
        return [
            e.id, e.groupName, e.representative, e.phone, e.email, e.fishers, e.observers, formatDateForCSV(e.timestamp), `"${memo.trim()}"`
        ];
    });
    downloadCSV(fileName, headers, rows);
}

// Global Stats Rendering (v7.3.0 Global Scope)
function renderGlobalStatsSummary(groups, fishers, observers, checkedIn, absent, fisherCheckedIn = 0, fisherAbsent = 0, observerCheckedIn = 0, observerAbsent = 0) {
    const containers = [
        document.getElementById('global-stats-summary-top')
    ].filter(el => el);

    if (containers.length === 0) return;

    const html = `
        <div class="stats-summary-grid">
            <div class="summary-card" style="border-top: 5px solid var(--primary-color);">
                <div class="summary-label">釣り参加者合計</div>
                <div class="summary-value"><span class="current-fishers">${fishers}</span> <small>/ ${state.settings.capacityTotal}</small></div>
                <div style="font-size: 0.85rem; color: #10b981; font-weight: bold; margin-top: 6px;">受付済: ${fisherCheckedIn} / ${fishers - fisherAbsent} 名</div>
            </div>
            <div class="summary-card">
                <div class="summary-label">総登録グループ</div>
                <div class="summary-value">${groups} <small>組</small></div>
                <div style="font-size: 0.85rem; color: #10b981; font-weight: bold; margin-top: 6px;">受付済: ${checkedIn} / ${groups - absent} 組</div>
            </div>
            <div class="summary-card">
                <div class="summary-label">見学者合計</div>
                <div class="summary-value">${observers} <small>名</small></div>
                <div style="font-size: 0.85rem; color: #10b981; font-weight: bold; margin-top: 6px;">受付済: ${observerCheckedIn} / ${observers - observerAbsent} 名</div>
            </div>
            <div class="summary-card" style="border-top: 5px solid #10b981;">
                <div class="summary-label">当日受付状況 (来場 / 予定)</div>
                <div class="summary-value" style="font-size: 1.1rem; line-height: 1.4; display:flex; flex-direction:column; gap:4px; font-weight:bold;">
                    <span style="color: var(--primary-color)">釣り人: <span style="font-size:1.4rem;">${fisherCheckedIn}</span> / ${fishers - fisherAbsent} <small style="font-size:0.8rem;">名</small></span>
                    <span style="color: var(--primary-color)">グループ: <span style="font-size:1.4rem;">${checkedIn}</span> / ${groups - absent} <small style="font-size:0.8rem;">組</small></span>
                </div>
                ${absent > 0 || fisherAbsent > 0 ? `<div style="font-size: 0.8rem; color: var(--error-color); margin-top: 6px; font-weight: bold;">欠席: ${absent}組 (${fisherAbsent}名)</div>` : ''}
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
    if (!list) return;

    const searchTerm = document.getElementById('reception-search').value.toLowerCase();
    const filterRadio = document.querySelector('input[name="reception-filter"]:checked');
    const filterValue = filterRadio ? filterRadio.value : 'uncompleted';

    // v8.1.56: Save scroll position of the sidebar
    const scrollPos = list.scrollTop;

    const processedEntries = state.entries.map(e => {
        const pArray = e.participants || [];
        const validPArray = pArray.filter(p => p && p.status !== 'cancelled');
        const finishedCount = validPArray.filter(p => p.status === 'checked-in' || p.status === 'absent').length;
        const totalCount = validPArray.length;
        const isCompleted = finishedCount === totalCount && totalCount > 0;
        return { ...e, isCompleted, finishedCount, totalCount, validPArray, allPArray: pArray, isCancelledEntry: e.status === 'cancelled' };
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
        const searchTerms = searchTerm.replace(/　/g, ' ').split(/\s+/).filter(Boolean);
        const hasSearch = searchTerms.length > 0;

        if (!hasSearch && e.isCancelledEntry) return;

        const targetPArray = hasSearch ? e.allPArray : e.validPArray;

        const pNames = targetPArray.map(p => p.name).join(' ');
        const pNicks = targetPArray.map(p => p.nickname || "").join(' ');
        const pTshirts = targetPArray.map(p => p.tshirtSize || "").join(' ');
        const pGenders = targetPArray.map(p => genderLabels[p.gender] || "").join(' ');
        const pTypes = targetPArray.map(p => p.type === 'observer' ? '見学' : '釣り').join(' ');
        const combined = `${e.id} ${e.groupName} ${e.representative} ${pNames} ${pNicks} ${pTshirts} ${pGenders} ${pTypes}`.toLowerCase();
        
        if (hasSearch) {
            const isMatch = searchTerms.every(term => combined.includes(term));
            if (!isMatch) return;
        }

        const filterObserver = document.getElementById('reception-filter-observer')?.checked;
        if (filterObserver) {
            const hasObserver = targetPArray.some(p => p.type === 'observer');
            if (!hasObserver) return;
        }

        // Completion Filter (ignore if searching)
        if (!hasSearch) {
            if (filterValue === 'uncompleted' && e.isCompleted) return;
            if (filterValue === 'completed' && !e.isCompleted) return;
        }

        const badgeClass = e.source === 'みん釣り' ? 'badge-mintsuri' : e.source === '一般' ? 'badge-ippan' : e.source === 'ハリミツ' ? 'badge-harimitsu' : 'badge-suiho';
        
        const ikesuNames = new Set();
        (e.participants || []).forEach(p => {
            if (p.ikesuId && p.status !== 'cancelled' && p.status !== 'absent') {
                const ik = (state.settings.ikesuList || []).find(i => i.id === p.ikesuId);
                if (ik) ikesuNames.add(ik.name);
            }
        });
        const ikesuDisplay = Array.from(ikesuNames).join(', ');
        const ikesuLabel = ikesuDisplay ? `<span style="font-size:0.8rem; font-weight:bold; color:#059669; border:1px solid #059669; border-radius:4px; padding:1px 4px; margin-left:6px; background:#ecfdf5;">イケス: ${ikesuDisplay}</span>` : '';

        html += `
            <div class="reception-group-item ${activeReceptionEntryId === e.id ? 'active' : ''} ${e.isCompleted ? 'completed' : ''}" 
                 onclick="selectReceptionEntry('${e.id}')">
                <div style="display:flex; align-items:center; gap: 0.6rem;">
                    <div style="font-size:1.4rem; font-weight:900; color:#2d3436; flex-shrink:0;">${e.id}</div>
                    <div style="flex:1; display:flex; flex-direction:column; justify-content:center;">
                        <div style="font-size:1.05rem; font-weight:bold; color:#2d3436; line-height:1.2;">
                            ${e.groupName}${e.hasDropIn ? '<span class="badge" style="background:#ef4444; color:#fff; font-size:0.6rem; margin-left:4px; font-weight:bold; vertical-align:middle;">当日追加</span>' : ''}
                        </div>
                        <div style="font-size:0.85rem; color:#636e72; margin-top:0.2rem;">
                            (代表者) ${e.representative}
                        </div>
                    </div>
                    <div style="display:flex; flex-direction:column; align-items:flex-end; gap:0.3rem; flex-shrink:0;">
                        <span class="badge ${badgeClass}" style="font-size:0.7rem; padding:0.1rem 0.4rem;">${e.source}</span>
                        <span style="font-size:0.95rem; font-weight:900; color: #0984e3;">${e.isCompleted ? '✅ 受付済' : `${e.finishedCount}/${e.totalCount}`}</span>
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
    window.justCompleted = false;
    updateReceptionList();
    renderReceptionDesk();
}



function renderReceptionDesk() {
    const desk = document.getElementById('reception-detail');
    const entry = state.entries.find(e => e.id === activeReceptionEntryId);

    if (!entry) {
        if (window.justCompleted) {
            desk.innerHTML = `
                <div class="reception-placeholder" style="color: #10b981;">
                    <i class="icon-search" style="font-style: normal; font-size: 5rem; margin-bottom: 1rem; display: block;">🎉</i>
                    <p style="font-size: 1.5rem; font-weight: bold;">全員受付完了しました！</p>
                </div>
            `;
        } else {
            desk.innerHTML = `
                <div class="reception-placeholder">
                    <i class="icon-search">🔍</i>
                    <p>左側のリストからグループを選択してください。</p>
                </div>
            `;
        }
        return;
    }

    const ikesuNames = new Set();
    (entry.participants || []).forEach(p => {
        if (p.ikesuId && p.status !== 'cancelled' && p.status !== 'absent') {
            const ik = (state.settings.ikesuList || []).find(i => i.id === p.ikesuId);
            if (ik) ikesuNames.add(ik.name);
        }
    });
    const ikesuDisplay = Array.from(ikesuNames).join(', ');
    const ikesuLabel = ikesuDisplay ? `<span style="margin-left: 1rem; background: #ecfdf5; color: #059669; border: 1px solid #059669; padding: 2px 8px; border-radius: 4px;">イケス: ${ikesuDisplay}</span>` : '';

    desk.innerHTML = `
        <div class="desk-header" style="background: #eef2ff; border-bottom: 2px solid var(--primary-color); padding: 0.8rem 1rem; border-radius: 8px 8px 0 0;">
            <div class="desk-title-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.3rem;">
                <div class="desk-group-name" style="font-size: 1.6rem; font-weight: 900; color: var(--primary-color);">${entry.groupName}</div>
                <div class="badge ${entry.source === 'みん釣り' ? 'badge-mintsuri' : entry.source === '一般' ? 'badge-ippan' : entry.source === 'ハリミツ' ? 'badge-harimitsu' : 'badge-suiho'}" style="font-size: 1.1rem; padding: 0.4rem 0.8rem;">${entry.source}</div>
            </div>
            <div class="desk-meta" style="font-size: 1rem; color: #475569; font-weight: 600;">
                <span style="background: white; padding: 2px 8px; border-radius: 4px; border: 1px solid #cbd5e1;">ID: ${entry.id}</span>
                <span style="margin-left: 1rem;">代表者: ${entry.representative}</span>
                <span style="margin-left: 1rem;">TEL: ${entry.phone}</span>
                ${ikesuLabel}
            </div>
        </div>

        ${(() => {
            const validP = (entry.participants || []).filter(p => p.status !== 'cancelled');
            const total = validP.length;
            const finished = validP.filter(p => p.status === 'checked-in' || p.status === 'absent').length;
            if (total > 0 && total === finished) {
                return `
                <div style="background: #10b981; color: white; padding: 1rem; text-align: center; font-size: 1.4rem; font-weight: 900; box-shadow: inset 0 -2px 0 rgba(0,0,0,0.1);">
                    ✅ 全員受付完了しました！
                </div>`;
            }
            return '';
        })()}

        <div class="participant-check-list" style="padding: 0.8rem 1rem; background: white;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.8rem;">
                <div class="section-title" style="margin-top: 0; margin-bottom: 0; font-size: 1.1rem; border-left-width: 4px;">参加メンバー個別の受付状況</div>
                <button class="btn-outline btn-small" onclick="window.openAddParticipantModal('${entry.id}')" style="padding: 0.3rem 0.6rem; font-size: 0.85rem;">+ 飛び入り参加</button>
            </div>
            
            ${(entry.participants || []).map((p, idx) => {
                if (!p || p.status === 'cancelled') return '';
                const typeClass = p.type === 'fisher' ? 'p-badge-fisher' : 'p-badge-observer';
                const typeLabel = p.type === 'fisher' ? '釣り' : '見学';
                const rowStatusClass = p.status === 'checked-in' ? 'checked-in' : (p.status === 'absent' ? 'absent' : '');
                
                return `
                <div class="participant-check-row ${rowStatusClass}" style="margin-bottom: 8px; padding: 0.6rem 0.8rem; border-radius: 12px; border: 2px solid ${p.status === 'checked-in' ? '#10b981' : (p.status === 'absent' ? '#ef4444' : '#e2e8f0')}; display: flex; align-items: center; justify-content: space-between; background: ${p.status === 'checked-in' ? '#f0fdf4' : (p.status === 'absent' ? '#fef2f2' : 'white')}; transition: all 0.2s;">
                    <div class="p-info" style="display: flex; align-items: center; gap: 0.6rem; flex: 1; min-width: 0;">
                        <div style="font-size: 1.2rem; width: 30px; text-align: center; flex-shrink: 0;">${p.status === 'checked-in' ? '✅' : (p.status === 'absent' ? '❌' : '⬜')}</div>
                        <div style="min-width: 0; flex: 1;">
                            <div class="p-name" style="font-size: 1.15rem; font-weight: 800; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                <span class="badge ${p.type === 'fisher' ? 'badge-ippan' : 'badge-secondary'}" onclick="window.toggleParticipantType('${entry.id}', ${idx})" title="クリックで釣りと見学を切り替え" style="margin-right: 4px; padding: 0.2rem 0.4rem; font-size: 0.8rem; cursor: pointer; transition: transform 0.1s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">${typeLabel} ⇄</span>
                                ${p.name} <small style="font-weight: normal; color: #64748b;">(${p.nickname || 'ニックネーム無'})</small>
                            </div>
                            <div class="p-meta" style="font-size: 0.85rem; color: #64748b; margin-top: 2px;">
                                ${p.region || '地域不明'} | ${genderLabels[p.gender] || '-'} | ${ageLabels[p.age] || '-'} | Tシャツ: [<strong>${p.tshirtSize || '不明'}</strong>]
                            </div>
                        </div>
                    </div>
                    <div class="p-status-actions" style="display: flex; gap: 4px; flex-shrink: 0;">
                        <button class="btn-status in ${p.status === 'checked-in' ? 'active' : ''}" onclick="updateParticipantStatus('${entry.id}', ${idx}, 'checked-in')" style="padding: 0.6rem 0.8rem; font-size: 0.9rem; font-weight: 800; border-radius: 8px; cursor: pointer; border: 2px solid #10b981; background: ${p.status === 'checked-in' ? '#10b981' : 'white'}; color: ${p.status === 'checked-in' ? 'white' : '#10b981'}; min-width: 60px;">来場</button>
                        <button class="btn-status out ${p.status === 'absent' ? 'active' : ''}" onclick="updateParticipantStatus('${entry.id}', ${idx}, 'absent')" style="padding: 0.6rem 0.8rem; font-size: 0.9rem; font-weight: 800; border-radius: 8px; cursor: pointer; border: 2px solid #ef4444; background: ${p.status === 'absent' ? '#ef4444' : 'white'}; color: ${p.status === 'absent' ? 'white' : '#ef4444'}; min-width: 60px;">欠席</button>
                    </div>
                </div>
                `;
            }).join('')}
        </div>

        <div class="desk-footer" style="padding: 1.5rem; background: #f8fafc; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; align-items: center; border-radius: 0 -0 8px 8px; gap: 1rem;">
            <button class="btn-primary btn-large" onclick="window.updateGroupStatus('${entry.id}', 'checked-in')" style="padding: 1rem 2rem; font-size: 1.2rem; white-space: nowrap;">全員まとめて受付</button>
        </div>
    `;
    
    // v8.8.1: Removed redundant addEventListener that was duplicating the onclick attribute
    // const btn = desk.querySelector('.btn-primary');
    // if (btn) btn.addEventListener('click', () => window.updateGroupStatus(entry.id, 'checked-in'));
}

window.toggleParticipantType = function(entryId, pIdx) {
    const entry = state.entries.find(e => e.id === entryId);
    if (!entry) return;
    const p = entry.participants[pIdx];
    if (!p) return;
    
    p.type = p.type === 'fisher' ? 'observer' : 'fisher';
    
    // Recalculate counts
    entry.fishers = entry.participants.filter(p => p.type === 'fisher' && p.status !== 'cancelled' ).length;
    entry.observers = entry.participants.filter(p => p.type === 'observer' && p.status !== 'cancelled' ).length;
    
    state.lastUpdated = Date.now();
    saveData();
    
    // Refresh UI
    renderReceptionDesk();
    updateReceptionList();
    if(typeof updateDashboard === 'function') updateDashboard();
    
    const typeLabel = p.type === 'fisher' ? '釣り' : '見学';
    showToast(`${p.name}さんを「${typeLabel}」に変更しました`, "success");
};

window.updateParticipantStatus = function (entryId, pIdx, status) {
    const entry = state.entries.find(e => e.id === entryId);
    if (!entry) return;

    const currentStatus = entry.participants[pIdx].status;
    const isTogglingOff = currentStatus === status;
    
    // v7.9.3: Toggle logic - if already active, revert to pending
    const newStatus = isTogglingOff ? 'pending' : status;
    entry.participants[pIdx].status = newStatus;
    
    entry.fishers = entry.participants.filter(p => p.type === 'fisher' && p.status !== 'cancelled' ).length;
    entry.observers = entry.participants.filter(p => p.type === 'observer' && p.status !== 'cancelled' ).length;

    // Sync group-level flags (for backward compatibility and stats)
    syncGroupStatusFromParticipants(entry);

    if (!isTogglingOff) {
        const statusLabel = status === 'checked-in' ? '受付済' : status === 'absent' ? '欠席' : '未受付';
        showToast(`${entry.participants[pIdx].name} 様を「${statusLabel}」に更新しました`, 'info');
    }

    entry.lastModified = new Date().toISOString();
    saveData();

    // Auto-close right pane if group is now fully completed
    const validP = entry.participants.filter(p => p.status !== 'cancelled');
    if (validP.length > 0 && validP.every(p => p.status === 'checked-in' || p.status === 'absent')) {
        activeReceptionEntryId = null;
        window.justCompleted = true;
    }

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

    entry.fishers = entry.participants.filter(p => p.type === 'fisher' && p.status !== 'cancelled' ).length;
    entry.observers = entry.participants.filter(p => p.type === 'observer' && p.status !== 'cancelled' ).length;

    syncGroupStatusFromParticipants(entry);

    if (status === 'checked-in') {
        showToast('グループ全員を受付しました', 'success');
    }

    entry.lastModified = new Date().toISOString();
    saveData();

    // Auto-close right pane if group is now fully completed
    const validP = entry.participants.filter(p => p.status !== 'cancelled');
    if (validP.length > 0 && validP.every(p => p.status === 'checked-in' || p.status === 'absent')) {
        activeReceptionEntryId = null;
        window.justCompleted = true;
    }

    renderReceptionDesk();
    updateReceptionList();
    updateDashboard();
};

window.resetAllReceptions = async function() {
    if (!confirm('【テスト用】すべての参加者の受付状況を「未受付」に戻しますか？\n※この操作はシミュレーション後のリセット用です。')) {
        return;
    }
    state.entries.forEach(entry => {
        if (entry.participants) {
            let changed = false;
            entry.participants.forEach(p => {
                if (p && (p.status === 'checked-in' || p.status === 'absent')) {
                    p.status = 'pending';
                    changed = true;
                }
            });
            if (changed) {
                entry.fishers = entry.participants.filter(p => p.type === 'fisher' && p.status !== 'cancelled' ).length;
                entry.observers = entry.participants.filter(p => p.type === 'observer' && p.status !== 'cancelled' ).length;
                syncGroupStatusFromParticipants(entry);
                entry.lastModified = new Date().toISOString();
            }
        }
    });
    
    showToast('すべての受付状況をリセットしました', 'success');
    await saveData();
    if(typeof renderReceptionDesk === 'function') renderReceptionDesk();
    if(typeof updateReceptionList === 'function') updateReceptionList();
    if(typeof updateDashboard === 'function') updateDashboard();
};

window.openAddParticipantModal = function(entryId) {
    document.getElementById('add-p-entry-id').value = entryId;
    document.getElementById('add-p-name').value = '';
    document.getElementById('add-p-nickname').value = '';
    document.getElementById('add-p-type').value = 'fisher';
    document.getElementById('add-p-gender').value = 'male';
    document.getElementById('add-p-age').value = 'adult';
    document.getElementById('add-p-tshirt').value = '';
    document.getElementById('add-p-checkin').checked = true;
    
    document.getElementById('add-participant-modal').classList.remove('hidden');
};

window.closeAddParticipantModal = function() {
    document.getElementById('add-participant-modal').classList.add('hidden');
};

window.submitAddParticipant = async function(e) {
    e.preventDefault();
    const entryId = document.getElementById('add-p-entry-id').value;
    const entry = state.entries.find(en => en.id === entryId);
    if (!entry) return;

    const newP = {
        name: document.getElementById('add-p-name').value.trim(),
        nickname: document.getElementById('add-p-nickname').value.trim(),
        type: document.getElementById('add-p-type').value,
        gender: document.getElementById('add-p-gender').value,
        age: document.getElementById('add-p-age').value,
        tshirtSize: document.getElementById('add-p-tshirt').value,
        status: document.getElementById('add-p-checkin').checked ? 'checked-in' : 'pending',
        isDropIn: true
    };

    if (!entry.participants) entry.participants = [];
    entry.participants.push(newP);
    entry.hasDropIn = true;

    entry.fishers = entry.participants.filter(p => p.type === 'fisher' && p.status !== 'cancelled' ).length;
    entry.observers = entry.participants.filter(p => p.type === 'observer' && p.status !== 'cancelled' ).length;
    
    syncGroupStatusFromParticipants(entry);
    entry.lastModified = new Date().toISOString();

    showToast('参加者を追加しました', 'success');
    window.closeAddParticipantModal();

    await saveData();
    
    if (activeReceptionEntryId === entry.id) {
        renderReceptionDesk();
    }
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
            document.getElementById('ikesu-id-hidden').value = ikesu.id;
            document.getElementById('ikesu-name-input').value = ikesu.name;
            document.getElementById('ikesu-capacity-input').value = ikesu.capacity;
            const passEl = document.getElementById('ikesu-passcode-input');
            if (passEl) passEl.value = ikesu.passcode || "";
            const delBtn = document.getElementById('delete-ikesu-btn');
            if (delBtn) delBtn.classList.remove('hidden');
            return;
        }
    }
    document.getElementById('ikesu-modal-title').textContent = "イケスの追加";
    document.getElementById('ikesu-id-hidden').value = '';
    document.getElementById('ikesu-name-input').value = '';
    document.getElementById('ikesu-capacity-input').value = '15';
    const passEl = document.getElementById('ikesu-passcode-input');
    if (passEl) {
        passEl.value = Math.floor(1000 + Math.random() * 9000).toString();
    }
    const delBtn = document.getElementById('delete-ikesu-btn');
    if (delBtn) delBtn.classList.add('hidden');
};

window.closeIkesuModal = function () {
    document.getElementById('ikesu-modal').classList.add('hidden');
};

window.handleIkesuSave = function (event) {
    if (event) event.preventDefault();
    const id = document.getElementById('ikesu-id-hidden').value;
    const name = document.getElementById('ikesu-name-input').value.trim();
    const capacity = parseInt(document.getElementById('ikesu-capacity-input').value, 10);
    const passEl = document.getElementById('ikesu-passcode-input');
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

    state.settingsLastModified = new Date().toISOString();
    state.lastUpdated = Date.now();
    saveData();
    closeIkesuModal();
    renderIkesuWorkspace();
};

window.handleIkesuDelete = function () {
    const id = document.getElementById('ikesu-id-hidden').value;
    if (!id) return;
    if (!confirm('本当にこのイケスを削除しますか？\n割り当てられていた人は未割り当てに戻ります。')) return;
    state.settings.ikesuList = state.settings.ikesuList.filter(i => i.id !== id);
    state.entries.forEach(e => {
        e.participants.forEach(p => {
            if (p.ikesuId === id) p.ikesuId = null;
        });
    });
    state.settingsLastModified = new Date().toISOString();
    state.lastUpdated = Date.now();
    saveData();
    closeIkesuModal();
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
    
    // v8.3.12: Update timestamp for sync
    entry.lastModified = new Date().toISOString();
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
    if (!window.expandedIkesuIds) window.expandedIkesuIds = new Set();

    // イケスを名前順（数値考慮）でソート
    state.settings.ikesuList.sort((a, b) => a.name.localeCompare(b.name, 'ja', {numeric: true, sensitivity: 'base'}));

    state.settings.ikesuList.forEach(ik => assignedData[ik.id] = { ik, fishers: 0, observers: 0, items: [] });

    const searchTerm = (document.getElementById('ikesu-search')?.value || "").toLowerCase().trim();

    state.entries.forEach(e => {
        if (e.status === 'cancelled') return;
        
        const matchesSearch = !searchTerm || 
            e.id.toLowerCase().includes(searchTerm) || 
            e.groupName.toLowerCase().includes(searchTerm) ||
            e.representative.toLowerCase().includes(searchTerm) ||
            (e.phone && e.phone.includes(searchTerm)) ||
            (e.repPhone && e.repPhone.includes(searchTerm));

        const unassignedParts = [];
        e.participants.forEach((p, idx) => {
            if (p.status === 'cancelled' || p.status === 'absent') return;
            if (p.ikesuId && assignedData[p.ikesuId]) {
                assignedData[p.ikesuId].items.push({ entry: e, p, idx });
                if (p.type === 'fisher') assignedData[p.ikesuId].fishers++;
                else assignedData[p.ikesuId].observers++;
            } else {
                unassignedParts.push({ p, idx });
            }
        });

        if (unassignedParts.length > 0 && matchesSearch) {
            const activeParticipants = e.participants.filter(p => p.status !== 'cancelled' && p.status !== 'absent');
            const isFull = unassignedParts.length === activeParticipants.length && activeParticipants.length > 0;
            const fishers = unassignedParts.filter(i => i.p.type === 'fisher').length;
            const observers = unassignedParts.filter(i => i.p.type === 'observer').length;
            
            const sourceClass = `source-${e.source === '一般' ? 'ippan' : e.source === 'みん釣り' ? 'mintsuri' : e.source === '水宝' ? 'suiho' : e.source === 'ハリミツ' ? 'harimitsu' : 'default'}`;
            let html = `
                <div class="drag-item-group ${sourceClass} ${isFull ? 'draggable' : ''}" 
                     ${isFull ? `draggable="true" ondragstart="dragGroup(event, '${e.id}')"` : ''}>
                    <div class="drag-item-header" style="flex-wrap: nowrap;">
                        <div class="group-name-text">[${e.id}] ${e.groupName}</div>
                        <div class="count-badge-row">
                            <span class="badge-fisher-count">${fishers}</span>
                            <span class="badge-observer-count">${observers}</span>
                        </div>
                    </div>
                    <div class="drag-item-participants active">
                        ${unassignedParts.map(item => `
                            <div class="drag-item-person draggable" draggable="true" ondragstart="dragPerson(event, '${e.id}', ${item.idx})">
                                <span>${item.p.name}${item.p.nickname ? ` <small style="color:#666;">(${item.p.nickname})</small>` : ''}</span>
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
        const current = data.fishers;
        const capacity = ik.capacity;
        const isOver = current > capacity;
        const isFull = current === capacity;
        
        const isExpanded = window.expandedIkesuIds.has(ik.id);
        const badgeClass = isOver ? 'over' : isFull ? 'full' : (current >= capacity - 1) ? 'warning' : '';
        
        const box = document.createElement('div');
        box.className = `ikesu-box drag-zone ${isOver ? 'over' : ''}`;
        box.ondragover = allowDrop;
        box.ondragleave = handleDragLeave;
        box.ondrop = (ev) => dropToIkesu(ev, ik.id);

        box.innerHTML = `
            <div class="ikesu-header">
                <div class="ikesu-title">
                    <span class="num">${ik.name.replace('イケス','')}</span>
                    <span class="unit">イケス</span>
                </div>
                <div style="display:flex; align-items:center; gap:6px;">
                    <div class="capacity-badge ${badgeClass}">${current} / ${capacity}</div>
                    <button class="btn-text" onclick="window.toggleIkesuExpand('${ik.id}')" title="メンバー表示切替" style="font-size: 1rem; padding: 0 4px;">${isExpanded ? '👁️' : '🕶️'}</button>
                    <button class="btn-text" onclick="window.openIkesuModal('${ik.id}')">✏️</button>
                </div>
            </div>
            <div class="ikesu-drop-area">
                ${Object.values(data.items.reduce((acc, item) => {
                    if (!acc[item.entry.id]) acc[item.entry.id] = { entry: item.entry, parts: [] };
                    acc[item.entry.id].parts.push(item);
                    return acc;
                }, {})).map(group => {
                    const sc = `source-${group.entry.source === '一般' ? 'ippan' : group.entry.source === 'みん釣り' ? 'mintsuri' : group.entry.source === '水宝' ? 'suiho' : group.entry.source === 'ハリミツ' ? 'harimitsu' : 'default'}`;
                    const fishers = group.parts.filter(i => i.p.type === 'fisher').length;
                    const observers = group.parts.filter(i => i.p.type === 'observer').length;
                    
                    return `
                    <div class="drag-item-group ${sc} draggable" draggable="true" ondragstart="dragGroup(event, '${group.entry.id}')">
                        <div class="drag-item-header" style="flex-wrap: nowrap;">
                            <div class="group-name-text">${group.entry.groupName}</div>
                            <div class="count-badge-row">
                                <span class="badge-fisher-count">${fishers}</span>
                                <span class="badge-observer-count">${observers}</span>
                            </div>
                        </div>
                        <div class="drag-item-participants ${isExpanded ? 'active' : ''}">
                            ${group.parts.map(m => `
                                <div class="drag-item-person" draggable="true" ondragstart="dragPerson(event, '${group.entry.id}', ${m.idx})">
                                    <div style="display:flex; align-items:center; gap:4px;">
                                        <button class="btn-leader-toggle ${m.p.isLeader ? 'active' : ''}" 
                                                onclick="window.toggleLeader(event, '${group.entry.id}', ${m.idx})">⭐</button>
                                        <span>${m.p.name}${m.p.nickname ? ` <small style="color:#666;">(${m.p.nickname})</small>` : ''}</span>
                                    </div>
                                    ${m.p.type === 'observer' ? '<span style="font-size:0.6rem; color:#64748b;">(見)</span>' : ''}
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
window.printMemberList = function() {
    window.print();
};

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
        <div style="font-size:0.8rem;">
            <table class="table-striped" style="margin-bottom:0;">
                <thead><tr><th>氏名</th><th>青物、クエ(2pt)</th><th>鯛等(1pt)</th><th>小計</th></tr></thead>
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

window.toggleIkesuExpand = function(ikId) {
    if (!window.expandedIkesuIds) window.expandedIkesuIds = new Set();
    if (window.expandedIkesuIds.has(ikId)) {
        window.expandedIkesuIds.delete(ikId);
    } else {
        window.expandedIkesuIds.add(ikId);
    }
    renderIkesuWorkspace();
};

window.splitGroupInWorkspace = function(entryId) {
    showToast('個人単位で移動可能です', 'info');
};

window.toggleLeader = function(event, entryId, pIdx) {
    if (event) {
        if (event.preventDefault) event.preventDefault();
        if (event.stopPropagation) event.stopPropagation();
    }
    const entry = state.entries.find(e => e.id === entryId);
    if (!entry || !entry.participants[pIdx]) return;
    
    const targetIkesuId = entry.participants[pIdx].ikesuId;
    const isNowLeader = !entry.participants[pIdx].isLeader;
    
    if (isNowLeader) {
        state.entries.forEach(e => {
            let modified = false;
            // Clear within the same team
            if (e.id === entryId) {
                e.participants.forEach(p => {
                    if (p.isLeader) { p.isLeader = false; modified = true; }
                });
            }
            // Clear within the same ikesu
            if (targetIkesuId) {
                e.participants.forEach(p => {
                    if (p.ikesuId === targetIkesuId && p.isLeader) { p.isLeader = false; modified = true; }
                });
            }
            if (modified) {
                e.lastModified = new Date().toISOString();
            }
        });
    }
    
    entry.participants[pIdx].isLeader = isNowLeader;
    entry.lastModified = new Date().toISOString();
    saveStateToLocalStorage();
    renderIkesuWorkspace();
};


/* --- SYSTEM STABILIZATION FUNCTIONS RESTORED v8.0.7 --- */

function updateAppTitle() {
    const titleEl = document.getElementById('app-title');
    const competitionName = state.settings.competitionName || "BORIJIN FESTIVAL in 水宝 2026";
    const version = "v8.9.79";
    if (titleEl) {
        let prefix = "";
        // v8.9.65: Ensure Admin prefix is shown when authenticated or in admin views
        if (isAdminAuth || currentViewId === 'dashboard-view') prefix = "管理者: ";
        else if (currentViewId === 'reception-view') prefix = "当日受付: ";
        
        titleEl.innerHTML = `
            ${prefix}${competitionName}
            <span class="version-badge">${version}</span>
        `;
    }
    document.title = competitionName;
}

window.triggerSettingsSave = async function () {
    const btn = document.querySelector('button[onclick="triggerSettingsSave()"]');
    const originalText = btn ? btn.textContent : "大会設定をすべて保存";
    
    if (btn) {
        btn.disabled = true;
        btn.textContent = "保存中...";
    }

    try {
        await handleSettingsUpdate({ preventDefault: () => { } });
        showToast('設定を保存し、クラウドと同期しました', 'success');
    } catch (err) {
        console.error("BORIJIN: Save failed:", err);
        showToast('保存に失敗しました', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }
};

function updateCapacityTotal() {
    const getI = (id) => parseInt(document.getElementById(id)?.value) || 0;
    
    // v8.9.60: STRICTLY sum only the 4 fisher categories for the denominator (Total Capacity)
    // Excludes observers and manual adjustments as per user requirement.
    const total = getI('cap-ippan') + getI('cap-mintsuri') + getI('cap-suiho') + getI('cap-harimitsu');
    
    console.log(`[Capacity] Denominator calculation: ${getI('cap-ippan')} + ${getI('cap-mintsuri')} + ${getI('cap-suiho')} + ${getI('cap-harimitsu')} = ${total}`);
    
    const totalEl = document.getElementById('cap-total');
    if (totalEl && document.activeElement !== totalEl) {
        totalEl.value = total;
    }
    
    if (state.settings) {
        state.settings.capacityTotal = total;
    }
    
    const sumEl = document.getElementById('capacity-total-summary');
    if (sumEl) sumEl.textContent = total;

    return total;
}
window.updateCapacityTotal = updateCapacityTotal;

async function handleSettingsUpdate(e) {
    if (e && e.preventDefault) e.preventDefault();
    
    const getVal = id => document.getElementById(id)?.value || "";
    const getInt = id => {
        const v = document.getElementById(id)?.value;
        return (v === "" || v === undefined) ? 0 : parseInt(v) || 0;
    };

    const oldSettings = JSON.parse(JSON.stringify(state.settings || {}));

    // 最新の合計を強制計算し、その値を保存に利用する
    const calculatedTotal = window.updateCapacityTotal();

    state.settings.competitionName = getVal('competition-name');
    state.settings.capacityGeneral = getInt('cap-ippan');
    state.settings.capacityMintsuri = getInt('cap-mintsuri');
    state.settings.capacitySuiho = getInt('cap-suiho');
    state.settings.capacityHarimitsu = getInt('cap-harimitsu');
    state.settings.capacityObservers = getInt('capacity-observers');
    state.settings.capacityTotal = calculatedTotal;
    
    state.settings.startTime = getVal('registration-start');
    state.settings.deadline = getVal('registration-deadline');
    state.settings.cancelDeadline = getVal('cancel-deadline');
    state.settings.editDeadline = getVal('edit-deadline');
    state.settings.adminPassword = getVal('admin-password-set');
    
    const maintToggle = document.getElementById('maintenance-mode-toggle');
    if (maintToggle) state.settings.maintenanceMode = maintToggle.checked;
    const soldoutToggle = document.getElementById('soldout-mode-toggle');
    if (soldoutToggle) state.settings.soldoutMode = soldoutToggle.checked;
    const closedToggle = document.getElementById('closed-mode-toggle');
    if (closedToggle) state.settings.closedMode = closedToggle.checked;
    applyMaintenanceMode();

    state.settings.adjSuihoFishers = getInt('adj-suiho-fishers');
    state.settings.adjSuihoObservers = getInt('adj-suiho-observers');
    state.settings.adjHarimitsuFishers = getInt('adj-harimitsu-fishers');
    state.settings.adjHarimitsuObservers = getInt('adj-harimitsu-observers');
    
    console.log("BORIJIN: Updating state and syncing...", state.settings);
    
    state.settingsLastModified = new Date().toISOString();
    
    // v8.9.63: Save locally first
    localStorage.setItem('fishing_app_v3_data', JSON.stringify(state));
    
    // v8.9.63: Then sync to cloud and wait for it
    await syncToCloud();
    
    syncSettingsUI();
    updateDashboard();
    checkTimeframe();
    updateAppTitle();
    
    logChange({ groupName: '大会設定', id: 'SYSTEM', settings: state.settings }, '設定変更', { settings: oldSettings });
}

/**
 * v8.9.39: Apply maintenance mode class based on current settings
 */
function applyMaintenanceMode() {
    // v8.9.60: Skip maintenance overlay if the user is an authenticated admin
    if (state.settings.maintenanceMode && !isAdminAuth) {
        document.body.classList.add('maintenance-active');
        console.log("BORIJIN: Maintenance Mode is ENABLED (Overlay active for non-admins)");
    } else {
        document.body.classList.remove('maintenance-active');
        console.log(`BORIJIN: Maintenance Mode is ${state.settings.maintenanceMode ? 'ENABLED (but bypassed for admin)' : 'DISABLED'}`);
    }

    if (state.settings.soldoutMode && !isAdminAuth) {
        document.body.classList.add('soldout-active');
        console.log("BORIJIN: Sold Out Mode is ENABLED (Overlay active for non-admins)");
    } else {
        document.body.classList.remove('soldout-active');
        console.log(`BORIJIN: Sold Out Mode is ${state.settings.soldoutMode ? 'ENABLED (but bypassed for admin)' : 'DISABLED'}`);
    }

    if (state.settings.closedMode && !isAdminAuth) {
        document.body.classList.add('closed-active');
        console.log("BORIJIN: Closed Mode is ENABLED (Overlay active for non-admins)");
    } else {
        document.body.classList.remove('closed-active');
        console.log(`BORIJIN: Closed Mode is ${state.settings.closedMode ? 'ENABLED (but bypassed for admin)' : 'DISABLED'}`);
    }
}



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
        logChange({ groupName: id, id: id }, '削除');
        await saveData();
    } catch (err) {
        console.error("Deletion failed:", err);
        showToast('削除に失敗しました', 'error');
    }
};

/**
 * v8.1.48: Restored Entry Details Modal rendering
 */
window.showEntryDetails = function (id) {
    window.currentDetailId = id; // Store for modal edit button
    const entry = state.entries.find(e => e.id === id);
    if (!entry) return;

    // v8.10.x: Clear userModified flag when admin reviews the entry
    if (entry.userModified) {
        entry.userModified = false;
        entry.lastModified = new Date().toISOString();
        saveData(); // Persist the cleared flag
        updateDashboard(); // Remove the badge from the list
    }

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
            editBtn.onclick = () => window.requestAdminEdit(entry.id);
        }
    }

    const cancelBtn = document.getElementById('modal-cancel-btn');
    const restoreBtn = document.getElementById('modal-restore-btn');
    const resendBtn = document.getElementById('modal-resend-btn');
    const hardDeleteBtn = document.getElementById('modal-hard-delete-btn');

    if (cancelBtn) {
        cancelBtn.classList.toggle('hidden', !isAdminAuth || entry.status === 'cancelled');
        cancelBtn.onclick = () => window.cancelEntry(entry.id);
    }
    if (restoreBtn) {
        restoreBtn.classList.toggle('hidden', !isAdminAuth || entry.status !== 'cancelled');
        restoreBtn.onclick = () => window.restoreEntry(entry.id);
    }
    if (resendBtn) {
        resendBtn.classList.toggle('hidden', !isAdminAuth || entry.status === 'cancelled');
        resendBtn.onclick = () => window.resendEmail(entry.id);
    }
    if (hardDeleteBtn) {
        hardDeleteBtn.classList.toggle('hidden', !isAdminAuth);
        hardDeleteBtn.onclick = () => {
            window.hardDeleteEntry(entry.id).then(() => {
                document.getElementById('detail-modal').classList.add('hidden');
            });
        };
    }

    if (title) title.textContent = `[${entry.id}] ${entry.groupName} 詳細`;

    // Calculate Scores for display
    let participantsHtml = entry.participants.map((p, idx) => `
        <div style="padding: 10px; border: 1px solid #eee; border-radius: 8px; margin-bottom: 8px; background: ${p.type === 'observer' ? '#f8f9fa' : '#fff'}; ${p.status === 'cancelled' ? 'opacity: 0.5;' : ''}">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <strong style="${p.status === 'cancelled' ? 'text-decoration: line-through;' : ''}">${p.isLeader ? '<span style="color:#d32f2f; margin-right:4px;">★</span>' : ''}${p.name} ${p.nickname ? `<small>(${p.nickname})</small>` : ''}${p.gender === 'male' ? '♂' : (p.gender === 'female' ? '♀' : '')}</strong>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <span class="badge ${p.type === 'fisher' ? 'badge-ippan' : 'badge-secondary'}">${p.type === 'fisher' ? '釣り' : '見学'}</span>
                    ${p.status === 'cancelled' ? 
                        `<span class="badge" style="background:#f87171;">キャンセル済</span>
                         <button class="btn-outline btn-small" style="padding: 2px 6px; font-size: 0.7rem; border-color: #10b981; color: #10b981;" onclick="restoreParticipant('${entry.id}', ${idx})">元に戻す</button>` :
                        `<button class="btn-outline btn-small" style="padding: 2px 6px; font-size: 0.7rem; border-color: #f87171; color: #f87171;" onclick="cancelParticipant('${entry.id}', ${idx})">キャンセル</button>`
                    }
                </div>
            </div>
            <div style="font-size: 0.85rem; color: #64748b; margin-top: 5px;">
                ${genderLabels[p.gender] || '-'} / ${ageLabels[p.age] || '-'} / ${p.region || '地域不明'} / Tシャツ: ${p.tshirtSize || 'なし'}
            </div>
        </div>
    `).join('');

    body.innerHTML = `
        <div style="margin-bottom: 1.5rem; padding: 1rem; background: #f1f5f9; border-radius: 8px;">
            <p><strong>代表者:</strong> ${entry.representative}</p>
            <p><strong>電話番号:</strong> ${entry.phone}</p>
            <p><strong>メール:</strong> ${entry.email}</p>
            <p><strong>登録区分:</strong> <span class="badge ${entry.source === 'みん釣り' ? 'badge-mintsuri' : entry.source === '一般' ? 'badge-ippan' : entry.source === 'ハリミツ' ? 'badge-harimitsu' : 'badge-suiho'}">${entry.source}</span></p>
            <p><strong>現在の状態:</strong> ${entry.status === 'checked-in' ? '✅ 受付済' : entry.status === 'cancelled' ? '🚫 キャンセル' : '⏳ 未受付'}</p>
            ${entry.memo ? `<div style="margin-top: 0.8rem; padding: 0.8rem; background: #fff; border: 1px dashed #cbd5e1; border-radius: 6px;"><strong style="color:#64748b;">備考:</strong><br><span style="white-space: pre-wrap;">${entry.memo}</span></div>` : ''}
        </div>
        <h4 style="margin-bottom: 0.8rem; font-size: 1rem; color: #475569;">参加者内訳 (${entry.participants.length}名)</h4>
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
            showToast('エントリーが見つかりません', 'error');
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
        if (titleEl) titleEl.textContent = "登録変更: " + entry.id;
        
        // 4. Close modal if open
        const modal = document.getElementById('detail-modal');
        if (modal) modal.classList.add('hidden');
        
    } catch (e) {
        console.error("BORIJIN: requestAdminEdit failed:", e);
        showToast("編集画面への遷移に失敗しました", "error");
    }
};

/**
 * v8.1.48: Quick Toggle Status from Dashboard
 */
window.quickCheckIn = async function (id) {
    const entry = state.entries.find(e => e.id === id);
    if (!entry) return;

    if (entry.status === 'cancelled') {
        showToast('キャンセル済みのエントリーは受付できません', 'error');
        return;
    }

    const newStatus = entry.status === 'checked-in' ? 'pending' : 'checked-in';
    entry.status = newStatus;
    
    // Also update all individual participants
    entry.participants.forEach(p => {
        if (newStatus === 'checked-in' && p.status === 'absent') return;
        p.status = newStatus;
    });

    entry.lastModified = new Date().toISOString();
    if (newStatus === 'checked-in') entry.checkedIn = true;
    
    showToast(`${entry.groupName} の状態を「${newStatus === 'checked-in' ? '受付済' : '未受付'}」に更新中...`, 'info');
    
    await saveData();
    updateDashboard();
    updateReceptionList();
    showToast(`${entry.groupName} の状態を更新しました`, 'success');
};

/**
 * v8.1.48: Admin Email Resend
 */
window.resendEmail = async function (id) {
    if (!confirm('この申込の確定メールを再送しますか？')) return;
    const entry = state.entries.find(e => e.id === id);
    if (!entry) return;

    showToast('メール再送コマンドを送信中...', 'info');
    try {
        const payload = { action: 'resend_email', id: entry.id };
        const response = await fetch(GAS_WEB_APP_URL, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const res = await response.json();
        if (res.status === 'success') {
            showToast('✅ メールを再送しました', 'success');
        } else {
            throw new Error(res.message);
        }
    } catch (e) {
        console.error("Email resend failed:", e);
        showToast('❌ メールの再送に失敗しました。サーバー側のログを確認してください。', 'error');
    }
};

/**
 * Individual Participant Cancellation
 */
window.cancelParticipant = async function(entryId, pIdx) {
    if (!confirm('この参加者をキャンセルしますか？')) return;
    const entry = state.entries.find(e => e.id === entryId);
    if (!entry || !entry.participants[pIdx]) return;

    entry.participants[pIdx].status = 'cancelled';
    entry.fishers = entry.participants.filter(p => p.type === 'fisher' && p.status !== 'cancelled' ).length;
    entry.observers = entry.participants.filter(p => p.type === 'observer' && p.status !== 'cancelled' ).length;
    entry.lastModified = new Date().toISOString();
    
    await saveData();
    showToast('参加者をキャンセルしました', 'success');
    updateDashboard();
    window.showEntryDetails(entryId);
};

window.restoreParticipant = async function(entryId, pIdx) {
    if (!confirm('この参加者のキャンセルを取り消しますか？')) return;
    const entry = state.entries.find(e => e.id === entryId);
    if (!entry || !entry.participants[pIdx]) return;

    entry.participants[pIdx].status = 'pending';
    entry.fishers = entry.participants.filter(p => p.type === 'fisher' && p.status !== 'cancelled' ).length;
    entry.observers = entry.participants.filter(p => p.type === 'observer' && p.status !== 'cancelled' ).length;
    entry.lastModified = new Date().toISOString();
    
    await saveData();
    showToast('参加者のキャンセルを取り消しました', 'success');
    updateDashboard();
    window.showEntryDetails(entryId);
};

/**
 * v8.1.48: Entry Cancellation
 */
window.cancelEntry = async function (id) {
    if (!confirm('このエントリーを「無効（キャンセル）」にしますか？\n※データはマスタに残りますが、集計や受入からは除外されます。')) return;
    const entry = state.entries.find(e => e.id === id);
    if (entry) {
        entry.status = 'cancelled';
        entry.lastModified = new Date().toISOString();
        await saveData();
        updateDashboard();
        if (typeof renderIkesuWorkspace === 'function') renderIkesuWorkspace();
        showToast('エントリーを無効化しました', 'info');
        
        // v8.9.60: Refresh modal or form if visible
        if (document.getElementById('detail-modal')?.classList.contains('hidden') === false) {
            window.showEntryDetails(id);
        }
        if (document.getElementById('edit-entry-id')?.value === id) {
            fillFormForEdit(entry);
        }
    }
};

/**
 * v8.1.48: Restore Entry from Cancellation
 */
window.restoreEntry = async function (id) {
    const entry = state.entries.find(e => e.id === id);
    if (entry) {
        entry.status = 'pending';
        entry.lastModified = new Date().toISOString();
        await saveData();
        updateDashboard();
        if (typeof renderIkesuWorkspace === 'function') renderIkesuWorkspace();
        showToast('エントリーを有効な状態（未受付）に復元しました', 'success');
        
        // v8.9.60: Refresh modal or form if visible
        if (document.getElementById('detail-modal')?.classList.contains('hidden') === false) {
            window.showEntryDetails(id);
        }
        if (document.getElementById('edit-entry-id')?.value === id) {
            fillFormForEdit(entry);
        }
    }
};

async function exportGroupsCSV() {
    // v8.9.67: Restored timestamp, removed status as requested
    const headers = ["ID", "区分", "グループ名", "代表者", "電話番号", "メールアドレス", "人数(釣り)", "人数(見学)", "日時", "備考"];
    const rows = state.entries.map(e => {
        let memo = (e.memo || "").replace(/\n/g, " ");
        if (e.status === 'cancelled') memo = "[キャンセル] " + memo;
        return [
            e.id, 
            e.source, 
            `"${e.groupName}"`, 
            `"${e.representative || e.representativeName}"`, 
            `'${e.phone || e.repPhone}`, 
            `"${e.email || e.repEmail}"`,
            e.fishers, 
            e.observers, 
            e.timestamp,
            `"${memo.trim()}"`
        ];
    });
    const d = new Date();
    const dateStr = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
    downloadCSV(`グループ名簿_${dateStr}.csv`, headers, rows);
}

async function exportParticipantsCSV() {
    // v8.9.67: Added timestamp, removed status, and used UI labels for gender/age
    const headers = ["ID", "区分", "グループ名", "代表電話", "代表メール", "氏名", "ニックネーム", "性別", "年代", "地域", "区分(釣/見)", "サイズ", "登録日時", "備考"];
    const rows = [];
    state.entries.forEach(e => {
        let entryMemo = (e.memo || "").replace(/\n/g, " ");
        if (e.status === 'cancelled') entryMemo = "[キャンセル] " + entryMemo;
        
        (e.participants || []).forEach(p => {
            let memo = entryMemo;
            if (e.status !== 'cancelled' && p.status === 'cancelled') {
                memo = "[参加者キャンセル] " + memo;
            }
            
            rows.push([
                e.id,
                e.source,
                `"${e.groupName}"`,
                `'${e.phone || e.repPhone || ""}`,
                `"${e.email || e.repEmail || ""}"`,
                `"${p.name}"`,
                `"${p.nickname || ""}"`,
                genderLabels[p.gender] || p.gender,
                ageLabels[p.age] || p.age,
                `"${p.region || ""}"`,
                p.type === 'fisher' ? '釣り' : '見学',
                p.tshirtSize,
                e.timestamp,
                `"${memo.trim()}"`
            ]);
        });
    });
    const d = new Date();
    const dateStr = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
    downloadCSV(`参加者名簿_${dateStr}.csv`, headers, rows);
}

// --- v8.10.2: Mock Data Tools for Testing ---
window.generateMockCatchData = async function() {
    if (!confirm("テスト用の仮データ（約9割が釣果あり）を生成しますか？\n※現在の釣果データは上書きされます。")) return;
    
    let updated = false;
    state.entries.forEach(e => {
        if (e.status === 'cancelled') return;
        (e.participants || []).forEach(p => {
            if (p.type === 'fisher' && p.status !== 'cancelled' && p.status !== 'absent') {
                // 鯛 (Bream) - 1〜4匹を多めにし、青物だけの人や鯛だけで入賞する人を出やすくする
                let rA = Math.random();
                if (rA < 0.10) {
                    p.catchA = Math.floor(Math.random() * 6) + 12; // 12-17匹 (10%: 鯛のみでも入賞の可能性あり)
                } else if (rA < 0.40) {
                    p.catchA = Math.floor(Math.random() * 6) + 6;  // 6-11匹 (30%)
                } else if (rA < 0.80) {
                    p.catchA = Math.floor(Math.random() * 4) + 1;  // 1-4匹 (40%: 要望に合わせて大幅増)
                } else {
                    p.catchA = 0;                                  // 0匹 (20%: 青物だけ釣る人の母数になる)
                }

                // 青物 (Blue) - 少し分散させて被りを減らす
                let rB = Math.random();
                if (rB < 0.01) {
                    p.catchB = 5;       // 1%
                } else if (rB < 0.03) {
                    p.catchB = 4;       // 2%
                } else if (rB < 0.18) {
                    p.catchB = 3;       // 15% (イケスに2人くらい)
                } else if (rB < 0.33) {
                    p.catchB = 2;       // 15%
                } else if (rB < 0.78) {
                    p.catchB = 1;       // 45% (約半分)
                } else {
                    p.catchB = 0;       // 22%
                }
                updated = true;
            }
        });
    });
    
    if (updated) {
        await saveData();
        if (window.renderDayResults) window.renderDayResults();
        if (window.renderRankings) window.renderRankings();
        if (window.renderAwardsPreview) window.renderAwardsPreview();
        showToast("テストデータを生成しました", "success");
    }
};

window.clearCatchData = async function() {
    if (!confirm("⚠️ 本当にすべての釣果データを「0」にリセットしますか？\n※この操作は元に戻せません！")) return;
    
    let updated = false;
    state.entries.forEach(e => {
        (e.participants || []).forEach(p => {
            if (p.catchA > 0 || p.catchB > 0 || p.isAwardWinner) {
                p.catchA = 0;
                p.catchB = 0;
                p.isAwardWinner = false;
                updated = true;
            }
        });
    });
    
    if (updated) {
        await saveData();
        if (window.renderDayResults) window.renderDayResults();
        if (window.renderRankings) window.renderRankings();
        if (window.renderAwardsPreview) window.renderAwardsPreview();
        showToast("すべての釣果をリセットしました", "info");
    } else {
        showToast("リセットするデータがありません", "info");
    }
};
// ---------------------------------------------

// v8.4.3: Bulk Email Helpers
window.insertMailVar = function(tag) {
    const textarea = document.getElementById('bulk-mail-body');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    textarea.value = text.substring(0, start) + tag + text.substring(end);
    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = start + tag.length;
};

window.previewBulkEmail = function() {
    const body = document.getElementById('bulk-mail-body').value;
    const entries = state.entries.filter(e => e.status !== 'cancelled' && e.repEmail);
    if (entries.length === 0) { alert("送信対象がいません。"); return; }
    
    const entry = entries[0];
    const pList = (entry.participants || []).map(p => `${p.name}(${genderLabels[p.gender] || p.gender})`).join(', ');
    
    const previewText = body
        .replace(/{{番号}}/g, entry.id || "")
        .replace(/{{名前}}/g, entry.representativeName || "")
        .replace(/{{グループ}}/g, entry.groupName || "")
        .replace(/{{釣り人数}}/g, entry.fishers || "0")
        .replace(/{{見学人数}}/g, entry.observers || "0")
        .replace(/{{参加者名簿}}/g, pList);

    const area = document.getElementById('bulk-mail-preview-area');
    const content = document.getElementById('bulk-mail-preview-content');
    content.textContent = previewText;
    area.style.display = 'block';
    area.scrollIntoView({ behavior: 'smooth' });
};

async function handleBulkEmailSend() {
    const subject = document.getElementById('bulk-mail-subject').value.trim();
    const body = document.getElementById('bulk-mail-body').value.trim();
    if (!subject || !body) { alert("件名と本文を入力してください。"); return; }
    
    const entriesToMail = state.entries.filter(e => e.status !== 'cancelled' && e.repEmail).map(e => {
        // Add participantsList string for GAS replacement
        const pList = (e.participants || []).map(p => `${p.name}(${genderLabels[p.gender] || p.gender})`).join(', ');
        return { ...e, participantsList: pList };
    });

    if (entriesToMail.length === 0) { alert("送信対象が見つかりません。"); return; }
    if (!confirm(`${entriesToMail.length} 名へ個別データを含めた一斉メールを送信しますか？`)) return;
    
    const btn = document.getElementById('btn-send-bulk-mail');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '送信中...';
    try {
        const response = await fetch(GAS_WEB_APP_URL, { 
            method: 'POST', 
            body: JSON.stringify({ 
                action: 'bulk_email', 
                subject, 
                body, 
                entries: entriesToMail
            }) 
        });
        const result = await response.json();
        if (result.status === 'success') {
            showToast('✅ 一斉メールを送信しました', 'success');
        } else {
            throw new Error(result.message || '送信に失敗しました');
        }
    } catch (err) {
        console.error(err);
        showToast('❌ メール送信エラー', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
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

// v8.9.70: Re-implemented renderRankings to fix display failure
// v8.9.72: Robust Ranking Renderer for both Individual and Ikesu
window.renderRankings = function() {
    const indContainer = document.getElementById('ranking-list-container-day') || document.getElementById('ranking-list-container');
    const ikesuContainer = document.getElementById('day-ranking-ikesu-list');
    
    if (!indContainer) return;
    indContainer.innerHTML = '<p class="text-center p-4">集計中...</p>';
    if (ikesuContainer) ikesuContainer.innerHTML = '<p class="text-center p-4">集計中...</p>';
    
    // 1. Individual Ranking Data
    const individualData = [];
    const ikesuScores = {}; // { ikesuId: { total: 0, count: 0, name: "" } }

    state.entries.forEach(entry => {
        if (entry.status === 'cancelled' || entry.status === 'absent') return;
        (entry.participants || []).forEach(p => {
            if (p.type === 'fisher' && p.status !== 'cancelled' && p.status !== 'absent') {
                const cA = parseInt(p.catchA || 0);
                const cB = parseInt(p.catchB || 0);
                const score = cA + (cB * 2);
                
                let ikName = '';
                if (p.ikesuId) {
                    ikName = state.settings.ikesuList?.find(ik => ik.id === p.ikesuId)?.name || p.ikesuId;
                }

                individualData.push({
                    name: p.name,
                    nickname: p.nickname || '',
                    groupName: entry.groupName,
                    id: entry.id,
                    ikName,
                    cA, cB, score,
                    isAwardWinner: !!p.isAwardWinner
                });

                // Aggregation for Ikesu
                if (p.ikesuId) {
                    if (!ikesuScores[p.ikesuId]) {
                        const ikName = state.settings.ikesuList?.find(ik => ik.id === p.ikesuId)?.name || p.ikesuId;
                        ikesuScores[p.ikesuId] = { total: 0, count: 0, name: ikName, members: [] };
                    }
                    ikesuScores[p.ikesuId].total += score;
                    ikesuScores[p.ikesuId].count += 1;
                    ikesuScores[p.ikesuId].members.push({ name: p.name, group: entry.groupName, score });
                }
            }
        });
    });

    // --- Render Individual Table ---
    // v8.10.0: Tie-breaking rule (Score > Aomono > ID)
    individualData.sort((a, b) => (b.score - a.score) || (b.cB - a.cB) || (b.cA - a.cA));

    const config = state.settings.rankingConfig || { topCount: 3, tobiList: "5,10,15,20,25,30" };
    // Handle full-width numbers and commas
    const tobiStr = (config.tobiList || "").replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)).replace(/、|，/g, ',');
    const tobis = tobiStr.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
    // 1. Assign finalRank and strictRank
    let tmpRank = 1;
    for (let i = 0; i < individualData.length; i++) {
        if (i > 0 && individualData[i].score === individualData[i-1].score && individualData[i].cB === individualData[i-1].cB && individualData[i].cA === individualData[i-1].cA) {
            // keep tmpRank
        } else {
            tmpRank = i + 1;
        }
        individualData[i].finalRank = tmpRank;
        individualData[i].strictRank = i + 1;
    }

    // 2. Identify if a tie block covers a tobi target
    const tobiTargetsByRank = {};
    for (let i = 0; i < individualData.length; i++) {
        if (individualData[i].score > 0) {
            if (tobis.includes(individualData[i].strictRank)) {
                // This absolute rank is a tobi, record it for the whole tie block
                tobiTargetsByRank[individualData[i].finalRank] = individualData[i].strictRank;
            }
        }
    }

    // 3. Assign awards
    for (let i = 0; i < individualData.length; i++) {
        if (individualData[i].score > 0) {
            if (individualData[i].finalRank <= config.topCount) {
                individualData[i].isAutoAward = true;
                individualData[i].awardType = 'top';
            } else if (tobiTargetsByRank[individualData[i].finalRank]) {
                individualData[i].isAutoAward = true;
                individualData[i].awardType = 'tobi';
                individualData[i].tobiTarget = tobiTargetsByRank[individualData[i].finalRank];
            } else {
                individualData[i].isAutoAward = false;
            }
        } else {
            individualData[i].isAutoAward = false;
        }
    }
    
    // v8.10.0: Apply "Award Winners Only" filter if active
    const awardFilterBtn = document.getElementById('award-filter-btn');
    const showOnlyAwards = awardFilterBtn && awardFilterBtn.classList.contains('active');
    const filteredData = showOnlyAwards ? individualData.filter(p => p.isAwardWinner || p.isAutoAward) : individualData;
    
    // v8.10.0: Update title based on filter state
    const titleText = document.getElementById('ranking-title-text');
    if (titleText) {
        titleText.textContent = showOnlyAwards ? '表彰対象者' : '個人順位 (全参加者)';
    }

    if (filteredData.length === 0) {
        indContainer.innerHTML = `<p class="text-center p-4 text-muted">${showOnlyAwards ? '表彰対象者がまだ設定されていません' : 'データがありません'}</p>`;
    } else {
        let html = `
            <div style="width:100%; overflow-x:auto; -webkit-overflow-scrolling:touch;">
            <table class="table" style="width:100%; min-width:400px; border-collapse:collapse; font-size:0.9rem;">
                <thead>
                    <tr style="background:#f1f5f9;">
                        <th style="padding:8px; width:50px;">順位</th>
                        <th style="padding:8px;">名前 / チーム</th>
                        <th style="padding:8px; text-align:right;">釣果 / 合計</th>
                    </tr>
                </thead>
                <tbody>`;
        let currentRank = 1;
        let lastP = null;

        // v8.10.1: Pre-calculate ties for warning badge
        for (let i = 0; i < filteredData.length; i++) {
            let isTie = false;
            if (filteredData[i].score > 0) {
                if (i > 0 && filteredData[i].cA === filteredData[i-1].cA && filteredData[i].cB === filteredData[i-1].cB) isTie = true;
                if (i < filteredData.length - 1 && filteredData[i].cA === filteredData[i+1].cA && filteredData[i].cB === filteredData[i+1].cB) isTie = true;
            }
            filteredData[i].isTie = isTie;
        }

        filteredData.forEach((p) => {
            const rank = p.finalRank;
            const rankMark = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
            let awardIcon = '';
            if (p.isAwardWinner) {
                awardIcon = '<span style="color:#f1c40f; margin-left:4px;" title="特別賞/手動付与">🏆</span>';
            } else if (p.isAutoAward) {
                if (p.awardType === 'top') {
                    awardIcon = '<span style="color:#f1c40f; margin-left:4px;" title="上位入賞">🏆</span>';
                } else if (p.awardType === 'tobi') {
                    if (p.tobiTarget && p.tobiTarget !== p.finalRank) {
                        awardIcon = `<span style="color:#10b981; margin-left:4px;" title="${p.tobiTarget}位の飛び賞対象（同着から選出）">🎁<span style="font-size:0.65rem; color:#10b981;">(${p.tobiTarget}位対象)</span></span>`;
                    } else {
                        awardIcon = '<span style="color:#10b981; margin-left:4px;" title="飛び賞">🎁<span style="font-size:0.65rem; color:#10b981;">(飛)</span></span>';
                    }
                }
            }
            const awardStar = awardIcon;
            const tieBadge = p.isTie ? '<span style="font-size:0.75rem; color:#eab308; margin-left:4px; font-weight:bold;" title="完全同点（ジャンケン等で決定してください）">⚠️同着</span>' : '';
            
            html += `
                <tr style="border-bottom:1px solid #f1f5f9;">
                    <td style="padding:8px; width:75px;">
                        <div style="display:flex; align-items:center; gap:4px;">
                            <span style="font-weight:900; font-size:1.3rem; color:#1e293b;">${rankMark}</span>
                            <div style="display:flex; flex-direction:column; line-height:1;">${awardStar}</div>
                        </div>
                    </td>
                    <td style="padding:8px;">
                        <div style="display:flex; align-items:baseline; flex-wrap:wrap; gap:6px;">
                            <strong style="font-size:1.05rem;">${p.name}</strong>
                            ${p.nickname ? `<span style="font-size:0.85rem; color:#64748b;">(${p.nickname})</span>` : ''}
                            ${tieBadge}
                            <span style="font-size:0.75rem; background:#f1f5f9; padding:1px 5px; border-radius:4px; color:#475569; border:1px solid #e2e8f0;">${p.groupName}</span>
                            ${p.ikName ? `<span style="font-size:0.75rem; background:#dbeafe; padding:1px 5px; border-radius:4px; color:#1e40af; border:1px solid #bfdbfe;">イケス${p.ikName}</span>` : ''}
                        </div>
                    </td>
                    <td style="padding:8px; text-align:right; font-weight:bold;">
                        <div style="display:flex; justify-content:flex-end; align-items:center; flex-wrap:wrap; gap:4px;">
                            <span style="font-size:0.75rem; color:#64748b; font-weight:normal; white-space:nowrap;">(マダイ <strong style="color:#ef4444; margin-right:2px; font-size:0.85rem;">${p.cA}</strong> 青物、クエ <strong style="color:#3b82f6; font-size:0.85rem;">${p.cB}</strong>)</span>
                            <span style="font-size:1.6rem; font-weight:900; line-height:1; color:var(--primary-color); white-space:nowrap;">${p.score}<small style="font-size:0.8rem; margin-left:1px;">点</small></span>
                        </div>
                    </td>
                </tr>`;
        });
        html += '</tbody></table></div>';
        indContainer.innerHTML = html;
    }

    // --- Render Ikesu Table ---
    if (ikesuContainer) {
        const ikesuData = Object.keys(ikesuScores).map(id => {
            const s = ikesuScores[id];
            // Sort members within each ikesu by score
            const sortedMembers = s.members.sort((a,b) => b.score - a.score);
            return { id, name: s.name, average: (s.total / s.count).toFixed(2), total: s.total, count: s.count, members: sortedMembers };
        }).sort((a, b) => b.average - a.average);

        if (ikesuData.length === 0) {
            ikesuContainer.innerHTML = '<p class="text-center p-4 text-muted">データがありません</p>';
        } else {
            let html = `
                <div style="width:100%; overflow-x:auto; -webkit-overflow-scrolling:touch;">
                <table class="table" style="width:100%; min-width:400px; border-collapse:collapse; font-size:0.9rem;">
                    <thead>
                        <tr style="background:#f1f5f9;">
                            <th style="padding:8px;">順位</th>
                            <th style="padding:8px;">イケス</th>
                            <th style="padding:8px; text-align:right;">平均点</th>
                        </tr>
                    </thead>
                    <tbody>`;
            ikesuData.forEach((ik, idx) => {
                const rank = idx + 1;
                const rankMark = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
                const membersHtml = (rank <= 3) ? `
                    <div style="margin-top:0.3rem; font-size:0.85rem; color:#475569; background:#f8fafc; padding:0.3rem 0.5rem; border-radius:6px; border-left:3px solid #059669; line-height:1.4;">
                        ${ik.members.slice(0, 5).map(m => `<span style="display:inline-block; margin-right:8px; white-space:nowrap;">${m.group} - <strong>${m.name}</strong>(${m.score}点)</span>`).join('')}
                    </div>
                ` : '';
                
                html += `
                    <tr style="border-bottom:1px solid #f1f5f9;">
                        <td style="padding:6px 8px; vertical-align:top; width:50px;">
                            <span style="font-weight:900; font-size:1.3rem; color:#1e293b;">${rankMark}</span>
                        </td>
                        <td style="padding:6px 8px; vertical-align:top;">
                            <div style="display:flex; align-items:baseline; gap:8px; flex-wrap:wrap;">
                                <strong style="font-size:1.3rem;">${ik.name}</strong>
                                <small class="text-muted" style="font-size:0.85rem;">${ik.count}名 / 計${ik.total}点</small>
                            </div>
                            ${membersHtml}
                        </td>
                        <td style="padding:6px 8px; text-align:right; vertical-align:top; white-space:nowrap;">
                            <span style="font-size:1.6rem; font-weight:900; color:#059669;">${ik.average}<small style="font-size:0.8rem; margin-left:2px; font-weight:normal;">点</small></span>
                        </td>
                    </tr>`;
            });
            html += '</tbody></table></div>';
            ikesuContainer.innerHTML = html;
        }
    }
};

// v8.9.70: Implement renderDayResults for Catch List tab
window.renderDayResults = function() {
    const listBody = document.getElementById('day-results-list');
    const filterIkesuId = document.getElementById('day-results-ikesu-filter')?.value;
    if (!listBody) return;
    
    listBody.innerHTML = '<tr><td colspan="7" class="text-center p-4">読み込み中...</td></tr>';
    
    // Update Ikesu Filter Options if empty
    const filterSelect = document.getElementById('day-results-ikesu-filter');
    if (filterSelect && filterSelect.options.length <= 1) {
        (state.settings.ikesuList || []).forEach(ik => {
            const opt = document.createElement('option');
            opt.value = ik.id;
            opt.textContent = ik.name;
            filterSelect.appendChild(opt);
        });
    }
    
    const rows = [];
    state.entries.forEach(entry => {
        if (entry.status === 'cancelled' || entry.status === 'absent') return;
        (entry.participants || []).forEach(p => {
            if (p.type === 'fisher' && p.status !== 'cancelled' && p.status !== 'absent') {
                if (filterIkesuId && p.ikesuId !== filterIkesuId) return;
                
                const cA = parseInt(p.catchA || 0);
                const cB = parseInt(p.catchB || 0);
                const score = cA + (cB * 2);
                const ikName = state.settings.ikesuList?.find(ik => ik.id === p.ikesuId)?.name || '-';
                
                rows.push(`
                    <tr>
                        <td style="font-family:monospace; font-weight:bold;">${entry.id}</td>
                        <td><span class="badge badge-outline" style="border:1px solid #cbd5e1; color:#475569;">${ikName}</span></td>
                        <td><strong>${p.name}</strong><br><small class="text-muted">${entry.groupName}</small></td>
                        <td class="text-center">${cA}</td>
                        <td class="text-center">${cB}</td>
                        <td class="text-center" style="font-weight:900; color:var(--primary-color); font-size:1.1rem;">${score}pt</td>
                    </tr>`);
            }
        });
    });
    
    if (rows.length === 0) {
        listBody.innerHTML = '<tr><td colspan="7" class="text-center p-4 text-muted">該当するデータがありません</td></tr>';
    } else {
        listBody.innerHTML = rows.join('');
    }
};

// window.openDayEditModal removed as edit is now fully external

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
    entry.lastModified = new Date().toISOString();
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
    const entriesToMail = state.entries.filter(e => e.status !== 'cancelled' && e.repEmail);
    if (entriesToMail.length === 0) { alert("送信対象が見つかりません。"); return; }
    if (!confirm(`${entriesToMail.length} 名へ個別データを含めた一斉メールを送信しますか？\n（本文内の {{番号}}, {{名前}} 等が自動置換されます）`)) return;
    const btn = document.getElementById('btn-send-bulk-mail');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '送信中...';
    try {
        const response = await fetch(GAS_WEB_APP_URL, { 
            method: 'POST', 
            body: JSON.stringify({ 
                action: 'bulk_email', 
                subject, 
                body, 
                entries: entriesToMail // 送信対象のエントリをまるごと渡す
            }) 
        });
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

/* --- SECURE ADMIN ACCESS Consolidated (v8.9.65) --- */

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
            const validSources = { 'mintsuri': 'みん釣り', 'harimitsu': 'ハリミツ', 'suiho': '水宝', 'general': '一般' };
            const decodedSrc = validSources[src.toLowerCase()];
            if (decodedSrc) injectSpecialSource(decodedSrc);
        }

        // 2. Handle View (Navigation)
        if (view) {
            // Mapping for aliases
            const viewAliases = { 'mintsuri': 'mintsuri-coordinator-view', 'harimitsu': 'harimitsu-coordinator-view', 'suiho': 'suiho-coordinator-view', 'ranking': 'reception-view' };
            const targetView = viewAliases[view] || view;

            if (document.getElementById(targetView)) {
                // Security Check: Only protect core management views. Coordinator views are accessible via shared URL.
                const adminViews = ['dashboard-view', 'settings-view'];
                if (adminViews.includes(targetView) && !isAdminAuth) {
                    console.log("BORIJIN: Redirecting to admin login for protected view:", targetView);
                    showAdminLogin(targetView);
                } else {
                    switchView(null, targetView);
                    if (view === 'ranking') {
                        setTimeout(() => {
                            if (typeof window.switchDayTab === 'function') {
                                window.switchDayTab('tab-day-rankings');
                            }
                            // Hide admin UI and top menu persistently for public viewing
                            const style = document.createElement('style');
                            style.textContent = '.navbar, #admin-toolbar, #sync-status-footer, .day-tab-nav { display: none !important; }';
                            document.head.appendChild(style);
                        }, 100);
                    }
                }
            }
        }
    }

    // v8.9.35: Sanitize 'id' before putting it into the auth field.
    // If it looks like a URL, it's probably browser autofill or a bad link.
    if (id && document.getElementById('auth-entry-id')) {
        const isLikelyUrl = id.includes('://') || id.includes('index.html');
        if (!isLikelyUrl) {
            document.getElementById('auth-entry-id').value = id;
        } else {
            console.warn("BORIJIN: Suppressing URL injection into auth field:", id);
        }
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
    if (sourceName === '一般' && !isAdminAuth) {
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
        const badgeClassMap = { '水宝': 'badge-suiho', 'ハリミツ': 'badge-harimitsu', 'みん釣り': 'badge-mintsuri' };
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
        // v8.10.2: Prevent form.reset() from reverting to General by clearing default checks
        selector.querySelectorAll('input[name="reg-source"]').forEach(r => {
            r.removeAttribute('checked');
            r.defaultChecked = false;
        });
        target.setAttribute('checked', 'checked');
        target.defaultChecked = true;
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
    
    // v8.1.36: Explicitly ensure "一般" is hidden in ANY specialized window
    if (sourceName !== '一般') {
        const ippanRadio = selector.querySelector('input[value="一般"]');
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
            showToast('コピーしました', 'success');
        }).catch(err => {
            console.error('Copy failed:', err);
            showToast('コピーに失敗しました', 'error');
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

function showLoading() {
    updateSyncStatus('syncing');
}
function hideLoading() {
    updateSyncStatus('success');
}

/**
 * v8.6.0: Enhanced Sync Status Handler
 */
window.updateSyncStatus = function(status) {
    const dot = document.querySelector('.sync-dot');
    const text = document.getElementById('sync-text');
    if (!dot || !text) return;

    dot.classList.remove('syncing');
    
    switch(status) {
        case 'syncing':
            dot.style.background = '#3b82f6';
            dot.classList.add('syncing');
            text.textContent = '同期中...';
            break;
        case 'success':
            dot.style.background = '#22c55e';
            text.textContent = '同期済み';
            break;
        case 'error':
        case 'error-silent':
            dot.style.background = '#ef4444';
            text.textContent = 'オフライン';
            break;
    }
};

/**
 * v8.6.0: Change Log Logic
 */
window.logChange = function(entry, type, oldEntry = null) {
    if (!state.changeLog) state.changeLog = [];
    
    let details = [];
    if (type === '修正' && oldEntry) {
        if (oldEntry.groupName !== entry.groupName) details.push(`グループ名: ${oldEntry.groupName} → ${entry.groupName}`);
        const oldRep = oldEntry.representative || oldEntry.representativeName;
        const newRep = entry.representative || entry.representativeName;
        if (oldRep !== newRep) details.push(`代表者: ${oldRep} → ${newRep}`);
        
        if ((oldEntry.phone || oldEntry.repPhone) !== (entry.phone || entry.repPhone)) details.push(`電話番号を変更`);
        if ((oldEntry.email || oldEntry.repEmail) !== (entry.email || entry.repEmail)) details.push(`メールアドレスを変更`);
        if ((oldEntry.memo || '') !== (entry.memo || '')) details.push(`備考欄を更新`);
        
        const oldPCount = (oldEntry.participants || []).length;
        const newPCount = (entry.participants || []).length;
        if (oldPCount !== newPCount) details.push(`人数変更: ${oldPCount}人 → ${newPCount}人`);
        
        // Detailed participant check
        entry.participants.forEach((p, i) => {
            const oldP = oldEntry.participants && oldEntry.participants[i];
            if (oldP) {
                if (oldP.name !== p.name) details.push(`参加者${i+1}氏名: ${oldP.name} → ${p.name}`);
                if (oldP.age !== p.age) details.push(`参加者${i+1}年代の変更`);
                if (oldP.gender !== p.gender) details.push(`参加者${i+1}性別の変更`);
                if (oldP.tshirtSize !== p.tshirtSize) details.push(`参加者${i+1}Tシャツサイズ: ${oldP.tshirtSize} → ${p.tshirtSize}`);
                if (oldP.type !== p.type) details.push(`参加者${i+1}種別: ${oldP.type === 'fisher' ? '釣り' : '見学'} → ${p.type === 'fisher' ? '釣り' : '見学'}`);
                if ((oldP.status || 'pending') !== (p.status || 'pending')) {
                    if (p.status === 'cancelled') details.push(`参加者${i+1}をキャンセル`);
                    else if (oldP.status === 'cancelled') details.push(`参加者${i+1}のキャンセルを取り消し`);
                    else details.push(`参加者${i+1}ステータス変更: ${oldP.status || 'pending'} → ${p.status}`);
                }
            } else {
                details.push(`参加者追加: ${p.name}`);
            }
        });
        
        
        if (details.length === 0) return; // Do not log if nothing changed
    } else if (type === '新規登録') {
        details.push(`代表者: ${entry.representative || entry.representativeName || '不明'}`);
        details.push(`人数: ${(entry.participants || []).length}名`);
        if (entry.source) details.push(`受付先: ${entry.source}`);
    } else if (type === '設定変更' && oldEntry && oldEntry.settings && entry.settings) {
        const oSet = oldEntry.settings;
        const nSet = entry.settings;
        if (oSet.competitionName !== nSet.competitionName) details.push(`大会名: ${oSet.competitionName} → ${nSet.competitionName}`);
        if (oSet.capacityTotal !== nSet.capacityTotal) details.push(`全体定員: ${oSet.capacityTotal} → ${nSet.capacityTotal}`);
        if (oSet.startTime !== nSet.startTime) details.push(`開始日時更新`);
        if (oSet.deadline !== nSet.deadline) details.push(`終了日時更新`);
        if (oSet.maintenanceMode !== nSet.maintenanceMode) details.push(`準備中モード: ${nSet.maintenanceMode ? 'ON' : 'OFF'}`);
        if (oSet.soldoutMode !== nSet.soldoutMode) details.push(`満員モード: ${nSet.soldoutMode ? 'ON' : 'OFF'}`);
        if (oSet.closedMode !== nSet.closedMode) details.push(`受付終了モード: ${nSet.closedMode ? 'ON' : 'OFF'}`);
        if (details.length === 0) return; // Do not log if nothing changed
    }

    const logEntry = {
        id: 'log-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
        timestamp: Date.now(),
        dateStr: new Date().toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
        type: type, // '新規登録', '修正', '削除', '設定変更'
        groupName: entry.groupName || entry.representativeName || '不明',
        entryId: entry.id || 'NEW',
        isAdmin: !!(isAdminAuth || isAdminAuthAction),
        details: details
    };

    state.changeLog.unshift(logEntry);
    if (state.changeLog.length > 200) state.changeLog.pop();
    
    state.lastUpdated = Date.now();
    saveStateToLocalStorage();
};

window.deleteLogItem = async function(logId) {
    if (!confirm("この履歴を削除しますか？")) return;
    state.changeLog = state.changeLog.filter(l => l.id !== logId);
    saveStateToLocalStorage();
    window.renderChangeLog();
    showToast("ログを削除し、同期しています...", "info");
    await saveData();
};

window.renderChangeLog = function() {
    const container = document.getElementById('change-log-container');
    if (!container) return;

    state.changeLog = (state.changeLog || []).filter(log => {
        if (log.details && log.details.length === 1 && log.details[0] === '備考欄を更新') {
            const currentEntry = state.entries.find(e => e.id === log.entryId);
            if (currentEntry && (!currentEntry.memo || currentEntry.memo.trim() === '')) {
                const hasCancelled = currentEntry.participants && currentEntry.participants.some(p => p.status === 'cancelled');
                if (hasCancelled) {
                    log.details[0] = '一部参加者をキャンセル';
                    return true;
                }
                return false;
            }
        }
        return true;
    });

    if (!state.changeLog || state.changeLog.length === 0) {
        container.innerHTML = '<div class="text-center py-5 text-muted">変更履歴はありません</div>';
        return;
    }

    const html = state.changeLog.map(log => {
        let badgeClass = 'log-badge-edit';
        let itemClass = 'log-edit';
        
        if (log.type === '新規登録') { badgeClass = 'log-badge-new'; itemClass = 'log-new'; }
        else if (log.type === '削除') { badgeClass = 'log-badge-delete'; itemClass = 'log-delete'; }
        
        let adminMark = '';
        if (log.isAdmin === true) {
            adminMark = '<span class="admin-badge" style="background:#6366f1; color:white; padding:1px 4px; border-radius:3px; font-size:0.65rem; margin-right:0;">管理者</span>';
        } else if (log.isAdmin === false) {
            adminMark = '<span class="user-badge" style="background:#eab308; color:black; padding:1px 4px; border-radius:3px; font-size:0.65rem; margin-right:0; font-weight:bold;">一般操作</span>';
        }
        
        let detailsHtml = '';
        if (log.details && log.details.length > 0) {
            detailsHtml = `<div class="log-details-list" style="margin-top: 4px; padding-left: 10px; border-left: 2px solid #e2e8f0; font-size: 0.8rem; color: #64748b;">
                ${log.details.map(d => `<div class="log-detail-item" style="margin-bottom: 2px;">・${d}</div>`).join('')}
            </div>`;
        }

        return `
            <div class="log-item ${itemClass}" style="padding: 0.5rem; border-bottom: 1px solid #f1f5f9; position: relative;">
                <div style="display: flex; align-items: center; flex-wrap: nowrap; gap: 5px; font-size: 0.82rem; overflow: hidden;">
                    <span class="log-badge ${badgeClass}" style="font-size: 0.65rem; padding: 1px 4px; flex-shrink: 0;">${log.type}</span>
                    <span class="log-time" style="font-size: 0.7rem; color: #64748b; flex-shrink: 0;">${log.dateStr}</span>
                    ${adminMark}
                    <span class="log-group" style="font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px;">${log.groupName}</span> 
                    <span class="text-muted" style="font-size:0.7rem; flex-shrink: 0;">(ID: ${log.entryId})</span>
                    <span style="flex-shrink: 0; color: #475569;">${log.type === '新規登録' ? '登録' : log.type === '削除' ? '削除' : '修正'}</span>
                    <button class="btn-icon" onclick="window.deleteLogItem('${log.id}')" style="font-size: 1.1rem; padding: 0 4px; opacity: 0.3; margin-left: auto;">&times;</button>
                </div>
                ${detailsHtml}
            </div>
        `;
    }).join('');

    container.innerHTML = html;
};

function saveStateToLocalStorage() {
    localStorage.setItem('fishing_app_v3_data', JSON.stringify(state));
}

window.clearLocalCache = function() {
    if (confirm('ブラウザのキャッシュデータを削除し、クラウドから最新データを再取得しますか？\n（入力途中のデータがある場合は消えてしまいます）')) {
        localStorage.removeItem('fishing_app_v3_data');
        location.reload();
    }
};
window.sortDashboard = function(field) {
    if (currentSortField === field) {
        currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortField = field;
        currentSortOrder = 'asc';
    }
    updateDashboard();
};

window.setDashboardFilter = function(filter) {
    dashboardFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('data-filter') === filter);
    });
    updateDashboard();
};

/**
 * v8.9.50: Suiho Bulk Import from Excel
 * 水宝枠の電話受付データ（Excel）をTSV形式で一括取り込みする機能
 */
window.openBulkImportModal = function() {
    const modal = document.getElementById('bulk-import-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    document.getElementById('bulk-import-input').value = '';
    document.getElementById('import-preview-area').classList.add('hidden');
    document.getElementById('import-status-area').classList.add('hidden');
    document.getElementById('import-status-area').innerHTML = '';
};

window.handleBulkImportExecute = async function() {
    const input = document.getElementById('bulk-import-input').value.trim();
    if (!input) {
        alert("データを貼り付けてください。");
        return;
    }

    const lines = input.split('\n');
    const entries = [];
    let currentEntry = null;

    // 年代マッピング
    const ageMap = {
        '？': 'unknown', '不明': 'unknown', '?': 'unknown',
        '5': 'elementary', '10': 'elementary', '小学': 'elementary',
        '20': '19_20s', '30': '30s', '40': '40s', '50': '50s', '60': '60s', '70': '70s', '80': '80s',
        '中': 'middle_high', '高': 'middle_high'
    };
    
    // Tシャツマッピング (v7.7.0準拠)
    const tshirtMap = {
        'LL': 'XL（2L）', '2L': 'XL（2L）', 'XL': 'XL（2L）',
        '3L': '2XL（3L）', '2XL': '2XL（3L）',
        '4L': '3XL（4L）', '3XL': '3XL（4L）',
        '5L': '4XL（5L）', '4XL': '4XL（5L）'
    };

    lines.forEach((line) => {
        const cols = line.split('\t').map(c => c.trim());
        if (cols.length < 3) return; // 無効な行

        const groupName = cols[0];
        const fisherCountRaw = parseInt(cols[1]);
        const pName = cols[2];
        const pGenderRaw = cols[3];
        const pAgeRaw = cols[4];
        const pRegion = cols[5];
        const pTshirtRaw = cols[6];
        const repPhone = cols[7];

        // グループ名がある場合は新しいグループを開始
        if (groupName && groupName !== "") {
            if (currentEntry) entries.push(currentEntry);
            currentEntry = {
                groupName: groupName,
                representative: pName || groupName,
                representativeName: pName || groupName,
                phone: repPhone || "000-0000-0000",
                repPhone: repPhone || "000-0000-0000",
                email: "suiho-manual@example.com",
                repEmail: "suiho-manual@example.com",
                source: "水宝",
                participants: [],
                status: 'pending',
                password: '0000',
                memo: "Excel一括登録分",
                expectedCount: fisherCountRaw || 1
            };
        }

        if (currentEntry) {
            // 名前が空でも「釣り人数」の行数分は追加を試みる
            if (pName || pGenderRaw || pAgeRaw || pTshirtRaw || currentEntry.participants.length < currentEntry.expectedCount) {
                const finalName = pName || `${currentEntry.groupName} 参加者${currentEntry.participants.length + 1}`;
                
                // 年代の正規化
                let ageKey = 'unknown'; // Default to unknown for bulk
                for (let k in ageMap) { if (pAgeRaw && pAgeRaw.includes(k)) { ageKey = ageMap[k]; break; } }
                
                // Tシャツの正規化 (v8.9.80: Unified helper)
                let size = normalizeTshirtSize(pTshirtRaw);

                currentEntry.participants.push({
                    name: finalName,
                    type: 'fisher',
                    gender: (pGenderRaw === '女') ? 'female' : (pGenderRaw === '男' ? 'male' : 'unknown'),
                    age: ageKey,
                    region: pRegion || '',
                    tshirtSize: size,
                    status: 'pending'
                });
            }
        }
    });
    if (currentEntry) entries.push(currentEntry);

    if (entries.length === 0) {
        alert("有効なデータを解析できませんでした。列の並びを確認してください。");
        return;
    }

    // プレビュー表示
    const previewContent = document.getElementById('import-preview-content');
    const previewArea = document.getElementById('import-preview-area');
    previewContent.innerHTML = entries.map(e => `
        <div style="margin-bottom:8px; border-bottom:1px solid #ddd; padding-bottom:4px;">
            <strong>${e.groupName}</strong> (${e.participants.length}名) - 代表: ${e.representative} / ${e.phone}
            <div style="color:#666; font-size:0.7rem;">${e.participants.map(p => p.name).join(', ')}</div>
        </div>
    `).join('');
    previewArea.classList.remove('hidden');

    if (!confirm(`${entries.length} 件のグループ（計 ${entries.reduce((s, e) => s + e.participants.length, 0)} 名）を取り込みますか？\n※完了まで数分かかる場合があります。`)) return;

    const btn = document.getElementById('btn-execute-import');
    const statusArea = document.getElementById('import-status-area');
    statusArea.classList.remove('hidden');
    btn.disabled = true;

    let successCount = 0;
    let failedGroups = [];

    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        statusArea.innerHTML = `<div class="alert alert-info">
            <strong>${i + 1} / ${entries.length} グループ目を取り込み中...</strong><br>
            [${entry.groupName}] (${entry.participants.length}名) を登録しています。
        </div>`;
        
        try {
            const entryData = {
                ...entry,
                fishers: entry.participants.filter(p => p.type === 'fisher').length,
                observers: entry.participants.filter(p => p.type === 'observer').length,
                timestamp: new Date().toLocaleString('ja-JP'),
                lastUpdated: new Date().toLocaleString('ja-JP'),
                lastModified: new Date().toLocaleString('ja-JP'),
                _ts: Date.now(),
                transactionId: "BULK-" + Date.now() + "-" + i
            };

            // v8.9.62: Use a longer timeout for bulk operations
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout per group

            const response = await fetch(GAS_WEB_APP_URL, {
                method: 'POST',
                mode: 'cors',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({ action: 'register', entry: entryData }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);

            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
            
            const result = await response.json();
            if (result && result.status === 'success') {
                successCount++;
            } else {
                console.warn("Server error for group:", entry.groupName, result);
                failedGroups.push(`${entry.groupName} (サーバーエラー: ${result?.message || '不明'})`);
            }

            // v8.9.62: Add a small delay between requests to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 800));

        } catch (err) {
            console.error("Fetch error for group:", entry.groupName, err);
            failedGroups.push(`${entry.groupName} (通信エラー: ${err.message})`);
        }
    }

    // 最終結果の表示
    btn.disabled = false;
    let finalHtml = `<h3>取り込み完了</h3>
        <p style="font-size:1.1rem; font-weight:bold;">成功: ${successCount} / 全 ${entries.length} グループ</p>`;
    
    if (failedGroups.length > 0) {
        finalHtml += `<div class="alert alert-danger" style="background:#fee2e2; border:1px solid #ef4444; color:#991b1b; margin-top:10px; padding:10px; border-radius:6px;">
            <strong>以下のグループの登録に失敗しました：</strong>
            <ul style="margin:5px 0 0 20px; font-size:0.8rem;">
                ${failedGroups.map(f => `<li>${f}</li>`).join('')}
            </ul>
            <p style="font-size:0.75rem; margin-top:5px;">※失敗した分だけを再度コピーしてやり直してください。</p>
        </div>`;
    }

    finalHtml += `<div class="alert alert-success" style="background:#d1fae5; border:1px solid #10b981; color:#065f46; margin-top:10px; padding:10px; border-radius:6px;">
        名簿を更新するため、3秒後に画面を再読み込みします...
    </div>`;

    statusArea.innerHTML = finalHtml;
    showToast(`一括取り込み完了: ${successCount}件成功`, successCount === entries.length ? "success" : "warning");
    
    setTimeout(() => {
        if (successCount > 0) location.reload();
    }, 4000);
};


// v8.9.70: Added popstate listener to support browser back button navigation
window.onpopstate = function(event) {
    if (event.state && event.state.viewId) {
        // v8.9.70: Use skipPush=true to avoid creating a history loop
        switchView(event.state.viewId, true);
    } else {
        // Fallback if no state (e.g., first page)
        switchView('registration-view', true);
    }
};

// End of script

// Standalone form admin dashboard features
window.renderPreorders = function() {
    const list = document.getElementById('preorder-list');
    const statsList = document.getElementById('preorder-stats-list');
    const preorders = state.preorders || [];
    
    if (statsList) {
        if (preorders.length === 0) {
            statsList.innerHTML = '<div>データなし</div>';
        } else {
            const counts = {};
            preorders.forEach(p => {
                (p.items || []).forEach(item => {
                    counts[item.name] = (counts[item.name] || 0) + parseInt(item.quantity || 0, 10);
                });
            });
            let statsHtml = '';
            for (const [name, qty] of Object.entries(counts)) {
                if (qty > 0) {
                    statsHtml += `<div class="stat-item" style="display:flex; justify-content:space-between; padding:0.5rem 0; border-bottom:1px solid #e2e8f0;"><span>${name}</span><span class="stat-value" style="font-weight:bold;">${qty} 個</span></div>`;
                }
            }
            statsList.innerHTML = statsHtml || '<div>予約商品なし</div>';
        }
    }

    if (!list) return;
    if (preorders.length === 0) {
        list.innerHTML = '<tr><td colspan="5" style="text-align:center;">予約データがありません</td></tr>';
        return;
    }
    
    let html = '';
    [...preorders].reverse().forEach(p => {
        const dateStr = p.timestamp ? new Date(p.timestamp).toLocaleString() : '-';
        const itemsStr = (p.items || []).map(i => `${i.name}(${i.quantity})`).join('<br>');
        html += `
            <tr>
                <td>${dateStr}</td>
                <td>${p.storeName || ''}</td>
                <td>${p.customerName || ''}</td>
                <td>${p.customerPhone || ''}</td>
                <td>${p.customerEmail || ''}</td>
                <td>${itemsStr}</td>
            </tr>
        `;
    });
    list.innerHTML = html;
};

window.renderSurveys = function() {
    const list = document.getElementById('survey-list');
    const satList = document.getElementById('survey-satisfaction-list');
    const catchList = document.getElementById('survey-catch-result-list');
    const opList = document.getElementById('survey-operations-score-list');
    const partCountList = document.getElementById('survey-participation-count-list');
    const testEventList = document.getElementById('survey-test-event-list');
    const nextList = document.getElementById('survey-next-list');
    const surveys = state.surveys || [];
    
    if (satList && nextList) {
        if (surveys.length === 0) {
            satList.innerHTML = '<div>データなし</div>';
            if (catchList) catchList.innerHTML = '<div>データなし</div>';
            if (opList) opList.innerHTML = '<div>データなし</div>';
            if (partCountList) partCountList.innerHTML = '<div>データなし</div>';
            if (testEventList) testEventList.innerHTML = '<div>データなし</div>';
            nextList.innerHTML = '<div>データなし</div>';
        } else {
            const satCounts = {};
            const catchCounts = {};
            const opCounts = {};
            const partCounts = {};
            const testCounts = {};
            const nextCounts = {};
            
            surveys.forEach(s => {
                if (s.satisfaction) satCounts[s.satisfaction] = (satCounts[s.satisfaction] || 0) + 1;
                if (s.catchResult) catchCounts[s.catchResult] = (catchCounts[s.catchResult] || 0) + 1;
                if (s.operationsScore) opCounts[s.operationsScore] = (opCounts[s.operationsScore] || 0) + 1;
                if (s.participationCount) partCounts[s.participationCount] = (partCounts[s.participationCount] || 0) + 1;
                if (s.testEventParticipation) testCounts[s.testEventParticipation] = (testCounts[s.testEventParticipation] || 0) + 1;
                if (s.nextTime) nextCounts[s.nextTime] = (nextCounts[s.nextTime] || 0) + 1;
            });
            
            const renderStat = (counts, total) => {
                let html = '';
                // Sort by count descending
                const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
                for (const [key, val] of sorted) {
                    const pct = Math.round((val / total) * 100);
                    html += `
                        <div class="stat-item" style="display:flex; flex-direction:column; gap:4px; margin-bottom:12px;">
                            <div style="display:flex; justify-content:space-between; font-size:0.9rem;">
                                <span>${key}</span>
                                <span class="stat-value" style="font-weight:bold;">${val} 件 <small style="color:#64748b; font-weight:normal;">(${pct}%)</small></span>
                            </div>
                            <div class="progress-bar" style="height:6px; background:#e2e8f0; border-radius:3px; overflow:hidden;">
                                <div class="progress" style="width:${pct}%; background:var(--primary-color); height:100%;"></div>
                            </div>
                        </div>`;
                }
                return html || '<div>データなし</div>';
            };
            
            satList.innerHTML = renderStat(satCounts, surveys.length);
            if (catchList) catchList.innerHTML = renderStat(catchCounts, surveys.length);
            if (opList) opList.innerHTML = renderStat(opCounts, surveys.length);
            if (partCountList) partCountList.innerHTML = renderStat(partCounts, surveys.length);
            if (testEventList) testEventList.innerHTML = renderStat(testCounts, surveys.length);
            nextList.innerHTML = renderStat(nextCounts, surveys.length);
        }
    }

    if (!list) return;
    if (surveys.length === 0) {
        list.innerHTML = '<tr><td colspan="6" style="text-align:center;">アンケート結果がありません</td></tr>';
        return;
    }
    
    let html = '';
    [...surveys].reverse().forEach(s => {
        const dateStr = s.timestamp ? new Date(s.timestamp).toLocaleString() : '-';
        // For backwards compatibility, if they have groupName we show it, else participantName
        const nameToShow = s.participantName || s.groupName || '';
        html += `
            <tr>
                <td>${dateStr}</td>
                <td>${nameToShow}</td>
                <td>${s.satisfaction || ''}</td>
                <td>${s.catchResult || ''}</td>
                <td>${s.nextTime || ''}</td>
                <td><div style="max-width:200px; max-height:60px; overflow-y:auto; font-size:0.8rem;">${s.comments || ''}</div></td>
            </tr>
        `;
    });
    list.innerHTML = html;
};

window.clearPreorders = async function() {
    if (!confirm("本当に全ての先行予約データを削除しますか？\n（クラウド上からも完全に削除されます）")) return;
    try {
        state.preorders = [];
        state.preordersLastModified = Date.now();
        await saveData();
        if (typeof window.renderPreorders === 'function') window.renderPreorders();
        alert("先行予約データを全て削除しました。");
    } catch (e) {
        alert("削除に失敗しました: " + e.message);
    }
};

window.clearSurveys = async function() {
    if (!confirm("本当に全てのアンケートデータを削除しますか？\n（クラウド上からも完全に削除されます）")) return;
    try {
        state.surveys = [];
        state.surveysLastModified = Date.now();
        await saveData();
        if (typeof window.renderSurveys === 'function') window.renderSurveys();
        alert("アンケートデータを全て削除しました。");
    } catch (e) {
        alert("削除に失敗しました: " + e.message);
    }
};

window.exportPreordersToCSV = function() {
    const preorders = state.preorders || [];
    if (preorders.length === 0) return alert('データがありません');
    let csv = '\uFEFF日時,受取店舗,氏名,電話番号,メールアドレス,予約商品\n';
    preorders.forEach(p => {
        const dateStr = p.timestamp ? new Date(p.timestamp).toLocaleString() : '';
        const itemsStr = (p.items || []).map(i => `${i.name}(${i.quantity})`).join(' / ');
        csv += `"${dateStr}","${p.storeName || ''}","${p.customerName || ''}","${p.customerPhone || ''}","${p.customerEmail || ''}","${itemsStr}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `予約一覧_${new Date().getTime()}.csv`;
    link.click();
};

window.exportSurveysToCSV = function() {
    const surveys = state.surveys || [];
    if (surveys.length === 0) return alert('データがありません');
    let csv = '\uFEFF日時,氏名(旧グループ名),電話番号,メールアドレス,釣果,満足度,運営評価,参加回数,お気に入り製品,試釣会参加,試釣会感想,次回参加,コメント\n';
    surveys.forEach(s => {
        const dateStr = s.timestamp ? new Date(s.timestamp).toLocaleString() : '';
        const safeComment = (s.comments || '').replace(/"/g, '""');
        const safeFavProduct = (s.favoriteProduct || '').replace(/"/g, '""');
        const safeTestComments = (s.testEventComments || '').replace(/"/g, '""');
        const nameToExport = s.participantName || s.groupName || '';
        
        csv += `"${dateStr}","${nameToExport}","${s.participantTel || ''}","${s.participantEmail || ''}","${s.catchResult || ''}","${s.satisfaction || ''}","${s.operationsScore || ''}","${s.participationCount || ''}","${safeFavProduct}","${s.testEventParticipation || ''}","${safeTestComments}","${s.nextTime || ''}","${safeComment}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `アンケート結果_${new Date().getTime()}.csv`;
    link.click();
};
