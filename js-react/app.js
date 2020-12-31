// Turning off eslint warnings:
/* global d3 */
//
import React from 'react';
import { hot } from 'react-hot-loader/root';
import { Loader } from 'react-overlay-loader';
import 'react-overlay-loader/styles.css';

import ForceChart from './forcechart.js';
import Facets from './facetchart.js';
import LineChart from './linechart.js';
import ParetoChart from './paretochart.js';
import MapChart from './mapchart.js';
import SummaryChart from './summary.js';
import WhatIfChart from './whatif.js';
import ModelChart from './modelchart.js';
import RadioGroup from './radio.js';
import Select from './select.js';
import SelectDataset from './select-dataset.js';
import Button from './button.js';

import actions from './actions.js';
import controls from './controls.js';
import datapoint from './datapoint.js';
import dataread from './dataread.js';
import metadata from './metadata.js';
import facets from './facets.js';
import transforms from './transforms.js';
import constants from './constants.js';

const d3top = 'visualisation';     // ID of dom element where we do D3

// Control/selection prototypes
//
const datasetControls = {
  id: 'dataset',
  name: 'dataset',
  label: 'Select a dataset',
  headerClass: 'dataset',
  disabled: false,
  list: [],
};

const dfltControls = {
  animate: {
    id: 'a-axis',
    name: 'animate',
    label: 'Time Animation',
    headerClass: 'header',
    disabled: false,
    list: [],
  },
  datapoint: {
    id: 'datapoint',
    name: 'datapoint',
    label: 'Aggregate By',
    headerClass: 'header',
    disabled: false,
    list: [],
  },
  xAxis: {
    id: 'x-axis',
    name: 'xAxis',
    label: 'X Axis',
    headerClass: 'header',
    disabled: false,
    list: [],
  },
  yAxis: {
    id: 'y-axis',
    name: 'yAxis',
    label: 'Y Axis',
    headerClass: 'header',
    disabled: false,
    list: [],
  },
  radiusAxis: {
    id: 'r-axis',
    name: 'radiusAxis',
    label: 'Size',
    headerClass: 'smallheader',
    disabled: false,
    list: [],
  },
  colorAxis: {
    id: 'c-axis',
    name: 'colorAxis',
    label: 'Color',
    headerClass: 'smallheader',
    disabled: false,
    list: [],
  }
};

// This initializes the D3 dom container.  The React <*Chart> components
// will draw D3 DOM into the container.
//
function initD3(){
  d3.select('#' + d3top)
    .attr("pointer-events", "all");  // Make pointer events work
                                     // (force graph)
}

// Return the datapoint column, used when getting original data and then
// potentially transforming it.
//
// If the dataset specifies its datapoint, it means that this is a simulated
// dataset and we need to use the datapoint from the original dataset.
// Otherwise, we use the redux state if it's been set (presumably through
// the "Aggregate By" control).  Finally, if none of the above is true,
// just get the default datapoint.
//
const getDatapointCol = function(reduxStore){
  const datapointForDataset = metadata.getDatasetAttr('datapointCol');
  const datapointForReduxStore = getReduxStoreDatapoint(reduxStore);
  const dfltDatapoint = datapoint.getDefaultDatapointCol();
  return datapointForDataset || datapointForReduxStore || dfltDatapoint;
}

// Return the datapoint in the current state, from the Aggregate By control.
//
const getReduxStoreDatapoint = function(reduxStore) {
  const state = reduxStore && getCurrentState(reduxStore);
  return state && state.hasOwnProperty('datapoint') && state.datapoint || null;
}

// Return the datapoint col that is used when transitioning from one dataset
// to another.  In that case, the reduxStore may not contain the datapoint
// col we want to return, in the case where the new dataset is a simulated
// dataset.  Tricky.
//
const getInitDatapointCol = function() {
  const colForDataset = metadata.getDatasetAttr('datapointCol');
  const dfltDatapointCol = datapoint.getDefaultDatapointCol();
  return colForDataset || dfltDatapointCol;
}

