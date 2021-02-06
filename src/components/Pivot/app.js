// Turning off eslint warnings:
/* global d3 */
//
import React from 'react';
import {connect} from 'react-redux';

// import { hot } from 'react-hot-loader/root';
import { Loader } from 'react-overlay-loader';
import 'react-overlay-loader/styles.css';

import PivotContainer from './pivot-container.js';
import SelectDataset from './select-dataset.js';

import actions from '../../actions';
import controls from './controls.js';
import datapoint from './datapoint.js';
import dataread from './dataread.js';
import metadata from './metadata.js';
import facets from './facets.js';
import startup from './startup';
import transforms from './transforms.js';
import constants from './constants.js';
import utils from './utils.js';

import '../../static/colorbrewer.css';
import '../../static/styles.css';
import '../../static/tipsy.css';

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

// Return the datapoint column, used when getting original data and then
// potentially transforming it.
//
// If the dataset specifies its datapoint, it means that this is a simulated
// dataset and we need to use the datapoint from the original dataset.
// Otherwise, we use the redux state if it's been set (presumably through
// the "Aggregate By" control).  Finally, if none of the above is true,
// just get the default datapoint.
//
const getDatapointCol = function(currentState){
  const datapointForDataset = metadata.getDatasetAttr('datapointCol');
  const datapointForReduxStore = getReduxStateDatapoint(currentState);
  const dfltDatapoint = datapoint.getDefaultDatapointCol();
  return datapointForDataset || datapointForReduxStore || dfltDatapoint;
}

// Return the datapoint in the current state, from the Aggregate By control.
//
const getReduxStateDatapoint = function(currentState) {
  return currentState && currentState.hasOwnProperty('datapoint') && currentState.datapoint
    ? currentState.datapoint
    : null;
}

// Return the datapoint col that is used when transitioning from one dataset
// to another.  In that case, the redux state may not contain the datapoint
// col we want to return, in the case where the new dataset is a simulated
// dataset.  Tricky.
//
const getInitDatapointCol = function() {
  const colForDataset = metadata.getDatasetAttr('datapointCol');
  const dfltDatapointCol = datapoint.getDefaultDatapointCol();
  return colForDataset || dfltDatapointCol;
}

// This is a sync operation--it doesn't actually do a Mongo query.
//
const getInitState = function(dataset, currentState, data, categoricalValues,
    datapointCol) {
  if (!dataset) return {};
  if (utils.isCSV(dataset) || utils.isJSON(dataset)) {
    return transformCSVState(currentState, data, categoricalValues,
        datapointCol);
  } else {
    return initMongoState(currentState, data, categoricalValues,
        datapointCol);
  }
}

// Called when a new Redux state is available.
// Return a state suitable for the <PivotApp/> component.
//
const transformCSVState = function(currentState, rawData, categoricalValues,
    dfltDatapointCol){
  const graphtype = currentState.graphtype || controls.getGraphtypeDefault();
  const datapointCol = dfltDatapointCol || currentState.datapoint;
  const animationCol = currentState.animate;
  const loadTable = currentState.loadTable;
  const filter = currentState.filter || {};
  const datasetChoices = getDatasetChoices();

  // Transform raw data, so we can set the Refine Results state
  //
  const xform = transforms.getTransformedData(graphtype, rawData,
      filter, datapointCol, animationCol, constants.d3geom);
  const processedData = dataread.process(xform.drawingData, loadTable);

  const facetList = facets.getReactFacets(processedData,
      filter, datapointCol, categoricalValues);
  const summaryData = transforms.getSummaryData(processedData);
  const loadComparisonData = transforms.getLoadComparisonData(processedData);

  const controlState = getControlState(currentState, graphtype, 
      categoricalValues, datapointCol);
  const axes = getAxesFromState(currentState, controlState);

  return {
    dataset: {...datasetControls, list: datasetChoices},
    graphtype: controls.getGraphtypeControls(graphtype, datapointCol),

    ...controlState,

    facet: { list: facetList, filter, datapointCol },
    tooltipPivots: categoricalValues,
    drawingData: processedData,
    axes,
    summaryData, // currently untested for CSV
    loadComparisonData, // currently untested for CSV
    loadTable
  }
}

  // Return the state of all Select controls
  //
