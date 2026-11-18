using System.Data.Common;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.EntityFrameworkCore;
namespace IronLanguage.Web.Areas.Admin.Controllers;
public sealed class AdminExceptionFilter(ILogger<AdminExceptionFilter> logger) : IExceptionFilter
{
    public void OnException(ExceptionContext context)
    {
        if (context.Exception is not (DbException or DbUpdateException)) return;
        logger.LogWarning("Административная операция не выполнена: хранилище недоступно или данные изменились.");
        context.ExceptionHandled = true;
        context.Result = new ViewResult { ViewName = "Error", StatusCode = 503 };
    }
}
