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
      
      // ★ 自動返信メール送信
      sendEntryConfirmationEmail(entry, "【受付完了】釣り大会へのお申し込みありがとうございます");
      
      return createJsonResponse({ status: 'success', entry: entry });
    } 
    
    // --- 【アクション: 編集 (edit)】 ---
    else if (action === 'edit') {
      var entry = request.entry;
      var index = db.entries.findIndex(function(en) { return en.id === entry.id; });
      if (index !== -1) {
        db.entries[index] = entry;
        saveToDb(db, props);
        
        // ★ 修正完了メール送信
        sendEntryConfirmationEmail(entry, "【内容修正】お申し込み内容の変更を承りました");
        return createJsonResponse({ status: 'success', entry: entry });
      }
      return createJsonResponse({ status: 'error', message: 'Entry not found' });
    }
    
    // --- 【アクション: メール再送 (resend_email)】 ---
    else if (action === 'resend_email') {
      var targetEntry = db.entries.find(function(en) { return en.id === request.id; });
      if (targetEntry) {
        sendEntryConfirmationEmail(targetEntry, "【再送】釣り大会 お申し込み内容のご確認");
        return createJsonResponse({ status: 'success' });
      }
      return createJsonResponse({ status: 'error', message: 'Entry not found' });
    }
    
    // --- 【アクション: 一括送信 (bulk_email)】 ---
    else if (action === 'bulk_email') {
      var subject = request.subject;
      var bodyTemplate = request.body;
      var entriesToMail = request.entries; // 個別データを含む配列
      
      entriesToMail.forEach(function(entry) {
        if (!entry.repEmail) return;
        
        // 変数の置換
        var personalizedBody = bodyTemplate
          .replace(/{{番号}}/g, entry.id || "")
          .replace(/{{名前}}/g, entry.representativeName || "")
          .replace(/{{グループ}}/g, entry.groupName || "")
          .replace(/{{釣り人数}}/g, entry.fishers || "0")
          .replace(/{{見学人数}}/g, entry.observers || "0")
          .replace(/{{参加者名簿}}/g, entry.participantsList || "");
        
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

/** メール送信ヘルパー */
function sendEntryConfirmationEmail(entry, subject) {
  if (!entry.repEmail) return;
  
  var body = 
    entry.representativeName + " 様\n\n" +
    "この度は「釣り大会」へのお申し込み、誠にありがとうございます。\n" +
    "以下の内容で受付を完了いたしました。\n\n" +
    "--------------------------------------------------\n" +
    "■ 受付番号: " + entry.id + "\n" +
    "■ グループ名: " + entry.groupName + "\n" +
    "■ 釣り人数: " + entry.fishers + " 名\n" +
    "■ 見学人数: " + entry.observers + " 名\n" +
    "--------------------------------------------------\n\n" +
    "当日は受付にて「受付番号」をお伝えいただくか、\n" +
    "本メールの画面をご提示ください。\n\n" +
    "内容の変更やキャンセルを希望される場合は、\n" +
    "公式サイトの修正フォームよりお手続きをお願いいたします。\n\n" +
    "大会当日、皆様にお会いできることを楽しみにしております。\n\n" +
    "--- 釣り大会 事務局 ---";
    
  GmailApp.sendEmail(entry.repEmail, subject, body);
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
