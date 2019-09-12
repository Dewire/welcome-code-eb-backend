import { decryptString } from 'common/encryptionService';
import axios from 'axios';
import { lantmaterietErrorHandler } from './util';
import { CACHE_DURATIONS } from './constants';

const baseUrl = 'http://maps.lantmateriet.se/';

export const getAuth = (encAuth) => {
  const { username, password } = encAuth;
  const [decUser, decPass] = [username, password]
    .map(enc => decryptString(JSON.stringify(enc)));

  const auth = {
    username: decUser,
    password: decPass,
  };
  return auth;
};

export const mapQuery = (queryStringParameters, res) => {
  const mapCredentials = JSON.parse(queryStringParameters.mapCredentials);
  axios.get(baseUrl + queryStringParameters.api, {
    responseType: 'arraybuffer',
    auth: getAuth(mapCredentials),
    params: queryStringParameters,
  }).then((response) => {
    const headers = {
      'Content-Type': response.headers['content-type'],
      'Cache-Control': `public, max-age=${CACHE_DURATIONS.THIRTY_DAYS / 1000}`,
      Expires: new Date(Date.now() + (CACHE_DURATIONS.THIRTY_DAYS)).toUTCString(),
    };
    res.writeHead(200, headers);
    res.end(response.data, 'binary');
  }).catch(lantmaterietErrorHandler(res));
};
