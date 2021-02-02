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


// After initial DOM loading, initialize or restart the dataset.
//
const startup = function(initData, dataset){
  const { pivot } = store.getState();
  const previousState = utils.getCurrentState(pivot);
  const previousDataset = previousState ? previousState.dataset : null;

  const actualDataset = dataset ? dataset : metadata.getActualDataset();
  metadata.setMetadata(actualDataset);
  const filter = metadata.getFilters();
  const datapointCol = datapoint.getDefaultDatapointCol();

  return dataread.readDataset(actualDataset, filter, null, datapointCol, initData)
      .then(function(result) {
    const { dataset, categoricalValues, drawingData, cookedData } = result;
    return (dataset === previousDataset)
      ? getReusedDatasetState(categoricalValues, previousState, cookedData)
      : getNewDatasetState(dataset, categoricalValues, cookedData);
  }, function(error) {
    const res = {
      dataset, categoricalValues: {}, drawingData: [], cookedData: []
    };
    return (dataset === previousDataset)
      ? getReusedDatasetState(res.categoricalValues, previousState, res.cookedData)
      : getNewDatasetState(dataset, res.categoricalValues, res.cookedData);
  });
}

export default {
  startup
};
