function success(res, data = {}, statusCode = 200)
{
    return res.status(statusCode).json({
        success: true,
        ...data
    });
}


function error(res, message, statusCode = 400)
{
    return res.status(statusCode).json({
        success: false,
        error: {
            message,
            code: statusCode
        }
    });
}


function paginated(res, items, total, page = 1, limit = 20)
{
    return res.status(200).json({
        success: true,
        items,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
    });
}


module.exports = {
    success,
    error,
    paginated
};