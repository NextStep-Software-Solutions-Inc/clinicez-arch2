using System;
using System.Text.Json;

class Program {
    static void Main() {
        var msg = "API error occurred. Body: {\"errors\":[{\"message\":\"That email address is taken. Please try another.\",\"long_message\":\"That email address is taken. Please try another.\",\"code\":\"form_identifier_exists\",\"meta\":{\"param_name\":\"email_address\"}}],\"clerk_trace_id\":\"a34a0b414527f9e3e8f0cdbdead3b867\"}.";
        try {
            var bodyStr = msg.Substring(msg.IndexOf("Body: ") + 6).TrimEnd('.');
            Console.WriteLine("BodyStr: " + bodyStr);
            var root = JsonDocument.Parse(bodyStr);
            var firstError = root.RootElement.GetProperty("errors")[0].GetProperty("message").GetString();
            Console.WriteLine("Success: " + firstError);
        } catch(Exception ex) {
            Console.WriteLine("Error: " + ex.ToString());
        }
    }
}
