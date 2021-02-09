// Functions to support faceted search

import metadata from './metadata.js';
import utils from './utils.js';
import constants from './constants.js';

const facets = function(){

  // This function returns an object representing the enumerations
  // within the currently displayed dataset.  This is used when building a 
  // faceted search interface.
  //
  // The result looks something like:
  // {
  //   Gender: { Female: 3024, Male: 7352 }, 
  //  'Gain Status': { ACD: 19, ACG, 8659 }, ...
  // }
  //
  function getSearchableFacets(drawingData){

    const aliases = metadata.getColumnsWithAttrTrue('searchable')
      .reduce(function(v1, v2){
        return {...v1, ...{[metadata.getAlias(v2)]: v2}};
      }, {});

    // 'rec' has objects, some of which are fully qualified categorical
    // field names (e.g. "State:WY").  We want to sum up every value for
    // such fields.
    //
    return [].concat.apply([], drawingData.map(function(rec){
      return Object.keys(rec).filter(function(catFqn){
        const colonIdx = catFqn.indexOf(':');
        if( colonIdx<0 ) return false;
        const catAlias = catFqn.substring(0, colonIdx);
        return aliases.hasOwnProperty(catAlias);
      }).map(function(catFqn){
        const colonIdx = catFqn.indexOf(':');
        const catAlias = catFqn.substring(0, colonIdx);
        const catValue = catFqn.substring(colonIdx+1);
        const withNull = catValue === 'null' ? constants.Null : catValue;
        return {
          catAlias: catAlias, catValue: withNull, value: (+rec[catFqn])
        };
      });
    })).reduce(function(v1, v2){
      const catAlias = v2.catAlias;
      const catValue = v2.catValue;
      const newValue = v2.value;
      const oldValue = (v1.hasOwnProperty(catAlias) &&
          v1[catAlias].hasOwnProperty(catValue)) ? v1[catAlias][catValue] : 0;
      const thisObj = {[catValue]: oldValue + newValue};

      const innerObj = v1.hasOwnProperty(catAlias) ?
          {...v1[catAlias], ...thisObj} : thisObj;

      return {...v1, ...{[catAlias]: innerObj}};
    }, {});
  }

  // Given an object with searchable facets, add categorical values that
  // aren't already present in the searchable facets.  The user can select
  // these values to create multi-selections.
  //
  // Note: If there aren't categorical values for a particular column,
  // multi-select won't work (since we aren't tracking the universe of
  // all possible selections).
  //
  function addCategoricalValues(searchableFacets, categoricalValues) {
    const catsByAlias = Object.keys(categoricalValues).reduce((i, j) => {
      return {...i, ...{[metadata.getAlias(j)]: categoricalValues[j]}}
    }, {});

    return Object.keys(searchableFacets).reduce((i, j) => {
      const thisSearchFacet = searchableFacets[j];
      const catValuesForVar = catsByAlias.hasOwnProperty(j) ? catsByAlias[j] : [];
      const catValues = catValuesForVar.map(k => {
        return k === null ? constants.Null : k;
      });

      const missingValues = Array.isArray(catValues) ? catValues.filter(j => {
        return !thisSearchFacet.hasOwnProperty(j);
      }) : [];

      const missingFacets = missingValues.reduce((k, l) => {
        return {...k, ...{[l]: 'filtered'}};
      }, {});

      return {...i, ...{[j]: {...thisSearchFacet, ...missingFacets}}};
    }, {});
  }

  // Return the facet data for the datapoint rep.
  // We allow the user to filter on the datapoint rep, not just on
  // the searchable facets.
  //
  // The input drawingData looks like this:
  //   [ { <nrec>: <# of units>, <datapoint-alias>: <datapoint-value>, ... }, ... ]
  // and we want to count the # of units for each value of datapoint-alias.
  //
  // The result looks something like:
  //   { State: { CT: 61, MD: 25, ... } }
  //
  function getDatapointFacet(drawingData, datapointCol){
    const datapointAlias = metadata.getAlias(datapointCol);
    const nrec = metadata.getAlias(constants.sumrecords);

    // Note the mapping of nulls to constants.Null.  That avoids a very
    // tricky problem whereby the key to an object is never null: Javascript
    // changes it to a string.
    //
    const datapointFacet = drawingData.reduce((i, j) => {
      const key = j[datapointAlias] === null ? constants.Null : j[datapointAlias];

      return {...i, ...{[key]: j[nrec] || 0}};
    }, {});
   
    return {[datapointAlias]: datapointFacet};
  }

  // Return an object representing the faceted search.
  // The facets consist of all searchable data, as
  // well as all values from the datapoint representation.
  //
  function getFacets(drawingData, datapointCol, categoricalValues){
    const datapointFacet = getDatapointFacet(drawingData, datapointCol);
    const searchableFacets = getSearchableFacets(drawingData);
    const fromFilteredData = {...searchableFacets, ...datapointFacet}
    return addCategoricalValues(fromFilteredData, categoricalValues);
  }

  // Return TRUE if we're currently searching for 'column: value'
  //
  function searchingFor(searchObject, column, value) {
    return (column in searchObject) && searchObject[column].indexOf(value) !== -1;
  }

  // Return the facet list, but in a more sane, React-friendly array
  //
  function getReactFacets(drawingData, searchObject, datapointCol, categoricalValues){
    const oFacets = getFacets(drawingData, datapointCol, categoricalValues);

    return Object.keys(oFacets).map(label => {
      const column = metadata.aliasToColumn(label);
      const values = oFacets[label];
      const vlist = Object.keys(values)
        .sort()
        .filter(i => !searchingFor(searchObject, column, i))
        .map(i => {
          return { value: i, n: values[i] }
        });
      return {column: column, label: label, list: vlist};
    }).filter(i => i.list.length > 0)
      .sort(utils.sorter('label'));
  }

  // Return the externally visible functions
  //
  return {
    getReactFacets
  }
}();

export default facets;