class App extends React.Component {
  constructor(props){
    super(props);

    this.getInitState = this.getInitState.bind(this);
    this.initMongoState = this.initMongoState.bind(this);

    const { reduxStore, dataset, data, initCategoricalValues } = props;

    // Constructors must set initial state synchronously.  For Mongo,
    // this means that the initial render() does not contain any
    // data yet, since it's async.
    //
    const initState = this.getInitState(dataset, reduxStore, data, 
        initCategoricalValues, null);
    this.state = { ...initState, props: this.props };
  }

  getInitState(dataset, reduxStore, data, categoricalValues, datapointCol) {
    if (!dataset) return;
    if( isCSV(dataset) ){
      return this.transformCSVState(this, reduxStore, data, categoricalValues,
          datapointCol);
    } else {
      return this.initMongoState(reduxStore, data, categoricalValues,
          datapointCol);
    }
  }

  // Return the choices for the dataset, given the current redux store and
  // the list of all datasets from metadata.
  //
  // If we're currently using a synthetic dataset, we use the name of
  // its "actual" dataset.  Synthetic datasets don't appear in the list.
  //
  getDatasetChoices(reduxStore){
    const dataset = metadata.getActualDataset(reduxStore);
    return metadata.getAllDatasets().map(i => {
      return {...i, label: i.alias, selected: i.name === dataset};
    });
  }

  // Return the enabled/disabled state for every control for 'graphtype'
  //
  getAllEnabled(graphtype){
    return Object.keys(dfltControls).reduce(function(i, j){
      return {...i, ...{[j]: controls.isEnabled(graphtype, j)}};
    }, {});
  }

  // Return the choices for every control
  //
  getAllControlChoices(graphtype, state, categoricalValues, datapointCol){
    const geoCols = metadata.getGeoCols().reduce(function(v1, v2){
      return {...v1, ...{[v2]: true}};
    }, {});

    return Object.keys(dfltControls).reduce(function(v1, v2){
      const value = controls.getReactControlChoices(graphtype, v2,
          state, categoricalValues, datapointCol, geoCols);
      return {...v1, ...{[v2]: value}};
    }, {});
  }

  // Return the disabled state for every control
  //
  getAllControlDisabled(graphtype){
    return Object.keys(dfltControls).reduce(function(v1, v2){
      const dis = !controls.isEnabled(graphtype, v2);
      return {...v1, ...{[v2]: dis}};
    }, {});
  }

  componentDidMount(){
    initD3();
    const self = this;
    const { data, d3config, reduxStore } = this.state.props;
    if (!reduxStore) return;

    // Hook into Redux state.  FIXME: Use react-redux connect() instead.
    //
    reduxStore.subscribe(function() {
      const reduxState = getCurrentState(reduxStore);
      const action = reduxState.last;

      // If this is a query change, it just indicates a change in redux
      // state at dataset init time, so we don't need to re-read
      // the database.
      //
      if (action === 'query') {
        return;
      }

      // If this is an axis change, just set the axis state.  This 
      // will cause a re-render without re-reading the database.
      //
      if (action === 'xAxis' || action === 'yAxis' || 
          action === 'radiusAxis' || action === 'colorAxis') {
        const graphtype = reduxState.graphtype || controls.getGraphtypeDefault();
        const categoricalValues = reduxState.categoricalValues;
        const datapointCol = getReduxStoreDatapoint(reduxStore);
        const enabled = self.getAllEnabled(graphtype);
        const choices = self.getAllControlChoices(graphtype, reduxState,
            categoricalValues, datapointCol);
        const list = choices[action];
        const disabled = !enabled[action];
        const newAxisState = {...self.state[action], disabled, list};
        self.setState({[action]: newAxisState, axes: reduxState});

        return;
      }

      // We'll go to the database when other things change (e.g.
      // the dataset, causing a data source change; or the
      // datapoint, which forces re-pivot of the source data).
      //
      self.setState({ loading: true });
      const dataset = reduxState.dataset || metadata.getInitDataset();
      const categoricalValues = reduxState.categoricalValues;

      // Determine if the dataset changed.  If so, read in the new
      // dataset, and then call the onNewDatasetRead() handler on
      // the new data.
      //
      // Note that we use the "actual dataset", since the
      // dataset may be synthetic (e.g. a time series based on an aggregation
      // of time series by entity).
      //
      if (metadata.getDataset() !== dataset){
        metadata.setMetadata(dataset);

        const actualDataset = metadata.getActualDataset();
        const filter = metadata.getFilters();
        const handler = self.onNewDatasetRead.bind(self, d3config, reduxStore);
        const loadTable = reduxState.loadTable;
        const datapointCol = getDatapointCol(reduxStore);

        // Doing this will cause the datapoint
        // control to re-render with the new datapoint choice
        // (if the user chose a new one), prior to reading the new data.
        // Just a bit nicer.
        //
        const graphtype = reduxState.graphtype || controls.getGraphtypeDefault();
        const enabled = self.getAllEnabled(graphtype);
        const choices = self.getAllControlChoices(graphtype, reduxState,
            categoricalValues, datapointCol);
        const datapoint = {...dfltControls.datapoint, 
            disabled: !enabled.datapoint, list: choices.datapoint};
        self.setState({datapoint});

        dataread.readDataset(handler, actualDataset, filter, loadTable,
            datapointCol);
      }

      // CSV state is returned synchronously;
      // Mongo state is returned via an async call
      //
      else if( isCSV(dataset) ){
        self.setState(self.transformCSVState(self, reduxStore,
            data, categoricalValues, null));
        self.setState({ loading: false });
      } else {
        self.transformMongoState(self, reduxStore, d3config,
            categoricalValues).then(function(newState){
          self.setState(newState);
          self.setState({ loading: false });
        });
      }
    });
  }

