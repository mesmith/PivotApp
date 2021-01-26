// A class of functions that support a single data point
//
import metadata from './metadata.js';
const datapoint = function(){

  // Return the binning function for a single data point
  //
  const getBinningFn = function(datapointCol){
    return getDatapointRep(datapointCol).binningInternalFn;
  }

  const applyNullCheck = function(datum){
    return ( datum==null || datum=='' ) ? '(null)' : datum;
  }

  // Given a datum representing the datapoint's key value,
  // return its external representation.
  //
  // Blank values and null values are converted to '(null)'.
  //
  function formatDatapointRep(datapointCol, datum){
    const datapointRep = getDatapointRep(datapointCol);
    const applyBinner = function(datapointRep, datum){
      return datum!=null && datapointRep.binningExternalFn!=null && 
          datapointRep.binningExternalFn(parseInt(datum)) || datum;
    }
    return applyNullCheck(applyBinner(datapointRep, datum));
  }

  // Determine if 'datum' is a datapoint rep with an external
  // representation function.  If so, return the result of
  // that function on 'datum'.  
  // Otherwise, just return 'datum'.
  // The function also returns '(null)' if it would return ''.
  //
  function coerceToDatapointRep(datapointCol, column, datum){
    const datapointRep = getDatapointRep(datapointCol);
    const applyFormat = function(datapointRep, column, datum){
      return column==datapointRep.column ? 
          formatDatapointRep(datapointCol, datum) : datum;
    }

    return applyNullCheck(applyFormat(datapointRep, column, datum));
  }

  // Return a datapoint representation object, given the datapoint 'column'
  //
  const getDatapointRep = function(column){
    const binner = metadata.getBinnerObject(column);
    return {
      column: column,
      binningInternalFn: binner && binner.internal || null,
      binningExternalFn: binner && binner.external || null,
    }
  }

  // Return the default datapoint column, or null if there isn't one
  //
  const getDefaultDatapointCol = function(){
    const cols = metadata.getColumnsWithAttrTrue('defaultDatapoint');
    return cols.length > 0 ? cols[0] : null;
  }

  return {
    getBinningFn,
    formatDatapointRep,
    coerceToDatapointRep,
    getDefaultDatapointCol,
  };
}();

export default datapoint;
