// mongodb app to load CSV data
//
/* eslint-disable no-console */
//
import constants from './constants';
import time from './time';
import utils from './utils';
import fs from 'fs';
import csv from 'csvtojson';
import { MongoClient } from 'mongodb';

const ais_nav_load = function(){
  const connectString = 'mongodb://localhost:27017/pivotDb';

  const entityKey = 'ID';
  const entityFields = [ 'ID', 'Name' ];
  const entityLastNavField = 'Last NAV';
  const entityLastNavDateField = 'Las NAV Date'; // NOT a typo!

  // List of Last NAVs from the Entity table that are known to be bad.
  // We add an APPROXIMATE NAV based on the prior month's value.
  //
  const badEntityNAVs = {
    '1044': 2487949, // MS Premier Pharma Intarcia
    '2004': 171967,  // Priderock
    '2010': 5000000, // Priderock
    '2013': 834749
  };

  const entityFieldMap = entityFields.reduce((j, k) => {
    return {...j, ...{[k]: true}};
  }, {});

  const isDateField = function(i) {
    return !entityFieldMap.hasOwnProperty(i);
  }

  const execute = function() {
    readOne('AIS_Nav').then(navData => {
      readOne('AIS_Entities').then(entityData => {
        const eventData = removeNullNAVs(getEvents(navData, entityData));
        connectAndLoad(connectString, 'AIS_Nav_Events', eventData);
      });
    });
  }

  // Convert the table of NAVs (where multiple dates are on
  // a single row) into an event table.
  //
  // Once an entity starts reporting NAV, it reports NAV for every
  // quarter (even if the quarter isn't in the data).  The previously
  // reported quarter is used.
  //
  // This also projects the last reported NAV into the future,
  // as something of an artifact of the algorithm.  Not a terrible
  // assumption, but probably not accurate either, so the user of
  // the data needs to watch out for that case.
  //
  const getEvents = function(navData, entityData) {
    const entityMap = getEntityLastNavMap(entityData);
    const multiEvents = navData.filter(i => {
      const entities = entityFields.reduce((j, k) => {
        return {...j, ...{[k]: i.hasOwnProperty(k) ? i[k] : null }};
      }, {});

      return entities.ID !== '';
    }).map(i => {
      const entities = entityFields.reduce((j, k) => {
        return {...j, ...{[k]: i.hasOwnProperty(k) ? i[k] : null }};
      }, {});

      const entity = entityMap.hasOwnProperty(entities.ID) ? entityMap[entities.ID] : {};
      const entityDate = entity ? entity[entityLastNavDateField] : null;
      const entityDateQuarter = entityDate
        ? utils.getQuarter(entityDate, /* withDays */ true)
        : null;
      const entityDateQuarterMS = entityDateQuarter ? +new Date(entityDateQuarter) : null;
      const entityNav = getCleanLastNav(entity);

      const orderedDates = Object.keys(i).filter(isDateField).sort((j, k) => {
        const d1 = new Date(j)/1000;
        const d2 = new Date(k)/1000;

        return d1 - d2;
      });

      // This is where the last NAV stretches into the future
      //
      const withAllNavs = orderedDates.reduce((j, k) => {
        const eventDateQuarter = utils.getQuarter(k, /* withDays */ true);
        const eventDateQuarterMS = +new Date(eventDateQuarter);

        // Note: getNav() will use the NAV from the entity if the date of
        // the event is at least the date of the entity.  The entity table's
        // NAV is considered authoritative for that quarter (and it appears
        // to be generally a better quality figure upon inspection--but see
        // also badEntityNavs).
        //
        // Inspection of the two values indicates that the NAV table is often
        // just plain wrong for later values.
        //
        const eventNavString = i[k].replace(/,/g, '');
        const eventNav = isNumber(eventNavString) ? parseFloat(eventNavString) : 0;
        const inNav = getNav(eventNav, entityNav, eventDateQuarterMS, entityDateQuarterMS);

        // For debugging the business rule.  Remove the 'false' to see the overrides.
        //
        if (false && eventDateQuarterMS >= entityDateQuarterMS &&
            eventNav != entityNav && eventNav !== 0) {
          console.log('For entity=' + entity.Name + ', id=' + entities.ID +
              ', date=' + eventDateQuarter + ', will use entity nav=' + entityNav +
              ' instead of event nav=' + eventNav);
        }
        const nav = (inNav === null || inNav === '') ? j.prevNav : inNav;

        return {...j, prevNav: nav, ...{[k]: nav}};
      }, {prevNav: null});

      return orderedDates.map(j => {
        const nav = withAllNavs[j];
        const dateObj = {date: j, nav};
        return {...entities, ...dateObj};
      });
    });

    return [].concat.apply([], multiEvents);
  }

  // Return the float value for the NAV for this event.
  // Uses the value from entityNav if the eventDateQuarter matches the
  // entityDateQuarter, because the entity table is considered authoritative.
  //
  const getNav = function(eventNav, entityNav, eventDateQuarterMS, entityDateQuarterMS) {
    return (eventDateQuarterMS >= entityDateQuarterMS) ? entityNav : eventNav;
  }

  // Return a map from entity ID to its NAV data, after
  // coercing the Las NAV Date values to quarters.
  //
  const getEntityLastNavMap = function(entityData) {
    const withQuarters = entityData.map(i => {
      const lastNavQuarter = utils.getQuarter(i[entityLastNavDateField]);
      return {...i, lastNavQuarter};
    });
    return utils.getEntityMap(withQuarters, entityKey);
  }

  // Remove missing NAV entries.  Had to do this after adding Entity Last NAV
  //
  const removeNullNAVs = function(data) {
    return data.filter(i => {
      return i.nav !== null;
    });
  }

  const isNumber = function(n) {
    return n !== '' && !isNaN(n) && isFinite(n);
  }

  // Get a "clean" Last NAV value for 'entity'.
  // We use the 'badEntityNAVs' table for any data known to be wrong.
  //
  const getCleanLastNav = function(entity) {
    const id = entity.ID;
    const cleanNav = badEntityNAVs.hasOwnProperty(entity.ID)
      ? badEntityNAVs[entity.ID]
      : null;
    return cleanNav || utils.getFloat(entity[entityLastNavField]);
  }

  const readOne = function(dataset, cb){
    const location = '../data/' + dataset + '.csv';

    // FIXME
    const numerics = [];

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
        if (data.length > 0) {
          collection.insertMany(data).then(result => {
            console.log('Loaded ' + dataset);
            process.exit(0);
          });
        } else {
          console.log('There were no records to load');
          process.exit(0);
        }
      });
    })
    .catch(function(err){
      return console.dir(err);
    });
  }

  return {
    execute
  }
}();

ais_nav_load.execute();
