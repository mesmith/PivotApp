import rootReducer from './reducers';
import thunkMiddleware from 'redux-thunk';
import {createStore, applyMiddleware, compose} from 'redux';

export default createStore(
  rootReducer,
  compose(applyMiddleware(thunkMiddleware),
    window.devToolsExtension ? window.devToolsExtension({ name: 'cc-pivot' }) : f => f)
);
