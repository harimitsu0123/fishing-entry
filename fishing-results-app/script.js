const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbykDT-XvGhrZCQcCp_gCxZAToW3X4s_g_BPX7LBO4E-A84vUY0VE3nlqehITFOfp9f9/exec";

let state = {
    entries: [],
    settings: {},
    lastUpdated: 0
};

let currentIkesu = null;
let editingParticipant = null; // { entryId, partIdx }

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    showLoading(true);
    await fetchData();
    // v1.1.0: Populate Ikesu selection
    const loginSelect = document.getElementById('login-ikesu-id');
    if (loginSelect && state.settings.ikesuList) {
        state.settings.ikesuList.forEach(ik => {
            const opt = document.createElement('option');
            opt.value = ik.id;
            opt.textContent = ik.name;
            loginSelect.appendChild(opt);
        });
        // v1.1.1: Add Admin at the bottom
        const adminOpt = document.createElement('option');
        adminOpt.value = 'admin';
        adminOpt.textContent = '【管理者】';
        loginSelect.appendChild(adminOpt);
    }

    // Event Listeners
    document.getElementById('login-btn').addEventListener('click', handleLogin);
    document.querySelectorAll('.logout-btn').forEach(btn => btn.addEventListener('click', handleLogout));
    document.getElementById('save-btn').addEventListener('click', handleSave);
    
    // v1.1.0: Auto-login
    const savedIkesuId = sessionStorage.getItem('loggedIkesuId');
    if (savedIkesuId) {
        if (savedIkesuId === 'admin') {
            showView('admin-view');
            renderAdminView();
        } else {
            const ikesu = state.settings.ikesuList.find(i => i.id === savedIkesuId);
            if (ikesu) {
                currentIkesu = ikesu;
                showView('main-view');
                renderParticipantList();
            }
        }
    }
    
    showLoading(false);
}

async function fetchData() {
    try {
        const response = await fetch(GAS_WEB_APP_URL + "?action=get");
        const data = await response.json();
        state = data;
        console.log("Data synchronized:", state);
    } catch (err) {
        console.error("Fetch error:", err);
        showToast("データの読み込みに失敗しました", "error");
    }
}

function handleLogin() {
    const selectedId = document.getElementById('login-ikesu-id').value;
    const passcode = document.getElementById('ikesu-passcode').value.trim();
    
    if (!selectedId || !passcode) return;

    if (selectedId === 'admin') {
        const adminPass = state.settings.adminPassword || "1212";
        if (passcode === adminPass || passcode === "1212") {
            sessionStorage.setItem('loggedIkesuId', 'admin');
            showView('admin-view');
            renderAdminView();
            showToast("管理者としてログインしました", "success");
        } else {
            authError();
        }
        return;
    }

    const ikesuList = state.settings.ikesuList || [];
    const found = ikesuList.find(i => i.id === selectedId && i.passcode === passcode);

    if (found) {
        currentIkesu = found;
        sessionStorage.setItem('loggedIkesuId', found.id);
        document.getElementById('auth-error').classList.add('hidden');
        showView('main-view');
        renderParticipantList();
        showToast(`${found.name} としてログインしました`, "success");
    } else {
        authError();
    }
}

function authError() {
    document.getElementById('auth-error').classList.remove('hidden');
    document.getElementById('ikesu-passcode').value = '';
}

function handleLogout() {
    if (confirm("ログアウトしますか？")) {
        currentIkesu = null;
        sessionStorage.removeItem('loggedIkesuId');
        showView('auth-view');
        document.getElementById('ikesu-passcode').value = '';
    }
}

