// This defines the Refine Results and Undo (Result) component
//
import React from 'react';
import {connect} from 'react-redux';
import actions from '../../actions';
import datapoint from './datapoint.js';
import metadata from './metadata.js';

// Allow user to select everything (so they can subtract values rather than just add)
//
const selectAll = '(Select All)';

class Facets extends React.Component {

  constructor(props){
    super(props);
    this.state = {};
  }
  
  // Return TRUE if the column (e.g. "GENDER") should have its children
  // visible.
  //
  getEnabled(col){
    return this.state.hasOwnProperty(col) && this.state[col];
  }

  // Remove 'column: value' from the search object.
  // Return truthy if we actually did something
  //
  removeFromSearch(searchObject, column, value){

    if( !searchObject.hasOwnProperty(column) ) {
      return { changed: false, searchObject };
    }
    const searchVector = searchObject[column];

    const newVector = searchVector.filter(function(x){
      return x!=value;
    });
    if( newVector.length==0 ){
      const newSearchObject = Object.keys(searchObject).filter(i => {
        return i !== column;
      }).reduce((i, j) => {
        return {...i, ...{[j]: searchObject[j]}};
      }, {});

      return {changed: true, searchObject: newSearchObject};
    } else if( newVector.length<searchVector.length ){
      return {
        changed: true,
        searchObject: {...searchObject, ...{[column]: newVector}}
      };
    } else {
      return {changed: false, searchObject};
    }
  }

  // Return the JSX document for a pivot variable name, and its
  // list of values.
  //
  getOneRefineResultsChoice(searchObject, pivot, datapointCol){
    const handler = this.togglePivotResult(pivot.column);
    const pivotValues = this.getCategoricalValues(searchObject, 
        pivot.column, pivot.list, datapointCol);
    return (
      <div key={pivot.label} className={"treeBare pivot-div"}>
        <div className={"treeShow pivot-div"} onClick={handler}>
          {pivot.label}
        </div>
        {pivotValues}
      </div>
    )
  }

  // Turn the display of the child values of 'column' on or off
  //
  togglePivotResult(column){
    const that = this;
    return function(){
      const curState = that.getEnabled(column);
      const newState = {...that.state, ...{[column]: !curState}};
      that.setState(newState);
    }
  }

  // Return the JSX document for the set of categorical values in 'list'.
  // 'list' is a list of {categorical value, # instances}.
  // This data will go into 'Refine Results'.
  //
  getCategoricalValues(searchObject, column, list, datapointCol){
    const that = this;
    const valueList = list.map(function(x){
      const label = datapoint.coerceToDatapointRep(datapointCol,
          column, x.value);
      const fmtValue = metadata.getFormattedValue(column, label);
      const hdlr = that.onChoosePivotValue(searchObject, column, x.value, list);
        <li key={label}>
          <a className="selectLink" onClick={hdlr}>{fmtValue}</a>
          (label === selectAll ? <span></span> : <span> ({x.n})</span>)
        </li>
      return (label===selectAll
        ? (<li key={label}>
            <a className="selectLink" onClick={hdlr}>{fmtValue}</a>
            <span></span>
          </li>)
        : (<li key={label}>
            <a className="selectLink" onClick={hdlr}>{fmtValue}</a>
            <span> ({x.n})</span>
          </li>)
      )
    });
    const displayClass = 
        this.getEnabled(column) ? "treeDataBlock": "treeDataNone";

    return (
      <div className={"treeData pivot-div " + displayClass}>
        <ul className="pivot-list">
          {valueList}
        </ul>
      </div>
    )
  }

  // Called when the user chooses a value.  Dispatch new filter state
  // to Redux.  The result will be reflected back into render().
  //
  onChoosePivotValue(searchObject, column, value, list){
    const that = this;
    const {onChangeFilterDispatch} = this.props;
    return function(){
      const filter = that.appendToSearch(searchObject, column, value, list)
          .searchObject;
      onChangeFilterDispatch(filter);
    }
  }

