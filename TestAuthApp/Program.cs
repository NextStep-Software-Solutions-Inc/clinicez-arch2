using System;
using System.Net.Http;
using System.Threading.Tasks;

class Program {
    static async Task Main() {
        var client = new HttpClient();
        client.DefaultRequestHeaders.Add("Authorization", "Bearer INVALID_TOKEN");
        var res = await client.GetAsync("http://localhost:5000/api/v1/users/test/tenant");
        Console.WriteLine(res.StatusCode);
    }
}
