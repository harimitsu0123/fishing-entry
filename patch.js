const fs = require('fs');
let content = fs.readFileSync('script.js', 'utf8');

const replacements = [
    // 1. handleRegistration (Line ~324)
    [
        `            participants: finalParticipants,\n            status: existingEntry ? existingEntry.status : 'pending',`,
        `            participants: finalParticipants,\n            _formModified: true,\n            status: existingEntry ? existingEntry.status : 'pending',`
    ],
    // 2. toggleParticipantType (Line ~4014)
    [
        `    p.type = p.type === 'fisher' ? 'observer' : 'fisher';\n    \n    // Recalculate counts`,
        `    p.type = p.type === 'fisher' ? 'observer' : 'fisher';\n    p._typeModified = true;\n    \n    // Recalculate counts`
    ],
    // 3. updateParticipantStatus (Line ~4040)
    [
        `    const newStatus = isTogglingOff ? 'pending' : status;\n    entry.participants[pIdx].status = newStatus;\n    \n    entry.fishers`,
        `    const newStatus = isTogglingOff ? 'pending' : status;\n    entry.participants[pIdx].status = newStatus;\n    entry.participants[pIdx]._statusModified = true;\n    \n    entry.fishers`
    ],
    // 4. handleIkesuDelete (Line ~4287)
    [
        `            if (p.ikesuId === id) p.ikesuId = null;\n        });`,
        `            if (p.ikesuId === id) { p.ikesuId = null; p._ikesuModified = true; }\n        });`
    ],
    // 5. processDrop (Line ~4336)
    [
        `    if (type === "group") {\n        entry.participants.forEach(p => p.ikesuId = ikesuId);\n    } else {\n        const idx = parseInt(ev.dataTransfer.getData("idx"));\n        if (entry.participants[idx]) entry.participants[idx].ikesuId = ikesuId;\n    }`,
        `    if (type === "group") {\n        entry.participants.forEach(p => { p.ikesuId = ikesuId; p._ikesuModified = true; });\n    } else {\n        const idx = parseInt(ev.dataTransfer.getData("idx"));\n        if (entry.participants[idx]) { entry.participants[idx].ikesuId = ikesuId; entry.participants[idx]._ikesuModified = true; }\n    }`
    ],
    // 6. toggleLeader (Line ~4618)
    [
        `                    if (p.isLeader) { p.isLeader = false; modified = true; }\n                });\n            }\n            // Clear within the same ikesu\n            if (targetIkesuId) {\n                e.participants.forEach(p => {\n                    if (p.ikesuId === targetIkesuId && p.isLeader) { p.isLeader = false; modified = true; }\n                });`,
        `                    if (p.isLeader) { p.isLeader = false; p._ikesuModified = true; modified = true; }\n                });\n            }\n            // Clear within the same ikesu\n            if (targetIkesuId) {\n                e.participants.forEach(p => {\n                    if (p.ikesuId === targetIkesuId && p.isLeader) { p.isLeader = false; p._ikesuModified = true; modified = true; }\n                });`
    ],
    // 7. toggleLeader (isLeader = isNowLeader)
    [
        `    entry.participants[pIdx].isLeader = isNowLeader;\n    entry.lastModified = new Date().toISOString();`,
        `    entry.participants[pIdx].isLeader = isNowLeader;\n    entry.participants[pIdx]._ikesuModified = true;\n    entry.lastModified = new Date().toISOString();`
    ],
    // 8. cancelEntry (Line ~5142)
    [
        `        entry.status = 'cancelled';\n        entry.lastModified = new Date().toISOString();`,
        `        entry.status = 'cancelled';\n        entry._statusModified = true;\n        entry.lastModified = new Date().toISOString();`
    ],
    // 9. restoreEntry (Line ~5164)
    [
        `        entry.status = 'pending';\n        entry.lastModified = new Date().toISOString();`,
        `        entry.status = 'pending';\n        entry._statusModified = true;\n        entry.lastModified = new Date().toISOString();`
    ],
    // 10. mergeData Adopt Server Catch if not explicit (Line 1221)
    [
        `                                // Adopt server catch if local is 0 to prevent wiping newly entered catches\n                                if (!localP.catchA && !localP.catchB && (serverEntry.participants[pIdx].catchA || serverEntry.participants[pIdx].catchB)) {\n                                    localP.catchA = serverEntry.participants[pIdx].catchA;\n                                    localP.catchB = serverEntry.participants[pIdx].catchB;\n                                }`,
        `                                // Adopt server catch if local is not explicitly modified\n                                if (localP._catchModified) {\n                                    delete localP._catchModified;\n                                } else {\n                                    localP.catchA = serverEntry.participants[pIdx].catchA;\n                                    localP.catchB = serverEntry.participants[pIdx].catchB;\n                                }`
    ],
    // 11. saveDayCatch (Line 3152)
    [
        `    p.catchA = parseInt(document.getElementById('day-input-cA').value) || 0;\n    p.catchB = parseInt(document.getElementById('day-input-cB').value) || 0;\n    saveStateToLocalStorage();`,
        `    p.catchA = parseInt(document.getElementById('day-input-cA').value) || 0;\n    p.catchB = parseInt(document.getElementById('day-input-cB').value) || 0;\n    p._catchModified = true;\n    saveStateToLocalStorage();`
    ],
    // 12. commitLeaderResultsSave (Line 4583)
    [
        `        if (entry && entry.participants[idx]) {\n            entry.participants[idx].catchA = parseInt(row.querySelector('.catch-a').value) || 0;\n            entry.participants[idx].catchB = parseInt(row.querySelector('.catch-b').value) || 0;\n        }`,
        `        if (entry && entry.participants[idx]) {\n            entry.participants[idx].catchA = parseInt(row.querySelector('.catch-a').value) || 0;\n            entry.participants[idx].catchB = parseInt(row.querySelector('.catch-b').value) || 0;\n            entry.participants[idx]._catchModified = true;\n        }`
    ],
    // 13. clearCatchData (Line 5309)
    [
        `            if (p.catchA > 0 || p.catchB > 0 || p.isAwardWinner) {\n                p.catchA = 0;\n                p.catchB = 0;\n                p.isAwardWinner = false;\n                updated = true;\n            }`,
        `            if (p.catchA > 0 || p.catchB > 0 || p.isAwardWinner) {\n                p.catchA = 0;\n                p.catchB = 0;\n                p.isAwardWinner = false;\n                p._catchModified = true;\n                updated = true;\n            }`
    ],
    // 14. mergeData logic completely replaced (Line 872)
    [
        `            // 両方にある場合: 更新日時(lastModified)が新しい方を採用
            const cEntry = cloudMap.get(lEntry.id);
            const lTime = new Date(lEntry.lastModified || lEntry.timestamp || 0).getTime();
            const cTime = new Date(cEntry.lastModified || cEntry.timestamp || 0).getTime();

            if (lTime > cTime) {
                const idx = merged.entries.findIndex(e => e.id === lEntry.id);
                if (idx !== -1) merged.entries[idx] = lEntry;
            }
        }
    });`,
        `            // 両方にある場合: プロパティ単位のディープマージ
            const cEntry = cloudMap.get(lEntry.id);
            const lTime = new Date(lEntry.lastModified || lEntry.timestamp || 0).getTime();
            const cTime = new Date(cEntry.lastModified || cEntry.timestamp || 0).getTime();

            const mergedEntry = JSON.parse(JSON.stringify(cEntry)); // Base is Server

            // 1. Form modifications (structural changes)
            if (lEntry._formModified) {
                mergedEntry.participants = JSON.parse(JSON.stringify(lEntry.participants));
                mergedEntry.groupName = lEntry.groupName;
                mergedEntry.representative = lEntry.representative;
                mergedEntry.phone = lEntry.phone;
                mergedEntry.source = lEntry.source;
                mergedEntry.memo = lEntry.memo;
                mergedEntry.lastModified = lEntry.lastModified;
                delete lEntry._formModified;
            } 

            // 2. Property-level modifications
            let bumped = false;
            
            if (lEntry._statusModified) {
                mergedEntry.status = lEntry.status;
                delete lEntry._statusModified;
                bumped = true;
            } else if (lTime > cTime && lEntry.status !== cEntry.status) {
                mergedEntry.status = lEntry.status;
            }

            (lEntry.participants || []).forEach((lP, pIdx) => {
                const mP = mergedEntry.participants[pIdx];
                if (mP) {
                    if (lP._ikesuModified) { mP.ikesuId = lP.ikesuId; mP.isLeader = lP.isLeader; delete lP._ikesuModified; bumped = true; }
                    else if (lTime > cTime) { mP.ikesuId = lP.ikesuId; mP.isLeader = lP.isLeader; }

                    if (lP._typeModified) { mP.type = lP.type; delete lP._typeModified; bumped = true; }
                    else if (lTime > cTime && lP.type !== undefined) { mP.type = lP.type; }

                    if (lP._statusModified) { mP.status = lP.status; delete lP._statusModified; bumped = true; }
                    else if (lTime > cTime && lP.status !== undefined) { mP.status = lP.status; }

                    if (lP._catchModified) { 
                        mP.catchA = lP.catchA; 
                        mP.catchB = lP.catchB; 
                        delete lP._catchModified; 
                        bumped = true; 
                    }
                }
            });

            if (bumped || lEntry._formModified) {
                mergedEntry.lastModified = new Date().toISOString();
            } else if (lTime > cTime) {
                mergedEntry.lastModified = lEntry.lastModified;
            }

            const idx = merged.entries.findIndex(e => e.id === lEntry.id);
            if (idx !== -1) merged.entries[idx] = mergedEntry;
        }
    });`
    ]
];

// Special patch for generateMockCatchData because of duplicated lines
content = content.replace(
    /\} else \{\n\s*p\.catchB = 0;\s*\/\/\ 22\%\n\s*\}\n\s*updated = true;\n\s*\}\n\s*\/\/ Update counts/,
    `} else {\n                    p.catchB = 0;       // 22%\n                }\n                p._catchModified = true;\n                updated = true;\n            }\n            // Update counts`
);

let success = 0;
for (const [target, repl] of replacements) {
    if (content.includes(target)) {
        content = content.replace(target, repl);
        success++;
    } else {
        console.log("Failed to find:\\n" + target);
    }
}
fs.writeFileSync('script.js', content);
console.log("Applied " + success + " replacements");
