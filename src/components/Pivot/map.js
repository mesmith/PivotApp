// Map drawing functions.  These are d3 routines.
//
// Turning off eslint warnings:
/* global d3 */
//
import metadata from './metadata.js';
import utils from './utils.js';
import tooltip from './tooltip.js';

const map = function(){

  // Create an array of blue colors, from the .Blues type css.
  // This is used instead of CSS styling to support color transitioning
  //
  const blueColors = [
      'rgb(247,251,255)',
      'rgb(222,235,247)',
      'rgb(198,219,239)',
      'rgb(158,202,225)',
      'rgb(107,174,214)',
      'rgb(66,146,198)',
      'rgb(33,113,181)',
      'rgb(8,81,156)',
      'rgb(8,48,107)'
  ];  

  const stateData = "data/usastates.json";  // Note: data/us-states.json 
                                            // doesn't have abbrevs
  // Called on initial creation
  //
  function create(parent){
    const mapContainer = d3.select(parent);
    const mapGroup = mapContainer.append("svg")
        .attr("class", "mapGroup");

    // Create a container for states
    //
    mapGroup.append("g")
        .attr("id", "states")
        .attr("class", "states Blues");
  }

  // Redraw the drawingData on a geomap
  //
  function redraw(parent, drawingData, tooltipPivots, datapointCol, 
      axes, d3config){
    const datapointAlias = metadata.getDatapointAlias(datapointCol);
    const geoProperty = metadata.getGeoProperty(datapointCol);

    // Set up the measurement domain and range, based on the color axis column.
    // Note the minimum measure is always 0, so picking a single state will
    // force it to be colored.
    //
    const mRange = d3.scale.linear().range([0, 8]);  // maps into Blues classes
    mRange.domain([
      0,
      utils.getSafe(d3.max, drawingData, function(d) {
        return utils.safeVal(d, axes.colorAxis);
      })
    ]);

    // Use datapointAlias as the index into drawing data
    //
    const index = drawingData.reduce(function(v1, v2){
      return {...v1, ...{[v2[datapointAlias]]: v2}};
    }, {});

    // Create a geo path.  This creates the albersUSA projection (by default).
    //
    const path = d3.geo.path();

    // Shrink the map to fit on the available area, and translate it
    // to the screen center.  The albersUSA at default scale is exactly
    // 960 pixels wide 
    // (see https://github.com/mbostock/d3.wiki/Geo-Projections),
    // so we scale based on that.
    //
    const mapScale = (d3config.WIDTH/960) * d3.geo.albersUsa().scale();
    const mapXY = d3.geo.albersUsa().scale(mapScale)
        .translate([d3config.WIDTH/2, d3config.HEIGHT/2]);
    path.projection(mapXY);

    // If requested, create a container for counties
    //
    if( metadata.isGeoType(datapointCol, 'County') ){
      const counties = d3.select('.mapGroup').append("g")
          .attr("id", "counties")
          .attr("class", "Blues");

      // Load the county shape data
      //
      d3.json("data/us-counties.json", function(json) {

        // Create paths for each county using the json data
        // and the geo path generator to draw the shapes
        //
        counties.selectAll("path")
            .data(json.features)
          .enter().append("svg:path")
            .style("opacity", 0.8)  // allows us to see state borders
            .attr("class", quantize)
            .attr("d", path);
      });
    }

    // Load the state shape data
    //
    d3.json(stateData, function(json) {
      if (!json) return;

      // Join the state data with the drawingData, so changes to
      // drawingData will force the map to update.  'v.join' is
      // used in tooltip.doTooltip().
      //
      const joined = json.features.filter(function(v){
        return v.properties!=null && geoProperty &&
            v.properties[geoProperty]!=null &&
            index[v.properties[geoProperty]]!=null;
      }).map(function(v){
        return {...v, join: index[v.properties[geoProperty]]};
      });

      // Create paths for each state using the json data
      // and the geo path generator to draw the shapes
      //
      const selection = d3.select('.states').selectAll("path").data(joined);

      selection
        .enter().append("svg:path")
          .style("fill", "#fff")
          .attr("d", path);

      selection
        .transition().duration(1000).ease("exp-in-out")
        .style("fill", function(d) { return blueColors[quantizeInner(d)]; })

      // This must be done here in the AJAX listener, after the state data
      // has been read in!
      //
      tooltip.doTooltip(tooltipPivots, datapointCol, '#states path');
    });

    // Given a state record in 'd', look up the color axis data in drawingData.
    // That is the measure element to quantize.  Convert the measure to a 
    // value from 0 to 8, and then return a class name associated with 
    // that value.
    //
    function quantize(d){
      return "q" + quantizeInner(d) + "-9";
    }
    function quantizeInner(d){
      var measure = 0;
      const attr = geoProperty? d.properties[geoProperty] : null;
      if( attr!=null ){
        const rec = index[attr];
        if( rec!=null && rec[axes.colorAxis]!=null ){
          measure = Math.round(mRange(rec[axes.colorAxis]));
        }
      }
      return measure;
    }
  }

  // Clean up the D3 map.  Nothing to do
  //
  function destroy(){
  }

  return {
    destroy,
    create,
    redraw,
  }
}();

export default map;
