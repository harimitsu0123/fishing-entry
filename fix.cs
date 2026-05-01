using System;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;

class Program {
    static async Task Main() {
        var client = new HttpClient();
        var url = "https://script.google.com/macros/s/AKfycbydXZuGZWqI1rpx0fPJawHMzYekVubxeBCLs9taZPG3glPaFVD19CK7BRx1PZcCkRLf/exec";
        var res = await client.GetStringAsync(url);
        // extremely hacky regex to remove the null id entry
        var clean = System.Text.RegularExpressions.Regex.Replace(res, @"\{""id"":null,.*?""transactionId"":""1777643687876lyzxx""\},?", "");
        var payload = "{\"action\":\"save\",\"db\":" + clean + "}";
        var content = new StringContent(payload, Encoding.UTF8, "text/plain");
        var postRes = await client.PostAsync(url, content);
        Console.WriteLine(await postRes.Content.ReadAsStringAsync());
    }
}
