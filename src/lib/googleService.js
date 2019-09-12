import axios from 'axios';
import moment from 'moment';
import { uniqBy } from 'lodash';
import { defaultErrorHandler } from './util';
import { CACHE_DURATIONS } from './constants';
import config from '../config.json';

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || config.googleApiKey;
const DISTANCE_MATRIX_URL = 'https://maps.googleapis.com/maps/api/distancematrix/json';
const STREET_VIEW_URL = 'https://maps.googleapis.com/maps/api/streetview';
const AUTO_COMPLETE_URL = 'https://maps.googleapis.com/maps/api/place/autocomplete/json';
const PLACE_DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';
const PLACES_TEXT_SEARCH_URL = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
const PLACES_TYPE_SEARCH_URL = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
const PLACE_ID_PREFIX = 'place_id:';
const TRAVEL_MODES = {
  BICYCLING: 'bicycling',
  DRIVING: 'driving',
  WALKING: 'walking',
  TRANSIT: 'transit',
};

const MAX_RETRIES = 5;

export const streetViewImage = (queryStringParameters, res) => {
  axios.get(STREET_VIEW_URL, {
    responseType: 'arraybuffer',
    params: {
      ...queryStringParameters,
      key: GOOGLE_API_KEY,
    },
  }).then((response) => {
    const headers = {
      'Content-Type': response.headers['content-type'],
      'Cache-Control': `public, max-age=${CACHE_DURATIONS.THIRTY_DAYS / 1000}`,
      Expires: new Date(Date.now() + (CACHE_DURATIONS.THIRTY_DAYS)).toUTCString(),
    };
    res.writeHead(200, headers);
    res.end(response.data, 'binary');
  }).catch((err) => {
    res.writeHead(err.response.status, err.response.headers);
    res.end(err.response.data, 'binary');
  });
};

const getDistanceForMode = (query, mode) => {
  const tempQuery = JSON.parse(JSON.stringify(query));
  tempQuery.key = GOOGLE_API_KEY;
  // Set departure time to monday for each upcoming week
  // of the current year to get consistent commute times.
  tempQuery.departure_time =
    moment()
      .day(1 + 7).set('hour', 8).set('minute', 0)
      .unix();
  if (mode === TRAVEL_MODES.TRANSIT) {
    tempQuery.destinations = PLACE_ID_PREFIX + tempQuery.placeId;
  }
  return axios.get(DISTANCE_MATRIX_URL, { params: { ...tempQuery, mode } });
};

const getDistanceForModeUsingAreaArray = (query, destinations, mode, retries) => {
  const tempQuery = JSON.parse(JSON.stringify(query));
  tempQuery.key = GOOGLE_API_KEY;
  let tempDestinations = '';
  destinations.forEach((d) => { tempDestinations += `${d.lat},${d.long}|`; });
  delete tempQuery.areas;

  return new Promise((resolve, reject) => {
    if (retries > 0) {
      axios
        .get(
          DISTANCE_MATRIX_URL,
          {
            params:
            { ...tempQuery, mode, destinations: tempDestinations },
          } // eslint-disable-line comma-dangle
        )
        /* eslint-disable no-loop-func */
        .then((resp) => {
          if (resp.data.status !== 'OVER_QUERY_LIMIT') {
            resolve(resp);
          } else {
            console.error(`Rate limit exceeded, retries left: ${retries}`);
            setTimeout(
              () =>
                resolve(getDistanceForModeUsingAreaArray(query, destinations, mode, retries - 1)),
              1000 * (MAX_RETRIES - retries) // eslint-disable-line comma-dangle
            );
          }
        })
        .catch(err => reject(err));
    } else {
      console.error('Out of retries');
      resolve({ status: 'NOT-OK' }); // This will set the empty commute object in the response
    }
  });
};

const headers = {
  'Cache-Control': `public, max-age=${CACHE_DURATIONS.THIRTY_DAYS / 1000}`,
  Expires: new Date(Date.now() + (CACHE_DURATIONS.THIRTY_DAYS)).toUTCString(),
  'Content-Type': 'application/json;charset=UTF-8',
};

const checkResponseStatus = resp => resp.data &&
  resp.data.rows.length &&
  resp.data.rows[0].elements.length &&
  resp.data.rows[0].elements[0].status === 'OK';

