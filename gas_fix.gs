/**
 * GAS側: 高負荷・同時送信対応版データサーバー (v7.1.5)
 * 
 * 修正点:
 * 1. サーバー側での LockService による完全な排他制御
 * 2. transactionId による二重登録防止機能（リロードや再試行時のダブリを排除）
 * 3. 書き込み時の最新データ再取得による「逆転現象」の防止
 */

var PROP_KEY = "fishing_tournament_data_v6";

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    // 最大30秒間、他のリクエストを待たせて「一人ずつ」処理する
    lock.waitLock(30000);
    
    var request = JSON.parse(e.postData.contents);
    var props = PropertiesService.getScriptProperties();
    
    // 現在の最新データを取得（これを行わないと、前の人の保存を上書きしてしまう可能性がある）
    var rawData = props.getProperty(PROP_KEY);
    var db = rawData ? JSON.parse(rawData) : { entries: [], settings: {}, lastUpdated: 0 };
    
    // --- 【アクション 1】 新規登録 (submit) ---
    if (request.action === 'submit') {
      var entry = request.entry;
      
      // A. 二重登録の徹底排除 (transactionId を使用)
      if (entry.transactionId) {
        var existing = db.entries.find(function(en) { return en.transactionId === entry.transactionId; });
        if (existing) {
          // すでにこのIDで保存されていたら、その保存済みのデータを返す（二重発行を防ぐ）
          return createJsonResponse({ status: 'success', entry: existing, note: 'recovered' });
        }
      }
      
      // B. 自動採番ロジック (Lock中なので絶対に被らない)
      var prefixMap = { '一般': 'A', 'みん釣り': 'M', '水宝': 'S', 'ハリミツ': 'H' };
      var prefix = prefixMap[entry.source] || 'A';
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
      entry.id = prefix + '-' + ("00" + nextNum).slice(-3);
      
      // C. データベースに保存
      db.entries.push(entry);
      db.lastUpdated = new Date().getTime();
      props.setProperty(PROP_KEY, JSON.stringify(db));
      
      return createJsonResponse({ status: 'success', entry: entry });
        
    } 
    
    // --- 【アクション 2】 設定・データの上書き保存 (save) ---
    else if (request.action === 'save') {
      var incomingData = request.data;
      
      // サーバー側の方が新しい更新を持っていた場合、安全のため単純な上書きを避けるロジックを入れることも可能ですが、
      // 基本的にはフロント側の「Fetch -> Merge -> Save」フローを信頼します。
      db = incomingData;
      db.lastUpdated = new Date().getTime();
      props.setProperty(PROP_KEY, JSON.stringify(db));
      
      return createJsonResponse({ status: 'success' });
    }
    
  } catch (error) {
    return createJsonResponse({ status: 'error', message: error.toString() });
  } finally {
    // 処理が終わったら必ずロックを解除して次の人を迎え入れる
    lock.releaseLock();
  }
}

function doGet(e) {
  var action = e.parameter.action;
  var props = PropertiesService.getScriptProperties();
  var rawData = props.getProperty(PROP_KEY);
  
  // 初期データがない場合の雛形
  var defaultData = '{"entries":[],"settings":{},"lastUpdated":0}';
  
  return createJsonResponse(rawData ? JSON.parse(rawData) : JSON.parse(defaultData));
}

/** JSONレスポンス生成用のヘルパー */
function createJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
