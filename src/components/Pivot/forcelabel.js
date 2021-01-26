// Functions for using force graph for labels.
//
// Right now, this is just a D3 helper library for
// the line.js <LineChart> React component. 
//
// Turning off eslint warnings:
/* global d3 */
//

import metadata from './metadata.js';
import utils from './utils.js';
import datapoint from './datapoint.js';

const forcelabel = function(){
  const meta = {
    linkDistance: 5,
    charge: -320
  };

  const bFirefox = ((navigator!==undefined) && 
        (navigator.userAgent.toLowerCase().indexOf('firefox') > -1));

  // Create force label DOM object and return it.
  //
  function create(d3top){
    return d3.select('.' + d3top)
      .append("svg:g")
      .attr("class", "forceLabels");
  }

  // Plot labels near the circle data.
  //
  // This causes a 2nd traversal of the data.  Better would be to
  // plot the datapoint and label into the same svg group.
  //
  function createLabelTree(data, datapointCol, axes, d3config){
    const alias = metadata.getAlias(axes.datapoint);

    return data.map(function(d){
      const value = d[alias];
      const formatted = metadata.getFormattedValue(datapointCol, value);
      const child = { 
        id: value + ".label",
        label: utils.truncate(datapoint.formatDatapointRep(
            datapointCol, formatted)),
        x: d3config.xScale(utils.safeVal(d, axes.xAxis)),
        y: d3config.yScale(utils.safeVal(d, axes.yAxis))
      };
      return { 
        id: value,
        fixed: true,
        x: d3config.xScale(utils.safeVal(d, axes.xAxis)),
        y: d3config.yScale(utils.safeVal(d, axes.yAxis)),
        children: [child]
      };
    })
  }

  function getChildren(nodes){
    return nodes.filter(i => {
      return !i.children;
    });
  }

  function getParents(nodes){
    return nodes.filter(i => {
      return !!i.children;
    });
  }

  // Redraw labels for the circles already plotted.
  //
  // We use a force graph to plot labels so that they don't overlap
  // each other, and are tethered to the center of the circles.
  //
  // The labels will be drawn in the svg group called 'forceLabels'.
  //
  function redraw(forceLabels, selectedData, duration, datapointCol, axes,
      d3config){

    // This runs the incremental force algorithm
    //
    function labelTick(forceLabelLayout, labelLinkGroup, labelParentSelection, 
        labelChildSelection){
      return function(e){

        // Stops Firefox from spinning
        //
        if( bFirefox && e.alpha < 0.05 ){
          forceLabelLayout.stop();
          return;
        }
        labelLinkGroup
          .attr("x1", function(d) { return d.source.x; })
          .attr("y1", function(d) { return d.source.y; })
          .attr("x2", function(d) { return d.target.x; })
          .attr("y2", function(d) { return d.target.y; });

        labelParentSelection
          .attr("transform", function(d) { 
            return "translate(" + d.x + "," + d.y + ")";
          });

        labelChildSelection
          .attr("transform", function(d) { 
            return "translate(" + d.x + "," + d.y + ")";
          });
      }
    }

    const forceLabelLayout = d3.layout.force()
      .charge(meta.charge)
      // .gravity(0)     // experiment: causes labels to plot off-graph
      .linkDistance(meta.linkDistance)  // too long makes these go off-graph
      .size([d3config.WIDTH, d3config.HEIGHT]);

    // Given the input 'selectedData', create a tree structure and a flattened
    // structure.
    //
    const treeLabelData = createLabelTree(selectedData, datapointCol, axes, 
        d3config);
    const flatLabelData = utils.flatten(treeLabelData);
    const parents = getParents(flatLabelData);
    const children = getChildren(flatLabelData);

    const links = d3.layout.tree().links(flatLabelData);

    // Restart the force layout.
    //
    forceLabelLayout
      .nodes(flatLabelData)
      .links(links)
      .start();

    // Update the links
    //
    const labelLinkGroup = 
        forceLabels.selectAll("line.labelLink")
          .data(links, function(d) { return d.target.id; });

    // Enter any new links.
    //
    labelLinkGroup.enter().insert("svg:line", ".node")
      .attr("class", "labelLink")
      .attr("x1", function(d) { return d.source.x; })
      .attr("y1", function(d) { return d.source.y; })
      .attr("x2", function(d) { return d.target.x; })
      .attr("y2", function(d) { return d.target.y; });

    // Exit any old links.
    //
    labelLinkGroup.exit()
        .transition().duration(duration).ease("exp-in-out")
        .style("opacity", 0)
          .remove();

    // Draw the parents as tiny circles.  Don't call forceLabelLayout.drag,
    // since we don't want interactivity
    //
    const labelParentSelection = 
        forceLabels.selectAll("circle.labelParent")
          .data(parents, function(d) { return d.id; })

    labelParentSelection.enter().append("svg:circle")
      .attr("class", "labelParent")
      .attr("r", 1)

    // Exit any old parent nodes.
    //
    labelParentSelection.exit()
      .transition().duration(duration).ease("exp-in-out")
      .style("opacity", 0)
        .remove();

    // Draw children as text
    //
    const labelChildSelection = 
        forceLabels.selectAll("text.labelChild")
          .data(children, function(d) { return d.id; })

    labelChildSelection.enter().append("svg:text")
      .attr("text-anchor", "middle")
      .attr("class", "labelChild")
      .style("fill", "white")
      .style("pointer-events", "none")
      .style("opacity", 1.0)
      .text( function(d) { return utils.truncate(d.label); })
      .call(forceLabelLayout.drag);

    // Exit any old child nodes.
    //
    labelChildSelection.exit()
        .transition().duration(duration).ease("exp-in-out")
        .style("opacity", 0)
          .remove();

    // Set the tick function
    //
    forceLabelLayout
      .on("tick", labelTick(forceLabelLayout, labelLinkGroup, 
          labelParentSelection, labelChildSelection))
  }

  // Called to clear force label plot
  //
  function clear(forceLabels, axes, d3config){
    redraw(forceLabels, [], 500, '', axes, d3config);
  }

  // Return externally visible functions
  //
  return {
    create,
    redraw,
    clear,
  }
}();

export default forcelabel;
