const fs = require('fs');
let content = fs.readFileSync('script.js', 'utf8');

// Target 1: updateDashboard
const insert1 = `            const pNames = pArray.map(p => p.name).join(' ');
            const pNicks = pArray.map(p => p.nickname || "").join(' ');`;
const target1 = `            const pNames = pArray.map(p => p.name).join(' ');`;

const target1_replace = `            const combinedParticipantInfo = (pNames + " " + pNicks + " " + pRegions + " " + pTshirts + " " + pGenders).toLowerCase();`;
const target1_old = `            const combinedParticipantInfo = (pNames + " " + pRegions + " " + pTshirts + " " + pGenders).toLowerCase();`;

// Target 2: updateReceptionList
const insert2 = `            const pNames = pArray.map(p => p.name).join(' ');
            const pNicks = pArray.map(p => p.nickname || "").join(' ');`;
const target2 = `            const pNames = pArray.map(p => p.name).join(' ');`;

const target2_replace = `            const combined = \`\${e.id} \${e.groupName} \${e.representative} \${pNames} \${pNicks}\`.toLowerCase();`;
const target2_old = `            const combined = \`\${e.id} \${e.groupName} \${e.representative} \${pNames}\`.toLowerCase();`;

if (content.includes(target1_old)) {
    content = content.replace(target1_old, target1_replace);
    // Since target1 string appears multiple times, we replace it carefully or just use regex.
    // Actually, `replace` only replaces the first occurrence, which is perfect for `target1` but we need to make sure we hit the right one.
    // But since we just replaced `target1_old`, we can replace `target1` right before it.
    // Even easier:
    content = content.replace(
        "            const pNames = pArray.map(p => p.name).join(' ');\r\n            const pRegions",
        "            const pNames = pArray.map(p => p.name).join(' ');\r\n            const pNicks = pArray.map(p => p.nickname || \"\").join(' ');\r\n            const pRegions"
    ).replace(
        "            const pNames = pArray.map(p => p.name).join(' ');\n            const pRegions",
        "            const pNames = pArray.map(p => p.name).join(' ');\n            const pNicks = pArray.map(p => p.nickname || \"\").join(' ');\n            const pRegions"
    );
}

if (content.includes(target2_old)) {
    content = content.replace(target2_old, target2_replace);
    content = content.replace(
        "            const pNames = pArray.map(p => p.name).join(' ');\r\n            const combined = `${e.id}",
        "            const pNames = pArray.map(p => p.name).join(' ');\r\n            const pNicks = pArray.map(p => p.nickname || \"\").join(' ');\r\n            const combined = `${e.id}"
    ).replace(
        "            const pNames = pArray.map(p => p.name).join(' ');\n            const combined = `${e.id}",
        "            const pNames = pArray.map(p => p.name).join(' ');\n            const pNicks = pArray.map(p => p.nickname || \"\").join(' ');\n            const combined = `${e.id}"
    );
}

fs.writeFileSync('script.js', content, 'utf8');
console.log("SUCCESS");
