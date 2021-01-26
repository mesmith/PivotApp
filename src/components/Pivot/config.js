'use strict';
import constants from './constants.js';
import '../../static/d3.v2.js';

const config = function() {

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
    rScaleTime: d3.time.scale().range(d3range.r),

    // color range function: from dark to light green
    //
    cScale: d3.scale.linear().range(d3range.c),
    cScaleTime: d3.time.scale().range(d3range.c),

    xScale: d3.scale.linear().range(d3range.x),
    xScaleTime: d3.time.scale().range(d3range.x),

    yScale: d3.scale.linear().range(d3range.y),
    yScaleTime: d3.time.scale().range(d3range.y),

    xScalePareto: d3.scale.ordinal().rangeBands(d3range.paretoX),
    yScaleParetoRight: d3.scale.linear().range(d3range.y).domain([0, 1])
  };

  const xAxis = d3.svg.axis().scale(d3scale.xScale)
    .tickSize(16).orient("bottom")
    .tickSubdivide(true);
  const xAxisTime = d3.svg.axis().scale(d3scale.xScaleTime)
    .tickSize(16).orient("bottom")
    .tickSubdivide(true);

  const yAxis = d3.svg.axis().scale(d3scale.yScale)
    .tickSize(10).orient("left")
    .tickSubdivide(true);
  const yAxisTime = d3.svg.axis().scale(d3scale.yScaleTime)
    .tickSize(16).orient("bottom")
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
    xAxisTime,
    yAxis,
    yAxisTime,
    xAxisPareto,
    yAxisParetoRight,
    hoverColor,
    transition
  };

  return {
    d3config
  };

}();

export default config;
