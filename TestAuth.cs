using System;
using System.Net.Http;
using System.Threading.Tasks;

class Program {
    static async Task Main() {
        var client = new HttpClient();
        var token = "eyJhbGciOiJSUzI1NiIsImNhdCI6ImNsX0I3ZDRQRDExMUFBQSIsImtpZCI6Imluc18yeWZtNDgwVGQzaWFINndra1JLU3J2VW11UHUiLCJvaWF0IjoxNzgzNjE2NDAxLCJ0eXAiOiJKV1QifQ.eyJhenAiOiJodHRwOi8vbG9jYWxob3N0OjMwMDAiLCJleHAiOjE3ODM2MTY0NjEsImZ2YSI6WzEsLTFdLCJpYXQiOjE3ODM2MTY0MDEsImlzcyI6Imh0dHBzOi8vYW1hemluZy1tb3NxdWl0by03NS5jbGVyay5hY2NvdW50cy5kZXYiLCJuYmYiOjE3ODM2MTYzOTEsInNpZCI6InNlc3NfM0dINnBsclRvUk8zVnNvTndtQ3doYjJjTzlzIiwic3RzIjoiYWN0aXZlIiwic3ViIjoidXNlcl8zR0g0WEFYTlJma25iMnMxSjlhOGJFaFNUY0ciLCJ2IjoyfQ.RvG7PrRrYGo8IBK4dtBxIwqgsmvslzG_jv_B1OU1yS6V-IgPg9-QEXrsDMGxg-jADI3pMG2sU_37FgQfrRR1vQ-lhZSXDwKNs3qvCnkGAezqiXFU29dEKQwD0t22U40y_BLTxgObBbunSNGYJL2tyXYCISMmucwE5Zn-U9E95Ng4zkTiJ7qb-d2O2OKFSr3TRjZRZIFPuYUjuQ2M5xbr_63jXZa88FwSTF2Ko-2FOmoaeFjRA04-pLcdCddwhlMuWM6xYQwTFBC8Sq4YFdEaC52r_RctkSGo1nlVZO0fZ1o7yjBMkEQVmcS3Dht-3JAEIMFab7nEjL7ERJQ7DDTF0Q";
        client.DefaultRequestHeaders.Add("Authorization", "Bearer " + token);
        var res = await client.GetAsync("http://localhost:5000/api/v1/users/test/tenant");
        Console.WriteLine(res.StatusCode);
        var hdr = res.Headers.WwwAuthenticate.ToString();
        Console.WriteLine(hdr);
    }
}
