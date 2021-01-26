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
if (false) {
  startup.startup().then(function(result) {
    const { dataset, categoricalValues, drawingData, cookedData } = result;
    ReactDOM.render(
      <Provider store={store}>
        <PivotApp key={dataset} dataset={dataset} data={cookedData}
            showDataset={true} initCategoricalValues={categoricalValues} />
      </Provider>, document.getElementById('root'));
  });
}

  // This will display the Loading icon
  //
  // ReactDOM.render( 
    // <Provider store={store}>
      // <PivotApp />
    // </Provider>, document.getElementById('root'));
  ReactDOM.render( 
    <Provider store={store}>
      <PivotApp needData={true} showDataset={true} />
    </Provider>, document.getElementById('root'));
}
