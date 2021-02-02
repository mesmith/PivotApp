import controls from './controls.js';
import datapoint from './datapoint.js';
import dataread from './dataread.js';
import metadata from './metadata.js';
import utils from './utils.js';

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
const getReusedDatasetState = function(categoricalValues, currentState, data) {
  return { ...currentState, categoricalValues, data };
}

// After initial DOM loading, initialize or restart the dataset.
//
// actualDataset takes into account whether the dataset is synthetic.
//
const startup = function(currentState, initData, actualDataset, filter, datapointCol){
  const currentDataset = currentState ? currentState.dataset : null;

  const handle = ((actualDataset, currentDataset, currentState) => 
      (categoricalValues, cookedData) => {
    return (actualDataset === currentDataset)
      ? getReusedDatasetState(categoricalValues, currentState, cookedData)
      : getNewDatasetState(actualDataset, categoricalValues, cookedData);
  })(actualDataset, currentDataset, currentState);

  const handleData = result => handle(result.categoricalValues, result.cookedData);

  const handleError = () => handle({}, []);

  return dataread.readDataset(actualDataset, filter, null, datapointCol, initData)
      .then(handleData, handleError);
}

export default {
  startup
};
