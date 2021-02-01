import React from 'react';
import ReactDOM from 'react-dom';
import {createStore} from 'redux';
import {Provider} from 'react-redux';

import startup from './startup.js';

import PivotApp from './app.js';

import controls from './controls.js';
import datapoint from './datapoint.js';
import dataread from './dataread.js';
import metadata from './metadata.js';

import reducers from '../../reducers';
import store from '../../store';
import actions from '../../actions';

import constants from './constants.js';
import config from './config.js';

// Turns off eslint warnings:
/* global d3 */

if (module.hot) { 
  module.hot.accept();
}

// After initial DOM loading, initialize the dataset, and
// display the Loading icon.
//
window.onload = function(){

  // This will display the Loading icon
  //
  const datasetLabel = metadata.getDatasetLabel();
  ReactDOM.render( 
    <Provider store={store}>
      <PivotApp key={datasetLabel} needData={true} showDataset={true} />
    </Provider>, document.getElementById('root'));
}
