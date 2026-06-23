$content = Get-Content -Path "script.js" -Raw -Encoding UTF8

$replacements = @(
    @{
        old = "            participants: finalParticipants,`n            status: existingEntry ? existingEntry.status : 'pending',"
        new = "            participants: finalParticipants,`n            _formModified: true,`n            status: existingEntry ? existingEntry.status : 'pending',"
    },
    @{
        old = "    p.type = p.type === 'fisher' ? 'observer' : 'fisher';`n    `n    // Recalculate counts"
        new = "    p.type = p.type === 'fisher' ? 'observer' : 'fisher';`n    p._typeModified = true;`n    `n    // Recalculate counts"
    },
    @{
        old = "    const newStatus = isTogglingOff ? 'pending' : status;`n    entry.participants[pIdx].status = newStatus;`n    `n    entry.fishers"
        new = "    const newStatus = isTogglingOff ? 'pending' : status;`n    entry.participants[pIdx].status = newStatus;`n    entry.participants[pIdx]._statusModified = true;`n    `n    entry.fishers"
    },
    @{
        old = "            if (p.ikesuId === id) p.ikesuId = null;`n        });"
        new = "            if (p.ikesuId === id) { p.ikesuId = null; p._ikesuModified = true; }`n        });"
    },
    @{
        old = "    if (type === `"group`") {`n        entry.participants.forEach(p => p.ikesuId = ikesuId);`n    } else {`n        const idx = parseInt(ev.dataTransfer.getData(`"idx`"));`n        if (entry.participants[idx]) entry.participants[idx].ikesuId = ikesuId;`n    }"
        new = "    if (type === `"group`") {`n        entry.participants.forEach(p => { p.ikesuId = ikesuId; p._ikesuModified = true; });`n    } else {`n        const idx = parseInt(ev.dataTransfer.getData(`"idx`"));`n        if (entry.participants[idx]) { entry.participants[idx].ikesuId = ikesuId; entry.participants[idx]._ikesuModified = true; }`n    }"
    },
    @{
        old = "                    if (p.isLeader) { p.isLeader = false; modified = true; }`n                });`n            }`n            // Clear within the same ikesu`n            if (targetIkesuId) {`n                e.participants.forEach(p => {`n                    if (p.ikesuId === targetIkesuId && p.isLeader) { p.isLeader = false; modified = true; }`n                });"
        new = "                    if (p.isLeader) { p.isLeader = false; p._ikesuModified = true; modified = true; }`n                });`n            }`n            // Clear within the same ikesu`n            if (targetIkesuId) {`n                e.participants.forEach(p => {`n                    if (p.ikesuId === targetIkesuId && p.isLeader) { p.isLeader = false; p._ikesuModified = true; modified = true; }`n                });"
    },
    @{
        old = "    entry.participants[pIdx].isLeader = isNowLeader;`n    entry.lastModified = new Date().toISOString();"
        new = "    entry.participants[pIdx].isLeader = isNowLeader;`n    entry.participants[pIdx]._ikesuModified = true;`n    entry.lastModified = new Date().toISOString();"
    },
    @{
        old = "        entry.status = 'cancelled';`n        entry.lastModified = new Date().toISOString();"
        new = "        entry.status = 'cancelled';`n        entry._statusModified = true;`n        entry.lastModified = new Date().toISOString();"
    },
    @{
        old = "        entry.status = 'pending';`n        entry.lastModified = new Date().toISOString();"
        new = "        entry.status = 'pending';`n        entry._statusModified = true;`n        entry.lastModified = new Date().toISOString();"
    },
    @{
        old = "                                // Adopt server catch if local is 0 to prevent wiping newly entered catches`n                                if (!localP.catchA && !localP.catchB && (serverEntry.participants[pIdx].catchA || serverEntry.participants[pIdx].catchB)) {`n                                    localP.catchA = serverEntry.participants[pIdx].catchA;`n                                    localP.catchB = serverEntry.participants[pIdx].catchB;`n                                }"
        new = "                                // Adopt server catch if local is not explicitly modified`n                                if (localP._catchModified) {`n                                    delete localP._catchModified;`n                                } else {`n                                    localP.catchA = serverEntry.participants[pIdx].catchA;`n                                    localP.catchB = serverEntry.participants[pIdx].catchB;`n                                }"
    },
    @{
        old = "    p.catchA = parseInt(document.getElementById('day-input-cA').value) || 0;`n    p.catchB = parseInt(document.getElementById('day-input-cB').value) || 0;`n    saveStateToLocalStorage();"
        new = "    p.catchA = parseInt(document.getElementById('day-input-cA').value) || 0;`n    p.catchB = parseInt(document.getElementById('day-input-cB').value) || 0;`n    p._catchModified = true;`n    saveStateToLocalStorage();"
    },
    @{
        old = "        if (entry && entry.participants[idx]) {`n            entry.participants[idx].catchA = parseInt(row.querySelector('.catch-a').value) || 0;`n            entry.participants[idx].catchB = parseInt(row.querySelector('.catch-b').value) || 0;`n        }"
        new = "        if (entry && entry.participants[idx]) {`n            entry.participants[idx].catchA = parseInt(row.querySelector('.catch-a').value) || 0;`n            entry.participants[idx].catchB = parseInt(row.querySelector('.catch-b').value) || 0;`n            entry.participants[idx]._catchModified = true;`n        }"
    },
    @{
        old = "} else {`n                    p.catchB = 0;       // 22%`n                }`n                `n                updated = true;`n            }`n            // Update counts"
        new = "} else {`n                    p.catchB = 0;       // 22%`n                }`n                `n                p._catchModified = true;`n                updated = true;`n            }`n            // Update counts"
    },
    @{
        old = "            if (p.catchA > 0 || p.catchB > 0 || p.isAwardWinner) {`n                p.catchA = 0;`n                p.catchB = 0;`n                p.isAwardWinner = false;`n                updated = true;`n            }"
        new = "            if (p.catchA > 0 || p.catchB > 0 || p.isAwardWinner) {`n                p.catchA = 0;`n                p.catchB = 0;`n                p.isAwardWinner = false;`n                p._catchModified = true;`n                updated = true;`n            }"
    },
    @{
        old = "            // 両方にある場合: 更新日時(lastModified)が新しい方を採用`n            const cEntry = cloudMap.get(lEntry.id);`n            const lTime = new Date(lEntry.lastModified || lEntry.timestamp || 0).getTime();`n            const cTime = new Date(cEntry.lastModified || cEntry.timestamp || 0).getTime();`n`n            if (lTime > cTime) {`n                const idx = merged.entries.findIndex(e => e.id === lEntry.id);`n                if (idx !== -1) merged.entries[idx] = lEntry;`n            }`n        }`n    });"
        new = "            // 両方にある場合: プロパティ単位のディープマージ`n            const cEntry = cloudMap.get(lEntry.id);`n            const lTime = new Date(lEntry.lastModified || lEntry.timestamp || 0).getTime();`n            const cTime = new Date(cEntry.lastModified || cEntry.timestamp || 0).getTime();`n`n            const mergedEntry = JSON.parse(JSON.stringify(cEntry)); // Base is Server`n`n            // 1. Form modifications (structural changes)`n            if (lEntry._formModified) {`n                mergedEntry.participants = JSON.parse(JSON.stringify(lEntry.participants));`n                mergedEntry.groupName = lEntry.groupName;`n                mergedEntry.representative = lEntry.representative;`n                mergedEntry.phone = lEntry.phone;`n                mergedEntry.source = lEntry.source;`n                mergedEntry.memo = lEntry.memo;`n                mergedEntry.lastModified = lEntry.lastModified;`n                delete lEntry._formModified;`n            } `n`n            // 2. Property-level modifications`n            let bumped = false;`n            `n            if (lEntry._statusModified) {`n                mergedEntry.status = lEntry.status;`n                delete lEntry._statusModified;`n                bumped = true;`n            } else if (lTime > cTime && lEntry.status !== cEntry.status) {`n                mergedEntry.status = lEntry.status;`n            }`n`n            (lEntry.participants || []).forEach((lP, pIdx) => {`n                const mP = mergedEntry.participants[pIdx];`n                if (mP) {`n                    if (lP._ikesuModified) { mP.ikesuId = lP.ikesuId; mP.isLeader = lP.isLeader; delete lP._ikesuModified; bumped = true; }`n                    else if (lTime > cTime) { mP.ikesuId = lP.ikesuId; mP.isLeader = lP.isLeader; }`n`n                    if (lP._typeModified) { mP.type = lP.type; delete lP._typeModified; bumped = true; }`n                    else if (lTime > cTime && lP.type !== undefined) { mP.type = lP.type; }`n`n                    if (lP._statusModified) { mP.status = lP.status; delete lP._statusModified; bumped = true; }`n                    else if (lTime > cTime && lP.status !== undefined) { mP.status = lP.status; }`n`n                    if (lP._catchModified) { `n                        mP.catchA = lP.catchA; `n                        mP.catchB = lP.catchB; `n                        delete lP._catchModified; `n                        bumped = true; `n                    }`n                }`n            });`n`n            if (bumped || lEntry._formModified) {`n                mergedEntry.lastModified = new Date().toISOString();`n            } else if (lTime > cTime) {`n                mergedEntry.lastModified = lEntry.lastModified;`n            }`n`n            const idx = merged.entries.findIndex(e => e.id === lEntry.id);`n            if (idx !== -1) merged.entries[idx] = mergedEntry;`n        }`n    });"
    }
)

$success = 0
foreach ($rep in $replacements) {
    if ($content -match [regex]::Escape($rep.old)) {
        $content = $content.Replace($rep.old, $rep.new)
        $success++
    } else {
        Write-Host "Failed to find: $($rep.old)"
    }
}

Set-Content -Path "script.js" -Value $content -Encoding UTF8
Write-Host "Applied $success replacements"
