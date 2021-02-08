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
const getNewDatasetState = (dataset, filter, datapointCol) => 
    (categoricalValues, data) => {
  const initControlState = controls.getInitControlState(categoricalValues, 
      datapointCol, 'bubble');
  return { dataset, categoricalValues, data, filter, ...initControlState };
}

// Like the above, but don't initialize the control state or facet filters.
// We do this when we get a new dataframe for the same dataset.
//
const getReusedDatasetState = currentState => (categoricalValues, data) => {
  return { ...currentState, categoricalValues, data };
}

// After initial DOM loading, initialize or restart the dataset.
//
const startup = (currentState, newDataset, filter, datapointCol, initData,
    graphtype, animationCol) => {
  const currentDataset = currentState ? currentState.dataset : null;

  const getDatasetState = newDataset === currentDataset
    ? getReusedDatasetState(currentState)
    : getNewDatasetState(newDataset, filter, datapointCol)

  const handle = ((dataset, state) => getDatasetState)(newDataset, currentState);

  const handleData = result => handle(result.categoricalValues, result.processedData);

  const handleError = () => handle({}, []);

  return dataread.readDataset(newDataset, filter, null, datapointCol, initData,
      graphtype, animationCol)
    .then(handleData)
    .catch(handleError);
}

export default {
  startup
};
