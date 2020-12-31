import React from 'react';
import ReactDOM from 'react-dom';
import {createStore} from 'redux';

import App from './app.js';

import controls from './controls.js';
import datapoint from './datapoint.js';
import dataread from './dataread.js';
import metadata from './metadata.js';
import reducers from './reducers.js';
import constants from './constants.js';

// Turns off eslint warnings:
/* global d3 */

const paretoRangeFudge = 29; // I have no idea why I need this, but
                             // it's needed so the axis ticks match
                             // the center of each histogram bar.

// Constants used in D3 drawings.
// NOTE: Do NOT move these to constants.js, as then the server will not work.
//
const d3range = {
  r: [4, 30],
  c: ["#002000", "#40f040"],
  x: [
    constants.d3geom.MARGINS.left, 
    constants.d3geom.WIDTH - constants.d3geom.MARGINS.right
  ],
  y: [
    constants.d3geom.HEIGHT - constants.d3geom.MARGINS.top, 
    constants.d3geom.MARGINS.bottom
  ],
  paretoX: [
    constants.d3geom.MARGINS.left - paretoRangeFudge,
    constants.d3geom.WIDTH - constants.d3geom.MARGINS.right + paretoRangeFudge
  ]
};

const d3scale = {

  rScale: d3.scale.linear().range(d3range.r),

  // color range function: from dark to light green
  //
  cScale: d3.scale.linear().range(d3range.c),

  xScale: d3.scale.linear().range(d3range.x),
  yScale: d3.scale.linear().range(d3range.y),

  xScalePareto: d3.scale.ordinal().rangeBands(d3range.paretoX),
  yScaleParetoRight: d3.scale.linear().range(d3range.y).domain([0, 1])
};

const xAxis = d3.svg.axis().scale(d3scale.xScale)
  .tickSize(16).orient("bottom")
  .tickSubdivide(true);
const yAxis = d3.svg.axis().scale(d3scale.yScale)
  .tickSize(10).orient("left")
  .tickSubdivide(true);

// Pareto chart uses categorical values for the X axis
//
const xAxisPareto = d3.svg.axis().scale(d3scale.xScalePareto).orient('bottom');

// The right-hand side Y axis for Pareto tracks the cumulative percentage
// of value
//
const yAxisParetoRight =
  d3.svg.axis().scale(d3scale.yScaleParetoRight).orient('right')
    .tickFormat(d => Math.round(d*100) + '%', 1);

const hoverColor = 'lightblue';
const transition = 1000;
const d3config = {
  ...constants.d3geom, 
  ...d3scale,
  xAxis,
  yAxis,
  xAxisPareto,
  yAxisParetoRight,
  hoverColor,
  transition
};

if (module.hot) { 
  module.hot.accept();
}

// After initial DOM loading, initialize the dataset, and
// display the Loading icon.
//
window.onload = function(){
  const actualDataset = metadata.getActualDataset();
  const filter = metadata.getFilters();
  const datapointCol = datapoint.getDefaultDatapointCol();
  dataread.readDataset(doInit, actualDataset, filter, null, datapointCol);

  // This will display the Loading icon
  //
  ReactDOM.render( <App d3config={d3config} />, document.getElementById('root'));
}

// Called at startup time.  Use metadata to generate initial state values.
//
// Note that we pass in an initial set of categorical values.  Later,
// these will be updated in Redux state on new dataset read
// (since we can't change these props).
//
const doInit = function(dataset, categoricalValues, rawData, data){
  const datapointCol = datapoint.getDefaultDatapointCol();
  const initControlState = controls.getInitControlState(categoricalValues, 
      datapointCol, 'bubble');
  const initFilter = metadata.getFilters();
  const initState = {
    categoricalValues: categoricalValues,
    ...initControlState,
    ...{filter: initFilter, dataset}
  };
  const initHistory = { history: [initState], current: 0 };
  const reduxStore = createStore(reducers.controls, initHistory);

  ReactDOM.render(
    <App key={dataset} dataset={dataset} data={data}
        initCategoricalValues={categoricalValues} d3config={d3config}
        reduxStore={reduxStore} />,
    document.getElementById('root')
  );
}
