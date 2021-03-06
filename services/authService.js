'use strict';
const Promise = require('promise');
const HttpStatus = require('http-status');
const ServiceError = require('core-server').ServiceError;
const SecretFactory = require('core-server').ApiSecretFactory;

const jwt = require('jsonwebtoken');
const sha1 = require('sha1');
const config = require('config');

const model = require('security-model').model;
const SECRET = 'shhhhhh!';

// Dependent Services - TYPES
const TENANT_SERVICE_TYPE = 'TenantService';

// Expire Token in 10h
const JWT_OPTS = {
  expiresIn: '10h',
};

class AuthService {
  constructor(proxy) {
    this.proxy = proxy;
    this.model = model;

    this.secretFactory = new SecretFactory();
  }

  authorise(authRequest) {
    let _this = this;
    let p = new Promise((resolve, reject) => {
        let clientId = authRequest.client_id;
        let clientSecret = authRequest.client_secret;
        let scope = authRequest.scope;
        let grant = authRequest.grant;
        _this.secretFactory.verifySecret(clientSecret, clientId).then((verified) => {
          if (verified.scope === 'Tenant')
             return _this._lookupTenant(clientId, clientSecret);
          else if (verified.scope === 'Application')
             return _this._lookupApplication(clientId, clientSecret);
          else
             throw new ServiceError(HttpStatus.FORBIDDEN, 'Invalid Client Secret');
        }).then((resource) => {
          // If the resource has a tenantName (i.e application) otherwise it is a tenant so use name
          return _this._storeAuthToken(resource.tenantName || resource.name, authRequest);
        }).then((signedRequest) => {
          return _this._buildAuthResponse(signedRequest, authRequest);
        }).then((authResponse) => {
          resolve(authResponse);
        }).catch((err) => {
          if (err.status === HttpStatus.NOT_FOUND) {
            let serviceError = new ServiceError(HttpStatus.UNAUTHORIZED, err.obj.errorMessage);
            reject(serviceError);
          } else {
            reject(err);
          }
        });
      });

    return p;
  }

  check(accessToken) {
    let p = new Promise((resolve, reject) => {
      model.findAccessToken(accessToken).then((tokenModel) => {
        if (tokenModel) {
          jwt.verify(tokenModel.access_token, SECRET, (err, decoded) => {
            if (err) {
              resolve({ valid: false, tenantName: tokenModel.name });
            } else {
              resolve({ valid: true, tenantName: tokenModel.name });
            }
          });
        } else {
          resolve({ valid: false, tenantName: null });
        }
      }).catch((err) => {
        reject(err);
      });
    });
    return p;
  }

  token(tokenHashAccessCode) {
    return this._lookupTokenByHash(tokenHashAccessCode);
  }

  _lookupTokenByHash(hash) {
    let _this = this;
    let p = new Promise((resolve, reject) => {
      _this.model.findAccessTokenByHash(hash).then((accessToken) => {
        resolve(accessToken);
      }).catch((err) => {
        reject(err);
      });
    });
    return p;
  }

  _buildAuthResponse(signedRequest, authRequest) {
    let p = new Promise((resolve, reject) => {
      let sha = authRequest.hash;
      let ip = require('ip').address();

      // Need to get DNS of LB - for now whatevs
      if (process.env.HOST_IP) {
        ip = process.env.HOST_IP;
      }

      let response = {
        redirect_uri: `http://${ip}:${config.port}/api/v1/security/token/#${sha}`,
      };

      resolve(response);
    });

    return p;
  }

  _storeAuthToken(name, authRequest) {
    let _this = this;
    let p = new Promise((resolve, reject) => {
      let scope = authRequest.scope;
      let accessToken = jwt.sign(authRequest, SECRET, JWT_OPTS);
      let hash = sha1(accessToken);
      let accessTokenModel = {
        access_token: accessToken,
        hash: hash,
        scope: scope,
        tenantName: name,
      };
      _this.model.saveAccessToken(accessTokenModel).then((token) => {
        resolve(token);
      }).catch((err) => {
        reject(err);
      });
    });

    return p;
  }

  _lookupTenant(clientId, clientSecret) {
    let _this = this;
    let unavailError = new ServiceError(HttpStatus.SERVICE_UNAVAILABLE, 'Tenant Service Not Available');
    let p = new Promise((resolve, reject) => {
      // Use Proxy to talk to Tenant Service.
      if (_this.proxy) {
        _this.proxy.apiForServiceType(TENANT_SERVICE_TYPE).then((service) => {
          if (service) {
            // Call Tenant Service
            service.api.tenants.getTenantByApiKey({ apiKey: clientId, 'x-fast-pass': true }, (tenant) => {
              resolve(tenant.obj);
            }, (err) => {
              reject(err);
            });
          } else {
            reject(unavailError);
          }
        }).catch((err) => {
          reject(err);
        });
      } else {
        reject(unavailError);
      }
    });

    return p;
  }

  _lookupApplication(clientId, clientSecret) {
    let _this = this;
    let unavailError = new ServiceError(HttpStatus.SERVICE_UNAVAILABLE, 'Tenant Service Not Available');
    let p = new Promise((resolve, reject) => {
      if (_this.proxy) {
        _this.proxy.apiForServiceType(TENANT_SERVICE_TYPE).then((service) => {
          if (service) {
            // Call Application Service
            service.api.applications.getApplicationByApiKey({ apiKey: clientId, 'x-fast-pass': true }, (app) => {
              resolve(app.obj);
            }, (err) => {
              reject(err);
            });
          } else {
            reject(unavailError);
          }
        }).catch((err) => {
          reject(err);
        });
      } else {
        reject(unavailError);
      }
    });

    return p;
  }
}

module.exports = AuthService;
