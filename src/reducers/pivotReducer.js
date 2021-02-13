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

// Given current state, merge newState into it
//
const getMergedState = function(state, newState){
  const current = state.current;
  const currentState = state.history[current];
  const mergedState = {...currentState, ...newState};
  const history = Object.assign([], state.history, {[current]: mergedState});
  return { history, current };
}

export default function(state = initialState, action) {
  switch( action.type ){
    case actionTypes.pivot_PushState:
    {
      const newState = {...action.state, last: 'init'};
      return getNewState(state, newState);
    }

    case actionTypes.pivot_MergeState:
    {
      const newState = {...action.state, last: 'init'};
      return getMergedState(state, newState);
    }

    case actionTypes.pivot_ChangeDataset:
    {
      // For this one, we don't push a new state onto history;
      // instead, just record the new dataset name.  The component
      // will know to ask for the new dataset's data.
      //
      const newState = {last: 'change_dataset'};
      return {...getNewState(state, newState), dataset: action.dataset};
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

    case actionTypes.pivot_PressButton:
    {
      // Special rules for Undo and Redo.  The change_dataset record
      // should be skipped, since we already have the data for
      // the dataset.
      //
      switch( action.button ){
        case "Undo": {
          const prev = state.current > 0 ? state.current - 1 : 0;
          const prevRec = state.history[prev];
          const prev2 = (prevRec.last === 'change_dataset')
            ? (prev > 1? prev - 1 : 0)
            : prev;

          return {...state, current: prev2};
        }
        case "Redo": {
          const next = state.current < state.history.length - 1 ?
              state.current + 1 : state.current;
          const nextRec = state.history[next];
          const next2 = (nextRec.last === 'change_dataset')
            ? (next < state.history.length - 1 ? next + 1 : next)
            : next;
          return {...state, current: next2};
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
