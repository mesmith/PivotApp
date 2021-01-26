// mongodb app to load CSV data
//
/* eslint-disable no-console */
//
import metadata from './metadata';
import constants from './constants';
import time from './time';
import fs from 'fs';
import csv from 'csvtojson';
import { MongoClient } from 'mongodb';

const abandonment = function(){
  const connectString = 'mongodb://localhost:27017/pivotDb';

  console.debug = console.log;

  const abandonSchema = {
    duration: 'Duration',
    wait: 'Wait Time',
    talk: 'Talk Time',
    others: 'Others Time',
    date: 'Date',
    time: 'Time'
  };

  const balk = {
    wait: 60,
    duration: 60
  };

  // const histoBinSize = 5;
  const histoBinSize = 30;  // 30 second bins for hazard histogram

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const weekends = {
    'Sat Night Shift': true,
    'Sat Day Shift': true,
    'Sun Night Shift': true,
    'Sun Day Shift': true,
  };

  const regularNights = {
    'Mon Night Shift': true,
    'Tue Night Shift': true,
    'Wed Night Shift': true,
    'Thu Night Shift': true,
    'Fri Night Shift': true,
  };

  const regularDays = {
    'Mon Day Shift': true,
    'Tue Day Shift': true,
    'Wed Day Shift': true,
    'Thu Day Shift': true,
    'Fri Day Shift': true,
  }

  const getSums = function() {
    readOne('Oct-Dec, 2018, TTA').then(abandonmentData => {
      metadata.setMetadata('CallsWithTickets');
      const abandonmentSum = getAbandonmentSummary(abandonmentData);
      console.log('abandonmentSum ='); console.log(abandonmentSum);
    });
  }

  const getHisto = function() {
    readOne('Oct-Dec, 2018, TTA').then(abandonmentData => {
      metadata.setMetadata('CallsWithTickets');
      const abandonmentHisto = getAbandonmentHisto(abandonmentData);
      const hazardFn = getAbandonmentHazardFunction(abandonmentHisto);
      console.log('abandonment histogram:');
      console.log('bin,# values,hazard rate'); 
      Object.keys(abandonmentHisto).map(i => {
        const hazardPct = (hazardFn(i) * 100).toFixed(2);;
        // console.log(`bin: ${i}, # values: ${abandonmentHisto[i]}, hazard rate: ${hazardPct}%`);
        console.log(`${i},${abandonmentHisto[i]},${hazardPct}`);
      });
    });
  }

  // Return abandonment stats by time:
  // - by day of week
  // - by shift (11-7 vs 7-11)
  //
  const getByTime = function() {
    readOne('Oct-Dec, 2018, TTA').then(abandonmentData => {
      metadata.setMetadata('CallsWithTickets');
      const abandonmentStats = getAbandonmentByTime(abandonmentData);
      console.log('abandonmentStats ='); console.log(abandonmentStats);
    });
  }

  // Return abandonment data:
  // - totals are in secs
  // - averages are in minutes
  //
  const getAbandonmentSummary = function(data) {
    const durationField = abandonSchema.duration;
    const waitField = abandonSchema.wait;
    const talkField = abandonSchema.talk;
    const othersField = abandonSchema.others;
    const sums = data.reduce((i, j) => {
      const obj = Object.keys(abandonSchema).reduce((k, l) => {
        const name = abandonSchema[l];
        const newValue = +getSeconds(j[name]);
        const oldValue = i.hasOwnProperty(name) ? i[name] : 0;
        return {...k, ...{[name]: oldValue + newValue}};
      }, {});
      const balks = Object.keys(balk).reduce((k, l) => {
        const name = abandonSchema[l];
        const balkMax = balk[l];
        const outputName = `# Early Abandonments for ${name}, ${balkMax} secs threshold`;
        const value = +getSeconds(j[name]);
        const newCount = value <= balkMax ? 1 : 0;
        const prevCount = i.hasOwnProperty(outputName) ? i[outputName] : 0;
        return {...k, ...{[outputName]: prevCount + newCount}};
      }, {});
      return  {...i, ...obj, ...balks};
    }, {});
    const length = data.length;
    const averages = Object.keys(sums).reduce((i, j) => {
      return {...i, ...{[j]: (sums[j] / length)/60}};
    }, {});

    return {sums, averages};
  }

  // Return hazard function, which is probability function / survival function
  //
  const getAbandonmentHazardFunction = function(histo) {
    const cumulative = getCumulativeHisto(histo);
    const survivalFn = getSurvivalFn(cumulative);
    const probabilityFn = getProbabilityFn(histo, cumulative.total);
    return function(x) {
      const prob = probabilityFn(x);
      const survival = survivalFn(x);
      return prob === null || survival === null ? null : prob / survival;
    }
  }

  const getCumulativeHisto = function(histo) {
    return Object.keys(histo).reduce((i, j) => {
      const value = histo[j];
      const prevValue = i.total;
      const newValue = value + prevValue;

      return {...i, ...{[j]: newValue, total: newValue}};
    }, {total: 0});
  }


  const getSurvivalFn = function(cumulative) {
    return function(x) {
      const bin = Math.floor(x / histoBinSize) * histoBinSize;
      const cum = cumulative.hasOwnProperty(bin) ? cumulative[bin] : null;
      return cum === null ? null : (cumulative.total - cum) / cumulative.total;
    }
  }

  const getProbabilityFn = function(histo, total) {
    return function(x) {
      const bin = Math.floor(x / histoBinSize) * histoBinSize;
      const event = histo.hasOwnProperty(bin) ? histo[bin] : null;
      return event === null ? null : event / total;
    }
  }

  const getAbandonmentHisto = function(data) {
    const field = abandonSchema.duration;

    return data.reduce((i, j) => {
      const value = +getSeconds(j[field]);
      const binId = Math.floor(value / histoBinSize) * histoBinSize;
      const prev = i.hasOwnProperty(binId) ? i[binId] : 0;

      return {...i, ...{[binId]: prev+1}};
    }, {});
  }

  const getAbandonmentByTime = function(data) {
    const dateField = abandonSchema.date;
    const timeField = abandonSchema.time;
    return data.reduce((i, j) => {
      const date = j.hasOwnProperty(dateField) ? j[dateField] : null;
      const time = j.hasOwnProperty(timeField) ? j[timeField] : null;
      const dayOfWeek = date !== null ? new Date(date).getDay() : null;
      const dayName = dayOfWeek !== null ? days[dayOfWeek]: null;
      const shift = getShift(time);
      const shiftAndDay = dayName + ' ' + shift;
      const majorShift = getMajorShift(shiftAndDay);
      const prevShiftAndDay = i.hasOwnProperty(shiftAndDay) ? i[shiftAndDay] : 0;
      const prevMajorShift = i.hasOwnProperty(majorShift) ? i[majorShift] : 0;

      const res = {
        [shiftAndDay]: prevShiftAndDay + 1,
        [majorShift]: prevMajorShift + 1
      };

      return {...i, ...res};
    }, {});
  }

  const getMajorShift = function(shiftAndDay) {
    if (weekends.hasOwnProperty(shiftAndDay) ||
        regularNights.hasOwnProperty(shiftAndDay)) {
      return '****Night or Weekend';
    } else {
      return '****Regular Day Shift';
    }
  }

  const getShift = function(time) {
    if (!time) return null;
    const split = time ? time.split(':') : [];
    const hh = +split[0];
    return hh >= 23 || hh < 7 ? 'Night Shift': 'Day Shift';
  }

  // Given a duration of the form HH:MM:SS, return the number of seconds.
  // Return 0 if there was a problem.
  //
  const getSeconds = function(delta) {
    const split = delta? delta.split(':') : [];
    if (split.length === 3) {
      const hh = +split[0];
      const mm = +split[1];
      const ss = +split[2];
      return (hh * 3600 + mm * 60 + ss);
    } else {
      return 0;
    }
  }

  const readOne = function(dataset, cb){
    const location = '../data/' + dataset + '.csv';

    metadata.setMetadata(dataset);
    const numerics = metadata.getNonAverageNumerics();

    // Make sure that csvtojson doesn't convert numbers to strings
    //
    const colParser = numerics.reduce((i, j) => {
      return {...i, ...{[j]: 'number'}};
    }, {});

    return csv({colParser}).fromFile(location).then((rawData) => {
      console.log('Reading ' + dataset + '.  input #rec=' + rawData.length);
      return rawData;
    });
  }

  // This will connect to the mongodb listener, and then will
  // load 'dataset' with 'data'
  //
  const connectAndLoad = function(connectString, dataset, data) {
    MongoClient.connect(connectString).then(function(db){

      // Get list of existing collections prior to loading
      //
      db.collections().then(function(collections) {
        const collectionMap = collections.reduce((i, j) => {
          return {...i, ...{[j.collectionName]: true}};
        }, {});

        // Remove the entire collection
        //
        if (collectionMap.hasOwnProperty(dataset)) {
          db.collection(dataset).drop();
        }

        const collection = db.collection(dataset);

        console.log('Loading ' + dataset + '.  output #rec=' + data.length);
        collection.insertMany(data).then(result => {
          console.log('Loaded ' + dataset);
          process.exit(0);
        });
      });
    })
    .catch(function(err){
      return console.dir(err);
    });
  }

  return {
    getSums,
    getHisto,
    getByTime
  }
}();

abandonment.getSums();
abandonment.getHisto();
abandonment.getByTime();
