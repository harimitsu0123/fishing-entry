import urllib.request
import json
url = 'https://script.google.com/macros/s/AKfycbydXZuGZWqI1rpx0fPJawHMzYekVubxeBCLs9taZPG3glPaFVD19CK7BRx1PZcCkRLf/exec'
req = urllib.request.Request(url)
with urllib.request.urlopen(req) as response:
    data = json.loads(response.read().decode())
    
data['entries'] = [e for e in data.get('entries', []) if e.get('id') is not None]
payload = json.dumps({'action': 'save', 'db': data}).encode('utf-8')
req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'text/plain'})
with urllib.request.urlopen(req) as response:
    print(response.read().decode())
