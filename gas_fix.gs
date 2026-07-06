/**
 * GAS側: 高負荷・同時送信対応版データサーバー (v8.4.0)
 * 
 * 修正点:
 * 1. フロントエンドのアクション名 (register, edit, resend_email, bulk_email) に完全対応
 * 2. 登録時・編集時の自動返信メール送信機能の追加
 * 3. 管理画面からのメール再送・一括送信機能の実装
 */

var PROP_KEY = "fishing_tournament_data_v6";

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    
    var request = JSON.parse(e.postData.contents);
    var props = PropertiesService.getScriptProperties();
    var db = loadFromDb(props);
    
    var action = request.action;
    
    // --- 【アクション: 登録 (register / submit)】 ---
    if (action === 'register' || action === 'submit') {
      var entry = request.entry;
      
      // 二重登録チェック
      if (entry.transactionId) {
        var existing = db.entries.find(function(en) { return en.transactionId === entry.transactionId; });
        if (existing) return createJsonResponse({ status: 'success', entry: existing, note: 'recovered' });
      }
      
      // 定員チェック (v8.9.41)
      var settings = db.settings || {};
      var entryFishers = parseInt(entry.fishers) || 0;
      
      // 全体定員チェック
      var totalFishers = db.entries.filter(function(en) { return en.status !== 'cancelled'; }).reduce(function(sum, en) { 
        return sum + (parseInt(en.fishers) || 0); 
      }, 0);
      if (settings.capacityTotal && totalFishers + entryFishers > settings.capacityTotal) {
        return createJsonResponse({ status: 'error', message: '大会の全体定員（' + settings.capacityTotal + '名）に達したため、登録できません。' });
      }
      
      // 区分別定員チェック
      var catLimit = 0;
      if (entry.source === '一般') catLimit = settings.capacityGeneral;
      else if (entry.source === 'みん釣り') catLimit = settings.capacityMintsuri;
      else if (entry.source === '水宝') catLimit = settings.capacitySuiho;
      else if (entry.source === 'ハリミツ') catLimit = settings.capacityHarimitsu;
      
      if (catLimit > 0) {
        var catFishers = db.entries.filter(function(en) { 
          return en.source === entry.source && en.status !== 'cancelled'; 
        }).reduce(function(sum, en) { 
          return sum + (parseInt(en.fishers) || 0); 
        }, 0);
        
        // 手動調整分を加味
        var adj = 0;
        if (entry.source === '水宝') adj = parseInt(settings.adjSuihoFishers || 0);
        if (entry.source === 'ハリミツ') adj = parseInt(settings.adjHarimitsuFishers || 0);
        
        if (catFishers + adj + entryFishers > catLimit) {
          return createJsonResponse({ status: 'error', message: entry.source + 'の定員（' + catLimit + '名）に達したため、登録できません。' });
        }
      }

      // 自動採番
      entry.id = generateEntryId(db, entry.source);
      
      db.entries.push(entry);
      saveToDb(db, props);
      
      return createJsonResponse({ status: 'success', entry: entry });
    } 
    
    // --- 【アクション: 編集 (edit)】 ---
    else if (action === 'edit') {
      var entry = request.entry;
      var index = db.entries.findIndex(function(en) { return en.id === entry.id; });
      if (index !== -1) {
        db.entries[index] = entry;
        saveToDb(db, props);
        return createJsonResponse({ status: 'success', entry: entry });
      }
      return createJsonResponse({ status: 'error', message: 'Entry not found' });
    }
    
    // --- 【アクション: メール再送 (resend_email)】 ---
    else if (action === 'resend_email') {
      return createJsonResponse({ status: 'error', message: 'Email feature disabled' });
    }
    
    // --- 【アクション: 一括送信 (bulk_email)】 ---
    else if (action === 'bulk_email') {
      var subject = request.subject;
      var bodyTemplate = request.body;
      var entriesToMail = request.entries; // 個別データを含む配列
      
      entriesToMail.forEach(function(entry) {
        if (!entry.repEmail) return;
        
        // 変数の置換 (v8.4.10: {{名前}} などの詳細形式にも対応)
        var baseUrl = "https://harimitsu0123.github.io/fishing-entry/";
        var personalizedBody = bodyTemplate
          .replace(/{{(番号|受付番号)}}|{受付番号}/g, entry.id || "")
          .replace(/{{(名前|代表者名)}}|{代表者名}/g, entry.representativeName || "")
          .replace(/{{(グループ|グループ名)}}|{グループ名}/g, entry.groupName || "")
          .replace(/{{(釣り人数)}}|{釣り人数}/g, entry.fishers || "0")
          .replace(/{{(見学人数)}}|{見学人数}/g, entry.observers || "0")
          .replace(/{{(参加者名簿)}}|{参加者名簿}/g, entry.participantsList || "")
          .replace(/{{(変更URL)}}|{変更URL}/g, baseUrl + "?id=" + entry.id);
        
        try {
          GmailApp.sendEmail(entry.repEmail, subject, personalizedBody);
        } catch(e) {
          console.error("Failed to send personalized bulk email to: " + entry.repEmail);
        }
      });
      return createJsonResponse({ status: 'success' });
    }
    
    // --- 【アクション: 保存 (save)】 ---
    else if (action === 'save') {
      db = request.data;
      saveToDb(db, props);
      return createJsonResponse({ status: 'success' });
    }
    
    // --- 【アクション: 予約送信 (submit_preorder)】 ---
    else if (action === 'submit_preorder') {
      if (!db.preorders) db.preorders = [];
      request.data.timestamp = new Date().getTime();
      db.preorders.push(request.data);
      saveToDb(db, props);
      return createJsonResponse({ status: 'success' });
    }

    // --- 【アクション: アンケート送信 (submit_survey)】 ---
    else if (action === 'submit_survey') {
      if (!db.surveys) db.surveys = [];
      request.data.timestamp = new Date().getTime();
      db.surveys.push(request.data);
      saveToDb(db, props);
      return createJsonResponse({ status: 'success' });
    }
    
  } catch (error) {
    return createJsonResponse({ status: 'error', message: error.toString() });
  } finally {
    lock.releaseLock();
  }
}

