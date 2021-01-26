// Force graph
//
// Turning off eslint warnings:
/* global d3 */
//
import utils from './utils.js';
import tooltip from './tooltip.js';

const force = function(){
  const meta = {
    linkDistance: 40,
    charge: -150
  };

  // Hierarchy-based force graph
  //
  const
    forceMaxDisplay = 2000; // Maximum # of nodes to display

  // Called on initial creation of this element.  Adds zoom function
  // to 'parent', creates a child element, and returns the child.
  //
  function create(parent, drawingData, tooltipPivots, datapointCol, d3config){

    const forceGraph = d3.select(parent)
      .append("svg:g")
      .attr("class", "forcegraphinner")

    d3.select(parent)
      .call(d3.behavior.zoom().on("zoom", zoom(forceGraph)));

    forceGraph.append("svg:rect")
        .attr("class", "forcegraphrect")
        .attr("width", d3config.WIDTH)
        .attr("height", d3config.HEIGHT)
        // .attr("fill", 'rgb1(1,1,1,0)')

    return d3.layout.force()
      .charge(meta.charge)
      .gravity(0)            // allow force jacking
      .linkDistance(meta.linkDistance)
      .size([d3config.WIDTH, d3config.HEIGHT]);
  }

  // Draw the force graph
  //
  function redraw(drawingData, tooltipPivots, datapointCol, forceLayout, 
      firstDraw, d3config){

    // Stop any running simulation from previous redraw().
    // Note that this implies that 'forceLayout' is part 
    // of the <ForceChart> state.
    //
    if( !firstDraw ) forceLayout.stop();

    const forceGraph = d3.select(".forcegraphinner");
    updateForce(forceGraph, drawingData, tooltipPivots, datapointCol, 
        forceLayout, d3config);
  }

  // Called when the force graph is deleted
  //
  function destroy(){
  }

  // Redraw the force graph, reacting to changes to the 
  // hierarchy in the data.
  //
  function updateForce(forceGraph, drawingData, tooltipPivots, datapointCol,
      forceLayout, d3config){
    const forceData = utils.flatten(drawingData);
    const links = d3.layout.tree().links(forceData);

    // Get the domain min and max for size calculation
    //
    d3config.rScale.domain([
      utils.getSafe(d3.min, forceData, function(d) { return +d.size; }),
      utils.getSafe(d3.max, forceData, function(d) { return +d.size; })
    ]);

    // Restart the force layout.
    //
    forceLayout
      .nodes(forceData)
      .links(links)
      .start();

    // Update the links.
    //
    var oldLinks = forceGraph.selectAll("line.link");
    if( oldLinks ) oldLinks.remove();
    const forceLinkGroup = forceGraph.selectAll("line.link")
      .remove()
      .data(links, function(d) { return d.target.id; });

    // Enter any new links.
    //
    forceLinkGroup.enter().insert("svg:line", ".node")
      .attr("class", "link")
      .attr("x1", function(d) { return d.source.x; })
      .attr("y1", function(d) { return d.source.y; })
      .attr("x2", function(d) { return d.target.x; })
      .attr("y2", function(d) { return d.target.y; });

    // Exit any old links.
    //
    forceLinkGroup.exit().remove();

    // Update the nodes.  Create a group into which we'll
    // render a circle and its label.
    //
    var oldNodes = forceGraph.selectAll("g.node");
    if( oldNodes ) oldNodes.remove();
    const forceNodeSelection = forceGraph.selectAll("g.node")
      .data(forceData, function(d) { return d.id; })

    const forceNodeGroup = forceNodeSelection.enter().append("svg:g")
      .attr("class", "node")
      .call(forceLayout.drag)

    forceLayout
      .on("tick", forceTickJack(tooltipPivots, datapointCol, forceData, 
          forceNodeSelection, forceLinkGroup, forceLayout, d3config));

    // Experiment: Add a background shadow circle to indicate whether
    // we have children
    //
    function outerCircle(d){
      if ( d._children && d._children.length!=0 ) {
        return { fill: d3.rgb(forceColorOuter(d)).brighter(1),
                 stroke: d3.rgb(forceColorOuter(d)).darker(1),
                 strokewidth: 1 }
      } else {
        return { fill: 'none', stroke: 'none', strokewidth: 0 }
      }
    }
    forceNodeGroup.append("svg:circle")
      .attr("class", "nodeRing bubble")
      .attr("r", function(d) { return d3config.rScale(d.size) + 5; })
      .style("fill",  function(d) { return outerCircle(d).fill; })
      .style("stroke",  function(d) { return outerCircle(d).stroke; })
      .style("stroke-width",  function(d) {return outerCircle(d).strokewidth;})
      .on("click", forceClick(forceGraph, drawingData, tooltipPivots, 
          datapointCol, forceLayout, d3config))

    forceNodeGroup.append("svg:circle")
      .attr("class", "nodeInner bubble")
      .attr("r", function(d) { return d3config.rScale(d.size); })
      .style("fill", forceColor)
      .style("stroke",  function(d){ return d3.rgb(forceColor(d)).darker(2); })
      .style("stroke-width",  0.5)
      .on("click", forceClick(forceGraph, drawingData, tooltipPivots, 
          datapointCol, forceLayout, d3config))

    // This will modify the colors for
    // nodes that are being expanded or contracted
    //
    forceNodeSelection.select("circle.nodeInner")
      .style("fill", forceColor)

    // Drop shadow text, so the text doesn't fade into background
    //
    forceNodeGroup.append("svg:text")
      .attr("text-anchor", "middle")
      .style("stroke", "white")
      .style("stroke-width", "2.5px")
      .style("font-size", "8px")
      .style("pointer-events", "none")
      .style("opacity", 0.9)
      .text( function(d) { return utils.truncate(d.label); })

    // Actual text
    //
    forceNodeGroup.append("svg:text")
      .attr("text-anchor", "middle")
      .style("fill", "black")
      .style("font-size", "8px")
      .style("pointer-events", "none")
      .style("opacity", 1.0)
      .text( function(d) { return utils.truncate(d.label); })

    // Exit any old nodes.
    //
    forceNodeSelection.exit().remove();
  }

  // Tick function for force graph.  Change this in order to gravitate
  // to multiple foci, for example.
  //
  function forceTickJack(tooltipPivots, datapointCol, forceData, 
      forceNodeSelection, forceLinkGroup, forceLayout, d3config){
    return function(e){

      // Gravitate toward the center
      //
      const k = .05 * e.alpha;
      forceData.forEach(function(o){
        o.y += (d3config.HEIGHT/2 - o.y) * k;
        o.x += (d3config.WIDTH/2 - o.x) * k;
      });

      forceLinkGroup
        .attr("x1", function(d) { return d.source.x; })
        .attr("y1", function(d) { return d.source.y; })
        .attr("x2", function(d) { return d.target.x; })
        .attr("y2", function(d) { return d.target.y; });

      forceNodeSelection
        .attr("transform", function(d) {
          return "translate(" + d.x + "," + d.y + ")";
        });

      if( e.alpha < 0.02 ){
        forceLayout.stop();
        tooltip.doTooltipForce(tooltipPivots, datapointCol, 'bubble');
      }
    }
  }
  
  // Color leaf nodes orange, and packages white or blue.
  // Change.  Now we color based on the 'status' field
  //
  const forceColors = {
    red: '#b33', yellow: '#bb3', green: '#3b3', gray: '#888'
  };

  function forceColorOuter(d) { return iForceColor(d, 'rollupStatus'); }
  function forceColor(d) { return iForceColor(d, 'status'); }
  function iForceColor(d, column) {
    // return d._children ? "#3182bd" : d.children ? "#c6dbef" : "#fd8d3c";
    if( d[column]!=null && forceColors[d[column]]!=null ){
      return forceColors[d[column]];
    }
    return forceColors.gray;
  }
  
  // Toggle children on click.
  // Check for the case where there are too many elements
  //
  function forceClick(forceGraph, drawingData, tooltipPivots, datapointCol, 
      forceLayout, d3config){
    return function(d){
      if (d.children) {
        d._children = d.children;
        d.children = null;
      } else {
        if( d._children && d._children.length + forceLayout.links().length > 
            forceMaxDisplay ){
          alert("Sorry!  There are too many elements to display.");
          return;
        }
        d.children = d._children;
        d._children = null;
      }
      updateForce(forceGraph, drawingData, tooltipPivots, datapointCol, 
          forceLayout, d3config);
    }
  }

  // Called on zoom event in force graph
  //
  function zoom(forceGraph) {
    return function(){
      forceGraph.attr("transform", 
          "translate(" + d3.event.translate + ")" + 
          " scale(" + d3.event.scale + ")");
    }
  }
  
  // Return externally visible functions
  //
  return {
    create,
    redraw,
    destroy,
  }
}();

export default force;
