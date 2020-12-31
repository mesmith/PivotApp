'use strict';

// Redux actions are in this module

const actions = function () {

  // Called when the user changes a control (e.g. X Axis)
  //
  const changeControl = function (name, value) {
    return { type: 'CHANGE_CONTROL', name, value };
  };

  // Called whe the user changes a filter (Refine Results)
  //
  const changeFilter = function (filter) {
    return { type: 'CHANGE_FILTER', filter };
  };

  const changeQuery = function (query) {
    return { type: 'CHANGE_QUERY', query };
  }

  // Called whe the user changes a dataset
  //
  const changeDataset = function (dataset) {
    return { type: 'CHANGE_DATASET', dataset };
  };

  // Called whe the user changes a dataset and a datapoint
  //
  const changeDatasetAndDatapoint = function (dataset, datapoint) {
    return { type: 'CHANGE_DATASET_AND_DATAPOINT', dataset, datapoint };
  };


  // Called when the user presses Undo/Redo
  //
  const pressButton = function (button) {
    return { type: 'PRESS_BUTTON', button };
  };

  const changeLoad = function (loadTable) {
    return { type: 'CHANGE_LOAD', loadTable };
  }

  return {
    changeControl,
    changeDataset,
    changeDatasetAndDatapoint,
    changeQuery,
    changeFilter,
    pressButton,
    changeLoad
  };
}();

module.exports = actions;
