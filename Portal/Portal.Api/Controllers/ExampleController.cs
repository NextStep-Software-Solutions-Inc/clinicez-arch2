using Microsoft.AspNetCore.Mvc;

namespace Portal.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ExampleController : ControllerBase
{
    [HttpGet]
    public IActionResult Get()
    {
        return Ok("Portal API is working!");
    }
}