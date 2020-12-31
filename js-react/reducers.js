// Redux reducers are here
//
const reducers = function(){

  const controls = function(state, action){

    // Check for initial state
    //
    if( state===undefined ){
      state = {history: [], current: -1};
    }
    switch( action.type ){
      case 'CHANGE_DATASET':
      {
        const currentState = state.history[state.current];
        const changed = { dataset: action.dataset, datapoint: null };
        const newState = {...currentState, ...changed, last: 'dataset'};
        return getNewState(state, newState);
      }

      case 'CHANGE_DATASET_AND_DATAPOINT':
      {
        const { dataset, datapoint } = action;
        const changed = { dataset, datapoint };
        const currentState = state.history[state.current];
        const state2 = {...currentState, ...changed};
        const aState = state2.graphtype!=="bubble" ? {animate: "None"} : {};
        const newState = {...currentState, ...changed, ...aState,
            last: 'dataset_and_datapoint'};
        return getNewState(state, newState);
      }

      case 'CHANGE_CONTROL':
      {
        const changed = {[action.name]: action.value};

        // Business rule: Unless we're graphtype "bubble",
        // we don't animate.  "animate: 'None'" means "do not animate".
        //
        const currentState = state.history[state.current];
        const state2 = {...currentState, ...changed};
        const aState = state2.graphtype!=="bubble" ? {animate: "None"} : {};
        const newState = {...currentState, ...changed, ...aState,
            last: action.name};
        return getNewState(state, newState);
      }

      case 'CHANGE_FILTER':
      {
        const oldState = state.history[state.current];
        const filterState =
            {...oldState, filter: action.filter, last: 'filter'};
        return getNewState(state, filterState);
      }

      case 'CHANGE_QUERY':  // contains a filter and a set of controls
      {
        const oldState = state.history[state.current];
        const withFilter =
            {...oldState, filter: action.query.filter, last: 'query' };
        const withControls = {...withFilter, ...action.query.controls};
        const withCatValues = {
          ...withControls, 
          categoricalValues: action.query.categoricalValues
        };
        return getNewState(state, withCatValues);
      }

      case 'PRESS_BUTTON':  // Support Undo/Redo buttons
      {
        switch( action.button ){
          case "Undo": {
            const prev = state.current>0? state.current-1 : 0;
            return {...state, current: prev};
          }
          case "Redo": {
            const next = state.current<state.history.length-1 ?
                state.current+1 : state.current;
            return {...state, current: next};
          }
          default:     return state;
        }
      }

      case 'CHANGE_LOAD':  // What-If scenarios
      {
        const currentState = state.history[state.current];
        const changed = { loadTable: action.loadTable };
        const newState = {...currentState, ...changed, last: 'change_load'};
        return getNewState(state, newState);
      }

      default:
        return state;
    }
  }

  // Given an existing 'state' and the 'newState', arrange things so that
  // the history and the current state within that history are set properly.
  //
  const getNewState = function(state, newState){
    const current = state.current;
    const history = state.history.slice(0, current+1);
    return { history: history.concat(newState), current: state.current+1 };
  }

  return {
    controls,
  }
}();

module.exports = reducers;
