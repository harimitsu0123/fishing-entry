const fs = require('fs');

function patchFile() {
    let content = fs.readFileSync('script.js', 'utf-8');

    const regexPatches = [
        // 1. handleRegistrationSubmit Name Trim Validation
        {
            search: /if \(participants\.length === 0\) \{/g,
            replace: `for (let i = 0; i < participants.length; i++) {
        if (!participants[i].name.trim()) {
            showStatus(\`参加者\${i + 1}の氏名を入力してください。\`, "error");
            return;
        }
    }

    if (participants.length === 0) {`
        },
        // 2. handleEditSubmit Name Trim Validation
        {
            search: /const sourceEl = document\.querySelector\('input\[name="reg-source"\]:checked'\);\s*const source = sourceEl \? sourceEl\.value : '一般';/g,
            replace: `for (let i = 0; i < participants.length; i++) {
            if (!participants[i].name.trim() && !participants[i].isCancelledEdit) {
                showStatus(\`参加者\${i + 1}の氏名を入力してください。\`, "error");
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
                return;
            }
        }

        const sourceEl = document.querySelector('input[name="reg-source"]:checked');
        const source = sourceEl ? sourceEl.value : '一般';`
        },
        // 3. Gender "?" Option
        {
            search: /\$\{Object\.entries\(genderLabels\)\.map\(\(\[val, label\]\) => `<option value="\$\{val\}" \$\{data && data\.gender === val \? 'selected' : ''\}>\$\{label\}<\/option>`\)\.join\(''\)\}/g,
            replace: `\${Object.entries(genderLabels).filter(([val]) => val !== 'unknown' || (typeof isBypassAllowed === 'function' && isBypassAllowed()) || (data && data.gender === 'unknown')).map(([val, label]) => \`<option value="\${val}" \${data && data.gender === val ? 'selected' : ''}>\${label}</option>\`).join('')}`
        },
        // 4. Age "?" Option
        {
            search: /\$\{Object\.entries\(ageLabels\)\.map\(\(\[val, label\]\) => `<option value="\$\{val\}" \$\{data && data\.age === val \? 'selected' : ''\}>\$\{label\}<\/option>`\)\.join\(''\)\}/g,
            replace: `\${Object.entries(ageLabels).filter(([val]) => val !== 'unknown' || (typeof isBypassAllowed === 'function' && isBypassAllowed()) || (data && data.age === 'unknown')).map(([val, label]) => \`<option value="\${val}" \${data && data.age === val ? 'selected' : ''}>\${label}</option>\`).join('')}`
        },
        // 5. T-shirt "?" Option
        {
            search: /let options = \[\.\.\.tshirtSizes\];/g,
            replace: `const isAdmin = typeof isBypassAllowed === 'function' && isBypassAllowed();
                        let options = tshirtSizes.filter(s => s !== '？' || isAdmin || currentSize === '？');`
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
