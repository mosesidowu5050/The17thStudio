/**
 * Throw an app error
 * @param {String} errorMessage
 * @param {String} [errorCode]
 * @param {{context:any, details:any}} [options]
 */
function appError(errorMessage, errorCode = 'ERR', options = {}) {
  const error = new Error(errorMessage);
  error.isApplicationError = true;
  error.errorCode = errorCode;

  if (options.context) {
    error.context = options.context;
  }

  if (options.details) {
    error.details = options.details;
  }

  // Support surfacing a short business-rule code (e.g. 'SL02') in the response
  // Accept either options.businessCode or options.code (both supported)
  const bCode = options.businessCode || options.code;
  if (bCode) {
    error.businessCode = bCode;
  }

  throw error;
}

module.exports = appError;