  // Called after dataset changes and new data is read in.
  //
  // Dispatch action to initialize dataset.
  // The action will reset the filter and the selection controls.
  //
  onNewDatasetRead(d3config, reduxStore, dataset, categoricalValues, rawData, data){
    const reduxState = getCurrentState(reduxStore);

    // OK, this is pretty confusing.  We must calculate two datapoints:
    // one for the original dataset, and another one for the synthetic one
    // (if there is one).
    //
    // We want to support filtering from the original
    // dataset (since that's where we use the RESTful interface, and besides,
    // it seems to feel right to do that).
    //
    const dfltDatapointCol = datapoint.getDefaultDatapointCol();
    const originalDatapointCol = metadata.getDatasetAttr('datapointCol') ||
        dfltDatapointCol;
    const datapointCol = reduxState.datapoint || dfltDatapointCol;

    // If the dataset has a default graphtype, set it here
    //
    const datasetGraphtype = metadata.getDatasetAttr('graphtype', null);
    const graphtype = datasetGraphtype || reduxState.graphtype;

    const initControlState = controls.getInitControlState(categoricalValues,
        datapointCol, graphtype);
    const filter = metadata.getFilters();

    const newControls = Object.keys(initControlState).reduce((i, j) => {
      return {...i, ...{[j]: initControlState[j]}};
    }, {});

    // Here's where we force redux state to change.
    //
    const query = {filter, categoricalValues, controls: newControls};
    reduxStore.dispatch(actions.changeQuery(query));

    // Here, we change app state.
    //
    const loadTable = reduxState.loadTable;
    const summaryData = transforms.getSummaryData(data);
    const loadComparisonData = transforms.getLoadComparisonData(data);

    // Note that we use originalDatapointCol here.  We want to
    // allow filtering based on the data in the original dataset.
    //
    const facetList = facets.getReactFacets(rawData,
      filter, originalDatapointCol, categoricalValues);

    const initState = this.getInitState(dataset, reduxStore, data,
        categoricalValues, datapointCol);
    const props = { dataset, data, categoricalValues, reduxStore, d3config };
    const newState = {
        ...initState,
        props,
        loading: false,
        summaryData,
        loadComparisonData,
        facet: {list: facetList, filter, datapointCol}
    };
    this.setState(newState);
  }

