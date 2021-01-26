import {combineReducers} from 'redux';
import pivotReducer from './pivotReducer';

const rootReducer = combineReducers({
  pivot: pivotReducer
});

export default rootReducer;
