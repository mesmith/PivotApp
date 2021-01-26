// line/bubble drawing functions
//
// Turning off eslint warnings:
/* global d3 */
//
import utils from './utils.js';
import tooltip from './tooltip.js';
import metadata from './metadata.js';
import forcelabel from './forcelabel.js';
import controls from './controls.js';
import config from './config.js';
const { d3config } = config;

const line = function(){

  // Called when we mouse over or out of a data element 'elt'.
  //
  function onMouseover(elt, newConfig){ 
    d3.select(elt).transition().duration(newConfig.transition)
        .style("fill", newConfig.hoverColor);
  }
  function onMouseout(elt, axes, newConfig){ 
    d3.select(elt).transition().duration(newConfig.transition)
      .style("fill", function(d) {
        return newConfig.cScale(utils.safeVal(d, axes.colorAxis));
      });
  }

  // Create the data-independent aspect of the line/bubble chart
  //
  function create(parent, newConfig){
    const bottom = newConfig.HEIGHT - newConfig.MARGINS.bottom;
    const left = newConfig.MARGINS.innerleft;
    const right = newConfig.WIDTH - newConfig.MARGINS.right;
    const top = newConfig.MARGINS.top;

    // add in the x axis
    //
    d3.select(parent).append("svg:g")
      .attr("class", "x axis") // so we can style it with CSS
      .attr("transform", "translate(0," + bottom + ")")
      .call(newConfig.xAxis); // add to the visualization

    d3.select(parent).append("line")
      .attr("x1", left)
      .attr("x2", right)
      .attr("y1", bottom)
      .attr("y2", bottom)
      .style("stroke", "#fff")

    // Label for X axis
    //
    d3.select(parent).append("text")
      .attr("class",  "x label")
      .attr("text-anchor", "end")
      .attr("x", right)
      .attr("y", bottom - 6)
      .text("");

    // add in the y axis
    //
    d3.select(parent).append("svg:g")
      .attr("class", "y axis") // so we can style it with CSS
      .attr("transform", "translate(" + left + ", 0)")
      .call(newConfig.yAxis); // add to the visualization
    d3.select(parent).append("line")
      .attr("x1", left)
      .attr("x2", left)
      .attr("y1", top)
      .attr("y2", bottom)
      .style("stroke", "#fff");

    // Label for Y axis
    //
    d3.select(parent).append("text")
      .attr("class", "y label")
      .attr("text-anchor", "end")
      .attr("x", -top)
      .attr("y", left + 2)
      .attr("dy", ".75em")
      .attr("transform", "rotate(-90)")
      .text("");

    // No data label.
    //
    d3.select(parent).append("text")
      .attr("class", "nodata label")
      .attr("text-anchor", "middle")
      .attr("y", d3config.HEIGHT/2)
      .attr("x", d3config.WIDTH/2)
  }

  // This redraws a bubble chart ("scatterplot")
  //
  function redrawBubble(parent, forceLabels, drawingData, withLine,
      tooltipPivots, datapointCol, axes, newConfig, loading){
    const duration = 1500;

    // remove data from previously drawn vizes
    //
    if( !withLine ) clear(parent, newConfig);

    // This will set the key for each datapoint, so animation
    // has the 'constancy' property
    //
    const datapointAlias = metadata.getAlias(datapointCol);
    const noLabel = metadata.getDatasetAttr('noLabel');
    const datapoints = d3.select(parent).selectAll(".bubble")
        .data(drawingData, d => d[datapointAlias]);
    const yDomainZero = metadata.getDatasetAttr('yDomainZero');

    // The data domains or desired axes might have changed, so update them all.
    // Set these before doing enter(), so we see a nice entry transition
    //
    setXDomain(newConfig, drawingData, axes);
    setYDomain(newConfig, drawingData, axes, yDomainZero);

    newConfig.cScale.domain([
      utils.getSafe(d3.min, drawingData, d => utils.safeVal(d, axes.colorAxis)),
      utils.getSafe(d3.max, drawingData, d => utils.safeVal(d, axes.colorAxis))
    ]);

    // add new points if they're needed
    //
    datapoints.enter()
      .insert("svg:circle")
        .attr("cx", d => newConfig.xScale(utils.safeVal(d, axes.xAxis)))
        .attr("cy", d => newConfig.yScale(utils.safeVal(d, axes.yAxis)))
        .attr("r", function() { return 0; })
        .attr("class", "bubble")
        .style("fill", d => newConfig.cScale(utils.safeVal(d, axes.colorAxis)))
        .style("stroke-width", 1.5)
        .style("opacity", 1)

    if( withLine ){  // This makes a tiny data-point, rather than a bubble
      newConfig.rScale.domain([1, 1]);
    } else {
      setDomain(newConfig.rScale, drawingData, axes.radiusAxis, false);
    }

    // transition the axes output format, depending on whether the data 
    // is in units or in time
    //
    newConfig.xAxis.tickFormat(metadata.getAxisFormat(axes.xAxis), 1);
    newConfig.yAxis.tickFormat(metadata.getAxisFormat(axes.yAxis), 1);

    // transition function for the axes
    //
    const t = 
        d3.select(parent).transition().duration(duration).ease("exp-in-out");
    t.select(".x.axis").call(newConfig.xAxis);
    t.select(".x.label").text(axes.xAxis);
    t.select(".y.axis").call(newConfig.yAxis);
    t.select(".y.label").text(axes.yAxis);
    t.select(".date.label").text('');
    t.select(".nodata.label").text(drawingData.length === 0 ? 'No Data' : '');

    // Erase current labels.
    //
    if (!loading) {
      forcelabel.clear(forceLabels, axes, newConfig);
    }

    // Transition the points.  When the circles are drawn,
    // draw the labels on top of them.
    //
    const nCircle = drawingData.length;
    datapoints
      .transition().duration(duration).ease("exp-in-out")
      .style("opacity", 1)
      .style("fill", d => newConfig.cScale(utils.safeVal(d, axes.colorAxis)))
      .style("stroke",  function(d) {
        return d3
          .rgb(newConfig.cScale(utils.safeVal(d, axes.colorAxis)))
          .darker(2);
      })
      .attr("r", d => newConfig.rScale(utils.safeVal(d, axes.radiusAxis)))
      .attr("cx", d => newConfig.xScale(utils.safeVal(d, axes.xAxis)))
      .attr("cy", d => newConfig.yScale(utils.safeVal(d, axes.yAxis)))
      .each("end", function(d, i){
        if (!noLabel && i==nCircle-1 && !loading){
          forcelabel.redraw(forceLabels, drawingData, duration, 
              datapointCol, axes, newConfig);

          // We must set this now, not at enter time;
          // otherwise the closure on the axes variable at enter time
          // will take precendence and draw the wrong fill color on mouseout.
          //
          datapoints
            .on("mouseover", function(){onMouseover(this, newConfig);})
            .on("mouseout", function(){onMouseout(this, axes, newConfig);})
        }
      })

    // remove points if we don't need them anymore
    //
    datapoints.exit()
      .transition().duration(duration).ease("exp-in-out")
      .each("start", function() {  // Use this to do static label placement
      })
      .attr("cx", d => newConfig.xScale(utils.safeVal(d, axes.xAxis)))
      .attr("cy", d => newConfig.yScale(utils.safeVal(d, axes.yAxis)))
      .style("opacity", 0)
      .attr("r", 0)
        .remove();


    // Add tooltip to the element.
    // Tooltip title is always the datapoint representation.
    //
    tooltip.doTooltip(tooltipPivots, datapointCol, 'bubble');
  }

  // Redraw a line chart
  //
  function redraw(parent, forceLabels, drawingData, tooltipPivots, 
      datapointCol, axes, newConfig, loading){
    const 
      xColumn = axes.xAxis,
      yColumn = axes.yAxis;
    const duration = 1500;
    const yDomainZero = metadata.getDatasetAttr('yDomainZero');

    drawingData.sort(function(a, b){
      return utils.safeVal(a, xColumn) - utils.safeVal(b, xColumn);
    })

    // transition the axes output format, depending on whether the data 
    // is in units or in time (or any other useful human readable format)
    //
    newConfig.xAxis.tickFormat(metadata.getAxisFormat(xColumn), 1);
    newConfig.yAxis.tickFormat(metadata.getAxisFormat(yColumn), 1);

    // Establish the domains for the axes
    //
    setXDomain(newConfig, drawingData, axes);
    setYDomain(newConfig, drawingData, axes, yDomainZero);

    // Transition the axes
    //
    const t = 
        d3.select(parent).transition().duration(duration).ease("exp-in-out");
    t.select(".x.axis").call(newConfig.xAxis);
    t.select(".x.label").text(xColumn);
    t.select(".y.axis").call(newConfig.yAxis);
    t.select(".y.label").text(yColumn);

    // Add the path
    //
    const valueline = d3.svg.line()
      .x(function(d){return newConfig.xScale(utils.safeVal(d, xColumn));})
      .y(function(d){return newConfig.yScale(utils.safeVal(d, yColumn));})
      .interpolate("linear")

    // Bind the data.  It's an array of arrays; each sub-array represents
    // a single path.  Here, we only draw one path.
    //
    const pathSelection = 
        d3.select(parent).selectAll("path.line")
          .data([drawingData]);

    pathSelection
      .enter()
      .append("path")
        .classed("line", true)
        .style("fill", "none")
        .style("stroke", "none")
        .style("opacity", 0)

    pathSelection
      .transition().duration(duration).ease("exp-in-out")
      .attr("d", valueline(drawingData))
      .style("stroke", "#f00")
      .style("opacity", 1)

    pathSelection
      .exit()
      .transition().duration(duration).ease("exp-in-out")
      .style("opacity", 0)

    // Experimental.  Draw the bubble chart on top of the lines,
    // so we can see the data point labels
    //
    redrawBubble(parent, forceLabels, drawingData, true, tooltipPivots, 
        datapointCol, axes, newConfig, loading);
  }

  // Called when the <LineChart> is destroyed.  Do any cleanup here
  //
  function destroy(){
  }

  // Clear the previous line drawing
  //
  function clear(parent, d3config){
    // d3.select(".nodata").text('');
    const pathSelection = 
        d3.select(parent).selectAll("path.line").data([]);


    pathSelection
      .exit()
      .transition().duration(d3config.transition).ease("exp-in-out")
      .style("opacity", 0)
  }

  // Clear previous bubble chart
  //
  function clearBubble(parent, d3config){
    const datapoints = 
        d3.select(parent).selectAll(".bubble").data([]);

    datapoints.exit()
      .transition().duration(d3config.transition).ease("exp-in-out")
      .attr("r", 0)
      .remove();
  }

  // Calculate the X axis domain, and set it in the d3 scale.
  //
  function setXDomain(newConfig, drawingData, axes) {
    return setDomain(newConfig.xScale, drawingData, axes.xAxis, false);
  }

  // Calculate the Y axis domain, and set it in the d3 scale.
  //
  function setYDomain(newConfig, drawingData, axes, yDomainZero) {
    return setDomain(newConfig.yScale, drawingData, axes.yAxis, yDomainZero);
  }

  function setDomain(scale, drawingData, axis, domainZero) {
    if (domainZero) {
      const minDom = utils.getSafe(d3.min, drawingData,
          d => utils.safeVal(d, axis));
      scale.domain(utils.getMinRange([
        minDom < 0 ? minDom : 0,
        utils.getSafe(d3.max, drawingData,
            d => utils.safeVal(d, axis))
      ]));
    } else {
      scale.domain(utils.getMinRange([
        utils.getSafe(d3.min, drawingData,
            d => utils.safeVal(d, axis)),
        utils.getSafe(d3.max, drawingData,
            d => utils.safeVal(d, axis)
        )
      ]));
    }
  }

  return {
    create,
    redrawBubble,
    redraw,
    destroy,
    clear,
    clearBubble,
  };
}();

export default line;
