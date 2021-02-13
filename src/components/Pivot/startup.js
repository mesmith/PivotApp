import controls from './controls.js';
import dataread from './dataread.js';

// Turns off eslint warnings:
/* global d3 */

// Note that we pass in an initial set of categorical values.  Later,
// these will be updated in Redux state on new dataset read
// (since we can't change these props).
//
const getNewDatasetState = (dataset, filter, datapointCol) => 
    (categoricalValues, pivotedData, processedData) => {
  const initControlState = controls.getInitControlState(categoricalValues, 
      datapointCol, 'bubble');
  return { dataset, filter, ...initControlState,
      categoricalValues, pivotedData, processedData };
}

// Like the above, but don't initialize the control state or facet filters.
// We do this when we get a new dataframe for the same dataset; e.g.
// when the data is coming from a 3rd party.
//
const getReusedDatasetState = currentState => 
    (categoricalValues, pivotedData, processedData) => {
  return { ...currentState, categoricalValues, pivotedData, processedData };
}

// After initial DOM loading, initialize or restart the dataset.
//
const startup = (currentState, newDataset, filter, datapointCol,
    graphtype, animationCol, initData) => {
  const currentDataset = currentState ? currentState.dataset : null;

  const getDatasetState = newDataset === currentDataset
    ? getReusedDatasetState(currentState)
    : getNewDatasetState(newDataset, filter, datapointCol)

  const handle = ((dataset, state) => getDatasetState)(newDataset, currentState);

  const handleData = res => 
      handle(res.categoricalValues, res.pivotedData, res.processedData);

  const handleError = () => handle({}, [], []);

  return dataread.readDataset(newDataset, filter, null, datapointCol,
      graphtype, animationCol, initData)
    .then(handleData)
    .catch(handleError);
}

export default {
  startup
};
