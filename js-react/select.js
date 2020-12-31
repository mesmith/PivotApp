// This contains the <select> controls
//
import React from 'react';
import actions from './actions.js';
import metadata from './metadata.js';

class Select extends React.Component {

  // Called when the user selects an <option>.
  // Send a Redux message.
  //
  onChangeHandler(name, reduxStore, changeHandler){
    return function(e){

      // Dispatch Redux "change control" message.  This will cause
      // controls to update, as well as new data to be plotted.
      //
      const col = e.target.value;
      const datasetName = metadata.getAttrValue(col, 'datasetName', null);
      if (changeHandler) {
        changeHandler(name, col);
      } else if (datasetName) {
        reduxStore.dispatch(actions.changeDatasetAndDatapoint(datasetName, col));
      } else {
        reduxStore.dispatch(actions.changeControl(name, col));
      }
    }
  }

  // Given an ordered list of (value, label, disabled, selected)
  // within props, return a <select> element with a list of <option>s
  //
  render(){
    const { value, reduxStore, changeHandler } = this.props;
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
      const nid = id + i;
      return (
        <option key={x.name} id={nid} value={x.name} disabled={x.disabled}>
          {x.label}
        </option>
      )
    });

    const className = "bold " + headerClass;
    const controlValue = disabled ? '' : selected;

    return (
      <div className="control">
        <span className={className}>
          {label}:
        </span>
        <select id={id} name={name}
            className={name}
            value={controlValue}
            disabled={disabled}
            onChange={handler(name, reduxStore, changeHandler)}>
          {selects}
        </select>
      </div>
    );
  }
}

export default Select;
