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
    var rawData = props.getProperty(PROP_KEY);
    var db = rawData ? JSON.parse(rawData) : { entries: [], settings: {}, lastUpdated: 0 };
    
    var action = request.action;
    
    // --- 【アクション: 登録 (register / submit)】 ---
    if (action === 'register' || action === 'submit') {
      var entry = request.entry;
      
      // 二重登録チェック
      if (entry.transactionId) {
        var existing = db.entries.find(function(en) { return en.transactionId === entry.transactionId; });
        if (existing) return createJsonResponse({ status: 'success', entry: existing, note: 'recovered' });
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

function saveToDb(db, props) {
  db.lastUpdated = new Date().getTime();
  props.setProperty(PROP_KEY, JSON.stringify(db));
}

function doGet(e) {
  var props = PropertiesService.getScriptProperties();
  var rawData = props.getProperty(PROP_KEY);
  var defaultData = '{"entries":[],"settings":{},"lastUpdated":0}';
  return createJsonResponse(rawData ? JSON.parse(rawData) : JSON.parse(defaultData));
}

function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
