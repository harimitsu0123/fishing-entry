const fs = require('fs');
let content = fs.readFileSync('script.js', 'utf-8');

const mergeDataSettingsReplacement = `        merged.settingsLastModified = cloud.settingsLastModified || local.settingsLastModified;
    }
    
    // --- 2.5. 独立フォームのデータマージ ---
    const localPreTime = new Date(local.preordersLastModified || 0).getTime();
    const cloudPreTime = new Date(cloud.preordersLastModified || 0).getTime();
    if (localPreTime > cloudPreTime) {
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

    // --- 3. 重複排除、削除済みフィルタ、ソート ---`;

content = content.replace(/        merged\.settingsLastModified = cloud\.settingsLastModified \|\| local\.settingsLastModified;\r?\n    \}\r?\n    \r?\n    \/\/ --- 3\. 重複排除、削除済みフィルタ、ソート ---/, mergeDataSettingsReplacement);

fs.writeFileSync('script.js', content, 'utf-8');
console.log("Patched mergeData");