  // Called when a new Redux state is available.
  // Return a state suitable for the <App/> component.
  //
  transformCSVState(self, reduxStore, data, categoricalValues, dfltDatapointCol){
    const reduxState = getCurrentState(reduxStore);
    const graphtype = reduxState.graphtype || controls.getGraphtypeDefault();
    const datapointCol = dfltDatapointCol || reduxState.datapoint;
    const animationCol = reduxState.animate;
    const loadTable = reduxState.loadTable;
    const filter = reduxState.filter || {};
    const datasetChoices = self.getDatasetChoices(reduxStore);

    // Transform raw data, so we can set the Refine Results state
    //
    const xform = transforms.getTransformedData(graphtype, data,
        filter, datapointCol, animationCol, constants.d3geom);
    const summaryData = transforms.getSummaryData(xform.drawingData);
    const loadComparisonData = transforms.getLoadComparisonData(xform.drawingData);
    const facetList = facets.getReactFacets(xform.facetData,
        filter, datapointCol, categoricalValues);
    const controlState = this.getControlState(reduxState, graphtype, 
        categoricalValues, datapointCol);

    return {
      dataset: {...datasetControls, list: datasetChoices},
      graphtype: controls.getGraphtypeControls(graphtype, datapointCol),

      ...controlState,

      facet: {
        list: facetList, filter: filter, datapointCol: datapointCol
      },
      tooltipPivots: categoricalValues,
      drawingData: xform.drawingData,
      summaryData, // currently untested for CSV
      loadComparisonData, // currently untested for CSV
      axes: reduxState,
      loadTable
    }
  }

  // Do a simple initialization.  Needed because the initial call
  // to get Mongo data is async, and render() needs to run with
  // something.
  //
  initMongoState(reduxStore, data, categoricalValues, dfltDatapointCol){
    const reduxState = getCurrentState(reduxStore);
    const graphtype = reduxState.graphtype || controls.getGraphtypeDefault();
    const datapointCol = dfltDatapointCol || reduxState.datapoint;
    const loadTable = reduxState.loadTable;
    const filter = reduxState.filter || {};
    const facetList = facets.getReactFacets(data, filter, datapointCol,
        categoricalValues);
    const summaryData = transforms.getSummaryData(data);
    const loadComparisonData = transforms.getLoadComparisonData(data);

    const datasetChoices = this.getDatasetChoices(reduxStore);
    const controlState = this.getControlState(reduxState, graphtype, 
        categoricalValues, datapointCol);

    return {
      dataset: {...datasetControls, list: datasetChoices},
      graphtype: controls.getGraphtypeControls(graphtype, datapointCol),

      ...controlState,

      facet: {
        list: facetList, filter: filter, datapointCol: datapointCol
      },
      tooltipPivots: categoricalValues,
      drawingData: data,
      summaryData,
      loadComparisonData,
      axes: reduxState,
      loadTable
    };
  }

  // Return the state of all Select controls
  //
  getControlState(reduxState, graphtype, categoricalValues, datapointCol) {
    const enabled = this.getAllEnabled(graphtype);
    const choices = this.getAllControlChoices(graphtype, reduxState,
        categoricalValues, datapointCol);
    return Object.keys(dfltControls).reduce((i, j) => {
      const obj = {[j]: {...dfltControls[j], disabled: !enabled[j], list: choices[j]}};
      return {...i, ...obj};
    }, {});
  }

  // Similar to the above, but returns state via Mongo call
  //
  transformMongoState(self, reduxStore, d3config, categoricalValues){
    const reduxState = getCurrentState(reduxStore);
    const dataset = metadata.getActualDataset();
    const loadTable = reduxState.loadTable;
    const datasetChoices = self.getDatasetChoices(reduxStore);
    const graphtype = reduxState.graphtype || controls.getGraphtypeDefault();

    // Tricky.  If this is a synthetic dataset (e.g. aisTimeMetadata),
    // then we have to use a predetermined datapoint that's in the metadata.
    // Otherwise, we use the one in the current state.
    //
    const colForDataset = metadata.getDatasetAttr('datapointCol');
    const datapointCol = colForDataset || reduxState.datapoint;

    const filter = reduxState.filter || {};
    const controlState = this.getControlState(reduxState, graphtype, 
        categoricalValues, datapointCol);

    // Use ajax to transform raw data,
    // so we can set the Refine Results state
    //
    return mongoGetTransformedData(graphtype, dataset, filter, datapointCol)
        .then(function(xform){
      const data = dataread.process(xform.drawingData, loadTable);

      const summaryData = transforms.getSummaryData(data);
      const loadComparisonData = transforms.getLoadComparisonData(data);
      const facetList = facets.getReactFacets(xform.facetData,
          filter, datapointCol, categoricalValues);

      // Calculating the graphtype disabled state requires that we look at
      // the currently displayed Aggregate By datapoint, *not* the predetermined
      // datapoint from the metadata (when using a synthetic dataset).
      //
      const datapointForGraphtype = reduxState.datapoint;
      return {
        dataset: {...datasetControls, list: datasetChoices},
        graphtype: controls.getGraphtypeControls(graphtype, datapointForGraphtype),

        ...controlState,

        tooltipPivots: categoricalValues,
        drawingData: data,

        summaryData,
        loadComparisonData,
        facet: {list: facetList, filter, datapointCol},

        axes: reduxState,
        loadTable
      }
    });
  }