const getControlState = function(currentState, graphtype, categoricalValues,
    datapointCol) {
  const enabled = getAllEnabled(graphtype);
  const choices = getAllControlChoices(graphtype, currentState,
      categoricalValues, datapointCol);
  return Object.keys(controls.dfltControls).reduce((i, j) => {
    const obj = {[j]: {
      ...controls.dfltControls[j],
      disabled: !enabled[j],
      list: choices[j]}
    };
    return {...i, ...obj};
  }, {});
}

// Do a simple initialization.  Needed because the initial call
// to get Mongo data is async, and render() needs to run with
// something.
//
const initMongoState = function(currentState, data, categoricalValues, dfltDatapointCol){
  const graphtype = currentState.graphtype || controls.getGraphtypeDefault();
  const datapointCol = dfltDatapointCol || currentState.datapoint;
  const loadTable = currentState.loadTable;
  const filter = currentState.filter || {};

  const facetList = facets.getReactFacets(data, filter, datapointCol,
      categoricalValues);
  const summaryData = transforms.getSummaryData(data);
  const loadComparisonData = transforms.getLoadComparisonData(data);

  const datasetChoices = getDatasetChoices();
  const controlState = getControlState(currentState, graphtype, 
      categoricalValues, datapointCol);
  const axes = getAxesFromState(currentState, controlState);

  return {
    dataset: {...datasetControls, list: datasetChoices},
    graphtype: controls.getGraphtypeControls(graphtype, datapointCol),

    ...controlState,

    facet: { list: facetList, filter, datapointCol },
    tooltipPivots: categoricalValues,
    drawingData: data,
    axes,
    summaryData,
    loadComparisonData,
    loadTable
  };
}

// Return the choices for the dataset, given the current redux store and
// the list of all datasets from metadata.
//
// If we're currently using a synthetic dataset, we use the name of
// its "actual" dataset.  Synthetic datasets don't appear in the list.
//
const getDatasetChoices = function(){
  const dataset = metadata.getActualDataset();
  return metadata.getAllDatasets().map(i => {
    return {...i, label: i.alias, selected: i.name === dataset};
  });
}

const getAllEnabled = function(graphtype){
  return Object.keys(controls.dfltControls).reduce(function(i, j){
    return {...i, ...{[j]: controls.isEnabled(graphtype, j)}};
  }, {});
}

// Return the choices for every control
//
const getAllControlChoices = function(graphtype, state, categoricalValues,
    datapointCol){
  const geoCols = metadata.getGeoCols().reduce(function(v1, v2){
    return {...v1, ...{[v2]: true}};
  }, {});

  return Object.keys(controls.dfltControls).reduce(function(v1, v2){
    const value = controls.getReactControlChoices(graphtype, v2,
        state, categoricalValues, datapointCol, geoCols);
    return {...v1, ...{[v2]: value}};
  }, {});
}

// Return the disabled state for every control
//
const getAllControlDisabled = function(graphtype){
  return Object.keys(controls.dfltControls).reduce(function(v1, v2){
    const dis = !controls.isEnabled(graphtype, v2);
    return {...v1, ...{[v2]: dis}};
  }, {});
}

// Similar to the above, but returns state via Mongo call
//
const transformMongoState = function(currentState, categoricalValues){
  const dataset = metadata.getActualDataset();
  const loadTable = currentState.loadTable;
  const datasetChoices = getDatasetChoices();
  const graphtype = currentState.graphtype || controls.getGraphtypeDefault();

  // Tricky.  If this is a synthetic dataset (e.g. aisTimeMetadata),
  // then we have to use a predetermined datapoint that's in the metadata.
  // Otherwise, we use the one in the current state.
  //
  const colForDataset = metadata.getDatasetAttr('datapointCol');
  const datapointCol = colForDataset || currentState.datapoint;

  const filter = currentState.filter || {};
  const controlState = getControlState(currentState, graphtype, 
      categoricalValues, datapointCol);

  // Use ajax to transform raw data,
  // so we can set the Refine Results state
  //
  const handle = 
      ((currentState, categoricalValues, loadTable, filter, datapointCol) => xform => {
    const processedData = dataread.process(xform.pivotedData, loadTable);

    const facetList = facets.getReactFacets(processedData, filter, datapointCol,
        categoricalValues);
    const summaryData = transforms.getSummaryData(processedData);
    const loadComparisonData = transforms.getLoadComparisonData(processedData);

    // Calculating the graphtype disabled state requires that we look at
    // the currently displayed Aggregate By datapoint, *not* the predetermined
    // datapoint from the metadata (when using a synthetic dataset).
    //
    const datapointForGraphtype = currentState.datapoint;
    const axes = getAxesFromState(currentState, controlState);
    return {
      dataset: {...datasetControls, list: datasetChoices},
      graphtype: controls.getGraphtypeControls(graphtype, datapointForGraphtype),
      ...controlState,
      tooltipPivots: categoricalValues,
      drawingData: processedData,
      facet: { list: facetList, filter, datapointCol },
      axes,
      summaryData,
      loadComparisonData,
      loadTable
    }
  })(currentState, categoricalValues, loadTable, filter, datapointCol);

  return dataread.mongoGetTransformedData(graphtype, dataset, filter, datapointCol)
      .then(handle)
      .catch(handle);
}

