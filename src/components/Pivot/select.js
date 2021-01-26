// This contains the <select> controls
//
import React from 'react';
import {connect} from 'react-redux';
import actions from '../../actions';
import metadata from './metadata.js';

import store from '../../store.js';

class Select extends React.Component {
  constructor(props) {
    super(props);
    this.onChangeHandler = this.onChangeHandler.bind(this);
  }

  // Called when the user selects an <option>.
  // Send a Redux message.
  //
  onChangeHandler(name, changeHandler){
    const {
      onChangeControlDispatch,
      onChangeDatasetAndDatapointDispatch
    } = this.props;

    return function(e){

      // Dispatch Redux "change control" message.  This will cause
      // controls to update, as well as new data to be plotted.
      //
      const col = e.target.value;
      const datasetName = metadata.getAttrValue(col, 'datasetName', null);
      if (changeHandler) {
        changeHandler(name, col);
      } else if (datasetName) {
        onChangeDatasetAndDatapointDispatch(datasetName, col);
      } else {
        onChangeControlDispatch(name, col);
      }
    }
  }

  // Given an ordered list of (value, label, disabled, selected)
  // within props, return a <select> element with a list of <option>s
  //
  render(){
    const { value, changeHandler } = this.props;
    const { id, list, name, label, headerClass, disabled } = value;
    const handler = this.onChangeHandler;

    // Get the currently selected index.  There can be only one.
    // Selects '' if list contains no truthy 'selected' attribute.
    //
    const selected = list.reduce(function(v1, v2){
      return v2.selected? v2.name: v1;
    }, '');

    // If the entire control is disabled, show "None" for its value
    //
    const disabledElt = {name: '(None)', disabled: true, label: '(None)'}
    const withDisabled = disabled ? [disabledElt] : list;
    const selects = withDisabled.map(function(x, i){
      return (
        <option key={x.name} value={x.name} disabled={x.disabled}>
          {x.label}
        </option>
      )
    });

    const className = "bold " + headerClass;
    const controlValue = disabled ? '' : selected;
    const selectClass = `${name} axis-selector`;

    return (
      <div className={"control pivot-div"}>
        <span className={className}>
          {label}:&nbsp;
        </span>
        <select name={name}
            className={selectClass}
            value={controlValue}
            disabled={disabled}
            onChange={handler(name, changeHandler)}>
          {selects}
        </select>
      </div>
    );
  }
}

const mapStateToProps = function(state) {
  return {};
}

const mapDispatchToProps = function(dispatch) {
  return {

    // Dispatch Redux "change control" and "change dataset and datapoint"
    // messages
    //
    onChangeControlDispatch: function(name, col) {
      actions.changeControl(name, col)(dispatch);
    },
    onChangeDatasetAndDatapointDispatch: function(name, col) {
      actions.changeDatasetAndDatapoint(name, col)(dispatch);
    }
  };
}

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(Select);