/*  Endpoint to fetch commute distances fpr an array of areas.
*   It will receive a unlimited amount of areas and split these into sets of 25 before sending
*   the requests to Google. (Since the Google API allows for up to 25 destinations per request)
*   The commute distances will be appended to the original array before being sent
*   back to the client.
*/
export const distanceQueryBatch = (query, res) => {
  const { areas } = query;
  const promiseArr = [];

  new Promise((resolve, reject) => {
    // Split the request array of areas into sets of 25
    for (let i = 0; i < Math.ceil(areas.length / 25); i += 1) {
      const areasSlice = areas.slice(i * 25, ((i + 1) * 25)).map(a => a.coordinates);
      // Send a batch request with every travel type
      promiseArr.push(Promise.all([
        getDistanceForModeUsingAreaArray(query, areasSlice, TRAVEL_MODES.BICYCLING, MAX_RETRIES),
        getDistanceForModeUsingAreaArray(query, areasSlice, TRAVEL_MODES.DRIVING, MAX_RETRIES),
        getDistanceForModeUsingAreaArray(query, areasSlice, TRAVEL_MODES.WALKING, MAX_RETRIES),
        getDistanceForModeUsingAreaArray(query, areasSlice, TRAVEL_MODES.TRANSIT, MAX_RETRIES),
      ]));
    }

    Promise.all(promiseArr).then((resp) => {
      resp.forEach(([bikeResp, drivingResp, walkingResp, transitResp], i) => {
        const areasSlice = areas.slice(i * 25, ((i + 1) * 25)).map(a => a.coordinates);
        const fbCommObj = { text: '-', value: 0 };

        for (let j = 0; j < areasSlice.length; j += 1) {
          areas[(25 * i) + j].commute = {};
          areas[(25 * i) + j].commute[TRAVEL_MODES.BICYCLING] =
              checkResponseStatus(bikeResp) ? bikeResp.data.rows[0].elements[j] : fbCommObj;
          areas[(25 * i) + j].commute[TRAVEL_MODES.DRIVING] =
              checkResponseStatus(drivingResp) ? drivingResp.data.rows[0].elements[j] : fbCommObj;
          areas[(25 * i) + j].commute[TRAVEL_MODES.WALKING] =
              checkResponseStatus(walkingResp) ? walkingResp.data.rows[0].elements[j] : fbCommObj;
          areas[(25 * i) + j].commute[TRAVEL_MODES.TRANSIT] =
              checkResponseStatus(transitResp) ? transitResp.data.rows[0].elements[j] : fbCommObj;
        }
      });
      resolve(areas);
    }).catch(err => reject(err));
  }).then((result) => {
    res.writeHead(200, headers);
    res.end(JSON.stringify(result));
  }).catch(defaultErrorHandler(res));
};

export const distanceQuery = (query, res) => {
  axios.all([
    getDistanceForMode(query, TRAVEL_MODES.BICYCLING),
    getDistanceForMode(query, TRAVEL_MODES.DRIVING),
    getDistanceForMode(query, TRAVEL_MODES.WALKING),
    getDistanceForMode(query, TRAVEL_MODES.TRANSIT),
  ]).then(axios.spread((bikeResp, drivingResp, walkingResp, transitResp) => {
    const responseObj = {
      bike: checkResponseStatus(bikeResp) ? bikeResp.data.rows[0].elements[0].duration.text : '- min',
      car: checkResponseStatus(drivingResp) ? drivingResp.data.rows[0].elements[0].duration.text : '- min',
      walk: checkResponseStatus(walkingResp) ? walkingResp.data.rows[0].elements[0].duration.text : '- min',
      // TODO: Define departure time for transit request?
      transit: checkResponseStatus(transitResp) ? transitResp.data.rows[0].elements[0].duration.text : '- min',
      distance: checkResponseStatus(drivingResp) ? drivingResp.data.rows[0].elements[0].distance.text : '- km',
    };
    res.writeHead(200, headers);
    res.end(JSON.stringify(responseObj));
  }))
    .catch(defaultErrorHandler(res));
};

export const autoCompletePlaces = (query, res) => {
  axios.get(AUTO_COMPLETE_URL, { params: { ...query, key: GOOGLE_API_KEY } })
    .then((resp) => {
      res.writeHead(200, headers);
      res.end(JSON.stringify(resp.data));
    })
    .catch(defaultErrorHandler(res));
};

export const placeDetails = (query, res) => {
  axios.get(PLACE_DETAILS_URL, { params: { ...query, key: GOOGLE_API_KEY } })
    .then((resp) => {
      res.writeHead(200, headers);
      res.end(JSON.stringify(resp.data.result.geometry));
    })
    .catch(defaultErrorHandler(res));
};

