import actionTypes from '../actionTypes';
import initialState from '../initialState';

// Given an existing 'state' and the 'newState', arrange things so that
// the history and the current state within that history are set properly.
//
const getNewState = function(state, newState){
  const current = state.current;
  const history = state.history.slice(0, current+1);
  return { history: history.concat(newState), current: state.current+1 };
}

export default function(state = initialState, action) {
  switch( action.type ){
    case actionTypes.pivot_PushState:
    {
      const newState = {...action.state, last: 'init'};
      return getNewState(state, newState);
    }

    case actionTypes.pivot_ChangeDataset:
    {
      const currentState = state.history[state.current];
      const changed = { dataset: action.dataset, datapoint: null };
      const newState = {...currentState, ...changed, last: 'dataset'};
      return getNewState(state, newState);
    }

    case actionTypes.pivot_ChangeDatasetAndDatapoint:
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

    case actionTypes.pivot_ChangeControl:
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

    case actionTypes.pivot_ChangeFilter:
    {
      const oldState = state.history[state.current];
      const filterState =
          {...oldState, filter: action.filter, last: 'filter'};
      return getNewState(state, filterState);
    }

    case actionTypes.pivot_ChangeQuery:  // contains a filter and a set of controls
    {
      const oldState = state.history[state.current];
      const { filter, categoricalValues, data, rawData, dataset,
          datapointCol, originalDatapointCol } = action.query;

      const withLast = {...oldState, last: 'query' };
      const withControls = {...withLast, ...action.query.controls};
      const withData = { ...withControls, filter, categoricalValues,
          data, rawData, dataset, datapointCol, originalDatapointCol };
      return getNewState(state, withData);
    }

    case actionTypes.pivot_PressButton:
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

    case actionTypes.pivot_ChangeLoad:
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
