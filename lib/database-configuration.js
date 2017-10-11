'use strict';

const url = require('url'),
    _ = require('lodash/lodash'),
    errors = require('./errors');

const queryStringToObject = function (queryString) {
    const params = {};
    const queryParams = queryString.split('&');

    let paramKeyValue;
    for (let i = 0, ln = queryParams.length; i < ln; i = i + 1) {
        paramKeyValue = queryParams[i].split('=');
        params[paramKeyValue[0]] = paramKeyValue[1];
    }

    return params;
};

const handleMySQL = function (urlObject) {
    let auth = [];
    if (urlObject.auth) {
        auth = urlObject.auth.split(':');
    }

    const connectionObject = {
        host: urlObject.hostname,
        user: auth[0],
        password: auth[1],
        database: urlObject.pathname.substr(1)
    };

    if (urlObject.port !== null) {
        connectionObject.port = urlObject.port;
    }

    if (urlObject.query === null) {
        return connectionObject;
    }

    const queryObject = queryStringToObject(urlObject.query);

    if (undefined !== queryObject.characterEncoding) {
        connectionObject.charset = queryObject.characterEncoding;
    }

    return connectionObject;
};

const handleSQLite = function (urlObject) {
    const cleanedName = urlObject.pathname.replace(/^\/\/\//, '/');
    return {
        filename: cleanedName
    }
};

const parseDbString = function (str) {
    const parsedUrl = url.parse(str);
    switch (parsedUrl.protocol) {
        case 'mysql:':
            return handleMySQL(parsedUrl);

        case 'sqlite:':
        case 'sqlite3:':
            return handleSQLite(parsedUrl);

        default:
            throw new errors.KnexMigrateError({
                code: 'DATABASE_PROTOCOL_UNSUPPORTED'
            });
    }
};

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
};
