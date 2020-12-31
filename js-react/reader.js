// This module reads data from a mongodb database.
//

import {MongoClient} from 'mongodb';

const reader = function(){

  // This will connect to the mongodb
  //
  const connect = function(connectString){
    return MongoClient.connect(connectString);
  }

  // Return promise to return list of datasets in the mongo 'db'
  //
  const getDatasets = function(db){
    return db.listCollections().toArray();
  }

  // Return a promise to get the 'dataset' from database 'db'
  //
  const getData = function(db, dataset){
    return db.collection(dataset).find().toArray();
  }

  // Like getData(), but uses a mongodb query
  //
  const getDataWithQuery = function(db, dataset, query){
    return db.collection(dataset).find(query.criteria, query.options)
        .toArray();
  }

  // Like getDataWithQuery(), but runs an aggregation pipeline
  // on the result.
  //
  const getPivotedData = function(db, dataset, pipeline){
    const useDisk = { allowDiskUse: true };
    return db.collection(dataset).aggregate(pipeline, useDisk).toArray();
  }

  // Return the categorical values for 'column' within 'dataset'
  //
  const getCategoricalValues = function(db, dataset, column){
    return db.collection(dataset).distinct(column);
  }

  return {
    connect,
    getDatasets,
    getData,
    getDataWithQuery,
    getPivotedData,
    getCategoricalValues
  }

}();

// Make reader available to other node modules
//
export default reader;