  // Append 'column: value' to the search object, unless it's
  // already there.  Return { changed: true } if there was a change to it.
  // Return the updated search object in { searchObject: OBJECT }.
  //
  appendToSearch(searchObject, column, value, list){
    const current = searchObject[column] == null ?
      {...searchObject, ...{[column]: []}} :
      searchObject;

    if (value === selectAll) {
      return this.appendSelectAll(searchObject, column, list, current);
    }

    if( current[column].some(function(x){ return value==x; }) ){
      return {changed: false, searchObject: current};
    }

    const withValue = {[column]: current[column].concat([value])};
    return {changed: true, searchObject: {...current, ...withValue}};
  }

  appendSelectAll(searchObject, column, list, current) {
    const remainingValues = list.filter(i => {
      return i.value !== selectAll;
    }).map(i => {
      return i.value;
    });
    if (remainingValues.length === 0) {
      return {changed: false, searchObject: current};
    } else {
      const withValues = {[column]: current[column].concat(remainingValues)};
      return {changed: true, searchObject: {...current, ...withValues}};
    }
  }

  // Return all of the DOM that goes into 'Refine Results'
  //
  getAllRefineResults(searchObject, choices, datapointCol){
    const that = this;
    return choices.map(function(x){
      const list = Array.isArray(x.list) ? x.list : [];
      const selectAllValue = { value: selectAll, n: '' };
      const listWithSelectAll = [selectAllValue].concat(list);
      const withSelectAll = {...x, list: listWithSelectAll};

      return that.getOneRefineResultsChoice(searchObject, withSelectAll,
          datapointCol);
    });
  }

  // Handle click on the undoable value in Current Search
  //
  onChooseCurrentSearch(searchObject, column, value){
    const that = this;
    const {onChangeFilterDispatch} = this.props;
    return function(){
      const filter = that.removeFromSearch(searchObject, column, value)
          .searchObject;
      onChangeFilterDispatch(filter);
    }
  }

  // Return a list of DOM elements for 'Current Search' for a single column
  //
  getCurrentSearchList(searchObject, column, list, datapointCol){
    const that = this;
    return list.map(function(x){
      const hdlr = that.onChooseCurrentSearch(searchObject, column, x);
      const label = datapoint.coerceToDatapointRep(datapointCol,
          column, x);
      const fmtValue = metadata.getFormattedValue(column, label);

      return (
        <div key={label} className={"treeBare pivot-div"}>
          <a className="undoLink" onClick={hdlr}>Undo</a>
          <div className={"undoLabel pivot-div"}>{fmtValue}</div>
        </div>
      )
    });
  }

  // Return a single Current Search ("undo") choice
  //
  getOneCurrentSearch(searchObject, column, list, datapointCol){
    return (
      <div key={column} className={"treeBare pivot-div"}>
        <h3 className="searchHeader">
          {metadata.getAlias(column)}
        </h3>
        <div className="pivot-div">
          {this.getCurrentSearchList(searchObject, column, list, datapointCol)}
        </div>
      </div>
    )
  }

  // Return all of the DOM that goes into Current Search
  //
  getAllCurrentSearch(searchObject, datapointCol){
    const that = this;
    return Object.keys(searchObject).map(function(x){
      return that.getOneCurrentSearch(searchObject, x, searchObject[x],
          datapointCol);
    });
  }

  // 'this.props.value' contains an array of columns with a sub-array
  // of child values.
  //
  render(){
    const { filter, datapointCol, list } = this.props.value;

    const current = this.getAllCurrentSearch(filter, datapointCol);
    const results = this.getAllRefineResults(filter, list, datapointCol);
    return (
      <div className={"control yui-b pivot-div"}>
        <div className="pivot-div">
          <div key="currentsearch" className={"pane pivot-div"}>
            <h2>Current Search</h2>
            <div className={"refineControls pivot-div"}>
              {current}
            </div>
          </div>
          <div key="refineresults" className={"pane pivot-div"}>
            <h2>Refine Results</h2>
            <div className={"refineControls pivot-div"}>
              {results}
            </div>
          </div>
        </div>
      </div>
    )
  }
}

const mapStateToProps = function(state) {
  return {};
}

const mapDispatchToProps = function(dispatch) {
  return {

    // Dispatch Redux "change filter" message
    //
    onChangeFilterDispatch: function(filter) {
      actions.changeFilter(filter)(dispatch);
    }
  };
}
export default connect(
  mapStateToProps,
  mapDispatchToProps
)(Facets);