  render(){
    const { d3config, reduxStore } = this.state.props;

    // When the app is starting up, there is not reduxStore yet.
    // We want to just show the Loading icon while the initial
    // data is being read in.
    //
    if (!reduxStore) {
      return (
        <div className="all">
          <Loader fullPage loading={true} />
        </div>
      );
    }

    // Note that we get the datapoint from the current state.  If this
    // is a simulated dataset, then the redux state will pull the data
    // out of that simulated dataset (unlike the API, which uses the
    // datapoint from the original dataset, not the simulated one).
    // Tricky.
    //
    const datapointCol = getReduxStoreDatapoint(reduxStore);

    const { loading } = this.state;
    const reduxState = getCurrentState(reduxStore);
    const graphtype = reduxState && reduxState.graphtype || null;
    const categoricalValues = reduxState && reduxState.categoricalValues || null;
    const animateVal = this.state.axes.animate;
    const current = reduxStore.getState().current;
    const history = reduxStore.getState().history;
    const anyPrev = current > 0;
    const anyNext = current < history.length-1;
    const datasetLabel = metadata.getDatasetLabel();
    const datasetMonths = metadata.getDatasetMonths();
    const subtitle = metadata.getDatasetSubtitle();
    const disabledMap = metadata.getDatasetDisabled().reduce((i, j) => {
      return {...i, ...{[j]: true}};
    }, {});
    const summaryData = this.state.summaryData;
    const loadComparisonData = this.state.loadComparisonData;
    const model = metadata.getDatasetModel();
    const hasAnimation = process.env.CUSTOMER !== 'ais';

    const chartProps = {
      drawingData: this.state.drawingData,
      tooltipPivots: categoricalValues,
      datapointCol: datapointCol,
      axes: this.state.axes,
    };
    const title = 'Visualizing ' + datasetLabel + ' Data';

    return (
      <div key={datasetLabel} className="all">
        <Loader fullPage loading={loading} />
        <div>
          <div className="title">
            <h1>{title}</h1>
            <h2>{subtitle} (build date: {__COMMIT_DATE__})</h2>
          </div>
          <SelectDataset reduxStore={reduxStore} value={this.state.dataset} />
        </div>
        <div className="top">
          <div className="control">
            <svg id={d3top} width={d3config.WIDTH}
                height={d3config.HEIGHT+50}>
              <MapChart
                  reduxStore={reduxStore}
                  d3top={d3top}
                  d3config={d3config}
                  value={chartProps}
                  show={graphtype=="map" && animateVal=="None"}/>
              <ForceChart
                  reduxStore={reduxStore}
                  d3top={d3top}
                  d3config={d3config}
                  value={chartProps}
                  show={(graphtype=="force" || graphtype=="forceStatus") &&
                      animateVal=="None"}/>
              <LineChart
                  reduxStore={reduxStore}
                  d3top={d3top}
                  d3config={d3config}
                  value={chartProps}
                  loading={loading}
                  show={(graphtype=="line" || graphtype=="bubble")}/>
              <ParetoChart
                  reduxStore={reduxStore}
                  d3top={d3top}
                  d3config={d3config}
                  value={chartProps}
                  loading={loading}
                  show={(graphtype=="pareto")}/>
            </svg>
          </div>
        </div>

        <form id="react-controls" className="control-form" style={{clear: "both"}}>
          <div className="control-container">
            <RadioGroup reduxStore={reduxStore}
                value={this.state.graphtype} />
            { !disabledMap.hasOwnProperty('animate') && hasAnimation &&
              ( <RadioGroup reduxStore={reduxStore}
                  value={this.state.animate} /> )
            }
            <div id="select1" className="control select-1">
              <Select reduxStore={reduxStore} value={this.state.datapoint} />
              <Select reduxStore={reduxStore} value={this.state.xAxis} />
              <Select reduxStore={reduxStore} value={this.state.yAxis} />
            </div>
            <div id="select2" className="control select-2">
              <Select reduxStore={reduxStore}
                  value={this.state.radiusAxis} />
              <Select reduxStore={reduxStore}
                  value={this.state.colorAxis} />
              <div className="control" style={{marginLeft: '70px'}}>
                <Button reduxStore={reduxStore} value="Undo"
                    label="Previous Viz" show={anyPrev}/>
                <Button reduxStore={reduxStore} value="Redo"
                    label="Next Viz" show={anyNext}/>
              </div>
            </div>
          </div>
        </form>

        { model==='callCenter' && (
          <div className="summary-container">
            <div className="summaries">
              <Facets reduxStore={reduxStore} value={this.state.facet}/>
            </div>
            <div className="summaries">
              <SummaryChart show={true} data={summaryData} />
              <ModelChart show={true} data={summaryData} months={datasetMonths}
                  loadComparisonData={loadComparisonData} />
              <WhatIfChart show={true} reduxStore={reduxStore}
                  value={chartProps} />
            </div>
          </div>
        )}
        { model!=='callCenter' && (
          <div className="summary-container">
            <div className="summaries">
              <Facets reduxStore={reduxStore} value={this.state.facet}/>
            </div>
          </div>
        )}
      </div>
    )
  }
}