function generateEntryId(db, source) {
  var prefixMap = { '一般': 'A', 'みん釣り': 'M', '水宝': 'S', 'ハリミツ': 'H' };
  var prefix = prefixMap[source] || 'A';
  var samePrefix = db.entries.filter(function(en) { 
    return en.id && en.id.indexOf(prefix + '-') === 0; 
  });
  
  var nextNum = 1;
  if (samePrefix.length > 0) {
    var nums = samePrefix.map(function(en) { 
      var parts = en.id.split('-');
      return parts.length > 1 ? parseInt(parts[1]) : 0; 
    });
    nextNum = Math.max.apply(null, nums) + 1;
  }
  return prefix + '-' + ("00" + nextNum).slice(-3);
}

function loadFromDb(props) {
  // 1. 新しいチャンク方式の確認
  var chunk0 = props.getProperty(PROP_KEY + "_chunk_0");
  if (chunk0) {
    var fullStr = "";
    var i = 0;
    while (true) {
      var chunk = props.getProperty(PROP_KEY + "_chunk_" + i);
      if (!chunk) break;
      fullStr += chunk;
      i++;
    }
    try {
      return JSON.parse(fullStr);
    } catch(e) {
      // 壊れている場合はフォールバック
    }
  }
  
  // 2. 旧方式の読み込み（移行用）
  var rawData = props.getProperty(PROP_KEY);
  if (rawData) {
    return JSON.parse(rawData);
  }
  
  return { entries: [], settings: {}, lastUpdated: 0 };
}

function saveToDb(db, props) {
  db.lastUpdated = new Date().getTime();
  var fullStr = JSON.stringify(db);
  var CHUNK_SIZE = 90000; // 約90KBごとに分割
  var chunksNeeded = Math.ceil(fullStr.length / CHUNK_SIZE);
  
  // 新しいチャンクを保存
  for (var i = 0; i < chunksNeeded; i++) {
    var chunkStr = fullStr.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    props.setProperty(PROP_KEY + "_chunk_" + i, chunkStr);
  }
  
  // 不要になった古いチャンクを削除
  var j = chunksNeeded;
  while (true) {
    var oldChunk = props.getProperty(PROP_KEY + "_chunk_" + j);
    if (!oldChunk) break;
    props.deleteProperty(PROP_KEY + "_chunk_" + j);
    j++;
  }
  
  // 旧方式のプロパティを削除して総容量（500KB）を節約
  if (props.getProperty(PROP_KEY)) {
    props.deleteProperty(PROP_KEY);
  }
}

function doGet(e) {
  var props = PropertiesService.getScriptProperties();
  var db = loadFromDb(props);
  return createJsonResponse(db);
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
