const fs = require('fs');

function patchFile() {
    let content = fs.readFileSync('script.js', 'utf-8');

    const regexPatches = [
        // 1. Settings load
        {
            search: /updateIfInactive\('registration-deadline', state\.settings\.deadline\);\s*updateIfInactive\('admin-password-set', state\.settings\.adminPassword\);/g,
            replace: `updateIfInactive('registration-deadline', state.settings.deadline);\n    updateIfInactive('cancel-deadline', state.settings.cancelDeadline);\n    updateIfInactive('admin-password-set', state.settings.adminPassword);`
        },
        // 2. Settings save
        {
            search: /state\.settings\.deadline = getVal\('registration-deadline'\);\s*state\.settings\.adminPassword = getVal\('admin-password-set'\);/g,
            replace: `state.settings.deadline = getVal('registration-deadline');\n    state.settings.cancelDeadline = getVal('cancel-deadline');\n    state.settings.adminPassword = getVal('admin-password-set');`
        },
        // 3. Settings UI (Cancel checkbox logic)
        {
            search: /\$\{document\.getElementById\('edit-entry-id'\)\?\.value \? `\s*<div class="form-group" style="margin-top: 10px; margin-bottom: 0;">\s*<label style="display:flex; align-items:center; gap:8px; color:#ef4444; font-weight:bold; cursor:pointer;">\s*<input type="checkbox" class="p-cancel" style="width:18px; height:18px;" \$\{data && data\.status === 'cancelled' \? 'checked' : ''\}>\s*この参加者をキャンセルする\s*<\/label>\s*<\/div>` : ''\}/g,
            replace: `\${(() => {
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
        },
        // 4. Strikethrough for partially cancelled members
        {
            search: /const pSummary = `\s*<div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:400px; font-size:0\.95rem;">\s*<strong style="font-weight:800; color:var\(--text-color\);">\$\{rep\.name\}<\/strong>\$\{rep\.nickname \? `<small>\(\$\{rep\.nickname\}\)<\/small>` : ''\}\$\{getGenderMark\(rep\)\}\s*<span style="color:#64748b; font-size:0\.8rem; margin-left:4px;">\s*\$\{pArray\.length > 1 \? `\+ \$\{pArray\.slice\(1\)\.map\(p => p\.name\)\.join\('\, '\)\}` : ''\}\s*<\/span>\s*<\/div>\s*`;/g,
            replace: `const repDecoration = rep.status === 'cancelled' ? 'text-decoration:line-through; opacity:0.6;' : '';
            const pSummary = \`
                <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:400px; font-size:0.95rem;">
                    <strong style="font-weight:800; color:var(--text-color); \${repDecoration}">\${rep.name}</strong>\${rep.nickname ? \`<small>(\${rep.nickname})</small>\` : ''}\${getGenderMark(rep)}
                    <span style="color:#64748b; font-size:0.8rem; margin-left:4px;">
                        \${pArray.length > 1 ? \`+ \${pArray.slice(1).map(p => \`<span style="\${p.status === 'cancelled' ? 'text-decoration:line-through; opacity:0.6;' : ''}">\${p.name}</span>\`).join(', ')}\` : ''}
                    </span>
                </div>
            \`;`
        },
        // 5. Ranking fix 1
        {
            search: /if \(entry\.status === 'cancelled'\) return;\s*\(entry\.participants \|\| \[\]\)\.forEach\(p => \{\s*if \(p\.type === 'fisher'\) \{/g,
            replace: `if (entry.status === 'cancelled' || entry.status === 'absent') return;\n        (entry.participants || []).forEach(p => {\n            if (p.type === 'fisher' && p.status !== 'cancelled' && p.status !== 'absent') {`
        },
        // 6. Ranking fix 2 (Sorting logic)
        {
            search: /individualData\.sort\(\(a, b\) => \(b\.score - a\.score\) \|\| \(b\.cB - a\.cB\) \|\| a\.id\.localeCompare\(b\.id\)\);/g,
            replace: `individualData.sort((a, b) => (b.cB - a.cB) || (b.cA - a.cA));`
        },
        // 7. Ranking fix 3 (Tie breaking)
        {
            search: /filteredData\.slice\(0, 100\)\.forEach\(\(p, idx\) => \{\s*const rank = idx \+ 1;/g,
            replace: `let currentRank = 1;
        let lastP = null;

        filteredData.slice(0, 100).forEach((p, idx) => {
            if (lastP && p.cB === lastP.cB && p.cA === lastP.cA) {
                // currentRank はそのまま
            } else {
                currentRank = idx + 1;
            }
            lastP = p;
            const rank = currentRank;`
        },
        // 8. Log fix 1
        {
            search: /if \(oldEntry\.memo !== entry\.memo\) details\.push\(`備考欄を更新`\);/g,
            replace: `if ((oldEntry.memo || '') !== (entry.memo || '')) details.push(\`備考欄を更新\`);`
        },
        // 9. Log fix 2
        {
            search: /if \(oldP\.type !== p\.type\) details\.push\(`参加者\$\{i\+1\}種別: \$\{oldP\.type === 'fisher' \? '釣り' : '見学'\} → \$\{p\.type === 'fisher' \? '釣り' : '見学'\}`\);\s*\} else \{/g,
            replace: `if (oldP.type !== p.type) details.push(\`参加者\${i+1}種別: \${oldP.type === 'fisher' ? '釣り' : '見学'} → \${p.type === 'fisher' ? '釣り' : '見学'}\`);
                if ((oldP.status || 'pending') !== (p.status || 'pending')) {
                    if (p.status === 'cancelled') details.push(\`参加者\${i+1}をキャンセル\`);
                    else if (oldP.status === 'cancelled') details.push(\`参加者\${i+1}のキャンセルを取り消し\`);
                    else details.push(\`参加者\${i+1}ステータス変更: \${oldP.status || 'pending'} → \${p.status}\`);
                }
            } else {`
        },
        // 10. Fisher Count 1
        {
            search: /const fisherCount = finalParticipants\.filter\(p => p\.type === 'fisher' && p\.status !== 'cancelled'\)\.length;\s*const observerCount = finalParticipants\.filter\(p => p\.type === 'observer' && p\.status !== 'cancelled'\)\.length;/g,
            replace: `const fisherCount = finalParticipants.filter(p => p.type === 'fisher' && p.status !== 'cancelled' && p.status !== 'absent').length;
        const observerCount = finalParticipants.filter(p => p.type === 'observer' && p.status !== 'cancelled' && p.status !== 'absent').length;`
        },
        // 11. Fisher Count 2 (toggle participant)
        {
            search: /entry\.participants\[pIdx\]\.status = newStatus;\s*\/\/ Sync group-level flags/g,
            replace: `entry.participants[pIdx].status = newStatus;
    
    entry.fishers = entry.participants.filter(p => p.type === 'fisher' && p.status !== 'cancelled' && p.status !== 'absent').length;
    entry.observers = entry.participants.filter(p => p.type === 'observer' && p.status !== 'cancelled' && p.status !== 'absent').length;

    // Sync group-level flags`
        },
        // 12. Fisher Count 3 (syncGroupStatus)
        {
            search: /p\.status = status;\s*\}\);\s*syncGroupStatusFromParticipants\(entry\);/g,
            replace: `p.status = status;
    });

    entry.fishers = entry.participants.filter(p => p.type === 'fisher' && p.status !== 'cancelled' && p.status !== 'absent').length;
    entry.observers = entry.participants.filter(p => p.type === 'observer' && p.status !== 'cancelled' && p.status !== 'absent').length;

    syncGroupStatusFromParticipants(entry);`
        },
        // 13. Fisher Count 4 & 5 (cancel/restore)
        {
            search: /entry\.fishers = entry\.participants\.filter\(p => p\.type === 'fisher' && p\.status !== 'cancelled'\)\.length;\s*entry\.observers = entry\.participants\.filter\(p => p\.type === 'observer' && p\.status !== 'cancelled'\)\.length;/g,
            replace: `entry.fishers = entry.participants.filter(p => p.type === 'fisher' && p.status !== 'cancelled' && p.status !== 'absent').length;
    entry.observers = entry.participants.filter(p => p.type === 'observer' && p.status !== 'cancelled' && p.status !== 'absent').length;`
        }
        ,
        // 14. Log cleanup logic in renderChangeLog
        {
            search: /if \(\!state\.changeLog \|\| state\.changeLog\.length === 0\) \{/g,
            replace: `state.changeLog = (state.changeLog || []).filter(log => {
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

    if (!state.changeLog || state.changeLog.length === 0) {`
        }
    ];

    let successCount = 0;
    regexPatches.forEach((patch, idx) => {
        if (patch.search.test(content)) {
            content = content.replace(patch.search, patch.replace);
            console.log(`Patch ${idx + 1} applied.`);
            successCount++;
        } else {
            console.log(`Patch ${idx + 1} FAILED to match.`);
        }
    });

    fs.writeFileSync('script.js', content, 'utf-8');
    console.log(`${successCount} out of ${regexPatches.length} patches applied successfully.`);
}

patchFile();