// Stub for mongo transformed data.  WILL NOT WORK for force graphs.
//
function mongoGetTransformedData(graphtype, dataset, filter, datapointCol){

  // Convert 'filter' into a REST query string
  //
  const query = getQueryString(filter);

  // For force graphs, we handle the map/reduce in the browser.
  // For other graphs, let mongo do all of the work.
  //
  if( graphtype=="force" || graphtype=="forceStatus" ){
    return new Promise(
      function(resolve, reject){
        const url =
            '/api/pivot/' + encodeURIComponent(dataset) +
            '/' + encodeURIComponent(graphtype) +
            '/' + encodeURIComponent(datapointCol) +
            '?' + query;
        $.ajax({
          url: url,
          success: resolve,
          error: function(xhr, status, err){ reject(err); },
        });
      }
    );
  } else {
    return new Promise(
      function(resolve, reject){
        const url =
            '/api/aggregate/' + encodeURIComponent(dataset) +
            '/' + encodeURIComponent(datapointCol) + '?' + query;
        $.ajax({
          url: url,
          success: function(drawingData){
            resolve({drawingData, facetData: drawingData});
          },
          error: function(xhr, status, err){ reject(err); },
        });
      }
    );
  }
}

// Convert 'filter' into a RESTful query string
//
const getQueryString = function(filter) {
  return [].concat.apply([], Object.keys(filter).map(i => {
    return filter[i].map(j => {
      return i + '=' + j;
    });
  })).join('&');
}

// Return the current state, given a history of states in 'reduxStore'.
// Return 'null' if the current state isn't available
//
const getCurrentState = function(reduxStore){
  if (!reduxStore) return null;

  const fullState = reduxStore.getState();
  if( fullState.history!==undefined && fullState.current!==undefined ){
    const current = +fullState.current;
    const len = fullState.history.length;
    const idx = current<0? 0 : (current>len? current.len-1 : current);
    return fullState.history[idx];
  }
  return null;
}

// Return TRUE if 'dataset' represents a CSV file
//
const isCSV = function(dataset){
  const comps = dataset.split('.');
  return (comps[comps.length-1]==='csv');
}

export default hot(App);
