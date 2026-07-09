using System;
using System.Reflection;
using Clerk.BackendAPI;
using Clerk.BackendAPI.Models.Operations;
class Program {
    static void Main() {
        var t = typeof(CreateUserRequestBody);
        foreach(var prop in t.GetProperties()) {
            Console.WriteLine(prop.Name + " : " + prop.PropertyType.Name);
        }
    }
}