// This converts the currentState into an axes object.
//
// This also may change the axes values that don't
// appear in the control state.  In that case, the first
// axis choice will be selected.
//
const getAxesFromState = function(state, controlState) {
  const axisNames = ['animate', 'colorAxis', 'datapoint',
      'radiusAxis', 'xAxis', 'yAxis'];
  
  // This isn't one of the axes,
  // but it's a control that's passed into drawing routines
  //
  const nonAxis = {graphtype: state.graphtype};

  if (controlState) {
    const newAxes = axisNames.reduce((i, j) => {
      const list = controlState[j].list;
      const oldValue = state[j];
      const valueExists = Array.isArray(list) && list.filter(k => {
        return k.name === oldValue;
      });
      if (valueExists.length === 0) {
        const firstValue = Array.isArray(list) ? list[0].name : null;
        return {...i, ...{[j]: firstValue}};
      } else {
        return {...i, ...{[j]: oldValue}};
      }
    }, {});
    return {...newAxes, ...nonAxis};
  } else {
    const ax = axisNames.reduce((i, j) => {
      return {...i, ...{[j]: state[j]}};
    }, {});
    return {...ax, ...nonAxis};
  }
}

// Return the enabled/disabled state for every control for 'graphtype'
//
class PivotApp extends React.Component {
  constructor(props){
    super(props);

    this.onNewDatasetRead = this.onNewDatasetRead.bind(this);
  }

  // Called when the properties change, presumably because the Redux state changed.
  //
  // Returns the object representing the local state change.
  //
  onReduxStateChange(nextProps) {
    const { currentState } = nextProps;
    const action = currentState.last;
    const { categoricalValues } = currentState;
    const self = this;

    // We'll go to the database when other things change (e.g.
    // the dataset, causing a data source change; or the
    // datapoint, which forces re-pivot of the source data).
    //
    const dataset = currentState.dataset || metadata.getInitDataset();

    //
    // Determine if the dataset changed, which typically happens
    // on Undo (Next View) or Redo (Previous View).  If so, read in the new
    // dataset, and then call the onNewDatasetRead() handler on
    // the new data.
    //
    // Note that we use the "actual dataset", since the
    // dataset may be synthetic (e.g. a time series based on an aggregation
    // of time series by entity).
    //
    // Scenarios where this runs:  
    //   Enter, change dataset, Previous.
    //   Enter, change axis, change dataset, Previous.
    //   Enter, change datapoint, change dataset, Previous.
    //   Enter, change filter, change dataset, Previous.
    //   Or any combination of the above.
    //
    if (metadata.getDataset() !== dataset) {
      metadata.setMetadata(dataset);

      const actualDataset = metadata.getActualDataset();
      const filter = currentState.filter || metadata.getFilters();
      const loadTable = currentState.loadTable;
      const datapointCol = getDatapointCol(currentState);

      // This is asynchronous when the dataset is mongo or CSV,
      // and synchronous if the dataset is JSON.
      //
      const handle = 
          ((nextProps, dataset) => 
          (categoricalValues, drawingData, processedData) => {
        const newState = self.onNewDatasetRead(nextProps, dataset,
            categoricalValues, drawingData, processedData);
        this.setState(newState);
      })(nextProps, dataset);

      dataread.readDataset(actualDataset, filter, loadTable, datapointCol)
        .then(result => handle(result.categoricalValues, result.drawingData, 
                               result.processedData))
        .catch(() => handle({}, [], []));

      // Doing this will cause the datapoint
      // control to re-render with the new datapoint choice
      // (if the user chose a new one), prior to reading the new data.
      // Just a bit nicer.
      //
      const graphtype = currentState.graphtype || controls.getGraphtypeDefault();
      const enabled = getAllEnabled(graphtype);
      const choices = getAllControlChoices(graphtype, currentState,
          categoricalValues, datapointCol);
      const datapoint = {...controls.dfltControls.datapoint, 
          disabled: !enabled.datapoint, list: choices.datapoint};

      return {datapoint, loading: true};
    }

    // If this is an axis change, just set the axis state.  This 
    // will cause a re-render without re-reading the database.
    //
    if (action === 'xAxis' || action === 'yAxis' || 
        action === 'radiusAxis' || action === 'colorAxis') {
      const axisActionList = ['xAxis', 'yAxis', 'radiusAxis', 'colorAxis'];
      const allAxisState = axisActionList.reduce((i, j) => {
        return {...i, ...{[j]: self.state[j]}};
      }, {});

      const graphtype = currentState.graphtype || controls.getGraphtypeDefault();
      const datapointCol = getReduxStateDatapoint(currentState);
      const enabled = getAllEnabled(graphtype);
      const choices = getAllControlChoices(graphtype, currentState,
          categoricalValues, datapointCol);
      const list = choices[action];
      const disabled = !enabled[action];
      const newAxisState = {...allAxisState[action], disabled, list};
      const axes = getAxesFromState(currentState, null);
      return {[action]: newAxisState, axes};
    }

    // CSV state is returned synchronously;
    // Mongo state is returned via an async call
    //
    if (utils.isCSV(dataset) || utils.isJSON(dataset)) {
      const { data } = nextProps;
      const newState = transformCSVState(currentState, data, categoricalValues, null);
      return {...newState, loading: false};
    }

    // This is asynchronous!
    //
    transformMongoState(currentState, categoricalValues).then(function(newState){
      self.setState({...newState, loading: false});
    }).catch(function(error) {
      console.error(error);
      self.setState({loading: false});
    });
    return {loading: true};
  }

