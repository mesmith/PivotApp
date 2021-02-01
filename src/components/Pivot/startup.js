import controls from './controls.js';
import datapoint from './datapoint.js';
import dataread from './dataread.js';
import metadata from './metadata.js';
import utils from './utils.js';

import store from '../../store';
import actions from '../../actions';

// Turns off eslint warnings:
/* global d3 */

// Called at startup time.  Use metadata to get initial state values.
//
// Note that we pass in an initial set of categorical values.  Later,
// these will be updated in Redux state on new dataset read
// (since we can't change these props).
//
const getNewDatasetState = function(dataset, categoricalValues, data) {
  const datapointCol = datapoint.getDefaultDatapointCol();
  const initControlState = controls.getInitControlState(categoricalValues, 
      datapointCol, 'bubble');
  const filter = metadata.getFilters();
  return { dataset, categoricalValues, data, filter, ...initControlState };
}

// Like the above, but don't initialize the control state or facet filters.
// We do this when we get a new dataframe when using the same dataset.
//
const getReusedDatasetState = function(categoricalValues, previousState, data) {
  return { ...previousState, categoricalValues, data };
}


// After initial DOM loading, initialize or restart the dataset, and
// display the Loading icon.
//
// One of dataset and newMetadata should be non-null.  If newMetadata is null,
// then we look up existing dataset from metadata.js.  If newMetadata is non-null,
// use that metadata for dataset.
//
const startup = function(initData, dataset, newMetadata){
  const { pivot } = store.getState();
  const previousState = utils.getCurrentState(pivot);
  const previousDataset = previousState ? previousState.dataset : null;
  return new Promise(
    function(resolve, reject) {
      const actualDataset = dataset ? dataset : metadata.getActualDataset();
      const filter = metadata.getFilters();
      if (newMetadata) {
        metadata.addMetadata(newMetadata);
      }
      metadata.setMetadata(actualDataset);
      const datapointCol = datapoint.getDefaultDatapointCol();

      dataread.readDataset(actualDataset, filter, null, datapointCol, initData)
          .then(function(result) {
        const { dataset, categoricalValues, drawingData, cookedData } = result;
        const datasetState = (dataset === previousDataset)
          ? getReusedDatasetState(categoricalValues, previousState, cookedData)
          : getNewDatasetState(dataset, categoricalValues, cookedData);
        actions.pushState(datasetState)(store.dispatch);
        resolve(result);
      }, function(error) {
        const res = {
          dataset, categoricalValues: {}, drawingData: [], cookedData: []
        };
        const datasetState = (dataset === previousDataset)
          ? getReusedDatasetState(res.categoricalValues, previousState, res.cookedData)
          : getNewDatasetState(dataset, res.categoricalValues, res.cookedData);
        actions.pushState(datasetState)(store.dispatch);
        resolve(res);
      });
    }
  );
}

// We also put a data flattener in here.  Useful when the dataset is
// not already flat (e.g. FB data).
//
const flatten = function(data) {
  return data.map(i => {
    return flattenObject(null, i);
  });
}

// Given an array of objects with possible sub-objects, flatten it.
// Assumes there are no arrays as sub-objects:  arrays won't be flattened.
//
const flattenObject = function(prefix, obj) {
  return Object.keys(obj).reduce((j, k) => {
    const name = prefix ? `${prefix}_${k}` : k;
    const value = obj[k];

    const newObj = (typeof value === 'object' && value !== null)
      ? flattenObject(name, value)
      : {[name]: value};
    return {...j, ...newObj};
  }, {});
}

export default {
  startup,
  flatten
};
