/* eslint no-param-reassign: off */
import { INTERNAL_ERROR_500, BAD_GATEWAY, BAD_REQUEST_400 } from 'common/httpStatus';

const errorCheck = (res, err) => {
  if (err.request) {
    // The request was made but no response was received
    // `error.request` is an instance of XMLHttpRequest in the browser and an instance of
    // http.ClientRequest in node.js
    console.error(err.request);
    res.status(BAD_GATEWAY).json({ msg: 'Bad gateway, check server log.' });
  } else {
    // Error setting up request
    res.status(INTERNAL_ERROR_500).json(err.message);
  }
};

export const toRes = (res, status = 200) => (err, thing) => {
  if (err) return res.status(500).send(err);

  if (thing && typeof thing.toObject === 'function') {
    thing = thing.toObject();
  }
  return res.status(status).json(thing);
};

export const lantmaterietErrorHandler = res => (err) => {
  if (err.response) {
    // The request was made and the server responded with a status code
    // that falls out of the range of 2xx
    const code = err.response.status;
    switch (code) {
      case 404: {
        res
          .status(BAD_REQUEST_400)
          .send('Map service returned 404');
        break;
      }
      default: {
        res
          .status(BAD_GATEWAY)
          .send(err.message);
      }
    }
  } else if (err.request) {
    errorCheck(res, err);
  }
};

export const defaultErrorHandler = res => (err) => {
  errorCheck(res, err);
};

export const customErrorHandler = (res, msg) => {
  res.status(INTERNAL_ERROR_500).json(msg);
};
