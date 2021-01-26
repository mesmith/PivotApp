// Tooltip functions
//
import metadata from './metadata.js';
import datapoint from './datapoint.js';
import utils from './utils.js';
import constants from './constants.js';

// This is a custom version of jquery.tipsy.js that self-imports jquery
// (so it doesn't have to be in a script tag).
//
import $ from 'jquery';
import './jquery.tipsy.js';

const tooltip = function(){

  const maxTooltipText = 16;

  // This does a tooltip
  //
  function obscure(str){
    if( str==null ) return str;
    return (str.length>maxTooltipText) ? str.substr(0, maxTooltipText - 2) + '...' : str;
  }
  function doTooltipForce(tooltipPivots, datapointCol, className){
    doTooltipAlias(false, true, tooltipPivots, datapointCol, className);
  }
  function doTooltip(tooltipPivots, datapointCol, className){
    doTooltipAlias(true, false, tooltipPivots, datapointCol, className);
  }
  function doTooltipAlias(bConvertAlias, bIgnore, tooltipPivots, datapointCol,
      className){
    const titleFactory = function(datapointCol){
      return function(){
        const d = this.__data__;
        const alias = metadata.getAlias(datapointCol);

        // Look for d.join.  If this is there, it means that we've got
        // a map, and the map has joined a record representing (e.g.)
        // a state, with a record representing the data in the state
        //
        const thisData = d && d.join != null ? d.join : d;

        // Display the datapoint identity first
        //
        const header = getHeader(thisData, alias, bConvertAlias,
            datapointCol, bIgnore);
        if (!header) return;

        // map aliases to obscure requests.  This hides, e.g., customer names.
        //
        const obscured = metadata.getColumnsWithAttrTrue('obscure')
          .reduce(function(v1, v2){
            return {...v1, ...{[metadata.getAlias(v2)]: 1}};
          }, {});

        // Get tooltip ordering
        //
        const tooltipOrder = metadata.getColumnsWithAttrTrue('tooltip').reduce((i, j) => {
          const tooltipIndex = metadata.getAttrValue(j, 'tooltipIndex', 1e8);
          const alias = metadata.getAlias(j);

          return {...i, ...{[alias]: tooltipIndex}};
        }, {});

        // Get number of records in this aggregation.
        // If there's only one record,
        // we format the categorical values this way:
        //   COUNTRY: USA
        // because there should be exactly one COUNTRY for the aggregation.
        //
        // If there are multiples, the output might look like this:
        //   COUNTRY:USA: 2
        //   COUNTRY:Mexico: 4
        // etc.
        //
        const nRecAlias = metadata.getAlias(constants.sumrecords);
        const nRec = thisData[nRecAlias] || 0;

        // Display datapoint attributes, filtering out the datapoint column.
        // A single instance of a tooltip alias is of the form {column, category}
        // where category is one of the allowed values of 'column'.
        //
        const body = getTooltipAliasNames(tooltipPivots)
          .filter(function(i){
            const flattened = i.hasOwnProperty('category') ?
              i.name + ':' + i.category :
              i.name;

            // Don't display category values of zero, indicating "no presence".
            //
            const catValueIsZero = i.hasOwnProperty('category') && thisData[flattened]===0;

            return flattened!==alias && typeof thisData[flattened]!=="undefined" && 
                thisData[flattened]!=="" && !catValueIsZero;
          })
          .map(function(i){
            const flattened = i.hasOwnProperty('category') ?
              i.name + ':' + i.category :
              i.name;

            const value = obscured[flattened] ? obscure(thisData[flattened]) : thisData[flattened];
            return {...i, flattened, value};
          })
          .sort((a, b) => {
            return +b.value - +a.value;  // sort values, then names, then tooltipIndex
          })
          .map((i, j) => {  // to stabilize the sort
            return {...i, ...{index: j}};
          })
          .sort(utils.alphaSort.bind(null, 'name', 'index'))
          .sort((a, b) => {
            const aIndex = tooltipOrder.hasOwnProperty(a.name) ? tooltipOrder[a.name] : 1e8;
            const bIndex = tooltipOrder.hasOwnProperty(b.name) ? tooltipOrder[b.name] : 1e8;
            return aIndex - bIndex;
          })
          .map(i => {
            if (nRec===1 && i.hasOwnProperty('category')) {
              return (
                '<div class="tooltip pivot-div">' + 
                  '<label class="tooltip-label">' + i.name + ':</label>' + 
                  '<span class="tooltip-wrap"><span class="tooltip-value">' + i.category +
                  '</span></span>' +
                '</div>'
              );
            } else {
              const fmtValue = metadata.getFormattedValue(i.col, i.value);

              return (
                '<div class="tooltip pivot-div">' + 
                  '<label class="tooltip-label">' + i.flattened + ':</label>' + 
                  '<span class="tooltip-wrap"><span class="tooltip-value">' + fmtValue +
                  '</span></span>' +
                '</div>'
              );
            }
          });

        return header.join('') + '<div class="pivot-div">' + body.join('') + '</div>' ;
      }
    }
    const options = {
      gravity: 'n',
      fade: true,
      html: true,
      opacity: 0.7,
      title: titleFactory(datapointCol),
    };
    $('.' + className).tipsy(options);
  }

  function getHeader(thisData, alias, bConvertAlias, datapointCol, bIgnore){
    const datum = thisData[alias];
    if( typeof datum !== 'undefined' && datum !=='' ){
      const formatted = metadata.getFormattedValue(datapointCol, datum);
      if( bConvertAlias ){
        return ['<div class="bold center pivot-div">' +
            datapoint.formatDatapointRep(datapointCol, formatted) + 
            '</div>'];
      } else {
        return ['<div class="bold center pivot-div">' + formatted + '</div>'];
      }
    } else {
      if( !bIgnore ){
        return ['<h3>Unknown ' + alias + '</h3>',
          '<div class="bold center pivot-div" style="padding: 3px; float: none">Unknown ' + 
            alias + 
          '</div>'];
      }
    }
  }

  // Return an array of tooltip alias names
  //
  function getTooltipAliasNames(tooltipPivots){

    const averages = metadata.getColumnsWithAttrTrue('tooltipAvg').map(i => {
       return {name: metadata.getAlias(i) + constants.avgSuffix, col: i};
    });

    // Flatten the array of arrays here
    //
    const others = [].concat.apply([], 
      metadata.getColumnsWithAttrTrue('tooltip').map(function(column){
        if( tooltipPivots.hasOwnProperty(column) ){
          return tooltipPivots[column].map(function(v) {
            return {name: metadata.getAlias(column), category: v, col: column};
          });
        } else {  // just get the column alias
          return [{name: metadata.getAlias(column), col: column}];
        }
      })
    );
    return averages.concat(others);
  }

  return {
    doTooltipForce,
    doTooltip
  }
}();

export default tooltip;
