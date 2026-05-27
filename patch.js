const fs = require('fs');

function patchFile() {
    let content = fs.readFileSync('script.js', 'utf-8');

    const patches = [
        // 1. Ranking Fix 1
        [
            `    state.entries.forEach(entry => {
        if (entry.status === 'cancelled') return;
        (entry.participants || []).forEach(p => {
            if (p.type === 'fisher') {`,
            
            `    state.entries.forEach(entry => {
        if (entry.status === 'cancelled' || entry.status === 'absent') return;
        (entry.participants || []).forEach(p => {
            if (p.type === 'fisher' && p.status !== 'cancelled' && p.status !== 'absent') {`
        ],
        // 2. Ranking Fix 2
        [
            `    // --- Render Individual Table ---
    // v8.10.0: Tie-breaking rule (Score > Aomono > ID)
    individualData.sort((a, b) => (b.score - a.score) || (b.cB - a.cB) || a.id.localeCompare(b.id));
    
    // v8.10.0: Apply "Award Winners Only" filter if active
    const awardFilterBtn = document.getElementById('award-filter-btn');
    const showOnlyAwards = awardFilterBtn && awardFilterBtn.classList.contains('active');
    const filteredData = showOnlyAwards ? individualData.filter(p => p.isAwardWinner) : individualData;
    
    // v8.10.0: Update title based on filter state
    const titleText = document.getElementById('ranking-title-text');
    if (titleText) {
        titleText.textContent = showOnlyAwards ? '表彰対象者' : '個人順位 (Top 100)';
    }

    if (filteredData.length === 0) {
        indContainer.innerHTML = \`<p class="text-center p-4 text-muted">\${showOnlyAwards ? '表彰対象者がまだ設定されていません' : 'データがありません'}</p>\`;
    } else {
        let html = \`
            <table class="table" style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                <thead>
                    <tr style="background:#f1f5f9;">
                        <th style="padding:8px; width:50px;">順位</th>
                        <th style="padding:8px;">名前 / チーム</th>
                        <th style="padding:8px; text-align:right;">釣果 / 合計</th>
                    </tr>
                </thead>
                <tbody>\`;
        filteredData.slice(0, 100).forEach((p, idx) => {
            const rank = idx + 1;
            const rankMark = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
            const awardStar = p.isAwardWinner ? '<span style="color:#f1c40f; margin-left:4px;">🏆</span>' : '';`,
            
            `    // --- Render Individual Table ---
    // User requested rule: 1. Aomono > 2. Tai > 3. Janken (No ID sorting)
    individualData.sort((a, b) => (b.cB - a.cB) || (b.cA - a.cA));
    
    // v8.10.0: Apply "Award Winners Only" filter if active
    const awardFilterBtn = document.getElementById('award-filter-btn');
    const showOnlyAwards = awardFilterBtn && awardFilterBtn.classList.contains('active');
    const filteredData = showOnlyAwards ? individualData.filter(p => p.isAwardWinner) : individualData;
    
    // v8.10.0: Update title based on filter state
    const titleText = document.getElementById('ranking-title-text');
    if (titleText) {
        titleText.textContent = showOnlyAwards ? '表彰対象者' : '個人順位 (Top 100)';
    }

    if (filteredData.length === 0) {
        indContainer.innerHTML = \`<p class="text-center p-4 text-muted">\${showOnlyAwards ? '表彰対象者がまだ設定されていません' : 'データがありません'}</p>\`;
    } else {
        let html = \`
            <table class="table" style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                <thead>
                    <tr style="background:#f1f5f9;">
                        <th style="padding:8px; width:50px;">順位</th>
                        <th style="padding:8px;">名前 / チーム</th>
                        <th style="padding:8px; text-align:right;">釣果 / 合計</th>
                    </tr>
                </thead>
                <tbody>\`;
        
        let currentRank = 1;
        let lastP = null;

        filteredData.slice(0, 100).forEach((p, idx) => {
            // 同点（青物も鯛も同じ数）の場合は同じ順位にする
            if (lastP && p.cB === lastP.cB && p.cA === lastP.cA) {
                // currentRank はそのまま
            } else {
                currentRank = idx + 1;
            }
            lastP = p;

            const rankMark = currentRank === 1 ? '🥇' : currentRank === 2 ? '🥈' : currentRank === 3 ? '🥉' : currentRank;
            const awardStar = p.isAwardWinner ? '<span style="color:#f1c40f; margin-left:4px;">🏆</span>' : '';`
        ],
        // 3. Log Fix 1
        [
            `        if (oldEntry.memo !== entry.memo) details.push(\`備考欄を更新\`);`,
            `        if ((oldEntry.memo || '') !== (entry.memo || '')) details.push(\`備考欄を更新\`);`
        ],
        // 4. Log Fix 2
        [
            `        // Detailed participant check
        entry.participants.forEach((p, i) => {
            const oldP = oldEntry.participants && oldEntry.participants[i];
            if (oldP) {
                if (oldP.name !== p.name) details.push(\`参加者\${i+1}氏名: \${oldP.name} → \${p.name}\`);
                if (oldP.age !== p.age) details.push(\`参加者\${i+1}年代の変更\`);
                if (oldP.gender !== p.gender) details.push(\`参加者\${i+1}性別の変更\`);
                if (oldP.tshirtSize !== p.tshirtSize) details.push(\`参加者\${i+1}Tシャツサイズ: \${oldP.tshirtSize} → \${p.tshirtSize}\`);
                if (oldP.type !== p.type) details.push(\`参加者\${i+1}種別: \${oldP.type === 'fisher' ? '釣り' : '見学'} → \${p.type === 'fisher' ? '釣り' : '見学'}\`);
            } else {
                details.push(\`参加者追加: \${p.name}\`);
            }
        });`,
        
            `        // Detailed participant check
        entry.participants.forEach((p, i) => {
            const oldP = oldEntry.participants && oldEntry.participants[i];
            if (oldP) {
                if (oldP.name !== p.name) details.push(\`参加者\${i+1}氏名: \${oldP.name} → \${p.name}\`);
                if (oldP.age !== p.age) details.push(\`参加者\${i+1}年代の変更\`);
                if (oldP.gender !== p.gender) details.push(\`参加者\${i+1}性別の変更\`);
                if (oldP.tshirtSize !== p.tshirtSize) details.push(\`参加者\${i+1}Tシャツサイズ: \${oldP.tshirtSize} → \${p.tshirtSize}\`);
                if (oldP.type !== p.type) details.push(\`参加者\${i+1}種別: \${oldP.type === 'fisher' ? '釣り' : '見学'} → \${p.type === 'fisher' ? '釣り' : '見学'}\`);
                if ((oldP.status || 'pending') !== (p.status || 'pending')) {
                    if (p.status === 'cancelled') details.push(\`参加者\${i+1}をキャンセル\`);
                    else if (oldP.status === 'cancelled') details.push(\`参加者\${i+1}のキャンセルを取り消し\`);
                    else details.push(\`参加者\${i+1}ステータス変更: \${oldP.status || 'pending'} → \${p.status}\`);
                }
            } else {
                details.push(\`参加者追加: \${p.name}\`);
            }
        });`
        ],
        // 5. Fishers Count 1
        [
            `        const fisherCount = finalParticipants.filter(p => p.type === 'fisher' && p.status !== 'cancelled').length;
        const observerCount = finalParticipants.filter(p => p.type === 'observer' && p.status !== 'cancelled').length;`,
            `        const fisherCount = finalParticipants.filter(p => p.type === 'fisher' && p.status !== 'cancelled' && p.status !== 'absent').length;
        const observerCount = finalParticipants.filter(p => p.type === 'observer' && p.status !== 'cancelled' && p.status !== 'absent').length;`
        ],
        // 6. Fishers Count 2
        [
            `    // v7.9.3: Toggle logic - if already active, revert to pending
    const newStatus = isTogglingOff ? 'pending' : status;
    entry.participants[pIdx].status = newStatus;

    // Sync group-level flags (for backward compatibility and stats)`,
            `    // v7.9.3: Toggle logic - if already active, revert to pending
    const newStatus = isTogglingOff ? 'pending' : status;
    entry.participants[pIdx].status = newStatus;

    entry.fishers = entry.participants.filter(p => p.type === 'fisher' && p.status !== 'cancelled' && p.status !== 'absent').length;
    entry.observers = entry.participants.filter(p => p.type === 'observer' && p.status !== 'cancelled' && p.status !== 'absent').length;

    // Sync group-level flags (for backward compatibility and stats)`
        ],
        // 7. Fishers Count 3
        [
            `        if (status === 'checked-in' && p.status === 'absent') {
            return;
        }
        p.status = status;
    });
    syncGroupStatusFromParticipants(entry);`,
            `        if (status === 'checked-in' && p.status === 'absent') {
            return;
        }
        p.status = status;
    });

    entry.fishers = entry.participants.filter(p => p.type === 'fisher' && p.status !== 'cancelled' && p.status !== 'absent').length;
    entry.observers = entry.participants.filter(p => p.type === 'observer' && p.status !== 'cancelled' && p.status !== 'absent').length;

    syncGroupStatusFromParticipants(entry);`
        ],
        // 8. Fishers Count 4
        [
            `    entry.participants[pIdx].status = 'cancelled';
    entry.fishers = entry.participants.filter(p => p.type === 'fisher' && p.status !== 'cancelled').length;
    entry.observers = entry.participants.filter(p => p.type === 'observer' && p.status !== 'cancelled').length;`,
            `    entry.participants[pIdx].status = 'cancelled';
    entry.fishers = entry.participants.filter(p => p.type === 'fisher' && p.status !== 'cancelled' && p.status !== 'absent').length;
    entry.observers = entry.participants.filter(p => p.type === 'observer' && p.status !== 'cancelled' && p.status !== 'absent').length;`
        ],
        // 9. Fishers Count 5
        [
            `    entry.participants[pIdx].status = 'pending';
    entry.fishers = entry.participants.filter(p => p.type === 'fisher' && p.status !== 'cancelled').length;
    entry.observers = entry.participants.filter(p => p.type === 'observer' && p.status !== 'cancelled').length;`,
            `    entry.participants[pIdx].status = 'pending';
    entry.fishers = entry.participants.filter(p => p.type === 'fisher' && p.status !== 'cancelled' && p.status !== 'absent').length;
    entry.observers = entry.participants.filter(p => p.type === 'observer' && p.status !== 'cancelled' && p.status !== 'absent').length;`
        ],
        // 10. Settings Checkbox Logic
        [
            `        \${document.getElementById('edit-entry-id')?.value ? \`
        <div class="form-group" style="margin-top: 10px; margin-bottom: 0;">
            <label style="display:flex; align-items:center; gap:8px; color:#ef4444; font-weight:bold; cursor:pointer;">
                <input type="checkbox" class="p-cancel" style="width:18px; height:18px;" \${data && data.status === 'cancelled' ? 'checked' : ''}>
                この参加者をキャンセルする
            </label>
        </div>\` : ''}`,
            `        \${(() => {
            if (!document.getElementById('edit-entry-id')?.value) return '';
            
            const isCancelDeadlinePassed = state.settings.cancelDeadline && new Date() > new Date(state.settings.cancelDeadline);
            const isAdmin = typeof isBypassAllowed === 'function' && isBypassAllowed();
            
            if (isCancelDeadlinePassed && !isAdmin) {
                if (data && data.status === 'cancelled') {
                    return \`<div class="form-group" style="margin-top: 10px; margin-bottom: 0;"><span style="color:#ef4444; font-weight:bold;">※キャンセル済</span></div>\`;
                }
                return '';
            }

            return \`
            <div class="form-group" style="margin-top: 10px; margin-bottom: 0;">
                <label style="display:flex; align-items:center; gap:8px; color:#ef4444; font-weight:bold; cursor:pointer;">
                    <input type="checkbox" class="p-cancel" style="width:18px; height:18px;" \${data && data.status === 'cancelled' ? 'checked' : ''}>
                    この参加者をキャンセルする
                </label>
            </div>\`;
        })()}`
        ],
        // 11. Settings Sync UI
        [
            `    updateIfInactive('registration-start', state.settings.startTime);
    updateIfInactive('registration-deadline', state.settings.deadline);
    updateIfInactive('admin-password-set', state.settings.adminPassword);`,
            `    updateIfInactive('registration-start', state.settings.startTime);
    updateIfInactive('registration-deadline', state.settings.deadline);
    updateIfInactive('cancel-deadline', state.settings.cancelDeadline);
    updateIfInactive('admin-password-set', state.settings.adminPassword);`
        ],
        // 12. Settings Saving
        [
            `    state.settings.startTime = getVal('registration-start');
    state.settings.deadline = getVal('registration-deadline');
    state.settings.adminPassword = getVal('admin-password-set');`,
            `    state.settings.startTime = getVal('registration-start');
    state.settings.deadline = getVal('registration-deadline');
    state.settings.cancelDeadline = getVal('cancel-deadline');
    state.settings.adminPassword = getVal('admin-password-set');`
        ]
    ];

    let successCount = 0;
    for (let i = 0; i < patches.length; i++) {
        const oldStr = patches[i][0];
        const newStr = patches[i][1];
        if (content.includes(oldStr)) {
            content = content.replace(oldStr, newStr);
            console.log("Patch " + (i + 1) + " applied.");
            successCount++;
        } else {
            console.error("Patch " + (i + 1) + " FAILED. Old string not found.");
        }
    }

    fs.writeFileSync('script.js', content, 'utf-8');
    console.log(successCount + "/" + patches.length + " patches applied.");
}

patchFile();
