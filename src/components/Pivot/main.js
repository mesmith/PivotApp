import React from 'react';
import ReactDOM from 'react-dom';
import {createStore} from 'redux';
import {Provider} from 'react-redux';

import PivotApp from './app.js';
import metadata from './metadata.js';
import store from '../../store';

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
  const dataset = metadata.getActualDataset();
  ReactDOM.render( 
    <Provider store={store}>
      <PivotApp dataset={dataset} needData={true} showDataset={true} />
    </Provider>, document.getElementById('root'));
}