function renderParticipantList() {
    const listContainer = document.getElementById('participant-list');
    const displayIkesuName = document.getElementById('display-ikesu-name');
    const adminBackBtn = document.getElementById('admin-back-btn');
    
    if (!listContainer || !currentIkesu) return;

    const loggedId = sessionStorage.getItem('loggedIkesuId');
    if (adminBackBtn) {
        adminBackBtn.classList.toggle('hidden', loggedId !== 'admin');
    }

    displayIkesuName.textContent = currentIkesu.name;
    listContainer.innerHTML = '';

    let totalPoints = 0;
    let foundAny = false;

    state.entries.forEach(entry => {
        if (entry.status === 'cancelled') return;

        (entry.participants || []).forEach((p, idx) => {
            if (p.status === 'cancelled') return;
            if (p.ikesuId === currentIkesu.id && p.type === 'fisher') {
                foundAny = true;
                const cA = parseInt(p.catchA || 0);
                const cB = parseInt(p.catchB || 0);
                const points = cA + (cB * 2);
                totalPoints += points;

                const card = document.createElement('div');
                card.className = `participant-card`;
                card.innerHTML = `
                    <div class="p-info">
                        <div class="p-name">${p.name} ${p.isLeader ? '⭐' : ''}</div>
                        <div class="p-group">${entry.groupName} (${entry.id})</div>
                    </div>
                    <div class="p-scores-row">
                        <div class="p-input-group">
                            <div style="display:flex; flex-direction:column; align-items:center;">
                                <span style="font-size:0.65rem; color:#ef4444; font-weight:bold; margin-bottom:2px;">マダイ等</span>
                                <input type="number" class="inline-input red" value="${cA}" min="0" 
                                    onchange="updateInlineScore('${entry.id}', ${idx}, 'catchA', this.value)">
                            </div>
                            <div style="display:flex; flex-direction:column; align-items:center;">
                                <span style="font-size:0.65rem; color:#3b82f6; font-weight:bold; margin-bottom:2px;">青物、クエ</span>
                                <input type="number" class="inline-input blue" value="${cB}" min="0" 
                                    onchange="updateInlineScore('${entry.id}', ${idx}, 'catchB', this.value)">
                            </div>
                            <div style="display:flex; flex-direction:column; align-items:center;">
                                <span style="font-size:0.65rem; color:#64748b; font-weight:bold; margin-bottom:2px;">合計</span>
                                <span class="score-badge total" style="height:40px; display:flex; align-items:center;">${points}pt</span>
                            </div>
                        </div>
                    </div>
                `;
                listContainer.appendChild(card);
            }
        });
    });

    if (!foundAny) {
        listContainer.innerHTML = '<p class="text-muted" style="text-align:center; padding:2rem;">このイケスに割り当てられた釣り人はいません。</p>';
    }

    document.getElementById('ikesu-total-points').textContent = totalPoints;
}

window.updateInlineScore = function(entryId, partIdx, field, value) {
    const entry = state.entries.find(e => e.id === entryId);
    if (entry && entry.participants[partIdx]) {
        entry.participants[partIdx][field] = parseInt(value) || 0;
        entry.lastModified = new Date().toISOString();
        state.lastUpdated = Date.now();
        renderParticipantList();
    }
};

window.toggleCheck = function(entryId, partIdx) {
    // Deprecated in v1.3.0
};

window.showAdminDashboard = function() {
    showView('admin-view');
    renderAdminView();
};

function renderAdminView() {
    const listContainer = document.getElementById('admin-ikesu-list');
    if (!listContainer) return;

    // Load settings into inputs
    const config = state.settings.rankingConfig || { topCount: 3, tobiList: "5,10,15,20,25,30" };
    const rankTopInput = document.getElementById('rank-top-count');
    const rankTobiInput = document.getElementById('rank-tobi-list');
    if (rankTopInput) rankTopInput.value = config.topCount;
    if (rankTobiInput) rankTobiInput.value = config.tobiList;

    let globalA = 0, globalB = 0, globalTotalPts = 0;
    let caughtCount = 0, zeroCount = 0;
    const ikesuList = state.settings.ikesuList || [];
    
    state.entries.forEach(e => {
        if (e.status === 'cancelled') return;
        (e.participants || []).forEach(p => {
            if (p.status === 'cancelled') return;
            if (p.type === 'fisher') {
                const cA = parseInt(p.catchA || 0);
                const cB = parseInt(p.catchB || 0);
                const pts = cA + (cB * 2);
                const fish = cA + cB;
                
                globalA += cA;
                globalB += cB;
                globalTotalPts += pts;
                
                if (fish > 0) caughtCount++;
                else zeroCount++;
            }
        });
    });

    const ikesuStats = ikesuList.map(ik => {
        let ikA = 0, ikB = 0, ikFish = 0, memberCount = 0;
        state.entries.forEach(e => {
            if (e.status === 'cancelled') return;
            (e.participants || []).forEach(p => {
                if (p.status === 'cancelled') return;
                if (p.ikesuId === ik.id && p.type === 'fisher') {
                    ikA += parseInt(p.catchA || 0);
                    ikB += parseInt(p.catchB || 0);
                    ikFish += (parseInt(p.catchA || 0) + parseInt(p.catchB || 0));
                    memberCount++;
                }
            });
        });
        const pts = ikA + (ikB * 2);
        return { ...ik, ikA, ikB, ikFish, pts, memberCount };
    });

    // v1.3.1: Change overall total from PT to Fish count per user request
    const globalTotalFish = globalA + globalB;
    document.getElementById('admin-total-points').innerHTML = `${globalTotalFish}<span>匹</span>`;
    document.getElementById('admin-total-cA').innerHTML = `${globalA}<span>匹</span>`;
    document.getElementById('admin-total-cB').innerHTML = `${globalB}<span>匹</span>`;

    // v1.3.1: Add caught/zero stats to the summary
    const summaryHeader = document.querySelector('.admin-stats-summary');
    if (summaryHeader) {
        let statsEl = document.getElementById('admin-extra-stats');
        if (!statsEl) {
            statsEl = document.createElement('div');
            statsEl.id = 'admin-extra-stats';
            statsEl.style.cssText = "display:flex; gap:1rem; margin-top:0.5rem; font-size:0.8rem; color:#64748b; justify-content:center; width:100%;";
            summaryHeader.appendChild(statsEl);
        }
        statsEl.innerHTML = `
            <span>釣果あり: <strong>${caughtCount}</strong>名</span>
            <span>坊主(0匹): <strong style="color:#ef4444;">${zeroCount}</strong>名</span>
        `;
    }

    listContainer.innerHTML = ikesuStats.map(ik => `
        <div class="ikesu-summary-card ${ik.checked ? 'checked' : ''}">
            <div class="ik-info" onclick="jumpToIkesu('${ik.id}')">
                <span class="ik-name">${ik.name} <small style="color:#64748b; font-size:0.85rem; margin-left:4px;">(${ik.memberCount}名)</small> ${ik.checked ? '✅' : ''}</span>
                <span class="ik-details">マダイ: ${ik.ikA} / 青物、クエ: ${ik.ikB} (計 ${ik.ikFish}匹)</span>
            </div>
            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.5rem;">
                <div class="ik-pts">${ik.pts}pt</div>
                <button class="btn-check ${ik.checked ? 'checked' : ''}" style="padding: 4px 8px; font-size: 0.7rem;"
                    onclick="toggleIkesuCheck('${ik.id}')">
                    ${ik.checked ? '済' : '未'}
                </button>
            </div>
        </div>
    `).join('');
}

