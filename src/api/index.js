import { Router } from 'express';
import apicache from 'apicache';
import redis from 'redis';
import { INTERNAL_ERROR_500 } from 'common/httpStatus';
import { mapQuery } from 'lib/lantmaterietService';
import {
  distanceQuery,
  distanceQueryBatch,
  autoCompletePlaces,
  placeDetails,
  placesSearch,
  getDestinationBatch,
  streetViewImage,
} from '../lib/googleService';

const REDIS_HOST = process.env.REDIS_HOST || false;

const cache = REDIS_HOST ?
  apicache
    .options({ redisClient: redis.createClient({ host: REDIS_HOST }) })
    .middleware
  :
  apicache
    .middleware;

const checkQueryParams = (req, res, cb) => {
  if (Object.keys(req.query).length === 0
    && Object.keys(req.body).length === 0) {
    res.status(INTERNAL_ERROR_500).send('Missing query parameters!');
  } else {
    cb();
  }
};

export default () => {
  const api = Router();

  api.get('/lantmateriet', (req, res) => {
    checkQueryParams(req, res, () => mapQuery(req.query, res));
  });

  api.get('/google-distance', (req, res) => {
    checkQueryParams(req, res, () => distanceQuery(req.query, res));
  });

  api.post('/google-distance/areas', cache('370 hours'), (req, res) => {
    checkQueryParams(req, res, () => distanceQueryBatch(req.body, res));
  });

  api.get('/google-places-ac', (req, res) => {
    checkQueryParams(req, res, () => autoCompletePlaces(req.query, res));
  });

  api.get('/google-place-details', (req, res) => {
    checkQueryParams(req, res, () => placeDetails(req.query, res));
  });

  api.get('/google-places-search', (req, res) => {
    checkQueryParams(req, res, () => placesSearch(req.query, res));
  });

  api.post('/google-places-destination', cache('370 hours'), (req, res) => {
    checkQueryParams(req, res, () => getDestinationBatch(req.body, res));
  });

  api.get('/google-street-view', (req, res) => {
    checkQueryParams(req, res, () => streetViewImage(req.query, res));
  });


  return api;
};
