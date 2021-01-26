// Turning off eslint warnings:
/* global d3 */
//
import metadata from './metadata';
import datapoint from './datapoint';
import utils from './utils';
import constants from './constants';

import $ from 'jquery';

const dataread = function() {

  // Read a dataset.  Note that we use the "actual dataset", since the
  // dataset may be synthetic (e.g. a time series based on an aggregation
  // of time series by entity).
  //
  const readDataset = function(dataset, filter, loadTable, datapointCol,
      initData){

    // If we're reading from mongodb, start a mongodb RESTful session.
    // We consider that we're reading from a CSV file if the chosen 
    // dataset's name ends in '.csv'.
    //
    return new Promise(
      function(resolve, reject) {
        if (dataset && !metadata.getMetadata(dataset)) {
          reject(`Dataset "${dataset}" does not exist`);
          return;
        }
        if (initData) {
          resolve(readInitData(initData, dataset));
        } else if( utils.isCSV(dataset) || utils.isJSON(dataset) ){
          const result = csvOrJsonReadDataset(dataset);
          resolve(result);
        } else {
          return mongoReadDataset(dataset, datapointCol, filter).done((res) => {
            if (res.categoricalValues && res.drawingData) {
              const { categoricalValues, drawingData } = res;
              const cookedData = process(drawingData, loadTable);
              const result = { dataset, categoricalValues, drawingData, cookedData };
              resolve(result);
            } else {
              const result = {
                dataset, 
                categoricalValues: {},
                drawingData: [],
                cookedData: []
              };
              resolve(result);
            }
          });
        }
      }
    );
  }

  // Initialize visualizations from a CSV file in 'dataset'
  //
  const csvOrJsonReadDataset = function(dataset){
    return new Promise(
      function(resolve, reject) {
        readCSVOrJsonData([], dataset, function(drawingData){
          if (!Array.isArray(drawingData)) {
            const error = 'No data found';
            console.error(error);
            reject({error});
            return;
          }
          const catColumns = metadata.getColumnsByAttrValue('type', 'Categorical');
          const dateColumns = metadata.getColumnsByAttrValue('type', 'IsoDate');
          const columns = catColumns.concat(dateColumns);
          const cookedData = process(drawingData, null);
          const categoricalValues = utils.getAllUniqueValues(cookedData, columns);
    
          const res = {dataset, categoricalValues, drawingData, cookedData};
          resolve(res);
        });
      }
    );
  }

  const readInitData = function(drawingData, dataset) {
    const catColumns = metadata.getColumnsByAttrValue('type', 'Categorical');
    const dateColumns = metadata.getColumnsByAttrValue('type', 'IsoDate');
    const columns = catColumns.concat(dateColumns);
    const cookedData = process(drawingData, null);
    const categoricalValues = utils.getAllUniqueValues(cookedData, columns);
   
    return {dataset, categoricalValues, drawingData, cookedData};
  }

  // Post-process data by adding average values for all Numeric columns
  //
  const withAverages = function (data) {
    if (!Array.isArray(data)) {
      return null;
    }
    const nrec = metadata.getAlias(constants.sumrecords);
    const numericAliases = metadata.getNonAverageNumerics().filter(i => {
      return i !== constants.sumrecords;
    }).map(i => {
      return metadata.getAlias(i);
    });

    return data.map(i => {
      const denominator = i.hasOwnProperty(nrec) ? +i[nrec] : null;

      const averages = denominator ? numericAliases.reduce((j, k) => {
        const numerator = i.hasOwnProperty(k) ? +i[k] : null;
        const avg = numerator !== null && denominator !== null ? numerator / denominator : null;
        const nvPair = {[k + constants.avgSuffix]: avg};
        
        return {...j, ...nvPair};
      }, {}) : {};

      return {...i, ...averages};
    });
  }

  // Calculate the values for fields with metadata tag 'calculated'.
  // We call metadata tag 'transform' with arguments in metadata tag 'fields'.
  //
  // Note that we always append the entire dataset to the calculation function,
  // in case it needs to do a calculation (like deciles) that requires all
  // records.
  //
  const withCalculatedFields = function(data) {
    const calcMeta = 'calculated';

    // First, get the calculated columns that don't use the preTransform.
    // We'll use these to do a first pass over the data, generating the
    // first set of calculated columns.
    //
    const calcColumns1 = metadata.getColumnsWithAttr(calcMeta).filter(i => {
      const value = metadata.getAttrValue(i, calcMeta);
      return !value.hasOwnProperty('preTransform');
    }).map(i => {
      const alias = metadata.getAlias(i);
      const value = metadata.getAttrValue(i, calcMeta);
      const { fields, transform } = value;
      const idx = value.idx || 0;
      return { alias, fields, transform, transformedData: data, idx };
    }).sort((i, j) => {
      return i.idx - j.idx;
    });

    const pass1 = applyCalculations(data, calcColumns1);

    // Now look for the calculated columns that contain preTransform.
    // This is typically a sorting operation, e.g. if we're calculating deciles.
    // This had to wait until we've done the first set of calculations above,
    // because the following may use calculated columns as inputs.
    //
    const calcColumns2 = metadata.getColumnsWithAttr(calcMeta).filter(i => {
      const value = metadata.getAttrValue(i, calcMeta);
      return value.hasOwnProperty('preTransform');
    }).map(i => {
      const alias = metadata.getAlias(i);
      const value = metadata.getAttrValue(i, calcMeta);
      const { fields, transform, preTransform } = value;
      const idx = value.idx || 0;
      const aliases = Array.isArray(fields) ? fields.map(l => {
        return metadata.getAlias(l);
      }) : [];
      const args = [pass1].concat(aliases);
      const transformedData = preTransform
          ? preTransform.apply(this, args)
          : null;
      return { alias, fields, transform, transformedData, idx };
    }).sort((i, j) => {
      return i.idx - j.idx;
    });

    return applyCalculations(pass1, calcColumns2);
  }
  
  // Convert formats for values for all fields where 'useFormat' is true.
  // (The 'format' field would otherwise only be applied for tooltips
  // and facet search fields).
  //
  const withFormats = function(data) {
    const useFormatFields = metadata.getColumnsWithAttr('useFormat');
    return data.map(i => {
      const formatted = useFormatFields.reduce((j, k) => {
        const value = i[k];
        const fmtValue = metadata.getFormattedValue(k, value);
        return {...j, ...{[k]: fmtValue}};
      }, {});
      return {...i, ...formatted};
    });
  }

  // Apply calculations to 'data', given the set of calcColumns.
  //
  const applyCalculations = function(data, calcColumns) {
    // Note how the calculation accumulates via reducer that takes the
    // updated row as input to the next calculation.  This allows us
    // to make per-row calculations that are based on prior calculations
    // within that same row, as well as from the previously calculated
    // row.
    //
    const calcAliases = calcColumns.map(i => {
      const { fields } = i;
      const aliases = Array.isArray(fields) ? fields.map(m => {
        return metadata.getAlias(m);
      }) : [];
      return {...i, aliases};
    }, {});

    const accumData = data.reduce((i, j) => {
      const calculations = calcAliases.reduce((k, l) => {
        const { alias, aliases, transform, transformedData } = l;

        // Pass these arguments to the calculated field transform:
        // - The current record (k)
        // - The list of field names that are inputs to the transform (aliases)
        // - The entire dataset, possibly transformed
        // - The previously calculated record (used for accumulating)
        //
        const args = [k].concat(aliases).concat([transformedData]).concat([i.prev]);
        const res = transform ? transform.apply(this, args) : null;

        return {...k, ...{[alias]: res}};
      }, j);

      const prev = {...j, ...calculations};
      const output = i.output.concat(prev);

      return {output, prev};
    }, {output: [], prev: {}});

    return accumData.output;
  }

  // Read the CSV data.
  // Return the new list of datasets.
  //
  // The function reads the CSV dataset, and calls onRead with the
  // data when it's done.
  //
  const readCSVOrJsonData = function(datasets, dataset, onRead){

    // If the dataset has changed from last time, load the new csv file
    //
    // NOTE: This will now fail unless data is under the app/views folder.
    //
    if( dataset !== datasets.slice(-1) ){
      const url = constants.dataFolder + '/' + dataset;
      if (utils.isCSV(dataset)) {
        d3.csv(url, onRead);
      } else {
        d3.json(url, onRead);
      }
      return datasets.concat(dataset);
    } else {  // No change to dataset: nothing to do
      return datasets;
    }
  }

  // Return data after any preprocessing.
  //
  // We use the loadTable, if there is any, to generate fractional
  // outputs based on how the load of any categorical value affects
  // the numeric specified in the 'whatIfTarget' metadata.
  //
  const preprocess = function(data, loadTable){
    const tableMap = metadata.getReverseMap('whatIfTarget');
    const targetTable = getTargetTable(loadTable, tableMap);

    if (targetTable !== null) {
      const res = data.map(i => {

        const changes = Object.keys(targetTable).reduce((j, k) => {
          const fractionOfTotal = getFractionOfTotal(k, j);
          const loadChanges = targetTable[k];

          const newValues = loadChanges.reduce((l, m) => {
            const loadFraction = m.value / 100;
            const oldValue = i.hasOwnProperty(m.name) ? +j[m.name] : 0;
            const unchangedPart = oldValue * (1 - fractionOfTotal);
            const changedPart = oldValue * fractionOfTotal * loadFraction;
            const newValue = unchangedPart + changedPart;

            return {...l, ...{[m.name]: newValue}};
          }, {});

          return {...j, ...newValues};

        }, i);

        return {...i, ...changes};
      });
      return res;
    } else {
      return data;
    }
  }

  // Perform a "dataset transform".
  //
  // In metadata, there may be a 'transform' field in the dataset.  This allows us
  // to create a "synthetic dataset" based on an existing dataset.  This is
  // how we might convert an entity-based dataset into a time-series dataset,
  // for example.  See aisTimeMetadata.
  //
  const getDatasetTransform = function(data) {
    const datasetTransform = metadata.getDatasetAttr('transform');
    const transformFields = metadata.getDatasetAttr('transformFields');
    const numericMap = metadata.getNumerics().reduce((i, j) => {
      const typeObj = {
        subtype: metadata.getAttrValue(j, 'subtype', null),
        calculated: metadata.getAttrValue(j, 'calculated', null)
      };
      return {...i, ...{[j]: typeObj}};
    }, {});
    const aliasMap = metadata.getAll().reduce((i, j) => {
      return {...i, ...{[j]: metadata.getAlias(j)}};
    }, {});
    if (datasetTransform && transformFields) {
      const aliases = Array.isArray(transformFields) ? transformFields.map(l => {
        return metadata.getAlias(l);
      }) : [];

      const args = aliases.concat([data]).concat([aliasMap]).concat([numericMap]);
      return datasetTransform.apply(this, args);
    } else {
      return data;
    }
  }

  // Given a loadTable of the form
  //   [ { value: CAT-VALUE, header-name-1: LOAD-VALUE, ... }, ...]
  // and a tableMap of the form {table-map-name: [column, ...], ...}
  // return a loadTable that contains aliased names of the targets of
  // the load changes, instead of header names.
  //
  const getTargetTable = function(loadTable, tableMap) {
    if (!loadTable || !tableMap) return null;

    return loadTable.reduce((i, j) => {
      const key = j.value;

      const vector = [].concat.apply([], Object.keys(j).filter(k => {
        return k !== 'value';
      }).map(k => {
        const innerVector = tableMap.hasOwnProperty(k) ? tableMap[k] : [];

        return innerVector.map(l => {
          const alias = metadata.getAlias(l);
          return {name: alias, value: j[k]};
        });
      }));

      return {...i, ...{[key]: vector}};
    }, {});
  }

  // Given a 'catValue' within a 'row' representing an aggregation of data,
  // return the percentage that 'catValue' has of the entire aggregation.
  //
  // We do this so that we'll know what the impact of changing the value
  // of 'catValue' is.
  //
  const getFractionOfTotal = function(catValue, row) {
    // First, handle the "general improvement" case, where we assume that
    // the catValue always matches the entire row.
    //
    if (catValue === constants.generalImprovement) {
      return 1;
    }

    const thisValue = row.hasOwnProperty(catValue) ? +row[catValue] : 0;
    const alias = catValue.split(':')[0];

    // Divide this into two cases:
    // - we are aggregating by the catValue's variable, in which case either
    //   the row represents the entire catValue, or none of it; or
    // - we aren't aggregating by the catValue's variable, in which case we
    //   have to determine the fraction of the aggregation representing catValue.
    //
    if (row.hasOwnProperty(alias)) {
      const catValueName = catValue.split(':')[1];

      return row[alias] === catValueName ? 1 : 0;
    } else {
      const totalValue = Object.keys(row).filter(i => {
        return i.split(':')[0] === alias;
      }).reduce((i, j) => {
        return i + utils.safeVal(row, j);
      }, 0);

      return totalValue === 0 ? 0 : thisValue / totalValue;
    }
  }

  // Convert incoming DateString columns into output columns with a Date in
  // milliseconds.  This is the format that is now used for date conversions.
  //
  const withDates = function(data){
    const dateStringCols = metadata.getColumnsByAttrValue('type', 'DateString');
    const outputCols = dateStringCols.reduce((i, j) => {
      const outputCol = metadata.getAttrValue(j, 'output');
      if (outputCol && outputCol !== '') {
        return {...i, ...{[j] : outputCol}};
      } else {
        return i;
      }
    }, {});
    return data.map(i => {
      const dateValues = dateStringCols.reduce((j, k) => {
        if (i.hasOwnProperty(k)) {
          const value = i[k];
          const epoch = +new Date(value);
          const outputCol = outputCols.hasOwnProperty(k) ? outputCols[k] : k;
          return {...j, [outputCol]: epoch };
       } else {
         return j;
       }
      }, {});

      return {...i, ...dateValues};
    });
  }

  const process = function(data, loadTable) {
    const res = 
      withCalculatedFields( // must be last, after synthetic dataset!
      withFormats(
      getDatasetTransform(
      withAverages(
      withDates(
      preprocess(data, loadTable))))));
    return res;
  }

  // Use mongodb services to retrieve data every time there
  // is a state change.  The CSV handler is synchronous; it only
  // reads the data once (and therefore uses in-browser, slower javascript
  // for pivoting transforms).
  //
  const mongoReadDataset = function(dataset, datapointCol, filter){
    if (datapointCol === null){
      return $.when({error: 'There was no default datapoint col specified'});
    }

    const query = getQueryString(filter);

    const url1 = '/api/allvalues/' + encodeURIComponent(dataset) + '/Categorical';
    const url2 = '/api/aggregate/' + encodeURIComponent(dataset) + '/' + 
        encodeURIComponent(datapointCol) +
        '?' + query;
    return $.when($.get(url1), $.get(url2)).then((r1, r2) => {
      if (r1[1] !== 'success' || r2[1] !== 'success') {
        return {error: 'Data read failure'};
      } else {
        return {categoricalValues: r1[0], drawingData: r2[0]};
      }
    });
  }

  // Convert 'filter' into a RESTful query string
  //
  const getQueryString = function(filter) {
    return [].concat.apply([], Object.keys(filter).map(i => {
      return filter[i].map(j => {
        return i + '=' + j;
      });
    })).join('&');
  }

  return {
    readDataset,
    process
  };
}();

export default dataread;
