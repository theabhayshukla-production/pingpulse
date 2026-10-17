function notFound(req, res) {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'The requested endpoint does not exist.'
    }
  });
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (error.type === 'entity.parse.failed') {
    res.status(400).json({
      error: {
        code: 'INVALID_JSON',
        message: 'Request body must contain valid JSON.'
      }
    });
    return;
  }

  if (error.type === 'entity.too.large') {
    res.status(413).json({
      error: {
        code: 'REQUEST_TOO_LARGE',
        message: 'Request body is too large.'
      }
    });
    return;
  }

  const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
  if (status >= 500) {
    console.error('Unhandled request error.', error);
  }
  res.status(status).json({
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message: status >= 500 ? 'An unexpected server error occurred.' : error.message
    }
  });
}

module.exports = { notFound, errorHandler };