export const placesSearch = (query, res, arrayToAppend, queryArrayPos) => {
  // Om querytexten innehåller komma så antar vi att det är en array och skriver om query-objektet
  if (query.query && query.query.includes(',')) {
    // eslint-disable-next-line
    query.query = query.query.split(',');
  }
  // Om query är en array så kör vi metoden rekursivt för att påbörja
  // iterationen av query-strängarna
  if (Array.isArray(query.query) && !Number.isInteger(queryArrayPos)) {
    placesSearch({
      ...query,
      type: query.type,
      key: GOOGLE_API_KEY,
    }, res, [], 0);
  } else {
    axios.get(
      query.type ?
        PLACES_TYPE_SEARCH_URL : PLACES_TEXT_SEARCH_URL,
      {
        params:
        {
          ...query,
          query: Array.isArray(query.query) ? query.query[queryArrayPos] : query.query,
          key: GOOGLE_API_KEY,
        },
      },
    )
      .then((resp) => {
        const returnArray = arrayToAppend
          ? [...resp.data.results, ...arrayToAppend]
          : resp.data.results;

        if (resp.data.next_page_token) {
          // Needs to wait for google to propagate pagetoken.
          setTimeout(() => placesSearch({
            type: query.type, key: GOOGLE_API_KEY, pagetoken: resp.data.next_page_token,
          }, res, returnArray, Array.isArray(query.query) ? queryArrayPos : null), 2000);
        } else if (Array.isArray(query.query) && queryArrayPos < query.query.length - 1) {
          placesSearch({
            ...query,
            type: query.type,
            key: GOOGLE_API_KEY,
          }, res, returnArray, queryArrayPos + 1);
        } else {
          res.writeHead(200, headers);
          res.end(Array.isArray(query.query) ?
            JSON.stringify(uniqBy(returnArray, 'id')) :
            JSON.stringify(returnArray));
        }
      })
      .catch(defaultErrorHandler(res));
  }
};

const isHospital = (location) => {
  const { name, types } = location;
  return ( name.toLowerCase().includes('sjukhus') || name.toLowerCase().includes('lasarett') ) && types.includes('hospital');
};

const getDestination = (query, area, type) =>
  axios.get(query.type ?
    PLACES_TYPE_SEARCH_URL : PLACES_TEXT_SEARCH_URL, { params: { ...query, key: GOOGLE_API_KEY } })
    .then((response) => {
      const { data: { results } } = response;
      let destination;

      if (query.query === 'Sjukhus') {
        const hospital = results.find(location => isHospital(location));
        if (hospital) {
          destination = hospital.geometry.location;
        }
      } else {
        destination = results[0].geometry.location;
      }

      return {
        areaId: area.areaId,
        municipalityId: area.municipalityId,
        destination,
        type,
      };
    })
    .catch(() => ({
      // We are returning an unkown destination if google dosen't find any location
      // or if some network error towards google happen
      areaId: area.areaId,
      municipalityId: area.municipalityId,
      destination: '-',
      type,
    }));

/*
Returns destinations (lat, lng) for different types e.g.hospital.
These destinations are based of the closest ones to different areas in the query.
For each area at least one google textsearch is done based on
query (free text) or category.
*/
export const getDestinationBatch = (query, res) => {
  const {
    areas,
    compareQueries,
  } = query;
  const destinationPromises = [];
  const destinationResults = [];
  let numberOfRequests = 0;
  areas.forEach((area) => {
    compareQueries.forEach((compare) => {
      const searchQuery = {
        key: GOOGLE_API_KEY,
        language: query.language,
        type: compare.googleType,
        query: compare.query,
        location: `${area.coordinates.lat},${area.coordinates.long}`,
        rankby: query.rankby,
      };
      numberOfRequests += 1;
      destinationPromises.push(getDestination(searchQuery, area, compare.type));
    });
  });

  const shouldResolve = (resolve) => {
    numberOfRequests -= 1;
    if (numberOfRequests === 0) {
      resolve(destinationResults);
    }
  };

  new Promise((resolve) => {
    destinationPromises.forEach(p => p
      .then((response) => {
        destinationResults.push(response);
        shouldResolve(resolve);
      }).catch(() => {
        shouldResolve(resolve);
      }));
  }).then((result) => {
    res.writeHead(200, headers);
    res.end(JSON.stringify(result));
  }).catch(defaultErrorHandler(res));
};
