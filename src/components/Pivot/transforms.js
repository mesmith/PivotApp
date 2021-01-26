// This contains data transform functions
//
import metadata from './metadata.js';
import datapoint from './datapoint.js';
import utils from './utils.js';
import constants from './constants.js';
import _ from 'underscore';

const transforms = function(){

  // From among the 'statuses', choose one.
  // We bias the choice toward the end of the statuses; we'd like for
  // there to be more 'greens' and 'unknowns'.
  //
  function chooseStatus(range){
    const seed = Math.random()*Math.pow(2, range) + 1;
    return Math.round(Math.log(seed)/Math.LN2);
  }

  // After analysis, dirty data is considered to be that which can't be 
  // converted to a number, or where the number is 0 (meaning it is unknown)
  //
  function isDirty(datum) {

    // List of numerics to check for dirtiness (non-numeric value).
    // If we have additional dirty-checking rules, add them here.
    //
    return !metadata.getNumerics().every(function(column){
      const alias = metadata.getAlias(column);
      return datum.hasOwnProperty(alias) &&
          !isNaN(+datum[alias]) && +datum[alias] > 0;
    });
  }
  
  // Take a raw dataset and remove data elements which shouldn't be displayed
  // (i.e. if it is "dirty" or its selected type value isn't selected)
  //
  function cullAndAddIDs(data) {
    const cullDirty = 1;
    return data.filter(function(x){
      return cullDirty || !isDirty(x);
    }).map(function(x, i){
      return {id: i, ...x};  // use 'id' as last-resort index for animation
    })
  }

  // Merge the two arrays
  //
  function merge(a1, a2){
    return Object.keys({...utils.getMap(a1), ...utils.getMap(a2)});
  }

  // From 'data', generate an associative array whose
  // keys are named by the datapoint column, and generated 
  // by the datapoint binning function,
  // and whose values are vectors whose names are enumerated by 
  // pivotable columns.
  // Add the fields that are selected by 'selects' to the result as well.
  // Only accept rows that match any of the 'where' filter.
  // Return the list of all newly created columns from
  // the pivots.
  //
  function mapper(data, where, datapointCol, animationCol){
    const datapointAlias = metadata.getAlias(datapointCol);
    const pivots = merge(metadata.getCategoricals(), 
        metadata.getSearchable());
    const numerics = metadata.getNumericsNotCalculated();
    const dates = metadata.getDates();
    const strings = metadata.getStrings();

    // Use the alias for '# Records'
    //
    const nrecName = metadata.getAlias(constants.sumrecords);
    const nrecRec = [[nrecName, 1]];

    // data_res is an object of the form 
    //   {serialized_key: [transformed_datum, ...]}
    //
    return applyWhereClause(data, where, datapointCol).map(function(datum){

      // This contains a presence (count) record that pivots all
      // of the pivotable categorical values.
      //
      const pivoted = getPivotedList(datum, nrecRec, pivots);
      const stringData = getColumnList(datum, strings);
      const numericData = getColumnList(datum, numerics);
      const dateData = getColumnList(datum, dates);

      // Convert the record into a record that contains pivoted
      // column names.
      // This function applies aliases to the result record.
      //
      // Order is important!  pivoted must be last, as it contains
      // a synthetic record for constants.sumrecords ('# Records')
      // that would otherwise be overwritten by numericData.
      //
      const newrec = _.object(numericData.concat(stringData, pivoted, dateData));

      // Generate the datapoint column's value for newrec, 
      // from the datapoint's binning function.
      // The datapoint column is the key that a single 
      // datapoint represents; e.g. 'GAIN_DT'.
      // If the datapoint's binning function isn't 
      // an identity function, it will cause the key's value to be rewritten.  
      // (Example: it may coerce a date into its month.)
      //
      // If we're also animating, append the animation key/value pair to 
      // the serialized key.
      //
      // This function fails on bad date rep.  If it fails, we just throw 
      // away the datum.
      //
      try {
        const bin = datapoint.getBinningFn(datapointCol)(datum, 
            datapointCol);
        const keyName = {...{[datapointAlias]: bin},
            ...getAnimationObject(animationCol, datum)};

        // Note the serialized key
        //
        return { 
          key: JSON.stringify(keyName), value: newrec, 
          pivoted: _.object(pivoted),
        };
      } catch(e) {
        return {};
      }
    })
    .sort(utils.sorter('key'));       // allows faster performance below
  }

  // Run the data through the where clauses.
  // The WHERE clause is like this:
  //   { COL1://  [list of allowed values], COL2: [list of allowed values] }
  // and these are joined by an implicit 'and'.
  //
  const applyWhereClause = function(data, where, datapointCol){
    if( !isEmpty(where) ){
      return data.filter(function(datum){
        return Object.keys(where).map(function(col){
          return {column: col, value: where[col]};
        }).every(function(x){
          return x.value.some(function(allowedValue){
            if( x.column==datapointCol ){
              return allowedValue==
                  datapoint.getBinningFn(datapointCol)(datum, 
                      datapointCol);
            } else {
              return allowedValue==datum[x.column];
            }
          });
        })
      });
    } else {
      return data;
    }
  }

  // Return TRUE if obj is empty
  //
  const isEmpty = function(obj){
    return Object.keys(obj).length===0 && obj.constructor===Object;
  }

  // Return the pivoted form of record in 'datum'.
  // This function also concatenates the synthetic "# Records" column name,
  // from 'nrecRec'.
  //
  // The return value is an array of name/value pair arrays, which is
  // the form that _.object() likes.
  //
  const getPivotedList = function(datum, nrecRec, pivots){
    return nrecRec.concat(pivots.map(function(x){
      return [metadata.getAlias(x) + ':' + datum[x], 1];
    }));
  }

  // Given a list of columns from 'datum',
  // return an array of [column-alias, value-of-column-from-datum].
  //
  const getColumnList = function(datum, cols){
    return cols.map(i => [metadata.getAlias(i), datum[i]]);
  }

  // Function that returns the animation key/value pair,
  // or {} if there isn't one
  //
  const getAnimationObject = function(animationColumn, datum){
    if (animationColumn !== "None") {
      const binner = metadata.getBinnerObject(animationColumn);
      const animationValue = (binner !== null && 'internal' in binner) ?
          binner.internal(datum, animationColumn) :
          datum[animationColumn];
      if (animationValue!=null) {
  
        // e.g. newrec['Gain Date'] = epoch-msecs-for-month
        //
        return {[metadata.getAlias(animationColumn)]: animationValue};
      }
    }
    return {}
  }

  // Add any elements from object 'v2' into object 'v1'.
  //
  const addPivotObject = function(v1, v2){

    // This needs to be a fast operation.  To do that, we avoid
    // calling object cloners unless we have to.
    //
    const keys = v2.pivoted ? Object.keys(v2.pivoted): [];
    return keys.filter(function(x){
      return !v1.hasOwnProperty(x);
    }).reduce(function(v3, v4){
      return {...v3, ...{[v4]: 1}};
    }, v1);
  }

  // Return the transformed data as an object of the form
  // { drawingData, facetData }.
  //
  function getTransformedData(graphtype, rawData, search, datapointCol,
      animationCol, d3geom){
    switch( graphtype ){
      case 'line':
      case 'bubble':
      case 'map':
      {
        const drawingData = transforms.cullAndAddIDs(
            transforms.reducer(transforms.mapper(rawData, 
            search, datapointCol, animationCol)));
        return {drawingData, facetData: drawingData};
      }
      case 'force':
      case 'forceStatus':
      {
        const useStatus = (graphtype=='forceStatus');
        const mapped = transforms.mapper(rawData, search, datapointCol,
            animationCol);
        const drawingData = transforms.cullAndAddIDs(
            transforms.reducerForce(mapped, useStatus, datapointCol, d3geom));
        const facetData = transforms.cullAndAddIDs(transforms.reducer(mapped));
        return {drawingData, facetData};
      }
      default:
      {
        const drawingData = transforms.cullAndAddIDs(
            transforms.reducer(transforms.mapper(rawData, 
            search, datapointCol, animationCol)));
        return {drawingData, facetData: drawingData};
      }
    }
  }

  // Given a previously transformed dataset, return a summary dataset.
  //
  function getSummaryData(drawingData){
    return {
      ...getCategoricalSummaries(drawingData),
      ...getNumericSummaries(drawingData)
    };
  }

  // Return summary information for categorical variables.
  // This just returns counts.
  //
  function getCategoricalSummaries(drawingData){
    const catVarMap = metadata.getCategoricals().reduce((i, j) => {
      return {...i, ...{[metadata.getAlias(j)]: true}};
    }, {});
    const catValueMap = metadata.getCategoricals().filter(i => {
      return metadata.isTrue(i, 'summaryValues');
    }).reduce((i, j) => {
      return {...i, ...{[metadata.getAlias(j)]: true}};
    }, {});

    const dataMap = drawingData.reduce((i, j) => {
      const inner = Object.keys(j).reduce((k, l) => {
        return {...k, ...{[l]: true}};
      }, {});

      return {...i, ...inner};
    }, {});

    const summary = Object.keys(dataMap).filter(i => {
      const catVarName = i.substring(0, i.indexOf(':'));
      return catVarMap.hasOwnProperty(catVarName);
      return catVarMap.hasOwnProperty(catVarName);
    }).reduce((j, k) => {
      const catVarName = k.substring(0, k.indexOf(':'));
      const prevCount = j.hasOwnProperty(catVarName) ? j[catVarName] : 0;
        
      if (catValueMap.hasOwnProperty(catVarName)) {
        const newObj = {
          [catVarName]: prevCount + 1,
          [k]: true
        };

        return {...j, ...newObj};
      } else {
        return {...j, ...{[catVarName]: prevCount + 1}};
      }
    }, {});

    // Prepend '# ' to each name,
    // because we are counting appearances of cat vars
    //
    return Object.keys(summary).reduce((i, j) => {
      return {...i, ...{['# ' + j]: summary[j]}};
    }, {});
  }

  function getCategoricalValueSummaries(drawingData){
    const catVarMap = metadata.getCategoricals()
      .filter(i => {
        return metadata.isTrue(i, 'summaryValues');
      }).reduce((i, j) => {
        return {...i, ...{[metadata.getAlias(j)]: true}};
      }, {});
  }

  // Sum up every numeric variable
  //
  function getNumericSummaries(drawingData){
    const numericMap = metadata.getNumerics().reduce((i, j) => {
      return {...i, ...{[metadata.getAlias(j)]: true}};
    }, {});

    return drawingData.reduce((i, j) => {
      const thisRow = Object.keys(numericMap).reduce((k, l) => {
        const val = j.hasOwnProperty(l) ? j[l]: 0;
        const prev = i.hasOwnProperty(l) ? i[l]: 0;
        return {...k, ...{[l]: val + prev}};
      }, {});

      return {...i, ...thisRow};
    }, {});
  }

  // Return data that allows us to compare original values with values
  // after loads are applied.
  //
  function getLoadComparisonData(drawingData) {
    const map = metadata.getAliasedReverseMap('whatIfOriginal');

    return drawingData.reduce((i, j) => {
      const thisRow = Object.keys(map).reduce((k, l) => {
        const val = j.hasOwnProperty(l) ? j[l]: 0;
        const prev = i.hasOwnProperty(l) ? i[l]: 0;
        const origObj = {[l]: val + prev};
        const withValues = map[l].reduce((m, n) => {
          const val = j.hasOwnProperty(n) ? j[n]: 0;
          const prev = i.hasOwnProperty(n) ? i[n]: 0;
          const innerObj = {[n]: val + prev};

          return {...m, ...innerObj};
        }, origObj);

        return {...k, ...withValues};
      }, {});

      return {...i, ...thisRow};
    }, {});
  }

  // Sum up all pivot values by the datapoint's column.
  // If we're animating, then create a separate aggregated record for
  // each (datapoint rep, animation rep) pair.  Otherwise, we create exactly
  // one record for each datapoint rep key.
  //
  function reducer(mapped){
    const outer = outerReducer(mapped);
    const data = outer.$all;

    return Object.keys(data).map(i => {
      return {$k: i, $v: data[i]};
    }).filter(
      i => _.isArray(i.$v)
    ).map(i => {

      // i.$v is an array of the form
      //   [ {COL1: NUM1, COL2: NUM2, ...}, ... ]
      // for a particular variable.
      // The task is to calculate SUM(NUMi) for each COLj.
      //
      // This must perform very quickly.
      //
      const newval = getAggregateValues(i.$v, outer.$p);

      // Un-serialize the compound key, adding the object's name-value 
      // pairs to newval
      //
      const others = JSON.parse(i.$k);
      return {...newval, ...others};
    });
  }

  // This function converts the data into a form suitable for a force graph.
  // It calculates a node status and a rollup status if bStatus is truthy.
  //
  function reducerForce(mapped, bStatus, datapointCol, d3geom){
    var id = 1;                 // Needed for the force plot
    const outer = outerReducer(mapped);
    const data = outer.$all;
    const datapointAlias = metadata.getAlias(datapointCol);

    // Statuses from which we choose a status color.
    // Choose just the 'unknown' color if bStatus is falsey
    //
    var statuses = [ 'red', 'yellow', 'green', 'unknown' ];
    if( !bStatus ){ statuses = [ 'unknown' ]; }

    const statusRank = (function(){
      var res = {};
      for( var i=0; i!=statuses.length; ++i ){ res[statuses[i]] = i; }
      return res;
    })();
    function aggregateStatus(oldS, newS){
      return ( statusRank[newS] < statusRank[oldS] ) ? newS : oldS;
    }

    const children = Object.keys(data).map(function(key){

      // 'key' is a serialization of the object
      //  {DATAPOINT_ALIAS: value [, ANIMATION_ALIAS: value]}
      //
      const grandchildren = data[key].map(function(x){
        const x1 = {
          id: id++,                   // force graph needs a positive ID
          x: d3geom.MARGINS.left + d3geom.WIDTH/2,
          y: d3geom.MARGINS.top + d3geom.HEIGHT/2,

          // We simulate a status by choosing randomly
          //
          status: statuses[chooseStatus(statuses.length-1)],
          rollupStatus: x.status,
          size: 1,
        };
        return {...x, ...x1};
      });

      const worstStatus = grandchildren.reduce(function(v1, v2){
        return aggregateStatus(v1, v2.status);
      }, 'unknown');

      // Aggregate the enumeration (pivot) data and numeric data
      //
      const aggObj = getAggregateValues(data[key], outer.$p);

      // Un-serialize the object in 'key', and get the object's 
      // name-value pairs embedded in the key
      //
      const keyObj = JSON.parse(key);

      const keyNvPairs = Object.keys(keyObj).map(function(alias){
        var res = {};
        if( alias==datapointAlias ){
          res[datapointCol] = keyObj[alias];      // Use this for sorting
          res.label = res[alias] = 
              datapoint.formatDatapointRep(datapointCol, keyObj[alias]);
        } else {
          res[alias] = keyObj[alias];
        }
        return res;
      }).reduce(function(v1, v2){
        return {...v1, ...v2};
      }, {});

      // Create parent element.
      //
      const parent = {
        id: id++,    // Needed for force graph
        x: d3geom.WIDTH/2,
        y: d3geom.HEIGHT/2,
        status: statuses[chooseStatus(statuses.length-1)],
        rollupStatus: worstStatus,
        size: grandchildren.length,
        _children: grandchildren,  // Make the grandchildren hidden
      }

      return {...aggObj, ...keyNvPairs, ...parent};
    }).sort(function(a, b){

      // We sort the data so that we can represent sibling links (e.g. May is
      // next to June)
      //
      return (a[datapointCol] - b[datapointCol]);
    });

    const worstOuterStatus = children.reduce(function(v1, v2){
      return aggregateStatus(v1, v2.rollupStatus);
    }, 'unknown');

    // Return the main parent element
    //
    return [{
      id: 0, label: datapointAlias, x: 
      d3geom.WIDTH/2, y: d3geom.HEIGHT/2, 
      fixed: true, size: children.length, children: children,
      status: 'unknown', rollupStatus: worstOuterStatus
    }];
  }

  // This is a common routine for all reducer()s.
  // 'input' is an array from a map.
  //
  // The result is an object where $all contains a set of 
  // column name/value pairs, where each value is the array
  // of categorical values for the column name.
  //
  // The result also contains $p, which is the list of pivoted column names
  // (e.g. "Gender:Male", "Gender:Female").
  //
  const outerReducer = function(input){
    const pass1 = input.reduce(function(v1, v2, idx, array){

      // The objects are sorted by key.  
      // Thus, if the current key matches the previous
      // key, we only need to accumulate the value.  Otherwise, we
      // set the value of previous key in v1.$k.
      //
      // Finally, we have to deal with the very last object.
      //
      // We do this, rather than simply using object cloning to create a bunch
      // of clones (one for each name/value pair), because the latter is
      // quite slow for large datasets (>10K elements).
      //
      const $k = v2.key;
      const $v = ($k === v1.$k) ? v1.$v.concat([v2.value]) : [v2.value];
      const last = (idx === array.length-1);
      const all = ($k !== v1.$k && v1.$k)
        ? {...v1.$all, ...{[v1.$k]: v1.$v}}
        : v1.$all;
      const $all = last ? {...all, ...{[$k]: $v}} : all;
      const $p = addPivotObject(v1.$p, v2);

      return { $k, $v, $all, $p };
    }, {$k: null, $v: [], $all: {}, $p: {}});

    // In addition to pivoted objects, we add numerics here, since
    // we also want them to be added.
    //
    const numerics = metadata.getNumericsNotCalculated().filter(i => {
      return i != constants.sumrecords;
    }).map(i => metadata.getAlias(i));

    const $all = pass1.$all;
    const $p = Object.keys(pass1.$p).concat(numerics);

    return {$all, $p};
  }

  // Given array 'data' of objects, which have keys that
  // match 'cols', return the sum of the values of each column in 'cols'.
  // The input is of the form
  //   [ {COL1: VAL1, COL2: VAL2, ...}, {COL1: VAL3, COL2: VAL4}, ... ]
  // The result is of the form
  //   { COL1: SUM1, COL2: SUM2, ... }
  // where the SUMi are the sum of the VALj for each column.
  //
  const getAggregateValues = function(data, cols){
    return _.object(
      _.pairs(
        data.reduce(function(v1, v2){
          return _.object(
            cols.map(function(col){
              const lhs = +v1[col] || 0;
              const rhs = +v2[col] || 0;
              return [col, lhs+rhs];
            })
          );
        }, {})
      ).filter(function(x){  // Remove zero-value cols: they take up space
                             // but don't add any information.
                             //
                             // CHANGE 12/2020: Allow them, since numerics can be 0
        return true;
        // return x[1]!==0;
      })
    );
  }

  return {
    cullAndAddIDs,
    getTransformedData,
    getSummaryData,
    getLoadComparisonData,
    merge,
    mapper,
    reducer,
    reducerForce,
  }
}();

// Make transforms available to other node modules
//
export default transforms;
