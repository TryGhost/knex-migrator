var url = require('url'),
    _ = require('lodash/lodash'),
    errors = require('./errors');

var queryStringToObject = function (queryString) {
    var params = {};
    var queryParams = queryString.split('&');

    var paramKeyValue;
    for (var i = 0, ln = queryParams.length; i < ln; i++) {
        paramKeyValue = queryParams[i].split('=');
        params[paramKeyValue[0]] = paramKeyValue[1];
    }

    return params;
}

var handleMySQL = function (urlObject) {
    var auth = [];
    if (urlObject.auth) {
        auth = urlObject.auth.split(':');
    }

    var connectionObject = {
        host: urlObject.hostname,
        user: auth[0],
        password: auth[1],
        database: urlObject.pathname.substr(1)
    };

    if (null !== urlObject.port) {
        connectionObject.port = urlObject.port;
    }

    if (null === urlObject.query) {
        return connectionObject;
    }

    var queryObject = queryStringToObject(urlObject.query);

    if (undefined !== queryObject.characterEncoding) {
        connectionObject.charset = queryObject.characterEncoding;
    }

    return connectionObject;
}

var handleSQLite = function (urlObject) {
    var cleanedName = urlObject.pathname.replace(/^\/\/\//, '/')
    return {
        filename: cleanedName
    }
}

var parseDbString = function (str) {
    var parsedUrl = url.parse(str);
    switch (parsedUrl.protocol) {
        case 'mysql:':
            return handleMySQL(parsedUrl);
            break;

        case 'sqlite:':
        case 'sqlite3:':
            return handleSQLite(parsedUrl);
            break;

        default:
            throw new errors.KnexMigrateError({
                code: 'DATABASE_PROTOCOL_UNSUPPORTED'
            })
                ;
    }
}

exports.ensureObject = function (databaseConfig) {
    if (_.isObject(databaseConfig.connection)) {
        return databaseConfig;
    }

    if (_.isString(databaseConfig.connection)) {
        databaseConfig.connection = parseDbString(databaseConfig.connection);
        return databaseConfig;
    }

    throw new errors.KnexMigrateError({
        code: 'DATABASE_CONNECTION_FORMAT_UNSUPPORTED'
    })
}
