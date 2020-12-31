// Time animation functions
// Right now, this is just a D3-based helper library
// for the <LineChart/> component.
//
// Turning off eslint warnings:
/* global d3 */
//
import utils from './utils.js';
import metadata from './metadata.js';
import tooltip from './tooltip.js';
import time from './time.js';
import datapoint from './datapoint.js';

const animation = function(){

  // Create DOM elements for animation
  //
  function create(parent, d3config){

    // Create a group where we'll draw animation data
    //
    d3.select(parent).append("svg:g")
      .attr("class", "animation");

    // Create a group where we'll handle animation transitions
    //
    d3.select(parent).append("svg:g")
      .attr("class", "animateTransition");

    // Date label for gapminder animation.  Only drawn in 
    // animation.redraw().
    //
    d3.select(parent).append("text")
      .attr("class", "date label")
      .attr("text-anchor", "end")
      .attr("y", d3config.HEIGHT - 24)
      .attr("x", d3config.WIDTH)

    // Create group for text labels.  We don't use force labels for
    // animations.
    //
    d3.select(parent).append("svg:g").attr("class", "animationLabels");
  }

  // Sort order for animation:  bigger circles drawn under little ones
  //
  function radius(d, radiusAxis){ 
    return utils.safeVal(d, radiusAxis);
  }

  function animationOrder(radiusAxis){
    return function (a, b){ 
      return ( a!=null && b!=null )? 
          (radius(b, radiusAxis) - radius(a, radiusAxis)) : 0;
    }
  }

  // Tweens the entire chart by first tweening the date, and then the data.
  // The circles and date label are redrawn.
  //
  function tweenDate(drawingData, tooltipPivots, datapointCol, dates, axes, 
      d3config){
    return function(){
      if( typeof dates.min!="number" || typeof dates.max!="number" ){
        return null;
      }
      const dateOf = d3.interpolateNumber(dates.min, dates.max);
      return function(t) { 
        displayDate(dateOf(t), drawingData, tooltipPivots, datapointCol, axes,
            d3config);
      }
    }
  }

  // This function renders the selected data in 'selectedData'.
  // '.animation' is the svg <g> into which circles are rendered.
  //
  // This function is only used during animation.
  //
  function redrawOnePeriod(selectedData, tooltipPivots, datapointCol, axes, 
      d3config){
    const datapointAlias = metadata.getAlias(datapointCol);
    const duration = 500;

    const circleData = d3.select(".animation")
      .selectAll(".node")
      .data(selectedData, function(d) {return d[datapointAlias]})

    circleData
      .enter().append("circle")
        .attr("class", "node bubble")
        .style("stroke-width", 1.5)

    // Plot the circles in a transition.
    //
    circleData
      .transition().duration(duration).ease("exp-in-out")
      .attr("cx", function(d) {
        return d3config.xScale(utils.safeVal(d, axes.xAxis));
      })
      .attr("cy", function(d) {
        return d3config.yScale(utils.safeVal(d, axes.yAxis));
      })
      .attr("r", function(d) {
        return d3config.rScale(utils.safeVal(d, axes.radiusAxis));
      })
      .style("fill", function(d) {
        return d3config.cScale(utils.safeVal(d, axes.colorAxis));
      })
      .style("stroke",  function(d) {
        return d3
          .rgb(d3config.cScale(utils.safeVal(d, axes.colorAxis)))
          .darker(2);
      })
      .style("opacity", 1)
      .sort(animationOrder(axes.radiusAxis));

    circleData
      .exit()
        .transition().duration(duration).ease("exp-in-out")
        .style("opacity", 0)
        .attr("r", 0)
          .remove();

    // Plot the labels.
    //
    redrawLabels(selectedData, duration, datapointCol, axes, d3config);

    tooltip.doTooltip(tooltipPivots, datapointCol, 'bubble');
  }

  // Updates the display to show the specified date.
  // 'date' is in milliseconds since epoch.
  //
  function displayDate(date, drawingData, tooltipPivots, datapointCol, axes, 
      d3config){
    const humanDate = time.msecToHumanMonth(date);
    const priorDate = d3.select(".date").text();
    if( humanDate == priorDate ) return;

    d3.select(".date").text(humanDate);

    // Now get the internal representation of 'date' that is
    // rounded to the nearest month.  Use this to select the data
    // to display
    //
    redrawOnePeriod(selectMonth(date, drawingData, axes.animate), 
        tooltipPivots, datapointCol, axes, d3config);
  }

  // Given 'msec', return the selection from 'data'
  // that matches the month from 'msec'.
  //
  function selectMonth(msec, data, animateCol){
    const roundedDate = time.msecToMonth(msec);
    const alias = metadata.getAlias(animateCol);
    return data.filter(function(x){ return x[alias] == roundedDate; });
  }

  // Redraws screen when animation is selected
  //
  function redraw(parent, d3top, drawingData, tooltipPivots, datapointCol, axes,
      d3config){
    const animateAlias = metadata.getAlias(axes.animate);
    clear(datapointCol, axes, d3config);

    const dates = {
      min: utils.getSafe(d3.min, drawingData, function(d) {
        return utils.safeVal(d, animateAlias);
      }),
      max: utils.getSafe(d3.max, drawingData, function(d) { 
        return utils.safeVal(d, animateAlias);
      }),
    };

    // transition the axes output format, depending on whether the data 
    // is in units or in time
    //
    d3config.xAxis.tickFormat(metadata.getAxisFormat(axes.xAxis), 1);
    d3config.yAxis.tickFormat(metadata.getAxisFormat(axes.yAxis), 1);

    // the data domains or desired axes might have changed, so update them all
    //
    d3config.xScale.domain(utils.getMinRange([
      utils.getSafe(d3.min, drawingData, function(d) {
        return utils.safeVal(d, axes.xAxis);
      }),
      utils.getSafe(d3.max, drawingData, function(d) { 
        return utils.safeVal(d, axes.xAxis);
      })
    ]));
    d3config.yScale.domain(utils.getMinRange([
      utils.getSafe(d3.min, drawingData, function(d) {
        return utils.safeVal(d, axes.yAxis);
      }),
      utils.getSafe(d3.max, drawingData, function(d) {
        return utils.safeVal(d, axes.yAxis);
      })
    ]));
    d3config.rScale.domain([
      utils.getSafe(d3.min, drawingData, function(d) {
        return utils.safeVal(d, axes.radiusAxis);
      }),
      utils.getSafe(d3.max, drawingData, function(d) {
        return utils.safeVal(d, axes.radiusAxis);
      })
    ]);
    d3config.cScale.domain([
      utils.getSafe(d3.min, drawingData, function(d) {
        return utils.safeVal(d, axes.colorAxis);
      }),
      utils.getSafe(d3.max, drawingData, function(d) {
        return utils.safeVal(d, axes.colorAxis);
      })
    ]);

    // transition axis data
    //
    const t = d3.select('#' + d3top)
      .transition()
      .duration(1500)
      .ease("exp-in-out");
    t.select(".x.axis").call(d3config.xAxis);
    t.select(".x.label").text(axes.xAxis);
    t.select(".y.axis").call(d3config.yAxis);
    t.select(".y.label").text(axes.yAxis);

    // Initialize the date label, for animation
    //
    d3.select(".date").text(time.msecToHumanMonth(dates.min));
    const box = d3.select(".date").node().getBBox();

    const overlay = d3.select(parent).append("rect")
      .attr("class", "overlay")
      .attr("x", box.x)
      .attr("y", box.y)
      .attr("width", box.width)
      .attr("height", box.height);
    overlay
      .on("mouseover", enableInteraction(overlay, box, dates, d3config));

    // Start a transition that animates the data by date
    // (actually, it uses whatever date field is in the Animation input).
    // The total length of time for all data to be displayed is 10 seconds.
    //
    d3.select('.animateTransition')
      .transition().duration(10000).ease("linear")
      .style("opacity", 1)
      .tween("date", 
          tweenDate(drawingData, tooltipPivots, datapointCol, dates, axes, 
          d3config))
      .each("end", enableInteraction(overlay, box, dates, d3config));

    // Render the data initial data
    //
    redrawOnePeriod(selectMonth(dates.min, drawingData), tooltipPivots, 
        datapointCol, axes, d3config);

    // Allow the user to scroll through the overlay area in order
    // to show a particular date.
    //
    function enableInteraction(overlay, box, dates, d3config){
      return function(){

        const dateScale = d3.scale.linear()
            .domain([dates.min, dates.max])
            .range([box.x + 10, box.x + box.width - 10])
            .clamp(true);

        // Cancel the current transition, if any.
        //
        d3.select('.animateTransition').transition().duration(0);

        overlay
            .on("mouseover", mouseover)
            .on("mouseout", mouseout)
            .on("mousemove", mousemove)
            .on("touchmove", mousemove);

        function mouseover() {
          d3.select(".date").classed("active", true);
        }
        function mouseout() {
          d3.select(".date").classed("active", false);
        }
        function mousemove() {
          displayDate(dateScale.invert(d3.mouse(this)[0]), 
              drawingData, tooltipPivots, datapointCol, axes, d3config);
        }
      }
    }
  }

  // Call this function to remove animated data
  //
  function clear(parent, axes, d3config){

    // Turn off the date interaction
    //
    d3.select(parent).selectAll("rect")
        .attr("display", "none");

    d3.select(".animation").selectAll(".node").data([])
      .exit()
      .remove()
        .style("opacity", 0)
        .remove()

    d3.select(".date").text('');

    d3.select('.animateTransition').transition().duration(0);

    clearLabels(axes, d3config);
  }

  // Redraw labels statically, near the x and y positions
  // for each element in selectedData.  The labels are drawn in
  // the svg group with class name '.animationLabels'.
  //
  function redrawLabels(selectedData, duration, datapointCol, axes,
      d3config){
    const datapointAlias = metadata.getAlias(axes.datapoint);

    const labelGroup = 
        d3.select(".animationLabels").selectAll(".staticLabel")
          .data(selectedData, function(d){ return d[datapointAlias]; });

    labelGroup
      .enter()
        .append("svg:text")
        .attr("class", "staticLabel")
        .attr("text-anchor", "middle")
        .attr("x", 0)
        .attr("y", 0)
        .style("font-size", "8px")
        .style("pointer-events", "none")
        .style("opacity", 0.0)
        .text( function(d) {
          return utils.truncate(datapoint.formatDatapointRep(
              datapointCol, d[datapointAlias]));
          })

     labelGroup
        .transition().duration(duration).ease("exp-in-out")
        .attr("x", function(d) {
          return d3config.xScale(utils.safeVal(d, axes.xAxis));
        })
        .attr("y", function(d) {
          return d3config.yScale(utils.safeVal(d, axes.yAxis));
        })
        .style("opacity", 1.0)

    labelGroup
      .exit()
        .transition().duration(duration).ease("exp-in-out")
        .style("opacity", 0)
          .remove();
  }
  function clearLabels(axes, d3config){
    redrawLabels([], 500, '', axes, d3config);
  }
  return {
    create,
    redraw,
    clear,
  }

}();
export default animation;
