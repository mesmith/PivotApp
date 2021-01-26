// Pareto chart drawing functions
//
// Turning off eslint warnings:
/* global d3 */
//
import utils from './utils.js';
import tooltip from './tooltip.js';
import metadata from './metadata.js';
import constants from './constants.js';

const pareto = function(){
  const maxParetoXAxis = 14;

  // Called when we mouse over or out of a data element 'elt'.
  //
  function onMouseover(elt, d3config){ 
    d3.select(elt).transition().duration(d3config.transition)
      .style("fill", d3config.hoverColor);
  }
  function onMouseout(elt, axes, d3config){ 
    d3.select(elt).transition().duration(d3config.transition)
      .style("fill", d => d3config.cScale(utils.safeVal(d, axes.colorAxis)));
  }

  // Create the data-independent aspect of the Pareto chart
  //
  function create(parent, d3config){
    const bottom = d3config.HEIGHT - d3config.MARGINS.bottom;
    const left = d3config.MARGINS.innerleftPareto;
    const right = d3config.WIDTH - d3config.MARGINS.rightPareto;
    const top = d3config.MARGINS.top + 1;

    // Add in the x axis.
    //
    d3.select(parent).append("svg:g")
      .attr("class", "x axis") // so we can style it with CSS
      .attr("transform", "translate(0," + bottom + ")")
      .call(d3config.xAxisPareto);

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

    // Add in the y axis on the left side.
    //
    d3.select(parent).append("svg:g")
      .attr("class", "y axis") // so we can style it with CSS
      .attr("transform", "translate(" + left + ", 0)")
      .call(d3config.yAxis); // add to the visualization
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

    // Add in the right-side Y axis, measuring the
    // cumulative scale
    //
    d3.select(parent).append("svg:g")
      .attr("class", "y axis")
      .attr("transform", "translate(" + [right, 0] + ")")
      .call(d3config.yAxisParetoRight);
    d3.select(parent).append("line")
      .attr("x1", right)
      .attr("x2", right)
      .attr("y1", top)
      .attr("y2", bottom)
      .style("stroke", "#fff");

    d3.select(parent).append("text")
      .attr("transform", "rotate(-90)")
      .attr("x", -top)
      .attr("y", right + 2)
      .attr("dy", "-.75em")
      .style("text-anchor", "end")
      .text("Cumulative %");

    // Add a dashed line representing the 80% cumulative line
    //
    d3.select(parent).append("line")
      .attr("x1", left)
      .attr("x2", right)
      .attr("y1", d3config.yScaleParetoRight(.8))
      .attr("y2", d3config.yScaleParetoRight(.8))
      .attr("stroke-dasharray", 4)
  }

  // This redraws a Pareto chart
  //
  function redraw(parent, drawingData,
      tooltipPivots, datapointCol, axes, d3config, loading){
    const maxTicks = 50;
    const barPadding = drawingData.length > maxTicks ? 0 : 4;
    const duration = 1000;
    const height = d3config.HEIGHT - d3config.MARGINS.top;
    const right = d3config.WIDTH - d3config.MARGINS.rightPareto;
    const top = d3config.MARGINS.top + 1;

    // remove data from previously drawn vizes
    //
    clear(parent, d3config);

    // This will set the key for each datapoint, so animation
    // has the 'constancy' property.
    //
    const datapointAlias = metadata.getAlias(datapointCol);
    const noLabel = metadata.getDatasetAttr('noLabel');
    const datapoints = d3.select(parent).selectAll(".pareto-bar")
        .data(drawingData, d => d[datapointAlias]);

    // The data domains or desired axes might have changed, so update them all.
    // Set these before doing enter(), so we see a nice entry transition
    //
    const xDomain = drawingData.map(i => i[datapointAlias]);
    d3config.xScalePareto.domain(xDomain);

    // If there are more than maxTicks to draw, we need to filter some out.
    // By inspection.
    //
    const tickSkip = Math.round(drawingData.length / maxTicks);
    const tickValues = drawingData
      .filter((i, j) => tickSkip === 0 || j % tickSkip === 0)
      .map(i => i[datapointAlias]);

    d3config.xAxisPareto.tickValues(tickValues);

    d3config.xScale.domain([0, drawingData.length - 1])

    setYDomain(d3config, drawingData, axes);

    d3config.cScale.domain([
      utils.getSafe(d3.min, drawingData, d => utils.safeVal(d, axes.colorAxis)),
      utils.getSafe(d3.max, drawingData, d => utils.safeVal(d, axes.colorAxis))
    ]);

    // Add histogram bars
    //
    const bw = d3config.xScalePareto.rangeBand() - barPadding*2;
    const barWidth = bw < 1 ? 1 : bw;
    datapoints.enter()
      .insert("svg:rect")
        .attr("class", "pareto-bar")
        .attr("x", d => d3config.xScalePareto(d[datapointAlias]) + barPadding)
        .attr("width", barWidth)
        .attr("y", height)
        .attr("height", 0);

    // The legend.  Here, we want to show the user whether the data
    // actually indicates a Pareto distribution.
    //
    const paretoHelp = describePareto(drawingData);

    // The Pareto help legend
    //
    d3.select(parent)
      .insert("text")
        .attr("class", "pareto-legend")
        .style("text-anchor", "end")
        .attr("x", right - 30)
        .attr("y", top + 40)
        .attr("opacity", 0)
        .text("");

    // Draw the cumulative Pareto line.
    //
    const valueline = d3.svg.line()
      .x(d => d3config.xScalePareto(d[datapointAlias]))
      .y(d => d3config.yScaleParetoRight(
         utils.safeVal(d, constants.cumulative.percent)
      ))
      .interpolate('basis');

    const pathSelection =
      d3.select(parent).selectAll("path.pareto-line").data([drawingData]);

    pathSelection.enter()
      .insert("path")
        .classed("pareto-line", true)
        .style("fill", "none")
        .style("opacity", 0.1);

    pathSelection.transition()
      .duration(duration).ease("exp-in-out")
      .attr("d", valueline(drawingData))
      .style("opacity", 1);

    pathSelection.exit()
      .transition().duration(duration).ease("exp-in-out")
      .style("opacity", 0)
      .remove();

    // Transition the axes output format.
    // Note that the x axis is always the datapoint.
    //
    function abbreviate(axis) {
      const formatter = metadata.getAxisFormat(axis);
      return function(d) {
        const formatted = formatter !== null ? formatter(d) : d;
        const abbr = formatted.substring(0, maxParetoXAxis);
        return abbr === formatted ? abbr : `${abbr}...`;
      }
    }
    d3config.xAxisPareto.tickFormat(abbreviate(axes.datapoint), 1);
    d3config.yAxis.tickFormat(metadata.getAxisFormat(axes.yAxis), 1);

    // Transition function for the axes.
    // Note that we use 45 degree offset for X labels, since they
    // are categorical values.
    //
    d3.select(parent)
      .select(".x.axis").call(d3config.xAxisPareto)
      .selectAll("text")
        .attr("transform", "rotate(0)");

    const t = d3.select(parent).transition()
      .duration(duration).ease("exp-in-out");
    t.select(".x.axis").call(d3config.xAxisPareto)
      .selectAll("text")
        .style("text-anchor", "end")
        .attr("dx", "-.8em")
        .attr("dy", ".15em")
        .attr("transform", "rotate(-45)");
    t.select(".y.axis").call(d3config.yAxis);
    t.select(".y.label").text(axes.yAxis);
    t.select(".pareto-legend").text(paretoHelp);

    // Transition the bars.
    //
    const nPoints = drawingData.length;
    datapoints.transition()
      .duration(duration)
      .ease("exp-in-out")
      .style("opacity", 1)
      .style("fill", d => d3config.cScale(utils.safeVal(d, axes.colorAxis)))
      .style("stroke", d => d3
          .rgb(d3config.cScale(utils.safeVal(d, axes.colorAxis)))
          .darker(2)
      )
      .attr("x", d => d3config.xScalePareto(d[datapointAlias]) + barPadding)
      .attr("y", d => d3config.yScale(utils.safeVal(d, axes.yAxis)))
      .attr("height", d => height - d3config.yScale(utils.safeVal(d, axes.yAxis)))
      .attr("width", barWidth)
      .each("end", function(d, i) {
        if (!noLabel && i==nPoints-1 && !loading){

          // We must set this now, not at enter time;
          // otherwise the closure on the axes variable at enter time
          // will take precendence and draw the wrong fill color on mouseout.
          //
          datapoints
            .on("mouseover", () => {onMouseover(this, d3config);})
            .on("mouseout", () => {onMouseout(this, axes, d3config);})
        }
      })

    // remove points if we don't need them anymore
    //
    datapoints.exit()
      .transition().duration(duration).ease("exp-in-out")
      .attr("x", 0)
      .attr("y", height)
      .attr("width", 0)
      .attr("height", 0)
      .style("opacity", 0)
        .remove();

    // Add tooltip to the element.
    // Topmost is always the datapoint representation.
    //
    tooltip.doTooltip(tooltipPivots, datapointCol, 'pareto-bar');
  }

  // Called when the <ParetoChart> is destroyed.  Do any cleanup here
  //
  function destroy(){
  }

  // Clear the previous Pareto drawing
  //
  function clear(parent, d3config){
    const height = d3config.HEIGHT - d3config.MARGINS.top;
    const datapoints = 
        d3.select(parent).selectAll(".pareto-bar").data([]);
    const pathSelection = 
        d3.select(parent).selectAll("path.pareto-line").data([]);

    datapoints.exit()
      .transition().duration(d3config.transition).ease("exp-in-out")
      .attr("y", height)
      .attr("width", 0)
      .attr("height", 0)
      .style("opacity", 0)
      .remove();

    // Avoiding the exit transition seems to guarantee that the
    // cumulative line always is drawn on top.  Probably a timing race,
    // but good enough for me.
    //
    pathSelection.exit()
      // .transition().duration(d3config.transition).ease("exp-in-out")
      .style("opacity", 0)
      .remove();

    d3.select(parent).selectAll("text.pareto-legend").data([])
      .exit()
      .transition().duration(d3config.transition).ease("exp-in-out")
      .style("opacity", 0)
      .remove();
  }

  // Calculate the Y axis domain.
  //
  // Note that we set the Y min slightly under the minimum value, so
  // the histogram bar won't disappear for the minimum value.
  //
  function setYDomain(d3config, drawingData, axes) {
    const min = utils.getSafe(d3.min, drawingData,
      d => utils.safeVal(d, axes.yAxis))
    const maxDom = utils.getSafe(d3.max, drawingData,
      d => utils.safeVal(d, axes.yAxis));
    const extra = (maxDom - min) * 0.02;
    const minDom = min - extra;
    const minAfterZero = minDom > 0 ? 0 : minDom;

    d3config.yScale.domain(utils.getMinRange([minAfterZero, maxDom]));
  }

  // Return an English description of how close the data follows a
  // Pareto distribution.
  //
  function describePareto(drawingData) {
    const percentField = constants.cumulative.percent;
    if (drawingData.length === 0) {
      return;
    }
    const at80percent = drawingData.reduce((i, j, k) => {
      const val = utils.safeVal(j, percentField);
      return val >= .799 && i === -1 ? k : i;
    }, -1);
    const paretoValue = at80percent / drawingData.length;

    if (paretoValue <= .2) {
      return 'Follows the 80/20 rule';
    } else if (paretoValue <= .25) {
      return 'Almost follows the 80/20 rule';
    } else if (paretoValue <= .3) {
      return 'Somewhat follows the 80/20 rule';
    } else {
      return 'Does not follow the 80/20 rule';
    }
  }
 
  return {
    create,
    redraw,
    destroy,
    clear
  };
}();

export default pareto;
