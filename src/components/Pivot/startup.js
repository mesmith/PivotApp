import controls from './controls.js';
import dataread from './dataread.js';
import facets from './facets.js';
import datapoint from './datapoint.js';
import metadata from './metadata.js';

// Turns off eslint warnings:
/* global d3 */

// Note that we pass in an initial set of categorical values.  Later,
// these will be updated in Redux state on new dataset read
// (since we can't change these props).
//
const getNewDatasetState = (dataset, filter, datapointCol, loadTable) => 
    (categoricalValues, pivotedData, processedData) => {
  const initControlState = controls.getInitControlState(categoricalValues, 
      datapointCol, 'bubble');
  const facet = getFacetObject(pivotedData, filter, datapointCol, 
      datapointCol, categoricalValues);
  return { dataset, filter, ...initControlState, facet, loadTable,
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
  const currentDataset = currentState && currentState.dataset
    ? currentState.dataset
    : null;
  const loadTable = currentState && currentState.loadTable
    ? currentState.loadTable
    : null;

  const getDatasetState = newDataset === currentDataset
    ? getReusedDatasetState(currentState)
    : getNewDatasetState(newDataset, filter, datapointCol, loadTable)

  const handle = ((dataset, state) => getDatasetState)(newDataset, currentState);

  const handleData = res => 
      handle(res.categoricalValues, res.pivotedData, res.processedData);

  const handleError = () => handle({}, [], []);

  return dataread.readDataset('all', newDataset, filter, loadTable, datapointCol,
      graphtype, animationCol, initData)
    .then(handleData)
    .catch(handleError);
}

// Return a facet object, used in Refine Results, etc.
//
const getFacetObject = function(pivotedData, filter, 
    datapointCol, categoricalValues) {

  // OK, this is pretty confusing.  We must calculate two datapoints:
  // one for the original dataset, and another one for the synthetic one
  // (if we are in fact using a synthesized dataset).
  //
  // We want to support filtering from the original
  // dataset (since that's where we use the RESTful interface, and besides,
  // it seems to feel right to do that).
  //
  const dfltDatapointCol = datapoint.getDefaultDatapointCol();
  const originalDatapointCol = metadata.getDatasetAttr('datapointCol') ||
        dfltDatapointCol;
  const facetList = facets.getReactFacets(pivotedData,
      filter, originalDatapointCol, categoricalValues);
  return { list: facetList, filter, datapointCol };
}

export default {
  startup,
  getFacetObject
};
