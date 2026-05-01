const fs = require('fs');
async function run() {
    const url = 'https://script.google.com/macros/s/AKfycbydXZuGZWqI1rpx0fPJawHMzYekVubxeBCLs9taZPG3glPaFVD19CK7BRx1PZcCkRLf/exec';
    let res = await fetch(url);
    let data = await res.json();
    data.entries = data.entries.filter(e => e.id !== null);
    
    let payload = { action: 'save', db: data };
    let postRes = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload)
    });
    console.log(await postRes.text());
}
run();