  // Called after dataset changes and new data is read in.
  //
  // Dispatch action to initialize dataset.
  // The action will reset the filter and the selection controls.
  //
  // Returns the new component state.
  //
  onNewDatasetRead(nextProps, dataset, categoricalValues, drawingData, data) {
    const oldReduxState = nextProps.currentState;

    // OK, this is pretty confusing.  We must calculate two datapoints:
    // one for the original dataset, and another one for the synthetic one
    // (if we are in fact using a synthesized dataset).
    //
    // We want to support filtering from the original
    // dataset (since that's where we use the RESTful interface, and besides,
    // it seems to feel right to do that).
    //
    // This also supports "regular" dataset transitioning, in which case
    // oldReduxState.datapoint will be null, and thus the datapoint
    // will be the default.
    //
    const dfltDatapointCol = datapoint.getDefaultDatapointCol();
    const originalDatapointCol = metadata.getDatasetAttr('datapointCol') ||
        dfltDatapointCol;
    const datapointCol = oldReduxState.datapoint || dfltDatapointCol;

    // If the dataset has a default graphtype, set it here
    //
    const datasetGraphtype = metadata.getDatasetAttr('graphtype', null);
    const graphtype = datasetGraphtype || oldReduxState.graphtype;

    const initControls = controls.getInitControlState(categoricalValues,
        datapointCol, graphtype);

    const newControls = Object.keys(initControls).reduce((i, j) => {
      const controlValue = oldReduxState[j] || initControls[j];
      return {...i, ...{[j]: controlValue}};
    }, {});

    const filter = oldReduxState.filter || metadata.getFilters();

    // Send the Change Query event.
    //
    const withControls = {...oldReduxState, ...newControls};
    const newState = { ...withControls, filter, categoricalValues,
        data, drawingData, dataset, datapointCol, originalDatapointCol };

    const loadTable = newState.loadTable;
    const summaryData = transforms.getSummaryData(data);
    const loadComparisonData = transforms.getLoadComparisonData(data);

    // Note that we use originalDatapointCol here.  We want to
    // allow filtering based on the data in the original dataset.
    //
    const facetList = facets.getReactFacets(drawingData,
      filter, originalDatapointCol, categoricalValues);

    const initState = getInitState(dataset, newState, data,
        categoricalValues, datapointCol);
    const finalState = {
        ...initState,
        loading: false,
        summaryData,
        loadComparisonData,
        facet: { list: facetList, filter, datapointCol }
    };
    return finalState;
  }

