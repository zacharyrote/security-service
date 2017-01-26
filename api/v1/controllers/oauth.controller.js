'use strict';

const appRoot = require('app-root-path');
const HttpStatus = require('http-status');
const ServiceError = require('core-server').ServiceError;

const AuthService = require(appRoot+'/services/authService.js');

const CLIENT_ID_HDR = 'x_client_id';
const CLIENT_SECRET_HDR = 'x_client_secret';

const authorise = (app) => {
  return (req, res) => {
    let url = require('url');
    let url_parts = url.parse(req.url, true);
    let query = url_parts.query;
    let grant = 'token';
    let scope = ['all'];
    if(query.scope) {
      scope = query.scope.split(',');
    }

    let headers = req.headers;

    let authRequest = {
      client_id: headers['x-client-id'],
      client_secret: headers['x-client-secret'],
      grant: grant,
      scope: scope
    };

    let authService = new AuthService(app.proxy);
    authService.authorise(authRequest).then((authResponse) => {
      res.status(HttpStatus.OK).send(authResponse);
    }).catch((err) => {
      if(err.status) {
        if(err instanceof ServiceError) {
          // Can we do duck typing?? Maybe check instance???
          err.writeResponse(res);
        } else {
          new ServiceError(err.status, err.message).writeResponse(res);
        }
      } else {
        new ServiceError(HttpStatus.INTERNAL_SERVER_ERROR, err.message).writeResponse(res);
      }
    });
  }
}

const token = (app) => {
  return (req, res) => {
    let tokenHashAccessCode = req.params.tokenHashAccessCode;
    let authService = new AuthService();
    authService.token(tokenHashAccessCode).then((token) => {
      res.status(HttpStatus.OK).send(token);
    }).catch((err) => {
      new ServiceError(HttpStatus.INTERNAL_SERVER_ERROR, err.message).writeResponse(res);
    });

  }
}

const isTokenValid = (app) => {
  return (req, res) => {
    let authService = new AuthService();
    authService.check(accessToken).then((validity) => {
      res.status(HttpStatus.OK).send({
        valid: validity
      });
    }).catch((err) => {
      if(error instanceof ServiceError) {
        error.writeResponse(res);
      } else {
        new ServiceError(HttpStatus.INTERNAL_SERVER_ERROR, err.message).writeResponse(res);
      }
    });
  }
}

/* Public */
exports.authorise = authorise;
exports.token = token;
exports.isTokenValid = isTokenValid;
