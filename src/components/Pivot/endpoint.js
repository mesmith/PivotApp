// NodeJS Express endpoint for retrieving collections.
// This should be run from the command line thus:
//   $ node endpoint
// which will run this endpoint on port 3000.
//
// Requires mongodb version 3.6 or better (implements $sum).
//
// Also, this works:
//  $ npm install --save-dev nodemon  ... to install nodemon
//  $ nodemon endpoint                ... restarts node when needed
//
/* eslint-disable no-console */

import transforms from './transforms.js';
import reader from './reader.js';
import metadata from './metadata.js';
import datapoint from './datapoint.js';
import constants from './constants.js';

import express from 'express';
import path from 'path';

const endpoint = function(){

  console.log("endpoint.js RESTful service starting...");

  const app = express();
  const connectString = "mongodb://localhost:27017/pivotDb";

  const port = 3000;

  const q2m = require('query-to-mongo');

  // Given a native field name, return one safe for mongodb fields.
  //
  // NOTE! NOTE!  This will cause categorical values having
  // periods to CHANGE.
  //
  const getMongoField = function(field){
    return field.replace('.', '_');
  }

  // Convert nulls within the 'query'.
  // This stuff is mongo hard :)
  //
  const withNulls = function(query) {

    return Object.keys(query).reduce((i, j) => {
      const values = query[j];

      if (typeof(values)==='object') { // $in: [v1, (null), v2, ... ] ->
                                       // $in: [v1, null, v2, ...]
        if (values.$in) {
          const inOp = values.$in;

          const newFilter = Array.isArray(inOp) ? inOp.map(k => {
            return k === constants.Null ? null : k;
          }) : inOp;

          return {...i, ...{[j]: {$in: newFilter}}};
        } else {
          return {...i, ...j};
        }
      } else {
        const newFilter = Array.isArray(values) ? values.map(k => {
          return k === constants.Null ? null : k;
        }) : (values === constants.Null ? null : values);

        return {...i, ...{[j]: newFilter}};
      }
    }, {});
  }

  // Return static content
  //
  app.use(express.static(path.join(__dirname + "/..")));

  app.get('/', function(req, res){
    res.sendFile(path.join(__dirname + "./index.html"));
  });

  // List every available dataset.  Return in JSON format.
  //
  app.get('/api/list', function(req, res){
    reader.connect(connectString).then(function(db){
      reader.getDatasets(db).then(function(items){
        res.send(items);
      });
    });
  });

  // Get data for :dataset.  Return is in JSON format.
  // Allow optional ?COLUMN=VALUE... parameters.
  //
  app.get('/api/data/:dataset', function(req, res){
    reader.connect(connectString).then(function(db){
      const dataset = req.params.dataset;
      metadata.setMetadata(dataset);

      reader.getData(db, dataset).then(function(data){

        // Apply filter here.  Better is to use the Mongo primitives;
        // using e.g. query-to-mongo package.
        // See the /query getter below.
        //
        const rows = data.filter(function(x){
          return Object.keys(req.query).every(function(y){  // for all keys
            if( x.hasOwnProperty(y) ){
              const value = req.query[y];
              if( Array.isArray(value) ){
                return value.includes(x[y]);  // there exists matching value
              } else {
                return x[y]===value;
              }
            } else {
              return true;  // Missing column considered OK
            }
          });
        });
        res.send(rows);
      });
    });
  });

  // This one gets data, but uses query-to-mongo for the retrieval,
  // utilizing fast Mongo primitives.
  // Example queries:
  //   /query/test10?ZIP>50000
  //   /query/test10?GENDER=Female
  //   /query/test10?RACE=Asian&RACE=White
  //   /query/test10?RACE=Asian,White          ... same as previous
  //   /query/test10?RACE=Asian&limit=5        ... for paging
  //
  app.get('/api/query/:dataset', function(req, res){
    reader.connect(connectString).then(function(db){
      const dataset = req.params.dataset;
      metadata.setMetadata(dataset);

      const query = q2m(req.query);
      reader.getDataWithQuery(db, dataset, query)
        .then(function(data){
          res.send(data);
        });
    });
  });

  // Get the Mongo result, but run the result through our custom
  // pivot transform, rather than through the mongo aggregation
  // pipeline.
  //
  app.get('/api/pivot/:dataset', function(req, res){
    reader.connect(connectString).then(function(db){
      const dataset = req.params.dataset;
      metadata.setMetadata(dataset);

      const query = q2m(req.query);
      reader.getDataWithQuery(db, dataset, query)
        .then(function(data){
          const datapointCol = datapoint.getDefaultDatapointCol();
          const pivoted = transforms.reducer(
              transforms.mapper(data, {}, datapointCol, 'None'));
          res.send(pivoted);
        });
    });
  });

  // Like the above, but allow the user to pass in a different 
  // graphtype and datapoint column.
  //
  app.get('/api/pivot/:dataset/:graphtype/:datapoint', function(req, res){
    reader.connect(connectString).then(function(db){
      const dataset = req.params.dataset;
      metadata.setMetadata(dataset);

      const query = q2m(req.query);
      reader.getDataWithQuery(db, dataset, query)
        .then(function(data){
          const xform = transforms.getTransformedData(req.params.graphtype,
              {}, req.params.datapoint, 'None', constants.d3geom, data);
          res.send(xform);
        });
    });
  });

  // Do pivot, using aggregation pipeline
  //
  app.get('/api/aggregate/:dataset/:datapoint', function(req, res){
    reader.connect(connectString).then(function(db){
      const dataset = req.params.dataset;
      metadata.setMetadata(dataset);

      // First, get the vector of values for each categorical variable.
      // FIXME: I don't think the aggregation pipeline supports this with
      // one query, but see if there's a way.  Using $group seems close,
      // but I haven't figured out how to get it to return the data in
      // the desired format: { COLUMN0: [VALUE0, VALUE1, ...], ... }
      //
      const datapointCol = req.params.datapoint;
      const datapointAlias = metadata.getAlias(datapointCol);
      const numerics = metadata.getNumericsNotCalculated();
      const vectors = metadata.getVectors();

      // We don't need the datapoint col in the list of categorical variables;
      // it's used only as a key
      //
      const catVars = transforms.merge(metadata.getCategoricals(),
          metadata.getSearchable()).filter(function(x){
        return x!==datapointCol;
      });

      const promises = catVars.map(function(x){
        return reader.getCategoricalValues(db, dataset, x);
      });
      Promise.all(promises).then(function(values){
        const catValueMap = catVars.map((x, i) => {
          return {[x]: values[i]};
        }).reduce((v0, v1) => {return {...v0, ...v1}}, {});

        const catNames = Object.keys(catValueMap).reduce((i, j) => {
          const catAlias = metadata.getAlias(j);
          const names = catValueMap[j].reduce((k, l) => {
            const newName = catAlias + ':' + l;
            return {...k, ...{[newName]: true}};
          }, {});

          return {...i, ...names};
        }, {});

        // We can use q2m to generate a $match-ready query, in the 'criteria'
        // field.
        //
        const outerMatch = (Object.getOwnPropertyNames(req.query).length===0) ? 
            {} : q2m(req.query);
        const match1 = outerMatch.criteria || {};
        const match = withNulls(match1);

        // Return the group name associated with datapointCol.  If 'useAlias'
        // is true, the returned name is the external (alias) name
        //
        const getGroupName = function(datapointCol, useAlias){
          const name = useAlias? metadata.getAlias(datapointCol) : 
              datapointCol;
          const binner = metadata.getBinner(datapointCol);
          return (binner==='byMonth')? '' + name + ':month' : '' + name;
        }

        // Return an object used to create a datapoint alias that might
        // be grouped (e.g. by date).
        //
        const getGroupedDatapoint = function(datapointCol){
          const groupAlias = getGroupName(datapointCol, true);
          const groupCol = getGroupName(datapointCol, false);
          return {[groupAlias]: '$' + groupCol};
        }

        // Return the "identity projection"
        //
        const identityProject = function(columns){
          const ip = columns.reduce(function(v1, v2){
            return {...v1, ...{[v2]: true}};
          }, {});
          return {_id: true, ...ip};
        }

        // "Pre" $project: Create a calculated field that is the binned
        // value of the datapoint column.  (If the datapoint column doesn't
        // have a binned value, this will do nothing.)  The binned value
        // for a month is the 1st day of that month.
        //
        const getPreProject = function(datapointCol, identity){
          const binner = metadata.getBinner(datapointCol);
          if( binner==='byMonth' ){
            const groupName = getGroupName(datapointCol, false);
            const monthlyValue = {
              $concat: [
                { $arrayElemAt: [ { $split: 
                    [ '$' + datapointCol, '/' ] }, 0 ] },
                '/01/',
                { $arrayElemAt: [ { $split: 
                    [ '$' + datapointCol, '/' ] }, 2 ] },
              ]
            };
            return {...identity, ...{[groupName]: monthlyValue}};
          } else {
            return identity;
          }
        }

        const allCols = metadata.getAll();
        const ip = identityProject(allCols);
        const preProject = getPreProject(datapointCol, ip);

        // Get the $group attributes for each categorical variable value
        //
        const tGroup = Object.keys(catValueMap).map(function(x){
          const alias = metadata.getAlias(x);
          return catValueMap[x].map(function(value){

            // This will create a field such as 'Gender:Male'.
            // Note that Mongo doesn't allow '.' in a field name, so
            // this will get a safe alternative.
            //
            // NOTE! NOTE!  This will cause categorical values that
            // contain '.' to CHANGE (using an underscore)!!
            //
            const fqn = getMongoField('' + alias + ':' + value);

            // This will count the number of the categorical variable value
            // appearances for each datapoint (e.g. STATE).
            //
            const counter = {
              $sum: {
                $cond: [
                  { $eq: [ '$' + x, { $literal: value } ] }, 1, 0
                ]
              }
            }
            return {[fqn]: counter};
          }).reduce((v1, v2) => { return {...v1, ...v2}; }, {});
        }).reduce((v1, v2) => { return {...v1, ...v2}; }, {});

        // # primary keys (e.g. 'customers') record
        //
        const nrecName = metadata.getAlias(constants.sumrecords);

        // aGroup will look like this:
        // {
        //   _id: {
        //     State: '$STATE',
        //   },
        //   '<numeric-alias>': { $sum: '$<numeric-column>' }, // sums numerics
        //   '<vector-alias>': { $addToSet: '$<vector-column>' },
        //   'Gender:Male': {
        //     $sum: {
        //       $cond: [
        //         { $eq: [ '$GENDER', 'Male' ] }, 1, 0
        //       ]
        //     }
        //   }, ...
        // }
        const datapointObj = getGroupedDatapoint(datapointCol);
        const nGroup = { _id: datapointObj, }

        // $addToSet will create a vector of vectors
        //
        const vGroup = vectors.reduce((i, j) => {
          const alias = metadata.getAlias(j);

          return {...i, ...{[alias]: { $addToSet: '$' + j }}};
        }, {});

        const vProject = vectors.reduce((i, j) => {
          const alias = metadata.getAlias(j);

          return {...i, ...{[alias]: true}};
        }, {});

        const numericSums = numerics.filter(i => {
          return i !== constants.sumrecords;
        }).reduce((i, j) => {
          const alias = metadata.getAlias(j);
          return {...i, ...{[alias]: { $sum: '$' + j }}};
        }, {});
        
        const cGroup = {[nrecName]: { $sum: 1 }, ...numericSums};
        const aGroup = {...nGroup, ...cGroup, ...tGroup, ...vGroup};

        // Get the $project attributes for each categorical variable value.
        // tProject is for all of the categorical values.
        //
        // NOTE! NOTE!  This will cause categorical values that
        // contain '.' to CHANGE (using an underscore)!!
        //
        const tProject = Object.keys(catValueMap).map(function(x){
          const alias = metadata.getAlias(x);
          return catValueMap[x].map(function(value){
            const fqn = getMongoField('' + alias + ':' + value);
            return {[fqn]: true};
          }).reduce((v1, v2) => {return {...v1, ...v2}}, {});
        }).reduce((v1, v2) => {return {...v1, ...v2}}, {});

        // cProject is for the "total # of records" field
        //
        // const cProject = {[nrecName]: true, <numeric-alias>: true, ...};

        const numericTrues = numerics.filter(i => {
          return i !== constants.sumrecords;
        }).reduce((i, j) => {
          const alias = metadata.getAlias(j);
          return {...i, ...{[alias]: true}};
        }, {});
        const cProject = {[nrecName]: true, ...numericTrues};

        // dProject is for the datapoint column
        //
        const groupAlias = getGroupName(datapointCol, true);
        const dProject = {[groupAlias]: '$_id.' + groupAlias};

        // aProject will look like this:
        // {
        //   _id: false,
        //   'State': '$_id.State',   ... datapoint column and value
        //   'Customers': true,       ... # records count
        //   'Gender:Male': true,     ... All of the categorical pivot counts
        //    ...
        // }
        //
        const aProject = { _id: false, ...dProject, ...cProject, ...tProject, ...vProject };

        const pipeline = [ 
          {$match: match}, 
          {$project: preProject},
          {$group: aGroup}, 
          {$project: aProject}
        ];
        reader.getPivotedData(db, req.params.dataset, pipeline)
          .then(function(data){

            // Post-process: Remove all categorical variable
            // values whose count is zero.  These don't add any information,
            // and the result set is sparse, so this shrinks the result
            // set a lot.
            //
            // Also, add an id field for last-ditch animation constancy.
            //
            // And modify grouped datapoint variables to be consistent 
            // with legacy names (e.g. don't use 'Gain Date:month', use
            // 'Gain Date'; and don't send mm/01/YYYY date, send the epoch MS).
            // FIXME: Adjust app so it allows 'Gain Date:month' = '05/01/2011'.
            //
            // FIXME: Ideally, the above would be done directly in
            // the aggregation pipeline.
            //
            const final = data.map((row, i) => {
              return Object.keys(row).filter(key => {
                return !catNames.hasOwnProperty(key) || row[key]!==0;
              }).map(key => {
                if( key==groupAlias && groupAlias!==datapointAlias ){

                  // e.g. 05/01/2011 -> 1430452800000
                  //
                  const epoch = +new Date(row[key]);  

                  return {[datapointAlias]: epoch};
                } else {
                  return {[key]: row[key]};
                }
              }).reduce((v0, v1) => { return {...v0, ...v1, id: i} }, {});
            });
            res.send(final);
        });
      });
    });
  });

  // Return the distinct values of ':column' within ':dataset'
  //
  app.get('/api/values/:dataset/:column', function(req, res){
    reader.connect(connectString).then(function(db){
      const dataset = req.params.dataset;
      metadata.setMetadata(dataset);

      reader.getCategoricalValues(db, dataset,
          req.params.column).then(function(values){
        res.send(values);
      });
    });
  });

  // Return distinct values of every column of the given :type
  //
  app.get('/api/allvalues/:dataset/:type', function(req, res){
    reader.connect(connectString).then(function(db){
      const dataset = req.params.dataset;
      metadata.setMetadata(dataset);

      const catVars = metadata.getColumnsByAttrValue('type', 
          req.params.type);
      const promises = catVars.map(function(x){
        return reader.getCategoricalValues(db, dataset, x);
      });
      Promise.all(promises).then(function(values){
        const catValueMap = catVars.map(function(x, i){
          return {[x]: values[i]};
        }).reduce((v0, v1) => {return {...v0, ...v1}}, {});
        res.send(catValueMap);
      });
    });
  });

  // Return rows where column :name has the given :value
  //
  app.get('/api/data/:dataset/:name/:value', function(req, res){
    const col = req.params.name;
    const value = req.params.value;
    reader.connect(connectString).then(function(db){
      const dataset = req.params.dataset;
      metadata.setMetadata(dataset);

      reader.getData(db, dataset).then(function(data){
        const rows = data.filter(function(x){
          return x.hasOwnProperty(col) && x[col]===value;
        });
        res.send(rows);
      });
    });
  });

  app.set('port', port);
  app.listen(port, function(){
    console.log("Listening for connections on port: " + port);
  });
}();

export default endpoint;