window.toggleIkesuCheck = function(ikesuId) {
    const ik = state.settings.ikesuList.find(i => i.id === ikesuId);
    if (ik) {
        ik.checked = !ik.checked;
        state.lastUpdated = Date.now();
        renderAdminView();
    }
};

window.saveRankingSettings = function() {
    const topCount = parseInt(document.getElementById('rank-top-count').value) || 3;
    const tobiList = document.getElementById('rank-tobi-list').value;
    
    state.settings.rankingConfig = { topCount, tobiList };
    state.lastUpdated = Date.now();
    showToast("ランキング設定を保存しました", "success");
    handleSave(); // Sync to cloud
};

window.jumpToIkesu = function(ikesuId) {
    const ik = state.settings.ikesuList.find(i => i.id === ikesuId);
    if (ik) {
        currentIkesu = ik;
        showView('main-view');
        renderParticipantList();
    }
};

// v1.2.0: Modal system is deprecated in favor of inline editing

async function handleSave() {
    showLoading(true, "保存中...");
    try {
        const response = await fetch(GAS_WEB_APP_URL, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
                action: 'save',
                data: state
            })
        });
        const result = await response.json();
        if (result.status === 'success') {
            showToast("保存完了しました", "success");
        } else {
            throw new Error(result.message);
        }
    } catch (err) {
        console.error("Save error:", err);
        showToast("保存に失敗しました", "error");
    } finally {
        showLoading(false);
    }
}

// Helpers
function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById(viewId).classList.remove('hidden');
}

function showLoading(show, text = "同期中...") {
    const el = document.getElementById('loading-overlay');
    el.querySelector('p').textContent = text;
    el.classList.toggle('hidden', !show);
}

function showToast(msg, type = "info") {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

window.generateMockCatchData = async function() {
    if (!confirm("テスト用の仮データ（約9割が釣果あり）を生成しますか？\n※現在の釣果データは上書きされます。")) return;
    
    let updated = false;
    state.entries.forEach(e => {
        if (e.status === 'cancelled') return;
        (e.participants || []).forEach(p => {
            if (p.type === 'fisher' && p.status !== 'cancelled' && p.status !== 'absent') {
                p.isAwardWinner = false;
                
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
        state.lastUpdated = Date.now();
        await handleSave();
        if (document.getElementById('admin-view').classList.contains('hidden') === false) {
            renderAdminView();
        } else if (currentIkesu) {
            renderParticipantList();
        }
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
        state.lastUpdated = Date.now();
        await handleSave();
        if (document.getElementById('admin-view').classList.contains('hidden') === false) {
            renderAdminView();
        } else if (currentIkesu) {
            renderParticipantList();
        }
        showToast("すべての釣果をリセットしました", "info");
    } else {
        showToast("リセットするデータがありません", "info");
    }
};
