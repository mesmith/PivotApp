// Methods for user-selectable controls
//
import metadata from './metadata.js';
import utils from './utils.js';
import constants from './constants.js';

const controls = function(){

  // This is a rule that indicates how a change to the "Graph Type"
  // radio control affects the 'disabled' state of other controls.
  //
  const graphTypeEnable = {
    bubble: [ 'xAxis', 'yAxis', 'colorAxis', 'radiusAxis', 'animate', 
        'datapoint' ],
    pareto: [ 'yAxis', 'colorAxis', 'datapoint' ],
    line: [ 'xAxis', 'yAxis', 'datapoint', 'colorAxis' ],
    force: [ 'datapoint' ],
    forceStatus: [ 'datapoint' ],
    map: [ 'datapoint', 'colorAxis'],
    default: [ 'xAxis', 'yAxis', 'colorAxis', 'radiusAxis', 'animate', 
        'datapoint' ],
  };

  // Return TRUE if 'control' is enabled for the value in 'graphtype'
  // for the graphtype control.
  //
  const isEnabled = function(graphtype, control){
    if( graphTypeEnable.hasOwnProperty(graphtype) ){
      return graphTypeEnable[graphtype].indexOf(control) !== -1;
    } else {
      return graphTypeEnable.default.indexOf(control) !== -1;
    }
  }

  // Return the default graphtype.  Return '' if there isn't one
  //
  const getGraphtypeDefault = function(){
    return constants.graphtypeControls.list.reduce(function(v1, v2){
      return v2.default? v2.value: v1;
    }, '');
  }

  // Given a graphtype value, return a new list of graphtype controls
  //
  const getGraphtypeControls = function(graphtype, datapointCol){
    const list = constants.graphtypeControls.list.map(i => {
      const enabled = i.value !== 'pareto' ||
        !metadata.getAttrValue(datapointCol, 'noPareto', false)
      return {...i, checked: (i.value === graphtype), disabled: !enabled};
    });

    return {...constants.graphtypeControls, list};
  }
  
  // Return a list of choices for the given control.
  // The list is of the form [{col: COLUMN, alias: ALIAS}, ...]
  // and is sorted by alias.
  //
  const getControlChoices = function(graphtype, control, categoricalValues, datapointCol){
    switch( control ){
      case 'graphtype':  // Note: This list is not sorted.
        return constants.graphtypeControls.list.map(i => {
          return {col: i.value, alias: i.label};
        })

      case 'datapoint':
        return metadata.getColumnsWithAttrTrue('datapoint')
          .filter(i => graphtype !== 'pareto' || !metadata.getAttrValue(i, 'noPareto', false))
          .map(i => {
            return {col: i, alias: metadata.getDatapointAlias(i)};
          }).sort(utils.sorter('alias'));

      case 'xAxis':
      case 'yAxis':
      case 'radiusAxis':
      case 'colorAxis': {
        const getNoAttr = function(attr) {
          return metadata.getColumnsWithAttrTrue(attr).reduce((i, j) => {
            return {...i, ...{[j]: true}};
          }, {});
        };
        const noAxis = getNoAttr('noAxis');
        const noXAxis = getNoAttr('noXAxis');
        const noYAxis = getNoAttr('noYAxis');
        const noColor = getNoAttr('noColor');
        const noRadius = getNoAttr('noRadius')

        // Numeric columns.  These are most useful when analyzing metrics.
        //
        const numerics = [].concat.apply([], metadata.getNumerics().filter(i => {
          return !noAxis.hasOwnProperty(i) &&
            (control!=='xAxis' || !noXAxis.hasOwnProperty(i)) &&
            (control!=='yAxis' || !noYAxis.hasOwnProperty(i)) &&
            (control!=='colorAxis' || !noColor.hasOwnProperty(i)) &&
            (control!=='radiusAxis' || !noRadius.hasOwnProperty(i));
        }).map(i => {
          return [
            {col: i, alias: metadata.getAlias(i)},
          ];
        }));

        // If the current datapoint is a date, then it's
        // a valid x or y axis choice
        //
        const getDateRec = function(control){
          if( control=='xAxis' || control=='yAxis' ){
            if( metadata.hasAttributeValue(datapointCol, 'type', 'Date') ){
              return [{
                col: datapointCol, alias: metadata.getAlias(datapointCol)
              }];
            }
          }
          return [];
        }

        // The counts of categorical values.  These are useful when
        // determining highest impact of classifications.
        //
        const categoricals = 
            metadata.getCategoricalList(categoricalValues, 'noAxis');

        return numerics
          .concat(getDateRec(control))  // If datapoint is date, 
                                        // allow it to be a choice
          .concat(categoricals)
          .sort(utils.sorter('alias'));
      }

      case 'animate':

        return [{col: 'None', alias: 'None'}].concat(
          metadata.getColumnsWithAttrTrue('animation').map(function(x){
            return {col: x, alias: metadata.getAlias(x)};
          }).sort(utils.sorter('alias'))
        );
    }
  }

  // Return 'true' if 'alias' represents the default pivot value
  //
  const isDefaultPivotValue = function(control, col, alias){
    const dflts = {
      xAxis: 'defaultXValue',
      yAxis: 'defaultYValue',
      colorAxis: 'defaultColorValue',
      radiusAxis: 'defaultRadiusValue',
    };
    if( dflts.hasOwnProperty(control) ){
      const dfltValue = metadata.getAttrValue(col, dflts[control]);
      const pivot = dfltValue === 'self' ? alias : metadata.getAlias(col) + ':' + dfltValue;
      return !!(dfltValue && pivot===alias);
    }
    return false;
  }

  // This returns the initial state of all of the controls.
  //
  // By default, the initial selections will be the 0th one in the list of
  // choices.
  //
  const getInitControlState = function(categoricalValues, datapointCol,
      graphtype){
    return [ 'xAxis', 'yAxis', 'colorAxis', 'radiusAxis', 
        'animate', 'datapoint', 'graphtype' ].reduce(function(v1, control){

      const choices = getControlChoices(graphtype, control, categoricalValues, datapointCol);
      switch( control ){
        case 'graphtype': {
          const dflt = choices.length>0 ? choices[0] : '';
          const choice = choices.reduce((i, j) => {
            return (j.col === graphtype) ? j : i;
          }, dflt);

          // Note that this control returns the "column" (actually, just
          // a virtualized name for the chart type)
          //
          return {...v1, graphtype: choice.col};
        }
          
        case 'animate': {
          const choice = choices.length>0 ? choices[0] : '';

          // Note that this control returns the alias
          //
          return {...v1, animate: choice.alias};
        }

        case 'datapoint': {
          const selected = choices.reduce(function(v3, v4, i){
            return v4.col === datapointCol ? i : v3;
          }, 0);
          const choice = choices.length>0 ? choices[selected] : '';

          // Note that the datapoint returns the column, not the alias
          //
          return {...v1, datapoint: choice.col};
        }

        case 'xAxis':
        case 'yAxis':
        case 'radiusAxis':
        case 'colorAxis': {
          const selected = choices.reduce(function(v3, v4, i){
            const sel = isDefaultPivotValue(control, v4.col, v4.alias);
            return sel? i : v3;
          }, 0);
          const choice = choices.length>0 ? choices[selected] : '';

          // Note that these controls return the alias
          //
          return {...v1, ...{[control]: choice.alias}};
        }
      }
    }, {});
  }

  // Return the set of control choices that are React-friendly.
  //
  const getReactControlChoices = function(graphtype, control, state,
       categoricalValues, datapointCol, geoCols){
    const enabled = isEnabled(graphtype, control);

    switch( control ){
      case 'animate':

        // 'animate' has the interesting rule that a value other than the 0th
        // one is allowed only if the widget is enabled.  This will, e.g.,
        // set Animation to None if graphtype isn't 'bubble'.
        //
        return getControlChoices(graphtype, control, categoricalValues, datapointCol)
          .map(function(x, i){
            return {
              checked: enabled? (x.col==state[control]): (i==0),
              label: x.alias,
              value: x.col,
              disabled: !enabled,
            }
          });
      case 'datapoint':
        return getControlChoices(graphtype, control, categoricalValues, datapointCol)
          .map(function(x){

            // The datapoint control has a special rule when graphtype is 
            // "map": it only allows columns that are in getGeoCols().
            //
            const disabled = !enabled || 
                (graphtype=="map" && !geoCols.hasOwnProperty(x.col));
            return {
              name: x.col,
              label: x.alias,
              disabled: disabled,
              selected: x.col==state[control],
            }
          });
      case 'xAxis':
      case 'yAxis':
      case 'radiusAxis':
      case 'colorAxis':
        return getControlChoices(graphtype, control, categoricalValues, datapointCol)
          .map(function(x){
            return {
              name: x.alias,
              label: x.alias,
              disabled: !enabled,
              selected: x.alias==state[control],
            };
          });
        
      default:
        return [];
    }
  }

  // Return the externally visible functions
  //
  return {
    getGraphtypeDefault,
    getGraphtypeControls,
    getReactControlChoices,
    isEnabled,
    getInitControlState
  }
}();

export default controls;