  // Fetch initial (potentially async) data for the component here
  // (as is best practice).
  //
  componentDidMount(){
    const { needData, dataset, data, initCategoricalValues, currentState,
        initData, onPushStateDispatch } = this.props;
    const newDataset = dataset ? dataset : metadata.getActualDataset();

    // needData should only be set if we must fetch data.
    // We do NOT have to fetch data when changing datasets if we
    // already have it (e.g. when doing undo/redo across dataset changes).
    //
    if (needData) {
      metadata.setMetadata(newDataset); // FIXME: mutable
      const filter = metadata.getFilters();
      const datapointCol = datapoint.getDefaultDatapointCol();
      startup.startup(currentState, newDataset, filter, datapointCol, initData)
          .then(onPushStateDispatch);
    } else if (currentState) {
      if (metadata.getDataset() !== newDataset) {
        this.onReduxStateChange(this.props);
      }
      const initState = getInitState(dataset, currentState, data, 
          initCategoricalValues, null);
      this.setState({ ...initState });
    }
  }

  componentWillUnmount(){
    if (this && this.unsubscribe) {
      this.unsubscribe();
    }
  }

  // Called after (e.g.) mapStateToProps finishes.
  //
  componentWillReceiveProps(nextProps) {
    const newState = this.onReduxStateChange(nextProps);
    this.setState(newState);
  }

  render(){
    const datasetLabel = metadata.getDatasetLabel();
    const key = 'PivotApp';

    // When the app is starting up, there is no state or props.
    // We want to just show the Loading icon while the initial
    // data is being read in.
    //
    if (!this.state || !this.props || this.props.needData) {
      return (
        <div key={key} className={"pivot-all pivot-div"}>
          <Loader fullPage loading={true} />
        </div>
      );
    }

    const { currentState, current, history, showDataset, title, subtitle }
        = this.props;

    // Note that we get the datapoint from the current state.  If this
    // is a simulated dataset, then the redux state will pull the data
    // out of that simulated dataset (unlike the API, which uses the
    // datapoint from the original dataset, not the simulated one).
    // Tricky.
    //
    const datapointCol = getReduxStateDatapoint(currentState);

    const { loading, summaryData, loadComparisonData, drawingData,
        axes, dataset, datapoint, facet, graphtype,
        animate, xAxis, yAxis, radiusAxis, colorAxis } = this.state;
    const controls = { animate, datapoint, graphtype, xAxis, 
        yAxis, radiusAxis, colorAxis };

    const categoricalValues = currentState && currentState.categoricalValues || null;

    const datasetMonths = metadata.getDatasetMonths();
    const datasetSubtitle = metadata.getDatasetSubtitle();

    const actualTitle = title ? title : 'Visualizing ' + datasetLabel + ' Data';
    const commitDate = __COMMIT_DATE__ || 'Today';
    const builddate = `(build date: ${commitDate})`;
    const actualSubtitle = subtitle ? subtitle : 
        datasetSubtitle? `${datasetSubtitle} ${builddate}` : null;

    const chartProps = {
      drawingData,
      tooltipPivots: categoricalValues,
      datapointCol,
      axes
    };

    return (
      <div key={key} className={"pivot-all pivot-div"}>
        <Loader fullPage loading={loading} />
        <div className={"pivot-header pivot-div"}>
          <div className={"title pivot-div"}>
            <h1>{actualTitle}</h1>
            { actualSubtitle ? <h2>{actualSubtitle}</h2> : null }
          </div>
          {showDataset ? <SelectDataset value={dataset} /> : null}
        </div>
        <PivotContainer
          loading={loading}
          value={chartProps}
          current={current} history={history}
          facet={facet} controls={controls}
          summaryData={summaryData} loadComparisonData={loadComparisonData}
        />
      </div>
    );
  }
}

const mapStateToProps = function(state) {
  const { pivot } = state;

  const currentState = utils.getCurrentState(pivot);

  if (currentState) {
    const { data, dataset, categoricalValues } = currentState;
    if (currentState.last === 'change_dataset') {
      return { dataset: currentState.dataset };
    } else {
      const { history, current } = pivot;
      return { currentState, history, current,
          key: dataset,
          dataset,
          data,
          needData: false,
          initCategoricalValues: categoricalValues
      };
    }
  } else {
    return {}
  }
}

const mapDispatchToProps = function(dispatch, ownProps) {
  return {

    // Dispatch Redux "Push State" message
    //
    onPushStateDispatch: function(newState) {
      actions.pushState(newState)(dispatch);
    }
  };
}

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(PivotApp);
